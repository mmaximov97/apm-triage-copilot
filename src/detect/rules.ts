import type { Thresholds } from "../config.js";
import type { GateName, MetricWindow, RuleTrace, Signal } from "../types.js";
import { proportionZTest } from "./stats.js";

export type DetectResult = {
  signal: Signal | null;
  rule_trace: RuleTrace[];
  rejected_by: GateName | null;
};

export function incidentKey(w: MetricWindow): string {
  return `${w.method}:${w.country}:${w.psp}`;
}

function round(n: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function detect(w: MetricWindow, t: Thresholds): DetectResult {
  const trace: RuleTrace[] = [];
  const reject = (gate: GateName): DetectResult => ({
    signal: null,
    rule_trace: trace,
    rejected_by: gate,
  });

  // Gate 1: volume. Without it, 3 failures out of 4 overnight reads as a
  // 75% failure rate — the single most common source of false pages.
  const volumePassed = w.attempts >= t.min_attempts;
  trace.push({
    gate: "volume",
    passed: volumePassed,
    observed: { attempts: w.attempts },
    threshold: { min_attempts: t.min_attempts },
  });
  if (!volumePassed) return reject("volume");

  const observed = w.successes / w.attempts;
  const absDrop = w.baseline_success_rate - observed;

  // Gate 2: absolute drop.
  const absPassed = absDrop >= t.abs_drop;
  trace.push({
    gate: "absolute_drop",
    passed: absPassed,
    observed: {
      success_rate: round(observed),
      baseline: w.baseline_success_rate,
      absolute_drop: round(absDrop),
    },
    threshold: { abs_drop: t.abs_drop },
  });
  if (!absPassed) return reject("absolute_drop");

  // Gate 3: relative drop. A method with a 0.55 baseline and one with a
  // 0.98 baseline break differently; requiring both bars keeps either
  // shape from dominating.
  const relDrop =
    w.baseline_success_rate > 0 ? absDrop / w.baseline_success_rate : 0;
  const relPassed = relDrop >= t.rel_drop;
  trace.push({
    gate: "relative_drop",
    passed: relPassed,
    observed: { relative_drop: round(relDrop) },
    threshold: { rel_drop: t.rel_drop },
  });
  if (!relPassed) return reject("relative_drop");

  // Gate 4: significance.
  const z = proportionZTest(w.successes, w.attempts, w.baseline_success_rate);
  const sigPassed = z.pValue < t.p_value;
  trace.push({
    gate: "significance",
    passed: sigPassed,
    observed: { z: round(z.z, 3), p_value: round(z.pValue, 6) },
    threshold: { p_value: t.p_value },
  });
  if (!sigPassed) return reject("significance");

  // hard_breach is not a severity. It is the fuse that Layer 2 cannot clear.
  const hardBreach =
    observed < t.hard_breach_rate && w.attempts >= t.hard_breach_attempts;

  return {
    signal: {
      key: incidentKey(w),
      window: w,
      rule_trace: trace,
      hard_breach: hardBreach,
    },
    rule_trace: trace,
    rejected_by: null,
  };
}
