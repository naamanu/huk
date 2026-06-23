import type { ForwardResult } from "../types.js";
import { encodeBody } from "./body.js";

/** Headers that must not be forwarded verbatim to the downstream target. */
const STRIP_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
]);

/** Cap on how much of a downstream response body we capture. */
const MAX_RESPONSE_BYTES = 64 * 1024;

/**
 * Proxy a captured request to `target`, returning status + latency.
 * `path` is the original path+query so downstream routing is preserved.
 * Aborts (and reports an error) if the target doesn't respond within
 * `timeoutMs`, so a hung downstream never blocks the caller indefinitely.
 */
export async function forward(
  target: string,
  method: string,
  path: string,
  headers: Record<string, string | string[]>,
  body: Buffer,
  timeoutMs: number,
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
      signal: AbortSignal.timeout(timeoutMs),
    });

    const full = Buffer.from(
      await res.arrayBuffer().catch(() => new ArrayBuffer(0)),
    );
    const responseTruncated = full.length > MAX_RESPONSE_BYTES;
    const captured = responseTruncated
      ? full.subarray(0, MAX_RESPONSE_BYTES)
      : full;
    const { encoding, body: responseBody } = encodeBody(captured);

    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      target,
      status: res.status,
      durationMs: Math.round(performance.now() - start),
      responseHeaders,
      responseBody,
      responseBodyEncoding: encoding,
      responseTruncated,
    };
  } catch (err) {
    const timedOut =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      target,
      durationMs: Math.round(performance.now() - start),
      error: timedOut
        ? `timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err),
    };
  }
}
