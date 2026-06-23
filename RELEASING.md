# Releasing

Publishing is automated via GitHub Actions
([`.github/workflows/release.yml`](.github/workflows/release.yml)):

1. Bump the version in `package.json` (e.g. `0.1.0` → `0.1.1`) and commit.
2. Push, then create a **GitHub Release** with tag `v<version>` (e.g. `v0.1.1`):
   `gh release create v0.1.1 --generate-notes`.
3. The workflow builds and runs `npm publish --provenance --access public`,
   pushing `@naamanu/huk@<version>` to npm. The tag must match the
   `package.json` version or the job fails the version guard.

## One-time prerequisites

- An npm token that **bypasses 2FA**, stored as the repo secret `NPM_TOKEN`.
  Use a **Granular Access Token** with "Bypass two-factor authentication"
  enabled and read/write on the `@naamanu` scope, or a classic **Automation**
  token. A plain "Publish" token will fail with `EOTP` in CI.
- The repo must be **public** for `--provenance` to work — npm rejects
  provenance from private sources (`E422`). To publish from a private repo
  instead, drop `--provenance` from the workflow and `publishConfig`.
