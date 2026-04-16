// MarkView Chrome Extension — Service Worker (Manifest V3)
// Handles extension lifecycle events and declarativeNetRequest rule management.

// ---------------------------------------------------------------------------
// Install / Activate
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener((details) => {
  console.log("[MarkView] Extension installed:", details.reason);

  // Set default options on first install
  if (details.reason === "install") {
    chrome.storage.sync.set({
      theme: "light",
      defaultEditor: "",
      cloudConnections: {},
      enableMermaid: true,
      enableSyntaxHighlight: true,
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[MarkView] Service worker started");
});

// ---------------------------------------------------------------------------
// DeclarativeNetRequest — dynamic rules for .md interception
// ---------------------------------------------------------------------------

/**
 * Ensure dynamic rules are registered so that raw .md files served as
 * text/plain get their Content-Type overridden to text/html, allowing the
 * content script to render them.
 */
async function ensureDynamicRules() {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existingRules.map((r) => r.id);

  // Only add if not already present
  if (!existingIds.includes(1000)) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [
        {
          id: 1000,
          priority: 1,
          action: {
            type: "modifyHeaders",
            responseHeaders: [
              {
                header: "Content-Type",
                operation: "set",
                value: "text/html; charset=utf-8",
              },
            ],
          },
          condition: {
            regexFilter: ".*\\.(?:md|markdown)(\\?.*)?$",
            resourceTypes: ["main_frame"],
          },
        },
      ],
      removeRuleIds: [],
    });
    console.log("[MarkView] Dynamic interception rule registered");
  }
}

ensureDynamicRules();

