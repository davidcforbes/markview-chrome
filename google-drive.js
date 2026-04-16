// MarkView Chrome Extension — Google Drive Integration
//
// Provides read/write access to .md files stored in Google Drive using
// the Chrome Identity API (chrome.identity.getAuthToken) for OAuth2 and
// the Google Drive API v3.
//
// Exported functions:
//   listMdFiles()                           — list .md files
//   readFile(fileId)                        — read file content
//   writeFile(fileId, content)              — update file content
//   createFile(name, content, folderId?)    — create a new .md file

/* global chrome */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

/**
 * Obtain an OAuth2 access token using chrome.identity.getAuthToken().
 * Requires the "identity" permission and the Drive scope in the manifest's
 * oauth2 configuration.
 *
 * @param {boolean} [interactive=true] - Whether to show a sign-in prompt.
 * @returns {Promise<string>} The access token.
 */
function getAccessToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken(
      { interactive, scopes: SCOPES },
      (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!token) {
          reject(new Error("Failed to obtain access token"));
        } else {
          resolve(token);
        }
      }
    );
  });
}

/**
 * Revoke the current cached token (useful on 401 / permission errors).
 *
 * @param {string} token - The token to revoke.
 * @returns {Promise<void>}
 */
function revokeToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

/**
 * Make an authenticated fetch request to the Drive API.
 * Automatically retries once on 401 by revoking the cached token and
 * re-authenticating.
 *
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
async function authedFetch(url, init = {}) {
  let token = await getAccessToken(true);

  const headers = { ...(init.headers || {}), Authorization: `Bearer ${token}` };
  let response = await fetch(url, { ...init, headers });

  // Retry once on 401 (expired or revoked token)
  if (response.status === 401) {
    await revokeToken(token);
    token = await getAccessToken(true);
    headers.Authorization = `Bearer ${token}`;
    response = await fetch(url, { ...init, headers });
  }

  return response;
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

/**
 * List markdown files in the user's Google Drive.
 *
 * Returns files whose MIME type is text/markdown OR whose name ends with .md.
 *
 * @param {number} [pageSize=50] - Max results per page.
 * @returns {Promise<Array<{id: string, name: string, mimeType: string, modifiedTime: string}>>}
 */
export async function listMdFiles(pageSize = 50) {
  const query = encodeURIComponent(
    "mimeType='text/markdown' or name contains '.md'"
  );
  const fields = encodeURIComponent(
    "files(id,name,mimeType,modifiedTime,size)"
  );
  const url = `${DRIVE_API}/files?q=${query}&fields=${fields}&pageSize=${pageSize}&orderBy=modifiedTime desc`;

  const response = await authedFetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Drive API listFiles failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Read the content of a file by its ID.
 *
 * @param {string} fileId - The Google Drive file ID.
 * @returns {Promise<string>} The file content as a UTF-8 string.
 */
export async function readFile(fileId) {
  const url = `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`;

  const response = await authedFetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Drive API readFile failed (${response.status}): ${body}`);
  }

  return response.text();
}

/**
 * Update (overwrite) the content of an existing file.
 *
 * @param {string} fileId  - The Google Drive file ID.
 * @param {string} content - New file content.
 * @returns {Promise<{id: string, name: string}>} Updated file metadata.
 */
export async function writeFile(fileId, content) {
  const url = `${UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media`;

  const response = await authedFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "text/markdown" },
    body: content,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Drive API writeFile failed (${response.status}): ${body}`);
  }

  return response.json();
}

/**
 * Create a new markdown file in Google Drive.
 *
 * Uses a multipart upload to set both metadata (name, parent folder) and
 * content in a single request.
 *
 * @param {string}  name      - File name (should end with .md).
 * @param {string}  content   - Initial file content.
 * @param {string}  [folderId] - Optional parent folder ID.
 * @returns {Promise<{id: string, name: string}>} Created file metadata.
 */
export async function createFile(name, content, folderId) {
  const metadata = {
    name,
    mimeType: "text/markdown",
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = "markview_boundary_" + Date.now();
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: text/markdown",
    "",
    content,
    `--${boundary}--`,
  ].join("\r\n");

  const url = `${UPLOAD_API}/files?uploadType=multipart`;

  const response = await authedFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const respBody = await response.text();
    throw new Error(
      `Drive API createFile failed (${response.status}): ${respBody}`
    );
  }

  return response.json();
}
