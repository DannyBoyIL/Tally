// The API end to end against a real Postgres, with the replay extractor (no model calls).
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Extractor } from '@tally/extractor';
import type { DocumentSummary, DocumentView } from '@tally/shared';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { createDemoPolicy } from './demo.ts';
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

describe('demo mode', () => {
  let demoApp: FastifyInstance;
  const fakeLive: Extractor = {
    model: 'fake-live',
    promptVersion: 'v2',
    extract: () =>
      Promise.resolve({
        model: 'fake-live',
        promptVersion: 'v2',
        raw: null,
        output: null,
        notices: [],
        invoice: null,
        error: 'fake live extraction',
        stopReason: null,
        usage: { inputTokens: 0, outputTokens: 0 },
        latencyMs: 0,
      }),
  };

  beforeAll(async () => {
    const replay = await createReplayExtractor({
      goldenDir: golden,
      outputsDir: join(repo, 'eval/baselines/claude-haiku-5-5/v2/outputs'),
    });
    const files = localFileStore(await mkdtemp(join(tmpdir(), 'tally-demo-')));
    const demo = createDemoPolicy({
      replay,
      live: fakeLive,
      accessCode: 'letmein',
      liveDailyCap: 5,
      goldenDir: golden,
    });
    demoApp = await buildApp({ pool, extractor: replay, files, reviewer: 'visitor', demo });
  });

  afterAll(() => demoApp.close());

  const uploadTo = (code?: string) => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'mine.png');
    return demoApp.inject({
      method: 'POST',
      url: '/api/documents',
      body: form,
      headers: code ? { 'x-access-code': code } : {},
    });
  };

  it('says whether it is a demo and lists the samples', async () => {
    expect((await app.inject({ url: '/api/demo' })).json()).toEqual({ demo: false });
    const info = (await demoApp.inject({ url: '/api/demo' })).json<{
      liveEnabled: boolean;
      samples: unknown[];
    }>();
    expect(info).toMatchObject({ demo: true, liveEnabled: true });
    expect(info.samples).toHaveLength(4);
  });

  it('loads a sample from the recorded answers', async () => {
    const response = await demoApp.inject({ method: 'POST', url: '/api/demo/samples/doc-062' });
    expect(response.statusCode).toBe(201);
    expect(response.json<DocumentView>().findings[0]?.flag).toBe('injection_suspected');
    const unknown = await demoApp.inject({ method: 'POST', url: '/api/demo/samples/doc-002' });
    expect(unknown.statusCode).toBe(404);
  });

  it('reads your own image live only with the access code', async () => {
    const refused = await uploadTo();
    expect(refused.statusCode).toBe(403);
    expect(refused.json<{ error: string }>().error).toMatch(/access code/);
    expect((await uploadTo('wrong')).statusCode).toBe(403);
    const accepted = await uploadTo('letmein');
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json<DocumentView>().extraction.model).toBe('fake-live');
  });

  it('limits how fast one visitor can write', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      statuses.push(
        (await demoApp.inject({ method: 'POST', url: '/api/demo/samples/none' })).statusCode,
      );
    }
    expect(statuses).toContain(429);
  });
});

describe('serving the web app', () => {
  it('serves index.html for client routes and keeps /api 404s as JSON', async () => {
    const webDir = await mkdtemp(join(tmpdir(), 'tally-web-'));
    await writeFile(join(webDir, 'index.html'), '<!doctype html><title>Tally</title>');
    const web = await buildApp(
      {
        pool,
        extractor: await createReplayExtractor({ goldenDir: golden, outputsDir: golden }),
        files: localFileStore(webDir),
        reviewer: 'x',
      },
      { webDir },
    );
    const page = await web.inject({ url: '/documents/123' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<title>Tally</title>');
    const api = await web.inject({ url: '/api/nothing' });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: 'not found' });
    await web.close();
  });
});
