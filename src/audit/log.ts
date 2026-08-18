import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { AuditRecord } from "../types.js";

export class AuditLog {
  private readonly file: string;
  private readonly runId: string;
  private readonly buffer: AuditRecord[] = [];

  constructor(opts: { dir: string; runId: string }) {
    this.runId = opts.runId;
    const runDir = path.join(opts.dir, opts.runId);
    mkdirSync(runDir, { recursive: true });
    this.file = path.join(runDir, "audit.jsonl");
  }

  path(): string {
    return this.file;
  }

  append(rec: Omit<AuditRecord, "ts" | "run_id">): void {
    const full: AuditRecord = {
      ts: new Date().toISOString(),
      run_id: this.runId,
      ...rec,
    };
    this.buffer.push(full);
    appendFileSync(this.file, `${JSON.stringify(full)}\n`, "utf8");
  }

  records(): AuditRecord[] {
    return [...this.buffer];
  }
}
