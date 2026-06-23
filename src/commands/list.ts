import pc from "picocolors";
import { all } from "../store.js";
import { summaryLine } from "../format.js";

export interface ListOptions {
  limit?: number;
  method?: string;
  pathContains?: string;
  status?: number;
  sinceMs?: number;
}

export function runList(opts: ListOptions): void {
  const records = all();
  if (records.length === 0) {
    console.log(pc.dim("No requests captured yet. Run `huk listen` first."));
    return;
  }

  let filtered = records;
  if (opts.method) {
    const want = opts.method.toUpperCase();
    filtered = filtered.filter((r) => r.method.toUpperCase() === want);
  }
  if (opts.pathContains) {
    const needle = opts.pathContains.toLowerCase();
    filtered = filtered.filter((r) => r.path.toLowerCase().includes(needle));
  }
  if (opts.status !== undefined) {
    filtered = filtered.filter((r) => r.response.status === opts.status);
  }
  if (opts.sinceMs !== undefined) {
    const cutoff = Date.now() - opts.sinceMs;
    filtered = filtered.filter((r) => new Date(r.timestamp).getTime() >= cutoff);
  }

  if (filtered.length === 0) {
    console.log(pc.dim("No requests match the given filters."));
    return;
  }

  const slice = opts.limit ? filtered.slice(-opts.limit) : filtered;
  for (const r of slice) {
    const time = pc.dim(new Date(r.timestamp).toLocaleString());
    console.log(`${summaryLine(r)}  ${time}`);
  }
  console.log(pc.dim(`\n${slice.length} of ${filtered.length} request(s).`));
}
