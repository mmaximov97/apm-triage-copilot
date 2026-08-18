import { describe, expect, it } from "vitest";
import { IncidentRegistry } from "../../src/detect/dedup.js";

describe("IncidentRegistry", () => {
  it("does not suppress the first occurrence of a key", () => {
    const r = new IncidentRegistry();
    const c = r.check("pix:BR:psp_acme", "2026-08-18T10:15:00Z", 30);
    expect(c.suppressed).toBe(false);
    expect(c.attach_to).toBeNull();
    expect(c.trace.gate).toBe("dedup");
    expect(c.trace.passed).toBe(true);
  });

  it("suppresses a repeat inside the window and names the open incident", () => {
    const r = new IncidentRegistry();
    r.register("pix:BR:psp_acme", "2026-08-18T10:15:00Z", "inc_001");
    const c = r.check("pix:BR:psp_acme", "2026-08-18T10:35:00Z", 30);
    expect(c.suppressed).toBe(true);
    expect(c.attach_to).toBe("inc_001");
    expect(c.trace.passed).toBe(false);
    expect(c.trace.observed.minutes_since_open).toBe(20);
  });

  it("allows a new incident once the window has elapsed", () => {
    const r = new IncidentRegistry();
    r.register("pix:BR:psp_acme", "2026-08-18T10:15:00Z", "inc_001");
    const c = r.check("pix:BR:psp_acme", "2026-08-18T11:00:00Z", 30);
    expect(c.suppressed).toBe(false);
  });

  it("keeps different keys independent", () => {
    const r = new IncidentRegistry();
    r.register("pix:BR:psp_acme", "2026-08-18T10:15:00Z", "inc_001");
    const c = r.check("upi:IN:psp_indus", "2026-08-18T10:20:00Z", 30);
    expect(c.suppressed).toBe(false);
  });
});
