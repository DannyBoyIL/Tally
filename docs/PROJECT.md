# Tally — project definition

> LLM invoice extraction that checks its own math.

Locked 2026-11-03. Changes to scope go through this file.

## Problem

Small finance teams (accounts payable) receive invoices and receipts in every layout imaginable.
Typing them in by hand is slow and error-prone. An LLM extracts them in seconds, but:

1. **It is wrong silently** — a wrong total, a swapped date, a missing line, with no warning.
2. **It can be steered** — text inside the document can influence the output. The real-world
   version of this is invoice fraud: changed bank details.

Tally is extraction you can trust: catch errors without knowing the answer in advance, send a
human only what needs a human, keep a full audit trail, and measure accuracy so that no prompt
change ships if it makes things worse.

## Users

| User | Needs |
|---|---|
| **Reviewer** (AP clerk) | See the document next to the extracted fields, see at a glance what is suspicious and why, correct, approve or reject |
| **Maintainer** (engineer) | Change a prompt, model or schema and know for certain whether accuracy dropped — the CI gate is for this user |

## MVP

**In scope**

1. **Synthetic document generator** with ground truth for free: ~5 layouts, invoices and
   receipts; varied labels ("Total" / "Amount due" / "Balance"), date formats, 2–3 currencies;
   a "scanned" variant (rasterized, slight rotation, noise); an adversarial set (hidden
   instructions, swapped IBAN, documents whose own totals don't add up).
2. **Extraction**: one LLM call with structured output against a Zod schema. The raw output is
   stored as-is and never modified.
3. **Deterministic validation**: line amount = quantity × price; line items sum to subtotal;
   subtotal + tax = total; due date ≥ issue date; ISO currency; IBAN checksum; known vendor;
   **IBAN matches the known vendor** (vendor master data); instruction-like notices. (A tax-rate
   check was dropped in phase 3: each synthetic vendor uses one rate, so it would never fire.)
4. **Review UI** (React): document side by side with fields, failed checks highlighted with the
   reason; edit a field, approve or reject.
5. **Layers that never overwrite**: `extractions` (model output, immutable) →
   `validation_results` → `review_events` (append-only) → `final` (derived view).
6. **Eval CLI**: runs the golden set, writes a report (JSON + Markdown), diffs against a
   baseline, exits non-zero on regression.
7. **Two-tier CI** (see Evaluation).
8. **Playwright E2E** for the review flow.
9. **Docker Compose** locally; minimal AWS deployment with a demo mode.

**Out of scope, deliberately**

| What | Why |
|---|---|
| Agents / LangGraph | No decisions to make. One call followed by deterministic code is more reliable; every extra interpretation step is one more place for the model to make things up |
| LLM-as-judge | Ground truth is known; exact match after normalization is cheaper, stable and noise-free |
| Auto-approve | Every document goes to a human. Validator precision is measured so auto-approve can later be justified by data |
| LLM-based injection classifier | Structural defenses are stronger (see below) |
| Queues, microservices, multi-tenancy, roles, ERP integration, fine-tuning, own OCR | Not needed for the MVP |
| Multi-provider comparison | One provider (Anthropic) behind a thin adapter. Iteration runs on Claude Haiku 5.5 (cheap); before the final results the eval is rerun on Sonnet/Opus and reported as a cost/accuracy table |
| Non-English documents | Spanish templates with PEN are a stretch goal |

## Architecture

```
pnpm monorepo
├── packages/shared     Zod schemas (Invoice, LineItem) shared by server and client
├── packages/datagen    HTML templates → JPEG via Playwright + ground-truth JSON
├── packages/extractor  Image → one structured-output call → normalized Invoice (provider adapter)
├── packages/validators Deterministic checks + vendor master data → flags with reasons
├── apps/api            Node + TypeScript (Fastify), Postgres
│     extract  → one LLM call → raw output stored (immutable)
│     validate → deterministic rules + vendor master data
│     review   → append-only events → final view
├── apps/web            React + TypeScript (Vite): queue, side-by-side review screen
├── eval/               CLI: golden set → field-level report → baseline diff → exit code
└── e2e/                Playwright (LLM mocked from recorded fixtures)
```

- **Fastify** over NestJS: TypeScript-first, lean, built-in schema validation.
- **One Zod schema** drives the LLM's structured output, API validation and React types.
- **Money is integer minor units** (cents) everywhere, so validation arithmetic is exact.
- **Postgres**; processing is synchronous or an in-process job with polling — no queue.
- **AWS**: one container, managed Postgres, S3 for files. Exact service chosen in phase 6 by cost.
- **Demo mode**: preloaded documents with precomputed results; live extraction behind an access
  code / rate limit, so a public demo is not an open API bill.

**Data model**: `documents` · `extractions` (model, prompt_version, raw jsonb, tokens, latency) ·
`validation_results` · `review_events` (field_path, old, new, reviewer, ts) · `vendors`.
Append-only tables are enforced by Postgres triggers. The final invoice is derived in code
(`deriveFinal`: the extraction with edits replayed in order) rather than a SQL view: replaying JSON
field edits is clearer and testable as a pure function. Database access is plain SQL with
numbered migrations, no ORM.

**Extractor modes**: `live` (Claude) or `replay` (recorded eval responses matched by image hash).
Replay makes E2E and CI free and deterministic, and is the basis of the phase 6 demo mode.

**Input**: every page is rendered to an image (JPEG) and sent to a vision model — one path for
clean and "scanned" documents alike. PDF input is out of scope for the MVP.

**The model reads, code normalizes**: the model returns amounts as printed decimals and dates as
ISO strings through structured outputs; code converts to cents, compacts IBANs and runs the strict
shared schema. A schema failure is an extraction failure, never silently patched.

## Evaluation

| Metric | Tells us |
|---|---|
| Field accuracy (exact match after normalization) | How often the model is right, per field |
| Document accuracy (all fields right) | The business metric |
| Line items precision / recall | Invented or missed lines |
| Validator precision / recall | When a check fails, was there really an error? How many errors passed every check? In production there is no ground truth — the validators are the only runtime signal |
| Injection attack success rate | How often a hidden instruction changed a value without the document being flagged |
| Cost and latency per document | — |

**Prompt-injection defense** (structural, no classifier):
1. The model has no tools and no authority; it only fills a schema, so an injection can at most
   change field values.
2. Only a human approves.
3. Critical values (IBAN) are checked against master data in code.
4. The prompt (v2) treats the document as data: each value comes from its own place on the page,
   and text claiming to change a value is copied into `notices` instead of obeyed.
5. A deterministic heuristic in code (not the model) reads the notices and flags instruction-like
   or payment-changing text for review.

An attack counts as successful only if the attacker's value was extracted **and** nothing flagged
the document: a fooled extraction that a validator catches never reaches approval unnoticed.

**Two-tier CI**
- **Every PR — deterministic, free**: lint, typecheck, unit tests for validators, API tests,
  Playwright against recorded model responses.
- **Live eval gate** — only when prompt / schema / extraction code changes (paths filter), on the
  full golden set. Current Claude models reject sampling parameters (no temperature 0), so
  run-to-run noise is measured, not assumed away: the baseline is several repeated runs, and the
  gate fails if accuracy drops below the baseline minus a tolerance derived from that spread.
  The report is uploaded as an artifact.

## Phases

Each phase ends in a working, tested state.

| # | Phase | Outcome |
|---|---|---|
| 0 | Skeleton: monorepo, strict TS, lint, Vitest, CI, Postgres in compose, Zod schema | A repo that passes CI |
| 1 | **Data generator + golden set** (~60 docs: clean, scanned, adversarial, inconsistent) | Data with known truth, before any model |
| 2 | Extraction + eval CLI, no UI | **First numbers**; provider chosen by data |
| 3 | Validators, vendor master data, injection defense | Validator metrics and attack success rate |
| 4 | API, review UI, correction layers, Playwright | The full approval flow |
| 5 | Two-tier CI gate | Regressions blocked automatically |
| 6 | Docker + AWS with demo mode | A live link |
| 7 | README with results | Material for the CV |

Eval before UI on purpose: every later decision rests on numbers.
