#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { runListen } from "./commands/listen.js";
import { runList } from "./commands/list.js";
import { runShow } from "./commands/show.js";
import { runReplay } from "./commands/replay.js";
import { runClear } from "./commands/clear.js";

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
  .option("--status <code>", "response status to return to senders", "200")
  .option("--body <string>", "response body to return to senders", "ok")
  .option("--content-type <type>", "response content-type", "text/plain")
  .option("--no-store", "do not persist captured requests")
  .action(async (opts) => {
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
      status,
      body: opts.body,
      contentType: opts.contentType,
      store: opts.store !== false,
    });
  });

program
  .command("list")
  .description("List persisted requests")
  .option("-n, --limit <n>", "show only the most recent N", (v) => Number(v))
  .action((opts) => runList({ limit: opts.limit }));

program
  .command("show")
  .description("Show full detail of a captured request")
  .argument("<id>", "request id (see `huk list`)")
  .action((id) => runShow(id));

program
  .command("replay")
  .description("Re-send a stored request to a target URL")
  .argument("<id>", "request id (see `huk list`)")
  .requiredOption("--to <url>", "target URL to replay against")
  .action(async (id, opts) => runReplay(id, { to: opts.to }));

program
  .command("clear")
  .description("Delete all persisted requests")
  .action(() => runClear());

program.parseAsync(process.argv).catch((err) => {
  console.error(pc.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
