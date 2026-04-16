# Security Policy

## Supported Versions

Only the latest minor release of MarkView receives security updates. Older
versions should be upgraded.

| Version | Supported |
|---------|-----------|
| 0.5.x   | ✅        |
| < 0.5   | ❌        |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email `chris@ForbesAssetManagement.com` with:

- A description of the issue and its impact
- Steps to reproduce (PoC preferred)
- Affected versions
- Any known mitigations

You will receive an acknowledgement within **3 business days**. We will keep you
informed of progress at least weekly until the issue is resolved.

If the report is accepted, we will:

1. Confirm the vulnerability and determine affected versions
2. Prepare a fix and a coordinated release
3. Credit the reporter in the release notes (unless anonymity is requested)

## Safe Harbor

We consider security research conducted in good faith to be authorized
activity. We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations, destruction of data,
  and interruption or degradation of services
- Only interact with accounts they own or with explicit permission of the
  account holder
- Do not exploit a security issue beyond the minimum necessary to confirm it
- Provide us a reasonable amount of time to resolve the issue before public
  disclosure (default: 90 days)

## Scope

In scope:

- The MarkView Chrome extension (this repository)

Out of scope:

- Third-party dependencies in  or vendored libraries — report upstream first
- Issues requiring physical access to the user's machine
- Social engineering
- Denial of service via resource exhaustion on a single machine
