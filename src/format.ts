import pc from "picocolors";
import type { CapturedRequest } from "./types.js";

/** Color a method token by verb. */
function colorMethod(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return pc.green(method);
    case "POST":
      return pc.blue(method);
    case "PUT":
    case "PATCH":
      return pc.yellow(method);
    case "DELETE":
      return pc.red(method);
    default:
      return pc.magenta(method);
  }
}

/** Color a status code by class. */
function colorStatus(status: number): string {
  const s = String(status);
  if (status >= 500) return pc.red(s);
  if (status >= 400) return pc.yellow(s);
  if (status >= 300) return pc.cyan(s);
  if (status >= 200) return pc.green(s);
  return pc.dim(s);
}

/** Decode a stored body into a printable string. */
export function decodeBody(req: CapturedRequest): string {
  if (req.bodyEncoding === "none") return "";
  if (req.bodyEncoding === "base64") {
    return Buffer.from(req.body, "base64").toString("utf8");
  }
  return req.body;
}

/** One-line summary, e.g. `[1] POST /hook  200  12ms  → 200`. */
export function summaryLine(req: CapturedRequest): string {
  const parts = [
    pc.dim(`[${req.id}]`),
    colorMethod(req.method.padEnd(6)),
    req.path,
    colorStatus(req.response.status),
  ];
  if (req.forwarded) {
    if (req.forwarded.error) {
      parts.push(pc.red(`→ forward failed: ${req.forwarded.error}`));
    } else {
      parts.push(
        pc.dim("→") +
          " " +
          colorStatus(req.forwarded.status ?? 0) +
          pc.dim(` ${req.forwarded.durationMs ?? "?"}ms`),
      );
    }
  }
  return parts.join("  ");
}

/** Pretty-print a body, formatting JSON when possible. */
function formatBody(body: string, contentType: string): string {
  if (!body) return pc.dim("(empty)");
  const isJson =
    contentType.includes("json") ||
    body.trimStart().startsWith("{") ||
    body.trimStart().startsWith("[");
  if (isJson) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      // fall through to raw
    }
  }
  return body;
}

function headerValue(v: string | string[]): string {
  return Array.isArray(v) ? v.join(", ") : v;
}

/** Full multi-line detail block for `huk show`. */
export function detailBlock(req: CapturedRequest): string {
  const lines: string[] = [];
  lines.push(
    pc.bold(
      `${pc.dim(`#${req.id}`)} ${colorMethod(req.method)} ${req.path}`,
    ),
  );
  lines.push(pc.dim(`  time:   ${req.timestamp}`));
  lines.push(pc.dim(`  from:   ${req.remoteAddr}`));
  lines.push(
    pc.dim(`  response: `) + colorStatus(req.response.status),
  );
  if (req.forwarded) {
    const f = req.forwarded;
    const desc = f.error
      ? pc.red(`failed: ${f.error}`)
      : `${colorStatus(f.status ?? 0)} ${pc.dim(`${f.durationMs}ms`)}`;
    lines.push(pc.dim(`  forwarded → ${f.target}: `) + desc);
  }

  const queryKeys = Object.keys(req.query);
  if (queryKeys.length) {
    lines.push("");
    lines.push(pc.bold("  Query"));
    for (const k of queryKeys) {
      lines.push(`    ${pc.cyan(k)}: ${headerValue(req.query[k]!)}`);
    }
  }

  lines.push("");
  lines.push(pc.bold("  Headers"));
  for (const [k, v] of Object.entries(req.headers)) {
    lines.push(`    ${pc.cyan(k)}: ${headerValue(v)}`);
  }

  lines.push("");
  lines.push(pc.bold("  Body"));
  const contentType = headerValue(req.headers["content-type"] ?? "");
  const body = formatBody(decodeBody(req), contentType);
  for (const line of body.split("\n")) {
    lines.push("    " + line);
  }

  return lines.join("\n");
}
