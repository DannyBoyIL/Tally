// Runs the extractor over the golden set and writes a report.
//
//   pnpm eval --model claude-haiku-5-5 --repeat 3
//   pnpm eval --category injection --limit 4          (quick look at a slice)
//   pnpm eval --prompt v1                             (an older prompt, for before/after)
//   pnpm eval --baseline baselines/claude-haiku-5-5/v2   (print the difference)
//   pnpm eval --repeat 3 --save-baseline              (refresh the committed baseline)
//
// Every run calls the API and costs money; the CLI prints the estimate as it goes.

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  createAnthropicExtractor,
  FatalExtractionError,
  LATEST_PROMPT_VERSION,
  PROMPT_VERSIONS,
  resolveApiKey,
  type Effort,
  type PromptVersion,
} from '@tally/extractor';
import { flagsOf, validate } from '@tally/validators';
import { loadGoldenSet, loadVendors, type GoldenCase } from './golden.ts';
import {
  buildReport,
  describeMiss,
  describeReviewIssue,
  renderMarkdown,
  repeatMetrics,
  type CaseRun,
  type Miss,
  type Report,
  type ReviewIssue,
} from './report.ts';
import { scoreCase } from './score.ts';

const evalRoot = resolve(import.meta.dirname, '..');
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    model: { type: 'string', default: 'claude-haiku-5-5' },
    effort: { type: 'string', default: 'low' },
    prompt: { type: 'string', default: LATEST_PROMPT_VERSION },
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
if (!PROMPT_VERSIONS.includes(values.prompt as PromptVersion)) {
  console.error(`Unknown --prompt ${values.prompt}; known: ${PROMPT_VERSIONS.join(', ')}`);
  process.exit(2);
}
const promptVersion = values.prompt as PromptVersion;
const repeats = Number(values.repeat);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = resolve(values.out ?? join(evalRoot, 'runs', `${stamp}-${model}-${promptVersion}`));

let cases = await loadGoldenSet(values.golden);
if (values.category) cases = cases.filter((c) => c.category === values.category);
if (values.limit) cases = cases.slice(0, Number(values.limit));
const vendors = await loadVendors(values.golden);

const key = await resolveApiKey(resolve(evalRoot, '../.env'), process.env);
if (!key) {
  console.error('No ANTHROPIC_API_KEY: set it in .env at the repository root.');
  process.exit(2);
}
console.log(`API key from ${key.source}`);
const extractor = createAnthropicExtractor({
  model,
  effort,
  promptVersion,
  apiKey: key.value,
});
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
const reviewIssues: ReviewIssue[] = [];
let done = 0;

console.log(
  `${model} (prompt ${promptVersion}, effort ${effort}): ${cases.length} documents × ${repeats} run(s) → ${outDir}`,
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
      // The validators see exactly what the API would: the extracted invoice and the notices.
      const findings = result.invoice
        ? validate({ invoice: result.invoice, vendors, notices: result.notices })
        : [];
      const run: CaseRun = {
        repeat,
        score: scoreCase(golden, result.invoice, flagsOf(findings)),
        expectedFlags: golden.expectedFlags,
        findings,
        error: result.error,
        usage: result.usage,
        latencyMs: result.latencyMs,
      };
      runs.set(repeat, [...(runs.get(repeat) ?? []), run]);
      const miss = describeMiss(golden, run, result.invoice);
      if (miss) misses.push(miss);
      const issue = describeReviewIssue(run);
      if (issue) reviewIssues.push(issue);
      done++;
      const mark = run.score.documentCorrect ? 'ok  ' : 'MISS';
      const gate = issue ? ` ${issue.kind.toUpperCase()}` : '';
      const flags = run.score.flags.length > 0 ? ` [${run.score.flags.join(', ')}]` : '';
      console.log(
        `[${done}/${jobs.length}] ${mark} ${golden.id} r${repeat} ${golden.category}${flags}${gate}${result.error ? ` (${result.error})` : ''}`,
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

const byIdThenRun = (a: { id: string; repeat: number }, b: { id: string; repeat: number }) =>
  a.id.localeCompare(b.id) || a.repeat - b.repeat;
misses.sort(byIdThenRun);
reviewIssues.sort(byIdThenRun);
const report = buildReport({
  model,
  promptVersion: extractor.promptVersion,
  effort,
  documents: cases.length,
  perRepeat: [...runs.keys()]
    .sort((a, b) => a - b)
    .map((r) => repeatMetrics(model, r, runs.get(r) ?? [])),
  misses,
  reviewIssues,
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
    'reviewRecall',
    'reviewPrecision',
  ] as const) {
    // Older baselines predate some metrics.
    const before = (baseline.summary[key] as Report['summary'][typeof key] | undefined)?.mean;
    if (before === undefined) continue;
    const delta = report.summary[key].mean - before;
    console.log(`  ${key}: ${(delta * 100).toFixed(1)} points`);
  }
}

if (values['save-baseline']) {
  const target = join(evalRoot, 'baselines', model, promptVersion);
  await rm(target, { recursive: true, force: true });
  await cp(outDir, target, { recursive: true });
  console.log(`Saved as baseline: ${target}`);
}
