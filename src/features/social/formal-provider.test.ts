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
  mergeFormalSocialBootstrapPosts?: (
    currentPosts: SocialPost[],
    nextPosts: SocialPost[],
    activePostThreadIds: ReadonlySet<string>
  ) => SocialPost[];
  getActiveFormalSocialThreadIdsForEvent?: (
    activePostThreadIds: ReadonlySet<string>,
    payload: unknown
  ) => string[];
  buildFormalSocialSessionKey?: (userId: number | null, identityId: number | null) => string;
  shouldCommitFormalSocialRequest?: (
    requestedSessionKey: string,
    currentSessionKey: string,
    retained?: boolean
  ) => boolean;
  mergeHydratedFormalSocialPostThread?: (
    currentPosts: SocialPost[],
    hydratedPosts: SocialPost[],
    postId: string
  ) => SocialPost[];
  removeFormalSocialPostThread?: (posts: SocialPost[], postId: string) => SocialPost[];
  resolveFormalSocialUpdateRichText?: (content: string, richText: unknown) => SocialPost["richText"];
  fetchFormalSocialPostThread?: (
    postId: number,
    api: {
      getSocialPost: (id: number, options?: { signal?: AbortSignal }) => Promise<RealtimeSocialPost>;
      listSocialPosts: (
        query: { page?: number; pageSize?: number; replyToPostId?: number },
        options?: { signal?: AbortSignal }
      ) => Promise<{
        list: RealtimeSocialPost[];
        page: number;
        page_size: number;
        total: number;
      }>;
    },
    signal?: AbortSignal
  ) => Promise<{ parent: RealtimeSocialPost; replies: RealtimeSocialPost[] }>;
  cleanupLegacySocialReplyDrafts?: (storage: Pick<Storage, "getItem" | "setItem">) => void;
};

const behavior = socialContext as typeof socialContext & FormalProviderBehavior;

const source = readFileSync(new URL("./context.tsx", import.meta.url), "utf8");

function createMemoryStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  const writes: string[] = [];
  return {
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        writes.push(key);
        values.set(key, value);
      }
    },
    writes
  };
}

