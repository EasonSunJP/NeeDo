import { describe, expect, it } from "vitest";
import source from "./SocialPostDetailPage.tsx?raw";

describe("SocialPostDetailPage quick reply integration", () => {
  it("keeps one inline reply composer without a full-composer override", () => {
    const obsoleteReplyComposeCall = ["socialPaths.compose(scope, { reply", "ToPostId: post.id })"].join("");

    expect(source).toContain("<SocialQuickReplyComposer");
    expect(source).toContain('targetIdentity={`${actorKey}:${post.id}`}');
    expect(source).not.toContain(["onOpen", "FullComposer"].join(""));
    expect(source).not.toContain(["isThread", "Page"].join(""));
    expect(source).not.toContain(obsoleteReplyComposeCall);
    expect(source).not.toContain("function QuickReplyComposer(");
  });

  it("forwards structured rich text to the detail, reply, and quoted-preview renderer surfaces", () => {
    expect(source.match(/richText=\{post\.richText\}/g)).toHaveLength(3);
    expect(source).toContain('<DetailMiniPostCard caption="引用动态" post={quotedPost}');
  });
});
