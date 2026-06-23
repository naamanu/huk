import type { IncomingMessage } from "node:http";
import type { BodyEncoding, CapturedRequest, ResponseInfo } from "../types.js";

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB cap to keep things simple

interface ReadResult {
  /** Stored body bytes, capped at MAX_BODY_BYTES. */
  buffer: Buffer;
  /** Total bytes received from the sender, before capping. */
  totalBytes: number;
  /** True if the body was capped (stored buffer is partial). */
  truncated: boolean;
}

/** Read the request body, capping the stored bytes at MAX_BODY_BYTES. */
function readBody(req: IncomingMessage): Promise<ReadResult> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let stored = 0;
    let total = 0;
    let truncated = false;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      const room = MAX_BODY_BYTES - stored;
      if (room <= 0) {
        truncated = true;
        return;
      }
      if (chunk.length <= room) {
        chunks.push(chunk);
        stored += chunk.length;
      } else {
        chunks.push(chunk.subarray(0, room));
        stored += room;
        truncated = true;
      }
    });
    req.on("end", () =>
      resolve({ buffer: Buffer.concat(chunks), totalBytes: total, truncated }),
    );
    req.on("error", reject);
  });
}

/** Decide how to encode a body buffer for storage/printing. */
function encodeBody(buf: Buffer): { encoding: BodyEncoding; body: string } {
  if (buf.length === 0) return { encoding: "none", body: "" };
  const text = buf.toString("utf8");
  // Round-trip check: if it survives utf8 encoding, treat it as text.
  if (Buffer.from(text, "utf8").equals(buf)) {
    return { encoding: "utf8", body: text };
  }
  return { encoding: "base64", body: buf.toString("base64") };
}

function normalizeHeaders(
  raw: IncomingMessage["headers"],
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Build a CapturedRequest from an incoming request (response filled later). */
export async function capture(
  req: IncomingMessage,
  id: number,
  response: ResponseInfo,
): Promise<{ record: CapturedRequest; rawBody: Buffer }> {
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const query: Record<string, string | string[]> = {};
  for (const key of url.searchParams.keys()) {
    const values = url.searchParams.getAll(key);
    query[key] = values.length > 1 ? values : values[0]!;
  }

  const { buffer: rawBody, totalBytes, truncated } = await readBody(req);
  const { encoding, body } = encodeBody(rawBody);

  const record: CapturedRequest = {
    id,
    timestamp: new Date().toISOString(),
    method: req.method ?? "GET",
    path: url.pathname,
    query,
    headers: normalizeHeaders(req.headers),
    bodyEncoding: encoding,
    body,
    bytes: totalBytes,
    truncated,
    remoteAddr: req.socket.remoteAddress ?? "unknown",
    response,
  };

  return { record, rawBody };
}
