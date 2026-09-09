import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientEntryFiles = [
  "index.html",
  "user.html",
  "technician.html",
  "merchant.html",
  "store-admin.html",
  "pf-admin.html",
  "afirieito.html",
  "afirieito-admin.html"
];

describe("mobile viewport policy", () => {
  it.each(clientEntryFiles)(
    "%s lets capable Chromium resize the layout viewport for the keyboard",
    (entryFile) => {
      const source = readFileSync(resolve(process.cwd(), entryFile), "utf8");
      const viewport = source.match(/<meta\s+name="viewport"\s+content="([^"]+)"/u)?.[1];

      expect(viewport).toContain("viewport-fit=cover");
      expect(viewport).toContain("interactive-widget=resizes-content");
    }
  );
});
