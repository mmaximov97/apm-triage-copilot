import { describe, expect, it } from "vitest";
import { resolveOwner } from "../../src/act/routing.js";
import { buildActionPlan } from "../../src/act/actions.js";
import { applyApproval } from "../../src/act/approval.js";
import type { OwnerTable } from "../../src/config.js";
import type { MetricWindow } from "../../src/types.js";

const table: OwnerTable = {
  default: { team: "apm-techops", channel: "#apm-ops", escalation: "business_hours" },
  routes: [
    { method: "pix", psp: "psp_acme", team: "apm-latam", channel: "#apm-latam", escalation: "follow_the_sun" },
  ],
};

function win(over: Partial<MetricWindow> = {}): MetricWindow {
  return {
    window_start: "2026-08-18T10:00:00Z",
    window_end: "2026-08-18T10:15:00Z",
    method: "pix",
    country: "BR",
    psp: "psp_acme",
    attempts: 1000,
    successes: 300,
    baseline_success_rate: 0.94,
    ...over,
  };
}

const ctx = { incidentId: "inc_001", owner: "apm-latam", evidenceIds: ["ev_01"] };

describe("resolveOwner", () => {
  it("matches a configured route", () => {
    const o = resolveOwner(table, win());
    expect(o.team).toBe("apm-latam");
    expect(o.matched).toBe(true);
  });

  it("falls back to the default route and says so", () => {
    const o = resolveOwner(table, win({ method: "ideal", psp: "psp_lowlands" }));
    expect(o.team).toBe("apm-techops");
    expect(o.matched).toBe(false);
  });
});

describe("buildActionPlan", () => {
  it("gates irreversible actions for P1", () => {
    const plan = buildActionPlan("P1", ctx);
    const gated = plan.filter((a) => a.requires_approval).map((a) => a.type);
    expect(gated).toContain("escalate_p1");
    expect(gated).toContain("page_oncall");
    const auto = plan.filter((a) => !a.requires_approval).map((a) => a.type);
    expect(auto).toContain("create_incident_draft");
  });

  it("produces only reversible actions for P3", () => {
    const plan = buildActionPlan("P3", ctx);
    expect(plan.every((a) => !a.requires_approval)).toBe(true);
    expect(plan.map((a) => a.type)).not.toContain("escalate_p1");
  });

  it("produces no irreversible actions for needs_review", () => {
    const plan = buildActionPlan("needs_review", ctx);
    expect(plan.every((a) => !a.requires_approval)).toBe(true);
  });

  it("produces nothing actionable for none", () => {
    const plan = buildActionPlan("none", ctx);
    expect(plan.filter((a) => a.requires_approval)).toHaveLength(0);
  });
});

describe("applyApproval", () => {
  it("withholds gated actions when no approval is given", () => {
    const plan = buildActionPlan("P1", ctx);
    const r = applyApproval(plan, "none", "demo");
    expect(r.withheld.length).toBeGreaterThan(0);
    expect(r.executed.every((a) => !a.requires_approval)).toBe(true);
  });

  it("executes gated actions once approved", () => {
    const plan = buildActionPlan("P1", ctx);
    const r = applyApproval(plan, "auto", "demo");
    expect(r.withheld).toHaveLength(0);
    expect(r.executed).toHaveLength(plan.length);
  });

  it("never executes an irreversible action without approval, for any outcome", () => {
    for (const outcome of ["P1", "P2", "P3", "none", "needs_review"] as const) {
      const r = applyApproval(buildActionPlan(outcome, ctx), "none", "demo");
      expect(r.executed.some((a) => a.requires_approval)).toBe(false);
    }
  });
});
