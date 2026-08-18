import { describe, expect, it } from "vitest";
import { normalCdf, proportionZTest } from "../../src/detect/stats.js";

describe("normalCdf", () => {
  it("is 0.5 at zero", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
  });

  it("matches known quantiles", () => {
    expect(normalCdf(-1.6449)).toBeCloseTo(0.05, 3);
    expect(normalCdf(-2.3263)).toBeCloseTo(0.01, 3);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
  });
});

describe("proportionZTest", () => {
  it("flags a large drop as highly significant", () => {
    const r = proportionZTest(40, 100, 0.9);
    expect(r.observed).toBeCloseTo(0.4, 6);
    expect(r.z).toBeLessThan(-10);
    expect(r.pValue).toBeLessThan(0.0001);
  });

  it("does not flag ordinary noise", () => {
    const r = proportionZTest(89, 100, 0.9);
    expect(r.pValue).toBeGreaterThan(0.05);
  });

  it("needs volume before a moderate drop becomes significant", () => {
    const small = proportionZTest(16, 20, 0.9);
    const large = proportionZTest(800, 1000, 0.9);
    expect(small.observed).toBeCloseTo(large.observed, 6);
    expect(small.pValue).toBeGreaterThan(large.pValue);
  });

  it("does not divide by zero when the baseline is degenerate", () => {
    const r = proportionZTest(10, 100, 1);
    expect(Number.isFinite(r.z)).toBe(true);
    expect(r.pValue).toBeLessThan(0.0001);
  });
});
