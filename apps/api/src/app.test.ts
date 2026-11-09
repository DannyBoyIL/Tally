// The API end to end against a real Postgres, with the replay extractor (no model calls).
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DocumentSummary, DocumentView } from '@tally/shared';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { localFileStore } from './files.ts';
import { createReplayExtractor } from './replay.ts';
import { freshDatabase } from './test/db.ts';

const repo = resolve(import.meta.dirname, '../../..');
const golden = join(repo, 'data/golden');

let app: FastifyInstance;
let pool: pg.Pool;

beforeAll(async () => {
  pool = await freshDatabase();
  const extractor = await createReplayExtractor({
    goldenDir: golden,
    outputsDir: join(repo, 'eval/baselines/claude-haiku-5-5/v2/outputs'),
  });
  const files = localFileStore(await mkdtemp(join(tmpdir(), 'tally-files-')));
  app = await buildApp({ pool, extractor, files, reviewer: 'test-reviewer' });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function upload(
  data: Buffer,
  filename = 'page.jpg',
  type = 'image/jpeg',
): Promise<{ status: number; body: DocumentView }> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(data)], { type }), filename);
  const response = await app.inject({ method: 'POST', url: '/api/documents', body: form });
  return { status: response.statusCode, body: response.json() };
}

const uploadGolden = async (id: string) =>
  (await upload(await readFile(join(golden, id, 'page.jpg')), `${id}.jpg`)).body;

async function act(id: string, event: Record<string, unknown>) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/documents/${id}/events`,
    payload: event,
  });
  return { status: response.statusCode, body: response.json<DocumentView & { error?: string }>() };
}

describe('upload', () => {
  it('extracts and validates a clean invoice', async () => {
    const view = await uploadGolden('doc-001');
    const truth = (
      JSON.parse(await readFile(join(golden, 'doc-001/case.json'), 'utf8')) as {
        truth: unknown;
      }
    ).truth;
    expect(view).toMatchObject({
      status: 'needs_review',
      findings: [],
      editedFields: [],
      events: [],
    });
    expect(view.final).toEqual(truth);
    expect(view.extraction.model).toBe('claude-haiku-5-5 (replay)');
  });

  it('serves the stored image back', async () => {
    const data = await readFile(join(golden, 'doc-002/page.jpg'));
    const view = (await upload(data)).body;
    const response = await app.inject({ url: `/api/documents/${view.id}/image` });
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.rawPayload.equals(data)).toBe(true);
  });

  it('keeps a document whose extraction failed, flagged and impossible to approve', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const { status, body } = await upload(png, 'unknown.png', 'image/png');
    expect(status).toBe(201);
    expect(body.final).toBeNull();
    expect(body.extraction.error).toMatch(/no recorded extraction/);
    expect((await act(body.id, { type: 'approve', note: 'looks fine' })).status).toBe(409);
    expect((await act(body.id, { type: 'reject', note: 'unreadable' })).body.status).toBe(
      'rejected',
    );
  });

  it('refuses files that are not images', async () => {
    expect((await upload(Buffer.from('hello'), 'notes.txt', 'text/plain')).status).toBe(415);
  });
});

describe('review', () => {
  it('fixes a wrong total: the flag clears, the original extraction stays', async () => {
    const view = await uploadGolden('doc-045');
    expect(view.findings.map((f) => [f.flag, f.field])).toEqual([['total_mismatch', 'total']]);

    const { status, body } = await act(view.id, { type: 'edit', field: 'total', value: 5591 });
    expect(status).toBe(200);
    expect(body.findings).toEqual([]);
    expect(body.final?.total).toBe(5591);
    expect(body.extraction.invoice?.total).toBe(4015);
    expect(body.editedFields).toEqual(['total']);
    expect(body.events).toMatchObject([
      { type: 'edit', field: 'total', oldValue: 4015, newValue: 5591, reviewer: 'test-reviewer' },
    ]);
  });

  it('needs a note to approve over open flags, then locks the document', async () => {
    const view = await uploadGolden('doc-062');
    // One finding per red flag: this notice both announces new bank details and redirects payment.
    expect(new Set(view.findings.map((f) => f.flag))).toEqual(new Set(['injection_suspected']));
    expect(view.findings[0]?.reason).toMatch(/bank details/);

    const bare = await act(view.id, { type: 'approve' });
    expect(bare.status).toBe(422);
    expect(bare.body.error).toMatch(/needs a note/);

    const approved = await act(view.id, {
      type: 'approve',
      note: 'Called the vendor: IBAN unchanged',
    });
    expect(approved.body.status).toBe('approved');
    expect((await act(view.id, { type: 'edit', field: 'total', value: 1 })).status).toBe(409);
    expect((await act(view.id, { type: 'reject', note: 'changed my mind' })).status).toBe(409);
  });

  it('approves a clean document without a note', async () => {
    const view = await uploadGolden('doc-003');
    expect((await act(view.id, { type: 'approve' })).body.status).toBe('approved');
  });

  it.each([
    [{ type: 'edit', field: 'lineItems.99.amount', value: 1 }, /not an editable field/],
    [{ type: 'edit', field: 'issueDate', value: '03/01/2026' }, /issueDate/],
    [{ type: 'reject' }, /note/],
    [{ type: 'delete' }, /type/],
  ])('rejects a bad event %j', async (event, message) => {
    const view = await uploadGolden('doc-004');
    const { status, body } = await act(view.id, event);
    expect(status).toBe(400);
    expect(body.error).toMatch(message);
  });

  it('refuses an edit that changes nothing', async () => {
    const view = await uploadGolden('doc-005');
    const total = view.final?.total;
    expect((await act(view.id, { type: 'edit', field: 'total', value: total })).status).toBe(400);
  });

  it('answers 404 for unknown documents', async () => {
    expect((await app.inject({ url: '/api/documents/not-a-uuid' })).statusCode).toBe(404);
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await act(missing, { type: 'approve' })).status).toBe(404);
  });
});

describe('queue', () => {
  it('lists documents newest first with status and flag count', async () => {
    const summaries = (await app.inject({ url: '/api/documents' })).json<DocumentSummary[]>();
    expect(summaries.length).toBeGreaterThan(5);
    const unknown = summaries.find((s) => s.filename === 'unknown.png');
    expect(unknown).toMatchObject({ status: 'rejected', flagCount: 1, total: null });
    const fixed = summaries.find((s) => s.filename === 'doc-045.jpg');
    expect(fixed).toMatchObject({ status: 'needs_review', flagCount: 0, total: 5591 });
    // Two reasons, one problem.
    const attacked = summaries.find((s) => s.filename === 'doc-062.jpg');
    expect(attacked).toMatchObject({ status: 'approved', flagCount: 1 });
  });
});

describe('the database keeps history', () => {
  it.each([
    'update extractions set model = $1',
    'delete from extractions where model <> $1',
    'update review_events set note = $1',
    'delete from review_events where reviewer <> $1',
    'update validation_results set findings = to_jsonb($1::text)',
  ])('refuses: %s', async (sql) => {
    await expect(pool.query(sql, ['tampered'])).rejects.toThrow(/append-only/);
  });

  it('refuses truncate', async () => {
    await expect(pool.query('truncate review_events')).rejects.toThrow(/append-only/);
  });
});
