# MarkView — Markdown Viewer for Chrome

A Chrome extension that detects raw Markdown files and renders them with
GitHub-flavored Markdown support, Mermaid diagrams, syntax-highlighted code,
math, a full dark/light theme set, and an optional CodeMirror 6 editor —
directly in your browser.

Works on local `.md` files, raw HTTP(S) markdown, Google Drive, SharePoint
(including Teams "Open in Browser"), OneDrive, Dropbox, and Box.

---

![Light theme](docs/screenshots/01-light-theme.png)

**Light theme.** Rich markdown — headings, GFM tables with alignment,
fenced code blocks with syntax highlighting, task lists, math, and
blockquotes — rendered in place.

---

![Dark theme](docs/screenshots/02-dark-theme.png)

**Dark theme.** The same document, auto-detected by OS preference or
toggled manually from the toolbar.

---

![Mermaid diagrams — dark](docs/screenshots/03-mermaid-dark.png)

**Mermaid diagrams** render directly inside the page — flowcharts,
sequence, state, class, ER, gantt, and mind maps. No server round-trip.

## Install

From the Chrome Web Store: (link will be added once the extension is
approved).

From source (development):

1. `git clone https://github.com/davidcforbes/markview-chrome.git`
2. Open `chrome://extensions`
3. Toggle **Developer mode** on (top right)
4. Click **Load unpacked** and select the cloned directory
5. Pin the extension to your toolbar

## Features

- **GitHub-flavored Markdown** — tables (with alignment and pipe-escapes),
  task lists, fenced code, strikethrough, autolinks
- **Mermaid diagrams** — flowchart, sequence, state, class, ER, gantt, mind
  maps — rendered inline
- **Syntax highlighting** — broad language set
- **Nine color schemes** — Default (light/dark), Dracula, Nord, Solarized,
  Monokai Pro, Gruvbox, Tokyo Night, One Dark, GitHub — with an auto mode
  that follows the OS
- **Math** — KaTeX-compatible inline and display
- **Table of contents** — auto-generated from headings
- **Find-in-page, copy-as-HTML, keyboard shortcuts** for every action
- **Side panel** — keep the preview alongside your primary work
- **CodeMirror 6 editor** — quick edits inside the viewer tab
- **Cloud storage** — zero-configuration for Google Drive, SharePoint,
  OneDrive, Teams, Dropbox, Box

## Cloud storage support

![Mermaid diagrams — light](docs/screenshots/04-mermaid-light.png)

When you click a `.md` file in a supported cloud provider, MarkView recognises
the URL pattern and fetches the content directly using your existing session.
No separate login, no API keys to configure. Tested flows:

- **Google Drive** — both the Drive UI and `?id=` viewer URLs
- **SharePoint / OneDrive for Business** — `/personal/…/*.md` and
  `/sites/…/*.md`
- **Microsoft Teams "Open in Browser"** — files shared in Teams chat land
  on SharePoint and render automatically
- **Dropbox** — `www.dropbox.com` preview pages
- **Box** — `app.box.com` preview pages

## Privacy

MarkView has no servers. All parsing and rendering happens in your browser.
No analytics, no telemetry, no account. File content is read only to display
it to you. See [PRIVACY.md](PRIVACY.md) for the full policy.

## License

Source-available under the [PolyForm Noncommercial 1.0.0](LICENSE) license.

- **Free** for personal, research, educational, non-profit, and government
  use.
- **Commercial use** requires a paid license. See [COMMERCIAL.md](COMMERCIAL.md)
  for terms and contact info.

## Optional desktop companion

The extension works standalone. If you also install the MarkView desktop app,
the extension can connect to it via Chrome's native messaging API for
additional features (AI assistant, native Mermaid renderer, Windows Explorer
preview pane, `.md` file association).

The desktop app is distributed separately and is not part of this repository.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Support

- Bug reports + feature requests: https://github.com/davidcforbes/markview-chrome/issues
- Security vulnerabilities: see [SECURITY.md](SECURITY.md)
- Commercial licensing: `chris@ForbesAssetManagement.com`
