import pc from "picocolors";
import { get } from "../store.js";
import { detailBlock } from "../format.js";

export function runShow(idArg: string): void {
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
  console.log(detailBlock(record));
}
