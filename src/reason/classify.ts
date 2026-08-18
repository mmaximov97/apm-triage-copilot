import type { LlmClient } from "../llm/client.js";
import type { Evidence, Signal, Usage } from "../types.js";
import {
  CLASSIFY_PROMPT_VERSION,
  CLASSIFY_SYSTEM,
  renderEvidence,
  renderSignal,
} from "./prompts.js";
import { TriageSchema, type Triage } from "./schemas.js";

export const CLASSIFY_MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 1024;

export async function classify(
  llm: LlmClient,
  signal: Signal,
  evidence: Evidence[],
): Promise<{ triage: Triage; usage: Usage; latency_ms: number }> {
  const res = await llm.call({
    model: CLASSIFY_MODEL,
    prompt_version: CLASSIFY_PROMPT_VERSION,
    system: CLASSIFY_SYSTEM,
    user: `${renderSignal(signal)}\n\n${renderEvidence(evidence)}`,
    schema: TriageSchema,
    max_tokens: MAX_TOKENS,
    // No effort: claude-haiku-4-5 does not accept output_config.effort.
  });
  return { triage: res.parsed, usage: res.usage, latency_ms: res.latency_ms };
}
