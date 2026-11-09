// All SQL in one place. Rows come back in the shapes the service needs; jsonb columns are
// written with JSON.stringify (pg would turn a JS array into a Postgres array otherwise).
import type { ExtractionResult } from '@tally/extractor';
import type { Finding, Invoice } from '@tally/shared';
import type pg from 'pg';

export type Db = pg.Pool | pg.PoolClient;

export interface DocumentRow {
  id: string;
  filename: string;
  mediaType: string;
  storageKey: string;
  createdAt: string;
}

export interface ExtractionRow {
  id: string;
  documentId: string;
  model: string;
  promptVersion: string;
  invoice: Invoice | null;
  notices: string[];
  error: string | null;
  createdAt: string;
}

export interface EventRow {
  id: string;
  type: 'edit' | 'approve' | 'reject';
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  note: string | null;
  reviewer: string;
  createdAt: string;
}

const json = (value: unknown): string | null =>
  value === undefined ? null : JSON.stringify(value);
const iso = (d: Date): string => d.toISOString();

export async function insertDocument(
  db: Db,
  doc: {
    id: string;
    filename: string;
    mediaType: string;
    sha256: string;
    sizeBytes: number;
    storageKey: string;
  },
): Promise<void> {
  await db.query(
    `insert into documents (id, filename, media_type, sha256, size_bytes, storage_key)
     values ($1, $2, $3, $4, $5, $6)`,
    [doc.id, doc.filename, doc.mediaType, doc.sha256, doc.sizeBytes, doc.storageKey],
  );
}

export async function insertExtraction(
  db: Db,
  documentId: string,
  r: ExtractionResult,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into extractions (document_id, model, prompt_version, raw, output, invoice, notices,
       error, stop_reason, input_tokens, output_tokens, latency_ms)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
    [
      documentId,
      r.model,
      r.promptVersion,
      json(r.raw),
      json(r.output),
      json(r.invoice),
      json(r.notices),
      r.error,
      r.stopReason,
      r.usage.inputTokens,
      r.usage.outputTokens,
      r.latencyMs,
    ],
  );
  return rows[0]!.id;
}

export async function insertValidation(
  db: Db,
  extractionId: string,
  findings: Finding[],
): Promise<void> {
  await db.query('insert into validation_results (extraction_id, findings) values ($1, $2)', [
    extractionId,
    json(findings),
  ]);
}

export async function insertEvent(
  db: Db,
  e: {
    documentId: string;
    extractionId: string;
    type: EventRow['type'];
    field?: string;
    oldValue?: unknown;
    newValue?: unknown;
    note?: string;
    reviewer: string;
  },
): Promise<void> {
  await db.query(
    `insert into review_events (document_id, extraction_id, type, field, old_value, new_value, note, reviewer)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      e.documentId,
      e.extractionId,
      e.type,
      e.field ?? null,
      json(e.oldValue),
      json(e.newValue),
      e.note ?? null,
      e.reviewer,
    ],
  );
}

type RawDocument = {
  id: string;
  filename: string;
  media_type: string;
  storage_key: string;
  created_at: Date;
};
const toDocument = (r: RawDocument): DocumentRow => ({
  id: r.id,
  filename: r.filename,
  mediaType: r.media_type,
  storageKey: r.storage_key,
  createdAt: iso(r.created_at),
});

/** With `lock`, holds the row until the transaction ends: decisions on one document are serialized. */
export async function getDocument(db: Db, id: string, lock = false): Promise<DocumentRow | null> {
  const { rows } = await db.query<RawDocument>(
    `select id, filename, media_type, storage_key, created_at from documents where id = $1${lock ? ' for update' : ''}`,
    [id],
  );
  return rows[0] ? toDocument(rows[0]) : null;
}

export async function listDocuments(db: Db): Promise<DocumentRow[]> {
  const { rows } = await db.query<RawDocument>(
    'select id, filename, media_type, storage_key, created_at from documents order by created_at desc',
  );
  return rows.map(toDocument);
}

type RawExtraction = {
  id: string;
  document_id: string;
  model: string;
  prompt_version: string;
  invoice: Invoice | null;
  notices: string[];
  error: string | null;
  created_at: Date;
};
const toExtraction = (r: RawExtraction): ExtractionRow => ({
  id: r.id,
  documentId: r.document_id,
  model: r.model,
  promptVersion: r.prompt_version,
  invoice: r.invoice,
  notices: r.notices,
  error: r.error,
  createdAt: iso(r.created_at),
});

/** The newest extraction of each document (one per document today; re-extraction can add more). */
export async function latestExtractions(
  db: Db,
  documentIds: string[],
): Promise<Map<string, ExtractionRow>> {
  const { rows } = await db.query<RawExtraction>(
    `select distinct on (document_id) id, document_id, model, prompt_version, invoice, notices, error, created_at
     from extractions where document_id = any($1::uuid[]) order by document_id, created_at desc`,
    [documentIds],
  );
  return new Map(rows.map((r) => [r.document_id, toExtraction(r)]));
}

type RawEvent = {
  id: string;
  document_id: string;
  type: EventRow['type'];
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  note: string | null;
  reviewer: string;
  created_at: Date;
};

export async function listEvents(db: Db, documentIds: string[]): Promise<Map<string, EventRow[]>> {
  const { rows } = await db.query<RawEvent>(
    `select id::text, document_id, type, field, old_value, new_value, note, reviewer, created_at
     from review_events where document_id = any($1::uuid[]) order by id`,
    [documentIds],
  );
  const out = new Map<string, EventRow[]>();
  for (const r of rows) {
    const list = out.get(r.document_id) ?? [];
    list.push({
      id: r.id,
      type: r.type,
      field: r.field,
      oldValue: r.old_value,
      newValue: r.new_value,
      note: r.note,
      reviewer: r.reviewer,
      createdAt: iso(r.created_at),
    });
    out.set(r.document_id, list);
  }
  return out;
}
