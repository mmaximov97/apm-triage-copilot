import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Action } from "./act/actions.js";
import { buildActionPlan } from "./act/actions.js";
import { applyApproval, type ApprovalMode } from "./act/approval.js";
import { resolveOwner, type ResolvedOwner } from "./act/routing.js";
import { costOf } from "./audit/cost.js";
import type { AuditLog } from "./audit/log.js";
import type { OwnerTable, PricingTable, Thresholds } from "./config.js";
import type { IncidentRegistry } from "./detect/dedup.js";
import { detect } from "./detect/rules.js";
import { digest } from "./llm/cassette.js";
import type { LlmClient } from "./llm/client.js";
import { classify, CLASSIFY_MODEL } from "./reason/classify.js";
import { decideOutcome } from "./reason/guardrails.js";
import {
  CLASSIFY_PROMPT_VERSION,
  SUMMARIZE_PROMPT_VERSION,
} from "./reason/prompts.js";
import type { Claim, Summary } from "./reason/schemas.js";
import { summarize, SUMMARIZE_MODEL } from "./reason/summarize.js";
import type { Outcome, Scenario, Signal } from "./types.js";

export type { ApprovalMode };

export type PipelineDeps = {
  llm: LlmClient;
  thresholds: Thresholds;
  owners: OwnerTable;
  pricing: PricingTable;
  audit: AuditLog;
  registry: IncidentRegistry;
  approval: ApprovalMode;
};

export type IncidentCard = {
  scenario_id: string;
  key: string | null;
  outcome: Outcome;
  owner: ResolvedOwner | null;
  overrides: string[];
  summary: Summary | null;
  dropped_claims: Claim[];
  executed: Action[];
  withheld: Action[];
  cost_usd: number;
  latency_ms: number;
  suppressed: boolean;
};

export function loadScenarios(dir: string): Scenario[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Scenario);
}

export async function runScenario(
  sc: Scenario,
  deps: PipelineDeps,
): Promise<IncidentCard> {
  const empty: IncidentCard = {
    scenario_id: sc.id,
    key: null,
    outcome: "none",
    owner: null,
    overrides: [],
    summary: null,
    dropped_claims: [],
    executed: [],
    withheld: [],
    cost_usd: 0,
    latency_ms: 0,
    suppressed: false,
  };

  // Layer 1 — no model involved.
  let signal: Signal | null = null;
  for (const window of sc.metrics) {
    const result = detect(window, deps.thresholds);
    deps.audit.append({
      scenario_id: sc.id,
      step: "detect",
      rule_trace: result.rule_trace,
      input_digest: digest(window),
      output: {
        signal_raised: result.signal !== null,
        rejected_by: result.rejected_by,
      },
    });
    if (result.signal !== null) {
      signal = result.signal;
      break;
    }
  }
  if (signal === null) return empty;

  const dedup = deps.registry.check(
    signal.key,
    signal.window.window_end,
    deps.thresholds.suppression_minutes,
  );
  deps.audit.append({
    scenario_id: sc.id,
    step: "detect",
    rule_trace: [dedup.trace],
    input_digest: digest({ key: signal.key }),
    output: { suppressed: dedup.suppressed, attach_to: dedup.attach_to },
  });
  if (dedup.suppressed) {
    return { ...empty, key: signal.key, suppressed: true };
  }

  const incidentId = `inc_${digest(signal.key + signal.window.window_start).slice(0, 8)}`;
  deps.registry.register(signal.key, signal.window.window_end, incidentId);

  // Layer 2 — call A.
  let cost = 0;
  let latency = 0;
  const classified = await classify(deps.llm, signal, sc.evidence);
  const classifyCost = costOf(CLASSIFY_MODEL, classified.usage, deps.pricing);
  cost += classifyCost;
  latency += classified.latency_ms;
  const decision = decideOutcome(
    classified.triage,
    signal,
    deps.thresholds.confidence_floor,
  );
  deps.audit.append({
    scenario_id: sc.id,
    step: "classify",
    model: CLASSIFY_MODEL,
    prompt_version: CLASSIFY_PROMPT_VERSION,
    input_digest: digest({ signal, evidence: sc.evidence }),
    output: { triage: classified.triage, outcome: decision.outcome },
    overrides: decision.overrides,
    usage: classified.usage,
    latency_ms: classified.latency_ms,
    cost_usd: classifyCost,
  });

  let outcome = decision.outcome;
  const overrides = [...decision.overrides];

  // Layer 2 — call B, only where the expensive model earns its price.
  let summary: Summary | null = null;
  let dropped: Claim[] = [];
  if (outcome === "P1" || outcome === "P2") {
    const s = await summarize(deps.llm, signal, sc.evidence);
    const summaryCost = costOf(SUMMARIZE_MODEL, s.usage, deps.pricing);
    cost += summaryCost;
    latency += s.latency_ms;
    dropped = s.dropped;
    if (s.dropped.length > 0) overrides.push("dropped_claims");
    if (s.usable) {
      summary = s.summary;
    } else {
      overrides.push("no_citable_evidence");
      outcome = "needs_review";
    }
    deps.audit.append({
      scenario_id: sc.id,
      step: "summarize",
      model: SUMMARIZE_MODEL,
      prompt_version: SUMMARIZE_PROMPT_VERSION,
      input_digest: digest({ signal, evidence: sc.evidence }),
      output: { summary: s.summary, dropped_claims: s.dropped, usable: s.usable },
      overrides,
      usage: s.usage,
      latency_ms: s.latency_ms,
      cost_usd: summaryCost,
    });
  }

  // Layer 3 — routing is a table lookup, never the model's suggestion.
  const owner = resolveOwner(deps.owners, signal.window);
  deps.audit.append({
    scenario_id: sc.id,
    step: "route",
    input_digest: digest(signal.window),
    output: {
      owner,
      model_recommended_owner: summary?.recommended_owner ?? null,
      agrees: summary === null ? null : summary.recommended_owner === owner.team,
    },
  });
  if (!owner.matched) overrides.push("owner_route_missing");

  const plan = buildActionPlan(outcome, {
    incidentId,
    owner: owner.team,
    evidenceIds: sc.evidence.map((e) => e.id),
  });
  const approvals = applyApproval(plan, deps.approval, "demo-operator");
  deps.audit.append({
    scenario_id: sc.id,
    step: "act",
    input_digest: digest({ incidentId, outcome }),
    output: {
      executed: approvals.executed.map((a) => a.type),
      withheld: approvals.withheld.map((a) => a.type),
    },
    overrides,
    approver: approvals.approver ?? undefined,
  });

  return {
    scenario_id: sc.id,
    key: signal.key,
    outcome,
    owner,
    overrides,
    summary,
    dropped_claims: dropped,
    executed: approvals.executed,
    withheld: approvals.withheld,
    cost_usd: cost,
    latency_ms: latency,
    suppressed: false,
  };
}
