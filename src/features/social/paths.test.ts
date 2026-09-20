import { describe, expect, expectTypeOf, it } from "vitest";
import pathsSource from "./paths.ts?raw";
import { socialPaths, socialReplyFocusState } from "./paths";

describe("social account profile paths", () => {
  it("builds the scoped friend activity routes", () => {
    expect(socialPaths.accountProfile("user", 237)).toBe("/moments/users/237");
    expect(socialPaths.accountProfile("merchant", 237)).toBe("/merchant/moments/users/237");
    expect(socialPaths.accountProfile("technician", 237)).toBe("/technician/moments/users/237");
    expect(socialPaths.accountProfile("user", 237, 1237)).toBe("/moments/users/237?identityId=1237");
  });

  it("routes hydrated formal authors through the reload-safe account activity page", () => {
    expect(socialPaths.profile("user", {
      entityType: "user",
      id: "237",
      identityId: 1237
    })).toBe("/moments/users/237?identityId=1237");
    expect(socialPaths.profile("user", {
      entityType: "user",
      id: "demo-profile"
    })).toBe("/profiles/user/demo-profile");
  });

  it("limits compose URLs to author, edit, and quote workflows", () => {
    type ComposeParams = NonNullable<Parameters<typeof socialPaths.compose>[1]>;

    expectTypeOf<ComposeParams>().toHaveProperty("author");
    expectTypeOf<ComposeParams>().toHaveProperty("editPostId");
    expectTypeOf<ComposeParams>().toHaveProperty("quotePostId");
    expectTypeOf<ComposeParams>().not.toHaveProperty("replyToPostId");
    expect(socialPaths.compose("merchant", {
      author: "shop:12",
      editPostId: "44",
      quotePostId: "31"
    })).toBe("/merchant/moments/compose?author=shop%3A12&editPostId=44&quotePostId=31");
  });

  it("exposes one transient state marker for focusing the canonical detail reply control", () => {
    expect(socialReplyFocusState).toEqual({ focusSocialReply: true });
    expect(pathsSource).not.toContain("replies(scope");
  });
});
