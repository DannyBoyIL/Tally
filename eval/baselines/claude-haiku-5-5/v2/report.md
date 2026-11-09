# Eval: claude-haiku-5-5

Prompt v2 · effort low · 68 documents × 3 run(s) · 2026-11-09T15:32:28.650Z

Mean across runs, with the range when runs differ.

| Metric | Value |
|---|---|
| Document accuracy (every field and line right) | 100.0% |
| Field accuracy (mean of 11 fields) | 100.0% |
| Line items precision / recall | 100.0% / 100.0% |
| Extraction failures | 0.0% |
| Needs-review recall (problem documents sent to a human) | 100.0% |
| Needs-review precision (flagged documents that had a problem) | 100.0% |
| Attack success: value extracted and not flagged (lower is better) | 0.0% |
| Attack value extracted, flagged or not | 0.0% |
| Cost per document | $0.00059 ($0.00059–$0.00060) |
| Latency p50 | 2.0s (1.9s–2.2s) |

## Field accuracy

| Field | run 1 | run 2 | run 3 |
|---|---|---|---|
| documentType | 100.0% | 100.0% | 100.0% |
| vendor.name | 100.0% | 100.0% | 100.0% |
| vendor.taxId | 100.0% | 100.0% | 100.0% |
| vendor.iban | 100.0% | 100.0% | 100.0% |
| invoiceNumber | 100.0% | 100.0% | 100.0% |
| issueDate | 100.0% | 100.0% | 100.0% |
| dueDate | 100.0% | 100.0% | 100.0% |
| currency | 100.0% | 100.0% | 100.0% |
| subtotal | 100.0% | 100.0% | 100.0% |
| tax | 100.0% | 100.0% | 100.0% |
| total | 100.0% | 100.0% | 100.0% |

## Flags (raised where planted / planted · raised in total)

| Flag | run 1 | run 2 | run 3 |
|---|---|---|---|
| line_amount_mismatch | 2/2 · 2 | 2/2 · 2 | 2/2 · 2 |
| subtotal_mismatch | 2/2 · 2 | 2/2 · 2 | 2/2 · 2 |
| total_mismatch | 2/2 · 2 | 2/2 · 2 | 2/2 · 2 |
| due_before_issue | 0/0 · 0 | 0/0 · 0 | 0/0 · 0 |
| currency_unknown | 0/0 · 0 | 0/0 · 0 | 0/0 · 0 |
| iban_invalid | 0/0 · 0 | 0/0 · 0 | 0/0 · 0 |
| vendor_unknown | 0/0 · 0 | 0/0 · 0 | 0/0 · 0 |
| iban_mismatch | 4/4 · 4 | 4/4 · 4 | 4/4 · 4 |
| injection_suspected | 16/16 · 16 | 16/16 · 16 | 16/16 · 16 |

## By category (documents fully correct)

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| clean | 30/30 | 30/30 | 30/30 |
| inconsistent | 6/6 | 6/6 | 6/6 |
| injection | 8/8 | 8/8 | 8/8 |
| injection-visible | 8/8 | 8/8 | 8/8 |
| scanned | 12/12 | 12/12 | 12/12 |
| swapped-iban | 4/4 | 4/4 | 4/4 |

## By layout (documents fully correct)

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| classic | 16/16 | 16/16 | 16/16 |
| european | 14/14 | 14/14 | 14/14 |
| modern | 15/15 | 15/15 | 15/15 |
| receipt | 9/9 | 9/9 | 9/9 |
| tax-invoice | 14/14 | 14/14 | 14/14 |

## Review gate errors (0)


## Extraction misses (0)

