#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import pc from "picocolors";
import { runListen } from "./commands/listen.js";
import { runList } from "./commands/list.js";
import { runShow } from "./commands/show.js";
import { runReplay } from "./commands/replay.js";
import { runClear } from "./commands/clear.js";

/** Commander argument parser: accept only positive integers. */
function positiveInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError("must be a positive integer");
  }
  return n;
}

/** Parse a duration like `30s`, `10m`, `2h`, `1d` into milliseconds. */
function parseDuration(value: string): number {
  const m = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!m) {
    throw new InvalidArgumentError("use e.g. 30s, 10m, 2h, 1d");
  }
  const units: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return Number(m[1]) * units[m[2]!]!;
}

const program = new Command();

program
  .name("huk")
  .description("Capture, inspect, forward and replay webhook requests.")
  .version("0.1.0");

program
  .command("listen")
  .description("Start a server that captures incoming HTTP requests")
  .option("-p, --port <n>", "port to listen on", "4000")
  .option("-t, --tunnel", "expose a public URL via ngrok/cloudflared", false)
  .option("-f, --forward <url>", "also proxy each request to this URL")
  .option(
    "--timeout <ms>",
    "forward request timeout in milliseconds",
    positiveInt,
    30000,
  )
  .option(
    "--respond-with-forward",
    "return the forwarded app's response to the sender (requires --forward)",
    false,
  )
  .option("--status <code>", "response status to return to senders", "200")
  .option("--body <string>", "response body to return to senders", "ok")
  .option("--content-type <type>", "response content-type", "text/plain")
  .option("--no-store", "do not persist captured requests")
  .action(async (opts) => {
    if (opts.respondWithForward && !opts.forward) {
      console.error(pc.red("--respond-with-forward requires --forward"));
      process.exit(1);
    }
    const port = Number(opts.port);
    const status = Number(opts.status);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error(pc.red(`Invalid port: ${opts.port}`));
      process.exit(1);
    }
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      console.error(pc.red(`Invalid status: ${opts.status}`));
      process.exit(1);
    }
    await runListen({
      port,
      tunnel: Boolean(opts.tunnel),
      forward: opts.forward,
      timeout: opts.timeout,
      respondWithForward: Boolean(opts.respondWithForward),
      status,
      body: opts.body,
      contentType: opts.contentType,
      store: opts.store !== false,
    });
  });

program
  .command("list")
  .description("List persisted requests")
  .option("-n, --limit <n>", "show only the most recent N", positiveInt)
  .option("--method <method>", "filter by HTTP method (e.g. POST)")
  .option("--path <substring>", "filter by path substring")
  .option("--status <code>", "filter by response status code", positiveInt)
  .option(
    "--since <duration>",
    "only requests newer than e.g. 30s, 10m, 2h, 1d",
    parseDuration,
  )
  .action((opts) =>
    runList({
      limit: opts.limit,
      method: opts.method,
      pathContains: opts.path,
      status: opts.status,
      sinceMs: opts.since,
    }),
  );

program
  .command("show")
  .description("Show full detail of a captured request")
  .argument("<id>", "request id (see `huk list`)")
  .option("--json", "print the raw record as JSON (for scripting)")
  .option("--no-redact", "show sensitive header values instead of [redacted]")
  .option("--redact-header <name...>", "additional header name(s) to redact", [])
  .action((id, opts) =>
    runShow(id, {
      json: Boolean(opts.json),
      redact: opts.redact,
      redactExtra: opts.redactHeader,
    }),
  );

program
  .command("replay")
  .description("Re-send a stored request to a target URL")
  .argument("<id>", "request id (see `huk list`)")
  .requiredOption("--to <url>", "target URL to replay against")
  .option(
    "--timeout <ms>",
    "request timeout in milliseconds",
    positiveInt,
    30000,
  )
  .action(async (id, opts) => runReplay(id, { to: opts.to, timeout: opts.timeout }));

program
  .command("clear")
  .description("Delete all persisted requests")
  .action(() => runClear());

program.parseAsync(process.argv).catch((err) => {
  console.error(pc.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
