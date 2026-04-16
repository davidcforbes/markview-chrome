# MarkView Chrome Extension — Publishing Guide

## Building the Extension

```bash
./build.sh
```

Produces `markview-chrome.zip` containing runtime files only (excludes
`*.md`, `build.sh`, `.gitkeep` files). Manual equivalent:

```bash
zip -r markview-chrome.zip . -x "*.md" "build.sh" "icons/.gitkeep" "node_modules/*" "editor/*"
```

## Chrome Web Store Developer Account

1. Register at https://chrome.google.com/webstore/devconsole.
2. Sign in with `chris@ForbesAssetManagement.com` (matches the GCP OAuth
   publisher email for MarkView).
3. Pay the one-time $5 registration fee.
4. Agree to the Developer Agreement.

## Required Assets

| Asset | Specification | Present? |
|-------|---------------|----------|
| Extension icon 128 | 128×128 PNG | ✅ `icons/icon-128.png` |
| Extension icon 48 | 48×48 PNG | ✅ `icons/icon-48.png` |
| Extension icon 16 | 16×16 PNG | ✅ `icons/icon-16.png` |
| Screenshots (1–5) | 1280×800 or 640×400 PNG/JPEG | ❌ see beads MV-48bh |
| Promotional tile (small) | 440×280 PNG/JPEG | ❌ see beads MV-mkrf |
| Promotional tile (large) | 920×680 or 1400×560 PNG/JPEG (optional) | ❌ |

## Store Listing Content

### Name

`MarkView — Markdown Viewer`

### Summary (132 char limit)

`Render Markdown files with live preview, mermaid diagrams, syntax highlighting, and dark/light themes — right in your browser.`

(126 chars)

### Single-purpose statement

MarkView detects and renders Markdown files in Chrome — on disk, on the web,
and in Google Drive, SharePoint, OneDrive, Dropbox, and Box — without
sending data to any third-party server.

### Full description

