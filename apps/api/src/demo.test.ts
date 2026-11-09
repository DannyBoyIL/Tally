import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Extractor } from '@tally/extractor';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDemoPolicy, DemoError } from './demo.ts';
import { createReplayExtractor, type ReplayExtractor } from './replay.ts';

const repo = resolve(import.meta.dirname, '../../..');
const goldenDir = join(repo, 'data/golden');
const live = { model: 'live-model' } as Extractor;
const unknownImage = Buffer.from('not a golden image');

let replay: ReplayExtractor;
let goldenImage: Buffer;

beforeAll(async () => {
  replay = await createReplayExtractor({
    goldenDir,
    outputsDir: join(repo, 'eval/baselines/claude-haiku-5-5/v2/outputs'),
  });
  goldenImage = await readFile(join(goldenDir, 'doc-001/page.jpg'));
});

const policy = (overrides: Partial<Parameters<typeof createDemoPolicy>[0]> = {}) =>
  createDemoPolicy({
    replay,
    live,
    accessCode: 'letmein',
    liveDailyCap: 2,
    goldenDir,
    ...overrides,
  });

const refusal = (fn: () => unknown): DemoError | null => {
  try {
    fn();
    return null;
  } catch (error) {
    return error as DemoError;
  }
};

describe('demo policy', () => {
  it('replays golden-set images for anyone, without a code', () => {
    expect(policy().extractorFor(goldenImage, undefined)).toBe(replay);
  });

  it('refuses live extraction without the right code', () => {
    expect(refusal(() => policy().extractorFor(unknownImage, undefined))?.status).toBe(403);
    expect(refusal(() => policy().extractorFor(unknownImage, 'guess'))?.status).toBe(403);
  });

  it('uses live Claude with the code, up to the daily cap', () => {
    let day = '2026-11-09';
    const p = policy({ today: () => day });
    expect(p.extractorFor(unknownImage, 'letmein')).toBe(live);
    expect(p.extractorFor(unknownImage, 'letmein')).toBe(live);
    expect(refusal(() => p.extractorFor(unknownImage, 'letmein'))?.status).toBe(429);
    // Samples still work when the cap is used up.
    expect(p.extractorFor(goldenImage, undefined)).toBe(replay);
    day = '2026-11-10';
    expect(p.extractorFor(unknownImage, 'letmein')).toBe(live);
  });

  it('turns live off entirely without a key or without a code configured', () => {
    for (const p of [policy({ live: null }), policy({ accessCode: null })]) {
      expect(p.liveEnabled).toBe(false);
      expect(refusal(() => p.extractorFor(unknownImage, 'letmein'))?.status).toBe(403);
    }
  });

  it('serves only the listed samples', async () => {
    expect((await policy().sample('doc-001')).equals(goldenImage)).toBe(true);
    await expect(policy().sample('doc-002')).rejects.toMatchObject({ status: 404 });
    await expect(policy().sample('../.env')).rejects.toMatchObject({ status: 404 });
  });
});
