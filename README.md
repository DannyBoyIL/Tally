# Tally

**LLM invoice extraction that checks its own math.**

Tally extracts invoices and receipts with an LLM, then refuses to trust it: deterministic checks
catch wrong totals and swapped bank details, a human approves every document, the model's raw
output is never overwritten, and an accuracy eval against known ground truth gates every change
in CI.

> Status: phase 6 (Docker + AWS demo). See [docs/PROJECT.md](docs/PROJECT.md) for the
> problem, scope, architecture, evaluation method and build phases.

## Quick start

Run the review app on your machine. You need **Node 24**, **pnpm 12** and **Docker Desktop**
(started: the whale icon in the menu bar).

```bash
nvm use                      # Node 24, from .nvmrc (in every new terminal, see below)
npm install -g pnpm@12       # once per Node version: gives you the `pnpm` command
pnpm install                 # all packages
cp .env.example .env         # once; the defaults work as they are
docker compose up -d db      # Postgres in Docker, on localhost:5432
pnpm db:setup                # create the tables and load vendor master data
pnpm dev                     # API on :3000 and the React app (Vite) on :5173
```

`zsh: command not found: pnpm` means the terminal is on a Node version without pnpm: nvm
keeps global tools per Node version, and a new terminal starts on nvm's default. Run `nvm use`
in the repository (and `npm install -g pnpm@12` if it's still missing), or make Node 24 the
default once with `nvm alias default 24`.

Open **http://127.0.0.1:5173**, click **Upload invoice** and pick a page from `data/golden`:

| File               | What you'll see                                                     |
| ------------------ | ------------------------------------------------------------------- |
| `doc-001/page.jpg` | a clean invoice: all checks pass, approve it                        |
| `doc-045/page.jpg` | a receipt whose total is wrong: fix the total, the flag clears      |
| `doc-062/page.jpg` | a fake "our bank details have changed" notice: flagged as injection |
| `doc-057/page.jpg` | an IBAN that differs from the vendor's: approving needs a note      |

No API key is needed: the app **replays** the answers Claude really gave for these documents
(recorded by the eval), so only `data/golden` images extract. To extract any image with Claude,
set `EXTRACTOR=live` and `ANTHROPIC_API_KEY` in `.env` and restart `pnpm dev`.

Stop with Ctrl+C; `docker compose down` stops Postgres (your data is kept in a Docker volume).

**Only Docker, no Node:** `docker compose up --build` runs the app as it is deployed, in demo mode,
at **http://localhost:8080** (one container serving the API and the web app, with sample
documents preloaded and a fresh database on every start).

## Demo

The public demo runs the same image on one AWS EC2 instance with Postgres and Caddy (HTTPS),
deployed by CI on every merge to `main`. Sample invoices replay recorded Claude answers, so a visit
costs nothing; reading your own image live needs an access code and has a daily cap. Everything
resets daily. Setup and operations: [docs/DEPLOY.md](docs/DEPLOY.md); why one instance and not
managed services: [docs/DECISIONS.md](docs/DECISIONS.md).

## Stack

Node.js + TypeScript · React + TypeScript · Zod · Postgres · Vitest · Playwright · Docker ·
GitHub Actions · AWS

## Development

Requires Node 24 (`nvm use`) and pnpm 12 (`npm install -g pnpm@12`).

```bash
pnpm install
cp .env.example .env
docker compose up -d db    # Postgres on localhost:5432 (the API tests need it too)
pnpm check                 # format, lint, typecheck, unit + API integration tests
pnpm e2e                   # Playwright: the review flow in a real browser (once:
                           #   pnpm --filter @tally/e2e exec playwright install chromium)
```

