# Extension tests

Two layers:

- **`unit/`** — Pure Node `node:test` suites. Exercise individual
  extension modules (`error-toast.js`, etc.) without a browser. Fast.
- **`e2e/`** — Playwright smoke tests. Launch Chromium with the extension
  loaded, verify service worker + content script on live pages.

## Running

```bash
cd tests/extension
npm ci

# Unit only (no browser needed)
npm run test:unit

# E2E only
npx playwright install chromium
npm run test:e2e

# Both
npm test
```

## CI

See `.github/workflows/extension-tests.yml` (to be added in a follow-up).

## Adding a test

Unit tests go in `unit/*.test.mjs`. They must not require jsdom or any
heavyweight harness — use small DOM stubs. Run with `node --test`.

E2E tests go in `e2e/*.spec.mjs`. Use the `launchWithExtension()` helper
from `e2e/helpers.mjs` to get a persistent Chromium context with MarkView
loaded.
