import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const here = path.dirname(fileURLToPath(import.meta.url));

export function projectRoot(): string {
  return path.resolve(here, "..");
}

export function configDir(): string {
  return path.join(projectRoot(), "config");
}

function readYaml<T>(name: string): T {
  return parse(readFileSync(path.join(configDir(), name), "utf8")) as T;
}

export type Thresholds = {
  min_attempts: number;
  abs_drop: number;
  rel_drop: number;
  p_value: number;
  hard_breach_rate: number;
  hard_breach_attempts: number;
  suppression_minutes: number;
  confidence_floor: number;
};

export type OwnerRoute = {
  method: string;
  psp: string;
  team: string;
  channel: string;
  escalation: string;
};

export type OwnerTable = {
  default: Omit<OwnerRoute, "method" | "psp">;
  routes: OwnerRoute[];
};

export type PricingTable = {
  cache_read_multiplier: number;
  cache_write_multiplier: number;
  models: Record<string, { input: number; output: number }>;
};

export type MttrAssumptions = {
  manual_minutes: Record<string, number>;
  automated_minutes: Record<string, number>;
};

export const loadThresholds = (): Thresholds => readYaml("thresholds.yaml");
export const loadOwners = (): OwnerTable => readYaml("owners.yaml");
export const loadPricing = (): PricingTable => readYaml("pricing.yaml");
export const loadMttrAssumptions = (): MttrAssumptions =>
  readYaml("mttr-assumptions.yaml");
