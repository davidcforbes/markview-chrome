// MarkView Chrome Extension — Cloud Storage Integration (Dropbox & Box)
//
// Provides a common interface for reading and writing markdown files via
// Dropbox API v2 and Box API v2. Both use OAuth2 with PKCE flow via
// chrome.identity.launchWebAuthFlow().
//
// Common interface:
//   listFiles(provider)                       — list .md files
//   readFile(provider, fileId)                — read file content
//   writeFile(provider, fileId, content)      — update file content

/* global chrome */

// ---------------------------------------------------------------------------
// Configuration — override these with your own app credentials.
// ---------------------------------------------------------------------------

const CONFIG = {
  dropbox: {
    clientId: "", // Set via options page or hardcode for dev
    authUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    apiUrl: "https://api.dropboxapi.com/2",
    contentUrl: "https://content.dropboxapi.com/2",
  },
  box: {
    clientId: "", // Set via options page or hardcode for dev
    authUrl: "https://account.box.com/api/oauth2/authorize",
    tokenUrl: "https://api.box.com/oauth2/token",
    apiUrl: "https://api.box.com/2.0",
    uploadUrl: "https://upload.box.com/api/2.0",
  },
};

// In-memory token cache (per session). For persistence across restarts
// you could store encrypted tokens in chrome.storage.local.
const tokenCache = {};

// ---------------------------------------------------------------------------
// OAuth2 PKCE helpers
// ---------------------------------------------------------------------------

/**
 * Generate a random string for use as a PKCE code verifier.
 */
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Derive the PKCE code challenge (S256) from a code verifier.
 */
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Run the OAuth2 PKCE authorization flow using chrome.identity.launchWebAuthFlow.
 *
 * @param {"dropbox" | "box"} provider
 * @returns {Promise<string>} Access token.
 */
async function authenticate(provider) {
  // Return cached token if available
  if (tokenCache[provider]) {
    return tokenCache[provider];
  }

  const cfg = CONFIG[provider];
  if (!cfg || !cfg.clientId) {
    throw new Error(
      `No client ID configured for provider "${provider}". Set it in the extension options.`
    );
  }

  const redirectUrl = chrome.identity.getRedirectURL(provider);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Build the authorization URL
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: redirectUrl,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    token_access_type: "offline", // Dropbox-specific, ignored by Box
  });

  const authUrlFull = `${cfg.authUrl}?${params.toString()}`;

  // Launch the web auth flow
  const resultUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrlFull, interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(responseUrl);
        }
      }
    );
  });

  // Extract the authorization code from the redirect URL
  const url = new URL(resultUrl);
  const code = url.searchParams.get("code");
  if (!code) {
    throw new Error("Authorization code not found in redirect URL");
  }

  // Exchange the code for an access token
  const tokenResponse = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: cfg.clientId,
      redirect_uri: redirectUrl,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    throw new Error(`Token exchange failed (${tokenResponse.status}): ${body}`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    throw new Error("No access_token in token response");
  }

  tokenCache[provider] = accessToken;
  return accessToken;
}

// ---------------------------------------------------------------------------
// Dropbox API v2 operations
// ---------------------------------------------------------------------------

const dropbox = {
  /**
   * List .md files in the user's Dropbox.
   */
  async listFiles() {
    const token = await authenticate("dropbox");

    const response = await fetch(
      `${CONFIG.dropbox.apiUrl}/files/search_v2`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: ".md",
          options: {
            file_extensions: ["md", "markdown"],
            max_results: 100,
          },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Dropbox search failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    return (data.matches || []).map((m) => ({
      id: m.metadata.metadata.id,
      name: m.metadata.metadata.name,
      path: m.metadata.metadata.path_display,
      modified: m.metadata.metadata.server_modified,
    }));
  },

  /**
   * Read file content from Dropbox.
   * @param {string} fileId - Dropbox file ID (e.g. "id:abc123") or path.
   */
  async readFile(fileId) {
    const token = await authenticate("dropbox");

    const response = await fetch(
      `${CONFIG.dropbox.contentUrl}/files/download`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Dropbox-API-Arg": JSON.stringify({ path: fileId }),
        },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Dropbox download failed (${response.status}): ${body}`
      );
    }

    return response.text();
  },

  /**
   * Write (overwrite) file content in Dropbox.
   * @param {string} fileId  - Dropbox file path (e.g. "/docs/readme.md").
   * @param {string} content - New file content.
   */
  async writeFile(fileId, content) {
    const token = await authenticate("dropbox");

    const response = await fetch(
      `${CONFIG.dropbox.contentUrl}/files/upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Dropbox-API-Arg": JSON.stringify({
            path: fileId,
            mode: "overwrite",
            mute: true,
          }),
          "Content-Type": "application/octet-stream",
        },
        body: content,
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Dropbox upload failed (${response.status}): ${body}`);
    }

    return response.json();
  },
};

// ---------------------------------------------------------------------------
// Box API v2 operations
// ---------------------------------------------------------------------------

const box = {
  /**
   * List .md files in the user's Box account.
   * Uses the Box Search API to find files with .md extension.
   */
  async listFiles() {
    const token = await authenticate("box");

    const params = new URLSearchParams({
      query: ".md",
      type: "file",
      file_extensions: "md,markdown",
      limit: "100",
      fields: "id,name,modified_at,size",
    });

    const response = await fetch(
      `${CONFIG.box.apiUrl}/search?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Box search failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    return (data.entries || []).map((entry) => ({
      id: entry.id,
      name: entry.name,
      modified: entry.modified_at,
      size: entry.size,
    }));
  },

  /**
   * Read file content from Box.
   * @param {string} fileId - Box file ID.
   */
  async readFile(fileId) {
    const token = await authenticate("box");

    const response = await fetch(
      `${CONFIG.box.apiUrl}/files/${encodeURIComponent(fileId)}/content`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Box download failed (${response.status}): ${body}`
      );
    }

    return response.text();
  },

  /**
   * Write (overwrite) file content in Box.
   * Uses the Box Upload API to upload a new version of the file.
   * @param {string} fileId  - Box file ID.
   * @param {string} content - New file content.
   */
  async writeFile(fileId, content) {
    const token = await authenticate("box");

    // Box requires multipart/form-data for uploads
    const blob = new Blob([content], { type: "text/markdown" });
    const formData = new FormData();
    formData.append("file", blob, "file.md");

    const response = await fetch(
      `${CONFIG.box.uploadUrl}/files/${encodeURIComponent(fileId)}/content`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Box upload failed (${response.status}): ${body}`);
    }

    return response.json();
  },
};

// ---------------------------------------------------------------------------
// Common interface
// ---------------------------------------------------------------------------

const providers = { dropbox, box };

/**
 * Get the provider implementation.
 * @param {"dropbox" | "box"} provider
 */
function getProvider(provider) {
  const impl = providers[provider];
  if (!impl) {
    throw new Error(`Unknown cloud storage provider: "${provider}"`);
  }
  return impl;
}

/**
 * List .md files from the specified cloud storage provider.
 * @param {"dropbox" | "box"} provider
 */
export async function listFiles(provider) {
  return getProvider(provider).listFiles();
}

/**
 * Read file content from the specified cloud storage provider.
 * @param {"dropbox" | "box"} provider
 * @param {string} fileId
 */
export async function readFile(provider, fileId) {
  return getProvider(provider).readFile(fileId);
}

/**
 * Write file content to the specified cloud storage provider.
 * @param {"dropbox" | "box"} provider
 * @param {string} fileId
 * @param {string} content
 */
export async function writeFile(provider, fileId, content) {
  return getProvider(provider).writeFile(fileId, content);
}
