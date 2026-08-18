import { describe, expect, it, vi } from "vitest";
import { summarize, SUMMARIZE_MODEL } from "../../src/reason/summarize.js";
import type { LlmClient } from "../../src/llm/client.js";
import type { Evidence, Signal } from "../../src/types.js";

const signal: Signal = {
  key: "pix:BR:psp_acme",
  window: {
    window_start: "2026-08-18T10:00:00Z",
    window_end: "2026-08-18T10:15:00Z",
    method: "pix",
    country: "BR",
    psp: "psp_acme",
    attempts: 1000,
    successes: 300,
    baseline_success_rate: 0.94,
  },
  rule_trace: [],
  hard_breach: true,
};

const evidence: Evidence[] = [
  { id: "ev_01", source: "psp_status", text: "degraded", observed_at: "2026-08-18T10:05:00Z" },
];

function fakeLlm(parsed: unknown) {
  const call = vi.fn().mockResolvedValue({
    parsed,
    usage: {
      input_tokens: 2000,
      output_tokens: 300,
      cache_read_input_tokens: 1800,
      cache_creation_input_tokens: 0,
    },
    latency_ms: 4200,
    stop_reason: "end_turn",
    from_cassette: true,
  });
  return { call } as unknown as LlmClient & { call: typeof call };
}

const base = {
  headline: "PIX settlement degraded at psp_acme",
  suspected_cause: "Provider-side degradation",
  merchant_impact: "All BR PIX merchants on psp_acme",
  recommended_owner: "apm-latam",
  open_questions: ["ETA from provider?"],
};

describe("summarize", () => {
  it("requests Opus with medium effort", async () => {
    const llm = fakeLlm({
      ...base,
      claims: [{ text: "Status page reports degradation", evidence_ids: ["ev_01"] }],
    });
    await summarize(llm, signal, evidence);
    const req = llm.call.mock.calls[0]![0];
    expect(req.model).toBe(SUMMARIZE_MODEL);
    expect(req.model).toBe("claude-opus-5");
    expect(req.effort).toBe("medium");
  });

  it("keeps cited claims and reports the run as usable", async () => {
    const llm = fakeLlm({ ...base, claims: [{ text: "cited", evidence_ids: ["ev_01"] }] });
    const r = await summarize(llm, signal, evidence);
    expect(r.usable).toBe(true);
    expect(r.summary.claims).toHaveLength(1);
    expect(r.dropped).toHaveLength(0);
  });

  it("drops uncited claims and keeps the rest", async () => {
    const llm = fakeLlm({
      ...base,
      claims: [
        { text: "cited", evidence_ids: ["ev_01"] },
        { text: "invented", evidence_ids: ["ev_77"] },
      ],
    });
    const r = await summarize(llm, signal, evidence);
    expect(r.summary.claims.map((c) => c.text)).toEqual(["cited"]);
    expect(r.dropped.map((c) => c.text)).toEqual(["invented"]);
    expect(r.usable).toBe(true);
  });

  it("marks the summary unusable when nothing survives filtering", async () => {
    const llm = fakeLlm({ ...base, claims: [{ text: "invented", evidence_ids: ["ev_77"] }] });
    const r = await summarize(llm, signal, evidence);
    expect(r.usable).toBe(false);
    expect(r.summary.claims).toHaveLength(0);
  });
});
