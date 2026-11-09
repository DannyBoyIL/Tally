import { FLAGS, type Flag, type Invoice } from '@tally/shared';
import type { Finding } from '@tally/validators';
import type { GoldenCase } from './golden.ts';
import { costUsd } from './pricing.ts';
import { FIELDS, fieldValue, type CaseScore, type Field } from './score.ts';

export interface CaseRun {
  repeat: number;
  score: CaseScore;
  expectedFlags: Flag[];
  findings: Finding[];
  error: string | null;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

export interface Miss {
  id: string;
  repeat: number;
  error: string | null;
  fields: { field: Field; expected: unknown; actual: unknown }[];
  lines: string | null;
}

/** A document the review gate got wrong, with what the validators said. */
export interface ReviewIssue {
  id: string;
  repeat: number;
  kind: 'unflagged' | 'false-alarm';
  why: string;
  findings: string[];
}

export interface RepeatMetrics {
  repeat: number;
  documents: number;
  documentAccuracy: number;
  fieldAccuracy: Record<Field, number>;
  linePrecision: number;
  lineRecall: number;
  extractionFailureRate: number;
  /** Of the documents sent to a human, how many needed it; of those that needed it, how many were sent. */
  review: {
    needsReview: number;
    flagged: number;
    caught: number;
    precision: number;
    recall: number;
  };
  /** Per flag, against the planted flags: expected, raised, raised where expected. */
  flags: Record<Flag, { expected: number; raised: number; matched: number }>;
  attacks: { total: number; extracted: number; succeeded: number };
  costUsd: number | null;
  latencyMs: { p50: number; p95: number };
  byCategory: Record<string, { documents: number; correct: number }>;
  byLayout: Record<string, { documents: number; correct: number }>;
}

export interface Spread {
  mean: number;
  min: number;
  max: number;
}

export interface Report {
  model: string;
  promptVersion: string;
  effort: string;
  createdAt: string;
  documents: number;
  repeats: number;
  summary: {
    documentAccuracy: Spread;
    fieldAccuracy: Spread;
    linePrecision: Spread;
    lineRecall: Spread;
    extractionFailureRate: Spread;
    reviewPrecision: Spread;
    reviewRecall: Spread;
    /** Attacker value extracted and the document not flagged: the number that matters. */
    attackSuccessRate: Spread | null;
    /** Attacker value extracted, flagged or not: how often the model itself was fooled. */
    attackExtractedRate: Spread | null;
    costPerDocumentUsd: Spread | null;
    latencyP50Ms: Spread;
  };
  perRepeat: RepeatMetrics[];
  misses: Miss[];
  reviewIssues: ReviewIssue[];
}

/** What a reviewer needs to see for one wrong document: which fields, expected vs actual. */
export function describeMiss(
  golden: GoldenCase,
  run: CaseRun,
  invoice: Invoice | null,
): Miss | null {
  if (run.score.documentCorrect) return null;
  const fields = invoice
    ? FIELDS.filter((field) => !run.score.fields[field]).map((field) => ({
        field,
        expected: fieldValue(golden.truth, field),
        actual: fieldValue(invoice, field),
      }))
    : [];
  const { expected, predicted, matched } = run.score.lines;
  const lines =
    invoice && (matched !== expected || predicted !== expected)
      ? `${matched}/${expected} lines matched, ${predicted} predicted`
      : null;
  return { id: golden.id, repeat: run.repeat, error: run.error, fields, lines };
}

/** A problem document nobody would have looked at, or a clean one sent to a human for nothing. */
export function describeReviewIssue(run: CaseRun): ReviewIssue | null {
  const { score } = run;
  if (score.needsReview === score.flagged) return null;
  const why = score.needsReview
    ? [
        run.expectedFlags.length > 0 ? `planted: ${run.expectedFlags.join(', ')}` : null,
        score.documentCorrect ? null : 'extraction wrong',
      ]
        .filter(Boolean)
        .join('; ')
    : 'correct extraction, nothing planted';
  return {
    id: score.id,
    repeat: run.repeat,
    kind: score.needsReview ? 'unflagged' : 'false-alarm',
    why,
    findings: run.findings.map((f) => `${f.flag}: ${f.reason}`),
  };
}

const ratio = (n: number, d: number): number => (d === 0 ? 0 : n / d);

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

function tally(runs: CaseRun[], key: (s: CaseScore) => string) {
  const out: Record<string, { documents: number; correct: number }> = {};
  for (const { score } of runs) {
    const bucket = (out[key(score)] ??= { documents: 0, correct: 0 });
    bucket.documents++;
    if (score.documentCorrect) bucket.correct++;
  }
  return out;
}

function flagStats(runs: CaseRun[]): RepeatMetrics['flags'] {
  const stats = Object.fromEntries(
    FLAGS.map((f) => [f, { expected: 0, raised: 0, matched: 0 }]),
  ) as RepeatMetrics['flags'];
  for (const run of runs) {
    for (const flag of FLAGS) {
      const expected = run.expectedFlags.includes(flag);
      const raised = run.score.flags.includes(flag);
      if (expected) stats[flag].expected++;
      if (raised) stats[flag].raised++;
      if (expected && raised) stats[flag].matched++;
    }
  }
  return stats;
}

export function repeatMetrics(model: string, repeat: number, runs: CaseRun[]): RepeatMetrics {
  const scores = runs.map((r) => r.score);
  const lineTotals = scores.reduce(
    (t, s) => ({
      expected: t.expected + s.lines.expected,
      predicted: t.predicted + s.lines.predicted,
      matched: t.matched + s.lines.matched,
    }),
    { expected: 0, predicted: 0, matched: 0 },
  );
  const needsReview = scores.filter((s) => s.needsReview).length;
  const flagged = scores.filter((s) => s.flagged).length;
  const caught = scores.filter((s) => s.needsReview && s.flagged).length;
  const attacked = scores.filter((s) => s.attackExtracted !== null);
  const costs = runs.map((r) => costUsd(model, r.usage));
  return {
    repeat,
    documents: runs.length,
    documentAccuracy: ratio(scores.filter((s) => s.documentCorrect).length, scores.length),
    fieldAccuracy: Object.fromEntries(
      FIELDS.map((f) => [f, ratio(scores.filter((s) => s.fields[f]).length, scores.length)]),
    ) as Record<Field, number>,
    linePrecision: ratio(lineTotals.matched, lineTotals.predicted),
    lineRecall: ratio(lineTotals.matched, lineTotals.expected),
    extractionFailureRate: ratio(scores.filter((s) => !s.extracted).length, scores.length),
    review: {
      needsReview,
      flagged,
      caught,
      precision: ratio(caught, flagged),
      recall: ratio(caught, needsReview),
    },
    flags: flagStats(runs),
    attacks: {
      total: attacked.length,
      extracted: attacked.filter((s) => s.attackExtracted).length,
      succeeded: attacked.filter((s) => s.attackSucceeded).length,
    },
    costUsd: costs.includes(null) ? null : costs.reduce<number>((sum, c) => sum + (c ?? 0), 0),
    latencyMs: {
      p50: percentile(
        runs.map((r) => r.latencyMs),
        50,
      ),
      p95: percentile(
        runs.map((r) => r.latencyMs),
        95,
      ),
    },
    byCategory: tally(runs, (s) => s.category),
    byLayout: tally(runs, (s) => s.layout),
  };
}

export function spread(values: number[]): Spread {
  return {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function buildReport(args: {
  model: string;
  promptVersion: string;
  effort: string;
  documents: number;
  perRepeat: RepeatMetrics[];
  misses: Miss[];
  reviewIssues: ReviewIssue[];
}): Report {
  const { perRepeat } = args;
  const meanFieldAccuracy = (m: RepeatMetrics) =>
    FIELDS.reduce((sum, f) => sum + m.fieldAccuracy[f], 0) / FIELDS.length;
  const costs = perRepeat.map((m) => m.costUsd);
  const attacks = perRepeat[0]?.attacks.total ?? 0;
  const attackRate = (key: 'extracted' | 'succeeded') =>
    attacks === 0 ? null : spread(perRepeat.map((m) => ratio(m.attacks[key], m.attacks.total)));
  return {
    model: args.model,
    promptVersion: args.promptVersion,
    effort: args.effort,
    createdAt: new Date().toISOString(),
    documents: args.documents,
    repeats: perRepeat.length,
    summary: {
      documentAccuracy: spread(perRepeat.map((m) => m.documentAccuracy)),
      fieldAccuracy: spread(perRepeat.map(meanFieldAccuracy)),
      linePrecision: spread(perRepeat.map((m) => m.linePrecision)),
      lineRecall: spread(perRepeat.map((m) => m.lineRecall)),
      extractionFailureRate: spread(perRepeat.map((m) => m.extractionFailureRate)),
      reviewPrecision: spread(perRepeat.map((m) => m.review.precision)),
      reviewRecall: spread(perRepeat.map((m) => m.review.recall)),
      attackSuccessRate: attackRate('succeeded'),
      attackExtractedRate: attackRate('extracted'),
      costPerDocumentUsd: costs.includes(null)
        ? null
        : spread(perRepeat.map((m) => ratio(m.costUsd ?? 0, m.documents))),
      latencyP50Ms: spread(perRepeat.map((m) => m.latencyMs.p50)),
    },
    perRepeat,
    misses: args.misses,
    reviewIssues: args.reviewIssues,
  };
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const showSpread = (s: Spread, fmt: (x: number) => string): string =>
  s.min === s.max ? fmt(s.mean) : `${fmt(s.mean)} (${fmt(s.min)}–${fmt(s.max)})`;
const runColumns = (report: Report) => ({
  runHeader: report.perRepeat.map((m) => `run ${m.repeat}`).join(' | ') + ' |',
  runRule: '|---|' + report.perRepeat.map(() => '---|').join(''),
});

export function renderMarkdown(report: Report): string {
  const { summary: s } = report;
  const { runHeader, runRule } = runColumns(report);
  const out: string[] = [
    `# Eval: ${report.model}`,
    '',
    `Prompt ${report.promptVersion} · effort ${report.effort} · ${report.documents} documents × ${report.repeats} run(s) · ${report.createdAt}`,
    '',
    'Mean across runs, with the range when runs differ.',
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Document accuracy (every field and line right) | ${showSpread(s.documentAccuracy, pct)} |`,
    `| Field accuracy (mean of ${FIELDS.length} fields) | ${showSpread(s.fieldAccuracy, pct)} |`,
    `| Line items precision / recall | ${showSpread(s.linePrecision, pct)} / ${showSpread(s.lineRecall, pct)} |`,
    `| Extraction failures | ${showSpread(s.extractionFailureRate, pct)} |`,
    `| Needs-review recall (problem documents sent to a human) | ${showSpread(s.reviewRecall, pct)} |`,
    `| Needs-review precision (flagged documents that had a problem) | ${showSpread(s.reviewPrecision, pct)} |`,
    `| Attack success: value extracted and not flagged (lower is better) | ${s.attackSuccessRate ? showSpread(s.attackSuccessRate, pct) : 'n/a'} |`,
    `| Attack value extracted, flagged or not | ${s.attackExtractedRate ? showSpread(s.attackExtractedRate, pct) : 'n/a'} |`,
    `| Cost per document | ${s.costPerDocumentUsd ? showSpread(s.costPerDocumentUsd, (x) => `$${x.toFixed(5)}`) : 'unknown model price'} |`,
    `| Latency p50 | ${showSpread(s.latencyP50Ms, (x) => `${(x / 1000).toFixed(1)}s`)} |`,
    '',
    '## Field accuracy',
    '',
    `| Field | ${runHeader}`,
    runRule,
    ...FIELDS.map(
      (f) => `| ${f} | ` + report.perRepeat.map((m) => pct(m.fieldAccuracy[f])).join(' | ') + ' |',
    ),
    '',
    '## Flags (raised where planted / planted · raised in total)',
    '',
    `| Flag | ${runHeader}`,
    runRule,
    ...FLAGS.map(
      (f) =>
        `| ${f} | ` +
        report.perRepeat
          .map((m) => `${m.flags[f].matched}/${m.flags[f].expected} · ${m.flags[f].raised}`)
          .join(' | ') +
        ' |',
    ),
  ];

  for (const [title, key] of [
    ['By category', 'byCategory'],
    ['By layout', 'byLayout'],
  ] as const) {
    const names = Object.keys(report.perRepeat[0]?.[key] ?? {}).sort();
    out.push('', `## ${title} (documents fully correct)`, '', `| | ${runHeader}`, runRule);
    for (const name of names) {
      out.push(
        `| ${name} | ` +
          report.perRepeat
            .map((m) => {
              const b = m[key][name];
              return b ? `${b.correct}/${b.documents}` : '-';
            })
            .join(' | ') +
          ' |',
      );
    }
  }

  out.push('', `## Review gate errors (${report.reviewIssues.length})`, '');
  for (const issue of report.reviewIssues) {
    const findings = issue.findings.length > 0 ? issue.findings.join('; ') : 'no flags';
    out.push(`- **${issue.id}** (run ${issue.repeat}) ${issue.kind}: ${issue.why}. ${findings}`);
  }

  out.push('', `## Extraction misses (${report.misses.length})`, '');
  for (const miss of report.misses) {
    const parts = [
      miss.error ? `error: ${miss.error}` : null,
      ...miss.fields.map(
        (f) =>
          `${f.field}: expected \`${JSON.stringify(f.expected)}\`, got \`${JSON.stringify(f.actual)}\``,
      ),
      miss.lines,
    ].filter(Boolean);
    out.push(`- **${miss.id}** (run ${miss.repeat}): ${parts.join('; ')}`);
  }
  return `${out.join('\n')}\n`;
}
