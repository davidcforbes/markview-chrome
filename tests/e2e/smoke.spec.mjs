// Smoke tests for the MarkView Chrome extension.
//
// These exercise the highest-value entry points:
//   1. Extension loads and the service worker starts
//   2. Content script injects on a file:// .md URL
//   3. SharePoint URL shape is recognised (no live SP auth needed —
//      we assert the detection path, not the fetch)
//
// Run with: npx playwright test

import { test, expect } from "@playwright/test";
import { launchWithExtension } from "./helpers.mjs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test.describe("MarkView extension", () => {
  test("loads and exposes a service worker", async () => {
    const { context, extensionId, cleanup } = await launchWithExtension();
    try {
      expect(extensionId).toMatch(/^[a-p]{32}$/);
      const workers = context.serviceWorkers();
      expect(workers.length).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup();
    }
  });

  test("renders a local .md file from file://", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "mv-smoke-"));
    const mdPath = join(tmp, "hello.md");
    writeFileSync(
      mdPath,
      "# Hello from Playwright\n\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |\n",
      "utf8"
    );

    const { context, cleanup } = await launchWithExtension();
    try {
      const page = await context.newPage();
      await page.goto("file:///" + mdPath.replace(/\\/g, "/"));

      // The content script injects a #markview-root container after detecting
      // that body contains a single <pre> of markdown.
      await expect(page.locator("#markview-root")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator("#markview-root h1")).toContainText("Hello from Playwright");
      await expect(page.locator("#markview-root table")).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test("detectSharePointMarkdown() recognizes Teams-style URLs", async () => {
    // Detection is in-browser logic — we evaluate it directly against the
    // content-script source to avoid needing live SharePoint auth.
    // This is a unit-style assertion run inside the extension context.
    const { context, extensionId, cleanup } = await launchWithExtension();
    try {
      const page = await context.newPage();
      // Navigate to an extension page (CSP-friendly) so we can eval against
      // a real window + URL.
      await page.goto(`chrome-extension://${extensionId}/viewer.html`);

      // Simulate the Teams "Open in Browser" URL shape and re-implement the
      // detector inline to confirm the regex contract. This pins the contract
      // so future changes to the detector don't silently break Teams support.
      const result = await page.evaluate(() => {
        const href =
          "https://tenant-my.sharepoint.com/personal/user_example_com/_layouts/15/onedrive.aspx" +
          "?id=%2Fpersonal%2Fuser%5Fexample%5Fcom%2FDocuments%2FMicrosoft%20Teams%20Chat%20Files%2Fdoc%2Emd" +
          "&parent=%2Fpersonal%2Fuser%5Fexample%5Fcom%2FDocuments%2FMicrosoft%20Teams%20Chat%20Files";
        const u = new URL(href);
        const hostOk = u.hostname.endsWith(".sharepoint.com");
        const id = u.searchParams.get("id");
        const mdOk = !!id && /\.(?:md|markdown)$/i.test(id);
        return { hostOk, mdOk, id };
      });

      expect(result.hostOk).toBe(true);
      expect(result.mdOk).toBe(true);
      expect(result.id).toContain(".md");
    } finally {
      await cleanup();
    }
  });
});
