import pc from "picocolors";
import { get } from "../store.js";
import { detailBlock } from "../format.js";
import { redactRecord } from "../redact.js";

export interface ShowOptions {
  json?: boolean;
  /** Redact sensitive headers (default true). */
  redact?: boolean;
  /** Extra header names to redact. */
  redactExtra?: string[];
}

export function runShow(idArg: string, opts: ShowOptions = {}): void {
  const id = Number(idArg);
  if (!Number.isInteger(id)) {
    console.error(pc.red(`Invalid id: ${idArg}`));
    process.exitCode = 1;
    return;
  }
  const record = get(id);
  if (!record) {
    console.error(pc.red(`No request with id ${id}. Try \`huk list\`.`));
    process.exitCode = 1;
    return;
  }
  const view =
    opts.redact === false
      ? record
      : redactRecord(record, opts.redactExtra ?? []);
  if (opts.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(detailBlock(view));
}
