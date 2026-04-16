# Privacy Policy

_Last updated: 2026-04-16_

MarkView is a markdown viewer for Chrome, desktop Windows, Microsoft Teams, and
Microsoft Outlook. This policy describes what data the software handles, where
it goes, and what is retained.

## Summary

- **No analytics, no telemetry, no tracking.** MarkView does not phone home.
- **No accounts.** The only identity MarkView ever sees is the one you already
  use with Google Drive, SharePoint, OneDrive, Dropbox, or Box — and only when
  you explicitly open a file from those providers.
- **No servers we operate.** All markdown parsing and rendering happens on
  your device. Network calls go directly from the extension to the cloud
  provider you are already authenticated with.

## What MarkView handles

### Markdown file content

- Fetched on demand when you open a `.md` / `.markdown` file in Chrome or the
  desktop app.
- Held in memory while rendering. The Chrome extension stores content briefly
  in `chrome.storage.session` to pass it from the content script to the
  viewer tab; the service worker deletes each entry immediately after the
  viewer reads it (`service-worker.js:110`).
- Not transmitted to MarkView servers. There are no MarkView servers.

### User preferences

- Theme, color scheme, font size, editor settings.
- Stored in `chrome.storage.sync` so preferences follow you across Chrome
  installations signed into the same Google profile.
- Never contain file content, file paths, or auth tokens.

### OAuth tokens (Google Drive only)

- When you open a `.md` in Google Drive, the extension uses Chrome's
  `identity.getAuthToken()` API to obtain a token scoped to
  `https://www.googleapis.com/auth/drive.readonly`.
- The token is held by Chrome. MarkView does not copy, log, or persist it.
- Revoke any time at https://myaccount.google.com/permissions.

### SharePoint / OneDrive / Dropbox / Box

- When you open a markdown file hosted at one of these providers, MarkView's
  content script fetches the file directly from the provider's own API using
  the session cookies your browser already has (same-origin request).
- No third party sits between you and the provider.
- MarkView never receives your password; it reuses your existing web session.

### Native messaging host (optional AI features)

- When the MarkView desktop installer is present, the Chrome extension can
  connect to `markview-host.exe` over a local stdio pipe (Chrome's
  `nativeMessaging` API).
- The host runs entirely on your machine. It does not open network sockets.
- If you invoke the AI assistant, the host forwards your markdown and your
  prompt to the locally installed Claude Code CLI. From that point the
  Anthropic API privacy policy applies:
  https://www.anthropic.com/legal/privacy.
- If the desktop host is not installed, this feature is simply unavailable —
  the extension degrades silently.

## What MarkView does NOT do

- No analytics, error reporting, or performance beacons.
- No background network requests outside of the user-initiated file fetch
  paths described above.
- No cross-site tracking or third-party cookies.
- No sale or sharing of data with anyone. There is nothing to sell.

## Data retention

| Surface                            | Retention                                |
|------------------------------------|------------------------------------------|
| `chrome.storage.session` markdown  | Until viewer reads, then deleted         |
| `chrome.storage.sync` preferences  | Until you clear Chrome sync or uninstall |
| OAuth tokens                       | Managed by Chrome; MarkView does not persist |
| Desktop temp files                 | Deleted when the app closes              |
| Logs                               | Local console only; no upload            |

## Third-party services

MarkView never adds a third party. It only talks to services **you already
use and have authenticated with**: Google Drive, Microsoft SharePoint /
OneDrive / Teams, Dropbox, Box, and (optionally) your local Claude Code CLI.
Each of those has its own privacy policy, which governs the data you send to
them.

## Children's privacy

MarkView is not targeted at children under 13 and collects no personal data
from anyone.

## Your rights

Because MarkView does not collect data, there is nothing to delete or export.
If you want to revoke MarkView's access to Google Drive, do so at
https://myaccount.google.com/permissions.

## Changes to this policy

Material changes will be announced in the GitHub release notes and dated at
the top of this document.

## Contact

Questions about this policy: **chris@ForbesAssetManagement.com**.
Security vulnerabilities: see [SECURITY.md](SECURITY.md).
