import { writeFileSync } from "node:fs";
import path from "node:path";
import { AuditLog } from "../audit/log.js";
import {
  loadMttrAssumptions,
  loadOwners,
  loadPricing,
  loadThresholds,
  projectRoot,
} from "../config.js";
import { LlmClient } from "../llm/client.js";
import { loadScenarios, runScenario, type IncidentCard } from "../pipeline.js";
import { aggregate, compare, type EvalRow } from "./metrics.js";
import { renderReport } from "./report.js";

const root = projectRoot();
const runId = `eval_${new Date().toISOString().replace(/[:.]/g, "-")}`;
const audit = new AuditLog({ dir: path.join(root, "runs"), runId });

const deps = {
  llm: new LlmClient({
    mode: "mock" as const,
    cassetteDir: path.join(root, "fixtures", "cassettes"),
  }),
  thresholds: loadThresholds(),
  owners: loadOwners(),
  pricing: loadPricing(),
  audit,
  approval: "none" as const,
};

const scenarios = loadScenarios(path.join(root, "fixtures", "scenarios"));
const rows: EvalRow[] = [];
const cards: IncidentCard[] = [];

for (const sc of scenarios) {
  const card = await runScenario(sc, deps);
  cards.push(card);
  rows.push(compare(sc, card));
}

const summary = aggregate(rows, cards, loadMttrAssumptions());
const report = renderReport(rows, summary);

const reportPath = path.join(path.dirname(audit.path()), "eval-report.md");
writeFileSync(reportPath, report, "utf8");

console.log(report);
console.log(`report written to ${reportPath}`);

if (summary.passed !== summary.total) process.exit(1);
