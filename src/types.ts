/** How a captured body is encoded when persisted to disk. */
export type BodyEncoding = "utf8" | "base64" | "none";

/** Result of forwarding a captured request to a downstream target. */
export interface ForwardResult {
  target: string;
  status?: number;
  durationMs?: number;
  error?: string;
}

/** Response the CLI returned to the original sender. */
export interface ResponseInfo {
  status: number;
  contentType: string;
}

/** A single HTTP request captured by `huk listen`. */
export interface CapturedRequest {
  id: number;
  timestamp: string; // ISO 8601
  method: string;
  path: string; // path without query string
  query: Record<string, string | string[]>;
  headers: Record<string, string | string[]>;
  bodyEncoding: BodyEncoding;
  /** Body as a string (utf8) or base64 depending on `bodyEncoding`. */
  body: string;
  remoteAddr: string;
  response: ResponseInfo;
  forwarded?: ForwardResult;
}
