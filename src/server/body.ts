import type { BodyEncoding } from "../types.js";

/**
 * Decide how to encode a body buffer for storage/printing: UTF-8 when it
 * round-trips cleanly, otherwise base64 (treated as binary).
 */
export function encodeBody(buf: Buffer): {
  encoding: BodyEncoding;
  body: string;
} {
  if (buf.length === 0) return { encoding: "none", body: "" };
  const text = buf.toString("utf8");
  if (Buffer.from(text, "utf8").equals(buf)) {
    return { encoding: "utf8", body: text };
  }
  return { encoding: "base64", body: buf.toString("base64") };
}