describe("formal social provider gate", () => {
  it("always mounts the formal provider", () => {
    expect(source).not.toContain("isStaticDemoMode");
    expect(source).not.toContain("isFrontendBypassSession");
    expect(source).toContain("<FormalSocialProvider key={formalSessionKey}>");
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
    expect(source).toContain("accountProfileRequestsRef.current.set(requestKey, request)");
    expect(source).toContain("accountProfileRequestsRef.current.delete(requestKey)");
  });

  it("keys formal state by the exact active identity and rejects a delayed same-type identity response", async () => {
    expect(behavior.buildFormalSocialSessionKey).toBeTypeOf("function");
    expect(behavior.shouldCommitFormalSocialRequest).toBeTypeOf("function");
    if (!behavior.buildFormalSocialSessionKey || !behavior.shouldCommitFormalSocialRequest) return;

    const identityAKey = behavior.buildFormalSocialSessionKey(7, 70);
    const identityBKey = behavior.buildFormalSocialSessionKey(7, 71);
    expect(identityAKey).not.toBe(identityBKey);

    let currentSessionKey = identityAKey;
    let visibleValue = "initial";
    let resolveIdentityA!: (value: string) => void;
    const delayedIdentityA = new Promise<string>((resolve) => {
      resolveIdentityA = resolve;
    }).then((value) => {
      if (behavior.shouldCommitFormalSocialRequest!(identityAKey, currentSessionKey)) {
        visibleValue = value;
      }
    });

    currentSessionKey = identityBKey;
    if (behavior.shouldCommitFormalSocialRequest(identityBKey, currentSessionKey)) {
      visibleValue = "identity-b";
    }
    resolveIdentityA("identity-a");
    await delayedIdentityA;

    expect(visibleValue).toBe("identity-b");
    expect(behavior.shouldCommitFormalSocialRequest(identityBKey, identityBKey, false)).toBe(false);
    expect(source).toContain("session?.currentIdentity?.id");
    expect(source).toContain("key={formalSessionKey}");
  });

  it("hydrates a direct detail parent and every paginated reply instead of relying on the bootstrap window", async () => {
    expect(behavior.fetchFormalSocialPostThread).toBeTypeOf("function");
    if (!behavior.fetchFormalSocialPostThread) return;

    const parent = makeReplyWirePost({ id: 700, replyToPostId: null, replyCount: 205 });
    const replies = Array.from({ length: 205 }, (_, index) =>
      makeReplyWirePost({ id: 701 + index, replyToPostId: 700 })
    );
    const listCalls: Array<{ page?: number; pageSize?: number; replyToPostId?: number }> = [];

    const result = await behavior.fetchFormalSocialPostThread(700, {
      getSocialPost: async (id) => {
        expect(id).toBe(700);
        return parent;
      },
      listSocialPosts: async (query) => {
        listCalls.push(query);
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 100;
        const start = (page - 1) * pageSize;
        return {
          list: replies.slice(start, start + pageSize),
          page,
          page_size: pageSize,
          total: replies.length
        };
      }
    });

    expect(result.parent).toBe(parent);
    expect(result.replies).toHaveLength(205);
    expect(result.replies.at(-1)?.id).toBe(905);
    expect(listCalls).toEqual([
      { page: 1, pageSize: 100, replyToPostId: 700 },
      { page: 2, pageSize: 100, replyToPostId: 700 },
      { page: 3, pageSize: 100, replyToPostId: 700 }
    ]);
  });

  it("fails an incomplete repeated-page hydration without purging a complete cached thread", async () => {
    expect(behavior.fetchFormalSocialPostThread).toBeTypeOf("function");
    expect(behavior.mergeHydratedFormalSocialPostThread).toBeTypeOf("function");
    if (!behavior.fetchFormalSocialPostThread || !behavior.mergeHydratedFormalSocialPostThread) return;

    const parent = makeReplyWirePost({ id: 700, replyToPostId: null, replyCount: 205 });
    const repeated = Array.from({ length: 100 }, (_, index) =>
      makeReplyWirePost({ id: 701 + index, replyToPostId: 700 })
    );
    const listCalls: number[] = [];
    let cachedPosts = [
      makeSocialPost({ id: "700", replyCount: 205 }),
      ...Array.from({ length: 205 }, (_, index) => makeSocialPost({
        id: String(701 + index),
        replyToPostId: "700",
        postType: "reply"
      }))
    ];

    const hydration = behavior.fetchFormalSocialPostThread(700, {
      getSocialPost: async () => parent,
      listSocialPosts: async (query) => {
        listCalls.push(query.page ?? 1);
        return {
          list: repeated,
          page: query.page ?? 1,
          page_size: 100,
          total: 205
        };
      }
    }).then(({ parent: hydratedParent, replies }) => {
      cachedPosts = behavior.mergeHydratedFormalSocialPostThread!(
        cachedPosts,
        [hydratedParent, ...replies].map((post) => makeSocialPost({
          id: String(post.id),
          replyToPostId: post.replyToPostId === null ? undefined : String(post.replyToPostId),
          postType: post.replyToPostId === null ? "post" : "reply"
        })),
        "700"
      );
    });

    await expect(hydration).rejects.toThrow("error.social.thread_incomplete");
    expect(listCalls).toEqual([1, 2]);
    expect(cachedPosts.filter((post) => post.replyToPostId === "700")).toHaveLength(205);
  });

  it("passes one abort signal through the parent and reply requests", async () => {
    expect(behavior.fetchFormalSocialPostThread).toBeTypeOf("function");
    if (!behavior.fetchFormalSocialPostThread) return;

    const controller = new AbortController();
    const observedSignals: AbortSignal[] = [];
    const request = behavior.fetchFormalSocialPostThread(700, {
      getSocialPost: async (_id, options) => {
        if (options?.signal) observedSignals.push(options.signal);
        return makeReplyWirePost({ id: 700, replyToPostId: null });
      },
      listSocialPosts: (_query, options) => new Promise((_resolve, reject) => {
        if (options?.signal) observedSignals.push(options.signal);
        options?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      })
    }, controller.signal);

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(observedSignals).toEqual([controller.signal, controller.signal]);
    expect(source).toContain("postThreadAbortControllersRef");
    expect(source).toContain("controller.abort()");
  });

  it("atomically replaces all hydrated replies so SSE updates and removals beyond page one are visible", () => {
    expect(behavior.mergeHydratedFormalSocialPostThread).toBeTypeOf("function");
    if (!behavior.mergeHydratedFormalSocialPostThread) return;

    const current = [
      makeSocialPost({ id: "700", replyCount: 205 }),
      ...Array.from({ length: 205 }, (_, index) => makeSocialPost({
        id: String(701 + index),
        replyToPostId: "700",
        postType: "reply",
        text: `old-${index}`
      })),
      makeSocialPost({ id: "999", text: "unrelated" })
    ];
    const hydrated = [
      makeSocialPost({ id: "700", replyCount: 204 }),
      ...Array.from({ length: 204 }, (_, index) => makeSocialPost({
        id: String(701 + index),
        replyToPostId: "700",
        postType: "reply",
        text: index === 203 ? "updated-beyond-page-one" : `new-${index}`
      }))
    ];

    const merged = behavior.mergeHydratedFormalSocialPostThread(current, hydrated, "700");

    expect(merged.filter((post) => post.replyToPostId === "700")).toHaveLength(204);
    expect(merged.find((post) => post.id === "904")?.text).toBe("updated-beyond-page-one");
    expect(merged.some((post) => post.id === "905")).toBe(false);
    expect(merged.find((post) => post.id === "999")?.text).toBe("unrelated");
  });

  it("evicts a stale cached parent and its replies after a current retained 404", () => {
    expect(behavior.removeFormalSocialPostThread).toBeTypeOf("function");
    if (!behavior.removeFormalSocialPostThread) return;

    const remaining = behavior.removeFormalSocialPostThread([
      makeSocialPost({ id: "700" }),
      makeSocialPost({ id: "701", replyToPostId: "700", postType: "reply" }),
      makeSocialPost({ id: "999" })
    ], "700");

    expect(remaining.map((post) => post.id)).toEqual(["999"]);
  });

  it("keeps the active hydrated thread mounted across a bounded SSE bootstrap refresh", () => {
    expect(behavior.mergeFormalSocialBootstrapPosts).toBeTypeOf("function");
    if (!behavior.mergeFormalSocialBootstrapPosts) return;

    const current = [
      makeSocialPost({ id: "700" }),
      makeSocialPost({ id: "701", replyToPostId: "700", postType: "reply" }),
      makeSocialPost({ id: "699" })
    ];
    const refreshedParent = makeSocialPost({ id: "700", replyCount: 8 });
    const next = [makeSocialPost({ id: "800" }), refreshedParent];

    const merged = behavior.mergeFormalSocialBootstrapPosts(current, next, new Set(["700"]));

    expect(merged.map((post) => post.id).sort()).toEqual(["700", "701", "800"]);
    expect(merged.find((post) => post.id === "700")).toBe(refreshedParent);
  });

  it("re-hydrates only the active thread affected by a realtime parent or reply event", () => {
    expect(behavior.getActiveFormalSocialThreadIdsForEvent).toBeTypeOf("function");
    if (!behavior.getActiveFormalSocialThreadIdsForEvent) return;

    const active = new Set(["700", "800"]);
    expect(behavior.getActiveFormalSocialThreadIdsForEvent(active, {
      id: 901,
      replyToPostId: 700
    })).toEqual(["700"]);
    expect(behavior.getActiveFormalSocialThreadIdsForEvent(active, {
      id: 800,
      replyToPostId: null
    })).toEqual(["800"]);
    expect(behavior.getActiveFormalSocialThreadIdsForEvent(active, {
      id: 999,
      replyToPostId: null
    })).toEqual([]);
  });

  it("keeps draft actions stable so composer autosave cannot trigger an update-depth loop", () => {
    expect(source).toContain("const saveDraft = useCallback(");
    expect(source).toContain("const clearDraft = useCallback(");
    expect(source).toMatch(/\n\s+saveDraft,\n\s+clearDraft,/u);
    expect(source).not.toContain("saveDraft: (draftKey, draft) => setState");
  });

  it("cleans only legacy reply drafts without hydrating or creating ongoing draft storage", () => {
    expect(behavior.cleanupLegacySocialReplyDrafts).toBeTypeOf("function");
    if (!behavior.cleanupLegacySocialReplyDrafts) return;

    const draft = (overrides: Record<string, unknown> = {}) => ({
      authorKey: "user:7",
      text: "draft",
      media: [],
      updatedAt: "2026-08-30T00:00:00.000Z",
      ...overrides
    });
    const unrelated = {
      posts: [{ id: "legacy-business-data-must-not-hydrate" }],
      notifications: [{ id: "notice-1" }],
      custom: { preserve: true }
    };
    const { storage, writes } = createMemoryStorage({
      "needo.social.module.v2": JSON.stringify({
        ...unrelated,
        drafts: {
          "composer:user:root": draft(),
          "composer:user:quote": draft({ quotePostId: "41" }),
          "composer:user:edit": draft({ editPostId: "42" }),
          "composer:user:reply": draft({ replyToPostId: "43" })
        }
      })
    });

    behavior.cleanupLegacySocialReplyDrafts(storage);

    const cleaned = JSON.parse(storage.getItem("needo.social.module.v2") ?? "{}");
    expect(cleaned).toMatchObject(unrelated);
    expect(cleaned.drafts).toEqual({
      "composer:user:root": draft(),
      "composer:user:quote": draft({ quotePostId: "41" }),
      "composer:user:edit": draft({ editPostId: "42" })
    });
    expect(storage.getItem("needo.social.composer-drafts.v1")).toBeNull();
    expect(writes).toEqual(["needo.social.module.v2"]);
    expect(source).toContain("const [storedState, setState] = useState<SocialState>(emptyFormalSocialState);");
    expect(source).toContain("cleanupLegacySocialReplyDrafts();");
    expect(source).not.toContain("hydrateSocialComposerDrafts");
    expect(source).not.toContain("persistSocialComposerDrafts");
  });

  it("treats legacy cleanup storage failures as non-blocking", () => {
    expect(behavior.cleanupLegacySocialReplyDrafts).toBeTypeOf("function");
    if (!behavior.cleanupLegacySocialReplyDrafts) return;

    expect(() => behavior.cleanupLegacySocialReplyDrafts!({
      getItem: () => { throw new Error("storage denied"); },
      setItem: () => { throw new Error("storage denied"); }
    })).not.toThrow();
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

function makeReplyWirePost(overrides: Partial<RealtimeSocialPost> = {}): RealtimeSocialPost {
  return {
    id: 701,
    authorUserId: 41,
    content: "确认Pending",
    createdAt: "2026-08-30T03:00:00.000Z",
    media: { items: [] },
    replyToPostId: 700,
    replyCount: 0,
    visibility: "public",
    ...overrides
  };
}
