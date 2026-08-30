import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RealtimeSocialPost } from "../realtime/api";
import type { SocialPost } from "./types";
import * as socialContext from "./context";

type FormalProviderBehavior = {
  createFormalSocialPost?: (
    request: () => Promise<RealtimeSocialPost>,
    onSuccess: (created: RealtimeSocialPost, mapped: SocialPost) => void
  ) => Promise<SocialPost>;
  getMountedReplyParentReplyCountBaseline?: (posts: SocialPost[], replyToPostId?: string) => number | undefined;
  mergeCreatedFormalSocialPost?: (posts: SocialPost[], mapped: SocialPost, baseline: number | undefined) => SocialPost[];
  resolveFormalSocialUpdateRichText?: (content: string, richText: unknown) => SocialPost["richText"];
};

const behavior = socialContext as typeof socialContext & FormalProviderBehavior;

const source = readFileSync(new URL("./context.tsx", import.meta.url), "utf8");

describe("formal social provider gate", () => {
  it("always mounts the formal provider", () => {
    expect(source).not.toContain("isStaticDemoMode");
    expect(source).not.toContain("isFrontendBypassSession");
    expect(source).toContain("<FormalSocialProvider>");
  });

  it("loads formal posts through the realtime API without formal localStorage business data", () => {
    expect(source).toContain("realtimeApi.listSocialPosts");
    expect(source).toContain("subscribeRealtimeEvents");
    expect(source).toContain("mapFormalSocialPost");
    expect(source).not.toContain("formalSocialUnavailableState");
    expect(source).not.toContain("FormalSocialCompatibilityProvider");
  });

  it("waits for access-token restoration before loading protected social data", () => {
    expect(source).toContain("const { isRestoring, session } = useAuth();");
    expect(source).toContain("if (sessionUserId === null || isRestoring) return;");
  });

  it("does not reload social and notification data for an equivalent session object", () => {
    const loadSource = source.slice(
      source.indexOf("const loadFormalSocial = useCallback"),
      source.indexOf("const value = useMemo")
    );

    expect(loadSource).toContain("sessionUserId");
    expect(loadSource).not.toContain("session.");
    expect(loadSource).not.toContain("[isRestoring, session]");
  });

  it("loads a selected account only after its profile page asks for it and deduplicates concurrent requests", () => {
    expect(source).toContain("ensureAccountProfile:");
    expect(source).toContain("accountProfileRequestsRef");
    expect(source).toContain("realtimeApi.getSocialActivityStatus(userId)");
    expect(source).toContain("realtimeApi.listSocialPosts({ page: 1, pageSize: 100, authorUserId: userId })");
    expect(source).toContain("accountProfileRequestsRef.current.set(userId, request)");
    expect(source).toContain("accountProfileRequestsRef.current.delete(userId)");
  });

  it("keeps draft actions stable so composer autosave cannot trigger an update-depth loop", () => {
    expect(source).toContain("const saveDraft = useCallback(");
    expect(source).toContain("const clearDraft = useCallback(");
    expect(source).toMatch(/\n\s+saveDraft,\n\s+clearDraft,/u);
    expect(source).not.toContain("saveDraft: (draftKey, draft) => setState");
  });

  it("persists published post edits through the formal update API", () => {
    expect(source).toContain("const updatePost = async");
    expect(source).toContain("realtimeApi.updateSocialPost");
    expect(source).not.toContain("updatePost: formalSocialMutationUnavailable");
  });

  it("leaves mounted posts unchanged when a formal reply create rejects", async () => {
    const posts = [makeSocialPost({ id: "700", replyCount: 2 })];
    expect(behavior.createFormalSocialPost).toBeTypeOf("function");
    expect(behavior.getMountedReplyParentReplyCountBaseline).toBeTypeOf("function");
    if (!behavior.createFormalSocialPost || !behavior.getMountedReplyParentReplyCountBaseline) return;
    const baseline = behavior.getMountedReplyParentReplyCountBaseline(posts, "700");
    let successCalls = 0;

    await expect(behavior.createFormalSocialPost(
      async () => { throw new Error("request failed"); },
      () => { successCalls += 1; }
    )).rejects.toThrow("request failed");

    expect(successCalls).toBe(0);
    expect(posts).toEqual([makeSocialPost({ id: "700", replyCount: 2 })]);
    expect(baseline).toBe(2);
  });

  it("increments a mounted reply parent once after an ordinary successful create", async () => {
    let posts = [makeSocialPost({ id: "700", replyCount: 2 })];
    expect(behavior.createFormalSocialPost).toBeTypeOf("function");
    expect(behavior.getMountedReplyParentReplyCountBaseline).toBeTypeOf("function");
    expect(behavior.mergeCreatedFormalSocialPost).toBeTypeOf("function");
    if (!behavior.createFormalSocialPost || !behavior.getMountedReplyParentReplyCountBaseline || !behavior.mergeCreatedFormalSocialPost) return;
    const baseline = behavior.getMountedReplyParentReplyCountBaseline(posts, "700");

    const mapped = await behavior.createFormalSocialPost(
      async () => makeReplyWirePost(),
      (_created, nextPost) => {
        posts = behavior.mergeCreatedFormalSocialPost!(posts, nextPost, baseline);
      }
    );

    expect(mapped.id).toBe("701");
    expect(posts.find((post) => post.id === "700")?.replyCount).toBe(3);
    expect(posts.filter((post) => post.id === "701")).toHaveLength(1);
  });

  it("does not overwrite an authoritative reply count that arrives before the POST resolves", async () => {
    let posts = [makeSocialPost({ id: "700", replyCount: 2 })];
    expect(behavior.createFormalSocialPost).toBeTypeOf("function");
    expect(behavior.getMountedReplyParentReplyCountBaseline).toBeTypeOf("function");
    expect(behavior.mergeCreatedFormalSocialPost).toBeTypeOf("function");
    if (!behavior.createFormalSocialPost || !behavior.getMountedReplyParentReplyCountBaseline || !behavior.mergeCreatedFormalSocialPost) return;
    const baseline = behavior.getMountedReplyParentReplyCountBaseline(posts, "700");
    let resolveReply: ((post: RealtimeSocialPost) => void) | undefined;
    const request = new Promise<RealtimeSocialPost>((resolve) => { resolveReply = resolve; });

    const pendingCreate = behavior.createFormalSocialPost(
      () => request,
      (_created, nextPost) => {
        posts = behavior.mergeCreatedFormalSocialPost!(posts, nextPost, baseline);
      }
    );
    posts = [makeSocialPost({ id: "700", replyCount: 3 })];
    resolveReply?.(makeReplyWirePost());
    await pendingCreate;

    expect(posts.find((post) => post.id === "700")?.replyCount).toBe(3);
  });

  it("preserves unchanged structured edit metadata and omits stale metadata after text changes", () => {
    const richText = {
      version: 1 as const,
      parts: [
        { type: "text" as const, value: "确认" },
        { type: "judgement" as const, value: "Pending" }
      ]
    };

    expect(behavior.resolveFormalSocialUpdateRichText).toBeTypeOf("function");
    if (!behavior.resolveFormalSocialUpdateRichText) return;
    expect(behavior.resolveFormalSocialUpdateRichText("确认Pending", richText)).toEqual(richText);
    expect(behavior.resolveFormalSocialUpdateRichText("已经确认", richText)).toBeUndefined();
  });
});

function makeSocialPost(overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    id: "701",
    authorId: "41",
    authorType: "user",
    text: "确认Pending",
    media: [],
    hashtags: [],
    mentions: [],
    createdAt: "2026-08-30T03:00:00.000Z",
    likeCount: 0,
    replyCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    isPinned: false,
    visibility: "public",
    status: "published",
    postType: "post",
    ...overrides
  };
}

function makeReplyWirePost(): RealtimeSocialPost {
  return {
    id: 701,
    authorUserId: 41,
    content: "确认Pending",
    createdAt: "2026-08-30T03:00:00.000Z",
    media: { items: [] },
    replyToPostId: 700,
    replyCount: 0,
    visibility: "public"
  };
}
