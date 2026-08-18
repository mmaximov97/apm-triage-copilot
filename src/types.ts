export type Severity = "P1" | "P2" | "P3" | "none";
export type Outcome = Severity | "needs_review";

export type MetricWindow = {
  window_start: string;
  window_end: string;
  method: string;
  country: string;
  psp: string;
  attempts: number;
  successes: number;
  baseline_success_rate: number;
};

export type EvidenceSource =
  | "psp_status"
  | "ticket"
  | "slack"
  | "merchant_report";

export type Evidence = {
  id: string;
  source: EvidenceSource;
  text: string;
  url?: string;
  observed_at: string;
};

export type Expected = {
  signal_created: boolean;
  severity: Outcome;
  owner: string | null;
  overrides: string[];
};

export type Scenario = {
  id: string;
  description: string;
  metrics: MetricWindow[];
  evidence: Evidence[];
  expected: Expected;
};

export type GateName =
  | "volume"
  | "absolute_drop"
  | "relative_drop"
  | "significance"
  | "dedup";

export type RuleTrace = {
  gate: GateName;
  passed: boolean;
  observed: Record<string, number | string>;
  threshold: Record<string, number | string>;
};

export type Signal = {
  key: string;
  window: MetricWindow;
  rule_trace: RuleTrace[];
  hard_breach: boolean;
};

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

export type AuditStep = "detect" | "classify" | "summarize" | "route" | "act";

export type AuditRecord = {
  ts: string;
  run_id: string;
  scenario_id: string;
  step: AuditStep;
  rule_trace?: RuleTrace[];
  model?: string;
  prompt_version?: string;
  input_digest: string;
  output: unknown;
  overrides?: string[];
  usage?: Usage;
  latency_ms?: number;
  cost_usd?: number;
  approver?: string;
};
