# Releasing MarkView

This document is the human runbook for cutting a new MarkView Chrome
extension release. The process is partly automated today; remaining manual
steps are flagged. See the "Future automation" section at the bottom for
what's coming.

## Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`):

- **PATCH** — bug fixes, dependency bumps, non-user-visible CI/docs changes
- **MINOR** — new features, behavior changes that don't break existing use
- **MAJOR** — breaking changes to the user experience or public API surface

Pre-release tags are allowed: `v0.5.3-rc.1`, `v0.5.3-dev`, etc. Only tags
matching `v*` trigger the release workflow; pre-releases are published as
GitHub pre-releases.

## Before you start

- Confirm the previous release's Chrome Web Store status is **Published** or
  **Unlisted** (not "in review"). Submitting a second version while a review
  is pending stacks the queue and can slow things down.
- Confirm `main` CI is green: https://github.com/davidcforbes/markview-chrome/actions
- Confirm your local signing key is set up (see CONTRIBUTING.md) — the
  tag you create below must be signed.

## 1. Open a bump PR

Bump the three canonical version strings to match. All live in files you
can grep with `rg "\"version\"" manifest.json package.json`:

- `manifest.json` → `"version": "X.Y.Z"`
- `package.json` → `"version": "X.Y.Z"`
- `CHANGELOG.md` → move the `## [Unreleased]` entries under a new
  `## [X.Y.Z] — YYYY-MM-DD` header, leaving an empty `## [Unreleased]`
  block above it for future work

```bash
git checkout -b chore/release-vX.Y.Z
# edit the three files
git add manifest.json package.json CHANGELOG.md
git commit -S -m "chore: release vX.Y.Z"
git push -u origin chore/release-vX.Y.Z
gh pr create --fill
```

Wait for CI to go green. Squash-merge:

```bash
gh pr merge chore/release-vX.Y.Z --squash --admin --delete-branch
```

## 2. Tag the release

Tags MUST point to the merged-to-main version-bump commit, not a feature
branch commit.

```bash
git checkout main
git pull --ff-only
git tag -s vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

The `-s` flag signs the tag with your configured signing key. Unsigned tags
are not accepted by the release workflow.

## 3. Wait for the release workflow

Pushing the tag triggers `.github/workflows/release.yml`, which:

1. Validates that `manifest.json` version matches the tag
2. Packages the extension into `markview-chrome-vX.Y.Z.zip` (excluding
   tests, docs, store-assets, node_modules, editor sources, markdown)
3. Signs the zip with Sigstore keyless cosign (OIDC via GitHub Actions) —
   produces `.sig` and `.pem` alongside the zip
4. Generates a `.sha256` checksum
5. Creates a GitHub Release with auto-generated notes and all four
   artifacts attached

Watch it run:

```bash
gh run watch --workflow release.yml --exit-status
```

If the workflow fails, fix the issue on main (or delete the tag, fix, re-tag
at a new commit). Do not rewrite published tags — delete and re-tag with a
new version string instead.

## 4. Verify the signed release

Download artifacts locally and verify the signature:

```bash
ZIP="markview-chrome-vX.Y.Z.zip"
gh release download vX.Y.Z --repo davidcforbes/markview-chrome --pattern "*"

# checksum
sha256sum -c "$ZIP.sha256"

# cosign signature (requires cosign installed: brew install cosign)
cosign verify-blob \
  --certificate-identity "https://github.com/davidcforbes/markview-chrome/.github/workflows/release.yml@refs/tags/vX.Y.Z" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  --signature "$ZIP.sig" \
  --certificate "$ZIP.pem" \
  "$ZIP"
```

`cosign verify-blob` should print `Verified OK`. If it doesn't, **do not
publish to the Chrome Web Store** — something in the release pipeline is
wrong.

## 5. Upload to Chrome Web Store

Currently manual. (Issue MV-n527 will automate this.)

1. Log in to the Chrome Web Store Developer Dashboard as
   `chris@ForbesAssetManagement.com`:
   https://chrome.google.com/webstore/devconsole
2. Select the MarkView listing (extension ID
   `abmaiejejegdkmihfflcechpnhgppnnd`)
3. Go to **Package**, click **Upload new package**, pick
   `markview-chrome-vX.Y.Z.zip`
4. Wait for the package to process
5. If manifest changes introduced new permissions, update **Privacy** tab
   justifications
6. Click **Submit for review**

Review time is typically 1–3 business days for patch releases; longer for
releases with new permissions or host patterns.

## 6. Post-release housekeeping

- Confirm the GitHub Release is marked **Latest**
- Close any beads issues that shipped in this version (`bd close MV-<id>
  --reason "Shipped in vX.Y.Z"`)
- If the release included post-release work (e.g. a follow-up PR bumping
  to `X.Y.(Z+1)-dev`), open that now — automation for this lives in
  MV-o5g2

## If something goes wrong

**Tag already exists but release failed:** delete the tag both locally and
on the remote, then re-tag at a new commit:
```bash
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
# …fix the issue, merge fix to main…
git tag -s vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```
Never rewrite a release that was already uploaded to the Chrome Web Store.
Cut a new patch version instead.

**Release workflow fails at cosign step:** usually an OIDC trust issue
between the GitHub Actions runner and Sigstore. Re-run the workflow; if it
keeps failing, check that `id-token: write` permission is present on the
release job.

**CWS reviewers reject the upload:** fix the issue on main, cut a new
patch version. Do not try to overwrite the pending submission — withdraw
it from CWS first if needed.

## Future automation

- **MV-qcwm** — `bump-version` workflow_dispatch that opens the bump PR for
  you (step 1)
- **MV-m15f** — `release-drafter` auto-collects PR titles into draft
  release notes (step 3)
- **MV-n527** — `cws-publish` workflow uploads to Chrome Web Store
  automatically on GitHub Release published (step 5)
- **MV-o5g2** — post-release auto-bump to next-dev-version PR (step 6)
- **MV-sv7r** — OAuth refresh-token helper for when the CWS API token
  rotates every ~6 months

Once all of the above ship, the human steps collapse to: open bump PR
(via the dispatch button) → approve + merge → push tag → watch it land.