> **MarkView turns any Markdown file into a beautifully rendered document,
> instantly, wherever you find one.**
>
> Open a `.md` file from your desktop, a GitHub raw URL, Google Drive,
> SharePoint, OneDrive, a Teams chat attachment, Dropbox, or Box — and
> MarkView replaces the plain text with a fully rendered preview. No copy-
> paste, no separate viewer tool, no upload.
>
> **Features**
>
> - GitHub-flavored Markdown rendering (tables, task lists, fenced code,
>   autolinks, strikethrough)
> - Mermaid diagrams — flowcharts, sequence, state, class, ER, gantt, and
>   mind-maps render inline
> - Syntax-highlighted code blocks with a generous language set
> - Dark and light themes, plus Dracula, Nord, Solarized, Monokai Pro,
>   Gruvbox, Tokyo Night, One Dark, and GitHub color schemes
> - Math rendering (inline and display, KaTeX-compatible)
> - Auto-generated table of contents
> - In-page find, copy-as-HTML, keyboard shortcuts for every action
> - Optional side panel for always-on preview alongside your workflow
> - CodeMirror 6 editor for quick edits inside the rendered tab
>
> **Cloud storage — zero-configuration**
>
> When you click a `.md` file in Google Drive, SharePoint, OneDrive,
> Dropbox, or Box, MarkView recognizes the URL pattern and fetches the
> content directly using your existing session. No separate login, no API
> keys to configure.
>
> **Privacy-first**
>
> MarkView has no servers. Parsing and rendering happen entirely in your
> browser. No analytics, no telemetry, no account. File content is read
> only to display it to you. Read the full [privacy policy](https://github.com/davidcforbes/markview/blob/master/PRIVACY.md).
>
> **Open source**
>
> Source is available at https://github.com/davidcforbes/markview under
> the PolyForm Noncommercial 1.0.0 license. Free for personal, research,
> educational, non-profit, and government use. Commercial licenses
> available.
>
> **Support & feedback**
>
> Bug reports and feature requests: https://github.com/davidcforbes/markview/issues.
> Commercial licensing: chris@ForbesAssetManagement.com.

### Category

Productivity

### Language

English

## Permissions Justification

Each permission in `manifest.json` must have a justification entered on the
developer dashboard's Privacy tab.

| Permission | Justification |
|------------|---------------|
| `activeTab` | Access the current tab to detect and render a Markdown file that the user has opened. Does not grant access to other tabs or background browsing. |
| `storage` | Persist user preferences (theme, color scheme, font size, editor settings) across sessions using `chrome.storage.sync`, and pass markdown content from the content script to the viewer tab via `chrome.storage.session` (auto-cleared after each read). |
| `declarativeNetRequest` | Override the `Content-Type` response header for `.md` / `.markdown` URLs served as `text/plain`, so the content script can render them as a document instead of the browser showing raw text. Rules are declared statically in `rules.json` — no dynamic interception. |
| `nativeMessaging` | Connect to the MarkView desktop host (`markview-host.exe`), installed separately, for features that require local compute — the AI assistant (via Claude Code CLI) and the native mermaid renderer. All communication is local stdio; no network traffic originates from the host. Works without the host installed; those features are simply unavailable. |
| `identity` | Obtain a read-only OAuth token for Google Drive so the extension can resolve image references (`![](images/diagram.png)`) inside markdown files that live in Drive. Scope is `drive.readonly`. Tokens are held by Chrome's identity service, not stored by MarkView. |
| `sidePanel` | Display the Markdown preview in Chrome's side panel so users can view a document alongside their primary work (e.g., reading docs while coding in the main pane). Strictly presentational — the side panel shows the same rendered content as the main viewer tab. |

### Host permissions justification

Every listed host exists to detect / fetch markdown files hosted on that
provider. MarkView does not read arbitrary page content from these hosts.

| Pattern | Why |
|---------|-----|
| `file:///*` | Render local `.md` files opened from the user's file system. |
| `*://*/*.md`, `*://*/*.markdown` | Render raw markdown served over HTTP(S) from any host (GitHub raw, personal wikis, CI artifact URLs, etc.). |
| `*://drive.google.com/*`, `*://docs.google.com/*` | Detect and render `.md` files opened in the Drive UI; resolve inline images via the Drive REST API. |
| `*://www.dropbox.com/*` | Detect and render `.md` files opened in Dropbox's preview UI. |
| `*://app.box.com/*` | Detect and render `.md` files opened in Box's preview UI. |
| `*://*.sharepoint.com/*` | Detect markdown files opened via Teams "Open in Browser", SharePoint document libraries, and OneDrive for Business; fetch content via the same-origin SharePoint REST API. |

## Review Process

- Initial submission: typically 1–3 business days.
- Extensions with `identity`, `nativeMessaging`, or broad host permissions
  often get additional review; expect 3–10 business days.
- Dashboard shows rejection reasons. Fix and resubmit.
- No expedited review for first submissions.

## Updating the Extension

1. Bump the unified version in all five manifest files (see
   `docs/versioning.md`). The new `manifest.json` version must be strictly
   greater than the currently published version.
2. Rebuild the zip: `./build.sh`.
3. Upload in the dashboard under the extension's listing.
4. Submit for review.

## Pre-submission Checklist

- [ ] All icons present and correctly sized (16/48/128) ✅
- [ ] Unified version bumped across all manifests (see `docs/versioning.md`)
- [ ] No development files in the zip (`unzip -l markview-chrome.zip`)
- [ ] Privacy policy URL pasted in the dashboard (PRIVACY.md hosted at
      https://github.com/davidcforbes/markview/blob/master/PRIVACY.md)
- [ ] Screenshots reflect the current UI (1280×800, at least 3)
- [ ] Permission justifications entered for every declared permission
- [ ] Host permissions justification entered for the `host_permissions` list
- [ ] Tested on Chrome stable channel (see `tests/extension/` Playwright smoke)
- [ ] OAuth consent screen in Production mode (see `docs/oauth-setup.md`)
