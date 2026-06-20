import { spawn, type ChildProcess } from "node:child_process";
import { execSync } from "node:child_process";
import pc from "picocolors";

export interface Tunnel {
  publicUrl: string;
  provider: "ngrok" | "cloudflared";
  close: () => void;
}

function hasBinary(name: string): boolean {
  try {
    execSync(`command -v ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Poll ngrok's local agent API for the https public URL. */
async function ngrokPublicUrl(timeoutMs = 8000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch("http://127.0.0.1:4040/api/tunnels");
      if (res.ok) {
        const data = (await res.json()) as {
          tunnels?: { public_url?: string; proto?: string }[];
        };
        const https = data.tunnels?.find((t) => t.public_url?.startsWith("https"));
        const any = data.tunnels?.find((t) => t.public_url);
        const url = https?.public_url ?? any?.public_url;
        if (url) return url;
      }
    } catch {
      // agent not up yet
    }
    await sleep(300);
  }
  throw new Error("timed out waiting for ngrok public URL");
}

async function startNgrok(port: number): Promise<Tunnel> {
  const child = spawn("ngrok", ["http", String(port), "--log", "stdout"], {
    stdio: "ignore",
  });
  child.on("error", () => {
    /* surfaced via the publicUrl timeout below */
  });
  const publicUrl = await ngrokPublicUrl();
  return {
    publicUrl,
    provider: "ngrok",
    close: () => child.kill(),
  };
}

async function startCloudflared(port: number): Promise<Tunnel> {
  const child: ChildProcess = spawn(
    "cloudflared",
    ["tunnel", "--url", `http://localhost:${port}`],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  const urlRe = /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/i;

  const publicUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timed out waiting for cloudflared URL")),
      15000,
    );
    const onData = (buf: Buffer) => {
      const m = buf.toString().match(urlRe);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]!);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });

  return {
    publicUrl,
    provider: "cloudflared",
    close: () => child.kill(),
  };
}

/**
 * Try to open a public tunnel to `port`. Returns undefined (and prints an
 * install hint) when no supported tunnel binary is available or it fails.
 */
export async function openTunnel(port: number): Promise<Tunnel | undefined> {
  if (hasBinary("ngrok")) {
    try {
      return await startNgrok(port);
    } catch (err) {
      console.error(
        pc.yellow(`! ngrok failed: ${err instanceof Error ? err.message : err}`),
      );
    }
  }
  if (hasBinary("cloudflared")) {
    try {
      return await startCloudflared(port);
    } catch (err) {
      console.error(
        pc.yellow(
          `! cloudflared failed: ${err instanceof Error ? err.message : err}`,
        ),
      );
    }
  }
  console.error(
    pc.yellow(
      "! No tunnel binary found. Install ngrok (https://ngrok.com/download) " +
        "or cloudflared to use --tunnel. Continuing local-only.",
    ),
  );
  return undefined;
}
