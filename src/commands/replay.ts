import pc from "picocolors";
import { get } from "../store.js";
import { decodeBody } from "../format.js";
import { forward } from "../server/forward.js";

export async function runReplay(
  idArg: string,
  opts: { to: string },
): Promise<void> {
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

  // Rebuild path + query string from the stored record.
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(record.query)) {
    if (Array.isArray(v)) v.forEach((val) => params.append(k, val));
    else params.append(k, v);
  }
  const qs = params.toString();
  const path = record.path + (qs ? `?${qs}` : "");

  const bodyText = decodeBody(record);
  const bodyBuf = Buffer.from(
    record.bodyEncoding === "base64" ? record.body : bodyText,
    record.bodyEncoding === "base64" ? "base64" : "utf8",
  );

  console.log(
    pc.dim(`Replaying #${id} ${record.method} ${path} → ${opts.to}`),
  );
  const result = await forward(
    opts.to,
    record.method,
    path,
    record.headers,
    bodyBuf,
  );

  if (result.error) {
    console.error(pc.red(`Failed: ${result.error}`));
    process.exitCode = 1;
    return;
  }
  console.log(
    pc.green(`Done: ${result.status}`) + pc.dim(` (${result.durationMs}ms)`),
  );
}
