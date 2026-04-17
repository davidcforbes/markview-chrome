# Contributing

Thanks for your interest in contributing! This repository contains the
MarkView Chrome extension — a Manifest V3 extension written in vanilla
JavaScript.

## Before you file

- **Bug reports**: search existing issues first. Include Chrome version,
  OS, the URL or file where the bug reproduces, and any console errors.
  The bug report template walks you through this.
- **Feature requests**: describe the problem you're trying to solve, not
  just the solution. The feature request template is a good guide.
- **Security vulnerabilities**: do NOT open a public issue. See
  [SECURITY.md](SECURITY.md).

## Setting up a dev environment

```bash
git clone https://github.com/davidcforbes/markview-chrome.git
cd markview-chrome
cd tests && npm ci && cd ..
```

To load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this directory
4. Reload the extension after every change

To rebuild the CodeMirror editor bundle after editing `editor/`:

```bash
npm ci
npm run build
```

## Running tests

```bash
cd tests
npm ci
npm run test:unit         # Node test runner — fast, no browser needed
npm run test:coverage     # Run tests with c8 coverage; outputs tests/coverage/
npm run test:e2e          # Playwright — launches Chromium with the extension
npm test                  # unit + e2e
```

Target: 80%+ line coverage on tracked modules (`detect.js`, `error-toast.js`).
Current coverage is visible on the README's Codecov badge.

## Test policy

As major new functionality is added, tests of that functionality MUST be
added to the automated suite. The PR template's "Checklist" enforces this
at review time. Exceptions:

- Docs-only PRs
- CI / tooling-only PRs
- Pure dependency updates via Dependabot

Reviewers may ask you to add tests if the PR touches observable behaviour
and doesn't include them.

## Code style

- Vanilla JS, no build step required for the runtime. The only bundle is
  CodeMirror, which lives in `editor/` and produces `codemirror-bundle.js`
  via esbuild.
- Use semicolons; match the surrounding style.
- Keep the MV3 service-worker stateless. Use `chrome.storage` for anything
  that must persist.
- DOMPurify wraps every rendered-HTML assignment. Don't bypass it.
- Prefer pure, exported functions in `detect.js`-style modules over
  closure-scoped helpers in `content-script.js` — easier to test.

## PR checklist

The `.github/PULL_REQUEST_TEMPLATE.md` is loaded automatically when you
open a PR. At minimum:

- Tests pass (`cd tests && npm test`)
- No new `console.warn` / `console.error` for expected flows (route
  user-facing errors through `markviewShowError` from `error-toast.js`)
- `CHANGELOG.md` gets an entry under `## [Unreleased]`
- Screenshots for any UI change

## Signing your commits

`main` requires **signed commits** (every commit on the protected branch is
checked for a valid signature). Before your first push, configure local
signing. SSH signing is the easiest path — no GPG, no passphrase.

1. Generate an ed25519 key if you don't already have one:
   ```bash
   ssh-keygen -t ed25519 -C "your-email@example.com"
   ```
2. Tell git to sign with SSH:
   ```bash
   git config --global gpg.format ssh
   git config --global user.signingkey ~/.ssh/id_ed25519.pub
   git config --global commit.gpgsign true
   git config --global tag.gpgsign true
   ```
3. Add the **public** key to GitHub as a **Signing Key** (not an Auth key —
   it's a separate list): https://github.com/settings/ssh/new → select
   "Signing Key" as the key type. The same key can be both Auth and Signing;
   if so, add it twice (once under each type).

Verify that the first commit you push shows a green **Verified** badge on
GitHub. If it shows "Unverified", the pubkey upload at step 3 didn't land
under Signing Keys.

## Branch protection

`main` is protected with the following rules (enforced for admins too):

- **Require a pull request before merging** — no direct pushes
- **Required status checks must pass** — 12 contexts including unit tests,
  coverage, manifest validation, npm audit, CodeQL, Semgrep, Scorecard,
  FOSSA (license + security + dependency), Snyk, codecov/patch
- **Branches must be up to date** before merging
- **Conversation resolution** required
- **Linear history** required (no merge commits)
- **Signed commits** required (see previous section)
- **Force pushes** and **deletions** blocked

## License

By submitting a pull request you agree your contribution is licensed
under the project's [MIT License](LICENSE). No CLA required.
