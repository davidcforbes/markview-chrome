// MarkView Chrome Extension — Content Script
// Detects raw markdown pages (file:// and https://) and replaces them with
// the MarkView renderer, including dark/light theme support and a floating toolbar.
//
// Security note: innerHTML usage here is intentional for a markdown renderer.
// The production build will integrate DOMPurify for sanitizing rendered HTML.

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Detection: is this page a raw markdown file?
  // ---------------------------------------------------------------------------

  /**
   * Heuristic to decide whether the current page is a raw .md file that
   * should be rendered. Uses multiple strategies:
   * 1. URL ends in .md/.markdown (direct file URLs)
   * 2. Page is a single <pre> with markdown-like content
   * 3. Cloud viewer pages (Google Drive, Dropbox) showing raw .md text
   */
  function isRawMarkdownPage() {
    const url = window.location.href.toLowerCase();
    const hostname = window.location.hostname.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();
    const body = document.body;
    if (!body) return false;

    // Strategy 1: URL ends in .md/.markdown
    const hasMarkdownExtension =
      pathname.endsWith(".md") || pathname.endsWith(".markdown");
    const isGitHubRaw = hostname === "raw.githubusercontent.com";

    if (hasMarkdownExtension || isGitHubRaw) {
      // Browser renders text/plain as a single <pre>
      const children = body.children;
      if (children.length === 1 && children[0].tagName === "PRE") return true;
      if (window.location.protocol === "file:") return true;
    }

    // Strategy 2: Google Drive preview — look for raw markdown text
    if (hostname === "drive.google.com" || hostname === "docs.google.com") {
      return detectGoogleDriveMarkdown();
    }

    // Strategy 3: Dropbox preview
    if (hostname === "www.dropbox.com") {
      return detectDropboxMarkdown();
    }

    // Strategy 4: Any page with a single <pre> that looks like markdown
    if (looksLikeRawMarkdownPage()) return true;

    return false;
  }

  /** Detect if Google Drive is showing a raw .md file. */
  function detectGoogleDriveMarkdown() {
    // Google Drive opens .md files in a [role="dialog"] overlay with raw text.
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      const text = dialog.innerText || "";
      if (text.length > 50 && textLooksLikeMarkdown(text)) return true;
    }

    // Check title for .md extension (Drive shows "filename.md - Google Drive")
    const title = document.title || "";
    const titleHasMd = /\.(?:md|markdown)\s*(?:-|$)/i.test(title);

    // On /file/d/ pages, only trigger if title has .md AND we can find
    // actual markdown content (not just the Drive viewer UI).
    if (titleHasMd) {
      // Check if extractable markdown content exists yet
      const content = extractGoogleDriveContent();
      return content.length > 50;
    }

    return false;
  }

  /** Detect if Dropbox is showing a raw .md file. */
  function detectDropboxMarkdown() {
    const title = document.title || "";
    if (title.endsWith(".md") || title.endsWith(".markdown")) return true;
    const previewEl = document.querySelector('.text-preview, .preview-content');
    if (previewEl) return true;
    return false;
  }

  /** Check if the page body looks like it's showing raw markdown. */
  function looksLikeRawMarkdownPage() {
    const children = document.body.children;
    if (children.length !== 1 || children[0].tagName !== "PRE") return false;
    return textLooksLikeMarkdown(children[0].textContent || "");
  }

  /** Heuristic: does this text look like markdown? */
  function textLooksLikeMarkdown(text) {
    if (!text || text.length < 10) return false;
    const lines = text.split("\n").slice(0, 30); // check first 30 lines
    let mdSignals = 0;
    for (const line of lines) {
      if (/^#{1,6}\s/.test(line)) mdSignals += 2;         // headings
      if (/^\s*[-*+]\s/.test(line)) mdSignals++;           // lists
      if (/^\s*\d+\.\s/.test(line)) mdSignals++;           // numbered lists
      if (/\[.*\]\(.*\)/.test(line)) mdSignals++;           // links
      if (/```/.test(line)) mdSignals += 2;                 // fenced code
      if (/^\s*>\s/.test(line)) mdSignals++;                // blockquotes
      if (/\|.*\|.*\|/.test(line)) mdSignals++;             // tables
      if (/\*\*.*\*\*/.test(line)) mdSignals++;             // bold
    }
    return mdSignals >= 3;
  }

  /** Check if the visible page text has markdown patterns. */
  function pageTextLooksLikeMarkdown() {
    const text = document.body.innerText || "";
    return textLooksLikeMarkdown(text);
  }

  // ---------------------------------------------------------------------------
  // Markdown extraction
  // ---------------------------------------------------------------------------

  function extractMarkdownSource() {
    const hostname = window.location.hostname.toLowerCase();

    // Google Drive: extract from preview container
    if (hostname === "drive.google.com" || hostname === "docs.google.com") {
      return extractGoogleDriveContent();
    }

    // Dropbox: extract from preview container
    if (hostname === "www.dropbox.com") {
      return extractDropboxContent();
    }

    // Default: single <pre> or body text
    const pre = document.querySelector("body > pre");
    if (pre) return pre.textContent || "";
    return document.body.innerText || "";
  }

  /** Extract markdown text from Google Drive's preview UI. */
  function extractGoogleDriveContent() {
    // Google Drive preview dialog contains the raw markdown text
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog && dialog.innerText.trim().length > 20) {
      return dialog.innerText;
    }

    // Drive /file/d/ viewer: content loads async into specific elements.
    // Only return content that actually looks like markdown — Drive's UI
    // chrome (buttons, menus, metadata JSON) can appear in these elements
    // before the actual file content loads.
    const selectors = [
      '.drive-viewer-text-page pre',
      '.ndfHFb-c4YZDc pre',
      '.drive-viewer-text-page',
      '.ndfHFb-c4YZDc',
      '[data-type="text/plain"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 50 && textLooksLikeMarkdown(el.textContent)) {
        return el.textContent;
      }
    }

    // Look for any <pre> that contains markdown content
    const pres = document.querySelectorAll('pre');
    for (const pre of pres) {
      if (pre.textContent.trim().length > 50 && textLooksLikeMarkdown(pre.textContent)) {
        return pre.textContent;
      }
    }

    // Return empty so the retry loop tries again later
    return "";
  }

  /** Extract markdown text from Dropbox's preview UI. */
  function extractDropboxContent() {
    const selectors = ['.text-preview', '.preview-content', 'pre'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 0) {
        return el.textContent;
      }
    }
    return document.body.innerText || "";
  }

  // ---------------------------------------------------------------------------
  // SharePoint / OneDrive detection and fetching
  // ---------------------------------------------------------------------------

  /**
   * Detect if this is a SharePoint/OneDrive page referencing a .md file.
   * Returns { type, path, fileName, url } or null.
   *
   * Recognized URL patterns:
   *  1. /my?id=/personal/.../file.md  (Teams "Open in Browser", OneDrive web)
   *  2. /sites/.../AllItems.aspx?id=/sites/.../file.md  (SharePoint doc library)
   *  3. /:t:/  sharing links (text files including .md — opaque token, no path)
   */
  function detectSharePointMarkdown() {
    var hostname = window.location.hostname.toLowerCase();
    if (!hostname.endsWith(".sharepoint.com")) return null;

    var params = new URLSearchParams(window.location.search);

    // Pattern 1 & 2: ?id= query param with .md file path
    var id = params.get("id");
    if (id && /\.(?:md|markdown)$/i.test(id)) {
      var parts = id.replace(/\\/g, "/").split("/");
      var fileName = decodeURIComponent(parts[parts.length - 1]);
      return { type: "path", path: id, fileName: fileName };
    }

    // Pattern 3: /:t:/ sharing link (text files)
    var pathname = window.location.pathname;
    if (/^\/:t:\//.test(pathname)) {
      return { type: "sharing", url: window.location.href };
    }

    return null;
  }

  /**
   * Derive the SharePoint sub-web URL from a server-relative file path.
   * E.g. /personal/user_example_com/Documents/file.md → {origin}/personal/user_example_com
   */
  function getSharePointSiteUrl(serverRelativePath) {
    var origin = window.location.origin;
    var match = serverRelativePath.match(
      /^(\/(?:personal|sites|teams)\/[^/]+)\//
    );
    return match ? origin + match[1] : origin;
  }

  /**
   * Fetch markdown file content from SharePoint REST API (same-origin, session cookies).
   * @param {string} serverRelativePath — decoded path from the ?id= param
   * @returns {Promise<string>} raw markdown text
   */
  function fetchSharePointByPath(serverRelativePath) {
    var siteUrl = getSharePointSiteUrl(serverRelativePath);
    var escapedPath = serverRelativePath.replace(/'/g, "''");
    var apiUrl =
      siteUrl +
      "/_api/web/GetFileByServerRelativePath(decodedUrl='" +
      escapedPath +
      "')/$value";

    return fetch(apiUrl, { credentials: "same-origin" }).then(function (resp) {
      if (!resp.ok) throw new Error("SharePoint REST API: HTTP " + resp.status);
      return resp.text();
    });
  }

  /**
   * Resolve a SharePoint /:t:/ sharing link to file content.
   * Uses the SharePoint v2.0 shares endpoint (Graph-compatible, same-origin).
   * Falls back to looking for a download link in the page DOM.
   * @param {string} sharingUrl — the full sharing URL
   * @returns {Promise<{content: string, fileName: string}>}
   */
  function fetchSharePointSharingLink(sharingUrl) {
    // Encode the sharing URL for the Graph /shares endpoint:
    //   u! + base64url(sharingUrl)
    var base64 = btoa(unescape(encodeURIComponent(sharingUrl)));
    var encoded =
      "u!" +
      base64
        .replace(/=+$/, "")
        .replace(/\//g, "_")
        .replace(/\+/g, "-");

    var origin = window.location.origin;
    var apiUrl =
      origin +
      "/_api/v2.0/shares/" +
      encoded +
      "/driveItem?$select=name,@microsoft.graph.downloadUrl,@content.downloadUrl";

    return fetch(apiUrl, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(function (resp) {
        if (!resp.ok)
          throw new Error("SharePoint shares API: HTTP " + resp.status);
        return resp.json();
      })
      .then(function (item) {
        var downloadUrl =
          item["@microsoft.graph.downloadUrl"] ||
          item["@content.downloadUrl"];
        if (!downloadUrl) throw new Error("No download URL in driveItem");
        return fetch(downloadUrl).then(function (dlResp) {
          if (!dlResp.ok)
            throw new Error("Download failed: HTTP " + dlResp.status);
          return dlResp.text().then(function (content) {
            return { content: content, fileName: item.name || "document.md" };
          });
        });
      });
  }

  /**
   * Fallback: try to find a download link on the SharePoint "Can't preview" page
   * and fetch the markdown content from it.
   * @returns {Promise<{content: string, fileName: string}|null>}
   */
  function trySharePointDownloadFallback() {
    // Look for download links in the DOM
    var links = document.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      var href = links[i].href || "";
      if (
        href.indexOf("download.aspx") >= 0 ||
        href.indexOf("UniqueId=") >= 0
      ) {
        return fetch(href, { credentials: "same-origin" }).then(function (
          resp
        ) {
          if (!resp.ok) throw new Error("Download fallback: HTTP " + resp.status);
          return resp.text().then(function (content) {
            // Try to get filename from Content-Disposition header
            var cd = resp.headers.get("Content-Disposition") || "";
            var nameMatch = cd.match(/filename[*]?=(?:UTF-8''|")?([^";]+)/i);
            var fileName = nameMatch
              ? decodeURIComponent(nameMatch[1])
              : "document.md";
            return { content: content, fileName: fileName };
          });
        });
      }
    }
    return Promise.resolve(null);
  }

  // ---------------------------------------------------------------------------
  // Theme detection and management
  // ---------------------------------------------------------------------------

  function getSystemTheme() {
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
    return "light";
  }

  /** Themes: CSS custom properties for dark and light modes. */
  const THEMES = {
    light: {
      "--mv-bg": "#ffffff",
      "--mv-text": "#24292e",
      "--mv-heading": "#1b1f23",
      "--mv-link": "#0366d6",
      "--mv-code-bg": "#f6f8fa",
      "--mv-code-text": "#24292e",
      "--mv-border": "#e1e4e8",
      "--mv-blockquote-border": "#dfe2e5",
      "--mv-blockquote-text": "#6a737d",
      "--mv-toolbar-bg": "#ffffff",
      "--mv-toolbar-shadow": "rgba(0, 0, 0, 0.15)",
      "--mv-toolbar-text": "#24292e",
      "--mv-toolbar-btn-hover": "#f0f0f0",
    },
    dark: {
      "--mv-bg": "#1e1e1e",
      "--mv-text": "#d4d4d4",
      "--mv-heading": "#e1e4e8",
      "--mv-link": "#58a6ff",
      "--mv-code-bg": "#2d2d2d",
      "--mv-code-text": "#d4d4d4",
      "--mv-border": "#444c56",
      "--mv-blockquote-border": "#444c56",
      "--mv-blockquote-text": "#8b949e",
      "--mv-toolbar-bg": "#2d2d2d",
      "--mv-toolbar-shadow": "rgba(0, 0, 0, 0.4)",
      "--mv-toolbar-text": "#d4d4d4",
      "--mv-toolbar-btn-hover": "#3d3d3d",
    },
  };

  // ---------------------------------------------------------------------------
  // Color Schemes (MV-4gi)
  // ---------------------------------------------------------------------------

  var COLOR_SCHEMES = {
    "Default": { dark: THEMES.dark, light: THEMES.light },
    "Dracula": {
      dark: { "--mv-bg":"#282a36","--mv-text":"#f8f8f2","--mv-heading":"#bd93f9","--mv-link":"#8be9fd","--mv-code-bg":"#44475a","--mv-code-text":"#f8f8f2","--mv-border":"#6272a4","--mv-blockquote-border":"#6272a4","--mv-blockquote-text":"#6272a4","--mv-toolbar-bg":"#44475a","--mv-toolbar-shadow":"rgba(0,0,0,0.4)","--mv-toolbar-text":"#f8f8f2","--mv-toolbar-btn-hover":"#6272a4" },
      light: { "--mv-bg":"#f8f8f2","--mv-text":"#282a36","--mv-heading":"#6d3bc1","--mv-link":"#0077aa","--mv-code-bg":"#e8e8e4","--mv-code-text":"#282a36","--mv-border":"#ccc","--mv-blockquote-border":"#ccc","--mv-blockquote-text":"#666","--mv-toolbar-bg":"#f8f8f2","--mv-toolbar-shadow":"rgba(0,0,0,0.15)","--mv-toolbar-text":"#282a36","--mv-toolbar-btn-hover":"#e8e8e4" }
    },
    "Nord": {
      dark: { "--mv-bg":"#2e3440","--mv-text":"#d8dee9","--mv-heading":"#88c0d0","--mv-link":"#81a1c1","--mv-code-bg":"#3b4252","--mv-code-text":"#e5e9f0","--mv-border":"#4c566a","--mv-blockquote-border":"#4c566a","--mv-blockquote-text":"#7b88a1","--mv-toolbar-bg":"#3b4252","--mv-toolbar-shadow":"rgba(0,0,0,0.4)","--mv-toolbar-text":"#d8dee9","--mv-toolbar-btn-hover":"#434c5e" },
      light: { "--mv-bg":"#eceff4","--mv-text":"#2e3440","--mv-heading":"#5e81ac","--mv-link":"#5e81ac","--mv-code-bg":"#e5e9f0","--mv-code-text":"#2e3440","--mv-border":"#d8dee9","--mv-blockquote-border":"#d8dee9","--mv-blockquote-text":"#4c566a","--mv-toolbar-bg":"#e5e9f0","--mv-toolbar-shadow":"rgba(0,0,0,0.15)","--mv-toolbar-text":"#2e3440","--mv-toolbar-btn-hover":"#d8dee9" }
    },
    "Solarized": {
      dark: { "--mv-bg":"#002b36","--mv-text":"#839496","--mv-heading":"#268bd2","--mv-link":"#2aa198","--mv-code-bg":"#073642","--mv-code-text":"#93a1a1","--mv-border":"#586e75","--mv-blockquote-border":"#586e75","--mv-blockquote-text":"#657b83","--mv-toolbar-bg":"#073642","--mv-toolbar-shadow":"rgba(0,0,0,0.4)","--mv-toolbar-text":"#839496","--mv-toolbar-btn-hover":"#586e75" },
      light: { "--mv-bg":"#fdf6e3","--mv-text":"#657b83","--mv-heading":"#268bd2","--mv-link":"#2aa198","--mv-code-bg":"#eee8d5","--mv-code-text":"#586e75","--mv-border":"#d3cbb7","--mv-blockquote-border":"#d3cbb7","--mv-blockquote-text":"#93a1a1","--mv-toolbar-bg":"#eee8d5","--mv-toolbar-shadow":"rgba(0,0,0,0.15)","--mv-toolbar-text":"#657b83","--mv-toolbar-btn-hover":"#d3cbb7" }
    },
    "Monokai Pro": {
      dark: { "--mv-bg":"#2d2a2e","--mv-text":"#fcfcfa","--mv-heading":"#ffd866","--mv-link":"#78dce8","--mv-code-bg":"#403e41","--mv-code-text":"#fcfcfa","--mv-border":"#5b595c","--mv-blockquote-border":"#5b595c","--mv-blockquote-text":"#939293","--mv-toolbar-bg":"#403e41","--mv-toolbar-shadow":"rgba(0,0,0,0.4)","--mv-toolbar-text":"#fcfcfa","--mv-toolbar-btn-hover":"#5b595c" },
      light: { "--mv-bg":"#fafafa","--mv-text":"#2d2a2e","--mv-heading":"#9a6700","--mv-link":"#0077aa","--mv-code-bg":"#f0f0f0","--mv-code-text":"#2d2a2e","--mv-border":"#d0d0d0","--mv-blockquote-border":"#d0d0d0","--mv-blockquote-text":"#6e6c6f","--mv-toolbar-bg":"#f0f0f0","--mv-toolbar-shadow":"rgba(0,0,0,0.15)","--mv-toolbar-text":"#2d2a2e","--mv-toolbar-btn-hover":"#d0d0d0" }
    },
    "Gruvbox": {
      dark: { "--mv-bg":"#282828","--mv-text":"#ebdbb2","--mv-heading":"#fabd2f","--mv-link":"#83a598","--mv-code-bg":"#3c3836","--mv-code-text":"#ebdbb2","--mv-border":"#504945","--mv-blockquote-border":"#504945","--mv-blockquote-text":"#928374","--mv-toolbar-bg":"#3c3836","--mv-toolbar-shadow":"rgba(0,0,0,0.4)","--mv-toolbar-text":"#ebdbb2","--mv-toolbar-btn-hover":"#504945" },
      light: { "--mv-bg":"#fbf1c7","--mv-text":"#3c3836","--mv-heading":"#b57614","--mv-link":"#427b58","--mv-code-bg":"#f2e5bc","--mv-code-text":"#3c3836","--mv-border":"#d5c4a1","--mv-blockquote-border":"#d5c4a1","--mv-blockquote-text":"#7c6f64","--mv-toolbar-bg":"#f2e5bc","--mv-toolbar-shadow":"rgba(0,0,0,0.15)","--mv-toolbar-text":"#3c3836","--mv-toolbar-btn-hover":"#d5c4a1" }
    },
    "Tokyo Night": {
      dark: { "--mv-bg":"#1a1b26","--mv-text":"#a9b1d6","--mv-heading":"#7aa2f7","--mv-link":"#73daca","--mv-code-bg":"#24283b","--mv-code-text":"#c0caf5","--mv-border":"#3b4261","--mv-blockquote-border":"#3b4261","--mv-blockquote-text":"#565f89","--mv-toolbar-bg":"#24283b","--mv-toolbar-shadow":"rgba(0,0,0,0.4)","--mv-toolbar-text":"#a9b1d6","--mv-toolbar-btn-hover":"#3b4261" },
      light: { "--mv-bg":"#d5d6db","--mv-text":"#343b58","--mv-heading":"#34548a","--mv-link":"#166775","--mv-code-bg":"#c4c5cb","--mv-code-text":"#343b58","--mv-border":"#b4b5ba","--mv-blockquote-border":"#b4b5ba","--mv-blockquote-text":"#565a6e","--mv-toolbar-bg":"#c4c5cb","--mv-toolbar-shadow":"rgba(0,0,0,0.15)","--mv-toolbar-text":"#343b58","--mv-toolbar-btn-hover":"#b4b5ba" }
    },
    "One Dark": {
      dark: { "--mv-bg":"#282c34","--mv-text":"#abb2bf","--mv-heading":"#61afef","--mv-link":"#56b6c2","--mv-code-bg":"#2c313c","--mv-code-text":"#abb2bf","--mv-border":"#4b5263","--mv-blockquote-border":"#4b5263","--mv-blockquote-text":"#5c6370","--mv-toolbar-bg":"#2c313c","--mv-toolbar-shadow":"rgba(0,0,0,0.4)","--mv-toolbar-text":"#abb2bf","--mv-toolbar-btn-hover":"#4b5263" },
      light: { "--mv-bg":"#fafafa","--mv-text":"#383a42","--mv-heading":"#4078f2","--mv-link":"#0184bc","--mv-code-bg":"#f0f0f0","--mv-code-text":"#383a42","--mv-border":"#d3d3d3","--mv-blockquote-border":"#d3d3d3","--mv-blockquote-text":"#696c77","--mv-toolbar-bg":"#f0f0f0","--mv-toolbar-shadow":"rgba(0,0,0,0.15)","--mv-toolbar-text":"#383a42","--mv-toolbar-btn-hover":"#d3d3d3" }
    }
  };

  /** Currently active color scheme name. */
  var activeColorScheme = "Default";

  /** Load saved color scheme from localStorage. */
  function loadColorScheme() {
    try {
      var saved = localStorage.getItem("mv-color-scheme");
      if (saved && COLOR_SCHEMES[saved]) {
        activeColorScheme = saved;
      }
    } catch (_e) { /* storage may be blocked */ }
  }

  /** Save active color scheme to localStorage. */
  function saveColorScheme(name) {
    activeColorScheme = name;
    try {
      localStorage.setItem("mv-color-scheme", name);
    } catch (_e) { /* storage may be blocked */ }
  }

  /**
   * Apply the given color scheme for the specified mode (dark/light).
   * @param {string} schemeName - Key from COLOR_SCHEMES
   * @param {string} mode - "dark" or "light"
   * @param {Document} [targetDoc] - document to apply to (defaults to current)
   */
  function applyColorScheme(schemeName, mode, targetDoc) {
    var d = targetDoc || document;
    var scheme = COLOR_SCHEMES[schemeName] || COLOR_SCHEMES["Default"];
    var vars = scheme[mode] || scheme.light;
    for (var key in vars) {
      d.documentElement.style.setProperty(key, vars[key]);
    }
  }

  // Load saved scheme on startup
  loadColorScheme();

  function applyTheme(theme) {
    applyColorScheme(activeColorScheme, theme);
    // Set data attribute so showRendered can read the current theme
    document.documentElement.dataset.mvTheme = theme;
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      /* MarkView rendered page styles */
      body {
        margin: 0;
        padding: 0;
        background: var(--mv-bg, #ffffff);
        color: var(--mv-text, #24292e);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                     "Helvetica Neue", Arial, sans-serif;
        line-height: 1.6;
        transition: background 0.2s, color 0.2s;
      }

      #markview-root {
        max-width: 900px;
        margin: 0 auto;
        padding: 2rem 2rem 4rem;
      }

      #markview-root h1,
      #markview-root h2,
      #markview-root h3,
      #markview-root h4,
      #markview-root h5,
      #markview-root h6 {
        color: var(--mv-heading, #1b1f23);
        margin-top: 1.5em;
        margin-bottom: 0.5em;
        line-height: 1.25;
      }

      #markview-root h1 { font-size: 2em; border-bottom: 1px solid var(--mv-border); padding-bottom: 0.3em; }
      #markview-root h2 { font-size: 1.5em; border-bottom: 1px solid var(--mv-border); padding-bottom: 0.3em; }
      #markview-root h3 { font-size: 1.25em; }

      #markview-root a { color: var(--mv-link, #0366d6); text-decoration: none; }
      #markview-root a:hover { text-decoration: underline; }

      #markview-root p { margin: 0.5em 0 1em; }

      #markview-root code {
        background: var(--mv-code-bg, #f6f8fa);
        color: var(--mv-code-text, #24292e);
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-size: 0.9em;
        font-family: "Cascadia Code", "Fira Code", Consolas, monospace;
      }

      #markview-root pre {
        background: var(--mv-code-bg, #f6f8fa);
        padding: 1rem;
        border-radius: 6px;
        overflow-x: auto;
        line-height: 1.45;
      }

      #markview-root pre code {
        padding: 0;
        background: none;
      }

      #markview-root blockquote {
        border-left: 4px solid var(--mv-blockquote-border, #dfe2e5);
        color: var(--mv-blockquote-text, #6a737d);
        padding: 0.5em 1em;
        margin: 1em 0;
      }

      #markview-root ul,
      #markview-root ol {
        padding-left: 2em;
        margin: 0.5em 0 1em;
      }

      #markview-root table {
        border-collapse: collapse;
        width: 100%;
        margin: 1em 0;
      }

      #markview-root th,
      #markview-root td {
        border: 1px solid var(--mv-border, #e1e4e8);
        padding: 0.5em 1em;
        text-align: left;
      }

      #markview-root th {
        background: var(--mv-code-bg, #f6f8fa);
        font-weight: 600;
      }

      #markview-root hr {
        border: none;
        border-top: 1px solid var(--mv-border, #e1e4e8);
        margin: 2em 0;
      }

      #markview-root img {
        max-width: 100%;
        height: auto;
      }

      /* ===== Split-view editor ===== */
      #mv-split-container {
        display: flex;
        height: calc(100vh - 40px);
      }
      #mv-editor {
        width: 50%;
        box-sizing: border-box;
        padding: 1rem;
        margin: 0;
        border: none;
        border-right: 2px solid var(--mv-border, #e1e4e8);
        resize: none;
        background: var(--mv-bg, #ffffff);
        color: var(--mv-text, #24292e);
        font-family: "Cascadia Code", "Fira Code", Consolas, monospace;
        font-size: 14px;
        line-height: 1.6;
        outline: none;
        tab-size: 2;
        overflow-y: auto;
      }
      #mv-editor:focus {
        outline: none;
      }
      #mv-split-preview {
        width: 50%;
        overflow-y: auto;
        padding: 0;
      }

      /* ===== Docked toolbar ===== */
      #markview-toolbar {
        position: sticky;
        top: 0;
        left: 0;
        width: 100%;
        display: flex;
        gap: 0.25rem;
        background: var(--mv-toolbar-bg, #ffffff);
        border-radius: 0;
        box-shadow: 0 1px 4px var(--mv-toolbar-shadow, rgba(0,0,0,0.10));
        padding: 0.35rem 0.5rem;
        z-index: 99999;
        transition: background 0.2s;
        box-sizing: border-box;
      }

      #markview-toolbar button {
        background: none;
        border: none;
        color: var(--mv-toolbar-text, #24292e);
        cursor: pointer;
        padding: 0.35rem 0.5rem;
        border-radius: 4px;
        font-size: 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        white-space: nowrap;
        transition: background 0.15s;
        line-height: 1;
        min-width: 28px;
        text-align: center;
      }

      #markview-toolbar button:hover {
        background: var(--mv-toolbar-btn-hover, #f0f0f0);
      }

      #markview-toolbar .mv-separator {
        width: 1px;
        background: var(--mv-border, #e1e4e8);
        margin: 0.2rem 0.25rem;
      }

      /* ===== Hamburger menu ===== */
      .mv-menu {
        display: none;
        position: absolute;
        left: 0;
        top: 100%;
        min-width: 180px;
        overflow: visible;
        background: var(--mv-toolbar-bg, #ffffff);
        border: 1px solid var(--mv-border, #e1e4e8);
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        z-index: 100000;
        padding: 4px 0;
        margin-top: 4px;
      }
      .mv-menu-item {
        padding: 7px 16px;
        cursor: pointer;
        font-size: 13px;
        color: var(--mv-toolbar-text, #24292e);
        white-space: nowrap;
        transition: background 0.1s;
      }
      .mv-menu-item:hover {
        background: var(--mv-toolbar-btn-hover, #f0f0f0);
      }
      .mv-menu-sep {
        height: 1px;
        background: var(--mv-border, #e1e4e8);
        margin: 4px 8px;
      }
      .mv-menu-header {
        padding: 4px 16px;
        font-size: 11px;
        color: var(--mv-blockquote-text, #6a737d);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        pointer-events: none;
      }
      .mv-menu-item .mv-shortcut {
        float: right;
        opacity: 0.5;
        font-size: 11px;
        margin-left: 2em;
      }
      .mv-menu-item .mv-coming-soon {
        float: right;
        opacity: 0.4;
        font-size: 10px;
        font-style: italic;
        margin-left: 1em;
      }
      .mv-menu-header + .mv-menu-sep {
        margin-top: 0;
      }
      .mv-submenu-parent {
        position: relative;
      }
      .mv-submenu-arrow {
        float: right;
        opacity: 0.5;
        margin-left: 1.5em;
        font-size: 14px;
      }
      .mv-submenu {
        display: none;
        position: absolute;
        left: 100%;
        top: -4px;
        min-width: 200px;
        max-height: 60vh;
        overflow-y: auto;
        background: var(--mv-toolbar-bg, #ffffff);
        border: 1px solid var(--mv-border, #e1e4e8);
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        z-index: 100001;
        padding: 4px 0;
        margin-left: 2px;
      }
      .mv-submenu-parent:hover > .mv-submenu {
        display: block;
      }
      .mv-submenu .mv-menu-item {
        padding: 7px 16px;
        cursor: pointer;
        font-size: 13px;
        color: var(--mv-toolbar-text, #24292e);
        white-space: nowrap;
        transition: background 0.1s;
      }
      .mv-submenu .mv-menu-item:hover {
        background: var(--mv-toolbar-btn-hover, #f0f0f0);
      }
      /* Nested submenus (Color Scheme, Toolbar Position inside View) */
      .mv-submenu .mv-submenu {
        z-index: 100002;
      }
      .mv-menu-note {
        padding: 2px 16px 4px;
        font-size: 10px;
        color: var(--mv-blockquote-text, #6a737d);
        font-style: italic;
        pointer-events: none;
      }

      /* ===== Find / Replace Dialog ===== */
      .mv-find-dialog {
        position: fixed;
        top: 12px;
        right: 12px;
        background: var(--mv-toolbar-bg, #fff);
        border: 1px solid var(--mv-border, #e1e4e8);
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        z-index: 200000;
        padding: 12px 32px 12px 16px;
        min-width: 320px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        color: var(--mv-toolbar-text, #24292e);
      }
      .mv-find-dialog .mv-find-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 8px;
      }
      .mv-find-dialog .mv-find-row:last-child {
        margin-bottom: 0;
      }
      .mv-find-dialog label {
        min-width: 56px;
        font-size: 12px;
        color: var(--mv-blockquote-text, #6a737d);
      }
      .mv-find-dialog input[type="text"] {
        flex: 1;
        padding: 5px 8px;
        border: 1px solid var(--mv-border, #e1e4e8);
        border-radius: 4px;
        background: var(--mv-bg, #fff);
        color: var(--mv-text, #24292e);
        font-size: 13px;
        outline: none;
      }
      .mv-find-dialog input[type="text"]:focus {
        border-color: var(--mv-link, #0366d6);
        box-shadow: 0 0 0 2px rgba(3,102,214,0.2);
      }
      .mv-find-dialog .mv-find-btn {
        padding: 4px 10px;
        border: 1px solid var(--mv-border, #e1e4e8);
        border-radius: 4px;
        background: var(--mv-toolbar-bg, #fff);
        color: var(--mv-toolbar-text, #24292e);
        font-size: 12px;
        cursor: pointer;
      }
      .mv-find-dialog .mv-find-btn:hover {
        background: var(--mv-toolbar-btn-hover, #f0f0f0);
      }
      .mv-find-dialog .mv-find-close {
        position: absolute;
        top: 6px;
        right: 2px;
        border: none;
        background: none;
        font-size: 16px;
        cursor: pointer;
        color: var(--mv-toolbar-text, #24292e);
        opacity: 0.6;
        padding: 2px 6px;
      }
      .mv-find-dialog .mv-find-close:hover {
        opacity: 1;
      }
      .mv-find-dialog .mv-find-count {
        font-size: 11px;
        color: var(--mv-blockquote-text, #6a737d);
        min-width: 60px;
        text-align: center;
      }
      @media print {
        .mv-find-dialog { display: none !important; }
      }

      /* ===== AI Chat Panel ===== */
      #mv-ai-panel {
        position: fixed;
        top: 0;
        right: -340px;
        width: 340px;
        height: 100vh;
        background: var(--mv-toolbar-bg, #ffffff);
        border-left: 1px solid var(--mv-border, #e1e4e8);
        box-shadow: -2px 0 12px var(--mv-toolbar-shadow, rgba(0,0,0,0.15));
        z-index: 100002;
        display: flex;
        flex-direction: column;
        transition: right 0.25s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #mv-ai-panel.mv-ai-open {
        right: 0;
      }
      .mv-ai-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        border-bottom: 1px solid var(--mv-border, #e1e4e8);
        background: var(--mv-code-bg, #f6f8fa);
        flex-shrink: 0;
      }
      .mv-ai-header-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--mv-heading, #1b1f23);
      }
      .mv-ai-close {
        background: none;
        border: none;
        color: var(--mv-toolbar-text, #24292e);
        cursor: pointer;
        font-size: 18px;
        padding: 2px 6px;
        border-radius: 4px;
        line-height: 1;
        transition: background 0.15s;
      }
      .mv-ai-close:hover {
        background: var(--mv-toolbar-btn-hover, #f0f0f0);
      }
      .mv-ai-output {
        flex: 1;
        overflow-y: auto;
        padding: 12px 14px;
        font-size: 13px;
        line-height: 1.5;
        color: var(--mv-text, #24292e);
      }
      .mv-ai-msg {
        margin-bottom: 10px;
        padding: 8px 10px;
        border-radius: 6px;
        word-wrap: break-word;
      }
      .mv-ai-msg-user {
        background: var(--mv-link, #0366d6);
        color: #ffffff;
        margin-left: 32px;
        text-align: right;
      }
      .mv-ai-msg-assistant {
        background: var(--mv-code-bg, #f6f8fa);
        color: var(--mv-text, #24292e);
        margin-right: 32px;
      }
      .mv-ai-msg-system {
        background: transparent;
        color: var(--mv-blockquote-text, #6a737d);
        font-style: italic;
        text-align: center;
        font-size: 12px;
        padding: 4px 10px;
      }
      .mv-ai-input-area {
        display: flex;
        gap: 6px;
        padding: 10px 14px;
        border-top: 1px solid var(--mv-border, #e1e4e8);
        background: var(--mv-code-bg, #f6f8fa);
        flex-shrink: 0;
        align-items: flex-end;
      }
      .mv-ai-textarea {
        flex: 1;
        resize: none;
        border: 1px solid var(--mv-border, #e1e4e8);
        border-radius: 6px;
        padding: 8px 10px;
        font-size: 13px;
        font-family: inherit;
        line-height: 1.4;
        background: var(--mv-bg, #ffffff);
        color: var(--mv-text, #24292e);
        outline: none;
        min-height: 52px;
        max-height: 120px;
      }
      .mv-ai-textarea:focus {
        border-color: var(--mv-link, #0366d6);
      }
      .mv-ai-textarea::placeholder {
        color: var(--mv-blockquote-text, #6a737d);
      }
      .mv-ai-send {
        background: var(--mv-link, #0366d6);
        color: #ffffff;
        border: none;
        border-radius: 6px;
        padding: 8px 14px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        transition: opacity 0.15s;
        line-height: 1.4;
      }
      .mv-ai-send:hover {
        opacity: 0.85;
      }

      /* ===== Mermaid error fallback ===== */
      .mermaid-error {
        background: #ffeef0;
        border: 1px solid #fdaeb7;
        border-radius: 6px;
        padding: 1rem;
        color: #cb2431;
        font-family: monospace;
        font-size: 0.85em;
        white-space: pre-wrap;
        overflow-x: auto;
      }
      .mermaid-error-label {
        display: block;
        font-weight: 600;
        margin-bottom: 0.5em;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 0.9rem;
      }
      [data-mv-theme="dark"] .mermaid-error {
        background: #3d1f28;
        border-color: #6e3a3a;
        color: #f97583;
      }

      /* Print styles — hide all UI chrome, show only content */
      @media print {
        #markview-toolbar { display: none !important; }
        #mv-ai-panel { display: none !important; }
        .mv-menu { display: none !important; }
        .mv-format-bar { display: none !important; }
        #mv-split-container { display: block !important; }
        #mv-editor { display: none !important; }
        #mv-split-preview { width: 100% !important; }
        body { background: white !important; color: black !important; }
        #markview-root { max-width: none; padding: 1rem; }
        h1, h2 { page-break-after: avoid; }
        pre, blockquote { page-break-inside: avoid; }
        a { color: black !important; text-decoration: underline !important; }
        a[href]:after { content: " (" attr(href) ")"; font-size: 0.8em; color: #666; }
        img { max-width: 100% !important; page-break-inside: avoid; }
      }
    `;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /** Current state for raw/rendered toggle. */
  let isRendered = true;
  let originalMarkdown = "";

  /**
   * Replace the page content with the rendered markdown.
   *
   * TODO: Integrate the shared markview-web renderMarkdown() function.
   * TODO: Integrate DOMPurify to sanitize rendered HTML before insertion.
   */
  function renderPage(markdownSource) {
    originalMarkdown = markdownSource;

    const hostname = window.location.hostname.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();
    const isDriveFileView = hostname === "drive.google.com" && pathname.indexOf("/file/d/") >= 0;
    const isCloudViewer = !isDriveFileView && (
      hostname === "drive.google.com" ||
      hostname === "docs.google.com" ||
      hostname === "www.dropbox.com" ||
      hostname === "app.box.com"
    );

    // For cloud dialog viewers, render inside the preview dialog.
    // Drive /file/d/ pages fall through to full-page rendering below.
    if (isCloudViewer) {
      renderInDialog(markdownSource);
      return;
    }

    // Clear the body
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }

    // Inject styles
    injectStyles();

    // Apply initial theme based on system preference
    const initialTheme = getSystemTheme();
    applyTheme(initialTheme);

    // Create MarkView container
    const container = document.createElement("div");
    container.id = "markview-root";
    document.body.appendChild(container);

    // Render the markdown content
    showRendered(container, markdownSource);

    // Create floating toolbar
    createFloatingToolbar(initialTheme);

    // Listen for system theme changes
    if (window.matchMedia) {
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", (e) => {
          // Only auto-switch if no manual override has been set
          if (!document.documentElement.dataset.mvThemeOverride) {
            applyTheme(e.matches ? "dark" : "light");
          }
        });
    }

    console.log("[MarkView] Page rendered with theme: " + initialTheme);
  }

  /**
   * Display the rendered markdown view.
   *
   * Renders immediately with the regex-based converter for fast display,
   * then upgrades to the Rust/WASM renderer for full fidelity (mermaid SVG,
   * proper GFM tables, theme support).
   */
  /**
   * Fix Google Drive image URLs in rendered HTML.
   * Rewrites /file/d/{id}/view URLs to /uc?id={id}&export=view
   * so browsers can load them as direct image sources.
   * Also resolves relative image paths on Drive pages by looking up
   * filenames in the same folder (future: MV-mnyw).
   */
  function fixDriveImageUrls(container) {
    var imgs = container.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute('src') || '';
      // Match: https://drive.google.com/file/d/{fileId}/view...
      var match = src.match(/drive\.google\.com\/file\/d\/([^/]+)\/(view|preview)/);
      if (match) {
        imgs[i].setAttribute('src', 'https://drive.google.com/uc?id=' + match[1] + '&export=view');
      }
      // Match: https://drive.google.com/open?id={fileId}
      var openMatch = src.match(/drive\.google\.com\/open\?id=([^&]+)/);
      if (openMatch) {
        imgs[i].setAttribute('src', 'https://drive.google.com/uc?id=' + openMatch[1] + '&export=view');
      }
    }
  }

  function showRendered(container, markdownSource) {
    // Load Drive parent folder index (async, for relative image resolution)
    if (getDriveFileId()) {
      loadDriveParentFiles().then(function () {
        fixDriveImageUrls(container);
      });
    }

    var currentTheme = document.documentElement.dataset.mvTheme || 'light';

    // Strategy: Try Native Messaging FIRST (desktop engine with themed mermaid SVGs).
    // Only fall back to JS renderer if native is unavailable.
    chrome.runtime.sendMessage({
      type: "nativeRender",
      markdown: markdownSource,
      theme: currentTheme
    }, function (response) {
      if (chrome.runtime.lastError || !response || !response.html) {
        // Native not available — use JS renderer (marked.js + lazy mermaid.js)
        console.log("[MarkView] Using JS renderer (native unavailable)");
        if (typeof markviewRenderToElement === 'function') {
          markviewRenderToElement(container, markdownSource, {
            theme: currentTheme,
            scheme: activeColorScheme || 'default',
            mermaidTheme: currentTheme === 'dark' ? 'dark' : 'default'
          }).then(function () {
            fixDriveImageUrls(container);
          });
        } else {
          var safeHtml = markdownToHtml(markdownSource);
          container.replaceChildren();
          container.insertAdjacentHTML('afterbegin', safeHtml);
          fixDriveImageUrls(container);
        }
        return;
      }

      // Native render succeeded — use desktop engine output
      container.replaceChildren();
      container.insertAdjacentHTML('afterbegin', response.html);
      fixDriveImageUrls(container);
      console.log("[MarkView] Rendered via Native Messaging (" + response.html.length + " chars)");
    });

    // Show a quick initial render while waiting for native response
    var quickHtml = markdownToHtml(markdownSource);
    container.replaceChildren();
    container.insertAdjacentHTML('afterbegin', quickHtml);
    fixDriveImageUrls(container);
  }

  // Mermaid rendering is now handled by markview-renderer.js (lazy-loaded).
  // The initMermaid() CDN loading function has been removed.
  /**
   * Convert markdown to HTML using the shared markview-renderer.js module.
   * Falls back to escaped plain text if marked.js is not loaded.
   */
  function markdownToHtml(markdownSource) {
    // Use the shared JS rendering engine (marked.js + DOMPurify)
    if (typeof markviewRender === 'function') {
      return markviewRender(markdownSource, {
        theme: document.documentElement.dataset.mvTheme || 'dark',
        scheme: activeColorScheme || 'default'
      });
    }
    // Fallback: escaped plain text
    return '<pre>' + markdownSource.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
  }

  // --- Legacy regex renderer removed ---
  // The 1,100-line markdownToHtml regex parser has been replaced by
  // markview-renderer.js (marked.js + DOMPurify). See docs/ARCHITECTURE.md.

  /* eslint-disable no-unused-vars */
  function _legacyMarkdownToHtml_removed() {
    // This function has been replaced. Keeping stub for reference.
    // Original: 170 lines of regex-based markdown parsing.
    // Replaced by: markviewRender() from markview-renderer.js
    void 0; // placeholder to preserve line numbers in existing code
  }
  /* eslint-enable no-unused-vars */

  // Keep the rest of the original code below unchanged
  // (The regex function was followed by formatting helpers)
  // -------------------------------------------------------

  // The old regex function body has been removed. The code below
  // ---------------------------------------------------------------------------
  // Formatting helpers (shared by toolbar buttons & menu items)
  // ---------------------------------------------------------------------------

  /**
   * Wrap the current selection in the textarea with before/after strings.
   * If nothing is selected, inserts before+after at cursor.
   */
  function wrapSelection(textarea, before, after) {
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    var text = textarea.value;
    var selected = text.substring(start, end);
    var replacement = before + selected + (after || before);
    textarea.value = text.substring(0, start) + replacement + text.substring(end);
    // Place cursor: if there was a selection, select the inner text; otherwise place after before
    if (selected.length > 0) {
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = start + before.length + selected.length;
    } else {
      textarea.selectionStart = textarea.selectionEnd = start + before.length;
    }
    textarea.focus();
  }

  /**
   * Prepend a prefix to the current line in the textarea.
   */
  function prependLine(textarea, prefix) {
    var start = textarea.selectionStart;
    var text = textarea.value;
    // Find start of current line
    var lineStart = text.lastIndexOf("\n", start - 1) + 1;
    textarea.value = text.substring(0, lineStart) + prefix + text.substring(lineStart);
    textarea.selectionStart = textarea.selectionEnd = start + prefix.length;
    textarea.focus();
  }

  /**
   * Insert text at the current cursor position in the textarea.
   */
  function insertAtCursor(textarea, insertText) {
    var start = textarea.selectionStart;
    var text = textarea.value;
    textarea.value = text.substring(0, start) + insertText + text.substring(start);
    textarea.selectionStart = textarea.selectionEnd = start + insertText.length;
    textarea.focus();
  }

  /**
   * Create the formatting toolbar element.
   * @param {Document} doc - document to create elements in
   * @param {HTMLTextAreaElement|function} getTextarea - textarea or function returning it
   * @param {function} onEdit - callback to trigger after formatting (re-render)
   * @returns {HTMLElement} the format bar div
   */
  function createFormatBar(doc, getTextarea, onEdit) {
    var bar = doc.createElement("div");
    bar.className = "mv-format-bar";
    bar.style.cssText = "display:flex;gap:4px;padding:4px 8px;background:var(--mv-toolbar-bg,#fff);border-bottom:1px solid var(--mv-border);flex-wrap:wrap";

    var buttons = [
      { label: "B", title: "Bold (Ctrl+B)", style: "font-weight:bold", fn: function (ta) { wrapSelection(ta, "**"); } },
      { label: "I", title: "Italic (Ctrl+I)", style: "font-style:italic", fn: function (ta) { wrapSelection(ta, "*"); } },
      { label: "S", title: "Strikethrough", style: "text-decoration:line-through", fn: function (ta) { wrapSelection(ta, "~~"); } },
      { label: "<>", title: "Inline Code", style: "font-family:monospace", fn: function (ta) { wrapSelection(ta, "`"); } },
      { label: "H1", title: "Heading 1", style: "font-weight:bold;font-size:11px", fn: function (ta) { prependLine(ta, "# "); } },
      { label: "H2", title: "Heading 2", style: "font-weight:bold;font-size:10px", fn: function (ta) { prependLine(ta, "## "); } },
      { label: "H3", title: "Heading 3", style: "font-weight:bold;font-size:9px", fn: function (ta) { prependLine(ta, "### "); } },
      { label: "\u2022", title: "Bullet List", style: "", fn: function (ta) { prependLine(ta, "- "); } },
      { label: "1.", title: "Numbered List", style: "", fn: function (ta) { prependLine(ta, "1. "); } },
      { label: "\u2610", title: "Task List", style: "", fn: function (ta) { prependLine(ta, "- [ ] "); } },
      { label: "\uD83D\uDD17", title: "Link", style: "", fn: function (ta) { insertAtCursor(ta, "[text](url)"); } },
      { label: "\uD83D\uDDBC", title: "Image", style: "", fn: function (ta) { insertAtCursor(ta, "![alt](url)"); } },
      { label: "```", title: "Code Block", style: "font-family:monospace;font-size:10px", fn: function (ta) { insertAtCursor(ta, "\n```\n\n```\n"); } },
      { label: ">", title: "Blockquote", style: "font-weight:bold", fn: function (ta) { prependLine(ta, "> "); } },
      { label: "\u2500", title: "Horizontal Rule", style: "", fn: function (ta) { insertAtCursor(ta, "\n---\n"); } }
    ];

    for (var i = 0; i < buttons.length; i++) {
      (function (spec) {
        var btn = doc.createElement("button");
        btn.textContent = spec.label;
        btn.title = spec.title;
        btn.style.cssText = "background:none;border:1px solid var(--mv-border);color:var(--mv-toolbar-text,#24292e);cursor:pointer;padding:2px 6px;border-radius:3px;font-size:12px;line-height:1.2;min-width:24px;text-align:center;transition:background 0.15s;" + (spec.style || "");
        btn.addEventListener("mouseenter", function () { btn.style.background = "var(--mv-toolbar-btn-hover)"; });
        btn.addEventListener("mouseleave", function () { btn.style.background = "none"; });
        btn.addEventListener("click", function () {
          var ta = typeof getTextarea === "function" ? getTextarea() : getTextarea;
          if (!ta) return;
          spec.fn(ta);
          if (onEdit) onEdit();
        });
        bar.appendChild(btn);
      })(buttons[i]);
    }

    return bar;
  }

  // ---------------------------------------------------------------------------
  // Find / Replace Dialog
  // ---------------------------------------------------------------------------

  var mvFindDialog = null;
  var mvFindHighlights = [];
  var mvFindCurrentIdx = -1;

  function openFindDialog(showReplace) {
    if (mvFindDialog) {
      // Already open — toggle replace row visibility
      var replaceRow = mvFindDialog.querySelector('.mv-replace-row');
      if (replaceRow) replaceRow.style.display = showReplace ? 'flex' : 'none';
      mvFindDialog.querySelector('input').focus();
      return;
    }

    var dlg = document.createElement("div");
    dlg.className = "mv-find-dialog";

    // Close button
    var closeBtn = document.createElement("button");
    closeBtn.className = "mv-find-close";
    closeBtn.textContent = "\u00D7";
    closeBtn.title = "Close (Escape)";
    closeBtn.addEventListener("click", closeFindDialog);
    dlg.appendChild(closeBtn);

    // Find row
    var findRow = document.createElement("div");
    findRow.className = "mv-find-row";
    var findLabel = document.createElement("label");
    findLabel.textContent = "Find";
    var findInput = document.createElement("input");
    findInput.type = "text";
    findInput.placeholder = "Search...";
    findInput.id = "mv-find-input";
    var findCount = document.createElement("span");
    findCount.className = "mv-find-count";
    findCount.textContent = "";
    var prevBtn = document.createElement("button");
    prevBtn.className = "mv-find-btn";
    prevBtn.textContent = "\u25B2";
    prevBtn.title = "Previous (Shift+Enter)";
    prevBtn.addEventListener("click", function () { navigateFind(-1); });
    var nextBtn = document.createElement("button");
    nextBtn.className = "mv-find-btn";
    nextBtn.textContent = "\u25BC";
    nextBtn.title = "Next (Enter)";
    nextBtn.addEventListener("click", function () { navigateFind(1); });
    findRow.appendChild(findLabel);
    findRow.appendChild(findInput);
    findRow.appendChild(findCount);
    findRow.appendChild(prevBtn);
    findRow.appendChild(nextBtn);
    dlg.appendChild(findRow);

    // Replace row
    var replaceRow = document.createElement("div");
    replaceRow.className = "mv-find-row mv-replace-row";
    replaceRow.style.display = showReplace ? "flex" : "none";
    var replaceLabel = document.createElement("label");
    replaceLabel.textContent = "Replace";
    var replaceInput = document.createElement("input");
    replaceInput.type = "text";
    replaceInput.placeholder = "Replace with...";
    replaceInput.id = "mv-replace-input";
    var replaceBtn = document.createElement("button");
    replaceBtn.className = "mv-find-btn";
    replaceBtn.textContent = "Replace";
    replaceBtn.addEventListener("click", function () { doReplace(false); });
    var replaceAllBtn = document.createElement("button");
    replaceAllBtn.className = "mv-find-btn";
    replaceAllBtn.textContent = "All";
    replaceAllBtn.title = "Replace All";
    replaceAllBtn.addEventListener("click", function () { doReplace(true); });
    replaceRow.appendChild(replaceLabel);
    replaceRow.appendChild(replaceInput);
    replaceRow.appendChild(replaceBtn);
    replaceRow.appendChild(replaceAllBtn);
    dlg.appendChild(replaceRow);

    document.body.appendChild(dlg);
    mvFindDialog = dlg;

    // Live search on input
    findInput.addEventListener("input", function () {
      doFind(findInput.value);
    });

    // Enter = next, Shift+Enter = prev, Escape = close
    findInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        navigateFind(e.shiftKey ? -1 : 1);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeFindDialog();
      }
    });
    replaceInput.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeFindDialog();
      }
    });

    // Stop propagation so menu close handler doesn't fire
    dlg.addEventListener("click", function (e) { e.stopPropagation(); });

    findInput.focus();
  }

  // ---------------------------------------------------------------------------
  // Generic Modal Dialog
  // ---------------------------------------------------------------------------

  // Security note: bodyHtml is constructed internally from trusted string
  // literals — never from user-supplied content. The production build will
  // integrate DOMPurify for additional sanitization.
  function showModal(title, bodyHtml, targetDoc) {
    var d = targetDoc || document;

    // Overlay
    var overlay = d.createElement("div");
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:300000;display:flex;align-items:center;justify-content:center;";
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.remove();
    });

    // Dialog box
    var dlg = d.createElement("div");
    dlg.style.cssText = "background:var(--mv-toolbar-bg,#fff);color:var(--mv-toolbar-text,#24292e);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.3);padding:24px 28px;max-width:480px;width:90%;max-height:80vh;overflow-y:auto;position:relative;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";

    // Title
    var h = d.createElement("h3");
    h.textContent = title;
    h.style.cssText = "margin:0 0 16px;font-size:16px;font-weight:600;";
    dlg.appendChild(h);

    // Close button
    var closeBtn = d.createElement("button");
    closeBtn.textContent = "\u00D7";
    closeBtn.style.cssText = "position:absolute;top:12px;right:16px;border:none;background:none;font-size:20px;cursor:pointer;color:var(--mv-toolbar-text,#24292e);opacity:0.6;padding:2px 6px;";
    closeBtn.addEventListener("mouseenter", function () { closeBtn.style.opacity = "1"; });
    closeBtn.addEventListener("mouseleave", function () { closeBtn.style.opacity = "0.6"; });
    closeBtn.addEventListener("click", function () { overlay.remove(); });
    dlg.appendChild(closeBtn);

    // Body — innerHTML is used intentionally; content is hardcoded, not user-supplied
    var body = d.createElement("div");
    body.innerHTML = bodyHtml;
    body.style.cssText = "font-size:13px;line-height:1.6;";
    dlg.appendChild(body);

    overlay.appendChild(dlg);
    d.body.appendChild(overlay);

    // Escape to close
    var escHandler = function (e) {
      if (e.key === "Escape") { overlay.remove(); d.removeEventListener("keydown", escHandler); }
    };
    d.addEventListener("keydown", escHandler);
  }

  // ---------------------------------------------------------------------------
  // Shared HTML builders for modal dialogs
  // Canonical source: markview-core/src/menu.rs — all_shortcuts(), about_text(),
  // overview_features(). Keep these JS copies in sync with the Rust definitions.
  // ---------------------------------------------------------------------------

  function overviewHtml() {
    return '<p style="margin-top:0"><strong>MarkView</strong> \u2014 Markdown Viewer</p>' +
      '<p style="margin-bottom:4px"><strong>Features:</strong></p>' +
      '<ul style="margin-top:0;padding-left:1.4em">' +
      '<li>Renders .md files directly in Chrome</li>' +
      '<li>Dark/light theme with multiple color schemes</li>' +
      '<li>Split-pane live editor (F2)</li>' +
      '<li>File open/save/export</li>' +
      '<li>Cloud viewer support (Google Drive, Dropbox)</li>' +
      '<li>Keyboard shortcuts for all actions</li>' +
      '<li>Print &amp; PDF export</li>' +
      '</ul>' +
      '<p><a href="https://github.com/davidcforbes/markview" style="color:var(--mv-link,#0366d6)">https://github.com/davidcforbes/markview</a></p>';
  }

  function shortcutsHtml() {
    return '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
      '<tr><th style="text-align:left;padding:6px 12px;border-bottom:1px solid var(--mv-border,#e1e4e8)">Shortcut</th>' +
      '<th style="text-align:left;padding:6px 12px;border-bottom:1px solid var(--mv-border,#e1e4e8)">Action</th></tr>' +
      [
        ["Escape", "Close menu / dialog / AI panel"],
        ["Up / Down", "Scroll up / down one row"],
        ["PgUp / PgDn", "Scroll up / down one screen"],
        ["Ctrl+Home", "Top of file"],
        ["Ctrl+End", "Bottom of file"],
        ["Ctrl+N", "New document"],
        ["Ctrl+O", "Open file"],
        ["Ctrl+S", "Save"],
        ["Ctrl+P", "Print"],
        ["Ctrl+A", "Select all"],
        ["Ctrl+C", "Copy"],
        ["Ctrl+X", "Cut"],
        ["Ctrl+V", "Paste"],
        ["Ctrl+Z", "Undo"],
        ["Ctrl+Y", "Redo"],
        ["Ctrl+F", "Find"],
        ["Ctrl+H", "Find & Replace"],
        ["Ctrl+B", "Bold"],
        ["Ctrl+I", "Italic"],
        ["F2", "Toggle edit mode"],
        ["F5", "Toggle theme"],
        ["Ctrl+=", "Zoom in"],
        ["Ctrl+-", "Zoom out"],
        ["Ctrl+0", "Reset zoom"],
        ["Alt+Z", "Toggle word wrap"],
        ["F6", "AI Assistant"],
        ["Ctrl+Enter", "Submit prompt"],
        ["F1", "MarkView Overview"]
      ].map(function (r) {
        return '<tr><td style="padding:5px 12px;white-space:nowrap"><kbd style="background:var(--mv-code-bg,#f0f0f0);padding:2px 6px;border-radius:3px;font-size:12px;font-family:monospace">' +
          r[0] + '</kbd></td><td style="padding:5px 12px">' + r[1] + '</td></tr>';
      }).join("") +
      "</table>";
  }

  function aboutHtml() {
    var ver = (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest)
      ? chrome.runtime.getManifest().version : "0.3.0";
    var text = "MarkView v" + ver + "\n" +
      "A fast, privacy-first Markdown viewer and editor.\n" +
      "Renders directly in Chrome and Edge browsers.\n" +
      "\u00A9 2024\u20132026 David C Forbes\n" +
      "MIT License\n" +
      "https://github.com/davidcforbes/markview";
    return '<p style="margin-top:0"><strong>MarkView v' + ver + '</strong></p>' +
      '<p>A fast, privacy-first Markdown viewer and editor.</p>' +
      '<p>Renders directly in Chrome and Edge browsers.</p>' +
      '<p>\u00A9 2024\u20132026 David C Forbes<br>MIT License</p>' +
      '<p><a href="https://github.com/davidcforbes/markview" style="color:var(--mv-link,#0366d6)">https://github.com/davidcforbes/markview</a></p>' +
      '<button id="mv-about-copy" style="margin-top:8px;padding:5px 14px;border:1px solid var(--mv-border,#e1e4e8);border-radius:4px;background:var(--mv-code-bg,#f6f8fa);color:var(--mv-text,#24292e);cursor:pointer;font-size:12px;font-family:inherit;transition:background 0.15s"' +
      ' onclick="navigator.clipboard.writeText(' + JSON.stringify(text).replace(/'/g, "\\'") + ').then(function(){var b=document.getElementById(\'mv-about-copy\');b.textContent=\'Copied!\';setTimeout(function(){b.textContent=\'Copy to clipboard\'},1500)})"' +
      '>Copy to clipboard</button>';
  }

  // ---------------------------------------------------------------------------
  // Shared action builder — deduplicates same-tab / new-tab menu handlers
  // ---------------------------------------------------------------------------

  /**
   * Build the actions object consumed by buildMenu().
   *
   * @param {Object} ctx
   *   ctx.win          - Window for print/close/open (window or newTab)
   *   ctx.doc          - Document for DOM queries (document or doc)
   *   ctx.getEditor    - fn() returning the editor <textarea> or null
   *   ctx.isNewTab     - true when running in the extension-opened tab
   *   ctx.newFileFn    - fn() for File > New
   *   ctx.openFileFn   - fn() for File > Open (null if unavailable)
   *   ctx.saveFn       - fn() for File > Save (null if unavailable)
   *   ctx.saveAsFn     - fn() for File > Save As (null if unavailable)
   *   ctx.toggleRawFn  - fn() for View > Toggle Raw
   *   ctx.themeBtn     - theme button element
   *   ctx.editBtn      - edit button element
   *   ctx.toggleAiFn   - fn() for AI panel toggle
   *   ctx.clearChatFn  - fn() for AI clear chat
   *   ctx.restartAiFn  - fn() for AI restart session
   */
  function makeActions(ctx) {
    function editorAction(fn) {
      return function () {
        var ta = ctx.getEditor();
        if (ta) fn(ta);
      };
    }

    function notAvailable(label) {
      return function () {
        showModal("Not Available",
          '<p>' + label + ' is available on local file pages.</p>', ctx.doc);
      };
    }

    return {
      newFile: ctx.newFileFn,
      openFile: ctx.openFileFn || notAvailable("File &gt; Open"),
      save: ctx.saveFn || notAvailable("File &gt; Save"),
      saveAs: ctx.saveAsFn || notAvailable("File &gt; Save As"),
      print: function () { ctx.win.print(); },
      exportPdf: function () { ctx.win.print(); },
      closeTab: function () { ctx.win.close(); },
      find: function () { openFindDialog(false); },
      replace: function () { openFindDialog(true); },
      bold: editorAction(function (ta) { wrapSelection(ta, "**"); }),
      italic: editorAction(function (ta) { wrapSelection(ta, "*"); }),
      strikethrough: editorAction(function (ta) { wrapSelection(ta, "~~"); }),
      inlineCode: editorAction(function (ta) { wrapSelection(ta, "`"); }),
      h1: editorAction(function (ta) { prependLine(ta, "# "); }),
      h2: editorAction(function (ta) { prependLine(ta, "## "); }),
      h3: editorAction(function (ta) { prependLine(ta, "### "); }),
      bulletList: editorAction(function (ta) { prependLine(ta, "- "); }),
      numberedList: editorAction(function (ta) { prependLine(ta, "1. "); }),
      taskList: editorAction(function (ta) { prependLine(ta, "- [ ] "); }),
      link: editorAction(function (ta) { insertAtCursor(ta, "[text](url)"); }),
      image: editorAction(function (ta) { insertAtCursor(ta, "![alt](url)"); }),
      codeBlock: editorAction(function (ta) { insertAtCursor(ta, "\n```\n\n```\n"); }),
      blockquote: editorAction(function (ta) { prependLine(ta, "> "); }),
      horizontalRule: editorAction(function (ta) { insertAtCursor(ta, "\n---\n"); }),
      toggleTheme: function () { ctx.themeBtn.click(); },
      toggleRaw: ctx.toggleRawFn,
      toggleEdit: function () { ctx.editBtn.click(); },
      overview: function () {
        showModal("MarkView Overview", overviewHtml(), ctx.doc);
      },
      shortcuts: function () {
        showModal("Keyboard Shortcuts", shortcutsHtml(), ctx.doc);
      },
      submitIssue: function () {
        ctx.win.open("https://github.com/davidcforbes/markview/issues", "_blank");
      },
      discussionBoard: function () {
        ctx.win.open("https://github.com/davidcforbes/markview/discussions", "_blank");
      },
      about: function () {
        showModal("About MarkView", aboutHtml(), ctx.doc);
      },
      lint: editorAction(function (ta) {
        var text = ta.value;
        var lines = text.split('\n');
        var fixed = [];
        var log = [];
        var prevBlank = false;
        var inFence = false;
        var trailingWs = 0;
        var blankCollapsed = 0;

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          var trimmed = line.replace(/\s+$/, '');

          if (trimmed.indexOf('```') === 0) inFence = !inFence;

          // Trailing whitespace (not intentional 2-space hard break)
          if (trimmed.length < line.length && !line.match(/  $/)) {
            trailingWs++;
            log.push('Line ' + (i+1) + ': fixed trailing whitespace');
          }

          // Consecutive blank lines
          if (trimmed === '') {
            if (prevBlank) { blankCollapsed++; log.push('Line ' + (i+1) + ': removed consecutive blank line'); continue; }
            prevBlank = true;
            fixed.push('');
            continue;
          }
          prevBlank = false;
          fixed.push(trimmed);
        }

        // Remove leading blank lines
        while (fixed.length > 0 && fixed[0] === '') fixed.shift();

        // Ensure trailing newline
        var result = fixed.join('\n');
        if (result.length > 0 && !result.endsWith('\n')) result += '\n';

        ta.value = result;
        originalMarkdown = result;

        var summary = 'Markdown Lint\n=============\n' +
          'Scanned ' + lines.length + ' lines.\n\n' +
          (log.length > 0 ? log.join('\n') + '\n\n' : '') +
          'Fixed: ' + trailingWs + ' trailing whitespace, ' + blankCollapsed + ' blank lines collapsed.\n' +
          (log.length === 0 ? 'No issues found.' : '');
        showModal('Lint Results', '<pre style="font-size:12px;white-space:pre-wrap">' + summary.replace(/</g,'&lt;') + '</pre>', ctx.doc);
      }),
      imageLocation: function () {
        // Use a hidden <input type="file" webkitdirectory> to select a folder.
        // This avoids the user gesture issue with showDirectoryPicker().
        var input = ctx.doc.createElement('input');
        input.type = 'file';
        input.setAttribute('webkitdirectory', '');
        input.style.display = 'none';
        input.addEventListener('change', function () {
          if (input.files && input.files.length > 0) {
            // Build a filename -> object URL map from the selected folder
            var fileMap = {};
            for (var i = 0; i < input.files.length; i++) {
              var f = input.files[i];
              var name = f.name.toLowerCase();
              // Only index image files
              if (/\.(png|jpg|jpeg|gif|svg|bmp|webp|ico)$/i.test(name)) {
                fileMap[name] = URL.createObjectURL(f);
              }
            }
            // Store the map for the renderer to use
            window._markviewLocalImages = fileMap;
            var folderName = input.files[0].webkitRelativePath.split('/')[0] || 'folder';

            // Re-render to resolve images
            var container = ctx.doc.getElementById('markview-root');
            if (container && originalMarkdown) {
              showRendered(container, originalMarkdown);
            }
            showModal('Image Location Set',
              '<p>Loaded ' + Object.keys(fileMap).length + ' images from <strong>' + folderName + '</strong></p>', ctx.doc);
          }
          input.remove();
        });
        ctx.doc.body.appendChild(input);
        input.click();
      },
      askClaude: ctx.toggleAiFn,
      clearChat: ctx.clearChatFn,
      restartSession: ctx.restartAiFn
    };
  }

  function closeFindDialog() {
    clearHighlights();
    if (mvFindDialog) {
      mvFindDialog.remove();
      mvFindDialog = null;
    }
    mvFindCurrentIdx = -1;
  }

  function doFind(query) {
    clearHighlights();
    mvFindCurrentIdx = -1;
    if (!query) {
      updateFindCount();
      return;
    }

    var container = document.getElementById("markview-root");
    if (!container) return;

    // Walk text nodes and highlight matches
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    var lowerQuery = query.toLowerCase();
    for (var i = 0; i < textNodes.length; i++) {
      var node = textNodes[i];
      var text = node.textContent;
      var lowerText = text.toLowerCase();
      var idx = 0;
      while ((idx = lowerText.indexOf(lowerQuery, idx)) !== -1) {
        var range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + query.length);
        var mark = document.createElement("mark");
        mark.className = "mv-find-match";
        mark.style.cssText = "background:#fff176;color:#000;padding:0 1px;border-radius:2px;";
        range.surroundContents(mark);
        mvFindHighlights.push(mark);
        // After surroundContents, the walker's text nodes are split — re-fetch
        node = mark.nextSibling;
        if (!node) break;
        text = node.textContent;
        lowerText = text.toLowerCase();
        idx = 0;
      }
    }

    if (mvFindHighlights.length > 0) {
      mvFindCurrentIdx = 0;
      highlightCurrent();
    }
    updateFindCount();
  }

  function navigateFind(dir) {
    if (mvFindHighlights.length === 0) return;
    mvFindCurrentIdx = (mvFindCurrentIdx + dir + mvFindHighlights.length) % mvFindHighlights.length;
    highlightCurrent();
    updateFindCount();
  }

  function highlightCurrent() {
    for (var i = 0; i < mvFindHighlights.length; i++) {
      mvFindHighlights[i].style.background = (i === mvFindCurrentIdx) ? "#f57c00" : "#fff176";
      mvFindHighlights[i].style.color = (i === mvFindCurrentIdx) ? "#fff" : "#000";
    }
    if (mvFindHighlights[mvFindCurrentIdx]) {
      mvFindHighlights[mvFindCurrentIdx].scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function updateFindCount() {
    if (!mvFindDialog) return;
    var countEl = mvFindDialog.querySelector(".mv-find-count");
    if (!countEl) return;
    if (mvFindHighlights.length === 0) {
      var input = mvFindDialog.querySelector("#mv-find-input");
      countEl.textContent = input && input.value ? "No results" : "";
    } else {
      countEl.textContent = (mvFindCurrentIdx + 1) + " of " + mvFindHighlights.length;
    }
  }

  function clearHighlights() {
    for (var i = 0; i < mvFindHighlights.length; i++) {
      var mark = mvFindHighlights[i];
      var parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
      }
    }
    mvFindHighlights = [];
  }

  function doReplace(all) {
    if (mvFindHighlights.length === 0) return;
    var replaceInput = document.getElementById("mv-replace-input");
    if (!replaceInput) return;
    var replaceText = replaceInput.value;

    if (all) {
      // Replace all matches
      for (var i = mvFindHighlights.length - 1; i >= 0; i--) {
        var mark = mvFindHighlights[i];
        var parent = mark.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(replaceText), mark);
          parent.normalize();
        }
      }
      mvFindHighlights = [];
      mvFindCurrentIdx = -1;
      updateFindCount();
    } else {
      // Replace current match
      if (mvFindCurrentIdx >= 0 && mvFindCurrentIdx < mvFindHighlights.length) {
        var mark = mvFindHighlights[mvFindCurrentIdx];
        var parent = mark.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(replaceText), mark);
          parent.normalize();
        }
        mvFindHighlights.splice(mvFindCurrentIdx, 1);
        if (mvFindHighlights.length > 0) {
          mvFindCurrentIdx = mvFindCurrentIdx % mvFindHighlights.length;
          highlightCurrent();
        } else {
          mvFindCurrentIdx = -1;
        }
        updateFindCount();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // AI Chat Panel (MV-fno)
  // ---------------------------------------------------------------------------

  /** AI chat panel state. */
  var aiPanelEl = null;
  var aiOutputEl = null;
  var aiTextareaEl = null;
  var aiChatMessages = [];
  var aiDocContentHash = null;
  var aiLastSyncedHash = null;

  /** Simple string hash (djb2). */
  function mvStringHash(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /** Update the document content hash for auto-sync detection. */
  function aiUpdateContentHash() {
    var editor = document.getElementById("mv-editor");
    var source = editor ? editor.value : originalMarkdown;
    aiDocContentHash = mvStringHash(source);
  }

  /**
   * Create the AI chat panel DOM element.
   * @param {Document} doc - The document to create elements in
   * @returns {HTMLElement} The panel element
   */
  function createAiPanel(doc) {
    if (aiPanelEl) return aiPanelEl;

    var panel = doc.createElement("div");
    panel.id = "mv-ai-panel";

    // -- Header --
    var header = doc.createElement("div");
    header.className = "mv-ai-header";
    var title = doc.createElement("span");
    title.className = "mv-ai-header-title";
    title.textContent = "AI Assistant";
    header.appendChild(title);
    var closeBtn = doc.createElement("button");
    closeBtn.className = "mv-ai-close";
    closeBtn.textContent = "\u00D7";
    closeBtn.title = "Close (Esc)";
    closeBtn.addEventListener("click", function () {
      toggleAiPanel();
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // -- Output area --
    var output = doc.createElement("div");
    output.className = "mv-ai-output";
    panel.appendChild(output);
    aiOutputEl = output;

    // -- Input area --
    var inputArea = doc.createElement("div");
    inputArea.className = "mv-ai-input-area";
    var textarea = doc.createElement("textarea");
    textarea.className = "mv-ai-textarea";
    textarea.rows = 3;
    textarea.placeholder = "Ask Claude about this document\u2026";
    textarea.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        aiSendMessage();
      }
      // Stop propagation so global shortcuts (F2, theme, etc.) don't fire
      e.stopPropagation();
    });
    inputArea.appendChild(textarea);
    aiTextareaEl = textarea;

    var sendBtn = doc.createElement("button");
    sendBtn.className = "mv-ai-send";
    sendBtn.textContent = "Send";
    sendBtn.addEventListener("click", function () {
      aiSendMessage();
    });
    inputArea.appendChild(sendBtn);
    panel.appendChild(inputArea);

    aiPanelEl = panel;

    // Show initial system message
    aiAddSystemMessage("Claude Code CLI integration requires the MarkView desktop app. Use Ctrl+Shift+A in the desktop version.");

    return panel;
  }

  /** Add a message bubble to the chat output. */
  function aiAddMessage(text, role) {
    if (!aiOutputEl) return;
    var msg = document.createElement("div");
    msg.className = "mv-ai-msg";
    if (role === "user") {
      msg.classList.add("mv-ai-msg-user");
    } else if (role === "assistant") {
      msg.classList.add("mv-ai-msg-assistant");
    } else {
      msg.classList.add("mv-ai-msg-system");
    }
    msg.textContent = text;
    aiOutputEl.appendChild(msg);
    aiChatMessages.push({ role: role, text: text });
    // Scroll to bottom
    aiOutputEl.scrollTop = aiOutputEl.scrollHeight;
  }

  /** Add a system-style message (centered, italic, no bubble). */
  function aiAddSystemMessage(text) {
    aiAddMessage(text, "system");
  }

  /** Process and send a user message. */
  function aiSendMessage() {
    if (!aiTextareaEl) return;
    var text = aiTextareaEl.value.trim();
    if (!text) return;
    aiTextareaEl.value = "";

    // Handle slash commands
    if (text === "/accept") {
      aiAddMessage("/accept", "user");
      aiAddSystemMessage("Suggestion accepted.");
      return;
    }
    if (text === "/reject") {
      aiAddMessage("/reject", "user");
      aiAddSystemMessage("Suggestion rejected.");
      return;
    }

    aiAddMessage(text, "user");
    // Respond with fallback since Claude Code CLI is not connected
    aiAddMessage("Claude Code CLI integration requires the MarkView desktop app. Use Ctrl+Shift+A in the desktop version.", "assistant");
  }

  /** Clear all chat messages from the output. */
  function aiClearChat() {
    if (!aiOutputEl) return;
    while (aiOutputEl.firstChild) {
      aiOutputEl.removeChild(aiOutputEl.firstChild);
    }
    aiChatMessages = [];
  }

  /** Restart the AI session (clear + show restart message). */
  function aiRestartSession() {
    aiClearChat();
    aiLastSyncedHash = null;
    aiAddSystemMessage("Session restarted.");
  }

  /** Toggle the AI chat panel open/closed. */
  function toggleAiPanel() {
    if (!aiPanelEl) {
      var panel = createAiPanel(document);
      document.body.appendChild(panel);
      // Trigger reflow before adding class so the transition animates
      void panel.offsetWidth;
    }
    var isOpen = aiPanelEl.classList.contains("mv-ai-open");
    if (isOpen) {
      aiPanelEl.classList.remove("mv-ai-open");
    } else {
      // Check for document content changes before opening
      aiUpdateContentHash();
      if (aiLastSyncedHash !== null && aiDocContentHash !== aiLastSyncedHash) {
        aiAddSystemMessage("[Document context updated]");
      }
      aiLastSyncedHash = aiDocContentHash;
      aiPanelEl.classList.add("mv-ai-open");
      // Focus the input
      if (aiTextareaEl) {
        setTimeout(function () { aiTextareaEl.focus(); }, 300);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // File System Access API (MV-019)
  // ---------------------------------------------------------------------------

  /** Current file handle for Save (reuse after Open or Save As). */
  var currentFileHandle = null;

  /** Dirty state — true when editor content has unsaved changes. */
  var isDirty = false;

  /** Set dirty state and update title indicator. */
  function setDirty(dirty) {
    isDirty = dirty;
    var prefix = "\u2022 "; // bullet prefix for dirty
    var title = document.title || "";
    if (dirty && !title.startsWith(prefix)) {
      document.title = prefix + title;
    } else if (!dirty && title.startsWith(prefix)) {
      document.title = title.substring(prefix.length);
    }
  }

  /** Open a markdown file via File System Access API. */
  async function fileOpen() {
    try {
      var pickerOpts = {
        types: [{ description: "Markdown", accept: { "text/markdown": [".md", ".markdown"] } }],
        multiple: false
      };
      var handles = await window.showOpenFilePicker(pickerOpts);
      var handle = handles[0];
      var file = await handle.getFile();
      var text = await file.text();
      currentFileHandle = handle;
      originalMarkdown = text;
      setDirty(false);

      // Re-render
      var container = document.getElementById("markview-root");
      if (container) {
        showRendered(container, originalMarkdown);
      }
      // If in edit mode, update the textarea too
      var editor = document.getElementById("mv-editor");
      if (editor) {
        editor.value = originalMarkdown;
      }
      document.title = file.name + " \u2014 MarkView";
    } catch (e) {
      if (e.name !== "AbortError") console.error("[MarkView] fileOpen error:", e);
    }
  }

  /** Save the current markdown to the stored file handle. */
  /** Extract Google Drive file ID from the current URL. */
  function getDriveFileId() {
    var match = window.location.pathname.match(/\/file\/d\/([^/]+)/);
    return match ? match[1] : null;
  }

  /**
   * Build a lookup table of files in the same Drive folder as the current .md file.
   * Uses the existing drive.file scope (user opened this file through us).
   * Sets markviewSetDriveFiles() so relative image paths can be resolved.
   */
  function loadDriveParentFiles(overrideFileId) {
    var fileId = overrideFileId || getDriveFileId();
    if (!fileId) {
      console.log('[MarkView] No Drive file ID — skipping parent folder index');
      return Promise.resolve();
    }

    console.log('[MarkView] Requesting Drive folder listing via service worker for: ' + fileId);

    return new Promise(function(resolve) {
      chrome.runtime.sendMessage({
        type: "listDriveFolder",
        fileId: fileId,
        interactive: true
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.warn('[MarkView] Drive folder listing failed:', chrome.runtime.lastError.message);
          resolve();
          return;
        }
        if (response && response.error) {
          console.warn('[MarkView] Drive folder listing error:', response.error);
          resolve();
          return;
        }
        if (response && response.fileMap) {
          var keys = Object.keys(response.fileMap);
          console.log('[MarkView] Drive folder indexed: ' + keys.length + ' files (' + keys.join(', ') + ')');
          if (typeof markviewSetDriveFiles === 'function') {
            markviewSetDriveFiles(response.fileMap);
          }
        }
        resolve();
      });
    });
  }

  async function fileSave() {
    // Grab latest content from editor if present
    var editor = document.getElementById("mv-editor");
    if (editor) originalMarkdown = editor.value;

    // Google Drive save
    var driveId = getDriveFileId();
    if (driveId) {
      try {
        await writeFile(driveId, originalMarkdown);
        setDirty(false);
        console.log("[MarkView] Saved to Google Drive: " + driveId);
      } catch (e) {
        console.error("[MarkView] Drive save error:", e);
        showModal("Save Failed", "<p>Failed to save to Google Drive: " + (e.message || e) + "</p>");
      }
      return;
    }

    // Local file save via File System Access API
    if (!currentFileHandle) {
      fileSaveAs();
      return;
    }
    try {
      var writable = await currentFileHandle.createWritable();
      await writable.write(originalMarkdown);
      await writable.close();
      setDirty(false);
    } catch (e) {
      if (e.name !== "AbortError") console.error("[MarkView] fileSave error:", e);
    }
  }

  /** Save As — pick a new file location. */
  async function fileSaveAs() {
    // Grab latest content from editor if present
    var editor = document.getElementById("mv-editor");
    if (editor) originalMarkdown = editor.value;

    try {
      var handle = await window.showSaveFilePicker({
        types: [{ description: "Markdown", accept: { "text/markdown": [".md", ".markdown"] } }],
        suggestedName: "document.md"
      });
      currentFileHandle = handle;
      var writable = await handle.createWritable();
      await writable.write(originalMarkdown);
      await writable.close();
      setDirty(false);
      // Update title with new file name
      var file = await handle.getFile();
      document.title = file.name + " \u2014 MarkView";
    } catch (e) {
      if (e.name !== "AbortError") console.error("[MarkView] fileSaveAs error:", e);
    }
  }

  /** New document — clear content, reset file handle. */
  function fileNew() {
    currentFileHandle = null;
    originalMarkdown = "";
    setDirty(false);
    document.title = "MarkView";
    // Enter edit mode automatically so the user can start typing
    var editor = document.getElementById("mv-editor");
    if (editor) {
      // Already in edit mode — just clear the editor
      editor.value = "";
      editor.focus();
    } else {
      // Not in edit mode — trigger it via the edit button, then clear
      var editButton = document.querySelector('[title*="Edit Mode"]');
      if (editButton) editButton.click();
      // Clear after edit mode activates
      setTimeout(function () {
        var ed = document.getElementById("mv-editor");
        if (ed) {
          ed.value = "";
          ed.focus();
        }
      }, 50);
    }
  }

  /** Warn before unloading if dirty. */
  window.addEventListener("beforeunload", function (e) {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /**
   * Display the raw markdown source (for toggle).
   */
  function showRaw(container, markdownSource) {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    const pre = document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordBreak = "break-word";
    pre.textContent = markdownSource;
    container.appendChild(pre);
  }

  // ---------------------------------------------------------------------------
  // Shared hamburger menu builder
  // ---------------------------------------------------------------------------

  /**
   * Build the full desktop-matching hamburger menu structure.
   *
   * @param {Document} doc         - The document to create elements in
   * @param {HTMLElement} menu     - The menu container div (.mv-menu)
   * @param {Object} actions       - Map of action callbacks:
   *   newFile, openFile, save, saveAs, print, exportPdf, closeTab,
   *   find, replace,
   *   bold, italic, strikethrough, inlineCode, h1, h2, h3,
   *   bulletList, numberedList, taskList, link, image, codeBlock,
   *   blockquote, horizontalRule,
   *   toggleTheme, toggleEdit, toggleRaw,
   *   overview, shortcuts, submitIssue, discussionBoard, about
   * @param {Object} [opts]        - Options: { isDark, onSchemeChange, getActiveScheme }
   */
  function buildMenu(doc, menu, actions, opts) {
    opts = opts || {};

    // -- Zoom state --
    var zoomLevel = 100;
    try {
      var savedZoom = localStorage.getItem("mv-zoom-level");
      if (savedZoom) zoomLevel = parseInt(savedZoom, 10) || 100;
    } catch (_e) {}
    function applyMenuZoom() {
      var contentEl = doc.getElementById("markview-root") || doc.getElementById("content");
      if (contentEl) {
        contentEl.style.zoom = (zoomLevel / 100).toString();
      } else {
        doc.body.style.zoom = (zoomLevel / 100).toString();
      }
    }
    if (zoomLevel !== 100) {
      applyMenuZoom();
    }

    // Toolbar is always docked (no position switching)

    // Helpers
    function addItem(label, shortcut, fn, disabled) {
      var item = doc.createElement("div");
      item.className = "mv-menu-item";
      item.textContent = label;
      if (shortcut) {
        var sc = doc.createElement("span");
        sc.className = "mv-shortcut";
        sc.textContent = shortcut;
        item.appendChild(sc);
      }
      if (disabled) {
        item.style.opacity = "0.4";
        item.style.pointerEvents = "none";
      } else {
        item.addEventListener("click", function () {
          menu.style.display = "none";
          if (fn) fn();
        });
      }
      menu.appendChild(item);
      return item;
    }
    function addSep() {
      var s = doc.createElement("div");
      s.className = "mv-menu-sep";
      menu.appendChild(s);
    }
    function addHeader(label) {
      var h = doc.createElement("div");
      h.className = "mv-menu-header";
      h.textContent = label;
      menu.appendChild(h);
    }
    function addNote(text) {
      var n = doc.createElement("div");
      n.className = "mv-menu-note";
      n.textContent = text;
      menu.appendChild(n);
    }

    // ---- CASCADING SUBMENU BUILDER ----
    // Creates a top-level menu item with a ">" arrow that expands a submenu
    // on hover, matching the desktop Win32 popup menu style.
    function addSubmenu(label) {
      var parent = doc.createElement("div");
      parent.className = "mv-menu-item mv-submenu-parent";
      parent.innerHTML = label + '<span class="mv-submenu-arrow">\u203A</span>';
      // Stop clicks on submenu parents from bubbling to the document
      // close handler — clicking "File" should open its submenu, not close the menu.
      parent.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      menu.appendChild(parent);

      var sub = doc.createElement("div");
      sub.className = "mv-submenu";
      parent.appendChild(sub);

      // Return helpers scoped to this submenu
      var currentSub = sub;
      return {
        el: sub,
        addItem: function (itemLabel, shortcut, fn, disabled) {
          var item = doc.createElement("div");
          item.className = "mv-menu-item";
          item.textContent = itemLabel;
          if (shortcut) {
            var sc = doc.createElement("span");
            sc.className = "mv-shortcut";
            sc.textContent = shortcut;
            item.appendChild(sc);
          }
          if (disabled) {
            item.style.opacity = "0.4";
            item.style.pointerEvents = "none";
          } else {
            item.addEventListener("click", function () {
              menu.style.display = "none";
              if (fn) fn();
            });
          }
          currentSub.appendChild(item);
          return item;
        },
        addSep: function () {
          var s = doc.createElement("div");
          s.className = "mv-menu-sep";
          currentSub.appendChild(s);
        },
        addNestedSubmenu: function (nestedLabel) {
          var np = doc.createElement("div");
          np.className = "mv-menu-item mv-submenu-parent";
          np.innerHTML = nestedLabel + '<span class="mv-submenu-arrow">\u203A</span>';
          currentSub.appendChild(np);
          var ns = doc.createElement("div");
          ns.className = "mv-submenu";
          np.appendChild(ns);
          return ns;
        }
      };
    }

    // ---- FILE ----
    var fileMenu = addSubmenu("File");
    fileMenu.addItem("New", "Ctrl+N", actions.newFile);
    fileMenu.addItem("Open\u2026", "Ctrl+O", actions.openFile);
    fileMenu.addSep();
    fileMenu.addItem("Save", "Ctrl+S", actions.save);
    fileMenu.addItem("Save As\u2026", "", actions.saveAs);
    fileMenu.addSep();
    fileMenu.addItem("Print", "Ctrl+P", actions.print);
    fileMenu.addItem("Export to PDF", "", actions.exportPdf);
    fileMenu.addItem("Image Location\u2026", "", actions.imageLocation);
    fileMenu.addSep();
    fileMenu.addItem("Close", "", actions.closeTab);

    // ---- EDIT ----
    var editMenu = addSubmenu("Edit");
    editMenu.addItem("Find", "Ctrl+F", actions.find);
    editMenu.addItem("Replace", "Ctrl+H", actions.replace);
    editMenu.addSep();
    editMenu.addItem("Fix Lint Warnings", "", actions.lint);

    // ---- FORMAT ----
    var fmtMenu = addSubmenu("Format");
    fmtMenu.addItem("Bold", "Ctrl+B", actions.bold);
    fmtMenu.addItem("Italic", "Ctrl+I", actions.italic);
    fmtMenu.addItem("Strikethrough", "", actions.strikethrough);
    fmtMenu.addItem("Inline Code", "", actions.inlineCode);
    fmtMenu.addSep();
    fmtMenu.addItem("Heading 1", "", actions.h1);
    fmtMenu.addItem("Heading 2", "", actions.h2);
    fmtMenu.addItem("Heading 3", "", actions.h3);
    fmtMenu.addSep();
    fmtMenu.addItem("Bullet List", "", actions.bulletList);
    fmtMenu.addItem("Numbered List", "", actions.numberedList);
    fmtMenu.addItem("Task List", "", actions.taskList);
    fmtMenu.addSep();
    fmtMenu.addItem("Link", "", actions.link);
    fmtMenu.addItem("Image", "", actions.image);
    fmtMenu.addItem("Code Block", "", actions.codeBlock);
    fmtMenu.addItem("Blockquote", "", actions.blockquote);
    fmtMenu.addItem("Horizontal Rule", "", actions.horizontalRule);
    fmtMenu.addSep();
    fmtMenu.addItem("Table of Contents", "", null, true);
    fmtMenu.addItem("Mermaid Chart", "", null, true);

    // ---- VIEW ----
    var viewMenu = addSubmenu("View");
    viewMenu.addItem("Toggle Theme", "F5", actions.toggleTheme);
    viewMenu.addItem("Toggle Edit Mode", "F2", actions.toggleEdit);
    viewMenu.addSep();

    // Zoom items
    var zoomInItem = viewMenu.addItem("Zoom In", "Ctrl+=", function () {
      zoomLevel = Math.min(zoomLevel + 10, 200);
      applyMenuZoom();
      try { localStorage.setItem("mv-zoom-level", zoomLevel.toString()); } catch (_e) {}
      updateZoomLabels();
    });
    var zoomOutItem = viewMenu.addItem("Zoom Out", "Ctrl+-", function () {
      zoomLevel = Math.max(zoomLevel - 10, 50);
      applyMenuZoom();
      try { localStorage.setItem("mv-zoom-level", zoomLevel.toString()); } catch (_e) {}
      updateZoomLabels();
    });
    var zoomResetItem = viewMenu.addItem("Reset Zoom", "Ctrl+0", function () {
      zoomLevel = 100;
      applyMenuZoom();
      try { localStorage.setItem("mv-zoom-level", "100"); } catch (_e) {}
      updateZoomLabels();
    });

    function updateZoomLabels() {
      var items = [
        { el: zoomInItem, base: "Zoom In", sc: "Ctrl+=" },
        { el: zoomOutItem, base: "Zoom Out", sc: "Ctrl+-" },
        { el: zoomResetItem, base: "Reset Zoom", sc: "Ctrl+0" }
      ];
      for (var z = 0; z < items.length; z++) {
        items[z].el.textContent = items[z].base + " (" + zoomLevel + "%)";
        var span = doc.createElement("span");
        span.className = "mv-shortcut";
        span.textContent = items[z].sc;
        items[z].el.appendChild(span);
      }
    }
    if (zoomLevel !== 100) updateZoomLabels();

    viewMenu.addSep();

    // -- Color Scheme nested submenu --
    var schemeSub = viewMenu.addNestedSubmenu("Color Scheme");
    var schemeNames = Object.keys(COLOR_SCHEMES);
    var schemeItems = [];
    for (var i = 0; i < schemeNames.length; i++) {
      (function (name) {
        var isActive = (opts.getActiveScheme ? opts.getActiveScheme() : activeColorScheme) === name;
        var label = (isActive ? "\u2713 " : "   ") + name;
        var item = doc.createElement("div");
        item.className = "mv-menu-item";
        item.textContent = label;
        item.dataset.schemeName = name;
        item.addEventListener("click", function () {
          menu.style.display = "none";
          saveColorScheme(name);
          if (opts.onSchemeChange) opts.onSchemeChange(name);
          updateSchemeCheckmarks();
        });
        schemeSub.appendChild(item);
        schemeItems.push(item);
      })(schemeNames[i]);
    }

    function updateSchemeCheckmarks() {
      var current = opts.getActiveScheme ? opts.getActiveScheme() : activeColorScheme;
      for (var j = 0; j < schemeItems.length; j++) {
        var sn = schemeItems[j].dataset.schemeName;
        schemeItems[j].textContent = (current === sn ? "\u2713 " : "   ") + sn;
      }
    }

    // ---- AI ASSISTANT ----
    var aiMenu = addSubmenu("AI Assistant");
    aiMenu.addItem("Ask Claude\u2026", "F6", actions.askClaude);
    aiMenu.addSep();
    aiMenu.addItem("Clear Chat", "", actions.clearChat);
    aiMenu.addItem("Restart Session", "", actions.restartSession);

    // ---- HELP ----
    var helpMenu = addSubmenu("Help");
    helpMenu.addItem("MarkView Overview", "", actions.overview);
    helpMenu.addItem("Keyboard Shortcuts", "", actions.shortcuts);
    helpMenu.addSep();
    helpMenu.addItem("Submit Issue Report", "", actions.submitIssue);
    helpMenu.addItem("Discussion Board", "", actions.discussionBoard);
    helpMenu.addSep();
    helpMenu.addItem("About MarkView", "", actions.about);

    // Expose zoom functions for keyboard shortcut binding
    menu._mvZoomIn = function () {
      zoomLevel = Math.min(zoomLevel + 10, 200);
      applyMenuZoom();
      try { localStorage.setItem("mv-zoom-level", zoomLevel.toString()); } catch (_e) {}
      updateZoomLabels();
    };
    menu._mvZoomOut = function () {
      zoomLevel = Math.max(zoomLevel - 10, 50);
      applyMenuZoom();
      try { localStorage.setItem("mv-zoom-level", zoomLevel.toString()); } catch (_e) {}
      updateZoomLabels();
    };
    menu._mvZoomReset = function () {
      zoomLevel = 100;
      applyMenuZoom();
      try { localStorage.setItem("mv-zoom-level", "100"); } catch (_e) {}
      updateZoomLabels();
    };
  }

  // ---------------------------------------------------------------------------
  // Docked toolbar (local file rendering path)
  // ---------------------------------------------------------------------------

  function createFloatingToolbar(currentTheme) {
    const toolbar = document.createElement("div");
    toolbar.id = "markview-toolbar";

    // --- Hamburger menu button container (added to toolbar last, after all other buttons) ---
    const menuBtnContainer = document.createElement("div");
    menuBtnContainer.style.position = "relative";

    const menuBtn = document.createElement("button");
    menuBtn.textContent = "\u2630";
    menuBtn.title = "Menu";
    menuBtnContainer.appendChild(menuBtn);

    const menu = document.createElement("div");
    menu.className = "mv-menu";
    menuBtnContainer.appendChild(menu);

    // --- Zoom state (shared with buildMenu via closure) ---
    var tbZoomLevel = 100;
    try {
      var savedZoom = localStorage.getItem("mv-zoom-level");
      if (savedZoom) tbZoomLevel = parseInt(savedZoom, 10) || 100;
    } catch (_e) {}

    function tbApplyZoom() {
      // Zoom only the content area, not the toolbar
      var contentEl = document.getElementById("markview-root") || document.getElementById("content");
      if (contentEl) {
        contentEl.style.zoom = (tbZoomLevel / 100).toString();
      } else {
        document.body.style.zoom = (tbZoomLevel / 100).toString();
      }
      try { localStorage.setItem("mv-zoom-level", tbZoomLevel.toString()); } catch (_e) {}
    }

    // --- Hamburger menu (pinned to left) ---
    toolbar.appendChild(menuBtnContainer);

    // --- Brand / title label (pushes quick-action buttons to the right) ---
    var brandLabel = document.createElement("span");
    brandLabel.className = "mv-brand";
    brandLabel.style.cssText = "font-weight:600;font-size:13px;color:var(--mv-toolbar-text,#24292e);margin-right:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0";
    var fileName = "";
    try {
      var pageTitle = document.title || "";
      var titleMatch = pageTitle.match(/^(.+?\.(?:md|markdown))/i);
      if (titleMatch) fileName = titleMatch[1];
    } catch (_e) {}
    if (!fileName) {
      var urlMatch = window.location.href.match(/[/\\]([^/\\]+\.(?:md|markdown))/i);
      if (urlMatch) fileName = urlMatch[1];
    }
    brandLabel.textContent = "MarkView" + (fileName ? " \u2014 " + fileName : "");
    toolbar.appendChild(brandLabel);

    // --- Zoom out button ---
    const zoomOutBtn = document.createElement("button");
    zoomOutBtn.textContent = "\u2212"; // −
    zoomOutBtn.title = "Zoom Out (Ctrl+\u2212)";
    zoomOutBtn.addEventListener("click", function () {
      tbZoomLevel = Math.max(50, tbZoomLevel - 10);
      tbApplyZoom();
    });
    toolbar.appendChild(zoomOutBtn);

    // --- Zoom in button ---
    const zoomInBtn = document.createElement("button");
    zoomInBtn.textContent = "+";
    zoomInBtn.title = "Zoom In (Ctrl+=)";
    zoomInBtn.addEventListener("click", function () {
      tbZoomLevel = Math.min(200, tbZoomLevel + 10);
      tbApplyZoom();
    });
    toolbar.appendChild(zoomInBtn);

    // --- Theme switch button ---
    let activeTheme = currentTheme;
    const themeBtn = document.createElement("button");
    themeBtn.textContent = activeTheme === "dark" ? "\u2600" : "\u263E";
    themeBtn.title = activeTheme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    themeBtn.addEventListener("click", function () {
      activeTheme = activeTheme === "dark" ? "light" : "dark";
      applyTheme(activeTheme);
      themeBtn.textContent = activeTheme === "dark" ? "\u2600" : "\u263E";
      themeBtn.title = activeTheme === "dark" ? "Switch to light theme" : "Switch to dark theme";
      document.documentElement.dataset.mvThemeOverride = "true";

      // Re-render to update mermaid SVGs and other theme-dependent content
      var container = document.getElementById("markview-root");
      if (container && originalMarkdown && !isEditing) {
        showRendered(container, originalMarkdown);
      }
    });
    toolbar.appendChild(themeBtn);

    // --- Edit mode toggle button ---
    var isEditing = false;
    var savedRenderedHTML = "";
    var editBtn = document.createElement("button");
    editBtn.textContent = "\u270F";
    editBtn.title = "Toggle Edit Mode (F2)";
    editBtn.addEventListener("click", function () {
      toggleEditMode();
    });
    toolbar.appendChild(editBtn);

    function toggleEditMode() {
      isEditing = !isEditing;
      var container = document.getElementById("markview-root");
      if (!container) return;

      if (isEditing) {
        // Enter edit mode: full-page raw text editor (matches desktop F2 behavior)
        editBtn.textContent = "\u25C9"; // view icon
        editBtn.title = "Exit Edit Mode (F2)";
        savedRenderedHTML = container.innerHTML;

        var textarea = document.createElement("textarea");
        textarea.id = "mv-editor";
        textarea.value = originalMarkdown;
        textarea.spellcheck = false;

        // Replace container content with full-page editor
        container.style.maxWidth = "none";
        container.style.padding = "0";
        container.innerHTML = "";

        // Add formatting toolbar above the editor
        var formatBar = createFormatBar(document, function () { return document.getElementById("mv-editor"); }, function () { setDirty(true); });
        container.appendChild(formatBar);
        container.appendChild(textarea);

        // Make editor fill the page
        textarea.style.width = "100%";
        textarea.style.height = "calc(100vh - 40px)";
        textarea.style.boxSizing = "border-box";

        // Tab key inserts 2 spaces; Ctrl+B/I shortcuts
        textarea.addEventListener("keydown", function (e) {
          if (e.key === "Tab") {
            e.preventDefault();
            var start = textarea.selectionStart;
            var end = textarea.selectionEnd;
            textarea.value = textarea.value.substring(0, start) + "  " + textarea.value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + 2;
          }
          if (e.ctrlKey && e.key === "b") {
            e.preventDefault();
            wrapSelection(textarea, "**");
            setDirty(true);
          }
          if (e.ctrlKey && e.key === "i") {
            e.preventDefault();
            wrapSelection(textarea, "*");
            setDirty(true);
          }
        });

        // Track changes
        textarea.addEventListener("input", function () {
          originalMarkdown = textarea.value;
          setDirty(true);
          aiUpdateContentHash();
        });
        textarea.focus();

      } else {
        // Exit edit mode: restore view
        editBtn.textContent = "\u270F";
        editBtn.title = "Toggle Edit Mode (F2)";
        container.style.maxWidth = "900px";
        container.style.padding = "2rem 2rem 4rem";
        showRendered(container, originalMarkdown);
      }
    }

    // --- Print button ---
    const printBtn = document.createElement("button");
    printBtn.textContent = "\u2399";
    printBtn.title = "Print";
    printBtn.addEventListener("click", function () {
      window.print();
    });
    toolbar.appendChild(printBtn);

    // --- Scroll to top button ---
    const topBtn = document.createElement("button");
    topBtn.textContent = "\u2191";
    topBtn.title = "Scroll to top";
    topBtn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    toolbar.appendChild(topBtn);

    // Helper: get the editor textarea, or show modal if not in edit mode
    function getEditorOrAlert() {
      var ta = document.getElementById("mv-editor");
      if (!ta) { showModal("Edit Mode Required", "<p>Enter edit mode first (F2)</p>"); return null; }
      return ta;
    }

    // --- Build hamburger menu items via shared action builder ---
    buildMenu(document, menu, makeActions({
      win: window,
      doc: document,
      getEditor: getEditorOrAlert,
      isNewTab: false,
      newFileFn: function () { fileNew(); },
      openFileFn: function () { fileOpen(); },
      saveFn: function () { fileSave(); },
      saveAsFn: function () { fileSaveAs(); },
      toggleRawFn: function () { toggleEditMode(); },
      themeBtn: themeBtn,
      editBtn: editBtn,
      toggleAiFn: function () { toggleAiPanel(); },
      clearChatFn: function () { aiClearChat(); },
      restartAiFn: function () { aiRestartSession(); }
    }), {
      isDark: activeTheme === "dark",
      getActiveScheme: function () { return activeColorScheme; },
      onSchemeChange: function (name) {
        applyColorScheme(name, activeTheme);
      }
    });

    menuBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isVisible = menu.style.display === "block";
      menu.style.display = isVisible ? "none" : "block";
    });

    // Stop clicks inside the menu from closing it
    menu.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    // Close menu when clicking outside
    document.addEventListener("click", function () {
      menu.style.display = "none";
    });

    document.body.insertBefore(toolbar, document.body.firstChild);

    // --- Keyboard shortcuts for local renderer ---
    document.addEventListener("keydown", function (e) {
      // F6: toggle AI panel regardless of focus
      if (e.key === "F6") {
        e.preventDefault();
        toggleAiPanel();
        return;
      }
      // F1: MarkView Overview
      if (e.key === "F1") {
        e.preventDefault();
        window.open("https://github.com/davidcforbes/markview#readme", "_blank");
        return;
      }
      // Skip AI chat textarea for global shortcuts
      if (e.target && e.target.classList && e.target.classList.contains("mv-ai-textarea")) {
        return;
      }
      // Let Ctrl+B and Ctrl+I pass through to the textarea keydown handler
      if (e.target && e.target.id === "mv-editor" && e.key !== "F2" && e.key !== "F5" && e.key !== "Escape"
          && !(e.ctrlKey && (e.key === "s" || e.key === "o" || e.key === "n" || e.key === "p" || e.key === "=" || e.key === "-" || e.key === "0"))) {
        return;
      }
      if (e.key === "F5") {
        e.preventDefault();
        // Toggle theme — same as theme button click
        activeTheme = activeTheme === "dark" ? "light" : "dark";
        applyTheme(activeTheme);
        themeBtn.textContent = activeTheme === "dark" ? "\u2600" : "\u263E";
        themeBtn.title = activeTheme === "dark" ? "Switch to light theme" : "Switch to dark theme";
        document.documentElement.dataset.mvThemeOverride = "true";
      }
      if (e.key === "F2") {
        e.preventDefault();
        toggleEditMode();
      }
      if (e.key === "Escape") {
        // Close find dialog if open
        if (mvFindDialog) {
          closeFindDialog();
        }
        // Close AI panel if open
        else if (aiPanelEl && aiPanelEl.classList.contains("mv-ai-open")) {
          toggleAiPanel();
        }
        // Close menu if open
        else if (menu.style.display !== "none") {
          menu.style.display = "none";
        }
      }
      // Find / Replace shortcuts
      if (e.ctrlKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        openFindDialog(false);
      }
      if (e.ctrlKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        openFindDialog(true);
      }
      // File shortcuts
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        fileSave();
      }
      if (e.ctrlKey && e.key === "o") {
        e.preventDefault();
        fileOpen();
      }
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        fileNew();
      }
      if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        window.print();
      }
      // Zoom shortcuts
      if (e.ctrlKey && e.key === "=") {
        e.preventDefault();
        if (menu._mvZoomIn) menu._mvZoomIn();
      }
      if (e.ctrlKey && e.key === "-") {
        e.preventDefault();
        if (menu._mvZoomOut) menu._mvZoomOut();
      }
      if (e.ctrlKey && e.key === "0") {
        e.preventDefault();
        if (menu._mvZoomReset) menu._mvZoomReset();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Entry point
  // ---------------------------------------------------------------------------

  /**
   * Render markdown inside a cloud viewer's preview dialog (Google Drive, etc.)
   * instead of replacing the entire page.
   */
  function renderInDialog(markdownSource) {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return;

    // Find the content area inside the dialog (skip the toolbar/header)
    // The content is typically in the largest child div
    let contentArea = dialog;
    const children = dialog.children;
    for (let i = 0; i < children.length; i++) {
      if (children[i].scrollHeight > 200) {
        contentArea = children[i];
        break;
      }
    }

    // Clear the content area
    contentArea.innerHTML = "";

    // Inject styles into the dialog
    const style = document.createElement("style");
    style.textContent = `
      #markview-root {
        max-width: 900px;
        margin: 0 auto;
        padding: 2rem;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        line-height: 1.6;
        color: #d4d4d4;
        background: #1e1e1e;
        min-height: 100%;
      }
      #markview-root h1, #markview-root h2, #markview-root h3,
      #markview-root h4, #markview-root h5, #markview-root h6 {
        color: #e1e4e8; margin-top: 1.5em; margin-bottom: 0.5em; line-height: 1.25;
      }
      #markview-root h1 { font-size: 2em; border-bottom: 1px solid #444c56; padding-bottom: 0.3em; }
      #markview-root h2 { font-size: 1.5em; border-bottom: 1px solid #444c56; padding-bottom: 0.3em; }
      #markview-root h3 { font-size: 1.25em; }
      #markview-root a { color: #58a6ff; text-decoration: none; }
      #markview-root a:hover { text-decoration: underline; }
      #markview-root p { margin: 0.5em 0 1em; }
      #markview-root code {
        background: #2d2d2d; color: #d4d4d4; padding: 0.2em 0.4em;
        border-radius: 3px; font-size: 0.9em; font-family: Consolas, monospace;
      }
      #markview-root pre {
        background: #2d2d2d; padding: 1rem; border-radius: 6px;
        overflow-x: auto; line-height: 1.45;
      }
      #markview-root pre code { padding: 0; background: none; }
      #markview-root blockquote {
        border-left: 4px solid #444c56; color: #8b949e;
        padding: 0.5em 1em; margin: 1em 0;
      }
      #markview-root ul, #markview-root ol { padding-left: 2em; margin: 0.5em 0 1em; }
      #markview-root table { border-collapse: collapse; width: 100%; margin: 1em 0; }
      #markview-root th, #markview-root td {
        border: 1px solid #444c56; padding: 0.5em 1em; text-align: left;
      }
      #markview-root th { background: #2d2d2d; font-weight: 600; }
      #markview-root hr { border: none; border-top: 1px solid #444c56; margin: 2em 0; }
      #markview-root img { max-width: 100%; height: auto; }
      #markview-root strong { color: #e1e4e8; }
      .mermaid-error {
        background: #3d1f28; border: 1px solid #6e3a3a; border-radius: 6px; padding: 1rem;
        color: #f97583; font-family: monospace; font-size: 0.85em; white-space: pre-wrap; overflow-x: auto;
      }
      .mermaid-error-label {
        display: block; font-weight: 600; margin-bottom: 0.5em;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 0.9rem;
      }
    `;
    contentArea.appendChild(style);

    // Create container and render
    const container = document.createElement("div");
    container.id = "markview-root";
    contentArea.appendChild(container);

    showRendered(container, markdownSource);
    console.log("[MarkView] Rendered markdown inside Google Drive preview dialog");
  }

  /**
   * Open a new tab with the rendered markdown content.
   * Used for cloud viewers (Google Drive, Dropbox) so we don't modify their UI.
   */
  function openRenderedTab(markdownSource, cloudFileId, overrideFileName) {
    var theme = getSystemTheme();

    // Extract filename for the URL and title
    var fileName = overrideFileName || "";
    if (!fileName) {
      try {
        var pageTitle = document.title || "";
        var titleMatch = pageTitle.match(/^(.+?\.(?:md|markdown))/i);
        if (titleMatch) fileName = titleMatch[1];
      } catch (_e) {}
    }
    if (!fileName) {
      var urlMatch = window.location.href.match(/[/\\]([^/\\]+\.(?:md|markdown))/i);
      if (urlMatch) fileName = urlMatch[1];
    }
    if (!fileName) {
      fileName = "document.md";
    }

    // Store markdown + drive file map via extension session storage
    var storageKey = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

    // Collect Drive file map if available (for image resolution in viewer tab)
    var driveFileMap = null;
    if (typeof markviewGetDriveFiles === 'function') {
      driveFileMap = markviewGetDriveFiles();
    }

    // Load Drive parent files first if we have a file ID but no map yet
    var storeAndOpen = function() {
      var payload = { markdown: markdownSource };
      if (driveFileMap) payload.driveFiles = driveFileMap;
      if (cloudFileId) payload.driveFileId = cloudFileId;

      chrome.runtime.sendMessage({
        type: "storeMarkdown",
        key: storageKey,
        markdown: markdownSource,
        driveFiles: driveFileMap,
        driveFileId: cloudFileId
      }, function () {
        if (chrome.runtime.lastError) {
          console.warn("[MarkView] storeMarkdown failed:", chrome.runtime.lastError.message);
        }
        var viewerUrl = chrome.runtime.getURL("viewer.html") +
          "?name=" + encodeURIComponent(fileName) +
          "&key=" + storageKey +
          "&theme=" + theme;
        window.open(viewerUrl, "_blank");
      });
    };

    if (cloudFileId && !driveFileMap) {
      // Load the parent files first, then open
      loadDriveParentFiles(cloudFileId).then(function() {
        if (typeof markviewGetDriveFiles === 'function') {
          driveFileMap = markviewGetDriveFiles();
        }
        storeAndOpen();
      });
    } else {
      storeAndOpen();
    }

  }

  function tryRender() {
    if (isRawMarkdownPage()) {
      console.log("[MarkView] Raw markdown page detected — rendering");
      const source = extractMarkdownSource();
      if (source.trim().length > 0) {
        renderPage(source);
        return true;
      }
    }
    return false;
  }

  // Try immediately
  if (tryRender()) return; // done

  const hostname = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();

  // ---------------------------------------------------------------------------
  // SharePoint / OneDrive: fetch .md content via REST API and open viewer tab
  // ---------------------------------------------------------------------------
  if (hostname.endsWith(".sharepoint.com")) {
    var spInfo = detectSharePointMarkdown();
    if (spInfo) {
      if (spInfo.type === "path") {
        // Pattern 1: /my?id=/path/to/file.md — fetch via SharePoint REST API
        console.log("[MarkView] SharePoint .md detected — fetching: " + spInfo.path);
        fetchSharePointByPath(spInfo.path)
          .then(function (markdown) {
            if (markdown.trim().length > 0) {
              openRenderedTab(markdown, null, spInfo.fileName);
            }
          })
          .catch(function (err) {
            console.warn("[MarkView] SharePoint REST fetch failed:", err.message);
            if (typeof markviewShowError === "function") {
              markviewShowError(
                "MarkView couldn't fetch this file from SharePoint (" + err.message + "). Try opening the file in OneDrive, or reload after signing in again.",
                "error"
              );
            }
          });
        return; // handled — don't fall through to retry loop
      }
      if (spInfo.type === "sharing") {
        // Pattern 2: /:t:/ sharing link — resolve via v2.0 shares endpoint
        console.log("[MarkView] SharePoint sharing link detected — resolving");
        fetchSharePointSharingLink(spInfo.url)
          .then(function (result) {
            if (result.content.trim().length > 0) {
              openRenderedTab(result.content, null, result.fileName);
            }
          })
          .catch(function (err) {
            console.warn("[MarkView] SharePoint shares API (content script) failed:",
              err.message, "— trying service worker route");
            // Fallback 1: route through service worker (CORS-exempt)
            chrome.runtime.sendMessage(
              { type: "resolveSharePointSharing", sharingUrl: spInfo.url },
              function (resp) {
                if (resp && resp.content && resp.content.trim().length > 0) {
                  openRenderedTab(resp.content, null, resp.fileName);
                  return;
                }
                console.warn("[MarkView] Service worker route failed:",
                  resp ? resp.error : "no response",
                  "— trying DOM download fallback");
                // Fallback 2: look for download link after page finishes loading
                var fallbackAttempts = [1000, 3000, 6000];
                function tryFallback(i) {
                  if (i >= fallbackAttempts.length) return;
                  setTimeout(function () {
                    trySharePointDownloadFallback().then(function (result) {
                      if (result && result.content.trim().length > 0) {
                        openRenderedTab(result.content, null, result.fileName);
                      } else {
                        tryFallback(i + 1);
                      }
                    }).catch(function () { tryFallback(i + 1); });
                  }, fallbackAttempts[i]);
                }
                tryFallback(0);
              }
            );
          });
        return; // handled
      }
    }
    // No .md pattern detected — fall through (might be a raw .md URL on SharePoint)
  }

  const isCloudSite = hostname === "drive.google.com" ||
                      hostname === "docs.google.com" ||
                      hostname === "www.dropbox.com" ||
                      hostname === "app.box.com";

  // Google Drive /file/d/{id}/view is a full-page text viewer, not a dialog.
  // Use the standard retry loop (same as non-cloud sites) since the content
  // loads asynchronously and isRawMarkdownPage() will match once ready.
  const isDriveFileView = hostname === "drive.google.com" && pathname.indexOf("/file/d/") >= 0;

  if (isCloudSite && !isDriveFileView) {
    // Expose Drive save function so the new tab can call back
    window.__markviewDriveSave = function (fileId, content, callback) {
      writeFile(fileId, content)
        .then(function () { callback(null); })
        .catch(function (e) { callback(e.message || "Save failed"); });
    };

    // Extract Google Drive file ID from URL or DOM
    function extractDriveFileId() {
      // From URL: /file/d/{fileId}/...
      var match = window.location.pathname.match(/\/file\/d\/([^/]+)/);
      if (match) return match[1];
      // From URL: ?id={fileId}
      var params = new URLSearchParams(window.location.search);
      if (params.get("id")) return params.get("id");
      // From URL hash or search: resourcekey-based URLs
      var hashMatch = window.location.hash.match(/id=([^&]+)/);
      if (hashMatch) return hashMatch[1];
      // From DOM: selected file row with data-id attribute
      var selected = document.querySelector('[data-id][aria-selected="true"]') ||
                     document.querySelector('[data-id].qs41qe');
      if (selected) return selected.getAttribute("data-id");
      // From DOM: any data-id on a focused/active element in the file list
      var focused = document.querySelector('.yjl6dc[data-id]') ||
                    document.querySelector('[data-id]:focus');
      if (focused) return focused.getAttribute("data-id");
      // From sharing iframe URL embedded in the page
      var iframes = document.querySelectorAll('iframe[src*="drivesharing"]');
      for (var i = 0; i < iframes.length; i++) {
        var iframeMatch = iframes[i].src.match(/[?&]id=([^&]+)/);
        if (iframeMatch) return iframeMatch[1];
      }
      // From dialog: look for file ID in any data attribute
      var dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        var idEl = dialog.querySelector('[data-id]');
        if (idEl) return idEl.getAttribute('data-id');
      }
      return null;
    }

    // Cloud viewers load file previews dynamically (dialogs, overlays).
    // Use a MutationObserver to detect when a dialog with markdown appears,
    // then open a full-page rendered tab with Drive save support.
    let opened = false;
    const observer = new MutationObserver(function () {
      if (opened) return;
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog && dialog.innerText.length > 50) {
        const text = dialog.innerText;
        if (textLooksLikeMarkdown(text)) {
          opened = true;
          observer.disconnect();
          var fileId = extractDriveFileId();
          console.log("[MarkView] Markdown detected — opening tab" + (fileId ? " (Drive file: " + fileId + ")" : ""));
          openRenderedTab(text, fileId);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[MarkView] Watching for markdown dialog on " + hostname);
  } else {
    // For direct file URLs, retry a few times with increasing delays.
    const delays = [500, 1500, 3000, 5000, 8000, 12000];
    let attempt = 0;
    function retryRender() {
      if (attempt >= delays.length) return;
      setTimeout(function () {
        if (!tryRender()) {
          attempt++;
          retryRender();
        }
      }, delays[attempt]);
      attempt++;
    }
    retryRender();
  }
})();
