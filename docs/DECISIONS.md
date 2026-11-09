# Decisions

The choices that shape Tally, why they were made, and what would change them. Newest last. The
point is to come back months later and remember the reasoning without redoing it.

## One LLM call, no agent, no LLM judge (phase 0)

Extraction is one structured-output call followed by deterministic code. There is nothing to
decide, so an agent would only add places to make things up. Ground truth is known, so the eval
scores by exact match after normalization instead of asking a second model.

## Anthropic only; Haiku 5.5 for now (phase 2)

Cheap iteration while building. **Open:** rerun the eval on Sonnet/Opus before the results README
and report both.

## Append-only data, enforced by Postgres (phase 4)

Extractions, validation results and review events can't be updated or deleted: triggers refuse
it. The final invoice is the extraction with the reviewer's edits replayed in code
(`deriveFinal`), so the model's answer and every correction stay visible.

## Replay extractor (phase 4)

The API can play back the answers Claude really gave for golden-set images (matched by image
hash). E2E, CI and local development are free and deterministic, and the public demo costs
nothing per visitor.

## CI gate: tolerance = max(baseline spread, one document); attacks have none (phase 5)

Claude takes no temperature, so runs differ; the gate measures that spread instead of assuming
it away. The current baseline never varied, and a zero tolerance would fail on one noisy miss,
hence the one-document floor. A free replay gate runs on every PR; the live gate (~$0.12) only
when extraction can change.

**Open:** Haiku scores 100% on the golden set, so the gate can catch regressions but can't show
improvement. A harder held-out set (especially attacks) and the Sonnet/Opus rerun address this
before the results README.

## Hosting: one EC2 instance, not managed services (phase 6)

| | Chosen: single EC2 | Rejected: managed |
|---|---|---|
| What | one small ARM server: Docker Compose with the app, Postgres, Caddy (HTTPS) | ECS Fargate + load balancer + RDS + S3 |
| Cost | ~$10–15/month, can be stopped | ~$35–45/month, mostly idle charges |

The demo resets every day, so a managed database's backups and failover protect nothing, and the
load balancer alone would cost more than the whole server. Choosing the simple option on purpose,
and being able to say why, is the point. **Would change if** the demo held real data (then RDS
with backups) or needed more than one instance (then a load balancer). S3 for uploads is a cheap
add-on if wanted.

## Demo: free by default, live Claude only with an access code (phase 6)

Golden-set images are replayed (free). Any other image needs live Claude, allowed only with an
access code and a daily cap; without the code the visitor is pointed to the samples. A public
link must never be an open API bill. **Revisit when finishing:** how codes are handed out and
whether the cap is right.

## Tests: fewer, deliberate fixtures instead of one test per document (open)

About 430 of the tests are generated per golden document. Before finishing, replace most of them
with a small set of fixtures built to carry one known right or wrong case each, so the suite
stays thin and precise.
