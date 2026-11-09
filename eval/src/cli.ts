// Runs the extractor over the golden set and writes a report.
//
//   pnpm eval --model claude-haiku-5-5 --repeat 3
//   pnpm eval --category injection --limit 4          (quick look at a slice)
//   pnpm eval --prompt v1                             (an older prompt, for before/after)
//   pnpm eval --baseline baselines/claude-haiku-5-5/v2   (print the difference)
//   pnpm eval --repeat 3 --save-baseline              (refresh the committed baseline)
//   pnpm eval --repeat 3 --gate                       (live CI gate: fail if worse than accepted)
//   pnpm eval --replay --gate                         (free CI gate: re-score recorded answers)
//   pnpm eval --replay --recorded baselines/claude-haiku-5-5/v1 --gate
//
// A live run calls the API and costs money. --replay calls nothing: it re-scores the answers
// Claude gave in a recorded run (the accepted baseline unless --recorded says otherwise) with the
// current validators and scoring code. The accepted baseline is named in eval/gate.json.

import { appendFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  createAnthropicExtractor,
  FatalExtractionError,
  LATEST_PROMPT_VERSION,
  PROMPT_VERSIONS,
  resolveApiKey,
  type Effort,
  type ExtractionResult,
  type PromptVersion,
} from '@tally/extractor';
import { flagsOf, validate } from '@tally/validators';
import { gate, renderGate } from './gate.ts';
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
    replay: { type: 'boolean', default: false },
    recorded: { type: 'string' },
    gate: { type: 'boolean', default: false },
  },
});

const readReport = async (dir: string): Promise<Report> =>
  JSON.parse(await readFile(join(dir, 'report.json'), 'utf8')) as Report;

const gateConfig = JSON.parse(await readFile(join(evalRoot, 'gate.json'), 'utf8')) as {
  baseline: string;
};
const acceptedDir = resolve(evalRoot, gateConfig.baseline);

// In replay mode the run takes its model, prompt and repeats from the recording.
const recordedDir = values.replay ? resolve(values.recorded ?? acceptedDir) : null;
const recorded = recordedDir ? await readReport(recordedDir) : null;

const model = recorded?.model ?? values.model;
const effort = (recorded?.effort ?? values.effort) as Effort;
if (!recorded && !PROMPT_VERSIONS.includes(values.prompt as PromptVersion)) {
  console.error(`Unknown --prompt ${values.prompt}; known: ${PROMPT_VERSIONS.join(', ')}`);
  process.exit(2);
}
const promptVersion = recorded?.promptVersion ?? values.prompt;
const repeats = recorded?.repeats ?? Number(values.repeat);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const label = `${recorded ? 'replay-' : ''}${model}-${promptVersion}`;
const outDir = resolve(values.out ?? join(evalRoot, 'runs', `${stamp}-${label}`));

let cases = await loadGoldenSet(values.golden);
if (values.category) cases = cases.filter((c) => c.category === values.category);
if (values.limit) cases = cases.slice(0, Number(values.limit));
const vendors = await loadVendors(values.golden);

/** Where each answer comes from: Claude, or a file recorded by an earlier run. */
async function liveSource(): Promise<
  (golden: GoldenCase, repeat: number) => Promise<ExtractionResult>
> {
  const key = await resolveApiKey(resolve(evalRoot, '../.env'), process.env);
  if (!key) {
    console.error('No ANTHROPIC_API_KEY: set it in .env at the repository root.');
    process.exit(2);
  }
  console.log(`API key from ${key.source}`);
  const extractor = createAnthropicExtractor({
    model,
    effort,
    promptVersion: promptVersion as PromptVersion,
    apiKey: key.value,
  });
  return async (golden) =>
    extractor.extract({
      data: await readFile(join(values.golden, golden.id, golden.image)),
      mediaType: 'image/jpeg',
    });
}

const replaySource =
  (dir: string) =>
  async (golden: GoldenCase, repeat: number): Promise<ExtractionResult> =>
    JSON.parse(
      await readFile(join(dir, 'outputs', `${golden.id}.r${repeat}.json`), 'utf8'),
    ) as ExtractionResult;

const extract = recordedDir ? replaySource(recordedDir) : await liveSource();
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
  `${recordedDir ? `Replaying ${recordedDir}\n` : ''}${model} (prompt ${promptVersion}, effort ${effort}): ${cases.length} documents × ${repeats} run(s) → ${outDir}`,
);
try {
  await pool(
    jobs,
    Number(values.concurrency),
    async ({ golden, repeat }: { golden: GoldenCase; repeat: number }) => {
      const result = await extract(golden, repeat);
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
  promptVersion,
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
  const baseline = await readReport(resolve(values.baseline));
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

if (values.gate) {
  const accepted = await readReport(acceptedDir);
  const result = gate(report, accepted);
  const markdown = renderGate(result, report, accepted);
  await writeFile(join(outDir, 'gate.md'), markdown);
  console.log(`\n${markdown}`);
  // On GitHub Actions the table also lands on the run's summary page.
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  if (!result.passed) process.exitCode = 1;
}

if (values['save-baseline']) {
  const target = join(evalRoot, 'baselines', model, promptVersion);
  await rm(target, { recursive: true, force: true });
  await cp(outDir, target, { recursive: true });
  console.log(`Saved as baseline: ${target}`);
}
