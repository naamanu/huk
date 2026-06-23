import { createServer } from "node:http";
import pc from "picocolors";
import { capture } from "../server/capture.js";
import { forward } from "../server/forward.js";
import { openTunnel, type Tunnel } from "../tunnel.js";
import { append, nextId, storePath } from "../store.js";
import { summaryLine } from "../format.js";
import type { ResponseInfo } from "../types.js";

export interface ListenOptions {
  port: number;
  tunnel: boolean;
  forward?: string;
  timeout: number;
  status: number;
  body: string;
  contentType: string;
  store: boolean;
}

export async function runListen(opts: ListenOptions): Promise<void> {
  let id = nextId();
  const responseInfo: ResponseInfo = {
    status: opts.status,
    contentType: opts.contentType,
  };

  const server = createServer(async (req, res) => {
    const { record, rawBody } = await capture(req, id++, responseInfo);
    const originalPath = req.url ?? record.path;

    if (opts.forward) {
      record.forwarded = await forward(
        opts.forward,
        record.method,
        originalPath,
        record.headers,
        rawBody,
        opts.timeout,
      );
    }

    if (opts.store) {
      try {
        append(record);
      } catch (err) {
        console.error(pc.red(`! failed to persist request: ${err}`));
      }
    }

    console.log(summaryLine(record));

    res.writeHead(opts.status, { "content-type": opts.contentType });
    res.end(opts.body);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, () => resolve());
  });

  const localUrl = `http://localhost:${opts.port}`;
  console.log(pc.bold("huk") + pc.dim(" — capturing webhooks\n"));
  console.log(`${pc.dim("Local: ")} ${pc.cyan(localUrl)}`);

  let tunnel: Tunnel | undefined;
  if (opts.tunnel) {
    tunnel = await openTunnel(opts.port);
    if (tunnel) {
      console.log(
        `${pc.dim("Public:")} ${pc.green(tunnel.publicUrl)} ${pc.dim(`(${tunnel.provider})`)}`,
      );
    }
  }

  if (opts.forward) {
    console.log(
      `${pc.dim("Forward:")} ${pc.yellow(opts.forward)} ${pc.dim(`(timeout ${opts.timeout}ms)`)}`,
    );
  }
  console.log(
    `${pc.dim("Respond:")} ${opts.status} ${pc.dim(opts.contentType)}`,
  );
  if (opts.store) {
    console.log(pc.dim(`Saving to ${storePath}`));
  } else {
    console.log(pc.dim("Persistence disabled (--no-store)"));
  }
  console.log(pc.dim("\nWaiting for requests... (Ctrl+C to stop)\n"));

  const shutdown = () => {
    console.log(pc.dim("\nShutting down..."));
    tunnel?.close();
    server.close(() => process.exit(0));
    // Failsafe if sockets keep the server open.
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
