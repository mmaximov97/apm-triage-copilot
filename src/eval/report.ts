import type { EvalRow, EvalSummary } from "./metrics.js";

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

export function renderReport(rows: EvalRow[], s: EvalSummary): string {
  const out: string[] = [];
  out.push("# APM Triage Copilot — eval report");
  out.push("");
  out.push(
    `Scenarios: ${s.passed}/${s.total} matched their labelled expectation.`,
  );
  out.push("");
  out.push("## Per scenario");
  out.push("");
  out.push("| scenario | expected | actual | result |");
  out.push("|---|---|---|---|");
  for (const r of rows) {
    const status = r.pass ? "pass" : `FAIL — ${r.failures.join("; ")}`;
    out.push(
      `| ${r.scenario_id} | ${r.expected.severity} | ${r.actual.severity} | ${status} |`,
    );
  }
  out.push("");
  out.push("## Detection layer (rules only, no model)");
  out.push("");
  out.push(`- true positives: ${s.detect.true_positives}`);
  out.push(`- false positives: ${s.detect.false_positives}`);
  out.push(`- false negatives: ${s.detect.false_negatives}`);
  out.push(`- precision: ${pct(s.detect.precision)}`);
  out.push(`- recall: ${pct(s.detect.recall)}`);
  out.push(`- repeat windows suppressed instead of re-paging: ${s.suppressed_repeats}`);
  out.push("");
  out.push("## Reasoning layer");
  out.push("");
  out.push(`- severity accuracy on true incidents: ${pct(s.severity_accuracy)}`);
  out.push(
    `- claims carrying a valid evidence id: ${pct(s.citation_coverage)} (enforced in code — a claim without one is dropped before display)`,
  );
  out.push(`- routed to a human instead of acted on: ${pct(s.human_queue_rate)}`);
  out.push("");
  out.push("## Cost and latency");
  out.push("");
  out.push(`- total model cost across the run: $${s.cost.total_usd.toFixed(6)}`);
  out.push(`- cost per incident: $${s.cost.per_incident_usd.toFixed(6)}`);
  out.push(`- median end-to-end model latency: ${s.latency.median_ms} ms`);
  out.push("");
  out.push("Figures come from the usage each call actually reported. In a mock run they");
  out.push("are replayed from the recorded cassette, so they describe a real call rather");
  out.push("than an estimate.");
  out.push("");
  out.push("## Time saved — MODELLED, NOT MEASURED");
  out.push("");
  out.push(
    "The figures below come from `config/mttr-assumptions.yaml`, which encodes estimated manual effort per step. They are a projection, not an observation, and are labelled as such wherever they appear.",
  );
  out.push("");
  out.push(
    `- manual handling, per incident: ${s.mttr.manual_minutes_per_incident} min`,
  );
  out.push(
    `- assisted handling, per incident: ${s.mttr.automated_minutes_per_incident} min`,
  );
  out.push(
    `- projected saving, per incident: ${s.mttr.saved_minutes_per_incident} min`,
  );
  out.push("");
  return out.join("\n");
}
