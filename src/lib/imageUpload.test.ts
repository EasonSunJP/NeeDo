import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { isReadableImageUploadFile } from "./imageUpload";

describe("image upload file detection", () => {
  it("accepts image files by extension when the browser does not provide a MIME type", () => {
    expect(isReadableImageUploadFile({ name: "service-cover.JPG", type: "" })).toBe(true);
    expect(isReadableImageUploadFile({ name: "service-cover.heic", type: "application/octet-stream" })).toBe(true);
    expect(isReadableImageUploadFile({ name: "service-cover.txt", type: "" })).toBe(false);
  });
});

describe("image upload data URL conversion", () => {
  it("delegates to the quality-gated optimizer without an original-file fallback", async () => {
    const source = await readFile(new URL("./imageUpload.ts", import.meta.url), "utf8");

    expect(source).toContain('optimizeImageUpload(file, "avatar")');
    expect(source).toContain("readFileAsDataUrl(optimized.file)");
    expect(source).not.toMatch(/catch\s*\{[\s\S]*readFileAsDataUrl\(file\)/u);
  });
});
