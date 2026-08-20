# AI in APM Operations — Take-Home Submission

**Mikhail Maximov — Technical Operations, Alternative Payment Methods**
**Repository:** `apm-triage-copilot` (private, link below) — 74/74 tests, typecheck clean, 8/8 labelled scenarios pass in `npm run eval`.

---

## 1. Problem framing

> **[ВАШ ГОЛОС — проверьте и при желании перепишите этот раздел; особенно абзац про FinOps.]**

Today the APM team's incident handling is a manual pipeline: watch dashboards, notice a drop, open provider status pages and tickets, decide whether the signal is real, collect corroborating evidence from several systems, write up impact, find the right owner, escalate, follow through to resolution. Every step after "notice a drop" is slow mostly because it's serial and manual, not because it's hard.

Splitting the pipeline by what actually needs a model:

- **Deterministic rules, no model at all** — deciding *whether an anomaly is statistically real* (volume, absolute/relative drop, significance) is arithmetic. Asking an LLM to eyeball a metrics graph and guess would be slower, more expensive, and no more reliable than a threshold and a z-test. This is exactly the part of the assignment brief that "AI everywhere" gets wrong.
- **AI reasoning** — once a real anomaly is confirmed, the remaining work is *interpreting unstructured text* (provider status pages, ticket bodies, Slack messages, merchant reports) against it: what caused this, how bad is it, who owns it. That's language understanding, not arithmetic — this is where a model earns its cost.
- **Stays with a human, always** — anything that leaves the system and reaches a real person: notifying a merchant, paging on-call, publicly escalating a P1. And anything the system itself isn't confident about, or where the evidence itself looks tampered with.

Risks I designed against rather than just listed: operational evidence is written by third parties (merchants, ticket reporters) and has to be treated as untrusted input, not instructions — a support ticket is exactly the kind of text a bad actor (or a confused merchant copy-pasting something odd) can use to try to steer an automated system. A narrative summary can cite a claim that isn't actually in the evidence. And a model can quietly under- or over-call severity with nothing catching the drift — I found and fixed two real instances of this while building the demo (§5).

One pattern I already run in production, at smaller scale: an agent on one of my own projects (FinOps) takes client bug reports and feature requests in natural language and either fixes them directly or escalates for a human decision — via a pull request that a person reviews and approves before it merges. That's human-in-the-loop through an existing control (code review), not a bespoke approval UI, and it's the same shape as the approval gate in §3 below.

---

## 2. Three AI use cases

> **[ВАШ ГОЛОС — это кандидаты, не финал. №1 уже реализован и проверен в этом репозитории; №2 и №3 — правдоподобные, но придуманные мной сценарии. Если у вас есть более сильный реальный пример из практики — он побьёт любой из придуманных. Замените смело.]**

| # | Use case | Input | AI action | Output | User | Operational value |
|---|---|---|---|---|---|---|
| 1 | **Incident triage & severity classification** (built — §3–5) | Confirmed anomalous metric window + evidence bundle (PSP status, tickets, merchant reports) | Classify cause category, severity, confidence; write a cited narrative for anything acted on | Incident card with owner, severity, evidence-linked claims, full audit trail | On-call APM engineer | Replaces "read 4 dashboards + 3 tickets, then decide" with synthesis in seconds. The rules layer alone already gets 100% precision/recall on detecting *that* something is wrong (see eval report) — the model's whole job is explaining *what* and *how bad*, not detecting the anomaly. |
| 2 | **Runbook Q&A during an active incident** | On-call engineer's natural-language question ("has psp_acme failed like this before? what's the standard mitigation?") + the incident's own audit trail + runbook docs | Retrieve relevant past incidents and runbook sections; answer grounded only in what was retrieved, with citations | Answer + source links, logged against the incident | On-call engineer, mid-incident | Cuts the "search Slack history / page a teammate" step that costs the most exactly when minutes matter most. Grounding + mandatory citation is the guardrail against the model inventing a "standard mitigation" that was never actually documented. |
| 3 | **Merchant complaint clustering & pre-triage** | Raw stream of merchant support tickets — higher volume and noisier than status-page-confirmed signals | Cluster semantically similar complaints; flag clusters that correlate in time, method, and country with a live or recent incident; draft (not send) a merchant-facing status update | Ranked cluster list + draft communication for human review | Support/ops triage (not necessarily an engineer) | A spike of 40 differently-worded complaints today reads as 40 unrelated tickets until someone reads all of them. Clustering turns that into "these 12 are the same PIX outage, here's a draft reply" — but drafting merchant-facing text is exactly the external, hard-to-reverse action that has to stay behind a human send button, same principle as `notify_merchant` in §3. |

