import { describe, expect, it } from "vitest";
import { decideOutcome, enforceEvidence } from "../../src/reason/guardrails.js";
import type { Triage } from "../../src/reason/schemas.js";
import type { Evidence, Signal } from "../../src/types.js";

const evidence: Evidence[] = [
  { id: "ev_01", source: "psp_status", text: "x", observed_at: "2026-08-18T10:05:00Z" },
  { id: "ev_02", source: "ticket", text: "y", observed_at: "2026-08-18T10:06:00Z" },
];

function signal(hardBreach: boolean): Signal {
  return {
    key: "pix:BR:psp_acme",
    window: {
      window_start: "2026-08-18T10:00:00Z",
      window_end: "2026-08-18T10:15:00Z",
      method: "pix",
      country: "BR",
      psp: "psp_acme",
      attempts: 1000,
      successes: 300,
      baseline_success_rate: 0.94,
    },
    rule_trace: [],
    hard_breach: hardBreach,
  };
}

function triage(over: Partial<Triage> = {}): Triage {
  return {
    severity: "P1",
    confidence: 0.9,
    category: "provider_outage",
    supporting_evidence_ids: ["ev_01"],
    reasoning_brief: "b",
    ...over,
  };
}

describe("enforceEvidence", () => {
  it("keeps claims whose ids all exist", () => {
    const r = enforceEvidence([{ text: "a", evidence_ids: ["ev_01"] }], evidence);
    expect(r.kept).toHaveLength(1);
    expect(r.dropped).toHaveLength(0);
  });

  it("drops a claim citing an id that was never supplied", () => {
    const r = enforceEvidence(
      [
        { text: "real", evidence_ids: ["ev_02"] },
        { text: "hallucinated", evidence_ids: ["ev_99"] },
      ],
      evidence,
    );
    expect(r.kept.map((c) => c.text)).toEqual(["real"]);
    expect(r.dropped.map((c) => c.text)).toEqual(["hallucinated"]);
  });

  it("drops a claim if any one of its ids is unknown", () => {
    const r = enforceEvidence(
      [{ text: "mixed", evidence_ids: ["ev_01", "ev_99"] }],
      evidence,
    );
    expect(r.kept).toHaveLength(0);
    expect(r.dropped).toHaveLength(1);
  });

  it("drops everything when the evidence bundle is empty", () => {
    const r = enforceEvidence([{ text: "a", evidence_ids: ["ev_01"] }], []);
    expect(r.kept).toHaveLength(0);
  });
});

describe("decideOutcome", () => {
  it("passes a confident classification through unchanged", () => {
    const r = decideOutcome(triage(), signal(false), 0.6);
    expect(r.outcome).toBe("P1");
    expect(r.overrides).toEqual([]);
  });

  it("abstains when confidence is below the floor", () => {
    const r = decideOutcome(triage({ confidence: 0.4 }), signal(false), 0.6);
    expect(r.outcome).toBe("needs_review");
    expect(r.overrides).toContain("low_confidence_abstain");
  });

  it("rejects a model downgrade to none when the rule layer saw a hard breach", () => {
    const r = decideOutcome(
      triage({ severity: "none", confidence: 0.95 }),
      signal(true),
      0.6,
    );
    expect(r.outcome).toBe("needs_review");
    expect(r.overrides).toContain("model_downgrade_rejected");
  });

  it("accepts none when there was no hard breach", () => {
    const r = decideOutcome(
      triage({ severity: "none", confidence: 0.95 }),
      signal(false),
      0.6,
    );
    expect(r.outcome).toBe("none");
    expect(r.overrides).toEqual([]);
  });

  it("applies the hard-breach fuse even at high model confidence", () => {
    // This is the prompt-injection case: an injected instruction can at best
    // make the model return `none` with high confidence. It still cannot
    // clear a rule-layer hard breach.
    const r = decideOutcome(
      triage({ severity: "none", confidence: 1 }),
      signal(true),
      0.6,
    );
    expect(r.outcome).toBe("needs_review");
  });
});