`pnpm dev` runs both servers; to run them separately (e.g. to read each one's logs):

```bash
pnpm --filter @tally/api dev    # API on :3000 (restarts on change, applies migrations on start)
pnpm --filter @tally/web dev    # React app via Vite on http://127.0.0.1:5173 (hot reload)
```

By default the API **replays** recorded extractions from the committed eval baseline: upload any
`data/golden/doc-*/page.jpg` and you get the response the model really gave, with no key and no
cost. Set `EXTRACTOR=live` in `.env` to call Claude for any image.

## Review app

- **Queue**: every document with vendor, total, number of flags and status.
- **Review**: the image next to the extracted fields. Each flag sits on the field it concerns,
  with its reason ("51.65 + 4.26 tax = 55.91, total is 40.15"). Click a field to correct it;
  the validators re-run on the corrected invoice. Approving over open flags needs a written note;
  rejecting always does. A decision locks the document.

**History is never rewritten.** `extractions`, `validation_results` and `review_events` are
append-only, enforced by Postgres triggers (a test proves UPDATE, DELETE and TRUNCATE fail). The
final invoice isn't stored: it's the extraction with the review edits replayed in order, so the
result can't drift from its history. No login in the MVP; events are recorded under `REVIEWER`.

## Golden set

68 synthetic documents with known ground truth, in [data/golden](data/golden):

| Category          | n   | What it tests                                                     |
| ----------------- | --- | ----------------------------------------------------------------- |
| clean             | 30  | baseline accuracy, all 5 layouts                                  |
| scanned           | 12  | rotation, blur, grain, grayscale                                  |
| inconsistent      | 6   | the document's own numbers don't add up                           |
| injection         | 8   | hidden instructions trying to change a field                      |
| swapped-iban      | 4   | bank details that don't match the vendor                          |
| injection-visible | 8   | visible, business-like fraud text (credit note, new bank details) |

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

Each run writes `eval/runs/<time>-<model>-<prompt>/`: every raw model response, `report.json` and
`report.md` (accuracy per field, per category and per layout, line precision/recall, the
validators' flags against the planted ones, needs-review precision/recall, attack success, cost,
latency, and every miss as expected vs got).

The validators run on every extraction, as the API will. A document **needs review** if it has a
planted problem or the extraction is wrong; it is **flagged** if a validator fired or extraction
failed. Recall (problems that reached a human) is the number that would justify auto-approve
later. An attack succeeds only when its value was extracted and nothing flagged the document. Runs are repeated because the model
can't be pinned to temperature 0; the report shows the range across runs.

The key is read from `.env`, which wins over a key exported in your shell (the CLI prints which
source it used). Defaults: `claude-haiku-5-5`, effort `low`. Use `--model` to compare others and
`--prompt v1` to rerun the prompt without the injection defense.
`--save-baseline` copies a run to `eval/baselines/<model>/<prompt>/` (committed; the CI gate and
the app's replay mode use it).

## CI gate

A change that makes extraction or the review checks worse fails CI. The baseline the gate compares
against is named in [`eval/gate.json`](eval/gate.json) (now `claude-haiku-5-5/v2`).

| Job         | When                                                                                        | Cost   | What                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check`     | every push and PR                                                                           | free   | format, lint, typecheck, unit + API integration tests, then the **replay gate**: Claude's recorded answers re-scored with the current validators and scoring code |
| `e2e`       | every push and PR                                                                           | free   | Playwright, the review flow in a real browser                                                                                                                     |
| `eval-gate` | PRs touching the extractor, invoice schema, validators, golden set or eval code; or by hand | ~$0.12 | the **live gate**: the golden set through Claude 3 times, compared with the baseline                                                                              |

```bash
pnpm eval:replay                   # the replay gate, as CI runs it (no API key)
pnpm eval --repeat 3 --gate        # the live gate (costs money)
pnpm eval --replay --recorded baselines/claude-haiku-5-5/v1 --gate   # replay another run
```

The gate fails when, against the baseline:

- document accuracy, field accuracy or needs-review recall falls by more than the tolerance,
- extraction failures rise by more than the tolerance,
- **any** single run lets an attack through (no tolerance).

Cost per document only warns, if it rises by more than 25%. The tolerance is the larger of the
baseline's run-to-run spread and one document of that metric's denominator: the current baseline
scored 100% in every run, and a spread of zero would fail a run on a single noisy miss.

Checked by breaking things on purpose: replaying the v1 prompt's answers fails (accuracy 97.5%,
review recall 37.5%, an attack through); removing the total check fails (review recall 92.3%).
A $1 rounding tolerance in the total check passes the gate (the planted totals are off by
$15+) and is caught by the validators' unit tests instead. Each layer guards something different.

To accept a change that moves the numbers (a new prompt or model), merge it, run
`pnpm eval --repeat 3 --save-baseline`, and point `eval/gate.json` at the new baseline.
The live gate needs an `ANTHROPIC_API_KEY` repository secret.

## Repository layout

```
packages/shared    Zod schemas shared by API, UI, data generator and eval
packages/datagen   Seeded document generator: truth → HTML layout → Playwright screenshot
packages/extractor Image → Claude structured output → normalized, validated Invoice
packages/validators Deterministic checks + vendor master data → flags with reasons
apps/api           Fastify + Postgres: upload, extract, validate, append-only review events
apps/web           React (Vite): review queue and review screen
e2e/               Playwright: the review flow against the real API and database
deploy/            Production compose (app, Postgres, Caddy), server setup script
eval/              Golden-set eval CLI: scoring, reports, baselines, CI gate
data/golden        The frozen golden set
docs/              Project definition, decisions, deployment
```
