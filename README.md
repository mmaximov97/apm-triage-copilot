# APM Triage Copilot

Take-home submission for the Unlimit Technical Operations (APM) role. A replay
harness that runs a stream of Alternative Payment Methods operational signals
through a three-layer pipeline — deterministic detection, AI-assisted
reasoning, and gated automated action — and produces incident cards, an
append-only audit log, and a scored eval report.

Written submission (problem framing, use cases, agent design, automation
design, known limitations): [`docs/2026-08-20-unlimit-submission.md`](docs/2026-08-20-unlimit-submission.md).
Design rationale for this repo: [`docs/2026-08-18-apm-triage-copilot-design.md`](docs/2026-08-18-apm-triage-copilot-design.md).

## Quickstart

Requires Node 24+.

```bash
npm ci
npm test            # 74/74
npm run typecheck    # clean
npm run demo         # runs all 8 fixture scenarios, prints an incident card per scenario
npm run eval         # same 8 scenarios, scored against labelled expectations + a markdown report
```

`npm run demo` and `npm run eval` run in **mock mode by default and need no
API key** — every model call is replayed from a recorded cassette in
`fixtures/cassettes/`, so a fresh clone runs the real pipeline logic without
hitting the Anthropic API or costing anything.

To re-record the cassettes against the live API (only needed if you change a
prompt or add a scenario):

```bash
cp .env.example .env   # add your own ANTHROPIC_API_KEY
npm run record
```

## Architecture

Three layers, wired in [`src/pipeline.ts`](src/pipeline.ts):

- **Detect** (`src/detect/`) — pure code, zero model calls. Volume /
  absolute-drop / relative-drop / statistical-significance gates decide
  whether a metric window is a real anomaly; a dedup/suppression window
  attaches a still-failing incident's later windows instead of re-paging.
- **Reason** (`src/reason/`) — Haiku 4.5 classifies every confirmed signal
  into category, severity, and confidence; Opus 5 writes a cited narrative,
  but only for outcomes that reach P1 or P2. Guardrails in
  [`src/reason/guardrails.ts`](src/reason/guardrails.ts): a confidence floor
  that abstains to a human queue, a rule-layer hard-breach fuse the model
  can't talk a severity below P1 (except an announced maintenance window,
  capped at P3 by design), and a deterministic scan for prompt-injection
  attempts in evidence text.
- **Act** (`src/act/`) — deterministic owner routing and a reversible vs.
  irreversible action split; irreversible actions (`notify_merchant`,
  `escalate_p1`, `page_oncall`) require approval.

Every step appends an immutable record to `runs/<run_id>/audit.jsonl`
(`src/audit/`): input digest, model/prompt version, usage, cost, latency, and
any overrides that fired.

## Project layout

```
src/
  detect/     rule gates, z-test, dedup/incident registry
  reason/     prompts, classify (Haiku), summarize (Opus), guardrails
  act/        action plan, reversibility/approval, owner routing
  audit/      append-only JSONL log, cost accounting
  eval/       scenario comparison, aggregate metrics, report renderer
  llm/        cassette-backed client (mock / record / live modes)
  pipeline.ts wires the three layers together
fixtures/
  scenarios/  8 labelled test scenarios
  cassettes/  recorded model responses for mock-mode replay
config/       thresholds, owner routing table, pricing, MTTR assumptions
docs/         design doc, implementation plan, the written submission
```

## Eval scenarios

`npm run eval` scores 8 labelled scenarios: a real provider outage, low-volume
noise, an announced maintenance window, benign merchant noise, a slow
degradation that never crosses threshold, a prompt-injection attempt, an
incident with contradictory evidence, and a repeat window of an already-open
incident that must dedup instead of re-paging. All 8 currently match their
expected outcome (severity accuracy 100%); the report also prints real
cost/latency figures replayed from the recorded API calls, and MTTR figures
that are explicitly labelled as modelled, not measured.
