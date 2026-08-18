import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { costOf } from "../../src/audit/cost.js";
import { AuditLog } from "../../src/audit/log.js";
import type { PricingTable } from "../../src/config.js";

const pricing: PricingTable = {
  cache_read_multiplier: 0.1,
  cache_write_multiplier: 1.25,
  models: {
    "claude-haiku-4-5": { input: 1, output: 5 },
    "claude-opus-5": { input: 5, output: 25 },
  },
};

describe("costOf", () => {
  it("prices plain input and output tokens", () => {
    const c = costOf(
      "claude-haiku-4-5",
      { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      pricing,
    );
    expect(c).toBeCloseTo(6, 6);
  });

  it("prices cache reads at the read multiplier and writes at the write multiplier", () => {
    const c = costOf(
      "claude-opus-5",
      { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 },
      pricing,
    );
    expect(c).toBeCloseTo(6.75, 6);
  });

  it("throws on an unpriced model rather than silently returning zero", () => {
    expect(() =>
      costOf(
        "claude-unknown",
        { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        pricing,
      ),
    ).toThrow(/claude-unknown/);
  });
});

describe("AuditLog", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "audit-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("appends one JSON object per line and stamps run_id and ts", () => {
    const log = new AuditLog({ dir, runId: "run_test" });
    log.append({ scenario_id: "s1", step: "detect", input_digest: "abc", output: { ok: true } });
    log.append({ scenario_id: "s1", step: "classify", input_digest: "def", output: { severity: "P1" } });

    const lines = readFileSync(log.path(), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!);
    expect(first.run_id).toBe("run_test");
    expect(first.step).toBe("detect");
    expect(typeof first.ts).toBe("string");
    expect(log.records()).toHaveLength(2);
  });
});
