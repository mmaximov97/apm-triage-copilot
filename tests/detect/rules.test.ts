import { describe, expect, it } from "vitest";
import { detect, incidentKey } from "../../src/detect/rules.js";
import type { Thresholds } from "../../src/config.js";
import type { MetricWindow } from "../../src/types.js";

const T: Thresholds = {
  min_attempts: 50,
  abs_drop: 0.15,
  rel_drop: 0.25,
  p_value: 0.01,
  hard_breach_rate: 0.5,
  hard_breach_attempts: 200,
  suppression_minutes: 30,
  confidence_floor: 0.6,
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

describe("incidentKey", () => {
  it("keys on method, country and psp", () => {
    expect(incidentKey(win())).toBe("pix:BR:psp_acme");
  });
});

describe("detect", () => {
  it("raises a signal on a real outage", () => {
    const r = detect(win(), T);
    expect(r.signal).not.toBeNull();
    expect(r.rejected_by).toBeNull();
    expect(r.signal!.hard_breach).toBe(true);
  });

  it("rejects low volume before touching any other gate", () => {
    const r = detect(win({ attempts: 4, successes: 1 }), T);
    expect(r.signal).toBeNull();
    expect(r.rejected_by).toBe("volume");
    expect(r.rule_trace).toHaveLength(1);
    expect(r.rule_trace[0]!.observed.attempts).toBe(4);
    expect(r.rule_trace[0]!.threshold.min_attempts).toBe(50);
  });

  it("rejects a drop that is large in relative terms but small in absolute", () => {
    const r = detect(
      win({ attempts: 1000, successes: 70, baseline_success_rate: 0.1 }),
      T,
    );
    expect(r.signal).toBeNull();
    expect(r.rejected_by).toBe("absolute_drop");
  });

  it("rejects a drop that is large in absolute terms but small in relative", () => {
    const r = detect(
      win({ attempts: 1000, successes: 800, baseline_success_rate: 0.98 }),
      T,
    );
    expect(r.signal).toBeNull();
    expect(r.rejected_by).toBe("relative_drop");
  });

  it("rejects a drop that clears both thresholds but is not significant", () => {
    // 18/52 against a 0.5 baseline: a 15.4pp absolute and 31% relative drop,
    // but at this volume the one-sided p-value is ~0.013 — above the 0.01 bar.
    const r = detect(
      win({ attempts: 52, successes: 18, baseline_success_rate: 0.5 }),
      T,
    );
    expect(r.rejected_by).toBe("significance");
    expect(r.rule_trace.at(-1)!.gate).toBe("significance");
  });

  it("marks hard_breach only above both the rate and the volume bar", () => {
    const belowVolume = detect(
      win({ attempts: 120, successes: 24, baseline_success_rate: 0.94 }),
      T,
    );
    expect(belowVolume.signal!.hard_breach).toBe(false);

    const aboveBoth = detect(
      win({ attempts: 400, successes: 80, baseline_success_rate: 0.94 }),
      T,
    );
    expect(aboveBoth.signal!.hard_breach).toBe(true);
  });

  it("records every evaluated gate in order", () => {
    const r = detect(win(), T);
    expect(r.rule_trace.map((g) => g.gate)).toEqual([
      "volume",
      "absolute_drop",
      "relative_drop",
      "significance",
    ]);
    expect(r.rule_trace.every((g) => g.passed)).toBe(true);
  });
});