---

## 3. Agent design — APM Triage Copilot

The one agent built and running in the attached repository.

| Field | Design |
|---|---|
| **Trigger** | A metric window closes and passes all four rule-layer gates (volume, absolute drop, relative drop, statistical significance) — not a schedule, and not "classify everything that moves." |
| **Data inputs** | The metric window (attempts, successes, baseline success rate) and an evidence bundle (PSP status pages, tickets, Slack, merchant reports). Evidence is explicitly framed in the prompt as untrusted third-party text, never as instructions. |
| **Decision logic** | Three layers. **Detect** (pure code, zero model calls): statistical gates + a dedup/suppression window so a still-failing incident doesn't re-page every window. **Reason**: Haiku 4.5 classifies category, severity, and confidence on every confirmed signal; Opus 5 writes a cited narrative, but only when the outcome is P1 or P2 — the expensive call is spent only where a human will actually read prose. **Act**: a deterministic owner-routing table, never the model's own suggestion (the model's routing guess is recorded and compared against it, not used). |
| **Actions** | `create_incident_draft`, `attach_evidence`, `tag` — reversible, always execute. `notify_merchant`, `escalate_p1`, `page_oncall` — irreversible, because they reach a real person, and require approval. |
| **Human approval points** | Every irreversible action. Every `needs_review` outcome — triggered by low model confidence, by a rule-confirmed hard breach the model tried to under-call, or by a detected prompt-injection attempt — is queued for a human instead of acted on. |
| **Guardrails** | (a) Evidence framed as data, not instructions, in the prompt. (b) A rule-layer *hard-breach fuse*: once Detect confirms a severe, high-volume failure, the model cannot clear it below P1 — with one deliberate exception, an announced maintenance window, which is capped at P3 by design even though it looks identical to an outage in the raw numbers. (c) A deterministic keyword scan for injection attempts in evidence text, independent of the model, that flags it in the audit log and forces human review regardless of what the model itself returned. (d) Every claim in the narrative must cite a real evidence id or it's dropped before a human sees it. (e) A confidence floor below which the pipeline abstains instead of guessing. |
| **Auditability** | Every step — detect, classify, summarize, route, act — appends an immutable JSONL record: input digest, model and prompt version, token usage, cost, latency, and any overrides that fired. Any incident card traces back to exactly which rule or model call produced it and what a human approved. |

**Two of these guardrails caught real bugs, not hypothetical ones.** While building the eval harness, the hard-breach fuse turned out to only block a model `none` — a genuine, ongoing outage classified P2 by the model still passed through untouched. And an injected instruction inside a support ticket was correctly ignored by the model, but the attempt itself left no trace anywhere except the model's own free-text summary — a human skimming outcomes would never see it. Both are now fixed (generalized hard-breach floor with an explicit `planned_maintenance` exemption; a structural `injection_detected` audit flag) and covered by tests. Full write-up in §Known limitations and in the repo's commit history.

---

## 4. Automation design

**Rules-based, deterministic, ~$0 marginal cost — no model involved:**
volume / absolute-drop / relative-drop / significance gating · dedup and suppression window · owner routing table · reversible-vs-irreversible action split · the hard-breach severity floor · the injection-attempt scan.

**AI-assisted, paid, latency-bearing — used only where text needs interpreting:**
Haiku classifies every confirmed signal into category + severity + confidence (cheap, runs every time). Opus writes a human-facing narrative, gated to P1/P2 only (expensive, runs only where a human is about to read it).

**End to end:** window closes → Detect (rules) → dedup check → Reason (Haiku, then conditionally Opus) → Act (routing + approval gate) → an audit record at every step.

No step is "AI everywhere." The demo's own numbers make the split concrete: the rules layer alone reaches 100% precision and 100% recall on *whether* something is wrong, across all 8 test scenarios — the model is never asked to do that job, only to interpret evidence once the rules have already confirmed there's something to interpret.

---

## 5. Practical demo

Working code, not a mockup or pseudo-implementation — TypeScript/Node 24, `@anthropic-ai/sdk` + Zod + Vitest.

```
npm test        # 74/74 passing
npm run typecheck   # clean
npm run eval        # 8/8 labelled scenarios match expectation, severity accuracy 100%
```

8 labelled fixture scenarios: a real outage, low-volume noise, announced maintenance, benign merchant noise, slow degradation, a prompt-injection attempt, an incident with contradictory/broken evidence, and a repeat window of an already-open incident that must dedup instead of re-paging.

Cost and latency in the eval report are real numbers replayed from actual Anthropic API calls, not estimates: **$0.042 total for the 8-scenario run, ≈$0.0085 per incident, 3.1s median end-to-end model latency.** The MTTR figures in the same report (27 min projected saving per incident) are explicitly labelled as modelled, not measured, because I don't have real handling-time data for this team — see Known limitations.

Repository: `<link>`
Loom walkthrough (optional, ≤5 min): `<link>`

---

## Known limitations — what was cut

- No real integrations (Slack, Jira, PagerDuty, provider status pages) — interfaces with in-memory implementations stand in for them.
- No UI. Output is the terminal and files.
- Baseline success rate is supplied as input, not computed from historical data.
- Single-tenant, no auth, no persistence beyond the files a run writes.
- A working feedback loop is designed (see Bonus, below) but not implemented.
- **Classify and summarize are two independent model calls with nothing reconciling them.** Confirmed empirically, not just in theory: Haiku's real classification confidence (0.85, 0.92 on two different incidents) differed from Opus's own narrated confidence for the same incidents ("0.7", "0.88") — the same event, two different numbers, and nothing today would stop a human from reading only the narrative and trusting its number. Not fixed in this submission; flagged as the next thing I'd tackle before letting this handle real severity decisions unsupervised.
- The hard-breach fix needed an explicit `planned_maintenance` exemption, found only by checking every fixture's actual numbers against the code rather than assuming — a sign that any *new* category added later needs the same scrutiny, not just the ones covered by today's 8 scenarios.

---

## Bonus points touched

- **Confidence scoring** is load-bearing, not decorative — it directly drives the abstain guardrail (§3).
- **Cost/latency trade-offs** are a real, working two-model split: Haiku for cheap, every-signal classification; Opus reserved for narrative generation on P1/P2 only. Real numbers in §5.
- **Feedback loop (designed, not built):** the eval harness already grades severity accuracy against 8 labelled fixtures. The natural extension is closing the loop on real traffic — every human override of a `needs_review` outcome, or every escalation of something the model called P3, becomes a new labelled example, and the same eval check that caught this submission's two guardrail bugs runs continuously against the growing set to catch prompt or threshold drift.
- **KPI framework (designed, not measured on real data):** MTTR proxy (manual vs. assisted handling minutes — currently modelled in `config/mttr-assumptions.yaml`), the human-queue rate (how often the system correctly hands off instead of acting), and a guardrail-fire rate over time — a rising rate of hard-breach or injection triggers is itself a signal worth watching, whether that means more real incidents or the model drifting.
