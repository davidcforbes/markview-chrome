# Changelog

All notable changes to the MarkView Chrome extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Viewer tab tables now render with borders. Added class `mv-content` to the
  viewer tab so shared class-scoped rules in `markview-themes.css` apply.

### Added

- Shared user-facing error surface (`error-toast.js`). SharePoint fetch
  failures and native-host connection errors now show a dismissible toast
  instead of silently logging.
- Playwright smoke tests under `tests/` — verify the extension loads, the
  service worker registers, and SharePoint URL detection recognises Teams
  "Open in Browser" URLs.
- Unit tests for `error-toast.js` using Node test runner.

## [0.5.2]

First public release on the Chrome Web Store.

### Features

- GitHub-flavored Markdown rendering with tables, task lists, fenced code,
  autolinks, strikethrough
- Mermaid diagrams (flowchart, sequence, state, class, ER, gantt, mind maps)
- KaTeX-compatible math (inline + display)
- Syntax highlighting for a wide language set
- Nine color schemes: Default (light/dark), Dracula, Nord, Solarized, Monokai
  Pro, Gruvbox, Tokyo Night, One Dark, GitHub
- Automatic table of contents
- Side panel support
- CodeMirror 6 editor inside the viewer tab
- Cloud storage: Google Drive, SharePoint (including Teams "Open in Browser"),
  OneDrive, Dropbox, Box

### Privacy

No servers, no telemetry, no analytics. All rendering is local. See
[PRIVACY.md](PRIVACY.md).
