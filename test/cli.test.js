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
async function startSink() {
  const port = await freePort();
  const received = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ method: req.method, url: req.url, body });
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("sink-ok");
    });
  });
  await new Promise((resolve) => server.listen(port, resolve));
  return {
    url: `http://localhost:${port}`,
    received,
    stop: () => new Promise((resolve) => server.close(resolve)),
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
