import type { Claim, Triage } from "./schemas.js";
import type { Evidence, Outcome, Signal } from "../types.js";

/**
 * A claim survives only if every id it cites was actually supplied. This is
 * enforcement, not persuasion: the prompt asks for citations, this drops the
 * claims that lack them.
 */
export function enforceEvidence(
  claims: Claim[],
  evidence: Evidence[],
): { kept: Claim[]; dropped: Claim[] } {
  const known = new Set(evidence.map((e) => e.id));
  const kept: Claim[] = [];
  const dropped: Claim[] = [];
  for (const claim of claims) {
    const ok =
      claim.evidence_ids.length > 0 &&
      claim.evidence_ids.every((id) => known.has(id));
    (ok ? kept : dropped).push(claim);
  }
  return { kept, dropped };
}

/**
 * Turns a model classification into a pipeline outcome.
 *
 * Two rules the model cannot talk its way past:
 *  - below the confidence floor, nothing is decided; a human looks at it.
 *  - a rule-layer hard breach cannot be cleared by any model severity below
 *    P1 — including a straight `none`, which is what contains prompt
 *    injection: injected text can steer the model's output, but the fuse is
 *    evaluated outside the model's reach. The one legitimate exception is
 *    `planned_maintenance`: an announced maintenance window can look exactly
 *    like a hard breach in the raw numbers and is still capped at P3 by
 *    design (see CLASSIFY_SYSTEM), so that category is exempted rather than
 *    forced up to P1.
 */
export function decideOutcome(
  triage: Triage,
  signal: Signal,
  confidenceFloor: number,
): { outcome: Outcome; overrides: string[] } {
  const overrides: string[] = [];

  if (
    signal.hard_breach &&
    triage.category !== "planned_maintenance" &&
    triage.severity !== "P1"
  ) {
    overrides.push("model_downgrade_rejected");
    return { outcome: "needs_review", overrides };
  }

  if (triage.confidence < confidenceFloor) {
    overrides.push("low_confidence_abstain");
    return { outcome: "needs_review", overrides };
  }

  return { outcome: triage.severity, overrides };
}

/**
 * Detects evidence text that carries an instruction aimed at the model
 * itself, rather than information about the incident. `decideOutcome` and
 * the prompt already stop an injection from being obeyed; this makes the
 * attempt itself a visible, structured fact in the audit trail instead of
 * something a human would only notice by reading the model's own prose.
 *
 * A keyword scan, not a model call: the thing being detected is an attempt
 * to manipulate a model, so detecting it can't itself depend on one.
 */
const INJECTION_MARKERS: RegExp[] = [
  /ignore (all |any )?(previous|prior|the above)\s+instructions?/i,
  /disregard (all |any )?(previous|prior|the above)/i,
  /system\s+(note|prompt|instruction)s?\s+for\s+the\s+(ai|model|assistant)/i,
  /this is an authou?rised?\s+override/i,
  /new instructions?:/i,
];

export function scanForInjectionAttempt(evidence: Evidence[]): {
  detected: boolean;
  evidence_ids: string[];
} {
  const hits = evidence.filter((e) =>
    INJECTION_MARKERS.some((marker) => marker.test(e.text)),
  );
  return { detected: hits.length > 0, evidence_ids: hits.map((e) => e.id) };
}
