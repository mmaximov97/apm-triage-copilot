import type { RuleTrace } from "../types.js";

type OpenIncident = { openedAtMs: number; incidentId: string };

export type DedupCheck = {
  suppressed: boolean;
  attach_to: string | null;
  trace: RuleTrace;
};

export class IncidentRegistry {
  private readonly open = new Map<string, OpenIncident>();

  check(key: string, atIso: string, suppressionMinutes: number): DedupCheck {
    const atMs = Date.parse(atIso);
    const existing = this.open.get(key);
    const minutesSince =
      existing === undefined
        ? null
        : Math.round((atMs - existing.openedAtMs) / 60000);
    const suppressed =
      existing !== undefined &&
      minutesSince !== null &&
      minutesSince < suppressionMinutes;

    return {
      suppressed,
      attach_to: suppressed ? existing!.incidentId : null,
      trace: {
        gate: "dedup",
        passed: !suppressed,
        observed: {
          key,
          minutes_since_open: minutesSince ?? "no_open_incident",
        },
        threshold: { suppression_minutes: suppressionMinutes },
      },
    };
  }

  register(key: string, atIso: string, incidentId: string): void {
    this.open.set(key, { openedAtMs: Date.parse(atIso), incidentId });
  }
}
