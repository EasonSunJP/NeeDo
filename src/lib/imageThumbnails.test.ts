import { describe, expect, it } from "vitest";
import { getGeneratedImageThumbnailUrl } from "./imageThumbnails";

describe("getGeneratedImageThumbnailUrl", () => {
  it("uses the system avatar asset directly because it has no thumbnail", () => {
    expect(getGeneratedImageThumbnailUrl("/images/generated/profiles/dodo-default-avatar.webp"))
      .toBe("/images/generated/profiles/dodo-default-avatar.webp");
    expect(getGeneratedImageThumbnailUrl("/images/generated/profiles/ai-profile-01.jpg"))
      .toBe("/images/generated/thumbnails/profiles/ai-profile-01.jpg");
  });
});
