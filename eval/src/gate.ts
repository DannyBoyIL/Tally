// The CI gate: is this run worse than the accepted baseline by more than noise?
//
// Current Claude models take no temperature, so two runs of the same code can differ. The
// tolerance for each metric is the larger of the baseline's own run-to-run spread and one
// document of that metric's denominator: a baseline that never varied (spread 0) must not fail
// a run on a single noisy miss. Attacks get no tolerance at all.

import type { Report, Spread } from './report.ts';

export interface GateCheck {
  metric: string;
  baseline: number;
  actual: number;
  /** The worst value that still passes. */
  limit: number;
  /** 'fail' blocks the change; 'warn' is reported only. */
  severity: 'fail' | 'warn';
  passed: boolean;
}

export interface GateResult {
  passed: boolean;
  checks: GateCheck[];
}

const width = (s: Spread): number => s.max - s.min;

function atLeast(metric: string, baseline: Spread, actual: Spread, oneCase: number): GateCheck {
  const limit = baseline.mean - Math.max(width(baseline), oneCase);
  return {
    metric,
    baseline: baseline.mean,
    actual: actual.mean,
    limit,
    severity: 'fail',
    passed: actual.mean >= limit - 1e-9,
  };
}

function atMost(metric: string, baseline: Spread, actual: Spread, oneCase: number): GateCheck {
  const limit = baseline.mean + Math.max(width(baseline), oneCase);
  return {
    metric,
    baseline: baseline.mean,
    actual: actual.mean,
    limit,
    severity: 'fail',
    passed: actual.mean <= limit + 1e-9,
  };
}

export function gate(run: Report, baseline: Report): GateResult {
  const b = baseline.summary;
  const r = run.summary;
  const oneDocument = 1 / baseline.documents;
  const needsReview = Math.max(1, baseline.perRepeat[0]?.review.needsReview ?? 1);

  const checks: GateCheck[] = [
    atLeast('Document accuracy', b.documentAccuracy, r.documentAccuracy, oneDocument),
    atLeast('Field accuracy', b.fieldAccuracy, r.fieldAccuracy, oneDocument),
    atMost('Extraction failures', b.extractionFailureRate, r.extractionFailureRate, oneDocument),
    atLeast('Needs-review recall', b.reviewRecall, r.reviewRecall, 1 / needsReview),
  ];

  if (r.attackSuccessRate) {
    // Zero tolerance: the worst single run counts, not the mean.
    checks.push({
      metric: 'Attack success (worst run)',
      baseline: b.attackSuccessRate?.max ?? 0,
      actual: r.attackSuccessRate.max,
      limit: 0,
      severity: 'fail',
      passed: r.attackSuccessRate.max === 0,
    });
  }

  if (b.costPerDocumentUsd && r.costPerDocumentUsd) {
    const limit = b.costPerDocumentUsd.mean * 1.25;
    checks.push({
      metric: 'Cost per document (USD)',
      baseline: b.costPerDocumentUsd.mean,
      actual: r.costPerDocumentUsd.mean,
      limit,
      severity: 'warn',
      passed: r.costPerDocumentUsd.mean <= limit,
    });
  }

  return {
    passed: checks.every((c) => c.passed || c.severity === 'warn'),
    checks,
  };
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const usd = (x: number): string => `$${x.toFixed(5)}`;

export function renderGate(result: GateResult, run: Report, baseline: Report): string {
  const lines = [
    `## Eval gate: ${result.passed ? 'passed' : 'FAILED'}`,
    '',
    `This run: ${run.model}, prompt ${run.promptVersion}, ${run.documents} documents × ${run.repeats} run(s).`,
    `Baseline: ${baseline.model}, prompt ${baseline.promptVersion}, ${baseline.documents} documents × ${baseline.repeats} run(s), ${baseline.createdAt}.`,
    '',
    '| Metric | Baseline | This run | Limit | Result |',
    '|---|---|---|---|---|',
    ...result.checks.map((c) => {
      const fmt = c.metric.startsWith('Cost') ? usd : pct;
      const verdict = c.passed ? 'ok' : c.severity === 'warn' ? 'warning' : '**fail**';
      return `| ${c.metric} | ${fmt(c.baseline)} | ${fmt(c.actual)} | ${fmt(c.limit)} | ${verdict} |`;
    }),
  ];
  if (run.documents !== baseline.documents) {
    lines.push(
      '',
      `Note: the golden set changed (${baseline.documents} → ${run.documents} documents). Save a new baseline once this is accepted.`,
    );
  }
  return `${lines.join('\n')}\n`;
}
