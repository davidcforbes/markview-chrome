// Shared helpers for loading the MarkView Chrome extension under Playwright.
//
// Playwright's chromium.launchPersistentContext is the supported way to load
// an unpacked MV3 extension and exercise it end-to-end.

import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const EXTENSION_PATH = resolve(here, "../..");

/**
 * Launch a persistent Chromium context with the MarkView extension loaded.
 * Returns { context, extensionId, cleanup }.
 */
export async function launchWithExtension(options = {}) {
  const userDataDir = mkdtempSync(join(tmpdir(), "mv-playwright-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // MV3 service workers require headful
    channel: "chromium",
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
    ...options,
  });

  // Wait for the extension service worker to register, then grab its ID.
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent("serviceworker", { timeout: 10_000 });
  }
  const url = worker.url(); // chrome-extension://<id>/service-worker.js
  const match = url.match(/^chrome-extension:\/\/([a-p]{32})\//);
  if (!match) throw new Error("Could not parse extension ID from SW URL: " + url);
  const extensionId = match[1];

  const cleanup = async () => {
    await context.close();
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  };

  return { context, extensionId, cleanup };
}
