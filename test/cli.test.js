// End-to-end tests for the huk CLI.
//
// These are black-box: they spawn the built `dist/cli.js` exactly as a user
// would run it, drive it over real HTTP, and assert on its output and the
// persisted store. Each test runs with an isolated HOME (so ~/.huk points at a
// throwaway temp dir) and NO_COLOR=1 (so stdout is plain text to assert on).
//
// Run with: node --test test/   (build dist/ first)

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** A fresh, isolated HOME for a test; cleaned up by the caller. */
async function makeHome() {
  return mkdtemp(join(tmpdir(), "huk-test-"));
}

function storeFile(home) {
  return join(home, ".huk", "requests.ndjson");
}

/** Read the persisted records for a given HOME. */
async function readStore(home) {
  const file = storeFile(home);
  if (!existsSync(file)) return [];
  const raw = await readFile(file, "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

/** Run a one-shot CLI command to completion. */
function runCli(args, home) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, HOME: home, NO_COLOR: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** Grab a free TCP port. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** TCP-level readiness check (does not generate an HTTP request). */
function canConnect(port) {
  return new Promise((resolve) => {
    const sock = net.connect(port, "127.0.0.1");
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => resolve(false));
  });
}

async function waitForPort(port, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await canConnect(port)) return;
    await delay(50);
  }
  throw new Error(`server on :${port} did not start in time`);
}

/** Start `huk listen` and wait until it accepts connections. */
async function startListen(extraArgs, home) {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [CLI, "listen", "--port", String(port), ...extraArgs],
    { env: { ...process.env, HOME: home, NO_COLOR: "1" } },
  );
  // Drain output so the pipe never blocks the child.
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  await waitForPort(port);
  return {
    port,
    url: `http://localhost:${port}`,
    stop: () =>
      new Promise((resolve) => {
        child.once("close", resolve);
        child.kill("SIGINT");
      }),
  };
}

/** Start a downstream sink server that records what it receives. */
async function startSink(respond = {}) {
  const {
    status = 200,
    headers = { "content-type": "text/plain" },
    body: respBody = "sink-ok",
  } = respond;
  const port = await freePort();
  const received = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ method: req.method, url: req.url, body });
      res.writeHead(status, headers);
      res.end(respBody);
    });
  });
  await new Promise((resolve) => server.listen(port, resolve));
  return {
    url: `http://localhost:${port}`,
    received,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** A sink that accepts connections but never responds (to test timeouts). */
async function startHangingSink() {
  const port = await freePort();
  const sockets = new Set();
  const server = http.createServer(() => {
    /* intentionally never responds */
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise((resolve) => server.listen(port, resolve));
  return {
    url: `http://localhost:${port}`,
    stop: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(resolve);
      }),
  };
}

test("huk --version prints a semver", async () => {
  const home = await makeHome();
  try {
    const { code, stdout } = await runCli(["--version"], home);
    assert.equal(code, 0);
    assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("captures a request, returns default 200 ok, and persists it", async () => {
  const home = await makeHome();
  const server = await startListen([], home);
  try {
    const res = await fetch(`${server.url}/hook?x=1&x=2`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "ping" }),
    });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok");

    const records = await readStore(home);
    assert.equal(records.length, 1);
    const rec = records[0];
    assert.equal(rec.id, 1);
    assert.equal(rec.method, "POST");
    assert.equal(rec.path, "/hook");
    assert.deepEqual(rec.query, { x: ["1", "2"] });
    assert.match(rec.body, /ping/);
  } finally {
    await server.stop();
    await rm(home, { recursive: true, force: true });
  }
});

test("list, show, and clear operate on persisted requests", async () => {
  const home = await makeHome();
  const server = await startListen([], home);
  try {
    await fetch(`${server.url}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 42 }),
    });
    await server.stop();

    const list = await runCli(["list"], home);
    assert.equal(list.code, 0);
    assert.match(list.stdout, /\/orders/);

    const show = await runCli(["show", "1"], home);
    assert.equal(show.code, 0);
    assert.match(show.stdout, /POST/);
    assert.match(show.stdout, /42/); // body is pretty-printed

    const badShow = await runCli(["show", "999"], home);
    assert.notEqual(badShow.code, 0); // unknown id errors

    const clear = await runCli(["clear"], home);
    assert.equal(clear.code, 0);
    const afterClear = await runCli(["list"], home);
    assert.match(afterClear.stdout, /No requests/i);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("custom --status/--body/--content-type is returned to the sender", async () => {
  const home = await makeHome();
  const server = await startListen(
    ["--status", "202", "--body", '{"ok":true}', "--content-type", "application/json"],
    home,
  );
  try {
    const res = await fetch(`${server.url}/x`, { method: "POST" });
    assert.equal(res.status, 202);
    assert.equal(res.headers.get("content-type"), "application/json");
    assert.equal(await res.text(), '{"ok":true}');
  } finally {
    await server.stop();
    await rm(home, { recursive: true, force: true });
  }
});

test("--forward proxies the request to a downstream app", async () => {
  const home = await makeHome();
  const sink = await startSink();
  const server = await startListen(["--forward", sink.url], home);
  try {
    const res = await fetch(`${server.url}/pay?a=1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 10 }),
    });
    // huk still returns its own (default) response to the original caller.
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok");

    assert.equal(sink.received.length, 1);
    assert.equal(sink.received[0].method, "POST");
    assert.equal(sink.received[0].url, "/pay?a=1");
    assert.match(sink.received[0].body, /amount/);
  } finally {
    await server.stop();
    await sink.stop();
    await rm(home, { recursive: true, force: true });
  }
});

