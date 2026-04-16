// Unit tests for error-toast.js.
// Run with: node --test unit/error-toast.test.mjs
//
// error-toast.js exports via module.exports when loaded from Node, so we
// can require() it directly — no jsdom, no dynamic eval.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = resolve(here, "../../error-toast.js");

function makeDocStub() {
  const registry = new Map();
  const doc = {
    _registry: registry,
    head: { children: [], appendChild(n) { this.children.push(n); } },
    body: {
      children: [],
      appendChild(n) { this.children.push(n); n.parentNode = this; return n; },
    },
    get documentElement() { return this.body; },
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        children: [],
        classList: {
          _set: new Set(),
          add(c) { this._set.add(c); },
          remove(c) { this._set.delete(c); },
          contains(c) { return this._set.has(c); },
        },
        style: {},
        dataset: {},
        attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        getAttribute(k) { return this.attrs[k]; },
        addEventListener() {},
        appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
        removeChild(child) {
          this.children = this.children.filter((c) => c !== child);
          child.parentNode = null;
          return child;
        },
        get firstChild() { return this.children[0] || null; },
        _text: "",
        get textContent() { return this._text; },
        set textContent(v) { this._text = v; },
        get offsetHeight() { return 1; },
        parentNode: null,
        className: "",
        get classNameStr() { return [...this.classList._set].join(" "); },
      };
      Object.defineProperty(el, "id", {
        get() { return this._id; },
        set(v) { this._id = v; registry.set(v, this); },
      });
      Object.defineProperty(el, "className", {
        get() { return [...this.classList._set].join(" "); },
        set(v) {
          this.classList._set.clear();
          for (const c of String(v).split(/\s+/).filter(Boolean)) {
            this.classList._set.add(c);
          }
        },
      });
      return el;
    },
    getElementById(id) { return registry.get(id) || null; },
  };
  return doc;
}

function loadToast() {
  // require() from ESM test module
  const require = createRequire(import.meta.url);
  // Fresh module each time to avoid state leakage between tests
  delete require.cache[MODULE_PATH];
  return require(MODULE_PATH);
}

beforeEach(() => {
  // Make sure no previous test left a toast-host registry around.
  delete globalThis.markviewShowError;
  delete globalThis.markviewDismissToast;
});

test("showError returns a toast element with error styling", () => {
  const doc = makeDocStub();
  const { showError } = loadToast();
  const toast = showError("boom", "error", { document: doc, duration: 0 });
  assert.ok(toast, "toast element returned");
  assert.equal(toast.attrs.role, "alert");
  assert.ok(toast.classList.contains("mv-toast"));
  assert.ok(toast.classList.contains("mv-toast-error"));
});

test("severity defaults to error", () => {
  const doc = makeDocStub();
  const { showError } = loadToast();
  const toast = showError("no severity", undefined, { document: doc, duration: 0 });
  assert.ok(toast.classList.contains("mv-toast-error"));
});

test("severity=warn uses warn styling + status role", () => {
  const doc = makeDocStub();
  const { showError } = loadToast();
  const toast = showError("warning", "warn", { document: doc, duration: 0 });
  assert.ok(toast.classList.contains("mv-toast-warn"));
  assert.equal(toast.attrs.role, "status");
  assert.equal(toast.attrs["aria-live"], "polite");
});

test("severity=info uses info styling + polite aria-live", () => {
  const doc = makeDocStub();
  const { showError } = loadToast();
  const toast = showError("info msg", "info", { document: doc, duration: 0 });
  assert.ok(toast.classList.contains("mv-toast-info"));
  assert.equal(toast.attrs["aria-live"], "polite");
});

test("caps visible toasts at MAX_VISIBLE=3", () => {
  const doc = makeDocStub();
  const { showError } = loadToast();
  for (let i = 0; i < 5; i++) {
    showError("toast " + i, "info", { document: doc, duration: 0 });
  }
  const host = doc.getElementById("mv-toast-host");
  assert.equal(host.children.length, 3, "only last 3 toasts retained");
});

test("message text is set as textContent (not HTML)", () => {
  const doc = makeDocStub();
  const { showError } = loadToast();
  const toast = showError("<script>alert(1)</script>", "error", { document: doc, duration: 0 });
  const msg = toast.children.find((c) => c.classList.contains("mv-toast-msg"));
  assert.equal(msg._text, "<script>alert(1)</script>", "rendered as text, not HTML");
});

test("dismiss removes toast after animation delay", async () => {
  const doc = makeDocStub();
  const { showError, dismiss } = loadToast();
  const toast = showError("will dismiss", "info", { document: doc, duration: 0 });
  const host = doc.getElementById("mv-toast-host");
  assert.equal(host.children.length, 1);
  dismiss(toast);
  await new Promise((r) => setTimeout(r, 240));
  assert.equal(host.children.length, 0, "toast cleaned up after dismiss");
});

test("styles injected exactly once per document", () => {
  const doc = makeDocStub();
  const { showError } = loadToast();
  showError("a", "info", { document: doc, duration: 0 });
  showError("b", "info", { document: doc, duration: 0 });
  const styleTags = doc.head.children.filter((c) => c.tagName === "STYLE");
  assert.equal(styleTags.length, 1, "only one <style> injection");
});

test("no body -> returns null gracefully", () => {
  const doc = makeDocStub();
  doc.body = null;
  const { showError } = loadToast();
  const result = showError("msg", "error", { document: doc, duration: 0 });
  assert.equal(result, null);
});

test("dismiss on already-removed toast is a no-op", () => {
  const doc = makeDocStub();
  const { showError, dismiss } = loadToast();
  const toast = showError("x", "info", { document: doc, duration: 0 });
  dismiss(toast);
  // Second dismiss should not throw.
  assert.doesNotThrow(() => dismiss(toast));
});

test("custom duration=0 disables auto-fade", async () => {
  const doc = makeDocStub();
  const { showError } = loadToast();
  showError("sticky", "error", { document: doc, duration: 0 });
  const host = doc.getElementById("mv-toast-host");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(host.children.length, 1, "no auto-fade when duration=0");
});

test("non-string message is coerced via String()", () => {
  const doc = makeDocStub();
  const { showError } = loadToast();
  const toast = showError({ toString() { return "obj"; } }, "error", { document: doc, duration: 0 });
  const msg = toast.children.find((c) => c.classList.contains("mv-toast-msg"));
  assert.equal(msg._text, "obj");
});
