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
 *  - a rule-layer hard breach cannot be cleared by a model `none`. This is
 *    what contains prompt injection: injected text can steer the model's
 *    output, but the fuse is evaluated outside the model's reach.
 */
export function decideOutcome(
  triage: Triage,
  signal: Signal,
  confidenceFloor: number,
): { outcome: Outcome; overrides: string[] } {
  const overrides: string[] = [];

  if (signal.hard_breach && triage.severity === "none") {
    overrides.push("model_downgrade_rejected");
    return { outcome: "needs_review", overrides };
  }

  if (triage.confidence < confidenceFloor) {
    overrides.push("low_confidence_abstain");
    return { outcome: "needs_review", overrides };
  }

  return { outcome: triage.severity, overrides };
}
