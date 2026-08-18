import type { LlmClient } from "../llm/client.js";
import type { Evidence, Signal, Usage } from "../types.js";
import { enforceEvidence } from "./guardrails.js";
import {
  renderEvidence,
  renderSignal,
  SUMMARIZE_PROMPT_VERSION,
  SUMMARIZE_SYSTEM,
} from "./prompts.js";
import { SummarySchema, type Claim, type Summary } from "./schemas.js";

export const SUMMARIZE_MODEL = "claude-opus-5";
const MAX_TOKENS = 4096;

export async function summarize(
  llm: LlmClient,
  signal: Signal,
  evidence: Evidence[],
): Promise<{
  summary: Summary;
  dropped: Claim[];
  usable: boolean;
  usage: Usage;
  latency_ms: number;
}> {
  const res = await llm.call({
    model: SUMMARIZE_MODEL,
    prompt_version: SUMMARIZE_PROMPT_VERSION,
    system: SUMMARIZE_SYSTEM,
    user: `${renderSignal(signal)}\n\n${renderEvidence(evidence)}`,
    schema: SummarySchema,
    max_tokens: MAX_TOKENS,
    effort: "medium",
  });

  const { kept, dropped } = enforceEvidence(res.parsed.claims, evidence);
  const summary: Summary = { ...res.parsed, claims: kept };

  return {
    summary,
    dropped,
    usable: kept.length > 0,
    usage: res.usage,
    latency_ms: res.latency_ms,
  };
}
