# huk

A tiny CLI for debugging webhooks — a minimal, local-first take on
[usewebhook.com](https://usewebhook.com). Stand up an endpoint, watch every
request hit it in your terminal, and forward or replay them to your local app.

## Features

- **Capture** any HTTP request and pretty-print method, headers, query and body
- **Forward** each request to a local app while still inspecting it
- **Persist** history to `~/.huk/requests.ndjson` so you can review later
- **Replay** a stored request to any target by id
- **Custom response** — control the status/body/content-type sent back
- **Public URL** via `--tunnel` (uses an installed `ngrok`, falls back to `cloudflared`)

## Requirements

- **Node.js 20+**
- Optional, only for `--tunnel`: [`ngrok`](https://ngrok.com/download) or
  [`cloudflared`](https://github.com/cloudflare/cloudflared) on your `PATH`.

## Install

```sh
npm install -g @naamanu/huk
```

## Quickstart

```sh
# 1. Start capturing on http://localhost:4000
huk listen

# 2. In another terminal, send something to it
curl -X POST http://localhost:4000/hook \
  -H 'content-type: application/json' \
  -d '{"event":"ping"}'
```

The request appears in the `huk listen` terminal as a colored summary, and the
sender gets back `200 ok`. Inspect it later with `huk list` and `huk show 1`.

### Run from source

```sh
git clone https://github.com/naamanu/huk && cd huk
bun install        # or: npm install
bun run build
node dist/cli.js listen        # or `npm link` for a global `huk`
```

During development you can skip the build with `bun run dev -- listen`.

## Usage

```sh
huk listen [options]            # start the capture server (main command)
  -p, --port <n>                # default 4000
  -t, --tunnel                  # expose a public URL via ngrok/cloudflared
  -f, --forward <url>           # proxy each request to this URL too
  --timeout <ms>                # forward timeout, default 30000
  --status <code>               # response status (default 200)
  --body <string>               # response body (default "ok")
  --content-type <type>         # response content-type (default text/plain)
  --no-store                    # don't persist

huk list [options]              # list captured requests
  -n, --limit <n>               # show only the most recent N (must be > 0)
  --method <method>             # filter by HTTP method (e.g. POST)
  --path <substring>            # filter by path substring
  --status <code>               # filter by response status code
  --since <duration>            # only newer than e.g. 30s, 10m, 2h, 1d
huk show <id> [--json]          # full detail of one request (--json for scripting)
huk replay <id> --to <url>      # re-send a stored request
  [--timeout <ms>]              # replay timeout, default 30000
huk clear                       # wipe history
```

### Examples

```sh
# Capture on :4000 and forward everything to your app on :3000
huk listen --forward http://localhost:3000

# Get a public URL so Stripe/GitHub can reach you
# (requires ngrok or cloudflared installed; without one it stays local-only)
huk listen --tunnel

# Return a custom JSON response to senders
huk listen --status 202 --body '{"ok":true}' --content-type application/json

# Inspect and replay
huk list
huk show 1
huk replay 1 --to http://localhost:3000
```

## How it works

`huk listen` runs a Node `http` server. Each request is read (body capped at
5 MB — larger bodies are stored partially and flagged `truncated`, with the
original byte count recorded), printed as a colored one-line summary, optionally
forwarded to your app with `fetch` (subject to `--timeout`), and — unless
`--no-store` is set — appended as one JSON line to `~/.huk/requests.ndjson`.
Each captured request gets a sequential id you can pass to `huk show` and
`huk replay`.

Forwarding records the downstream response too (status, headers, and body —
body capped at 64 KB), shown by `huk show`. `huk replay` re-sends the **exact**
original request target (path + query, byte-for-byte). Binary bodies are stored
as base64 and displayed as a size + hex preview rather than garbled text.

With `--tunnel`, huk tries `ngrok` first (spawning it and polling its local
agent API at `127.0.0.1:4040` for the public URL), then falls back to
`cloudflared`. If neither binary is installed it prints an install hint and
keeps running local-only. Note that `ngrok` needs a one-time
`ngrok config add-authtoken <token>` (free account); `cloudflared` quick
tunnels need no account.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup and the PR workflow, and
[RELEASING.md](RELEASING.md) for maintainer release steps.

## License

MIT

