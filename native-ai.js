// MarkView — Native Messaging AI client
// Communicates with markview.exe --native-messaging-host

const NATIVE_HOST = "com.markview.ai";

class NativeAI {
  constructor() {
    this.port = null;
    this.listeners = [];
    this.available = null; // null = unknown, true/false after check
  }

  /** Connect to the native host. Chrome launches it automatically. */
  connect() {
    if (this.port) return true;
    try {
      this.port = chrome.runtime.connectNative(NATIVE_HOST);
      this.port.onMessage.addListener((msg) => this._dispatch(msg));
      this.port.onDisconnect.addListener(() => {
        const err = chrome.runtime.lastError;
        console.warn("[MarkView AI] Disconnected:", err?.message || "unknown");
        this.port = null;
        this.available = false;
      });
      return true;
    } catch (e) {
      console.warn("[MarkView AI] Connect failed:", e);
      this.available = false;
      return false;
    }
  }

  /** Disconnect from the native host. */
  disconnect() {
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
  }

  /** Check if the native host is reachable. Returns a Promise<boolean>. */
  ping() {
    return new Promise((resolve) => {
      if (!this.connect()) { resolve(false); return; }
      const timeout = setTimeout(() => {
        this.removeListener(handler);
        resolve(false);
      }, 3000);
      const handler = (msg) => {
        if (msg.type === "pong") {
          clearTimeout(timeout);
          this.available = true;
          this.removeListener(handler);
          resolve(true);
        }
      };
      this.addListener(handler);
      this.port.postMessage({ type: "ping" });
    });
  }

  /** Send a chat message. Responses arrive via listeners. */
  sendChat(text, doc = null) {
    if (!this.connect()) return false;
    const msg = { type: "chat", text };
    if (doc) msg.doc = doc;
    this.port.postMessage(msg);
    return true;
  }

  /** Cancel the in-flight response. */
  cancel() {
    if (this.port) this.port.postMessage({ type: "cancel" });
  }

  /** Restart the session (new conversation). */
  restart() {
    if (this.port) this.port.postMessage({ type: "restart" });
  }

  /** Run a quick action on text. */
  quickAction(action, text) {
    if (!this.connect()) return false;
    this.port.postMessage({ type: "quick_action", action, text });
    return true;
  }

  /** Render markdown to HTML via the native host. Returns a Promise<string|null>. */
  renderMarkdown(markdown) {
    return new Promise((resolve) => {
      if (!this.connect()) { resolve(null); return; }
      const timeout = setTimeout(() => {
        this.removeListener(handler);
        resolve(null);
      }, 10000);
      const handler = (msg) => {
        if (msg.type === "html") {
          clearTimeout(timeout);
          this.removeListener(handler);
          resolve(msg.html);
        } else if (msg.type === "error") {
          clearTimeout(timeout);
          this.removeListener(handler);
          resolve(null);
        }
      };
      this.addListener(handler);
      this.port.postMessage({ type: "render", markdown });
    });
  }

  /** Register a message listener. */
  addListener(fn) { this.listeners.push(fn); }

  /** Remove a message listener. */
  removeListener(fn) {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }

  /** @private Dispatch message to all listeners. */
  _dispatch(msg) {
    for (const fn of this.listeners) {
      try { fn(msg); } catch (e) { console.error("[MarkView AI] Listener error:", e); }
    }
  }
}

// Export singleton for use by content script and service worker
if (typeof globalThis !== "undefined") {
  globalThis.markviewAI = new NativeAI();
}
