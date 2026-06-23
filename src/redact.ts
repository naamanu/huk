import type { CapturedRequest } from "./types.js";

/** Header names whose values are redacted by default (case-insensitive). */
export const DEFAULT_SENSITIVE_HEADERS = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "x-auth-token",
];

const PLACEHOLDER = "[redacted]";

function redactHeaders<T extends Record<string, string | string[]>>(
  headers: T,
  sensitive: Set<string>,
): T {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = sensitive.has(k.toLowerCase()) ? PLACEHOLDER : v;
  }
  return out as T;
}

/**
 * Return a copy of the record with sensitive header values replaced by
 * `[redacted]`. Covers both request headers and any captured downstream
 * response headers. The original (stored) record is left untouched.
 */
export function redactRecord(
  record: CapturedRequest,
  extra: string[] = [],
): CapturedRequest {
  const sensitive = new Set([
    ...DEFAULT_SENSITIVE_HEADERS,
    ...extra.map((s) => s.toLowerCase()),
  ]);
  const clone: CapturedRequest = {
    ...record,
    headers: redactHeaders(record.headers, sensitive),
  };
  if (record.forwarded?.responseHeaders) {
    clone.forwarded = {
      ...record.forwarded,
      responseHeaders: redactHeaders(
        record.forwarded.responseHeaders,
        sensitive,
      ),
    };
  }
  return clone;
}
