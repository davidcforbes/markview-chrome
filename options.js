// MarkView Chrome Extension — Options Page

(function () {
  "use strict";

  const FIELDS = [
    { id: "theme", type: "select" },
    { id: "defaultEditor", type: "text" },
    { id: "enableMermaid", type: "checkbox" },
    { id: "enableSyntaxHighlight", type: "checkbox" },
    { id: "cloudProvider", type: "select" },
  ];

  // ---------------------------------------------------------------------------
  // Load saved settings into the form
  // ---------------------------------------------------------------------------

  function loadSettings() {
    chrome.storage.sync.get(null, (settings) => {
      for (const field of FIELDS) {
        const el = document.getElementById(field.id);
        if (!el) continue;

        if (field.type === "checkbox") {
          el.checked = settings[field.id] !== undefined ? settings[field.id] : el.checked;
        } else {
          el.value = settings[field.id] || el.value;
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Save settings from the form
  // ---------------------------------------------------------------------------

  function saveSettings() {
    const settings = {};
    for (const field of FIELDS) {
      const el = document.getElementById(field.id);
      if (!el) continue;

      if (field.type === "checkbox") {
        settings[field.id] = el.checked;
      } else {
        settings[field.id] = el.value;
      }
    }

    chrome.storage.sync.set(settings, () => {
      const status = document.getElementById("status");
      status.textContent = "Settings saved.";
      setTimeout(() => {
        status.textContent = "";
      }, 2000);
    });
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", loadSettings);
  document.getElementById("save").addEventListener("click", saveSettings);
})();