test("replay re-sends a stored request to a target", async () => {
  const home = await makeHome();
  const server = await startListen([], home);
  try {
    await fetch(`${server.url}/webhook?token=abc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });
    await server.stop();

    const sink = await startSink();
    try {
      const replay = await runCli(["replay", "1", "--to", sink.url], home);
      assert.equal(replay.code, 0);
      assert.match(replay.stdout, /Done/);

      assert.equal(sink.received.length, 1);
      assert.equal(sink.received[0].method, "POST");
      assert.equal(sink.received[0].url, "/webhook?token=abc");
      assert.match(sink.received[0].body, /world/);
    } finally {
      await sink.stop();
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("--no-store skips persistence", async () => {
  const home = await makeHome();
  const server = await startListen(["--no-store"], home);
  try {
    const res = await fetch(`${server.url}/x`, { method: "POST" });
    assert.equal(res.status, 200);
    await server.stop();

    assert.equal(existsSync(storeFile(home)), false);
    const list = await runCli(["list"], home);
    assert.match(list.stdout, /No requests/i);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("--forward aborts a hung downstream after --timeout", async () => {
  const home = await makeHome();
  const sink = await startHangingSink();
  const server = await startListen(["--forward", sink.url, "--timeout", "300"], home);
  try {
    const start = Date.now();
    const res = await fetch(`${server.url}/x`, { method: "POST", body: "hi" });
    const elapsed = Date.now() - start;

    // huk still answers the original caller despite the hung downstream.
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok");
    assert.ok(elapsed < 3000, `caller waited ${elapsed}ms (should be ~300ms)`);

    const [rec] = await readStore(home);
    assert.ok(rec.forwarded);
    assert.match(rec.forwarded.error, /timed out/i);
  } finally {
    await server.stop();
    await sink.stop();
    await rm(home, { recursive: true, force: true });
  }
});

test("oversized bodies are truncated and flagged", async () => {
  const home = await makeHome();
  const server = await startListen([], home);
  try {
    const big = "a".repeat(6 * 1024 * 1024); // 6 MB, over the 5 MB cap
    const res = await fetch(`${server.url}/big`, { method: "POST", body: big });
    assert.equal(res.status, 200);

    const [rec] = await readStore(home);
    assert.equal(rec.truncated, true);
    assert.equal(rec.bytes, 6 * 1024 * 1024);
    // Stored body is capped at exactly 5 MB.
    assert.equal(Buffer.byteLength(rec.body, "utf8"), 5 * 1024 * 1024);

    const show = await runCli(["show", "1"], home);
    assert.match(show.stdout, /truncated/i);
  } finally {
    await server.stop();
    await rm(home, { recursive: true, force: true });
  }
});

test("list --limit rejects non-positive and non-numeric values", async () => {
  const home = await makeHome();
  try {
    for (const bad of ["0", "-3", "abc"]) {
      const r = await runCli(["list", "--limit", bad], home);
      assert.notEqual(r.code, 0, `--limit ${bad} should fail`);
      assert.match(r.stderr, /positive integer/i);
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("show --json prints the raw record for scripting", async () => {
  const home = await makeHome();
  const server = await startListen([], home);
  try {
    await fetch(`${server.url}/j?a=1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ n: 1 }),
    });
    await server.stop();

    const r = await runCli(["show", "1", "--json"], home);
    assert.equal(r.code, 0);
    const obj = JSON.parse(r.stdout);
    assert.equal(obj.id, 1);
    assert.equal(obj.method, "POST");
    assert.equal(obj.path, "/j");
    assert.equal(obj.truncated, false);
    assert.equal(typeof obj.bytes, "number");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("replay re-sends the exact original URL (encoding + order preserved)", async () => {
  const home = await makeHome();
  const server = await startListen([], home);
  try {
    // Out-of-order keys and a percent-encoded value.
    await fetch(`${server.url}/p?b=2&a=1&x=%20hi`, { method: "POST", body: "x" });
    await server.stop();

    const [rec] = await readStore(home);
    assert.equal(rec.url, "/p?b=2&a=1&x=%20hi");

    const sink = await startSink();
    try {
      const replay = await runCli(["replay", "1", "--to", sink.url], home);
      assert.equal(replay.code, 0);
      // Replayed URL is byte-identical to what was captured.
      assert.equal(sink.received[0].url, rec.url);
    } finally {
      await sink.stop();
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("forward captures the downstream response body and headers", async () => {
  const home = await makeHome();
  const sink = await startSink({
    status: 201,
    headers: { "content-type": "application/json", "x-sink": "yes" },
    body: '{"downstream":true}',
  });
  const server = await startListen(["--forward", sink.url], home);
  try {
    await fetch(`${server.url}/h`, { method: "POST", body: "hi" });
    await server.stop();

    const [rec] = await readStore(home);
    assert.equal(rec.forwarded.status, 201);
    assert.equal(rec.forwarded.responseBody, '{"downstream":true}');
    assert.equal(rec.forwarded.responseHeaders["x-sink"], "yes");

    const show = await runCli(["show", "1"], home);
    assert.match(show.stdout, /response body/);
    assert.match(show.stdout, /downstream/);
    assert.match(show.stdout, /x-sink/);
  } finally {
    await sink.stop();
    await rm(home, { recursive: true, force: true });
  }
});

test("binary bodies are stored as base64 and shown as a hex preview", async () => {
  const home = await makeHome();
  const server = await startListen([], home);
  try {
    const bin = new Uint8Array([0x00, 0x01, 0xff, 0xfe, 0x80, 0x7f]);
    await fetch(`${server.url}/bin`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: bin,
    });
    await server.stop();

    const [rec] = await readStore(home);
    assert.equal(rec.bodyEncoding, "base64");
    assert.equal(Buffer.from(rec.body, "base64").length, bin.length);

    const show = await runCli(["show", "1"], home);
    assert.match(show.stdout, /binary/i);
    assert.match(show.stdout, /hex:/);
    assert.match(show.stdout, /00 01 ff fe/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("list filters by method, path, status, and since", async () => {
  const home = await makeHome();
  const server = await startListen([], home);
  try {
    await fetch(`${server.url}/one`, { method: "POST", body: "x" });
    await fetch(`${server.url}/two`, { method: "GET" });
    await fetch(`${server.url}/three`, { method: "POST", body: "y" });
    await server.stop();

    const byMethod = await runCli(["list", "--method", "post"], home);
    assert.match(byMethod.stdout, /\/one/);
    assert.match(byMethod.stdout, /\/three/);
    assert.doesNotMatch(byMethod.stdout, /\/two/);

    const byPath = await runCli(["list", "--path", "two"], home);
    assert.match(byPath.stdout, /\/two/);
    assert.doesNotMatch(byPath.stdout, /\/one/);

    // All responses are 200 by default, so 599 matches nothing.
    const noStatus = await runCli(["list", "--status", "599"], home);
    assert.match(noStatus.stdout, /No requests match/i);

    const sinceOk = await runCli(["list", "--since", "1h"], home);
    assert.match(sinceOk.stdout, /\/one/);

    const badSince = await runCli(["list", "--since", "bogus"], home);
    assert.notEqual(badSince.code, 0);
    assert.match(badSince.stderr, /30s|10m|2h|1d/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
