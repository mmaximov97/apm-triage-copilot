import type { OwnerTable } from "../config.js";
import type { MetricWindow } from "../types.js";

export type ResolvedOwner = {
  team: string;
  channel: string;
  escalation: string;
  matched: boolean;
};

export function resolveOwner(table: OwnerTable, w: MetricWindow): ResolvedOwner {
  const hit = table.routes.find((r) => r.method === w.method && r.psp === w.psp);
  if (hit !== undefined) {
    return {
      team: hit.team,
      channel: hit.channel,
      escalation: hit.escalation,
      matched: true,
    };
  }
  // A miss is worth surfacing: an unrouted method is an ops gap, not a default.
  return { ...table.default, matched: false };
}
