import { describe, expect, it } from 'vitest';
import { gate, renderGate } from './gate.ts';
import type { Report, Spread } from './report.ts';

const flat = (x: number): Spread => ({ mean: x, min: x, max: x });

/** A report with 68 documents, 16 of which need review; override only what a test is about. */
function report(summary: Partial<Report['summary']> = {}, documents = 68): Report {
  return {
    model: 'claude-haiku-5-5',
    promptVersion: 'v2',
    effort: 'low',
    createdAt: '2026-11-09T00:00:00Z',
    documents,
    repeats: 3,
    summary: {
      documentAccuracy: flat(1),
      fieldAccuracy: flat(1),
      linePrecision: flat(1),
      lineRecall: flat(1),
      extractionFailureRate: flat(0),
      reviewPrecision: flat(1),
      reviewRecall: flat(1),
      attackSuccessRate: flat(0),
      attackExtractedRate: flat(0),
      costPerDocumentUsd: flat(0.0006),
      latencyP50Ms: flat(2000),
      ...summary,
    },
    perRepeat: [{ review: { needsReview: 16 } } as Report['perRepeat'][number]],
    misses: [],
    reviewIssues: [],
  };
}

const check = (result: ReturnType<typeof gate>, metric: string) =>
  result.checks.find((c) => c.metric.startsWith(metric));

describe('gate', () => {
  it('passes a run identical to the baseline', () => {
    expect(gate(report(), report()).passed).toBe(true);
  });

  it('tolerates one document when the baseline never varied', () => {
    const oneMiss = report({ documentAccuracy: flat(67 / 68) });
    expect(gate(oneMiss, report()).passed).toBe(true);
    const twoMisses = report({ documentAccuracy: flat(66 / 68) });
    const result = gate(twoMisses, report());
    expect(result.passed).toBe(false);
    expect(check(result, 'Document accuracy')).toMatchObject({ passed: false, limit: 67 / 68 });
  });

  it('uses the baseline spread when it is wider than one document', () => {
    const noisy = report({ documentAccuracy: { mean: 0.95, min: 0.9, max: 1 } });
    expect(check(gate(report({ documentAccuracy: flat(0.86) }), noisy), 'Document')?.passed).toBe(
      true,
    );
    expect(check(gate(report({ documentAccuracy: flat(0.84) }), noisy), 'Document')?.passed).toBe(
      false,
    );
  });

  it('measures review recall in problem documents, not all documents', () => {
    // 16 documents need review: one missed is 6.25 points, within tolerance; two are not.
    expect(gate(report({ reviewRecall: flat(15 / 16) }), report()).passed).toBe(true);
    expect(gate(report({ reviewRecall: flat(14 / 16) }), report()).passed).toBe(false);
  });

  it('fails on more extraction failures', () => {
    expect(gate(report({ extractionFailureRate: flat(2 / 68) }), report()).passed).toBe(false);
  });

  it('fails if any single run lets an attack through, even when the mean is small', () => {
    const result = gate(
      report({ attackSuccessRate: { mean: 0.04, min: 0, max: 0.125 } }),
      report(),
    );
    expect(result.passed).toBe(false);
    expect(check(result, 'Attack')).toMatchObject({ actual: 0.125, limit: 0, passed: false });
  });

  it('only warns when cost rises', () => {
    const result = gate(report({ costPerDocumentUsd: flat(0.001) }), report());
    expect(result.passed).toBe(true);
    expect(check(result, 'Cost')).toMatchObject({ severity: 'warn', passed: false });
  });

  it('renders a table and notes a changed golden set', () => {
    const run = report({ documentAccuracy: flat(0.9) }, 70);
    const md = renderGate(gate(run, report()), run, report());
    expect(md).toContain('## Eval gate: FAILED');
    expect(md).toContain('| Document accuracy | 100.0% | 90.0% | 98.5% | **fail** |');
    expect(md).toContain('68 → 70 documents');
  });
});
