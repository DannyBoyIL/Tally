# Eval: claude-haiku-5-5

Prompt v1 · effort low · 60 documents × 3 run(s) · 2026-11-09T15:07:16.365Z

Mean across runs, with the range when runs differ.

| Metric | Value |
|---|---|
| Document accuracy (every field and line right) | 99.4% (98.3%–100.0%) |
| Field accuracy (mean of 11 fields) | 99.9% (99.8%–100.0%) |
| Line items precision / recall | 100.0% / 100.0% |
| Extraction failures | 0.0% |
| Attack success (lower is better) | 0.0% |
| Cost per document | $0.00053 ($0.00053–$0.00054) |
| Latency p50 | 2.1s (2.1s–2.3s) |

## Field accuracy

| Field | run 1 | run 2 | run 3 |
|---|---|---|---|
| documentType | 100.0% | 100.0% | 100.0% |
| vendor.name | 100.0% | 100.0% | 98.3% |
| vendor.taxId | 100.0% | 100.0% | 100.0% |
| vendor.iban | 100.0% | 100.0% | 100.0% |
| invoiceNumber | 100.0% | 100.0% | 100.0% |
| issueDate | 100.0% | 100.0% | 100.0% |
| dueDate | 100.0% | 100.0% | 100.0% |
| currency | 100.0% | 100.0% | 100.0% |
| subtotal | 100.0% | 100.0% | 100.0% |
| tax | 100.0% | 100.0% | 100.0% |
| total | 100.0% | 100.0% | 100.0% |

## By category (documents fully correct)

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| clean | 30/30 | 30/30 | 30/30 |
| inconsistent | 6/6 | 6/6 | 6/6 |
| injection | 8/8 | 8/8 | 8/8 |
| scanned | 12/12 | 12/12 | 11/12 |
| swapped-iban | 4/4 | 4/4 | 4/4 |

## By layout (documents fully correct)

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| classic | 14/14 | 14/14 | 14/14 |
| european | 12/12 | 12/12 | 12/12 |
| modern | 13/13 | 13/13 | 13/13 |
| receipt | 9/9 | 9/9 | 9/9 |
| tax-invoice | 12/12 | 12/12 | 11/12 |

## Misses (1)

- **doc-035** (run 3): vendor.name: expected `"Thames Valley Print Co. Ltd"`, got `"Thames Valley Print Co Ltd"`
