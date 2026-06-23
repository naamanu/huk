import pc from "picocolors";
import { all } from "../store.js";
import { summaryLine } from "../format.js";

export function runList(opts: { limit?: number }): void {
  const records = all();
  if (records.length === 0) {
    console.log(pc.dim("No requests captured yet. Run `huk listen` first."));
    return;
  }
  const slice = opts.limit ? records.slice(-opts.limit) : records;
  for (const r of slice) {
    const time = pc.dim(new Date(r.timestamp).toLocaleString());
    console.log(`${summaryLine(r)}  ${time}`);
  }
  console.log(pc.dim(`\n${slice.length} of ${records.length} request(s).`));
}
