import { z } from "zod";

export const TriageSchema = z.object({
  severity: z.enum(["P1", "P2", "P3", "none"]),
  confidence: z.number().min(0).max(1),
  category: z.enum([
    "provider_outage",
    "planned_maintenance",
    "internal_error",
    "merchant_config",
    "false_positive",
    "unknown",
  ]),
  supporting_evidence_ids: z.array(z.string()),
  reasoning_brief: z.string().max(400),
});

export const SummarySchema = z.object({
  headline: z.string(),
  claims: z
    .array(
      z.object({
        text: z.string(),
        evidence_ids: z.array(z.string()).min(1),
      }),
    )
    .min(1),
  suspected_cause: z.string(),
  merchant_impact: z.string(),
  recommended_owner: z.string(),
  open_questions: z.array(z.string()),
});

export type Triage = z.infer<typeof TriageSchema>;
export type Summary = z.infer<typeof SummarySchema>;
export type Claim = Summary["claims"][number];
