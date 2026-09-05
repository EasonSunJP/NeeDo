import { describe, expect, it } from "vitest";
import { resolveImNoStoreMediaSource } from "./media-source";

describe("IM media no-store delivery source", () => {
  it("versions formal relative and absolute IM media URLs without touching other media", () => {
    expect(resolveImNoStoreMediaSource("/media/im/a.jpg"))
      .toBe("/media/im/a.jpg?needo_media_policy=2");
    expect(resolveImNoStoreMediaSource("http://localhost:3000/media/im/a.jpg?x=1"))
      .toBe("http://localhost:3000/media/im/a.jpg?x=1&needo_media_policy=2");
    expect(resolveImNoStoreMediaSource("/media/content/a.jpg"))
      .toBe("/media/content/a.jpg");
  });

  it("does not duplicate the policy version", () => {
    expect(resolveImNoStoreMediaSource("/media/im/a.jpg?needo_media_policy=2"))
      .toBe("/media/im/a.jpg?needo_media_policy=2");
  });
});
