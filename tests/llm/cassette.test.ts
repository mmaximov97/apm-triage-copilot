import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cassetteKey,
  readCassette,
  writeCassette,
} from "../../src/llm/cassette.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "cassette-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("cassetteKey", () => {
  it("is stable across calls with identical input", () => {
    const a = cassetteKey({ model: "m", prompt_version: "v1", payload: { x: 1 } });
    const b = cassetteKey({ model: "m", prompt_version: "v1", payload: { x: 1 } });
    expect(a).toBe(b);
  });

  it("changes when the prompt version changes", () => {
    const a = cassetteKey({ model: "m", prompt_version: "v1", payload: { x: 1 } });
    const b = cassetteKey({ model: "m", prompt_version: "v2", payload: { x: 1 } });
    expect(a).not.toBe(b);
  });

  it("is insensitive to key order in the payload", () => {
    const a = cassetteKey({ model: "m", prompt_version: "v1", payload: { x: 1, y: 2 } });
    const b = cassetteKey({ model: "m", prompt_version: "v1", payload: { y: 2, x: 1 } });
    expect(a).toBe(b);
  });
});

describe("cassette storage", () => {
  it("returns null for an unknown key", () => {
    expect(readCassette(dir, "deadbeef")).toBeNull();
  });

  it("round-trips a record including usage and latency", () => {
    const rec = {
      key: "abc123",
      model: "claude-haiku-4-5",
      prompt_version: "classify-v1",
      parsed: { severity: "P1" },
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 0,
      },
      latency_ms: 812,
      stop_reason: "end_turn",
    };
    writeCassette(dir, rec);
    expect(readCassette(dir, "abc123")).toEqual(rec);
  });
});
