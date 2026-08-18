import { describe, expect, it, vi } from "vitest";
import { classify } from "../../src/reason/classify.js";
import { CLASSIFY_PROMPT_VERSION } from "../../src/reason/prompts.js";
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
  {
    id: "ev_01",
    source: "psp_status",
    text: "PSP Acme: degraded performance on PIX settlement.",
    observed_at: "2026-08-18T10:05:00Z",
  },
];

function fakeLlm(parsed: unknown) {
  const call = vi.fn().mockResolvedValue({
    parsed,
    usage: {
      input_tokens: 100,
      output_tokens: 40,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    latency_ms: 700,
    stop_reason: "end_turn",
    from_cassette: true,
  });
  return { call } as unknown as LlmClient & { call: typeof call };
}

describe("classify", () => {
  it("sends the frozen system prompt and the volatile content separately", async () => {
    const llm = fakeLlm({
      severity: "P1",
      confidence: 0.9,
      category: "provider_outage",
      supporting_evidence_ids: ["ev_01"],
      reasoning_brief: "Status page reports degradation.",
    });

    await classify(llm, signal, evidence);

    const req = llm.call.mock.calls[0]![0];
    expect(req.model).toBe("claude-haiku-4-5");
    expect(req.prompt_version).toBe(CLASSIFY_PROMPT_VERSION);
    // Haiku 4.5 rejects output_config.effort — it must not be sent.
    expect(req.effort).toBeUndefined();
    // The signal and the evidence are volatile: they belong in the user turn.
    expect(req.system).not.toContain("pix:BR:psp_acme");
    expect(req.user).toContain("pix:BR:psp_acme");
    expect(req.user).toContain('id="ev_01"');
  });

  it("returns the parsed triage together with usage and latency", async () => {
    const llm = fakeLlm({
      severity: "P2",
      confidence: 0.55,
      category: "merchant_config",
      supporting_evidence_ids: [],
      reasoning_brief: "Single merchant affected.",
    });

    const r = await classify(llm, signal, evidence);
    expect(r.triage.severity).toBe("P2");
    expect(r.triage.confidence).toBeCloseTo(0.55);
    expect(r.usage.input_tokens).toBe(100);
    expect(r.latency_ms).toBe(700);
  });
});
