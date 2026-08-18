import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { Usage } from "../types.js";
import { cassetteKey, readCassette, writeCassette } from "./cassette.js";

export type LlmMode = "mock" | "live" | "record";

export type LlmRequest<T> = {
  model: string;
  prompt_version: string;
  /** Stable prefix: frozen instructions, runbook, owner table. Cached. */
  system: string;
  /** Volatile per-signal content. Must come after the cache breakpoint. */
  user: string;
  schema: z.ZodType<T>;
  max_tokens: number;
  effort?: "low" | "medium" | "high";
};

export type LlmResponse<T> = {
  parsed: T;
  usage: Usage;
  latency_ms: number;
  stop_reason: string;
  from_cassette: boolean;
};

export class MissingCassetteError extends Error {
  constructor(key: string, model: string, promptVersion: string) {
    super(
      `No cassette for ${model} / ${promptVersion} (key ${key}). ` +
        "Run `npm run record` with ANTHROPIC_API_KEY set to record it, " +
        "or pass --llm live to call the API directly.",
    );
    this.name = "MissingCassetteError";
  }
}

export class LlmRefusalError extends Error {
  constructor(model: string) {
    super(`${model} refused the request (stop_reason: refusal).`);
    this.name = "LlmRefusalError";
  }
}

export class LlmClient {
  private readonly mode: LlmMode;
  private readonly cassetteDir: string;
  private client: Anthropic | null = null;

  constructor(opts: { mode: LlmMode; cassetteDir: string }) {
    this.mode = opts.mode;
    this.cassetteDir = opts.cassetteDir;
  }

  private sdk(): Anthropic {
    // Lazily constructed so mock runs never need a key.
    this.client ??= new Anthropic();
    return this.client;
  }

  async call<T>(req: LlmRequest<T>): Promise<LlmResponse<T>> {
    const key = cassetteKey({
      model: req.model,
      prompt_version: req.prompt_version,
      payload: {
        system: req.system,
        user: req.user,
        max_tokens: req.max_tokens,
        effort: req.effort ?? null,
      },
    });

    if (this.mode === "mock") {
      const rec = readCassette(this.cassetteDir, key);
      if (rec === null) {
        throw new MissingCassetteError(key, req.model, req.prompt_version);
      }
      return {
        parsed: req.schema.parse(rec.parsed),
        usage: rec.usage,
        latency_ms: rec.latency_ms,
        stop_reason: rec.stop_reason,
        from_cassette: true,
      };
    }

    const started = Date.now();
    const response = await this.sdk().messages.parse({
      model: req.model,
      max_tokens: req.max_tokens,
      // Stable prefix first, marked for caching. Volatile content lives in
      // the user turn, after the breakpoint.
      system: [
        {
          type: "text",
          text: req.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: req.user }],
      output_config: {
        format: zodOutputFormat(req.schema),
        ...(req.effort === undefined ? {} : { effort: req.effort }),
      },
    });
    const latency_ms = Date.now() - started;

    // On Opus 5 a refusal arrives as HTTP 200; reading content without this
    // check silently yields garbage.
    if (response.stop_reason === "refusal") {
      throw new LlmRefusalError(req.model);
    }
    if (response.parsed_output === null || response.parsed_output === undefined) {
      throw new Error(
        `${req.model} returned no parsed output (stop_reason: ${response.stop_reason}).`,
      );
    }

    const usage: Usage = {
      input_tokens: response.usage.input_tokens ?? 0,
      output_tokens: response.usage.output_tokens ?? 0,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens:
        response.usage.cache_creation_input_tokens ?? 0,
    };

    const parsed = req.schema.parse(response.parsed_output);

    if (this.mode === "record") {
      writeCassette(this.cassetteDir, {
        key,
        model: req.model,
        prompt_version: req.prompt_version,
        parsed,
        usage,
        latency_ms,
        stop_reason: response.stop_reason ?? "end_turn",
      });
    }

    return {
      parsed,
      usage,
      latency_ms,
      stop_reason: response.stop_reason ?? "end_turn",
      from_cassette: false,
    };
  }
}
