import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Usage } from "../types.js";

export type CassetteRecord = {
  key: string;
  model: string;
  prompt_version: string;
  parsed: unknown;
  usage: Usage;
  latency_ms: number;
  stop_reason: string;
};

/** Deterministic JSON: object keys sorted so the digest is order-insensitive. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

export function digest(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function cassetteKey(input: {
  model: string;
  prompt_version: string;
  payload: unknown;
}): string {
  return digest(input);
}

export function readCassette(dir: string, key: string): CassetteRecord | null {
  const file = path.join(dir, `${key}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as CassetteRecord;
}

export function writeCassette(dir: string, rec: CassetteRecord): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, `${rec.key}.json`),
    `${JSON.stringify(rec, null, 2)}\n`,
    "utf8",
  );
}
