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
    "%s keeps the layout viewport stable while the visual viewport follows the keyboard",
    (entryFile) => {
      const source = readFileSync(resolve(process.cwd(), entryFile), "utf8");
      const viewport = source.match(/<meta\s+name="viewport"\s+content="([^"]+)"/u)?.[1];

      expect(viewport).toContain("width=device-width");
      expect(viewport).toContain("initial-scale=1.0");
      expect(viewport).toContain("minimum-scale=1.0");
      expect(viewport).toContain("viewport-fit=cover");
      expect(viewport).toContain("interactive-widget=resizes-visual");
      expect(viewport).not.toContain("interactive-widget=resizes-content");
      expect(viewport).not.toContain("maximum-scale=");
      expect(viewport).not.toContain("user-scalable=no");
    }
  );
});
