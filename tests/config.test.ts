import { describe, expect, it } from "vitest";
import { loadOwners, loadPricing, loadThresholds } from "../src/config.js";

describe("config loading", () => {
  it("reads layer-1 thresholds from yaml", () => {
    const t = loadThresholds();
    expect(t.min_attempts).toBe(50);
    expect(t.p_value).toBe(0.01);
    expect(t.confidence_floor).toBe(0.6);
  });

  it("reads the owner table with a default route", () => {
    const owners = loadOwners();
    expect(owners.default.team).toBe("apm-techops");
    expect(owners.routes.length).toBeGreaterThan(0);
  });

  it("reads model pricing including cache multipliers", () => {
    const p = loadPricing();
    expect(p.models["claude-haiku-4-5"]?.input).toBe(1.0);
    expect(p.models["claude-opus-5"]?.output).toBe(25.0);
    expect(p.cache_read_multiplier).toBe(0.1);
  });
});
