import type { PricingTable } from "../config.js";
import type { Usage } from "../types.js";

const PER_TOKEN = 1_000_000;

/**
 * Cost is derived from reported usage, never estimated. In mock runs the
 * usage comes from the recorded cassette, so the number still reflects a
 * real call rather than a guess.
 */
export function costOf(
  model: string,
  usage: Usage,
  pricing: PricingTable,
): number {
  const rates = pricing.models[model];
  if (rates === undefined) {
    throw new Error(`No pricing configured for model ${model}`);
  }
  const input = (usage.input_tokens / PER_TOKEN) * rates.input;
  const output = (usage.output_tokens / PER_TOKEN) * rates.output;
  const cacheRead =
    (usage.cache_read_input_tokens / PER_TOKEN) *
    rates.input *
    pricing.cache_read_multiplier;
  const cacheWrite =
    (usage.cache_creation_input_tokens / PER_TOKEN) *
    rates.input *
    pricing.cache_write_multiplier;
  return input + output + cacheRead + cacheWrite;
}
