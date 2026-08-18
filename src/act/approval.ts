import type { Action } from "./actions.js";

export type ApprovalMode = "auto" | "none" | "interactive";

export type ApprovalOutcome = {
  executed: Action[];
  withheld: Action[];
  approver: string | null;
};

/**
 * `interactive` is treated as `none` in a non-TTY run: withholding is the safe
 * default when no human is present to answer.
 */
export function applyApproval(
  actions: Action[],
  mode: ApprovalMode,
  approver: string,
): ApprovalOutcome {
  const approved = mode === "auto";
  const executed: Action[] = [];
  const withheld: Action[] = [];

  for (const a of actions) {
    if (!a.requires_approval || approved) executed.push(a);
    else withheld.push(a);
  }

  return {
    executed,
    withheld,
    approver: executed.some((a) => a.requires_approval) ? approver : null,
  };
}
