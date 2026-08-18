import type { MttrAssumptions } from "../config.js";
import type { IncidentCard } from "../pipeline.js";
import type { Expected, Outcome, Scenario } from "../types.js";

export type EvalRow = {
  scenario_id: string;
  expected: Expected;
  actual: {
    signal_created: boolean;
    severity: Outcome;
    owner: string | null;
    overrides: string[];
  };
  pass: boolean;
  failures: string[];
};

export function compare(sc: Scenario, card: IncidentCard): EvalRow {
  const actual = {
    signal_created: card.key !== null,
    severity: card.outcome,
    owner: card.owner?.team ?? null,
    overrides: card.overrides,
  };
  const failures: string[] = [];

  if (actual.signal_created !== sc.expected.signal_created) {
    failures.push(
      `signal_created: expected ${sc.expected.signal_created}, got ${actual.signal_created}`,
    );
  }
  if (actual.severity !== sc.expected.severity) {
    failures.push(
      `severity: expected ${sc.expected.severity}, got ${actual.severity}`,
    );
  }
  if (sc.expected.owner !== null && actual.owner !== sc.expected.owner) {
    failures.push(`owner: expected ${sc.expected.owner}, got ${actual.owner}`);
  }
  for (const o of sc.expected.overrides) {
    if (!actual.overrides.includes(o)) {
      failures.push(`override missing: ${o}`);
    }
  }

  return {
    scenario_id: sc.id,
    expected: sc.expected,
    actual,
    pass: failures.length === 0,
    failures,
  };
}

export type EvalSummary = {
  total: number;
  passed: number;
  detect: {
    true_positives: number;
    false_positives: number;
    false_negatives: number;
    precision: number;
    recall: number;
  };
  severity_accuracy: number;
  human_queue_rate: number;
  citation_coverage: number;
  suppressed_repeats: number;
  cost: { total_usd: number; per_incident_usd: number };
  latency: { median_ms: number };
  mttr: {
    modelled: true;
    manual_minutes_per_incident: number;
    automated_minutes_per_incident: number;
    saved_minutes_per_incident: number;
  };
};

export function aggregate(
  rows: EvalRow[],
  cards: IncidentCard[],
  mttr: MttrAssumptions,
): EvalSummary {
  const tp = rows.filter(
    (r) => r.expected.signal_created && r.actual.signal_created,
  ).length;
  const fp = rows.filter(
    (r) => !r.expected.signal_created && r.actual.signal_created,
  ).length;
  const fn = rows.filter(
    (r) => r.expected.signal_created && !r.actual.signal_created,
  ).length;

  const withSignal = rows.filter(
    (r) => r.expected.signal_created && r.actual.signal_created,
  );
  const severityHits = withSignal.filter(
    (r) => r.actual.severity === r.expected.severity,
  ).length;

  const queued = cards.filter((c) => c.outcome === "needs_review").length;

  const allClaims = cards.flatMap((c) => c.summary?.claims ?? []);
  const citedClaims = allClaims.filter((c) => c.evidence_ids.length > 0).length;

  const totalCost = cards.reduce((a, c) => a + c.cost_usd, 0);
  const incidents = cards.filter((c) => c.key !== null).length;

  const latencies = cards
    .filter((c) => c.latency_ms > 0)
    .map((c) => c.latency_ms)
    .sort((a, b) => a - b);
  const median =
    latencies.length === 0 ? 0 : latencies[Math.floor(latencies.length / 2)]!;

  const manual = Object.values(mttr.manual_minutes).reduce((a, b) => a + b, 0);
  const automated = Object.values(mttr.automated_minutes).reduce(
    (a, b) => a + b,
    0,
  );

  return {
    total: rows.length,
    passed: rows.filter((r) => r.pass).length,
    detect: {
      true_positives: tp,
      false_positives: fp,
      false_negatives: fn,
      precision: tp + fp === 0 ? 1 : tp / (tp + fp),
      recall: tp + fn === 0 ? 1 : tp / (tp + fn),
    },
    severity_accuracy:
      withSignal.length === 0 ? 1 : severityHits / withSignal.length,
    human_queue_rate: cards.length === 0 ? 0 : queued / cards.length,
    citation_coverage: allClaims.length === 0 ? 1 : citedClaims / allClaims.length,
    suppressed_repeats: cards.reduce((a, c) => a + c.suppressed_repeats, 0),
    cost: {
      total_usd: totalCost,
      per_incident_usd: incidents === 0 ? 0 : totalCost / incidents,
    },
    latency: { median_ms: median },
    mttr: {
      modelled: true,
      manual_minutes_per_incident: manual,
      automated_minutes_per_incident: automated,
      saved_minutes_per_incident: manual - automated,
    },
  };
}
