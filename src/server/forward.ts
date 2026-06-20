import type { ForwardResult } from "../types.js";

/** Headers that must not be forwarded verbatim to the downstream target. */
const STRIP_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
]);

/**
 * Proxy a captured request to `target`, returning status + latency.
 * `path` is the original path+query so downstream routing is preserved.
 */
export async function forward(
  target: string,
  method: string,
  path: string,
  headers: Record<string, string | string[]>,
  body: Buffer,
): Promise<ForwardResult> {
  const base = target.replace(/\/$/, "");
  const url = base + path;
  const start = performance.now();

  const outHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (STRIP_HEADERS.has(k.toLowerCase())) continue;
    outHeaders[k] = Array.isArray(v) ? v.join(", ") : v;
  }

  const hasBody = method !== "GET" && method !== "HEAD" && body.length > 0;

  try {
    const res = await fetch(url, {
      method,
      headers: outHeaders,
      body: hasBody ? new Uint8Array(body) : undefined,
    });
    // Drain the body so the socket can close cleanly.
    await res.arrayBuffer().catch(() => undefined);
    return {
      target,
      status: res.status,
      durationMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    return {
      target,
      durationMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
