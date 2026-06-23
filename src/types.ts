/** How a captured body is encoded when persisted to disk. */
export type BodyEncoding = "utf8" | "base64" | "none";

/** Result of forwarding a captured request to a downstream target. */
export interface ForwardResult {
  target: string;
  status?: number;
  durationMs?: number;
  error?: string;
  /** Response headers returned by the downstream target. */
  responseHeaders?: Record<string, string>;
  /** Downstream response body (utf8, or base64 when binary), capped. */
  responseBody?: string;
  responseBodyEncoding?: BodyEncoding;
  /** True if the downstream response body exceeded the capture cap. */
  responseTruncated?: boolean;
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
  /** Raw request target exactly as received (path + query), for exact replay. */
  url: string;
  query: Record<string, string | string[]>;
  headers: Record<string, string | string[]>;
  bodyEncoding: BodyEncoding;
  /** Body as a string (utf8) or base64 depending on `bodyEncoding`. */
  body: string;
  /** Total body bytes received from the sender (before any capping). */
  bytes: number;
  /** True if the body exceeded the capture cap and the stored body is partial. */
  truncated: boolean;
  remoteAddr: string;
  response: ResponseInfo;
  forwarded?: ForwardResult;
}
