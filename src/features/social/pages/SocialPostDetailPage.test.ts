import { describe, expect, it } from "vitest";
import source from "./SocialPostDetailPage.tsx?raw";

describe("SocialPostDetailPage quick reply integration", () => {
  it("routes plus to the full reply composer for the current post", () => {
    expect(source).toContain("<SocialQuickReplyComposer");
    expect(source).toContain("onOpenFullComposer={() => navigate(socialPaths.compose(scope, { replyToPostId: post.id }))}");
    expect(source).not.toContain("function QuickReplyComposer(");
  });
});
