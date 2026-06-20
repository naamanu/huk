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

## Install

```sh
npm install
npm run build
npm link        # optional: makes `huk` available globally
```

Or run without building during development:

```sh
npm run dev -- listen --port 4000
```

## Usage

```sh
huk listen [options]            # start the capture server (main command)
  -p, --port <n>                # default 4000
  -t, --tunnel                  # expose a public URL via ngrok/cloudflared
  -f, --forward <url>           # proxy each request to this URL too
  --status <code>               # response status (default 200)
  --body <string>               # response body (default "ok")
  --content-type <type>         # response content-type (default text/plain)
  --no-store                    # don't persist

huk list [-n <limit>]           # list captured requests
huk show <id>                   # full detail of one request
huk replay <id> --to <url>      # re-send a stored request
huk clear                       # wipe history
```

### Examples

```sh
# Capture on :4000 and forward everything to your app on :3000
huk listen --forward http://localhost:3000

# Get a public URL so Stripe/GitHub can reach you
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
5 MB), printed as a colored one-line summary, optionally forwarded with `fetch`,
and appended to an NDJSON file in `~/.huk/`. `--tunnel` shells out to `ngrok`
(polling its local agent API at `127.0.0.1:4040`) or `cloudflared`.

## License

MIT
