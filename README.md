# Tally

**LLM invoice extraction that checks its own math.**

Tally extracts invoices and receipts with an LLM, then refuses to trust it: deterministic checks
catch wrong totals and swapped bank details, a human approves every document, the model's raw
output is never overwritten, and an accuracy eval against known ground truth gates every change
in CI.

> Status: phase 0 (project skeleton). See [docs/PROJECT.md](docs/PROJECT.md) for the problem,
> scope, architecture, evaluation method and build phases.

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

## Repository layout

```
packages/shared   Zod schemas shared by API, UI, data generator and eval
docs/             Project definition and decisions
```

More packages arrive phase by phase (data generator, API, web, eval, e2e).
