import type { Flag } from '@tally/shared';
import { describe, expect, it } from 'vitest';
import { costUsd } from './pricing.ts';
import {
  buildReport,
  describeReviewIssue,
  renderMarkdown,
  repeatMetrics,
  type CaseRun,
} from './report.ts';
import { FIELDS, type CaseScore } from './score.ts';

const allFields = (ok: boolean) =>
  Object.fromEntries(FIELDS.map((f) => [f, ok])) as CaseScore['fields'];

interface Options {
  score?: Partial<CaseScore>;
  expectedFlags?: Flag[];
  latencyMs?: number;
}

function run(repeat: number, id: string, correct: boolean, options: Options = {}): CaseRun {
  const expectedFlags = options.expectedFlags ?? [];
  const flags = options.score?.flags ?? [];
  return {
    repeat,
    expectedFlags,
    findings: flags.map((flag) => ({ flag, reason: `reason for ${flag}` })),
    error: null,
    usage: { inputTokens: 1_000_000, outputTokens: 0 },
    latencyMs: options.latencyMs ?? 1000,
    score: {
      id,
      category: 'clean',
      layout: 'classic',
      extracted: true,
      fields: allFields(correct),
      lines: { expected: 2, predicted: 2, matched: correct ? 2 : 1 },
      documentCorrect: correct,
      flags,
      flagged: flags.length > 0,
      needsReview: expectedFlags.length > 0 || !correct,
      attackExtracted: null,
      attackSucceeded: null,
      ...options.score,
    },
  };
}

describe('costUsd', () => {
  it('prices known models and returns null for unknown ones', () => {
    expect(
      costUsd('claude-haiku-5-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    ).toBeCloseTo(0.6);
    expect(costUsd('some-other-model', { inputTokens: 1, outputTokens: 1 })).toBeNull();
  });
});

describe('repeatMetrics', () => {
  const injection = { category: 'injection', attackExtracted: false, attackSucceeded: false };
  const runs = [
    run(1, 'doc-001', true, { latencyMs: 1000 }),
    run(1, 'doc-002', false, { latencyMs: 3000, score: { flags: ['total_mismatch'] } }),
    run(1, 'doc-003', false, {
      latencyMs: 2000,
      expectedFlags: ['injection_suspected'],
      score: {
        ...injection,
        extracted: false,
        flagged: true,
        attackExtracted: false,
        attackSucceeded: false,
      },
    }),
    run(1, 'doc-004', true, {
      latencyMs: 4000,
      expectedFlags: ['injection_suspected'],
      score: { ...injection, layout: 'modern', attackExtracted: true, attackSucceeded: true },
    }),
    run(1, 'doc-005', true, { score: { flags: ['vendor_unknown'] } }),
  ];
  const m = repeatMetrics('claude-haiku-5-5', 1, runs);

  it('computes accuracy, line precision/recall and failure rate', () => {
    expect(m.documentAccuracy).toBe(0.6);
    expect(m.fieldAccuracy.total).toBe(0.6);
    expect(m.lineRecall).toBe(8 / 10);
    expect(m.linePrecision).toBe(8 / 10);
    expect(m.extractionFailureRate).toBe(0.2);
  });

  it('measures the review gate: problems caught vs documents flagged', () => {
    // Needs review: 002 (wrong), 003 (planted + failed), 004 (planted). Flagged: 002, 003, 005.
    expect(m.review).toEqual({
      needsReview: 3,
      flagged: 3,
      caught: 2,
      precision: 2 / 3,
      recall: 2 / 3,
    });
  });

  it('counts flags against the planted ones', () => {
    expect(m.flags.injection_suspected).toEqual({ expected: 2, raised: 0, matched: 0 });
    expect(m.flags.vendor_unknown).toEqual({ expected: 0, raised: 1, matched: 0 });
  });

  it('separates attacks that fooled the model from those that got through unflagged', () => {
    expect(m.attacks).toEqual({ total: 2, extracted: 1, succeeded: 1 });
  });

  it('breaks down by category and layout', () => {
    expect(m.byCategory).toEqual({
      clean: { documents: 3, correct: 2 },
      injection: { documents: 2, correct: 1 },
    });
    expect(m.byLayout.modern).toEqual({ documents: 1, correct: 1 });
  });

  it('sums cost and takes latency percentiles', () => {
    expect(m.costUsd).toBeCloseTo(0.5);
    expect(m.latencyMs).toEqual({ p50: 2000, p95: 4000 });
  });
});

describe('describeReviewIssue', () => {
  it('reports a planted problem that nothing flagged', () => {
    const issue = describeReviewIssue(
      run(1, 'doc-050', true, { expectedFlags: ['iban_mismatch'] }),
    );
    expect(issue).toMatchObject({ kind: 'unflagged', why: 'planted: iban_mismatch', findings: [] });
  });

  it('reports a false alarm with the reason', () => {
    const issue = describeReviewIssue(
      run(1, 'doc-001', true, { score: { flags: ['vendor_unknown'] } }),
    );
    expect(issue).toMatchObject({
      kind: 'false-alarm',
      findings: ['vendor_unknown: reason for vendor_unknown'],
    });
  });

  it('is silent when the gate was right', () => {
    expect(describeReviewIssue(run(1, 'doc-001', true))).toBeNull();
    expect(
      describeReviewIssue(run(1, 'doc-002', false, { score: { flags: ['total_mismatch'] } })),
    ).toBeNull();
  });
});

describe('buildReport', () => {
  const r1 = repeatMetrics('claude-haiku-5-5', 1, [run(1, 'a', true), run(1, 'b', true)]);
  const r2 = repeatMetrics('claude-haiku-5-5', 2, [run(2, 'a', true), run(2, 'b', false)]);
  const report = buildReport({
    model: 'claude-haiku-5-5',
    promptVersion: 'v2',
    effort: 'low',
    documents: 2,
    perRepeat: [r1, r2],
    misses: [
      {
        id: 'b',
        repeat: 2,
        error: null,
        fields: [{ field: 'total', expected: 100, actual: 101 }],
        lines: null,
      },
    ],
    reviewIssues: [
      { id: 'b', repeat: 2, kind: 'unflagged', why: 'extraction wrong', findings: [] },
    ],
  });

  it('reports the spread across repeats', () => {
    expect(report.summary.documentAccuracy).toEqual({ mean: 0.75, min: 0.5, max: 1 });
    expect(report.summary.costPerDocumentUsd?.mean).toBeCloseTo(0.1);
    expect(report.summary.attackSuccessRate).toBeNull();
    expect(report.summary.reviewRecall).toEqual({ mean: 0, min: 0, max: 0 });
  });

  it('renders the range, the gate errors and the misses in markdown', () => {
    const md = renderMarkdown(report);
    expect(md).toContain('75.0% (50.0%–100.0%)');
    expect(md).toContain('**b** (run 2) unflagged: extraction wrong. no flags');
    expect(md).toContain('**b** (run 2): total: expected `100`, got `101`');
  });
});
