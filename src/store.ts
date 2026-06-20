import { homedir } from "node:os";
import { join } from "node:path";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import type { CapturedRequest } from "./types.js";

const DIR = join(homedir(), ".huk");
const FILE = join(DIR, "requests.ndjson");

function ensureDir(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

/** Read all persisted requests, oldest first. Corrupt lines are skipped. */
export function all(): CapturedRequest[] {
  if (!existsSync(FILE)) return [];
  const raw = readFileSync(FILE, "utf8");
  const out: CapturedRequest[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as CapturedRequest);
    } catch {
      // skip malformed line
    }
  }
  return out;
}

/** Next id to assign (1-based, monotonically increasing). */
export function nextId(): number {
  const records = all();
  return records.length === 0 ? 1 : (records[records.length - 1]!.id + 1);
}

/** Append a record as one NDJSON line. */
export function append(record: CapturedRequest): void {
  ensureDir();
  appendFileSync(FILE, JSON.stringify(record) + "\n", "utf8");
}

/** Look up a single record by id. */
export function get(id: number): CapturedRequest | undefined {
  return all().find((r) => r.id === id);
}

/** Remove all persisted requests. */
export function clear(): void {
  if (existsSync(FILE)) rmSync(FILE);
}

export const storePath = FILE;
