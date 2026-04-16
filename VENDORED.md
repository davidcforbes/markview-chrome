# Vendored Third-Party Code

Files in this repository that are copied verbatim from upstream projects.
Pinned here so audits and upgrades are traceable.

| File | Upstream | Version | License | Source |
|------|----------|---------|---------|--------|
| `marked.min.js` | markedjs/marked | _TO VERIFY_ | MIT | https://github.com/markedjs/marked |
| `purify.min.js` | cure53/DOMPurify | _TO VERIFY_ | MPL-2.0 OR Apache-2.0 | https://github.com/cure53/DOMPurify |
| `codemirror-bundle.js` | built from `package.json` deps (`codemirror`, `@codemirror/lang-markdown`, `@codemirror/language-data`, `@codemirror/theme-one-dark`) | pinned via `package-lock.json` | MIT | https://codemirror.net/ |

## How to verify / refresh the versions

1. `marked.min.js` — the minified bundle used to include a version comment at
   the top. If missing, compute the SHA-256 and match against the
   `marked@x.y.z` release asset at
   https://github.com/markedjs/marked/releases:
   ```bash
   sha256sum marked.min.js
   ```
2. `purify.min.js` — same pattern against
   https://github.com/cure53/DOMPurify/releases.
3. `codemirror-bundle.js` — regenerate from source to reset provenance:
   ```bash
   npm ci && npx esbuild editor/index.ts --bundle --minify --format=iife --outfile=codemirror-bundle.js
   ```
   Commit `package-lock.json` alongside the bundle so the input tree is
   reproducible.

## Upgrade policy

- Upgrade on every CVE affecting a vendored file (Dependabot will open PRs
  for `package.json` deps; vendored min files must be refreshed by hand).
- Record the new version + SHA-256 + source URL in the table above in the
  same PR.
- Smoke test the extension against `test.md` after upgrading `marked` or
  `purify` — both are in the render hot path.

## Why vendored?

Chrome extension Manifest V3 forbids remote code loading. Each dep must be
bundled into the extension package at build time. Vendoring the minified
artifacts keeps the build step simple; the tradeoff is that upgrades require
a manual refresh.
