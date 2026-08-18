import path from "node:path";
import { parseArgs } from "node:util";
import type { ApprovalMode } from "./act/approval.js";
import { AuditLog } from "./audit/log.js";
import {
  configDir,
  loadOwners,
  loadPricing,
  loadThresholds,
  projectRoot,
} from "./config.js";
import { LlmClient, type LlmMode } from "./llm/client.js";
import { loadScenarios, runScenario, type IncidentCard } from "./pipeline.js";

const { values } = parseArgs({
  options: {
    scenario: { type: "string" },
    llm: { type: "string", default: "mock" },
    approve: { type: "string", default: "none" },
  },
});

const mode = values.llm as LlmMode;
const approval = values.approve as ApprovalMode;
const root = projectRoot();
const runId = `run_${new Date().toISOString().replace(/[:.]/g, "-")}`;

const audit = new AuditLog({ dir: path.join(root, "runs"), runId });
const deps = {
  llm: new LlmClient({
    mode,
    cassetteDir: path.join(root, "fixtures", "cassettes"),
  }),
  thresholds: loadThresholds(),
  owners: loadOwners(),
  pricing: loadPricing(),
  audit,
  approval,
};

const all = loadScenarios(path.join(root, "fixtures", "scenarios"));
const selected =
  values.scenario === undefined
    ? all
    : all.filter((s) => s.id === values.scenario);

if (selected.length === 0) {
  console.error(
    `No scenario matched "${values.scenario}". Known ids: ${all.map((s) => s.id).join(", ")}`,
  );
  process.exit(1);
}

function render(card: IncidentCard): string {
  const lines: string[] = [];
  const bar = "─".repeat(Math.max(3, 58 - card.scenario_id.length));
  lines.push(`── ${card.scenario_id} ${bar}`);
  lines.push(
    `outcome:   ${card.outcome}`,
  );
  if (card.key !== null) lines.push(`key:       ${card.key}`);
  if (card.owner !== null) {
    lines.push(
      `owner:     ${card.owner.team} ${card.owner.channel}` +
        (card.owner.matched ? "" : "  [no explicit route — default used]"),
    );
  }
  if (card.overrides.length > 0) {
    lines.push(`overrides: ${card.overrides.join(", ")}`);
  }
  if (card.summary !== null) {
    lines.push(`headline:  ${card.summary.headline}`);
    for (const c of card.summary.claims) {
      lines.push(`  · ${c.text}  [${c.evidence_ids.join(", ")}]`);
    }
  }
  if (card.suppressed_repeats > 0) {
    lines.push(
      `dedup:     ${card.suppressed_repeats} repeat window(s) attached to the open incident instead of paging again`,
    );
  }
  if (card.dropped_claims.length > 0) {
    lines.push(
      `dropped:   ${card.dropped_claims.length} uncited claim(s) removed before display`,
    );
  }
  const auto = card.executed.map((a) => a.type).join(", ") || "none";
  const held = card.withheld.map((a) => a.type).join(", ") || "none";
  lines.push(`executed:  ${auto}`);
  lines.push(`withheld:  ${held}`);
  lines.push(
    `cost:      $${card.cost_usd.toFixed(6)}   latency: ${card.latency_ms} ms`,
  );
  return lines.join("\n");
}

let totalCost = 0;
for (const sc of selected) {
  const card = await runScenario(sc, deps);
  totalCost += card.cost_usd;
  console.log(render(card));
  console.log("");
}

console.log(
  `${selected.length} scenario(s), total model cost $${totalCost.toFixed(6)}`,
);
console.log(`audit log: ${audit.path()}`);
console.log(`config:    ${configDir()}`);
