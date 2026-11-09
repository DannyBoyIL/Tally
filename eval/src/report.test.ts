import { describe, expect, it } from 'vitest';
import { costUsd } from './pricing.ts';
import { buildReport, renderMarkdown, repeatMetrics, type CaseRun } from './report.ts';
import { FIELDS, type CaseScore } from './score.ts';

const allFields = (ok: boolean) =>
  Object.fromEntries(FIELDS.map((f) => [f, ok])) as CaseScore['fields'];

function run(
  repeat: number,
  id: string,
  correct: boolean,
  extra: Partial<CaseScore> = {},
  latencyMs = 1000,
): CaseRun {
  return {
    repeat,
    error: null,
    usage: { inputTokens: 1_000_000, outputTokens: 0 },
    latencyMs,
    score: {
      id,
      category: 'clean',
      layout: 'classic',
      extracted: true,
      fields: allFields(correct),
      lines: { expected: 2, predicted: 2, matched: correct ? 2 : 1 },
      documentCorrect: correct,
      attackSucceeded: null,
      ...extra,
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
  const runs = [
    run(1, 'doc-001', true, {}, 1000),
    run(1, 'doc-002', false, {}, 3000),
    run(
      1,
      'doc-003',
      false,
      { extracted: false, category: 'injection', attackSucceeded: true },
      2000,
    ),
    run(
      1,
      'doc-004',
      true,
      { category: 'injection', attackSucceeded: false, layout: 'modern' },
      4000,
    ),
  ];
  const m = repeatMetrics('claude-haiku-5-5', 1, runs);

  it('computes accuracy, line precision/recall and failure rate', () => {
    expect(m.documentAccuracy).toBe(0.5);
    expect(m.fieldAccuracy.total).toBe(0.5);
    expect(m.lineRecall).toBe(6 / 8);
    expect(m.linePrecision).toBe(6 / 8);
    expect(m.extractionFailureRate).toBe(0.25);
  });

  it('counts only attacked documents for attack success', () => {
    expect(m.attacks).toEqual({ total: 2, succeeded: 1 });
  });

  it('breaks down by category and layout', () => {
    expect(m.byCategory).toEqual({
      clean: { documents: 2, correct: 1 },
      injection: { documents: 2, correct: 1 },
    });
    expect(m.byLayout.modern).toEqual({ documents: 1, correct: 1 });
  });

  it('sums cost and takes latency percentiles', () => {
    expect(m.costUsd).toBeCloseTo(0.4);
    expect(m.latencyMs).toEqual({ p50: 2000, p95: 4000 });
  });
});

describe('buildReport', () => {
  const r1 = repeatMetrics('claude-haiku-5-5', 1, [run(1, 'a', true), run(1, 'b', true)]);
  const r2 = repeatMetrics('claude-haiku-5-5', 2, [run(2, 'a', true), run(2, 'b', false)]);
  const report = buildReport({
    model: 'claude-haiku-5-5',
    promptVersion: 'v1',
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
  });

  it('reports the spread across repeats', () => {
    expect(report.summary.documentAccuracy).toEqual({ mean: 0.75, min: 0.5, max: 1 });
    expect(report.summary.costPerDocumentUsd?.mean).toBeCloseTo(0.1);
    expect(report.summary.attackSuccessRate).toBeNull();
  });

  it('renders the range and the misses in markdown', () => {
    const md = renderMarkdown(report);
    expect(md).toContain('75.0% (50.0%–100.0%)');
    expect(md).toContain('**b** (run 2): total: expected `100`, got `101`');
  });
});
