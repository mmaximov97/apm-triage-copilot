import type { Outcome } from "../types.js";

export type ActionType =
  | "create_incident_draft"
  | "attach_evidence"
  | "tag"
  | "notify_merchant"
  | "escalate_p1"
  | "page_oncall";

export type Action = {
  type: ActionType;
  payload: Record<string, unknown>;
  requires_approval: boolean;
};

/** Irreversible actions leave the system: they reach merchants or humans. */
const IRREVERSIBLE: ReadonlySet<ActionType> = new Set<ActionType>([
  "notify_merchant",
  "escalate_p1",
  "page_oncall",
]);

function action(type: ActionType, payload: Record<string, unknown>): Action {
  return { type, payload, requires_approval: IRREVERSIBLE.has(type) };
}

export function buildActionPlan(
  outcome: Outcome,
  ctx: { incidentId: string; owner: string; evidenceIds: string[] },
): Action[] {
  const reversible: Action[] = [
    action("create_incident_draft", { incident_id: ctx.incidentId, outcome }),
    action("attach_evidence", {
      incident_id: ctx.incidentId,
      evidence_ids: ctx.evidenceIds,
    }),
    action("tag", { incident_id: ctx.incidentId, tags: [outcome, ctx.owner] }),
  ];

  switch (outcome) {
    case "P1":
      return [
        ...reversible,
        action("notify_merchant", { incident_id: ctx.incidentId }),
        action("escalate_p1", { incident_id: ctx.incidentId, owner: ctx.owner }),
        action("page_oncall", { incident_id: ctx.incidentId, owner: ctx.owner }),
      ];
    case "P2":
      return [
        ...reversible,
        action("notify_merchant", { incident_id: ctx.incidentId }),
      ];
    case "P3":
    case "needs_review":
      return reversible;
    case "none":
      // Recorded for the audit trail and for false-positive analysis only.
      return [
        action("create_incident_draft", {
          incident_id: ctx.incidentId,
          outcome,
          closed_as: "false_positive",
        }),
      ];
  }
}
