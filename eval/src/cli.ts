// Runs the extractor over the golden set and writes a report.
//
//   pnpm eval --model claude-haiku-5-5 --repeat 3
//   pnpm eval --category injection --limit 4          (quick look at a slice)
//   pnpm eval --baseline baselines/claude-haiku-5-5   (print the difference)
//   pnpm eval --repeat 3 --save-baseline              (refresh the committed baseline)
//
// Every run calls the API and costs money; the CLI prints the estimate as it goes.

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createAnthropicExtractor, FatalExtractionError, type Effort } from '@tally/extractor';
import { loadGoldenSet, type GoldenCase } from './golden.ts';
import {
  buildReport,
  describeMiss,
  renderMarkdown,
  repeatMetrics,
  type CaseRun,
  type Miss,
  type Report,
} from './report.ts';
import { scoreCase } from './score.ts';

const evalRoot = resolve(import.meta.dirname, '..');
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    model: { type: 'string', default: 'claude-haiku-5-5' },
    effort: { type: 'string', default: 'low' },
    repeat: { type: 'string', default: '1' },
    concurrency: { type: 'string', default: '4' },
    category: { type: 'string' },
    limit: { type: 'string' },
    golden: { type: 'string', default: resolve(evalRoot, '../data/golden') },
    out: { type: 'string' },
    baseline: { type: 'string' },
    'save-baseline': { type: 'boolean', default: false },
  },
});

const model = values.model;
const effort = values.effort as Effort;
const repeats = Number(values.repeat);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = resolve(values.out ?? join(evalRoot, 'runs', `${stamp}-${model}`));

let cases = await loadGoldenSet(values.golden);
if (values.category) cases = cases.filter((c) => c.category === values.category);
if (values.limit) cases = cases.slice(0, Number(values.limit));

const extractor = createAnthropicExtractor({ model, effort });
await mkdir(join(outDir, 'outputs'), { recursive: true });

/** Runs `worker` over `items` with at most `limit` in flight. */
async function pool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await worker(items[next++] as T);
  });
  await Promise.all(lanes);
}

const jobs = Array.from({ length: repeats }, (_, r) =>
  cases.map((c) => ({ golden: c, repeat: r + 1 })),
).flat();
const runs = new Map<number, CaseRun[]>();
const misses: Miss[] = [];
let done = 0;

console.log(
  `${model} (effort ${effort}): ${cases.length} documents × ${repeats} run(s) → ${outDir}`,
);
try {
  await pool(
    jobs,
    Number(values.concurrency),
    async ({ golden, repeat }: { golden: GoldenCase; repeat: number }) => {
      const data = await readFile(join(values.golden, golden.id, golden.image));
      const result = await extractor.extract({ data, mediaType: 'image/jpeg' });
      await writeFile(
        join(outDir, 'outputs', `${golden.id}.r${repeat}.json`),
        `${JSON.stringify(result, null, 2)}\n`,
      );
      const run: CaseRun = {
        repeat,
        score: scoreCase(golden, result.invoice),
        error: result.error,
        usage: result.usage,
        latencyMs: result.latencyMs,
      };
      runs.set(repeat, [...(runs.get(repeat) ?? []), run]);
      const miss = describeMiss(golden, run, result.invoice);
      if (miss) misses.push(miss);
      done++;
      const mark = run.score.documentCorrect ? 'ok  ' : 'MISS';
      console.log(
        `[${done}/${jobs.length}] ${mark} ${golden.id} r${repeat} ${golden.category}${result.error ? ` (${result.error})` : ''}`,
      );
    },
  );
} catch (error) {
  if (error instanceof FatalExtractionError) {
    console.error(
      `Stopped (${error.message}). Check ANTHROPIC_API_KEY in .env and the model ID "${model}".`,
    );
    process.exit(2);
  }
  throw error;
}

misses.sort((a, b) => a.id.localeCompare(b.id) || a.repeat - b.repeat);
const report = buildReport({
  model,
  promptVersion: extractor.promptVersion,
  effort,
  documents: cases.length,
  perRepeat: [...runs.keys()]
    .sort((a, b) => a - b)
    .map((r) => repeatMetrics(model, r, runs.get(r) ?? [])),
  misses,
});
await writeFile(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outDir, 'report.md'), renderMarkdown(report));
console.log(`\n${renderMarkdown(report).split('\n## ')[0]}`);

if (values.baseline) {
  const baseline = JSON.parse(
    await readFile(join(resolve(values.baseline), 'report.json'), 'utf8'),
  ) as Report;
  console.log(
    `Against baseline ${baseline.model} (${baseline.promptVersion}, ${baseline.createdAt}):`,
  );
  for (const key of [
    'documentAccuracy',
    'fieldAccuracy',
    'linePrecision',
    'lineRecall',
    'extractionFailureRate',
  ] as const) {
    const delta = report.summary[key].mean - baseline.summary[key].mean;
    console.log(`  ${key}: ${(delta * 100).toFixed(1)} points`);
  }
}

if (values['save-baseline']) {
  const target = join(evalRoot, 'baselines', model);
  await rm(target, { recursive: true, force: true });
  await cp(outDir, target, { recursive: true });
  console.log(`Saved as baseline: ${target}`);
}
