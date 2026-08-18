import { describe, expect, it } from "vitest";
import { aggregate, compare } from "../../src/eval/metrics.js";
import type { IncidentCard } from "../../src/pipeline.js";
import type { MttrAssumptions } from "../../src/config.js";
import type { Scenario } from "../../src/types.js";

const mttr: MttrAssumptions = {
  manual_minutes: { check_dashboard: 4, validate_signal: 6, collect_evidence: 9, write_summary: 7, find_owner: 3 },
  automated_minutes: { human_review_of_draft: 2 },
};

function scenario(over: Partial<Scenario> = {}): Scenario {
  return {
    id: "s1",
    description: "d",
    metrics: [],
    evidence: [],
    expected: { signal_created: true, severity: "P1", owner: "apm-latam", overrides: [] },
    ...over,
  };
}

function card(over: Partial<IncidentCard> = {}): IncidentCard {
  return {
    scenario_id: "s1",
    key: "pix:BR:psp_acme",
    outcome: "P1",
    owner: { team: "apm-latam", channel: "#apm-latam", escalation: "follow_the_sun", matched: true },
    overrides: [],
    summary: null,
    dropped_claims: [],
    executed: [],
    withheld: [],
    cost_usd: 0.002,
    latency_ms: 5000,
    suppressed_repeats: 0,
    ...over,
  };
}

describe("compare", () => {
  it("passes when everything matches", () => {
    const row = compare(scenario(), card());
    expect(row.pass).toBe(true);
    expect(row.failures).toEqual([]);
  });

  it("reports a severity mismatch", () => {
    const row = compare(scenario(), card({ outcome: "P2" }));
    expect(row.pass).toBe(false);
    expect(row.failures.join(" ")).toMatch(/severity/);
  });

  it("reports a missing expected override", () => {
    const sc = scenario({
      expected: { signal_created: true, severity: "needs_review", owner: "apm-latam", overrides: ["model_downgrade_rejected"] },
    });
    const row = compare(sc, card({ outcome: "needs_review", overrides: [] }));
    expect(row.pass).toBe(false);
    expect(row.failures.join(" ")).toMatch(/model_downgrade_rejected/);
  });

  it("reports a wrong owner", () => {
    const row = compare(
      scenario(),
      card({ owner: { team: "apm-apac", channel: "#apm-apac", escalation: "follow_the_sun", matched: true } }),
    );
    expect(row.pass).toBe(false);
    expect(row.failures.join(" ")).toMatch(/owner/);
  });
});

describe("aggregate", () => {
  it("computes precision and recall of the detection layer", () => {
    const cards = [card({ scenario_id: "a" }), card({ scenario_id: "b", key: null, outcome: "none", owner: null })];
    const rows = [
      compare(scenario({ id: "a" }), cards[0]!),
      compare(
        scenario({ id: "b", expected: { signal_created: false, severity: "none", owner: null, overrides: [] } }),
        cards[1]!,
      ),
    ];
    const s = aggregate(rows, cards, mttr);
    expect(s.detect.true_positives).toBe(1);
    expect(s.detect.false_positives).toBe(0);
    expect(s.detect.precision).toBeCloseTo(1);
    expect(s.detect.recall).toBeCloseTo(1);
  });

  it("labels the mttr figure as modelled", () => {
    const rows = [compare(scenario(), card())];
    const s = aggregate(rows, [card()], mttr);
    expect(s.mttr.modelled).toBe(true);
    expect(s.mttr.manual_minutes_per_incident).toBe(29);
    expect(s.mttr.saved_minutes_per_incident).toBe(27);
  });
});
