# Badges

Living reference for the badge row at the top of `README.md`. If a badge ever
breaks or goes grey, this doc explains how to diagnose and fix it.

## Current badges

| Badge | Source | Green means |
|-------|--------|-------------|
| CI | `.github/workflows/ci.yml` run on `main` | Unit tests + npm audit + manifest validation all pass |
| CodeQL | `.github/workflows/codeql.yml` | 0 security alerts in the JS/TS code |
| Semgrep | `.github/workflows/semgrep.yml` | 0 findings in OWASP Top Ten / JS / secrets rulesets |
| OpenSSF Scorecard | `.github/workflows/scorecard.yml` + published to https://scorecard.dev | Supply-chain security score (0–10, higher is better) |
| License | Static shields.io badge | PolyForm Noncommercial 1.0.0 |
| Contributor Covenant | Static shields.io badge | v2.1 adopted |
| GitHub release | Dynamic shields.io | Latest semver-sorted release tag |
| Last commit | Dynamic shields.io | Recent activity — proxy for "maintained" |

## Scorecard targets

Each criterion below is worth 0–10 on the Scorecard. Realistic target is **≥8.0 overall**.

| Criterion | Current | Target | How |
|-----------|---------|--------|-----|
| Binary-Artifacts | ~5 | 7 | Document vendored mins in `VENDORED.md` (done) |
| Branch-Protection | 0 | 8 | Enable required reviews + status checks on `main` in repo Settings → Branches |
| CI-Tests | 10 | 10 | ✅ CI runs on every PR |
| Code-Review | varies | 8 | Enforced by branch protection |
| Contributors | low | — | Improves organically |
| Dangerous-Workflow | 10 | 10 | ✅ No `pull_request_target` without guards |
| Dependency-Update-Tool | 10 | 10 | ✅ Dependabot enabled |
| Fuzzing | 0 | skip | Not feasible for a Chrome extension |
| License | 10 | 10 | ✅ `LICENSE` present |
| Maintained | 10 | 10 | ✅ Active commits |
| Packaging | 0 | skip | Chrome Web Store doesn't count; Scorecard loses −0.5 |
| Pinned-Dependencies | 10 | 10 | ✅ All `uses:` pinned to SHA + comment |
| SAST | 10 | 10 | ✅ CodeQL + Semgrep |
| Security-Policy | 10 | 10 | ✅ `SECURITY.md` present |
| Signed-Releases | 0 | 7 | Future: wire `sigstore/cosign` into release workflow |
| Token-Permissions | 10 | 10 | ✅ All workflows have top-level `permissions: contents: read` |
| Vulnerabilities | 10 | 10 | ✅ `npm audit` passes in CI |

## OpenSSF Best Practices Badge

Registered at https://www.bestpractices.dev/. Passing → Silver → Gold path.

- **Passing**: ~66 criteria, most already met. See `SECURITY.md`, `CONTRIBUTING.md`, `LICENSE`, CI/test presence.
- **Silver**: adds signed commits, versioned release notes (we have `CHANGELOG.md`), a documented governance process.
- **Gold**: adds 2FA enforcement, formal security advisory workflow, fuzz testing. Aspirational.

## Adding a new badge

1. Check it's a long-lived service (not a 2025 startup that'll disappear).
2. Add a task in beads under epic MV-co4j (badge coordination) describing setup.
3. Add the badge markdown to the README in a PR — don't just paste into `main`.
4. Record in the table above.

## Removing a broken badge

If a service disappears or a workflow is decommissioned:

1. Comment out the line in README with a 1-line explanation.
2. Open an issue describing why.
3. Don't silently delete — readers who see a grey/404 badge are harmed less than readers confused by an unexplained removal.
