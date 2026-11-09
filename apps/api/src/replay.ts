import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DocumentImage, ExtractionResult, Extractor } from '@tally/extractor';

export const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex');

/**
 * Plays back recorded extractions from an eval run instead of calling the model: the same
 * golden-set image always gets the response the model really gave it. Used by E2E tests, local
 * development without an API key, and (phase 6) the public demo.
 */
export async function createReplayExtractor(options: {
  goldenDir: string;
  outputsDir: string;
  run?: number;
}): Promise<Extractor> {
  const run = options.run ?? 1;
  const byHash = new Map<string, string>();
  const ids = (await readdir(options.goldenDir)).filter((name) => name.startsWith('doc-'));
  for (const id of ids) {
    const image = await readFile(join(options.goldenDir, id, 'page.jpg'));
    byHash.set(sha256(image), join(options.outputsDir, `${id}.r${run}.json`));
  }
  const first = await readFile([...byHash.values()][0] ?? '', 'utf8').catch(() => null);
  const recorded = first ? (JSON.parse(first) as ExtractionResult) : null;

  const model = `${recorded?.model ?? 'unknown'} (replay)`;
  const promptVersion = recorded?.promptVersion ?? 'unknown';
  return {
    model,
    promptVersion,
    async extract(image: DocumentImage): Promise<ExtractionResult> {
      const file = byHash.get(sha256(image.data));
      if (!file) {
        return {
          model,
          promptVersion,
          raw: null,
          output: null,
          notices: [],
          invoice: null,
          error: 'replay: no recorded extraction for this image (only golden-set documents)',
          stopReason: null,
          usage: { inputTokens: 0, outputTokens: 0 },
          latencyMs: 0,
        };
      }
      const result = JSON.parse(await readFile(file, 'utf8')) as ExtractionResult;
      return { ...result, model: `${result.model} (replay)` };
    },
  };
}
