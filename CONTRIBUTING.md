# Contributing to huk

Thanks for your interest in improving `huk`! This is a small TypeScript CLI;
contributions of all sizes are welcome.

## Development setup

Requires **Node.js 20+**. [Bun](https://bun.sh) is used for installing and
building (the lockfile is `bun.lock`), but the published artifact is plain Node.

```sh
git clone https://github.com/naamanu/huk && cd huk
bun install
bun run dev -- listen        # run the CLI from source (no build needed)
```

Useful scripts:

| Command | What it does |
|---|---|
| `bun run dev -- <args>` | Run the CLI from source via `tsx` |
| `bun run typecheck` | Type-check with `tsc --noEmit` |
| `bun run build` | Bundle to `dist/` with `tsup` |
| `bun run test` | Build, then run the end-to-end tests (`node --test`) |
| `node dist/cli.js <args>` | Run the built CLI |

## Project layout

```
src/
  cli.ts            commander entry point, wires up subcommands
  commands/         one file per command (listen, list, show, replay, clear)
  server/           capture (parse request) and forward (proxy via fetch)
  tunnel.ts         ngrok / cloudflared public URL
  store.ts          NDJSON persistence in ~/.huk/
  format.ts         colored output helpers
  types.ts          shared CapturedRequest type
```

## Making a change

`main` is protected: direct pushes are not allowed, and CI must pass before a
PR can merge. So:

1. Branch off `main`: `git checkout -b fix/short-description`.
2. Make your change. Keep it focused and match the surrounding style.
3. Run `bun run typecheck` and `bun run test` locally before pushing.
4. Open a pull request. CI (`typecheck` + `build` + the end-to-end test suite)
   runs automatically and must be green to merge.
5. PRs are **squash-merged** into a single commit, so `main` stays linear — no
   need to tidy your branch history yourself.

## Style & conventions

- TypeScript, ES modules, `strict` mode. Prefer Node built-ins and the existing
  two runtime deps (`commander`, `picocolors`) over adding new ones.
- Match the existing formatting; there's no enforced linter, so keep diffs clean.
- Write commit/PR titles in the imperative mood (e.g. "add replay --header
  flag").

## Releasing

Cutting a release is a maintainer task — see [RELEASING.md](RELEASING.md).