// ---------------------------------------------------------------------------
// Message handling (content-script <-> service-worker communication)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getSettings") {
    chrome.storage.sync.get(null, (settings) => {
      sendResponse(settings);
    });
    return true;
  }

  if (message.type === "setTheme") {
    chrome.storage.sync.set({ theme: message.theme });
    sendResponse({ ok: true });
  }

  // Store markdown + drive file map for viewer.html
  if (message.type === "storeMarkdown") {
    var data = { markdown: message.markdown };
    if (message.driveFiles) data.driveFiles = message.driveFiles;
    if (message.driveFileId) data.driveFileId = message.driveFileId;
    chrome.storage.session.set({ ["markview-" + message.key]: JSON.stringify(data) }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "getMarkdown") {
    chrome.storage.session.get("markview-" + message.key, (result) => {
      var raw = result["markview-" + message.key] || null;
      if (!raw) { sendResponse({ markdown: null }); return; }
      try {
        var data = JSON.parse(raw);
        sendResponse({ markdown: data.markdown, driveFiles: data.driveFiles, driveFileId: data.driveFileId });
      } catch(_e) {
        // Legacy: plain markdown string
        sendResponse({ markdown: raw });
      }
      chrome.storage.session.remove("markview-" + message.key);
    });
    return true;
  }

  // Drive: list files in a Drive folder (for image resolution)
  if (message.type === "listDriveFolder") {
    (async () => {
      try {
        var token = await new Promise((resolve, reject) => {
          chrome.identity.getAuthToken(
            { interactive: message.interactive || false, scopes: ["https://www.googleapis.com/auth/drive.readonly"] },
            (t) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else if (!t) reject(new Error("No token"));
              else resolve(t);
            }
          );
        });

        // Get parent folder ID
        var fileResp = await fetch(
          "https://www.googleapis.com/drive/v3/files/" + message.fileId + "?fields=parents,name",
          { headers: { Authorization: "Bearer " + token } }
        );
        if (!fileResp.ok) {
          sendResponse({ error: "Drive API file metadata: HTTP " + fileResp.status });
          return;
        }
        var fileData = await fileResp.json();
        if (!fileData.parents || fileData.parents.length === 0) {
          sendResponse({ error: "File has no parent folder", fileMap: {} });
          return;
        }
        var parentId = fileData.parents[0];

        // List files in parent folder
        var listResp = await fetch(
          "https://www.googleapis.com/drive/v3/files?q=%27" + parentId +
            "%27+in+parents&fields=files(id,name)&pageSize=200",
          { headers: { Authorization: "Bearer " + token } }
        );
        if (!listResp.ok) {
          sendResponse({ error: "Drive API folder listing: HTTP " + listResp.status });
          return;
        }
        var listData = await listResp.json();
        var fileMap = {};
        if (listData.files) {
          for (var i = 0; i < listData.files.length; i++) {
            fileMap[listData.files[i].name.toLowerCase()] = listData.files[i].id;
          }
        }
        console.log("[MarkView] Drive folder indexed: " + Object.keys(fileMap).length + " files");
        sendResponse({ fileMap: fileMap });
      } catch (e) {
        console.warn("[MarkView] Drive folder listing failed:", e.message);
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  // Drive: save markdown content back to a Drive file
  if (message.type === "saveToDrive") {
    (async () => {
      try {
        var token = await new Promise((resolve, reject) => {
          chrome.identity.getAuthToken(
            { interactive: false, scopes: ["https://www.googleapis.com/auth/drive.file"] },
            (t) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else if (!t) reject(new Error("No token"));
              else resolve(t);
            }
          );
        });
        var resp = await fetch(
          "https://www.googleapis.com/upload/drive/v3/files/" + message.fileId + "?uploadType=media",
          {
            method: "PATCH",
            headers: {
              Authorization: "Bearer " + token,
              "Content-Type": "text/markdown"
            },
            body: message.content
          }
        );
        if (!resp.ok) {
          sendResponse({ error: "Drive save failed: HTTP " + resp.status });
        } else {
          console.log("[MarkView] Saved to Drive: " + message.fileId);
          sendResponse({ ok: true });
        }
      } catch (e) {
        console.warn("[MarkView] Drive save failed:", e.message);
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  // Drive: search for image files by name (fallback when not in parent folder)
  if (message.type === "searchDriveImages") {
    (async () => {
      try {
        var token = await new Promise((resolve, reject) => {
          chrome.identity.getAuthToken(
            { interactive: false, scopes: ["https://www.googleapis.com/auth/drive.readonly"] },
            (t) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else if (!t) reject(new Error("No token"));
              else resolve(t);
            }
          );
        });

        var names = message.filenames || [];
        var fileMap = {};
        // Search for each filename across Drive
        for (var i = 0; i < names.length; i++) {
          var name = names[i];
          var q = encodeURIComponent("name='" + name.replace(/'/g, "\\'") + "' and trashed=false");
          var searchResp = await fetch(
            "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name)&pageSize=1",
            { headers: { Authorization: "Bearer " + token } }
          );
          if (searchResp.ok) {
            var data = await searchResp.json();
            if (data.files && data.files.length > 0) {
              fileMap[name.toLowerCase()] = data.files[0].id;
            }
          }
        }
        console.log("[MarkView] Drive image search resolved: " + Object.keys(fileMap).length + "/" + names.length);
        sendResponse({ fileMap: fileMap });
      } catch (e) {
        console.warn("[MarkView] Drive image search failed:", e.message);
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  // Drive: fetch an image as a data URL (bypasses CORP restrictions)
  if (message.type === "fetchDriveImage") {
    (async () => {
      try {
        var token = await new Promise((resolve, reject) => {
          chrome.identity.getAuthToken(
            { interactive: false, scopes: ["https://www.googleapis.com/auth/drive.readonly"] },
            (t) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else if (!t) reject(new Error("No token"));
              else resolve(t);
            }
          );
        });
        var resp = await fetch(
          "https://www.googleapis.com/drive/v3/files/" + message.fileId + "?alt=media",
          { headers: { Authorization: "Bearer " + token } }
        );
        if (!resp.ok) { sendResponse({ error: "HTTP " + resp.status }); return; }
        var blob = await resp.blob();
        var reader = new FileReader();
        reader.onloadend = function() { sendResponse({ dataUrl: reader.result }); };
        reader.readAsDataURL(blob);
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  // SharePoint: resolve a sharing link via the SharePoint v2.0 shares endpoint.
  // Runs from the service worker so it is CORS-exempt (host_permissions).
  if (message.type === "resolveSharePointSharing") {
    (async () => {
      try {
        var sharingUrl = message.sharingUrl;
        var base64 = btoa(unescape(encodeURIComponent(sharingUrl)));
        var encoded = "u!" + base64.replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");

        // Derive the SharePoint origin from the sharing URL
        var spOrigin = new URL(sharingUrl).origin;
        var apiUrl = spOrigin + "/_api/v2.0/shares/" + encoded + "/driveItem?$select=name,@microsoft.graph.downloadUrl,@content.downloadUrl";

        var resp = await fetch(apiUrl, {
          headers: { "Accept": "application/json" },
          credentials: "include"
        });
        if (!resp.ok) {
          sendResponse({ error: "SharePoint shares API: HTTP " + resp.status });
          return;
        }
        var item = await resp.json();
        var downloadUrl = item["@microsoft.graph.downloadUrl"] || item["@content.downloadUrl"];
        if (!downloadUrl) {
          sendResponse({ error: "No download URL in driveItem", item: item });
          return;
        }
        var dlResp = await fetch(downloadUrl);
        if (!dlResp.ok) {
          sendResponse({ error: "Download failed: HTTP " + dlResp.status });
          return;
        }
        var content = await dlResp.text();
        sendResponse({ content: content, fileName: item.name || "document.md" });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  // Native Messaging: send a command to markview.exe
  if (message.type === "nativeCommand") {
    try {
      var cmdPort = chrome.runtime.connectNative("com.markview.ai");
      cmdPort.postMessage({
        type: message.command,
        markdown: message.markdown || "",
        theme: message.theme || "light",
        fileName: message.fileName || ""
      });
      cmdPort.onMessage.addListener(function(msg) {
        sendResponse({ ok: true, result: msg });
        cmdPort.disconnect();
      });
      cmdPort.onDisconnect.addListener(function() {
        sendResponse({ ok: true });
      });
    } catch (e) {
      sendResponse({ error: e.message });
    }
    return true;
  }

  // Native Messaging: render markdown via markview.exe
  if (message.type === "nativeRender") {
    try {
      var port = chrome.runtime.connectNative("com.markview.ai");
      var responded = false;

      port.onMessage.addListener(function (msg) {
        if (responded) return;
        if (msg.type === "html") {
          responded = true;
          sendResponse({ html: msg.html });
          port.disconnect();
        } else if (msg.type === "error") {
          responded = true;
          sendResponse({ error: msg.message });
          port.disconnect();
        }
      });

      port.onDisconnect.addListener(function () {
        var err = chrome.runtime.lastError;
        if (!responded) {
          responded = true;
          sendResponse({ error: err ? err.message : "Disconnected" });
        }
      });

      var theme = message.theme || "light";
      port.postMessage({ type: "render_themed", markdown: message.markdown, theme: theme, scheme: "default", width: "900" });

      // Timeout after 15 seconds
      setTimeout(function () {
        if (!responded) {
          responded = true;
          sendResponse({ error: "Render timeout" });
          try { port.disconnect(); } catch (_e) {}
        }
      }, 15000);
    } catch (e) {
      sendResponse({ error: e.message || "Native messaging failed" });
    }
    return true; // async response
  }
});
