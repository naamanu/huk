import type { IncomingMessage } from "node:http";
import type { BodyEncoding, CapturedRequest, ResponseInfo } from "../types.js";

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB cap to keep things simple

/** Read the raw request body into a Buffer, capped at MAX_BODY_BYTES. */
function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) {
        chunks.push(chunk);
      } else if (!truncated) {
        truncated = true;
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
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

  const rawBody = await readBody(req);
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
    remoteAddr: req.socket.remoteAddress ?? "unknown",
    response,
  };

  return { record, rawBody };
}
