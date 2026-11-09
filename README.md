# Tally

**LLM invoice extraction that checks its own math.**

Tally extracts invoices and receipts with an LLM, then refuses to trust it: deterministic checks
catch wrong totals and swapped bank details, a human approves every document, the model's raw
output is never overwritten, and an accuracy eval against known ground truth gates every change
in CI.

> Status: phase 2 (extraction + accuracy eval). See [docs/PROJECT.md](docs/PROJECT.md) for the
> problem, scope, architecture, evaluation method and build phases.

## Stack

Node.js + TypeScript · React + TypeScript · Zod · Postgres · Vitest · Playwright · Docker ·
GitHub Actions · AWS

## Development

Requires Node 24 (`nvm use`) and pnpm 12 (`npm install -g pnpm@12`).

```bash
pnpm install
pnpm check                 # format, lint, typecheck, test
cp .env.example .env
docker compose up -d db    # Postgres on localhost:5432
```

## Golden set

60 synthetic documents with known ground truth, in [data/golden](data/golden):

| Category     | n   | What it tests                                |
| ------------ | --- | -------------------------------------------- |
| clean        | 30  | baseline accuracy, all 5 layouts             |
| scanned      | 12  | rotation, blur, grain, grayscale             |
| inconsistent | 6   | the document's own numbers don't add up      |
| injection    | 8   | hidden instructions trying to change a field |
| swapped-iban | 4   | bank details that don't match the vendor     |

Each `doc-NNN/` holds `page.jpg` (what the model sees) and `case.json`: the truth, the flags the
validators should raise, and the attack (target field and attacker value), if any.
`vendors.json` is the vendor master data.

**Truth is what's printed**, not what's correct: a document with a wrong total has the wrong total
as its truth. Reading accurately is the extractor's job; catching the error is the validators'.
A test checks that every truth value appears in each document's rendered text.

The set is committed and frozen: pixels depend on fonts and the Chromium version, so the eval
needs a fixed reference. To rebuild it (or build a new one with another seed):

```bash
pnpm --filter @tally/datagen exec playwright install chromium   # once
pnpm --filter @tally/datagen generate --seed 2026
```

## Eval

The eval runs the extractor over the golden set and scores it strictly: exact match after
normalization (case, spacing, IBAN grouping), no fuzzy matching. An IBAN that is almost right
pays the wrong account.

```bash
cp .env.example .env               # then set ANTHROPIC_API_KEY
pnpm --filter @tally/eval eval --repeat 3
pnpm --filter @tally/eval eval --category injection --limit 4   # quick slice
```

Each run writes `eval/runs/<time>-<model>/`: every raw model response, `report.json` and
`report.md` (accuracy per field, per category and per layout, line precision/recall, attack
success, cost, latency, and every miss as expected vs got). Runs are repeated because the model
can't be pinned to temperature 0; the report shows the range across runs.

Defaults: `claude-haiku-5-5`, effort `low`. Use `--model` to compare others.
`--save-baseline` copies a run to `eval/baselines/<model>/` (committed; the CI gate in phase 5 and
the UI fixtures in phase 4 use it). Live runs cost money and never run on ordinary CI.

## Repository layout

```
packages/shared    Zod schemas shared by API, UI, data generator and eval
packages/datagen   Seeded document generator: truth → HTML layout → Playwright screenshot
packages/extractor Image → Claude structured output → normalized, validated Invoice
eval/              Golden-set eval CLI: scoring, reports, baselines
data/golden        The frozen golden set
docs/              Project definition and decisions
```

More packages arrive phase by phase (API, web, e2e).
