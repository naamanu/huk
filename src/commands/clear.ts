import pc from "picocolors";
import { all, clear } from "../store.js";

export function runClear(): void {
  const count = all().length;
  clear();
  console.log(pc.dim(`Cleared ${count} request(s).`));
}
