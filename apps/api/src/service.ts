// The review workflow: upload → extract → validate → store, then edits and a decision. HTTP-free,
// so the same functions back the API routes and the tests.
import { randomUUID } from 'node:crypto';
import type { Extractor } from '@tally/extractor';
import type { DocumentSummary, DocumentView, EventInput } from '@tally/shared';
import { validate, type VendorRecord } from '@tally/validators';
import type pg from 'pg';
import { listVendors } from './db/vendors.ts';
import type { FileStore } from './files.ts';
import { sha256 } from './replay.ts';
import {
  applyEdit,
  deriveFinal,
  editedFields,
  readField,
  ReviewError,
  statusOf,
} from './review.ts';
import * as store from './store.ts';

export interface Deps {
  pool: pg.Pool;
  extractor: Extractor;
  files: FileStore;
  reviewer: string;
}

export const MEDIA_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' } as const;
export type MediaType = keyof typeof MEDIA_TYPES;

function buildView(
  doc: store.DocumentRow,
  extraction: store.ExtractionRow,
  events: store.EventRow[],
  vendors: VendorRecord[],
): DocumentView {
  const original = extraction.invoice;
  const final = original ? deriveFinal(original, events) : null;
  return {
    id: doc.id,
    filename: doc.filename,
    createdAt: doc.createdAt,
    status: statusOf(events),
    extraction: {
      id: extraction.id,
      model: extraction.model,
      promptVersion: extraction.promptVersion,
      invoice: original,
      notices: extraction.notices,
      error: extraction.error,
      createdAt: extraction.createdAt,
    },
    final,
    findings: final ? validate({ invoice: final, vendors, notices: extraction.notices }) : [],
    editedFields: original && final ? editedFields(original, final, events) : [],
    events,
  };
}

async function loadView(deps: Deps, db: store.Db, id: string): Promise<DocumentView | null> {
  const doc = await store.getDocument(db, id);
  if (!doc) return null;
  const extraction = (await store.latestExtractions(db, [id])).get(id);
  if (!extraction) return null;
  const events = (await store.listEvents(db, [id])).get(id) ?? [];
  return buildView(doc, extraction, events, await listVendors(deps.pool));
}

export function getView(deps: Deps, id: string): Promise<DocumentView | null> {
  return loadView(deps, deps.pool, id);
}

export async function listSummaries(deps: Deps): Promise<DocumentSummary[]> {
  const docs = await store.listDocuments(deps.pool);
  const ids = docs.map((d) => d.id);
  const [extractions, events, vendors] = await Promise.all([
    store.latestExtractions(deps.pool, ids),
    store.listEvents(deps.pool, ids),
    listVendors(deps.pool),
  ]);
  return docs.flatMap((doc) => {
    const extraction = extractions.get(doc.id);
    if (!extraction) return [];
    const view = buildView(doc, extraction, events.get(doc.id) ?? [], vendors);
    return [
      {
        id: doc.id,
        filename: doc.filename,
        createdAt: doc.createdAt,
        status: view.status,
        vendorName: view.final?.vendor.name ?? null,
        total: view.final?.total ?? null,
        currency: view.final?.currency ?? null,
        // Distinct problems (one flag can have several reasons). A failed extraction counts as one.
        flagCount: view.final ? new Set(view.findings.map((f) => f.flag)).size : 1,
      },
    ];
  });
}

async function inTransaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function uploadDocument(
  deps: Deps,
  upload: { filename: string; mediaType: MediaType; data: Buffer },
): Promise<DocumentView> {
  const id = randomUUID();
  const storageKey = `${id}.${MEDIA_TYPES[upload.mediaType]}`;
  await deps.files.put(storageKey, upload.data);

  // Extraction runs outside the transaction: a 2-second model call shouldn't hold a connection.
  const result = await deps.extractor.extract({ data: upload.data, mediaType: upload.mediaType });
  const vendors = await listVendors(deps.pool);
  const findings = result.invoice
    ? validate({ invoice: result.invoice, vendors, notices: result.notices })
    : [];

  await inTransaction(deps.pool, async (client) => {
    await store.insertDocument(client, {
      id,
      filename: upload.filename,
      mediaType: upload.mediaType,
      sha256: sha256(upload.data),
      sizeBytes: upload.data.length,
      storageKey,
    });
    const extractionId = await store.insertExtraction(client, id, result);
    await store.insertValidation(client, extractionId, findings);
  });
  return (await getView(deps, id))!;
}

export async function addEvent(
  deps: Deps,
  id: string,
  input: EventInput,
): Promise<DocumentView | null> {
  const found = await inTransaction(deps.pool, async (client) => {
    if (!(await store.getDocument(client, id, true))) return false;
    const view = (await loadView(deps, client, id))!;
    if (view.status !== 'needs_review') {
      throw new ReviewError(`document is already ${view.status}`, 409);
    }
    const base = { documentId: id, extractionId: view.extraction.id, reviewer: deps.reviewer };

    if (input.type === 'reject') {
      await store.insertEvent(client, { ...base, type: 'reject', note: input.note });
      return true;
    }
    if (!view.final)
      throw new ReviewError('extraction failed: there is nothing to edit or approve', 409);

    if (input.type === 'edit') {
      // applyEdit first: it rejects unknown paths before anything reads them.
      const next = applyEdit(view.final, input.field, input.value);
      const oldValue = readField(view.final, input.field);
      const newValue = readField(next, input.field);
      if (newValue === oldValue)
        throw new ReviewError(`${input.field} already has that value`, 400);
      await store.insertEvent(client, {
        ...base,
        type: 'edit',
        field: input.field,
        oldValue,
        newValue,
      });
      return true;
    }

    if (view.findings.length > 0 && !input.note) {
      throw new ReviewError('approving with open flags needs a note explaining why', 422);
    }
    await store.insertEvent(client, { ...base, type: 'approve', note: input.note });
    return true;
  });
  return found ? getView(deps, id) : null;
}
