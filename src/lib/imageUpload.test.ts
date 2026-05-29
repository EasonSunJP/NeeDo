import { describe, expect, it } from "vitest";
import { isReadableImageUploadFile } from "./imageUpload";

describe("image upload file detection", () => {
  it("accepts image files by extension when the browser does not provide a MIME type", () => {
    expect(isReadableImageUploadFile({ name: "service-cover.JPG", type: "" })).toBe(true);
    expect(isReadableImageUploadFile({ name: "service-cover.heic", type: "application/octet-stream" })).toBe(true);
    expect(isReadableImageUploadFile({ name: "service-cover.txt", type: "" })).toBe(false);
  });
});
