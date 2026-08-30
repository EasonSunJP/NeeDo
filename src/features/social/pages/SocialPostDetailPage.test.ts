import { describe, expect, it } from "vitest";
import source from "./SocialPostDetailPage.tsx?raw";

describe("SocialPostDetailPage quick reply integration", () => {
  it("keeps canonical detail as the focused reply surface with independent reply cards", () => {
    expect(source).toContain('title="回复动态"');
    expect(source).not.toContain("isThreadPage");
    expect(source).not.toContain("overflow-hidden rounded-[28px]");
    expect(source).toContain('className="mt-4 space-y-3"');
    expect(source).toContain("composerRef.current?.focus()");
    expect(source).toContain("count={post.replyCount}");
    expect(source).toContain("location.state?.focusSocialReply !== true");
    expect(source).toContain("pathname: location.pathname");
    expect(source).toContain("search: location.search");
    expect(source).toContain("hash: location.hash");
    expect(source).toContain("replace: true, state: null");
  });

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
