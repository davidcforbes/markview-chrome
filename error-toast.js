// MarkView — shared error toast
//
// Single entry point for surfacing fetch / OAuth / native-host failures to
// the user. Use instead of bare console.warn or silent catches.
//
// Usage:
//   markviewShowError("Couldn't fetch SharePoint file: HTTP 401", "error");
//   markviewShowError("AI host offline — continuing without AI features", "info");
//
// Severity values: "error" (red), "warn" (amber), "info" (neutral). Default: "error".

(function (global) {
  "use strict";

  var STYLE_ID = "mv-toast-style";
  var HOST_ID = "mv-toast-host";
  var MAX_VISIBLE = 3;
  var AUTO_FADE_MS = 8000;

  function injectStyles(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    var style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#" + HOST_ID + " {",
      "  position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;",
      "  display: flex; flex-direction: column; gap: 8px; pointer-events: none;",
      "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
      "}",
      ".mv-toast {",
      "  pointer-events: auto; min-width: 240px; max-width: 420px;",
      "  padding: 10px 14px 10px 12px; border-radius: 6px;",
      "  box-shadow: 0 2px 8px rgba(0,0,0,0.25);",
      "  color: #fff; font-size: 13px; line-height: 1.4;",
      "  display: flex; align-items: flex-start; gap: 8px;",
      "  opacity: 0; transform: translateY(8px); transition: opacity .2s, transform .2s;",
      "}",
      ".mv-toast.mv-visible { opacity: 1; transform: translateY(0); }",
      ".mv-toast-error { background: #b42318; }",
      ".mv-toast-warn  { background: #b54708; }",
      ".mv-toast-info  { background: #1f2a44; }",
      ".mv-toast-msg { flex: 1; }",
      ".mv-toast-close {",
      "  background: transparent; border: 0; color: inherit;",
      "  cursor: pointer; font-size: 16px; line-height: 1; padding: 0 4px;",
      "}",
      ".mv-toast-close:hover { opacity: 0.8; }",
    ].join("\n");
    doc.head.appendChild(style);
  }

  function getHost(doc) {
    var host = doc.getElementById(HOST_ID);
    if (host) return host;
    host = doc.createElement("div");
    host.id = HOST_ID;
    (doc.body || doc.documentElement).appendChild(host);
    return host;
  }

  /**
   * Show a toast. Returns the toast element (useful for tests).
   * @param {string} message - Human-readable message (plain text — no HTML).
   * @param {"error"|"warn"|"info"} [severity="error"]
   * @param {{duration?: number, document?: Document}} [opts]
   */
  function showError(message, severity, opts) {
    severity = severity || "error";
    opts = opts || {};
    var doc = opts.document || (typeof document !== "undefined" ? document : null);
    if (!doc || !doc.body) return null;

    injectStyles(doc);
    var host = getHost(doc);

    // Cap the number of visible toasts to keep the viewport usable.
    while (host.children.length >= MAX_VISIBLE) {
      host.removeChild(host.firstChild);
    }

    var toast = doc.createElement("div");
    toast.className = "mv-toast mv-toast-" + severity;
    toast.setAttribute("role", severity === "error" ? "alert" : "status");
    toast.setAttribute("aria-live", severity === "error" ? "assertive" : "polite");

    var msg = doc.createElement("span");
    msg.className = "mv-toast-msg";
    msg.textContent = String(message);
    toast.appendChild(msg);

    var close = doc.createElement("button");
    close.className = "mv-toast-close";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "\u2715";
    close.addEventListener("click", function () { dismiss(toast); });
    toast.appendChild(close);

    host.appendChild(toast);
    // Force layout so the transition fires.
    // eslint-disable-next-line no-unused-expressions
    toast.offsetHeight;
    toast.classList.add("mv-visible");

    var ms = opts.duration != null ? opts.duration : AUTO_FADE_MS;
    if (ms > 0) {
      setTimeout(function () { dismiss(toast); }, ms);
    }
    return toast;
  }

  function dismiss(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.remove("mv-visible");
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 220);
  }

  // Expose on global for content scripts / viewer / options pages.
  global.markviewShowError = showError;
  global.markviewDismissToast = dismiss;

  // Also export for CommonJS (tests).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { showError: showError, dismiss: dismiss };
  }
})(typeof window !== "undefined" ? window : this);
