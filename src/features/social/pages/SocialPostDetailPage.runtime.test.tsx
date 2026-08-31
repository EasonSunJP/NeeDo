/** @vitest-environment jsdom */

import { StrictMode, act, createElement, useLayoutEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SocialPost, SocialProfile } from "../types";

const composerFocus = vi.hoisted(() => vi.fn());
const socialMock = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("../context", () => ({
  useSocial: () => socialMock.value
}));

vi.mock("../../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "",
  useClientTheme: () => ({ theme: "dark-green" })
}));

vi.mock("../../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "zh" })
}));

vi.mock("../components/SocialQuickReplyComposer", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  function SocialQuickReplyComposerState({ forwardedRef }: { forwardedRef: React.Ref<{ focus: () => void }> }) {
    React.useImperativeHandle(forwardedRef, () => ({ focus: composerFocus }), []);
    return createElement("div", { "data-social-quick-reply-composer": "true" });
  }

  return {
    SocialQuickReplyComposer: React.forwardRef<{ focus: () => void }, { targetIdentity: string }>(function SocialQuickReplyComposer({ targetIdentity }, ref) {
      return createElement(SocialQuickReplyComposerState, { forwardedRef: ref, key: targetIdentity });
    })
  };
});

import { SocialPostDetailPage } from "./SocialPostDetailPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const profiles: Record<string, SocialProfile> = {
  "user:1": {
    id: "1", entityType: "user", displayName: "当前账号", handle: "current", avatar: "/avatar-1.jpg", coverImage: "", bio: "", joinedAt: "2026-01-01T00:00:00.000Z", verifiedStatus: "none", followerCount: 0, followingCount: 0, extraProfileFields: {}
  },
  "user:2": {
    id: "2", entityType: "user", displayName: "原动态作者", handle: "root", avatar: "/avatar-2.jpg", coverImage: "", bio: "", joinedAt: "2026-01-01T00:00:00.000Z", verifiedStatus: "none", followerCount: 0, followingCount: 0, extraProfileFields: {}
  },
  "user:3": {
    id: "3", entityType: "user", displayName: "回复作者", handle: "reply", avatar: "/avatar-3.jpg", coverImage: "", bio: "", joinedAt: "2026-01-01T00:00:00.000Z", verifiedStatus: "none", followerCount: 0, followingCount: 0, extraProfileFields: {}
  },
  "user:4": {
    id: "4", entityType: "user", displayName: "引用作者", handle: "quote", avatar: "/avatar-4.jpg", coverImage: "", bio: "", joinedAt: "2026-01-01T00:00:00.000Z", verifiedStatus: "none", followerCount: 0, followingCount: 0, extraProfileFields: {}
  }
};

function makePost({ id, authorId, text, ...overrides }: Partial<SocialPost> & Pick<SocialPost, "id" | "authorId" | "text">): SocialPost {
  return {
    id,
    authorId,
    authorType: "user",
    text,
    media: [],
    hashtags: [],
    mentions: [],
    createdAt: "2026-08-30T00:00:00.000Z",
    likeCount: 0,
    replyCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    isPinned: false,
    visibility: "public",
    status: "published",
    postType: "post",
    commentPermission: "everyone",
    ...overrides
  };
}

const rootPost = makePost({ id: "1", authorId: "2", text: "原动态正文", replyCount: 1 });
const replyPost = makePost({ id: "2", authorId: "3", text: "回复正文", postType: "reply", replyToPostId: "1", quotePostId: "3" });
const quotePost = makePost({ id: "3", authorId: "4", text: "引用正文" });

function makeSocialValue(
  posts: SocialPost[],
  isPostAvailable: (postId: string) => boolean,
  getActorForScope: () => string = () => "user:1",
  threadLifecycle: {
    ensurePostThread?: (postId: string) => Promise<boolean>;
    releasePostThread?: (postId: string) => void;
  } = {}
) {
  return {
    state: { friends: {}, follows: {} },
    profiles,
    getActorForScope,
    getPostById: (postId: string) => isPostAvailable(postId) ? posts.find((post) => post.id === postId) : undefined,
    getInteractionState: () => ({ liked: false, reposted: false, bookmarked: false, shared: false }),
    getAncestors: () => [],
    getReplies: (postId: string) => posts.filter((post) => post.replyToPostId === postId),
    getRelatedPosts: () => [],
    incrementView: vi.fn(async () => undefined),
    markShared: vi.fn(),
    toggleBookmark: vi.fn(async () => undefined),
    toggleLike: vi.fn(async () => undefined),
    createPost: vi.fn(),
    deletePost: vi.fn(),
    togglePinPost: vi.fn(),
    ensurePostThread: threadLifecycle.ensurePostThread ?? vi.fn(async () => true),
    releasePostThread: threadLifecycle.releasePostThread ?? vi.fn()
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-state={JSON.stringify(location.state)} data-url={`${location.pathname}${location.search}${location.hash}`} />;
}

function RouteControl() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/moments/posts/2")} type="button">navigate away</button>;
}

function LateFrameInvoker({ callback }: { callback?: FrameRequestCallback }) {
  useLayoutEffect(() => {
    callback?.(0);
  }, [callback]);

  return null;
}

type DetailRender = {
  container: HTMLDivElement;
  rerender: (lateFrame?: FrameRequestCallback) => Promise<void>;
  root: Root;
};

async function renderDetail(entry: { pathname: string; search?: string; hash?: string; state?: unknown }, strict = false): Promise<DetailRender> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let lateFrame: FrameRequestCallback | undefined;
  const app = () => createElement(
    MemoryRouter,
    { initialEntries: [entry] },
    strict
      ? createElement(StrictMode, undefined, createElement(RouteControl), createElement(Routes, undefined,
        createElement(Route, { path: "/moments/posts/:postId", element: createElement("div", undefined, createElement(SocialPostDetailPage), createElement(LocationProbe)) }),
        createElement(Route, { path: "*", element: createElement(LocationProbe) })
      ), createElement(LateFrameInvoker, { callback: lateFrame }))
      : createElement(ReactFragment, undefined, createElement(RouteControl), createElement(Routes, undefined,
        createElement(Route, { path: "/moments/posts/:postId", element: createElement("div", undefined, createElement(SocialPostDetailPage), createElement(LocationProbe)) }),
        createElement(Route, { path: "*", element: createElement(LocationProbe) })
      ), createElement(LateFrameInvoker, { callback: lateFrame }))
  );

  await act(async () => {
    root.render(app());
  });

  return {
    container,
    root,
    rerender: async (nextLateFrame) => {
      lateFrame = nextLateFrame;
      await act(async () => {
        root.render(app());
      });
    }
  };
}

const ReactFragment = ({ children }: { children: ReactNode }) => <>{children}</>;

let nextFrame = 0;
let frames: Map<number, FrameRequestCallback>;

async function flushFrames() {
  const callbacks = [...frames.values()];
  frames.clear();
  await act(async () => {
    callbacks.forEach((callback) => callback(0));
  });
}

afterEach(() => {
  document.body.replaceChildren();
  composerFocus.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    const frame = ++nextFrame;
    frames.set(frame, callback);
    return frame;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((frame: number) => frames.delete(frame)));
});

describe("SocialPostDetailPage runtime reply behavior", () => {
  it("hydrates a direct detail before deciding that an absent bootstrap post does not exist", async () => {
    let resolveThread: ((available: boolean) => void) | undefined;
    const ensurePostThread = vi.fn(() => new Promise<boolean>((resolve) => { resolveThread = resolve; }));
    const releasePostThread = vi.fn();
    socialMock.value = makeSocialValue([], () => false, () => "user:1", {
      ensurePostThread,
      releasePostThread
    });

    const rendered = await renderDetail({ pathname: "/moments/posts/700" });

    expect(ensurePostThread).toHaveBeenCalledWith("700");
    expect(rendered.container.textContent).not.toContain("动态不存在");

    await act(async () => { resolveThread?.(false); });
    expect(rendered.container.textContent).toContain("动态不存在");

    await act(async () => rendered.root.unmount());
    expect(releasePostThread).toHaveBeenCalledWith("700");
  });

  it("retains the focus request until a delayed post and composer are mounted", async () => {
    let postAvailable = false;
    socialMock.value = makeSocialValue([rootPost], () => postAvailable);
    const rendered = await renderDetail({ pathname: "/moments/posts/1", search: "?from=reply", hash: "#composer", state: { focusSocialReply: true } });

    expect(rendered.container.querySelector("output")?.getAttribute("data-state")).toBe(JSON.stringify({ focusSocialReply: true }));
    expect(frames.size).toBe(0);

    postAvailable = true;
    await rendered.rerender();
    expect(frames.size).toBe(1);

    await flushFrames();
    expect(composerFocus).toHaveBeenCalledTimes(1);
    expect(rendered.container.querySelector("output")?.getAttribute("data-url")).toBe("/moments/posts/1?from=reply#composer");
    expect(rendered.container.querySelector("output")?.getAttribute("data-state")).toBe("null");
    await act(async () => rendered.root.unmount());
  });

  it("keeps one effective focus request during StrictMode replay", async () => {
    socialMock.value = makeSocialValue([rootPost], () => true);
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    const rendered = await renderDetail({ pathname: "/moments/posts/1", state: { focusSocialReply: true } }, true);

    expect(frames.size).toBe(1);
    await flushFrames();
    expect(composerFocus).toHaveBeenCalledTimes(1);
    expect(focusSpy).not.toHaveBeenCalled();
    expect(rendered.container.querySelector("output")?.getAttribute("data-state")).toBe("null");
    await act(async () => rendered.root.unmount());
  });

  it("cancels a pending focus request when navigation leaves the requested post", async () => {
    socialMock.value = makeSocialValue([rootPost, replyPost], () => true);
    const rendered = await renderDetail({ pathname: "/moments/posts/1", state: { focusSocialReply: true } });

    expect(frames.size).toBe(1);
    await act(async () => rendered.container.querySelector<HTMLButtonElement>("button")?.click());
    expect(frames.size).toBe(0);
    await flushFrames();
    expect(composerFocus).not.toHaveBeenCalled();
    await act(async () => rendered.root.unmount());
  });

  it("clears a pending focus request instead of retargeting it after an actor switch", async () => {
    let actorKey = "user:1";
    socialMock.value = makeSocialValue([rootPost], () => true, () => actorKey);
    const rendered = await renderDetail({ pathname: "/moments/posts/1", state: { focusSocialReply: true } });

    expect(frames.size).toBe(1);
    actorKey = "user:5";
    await rendered.rerender();
    expect(frames.size).toBe(0);
    expect(rendered.container.querySelector("output")?.getAttribute("data-state")).toBe("null");

    await flushFrames();
    expect(composerFocus).not.toHaveBeenCalled();
    await act(async () => rendered.root.unmount());
  });

  it("does not focus a remounted composer if an old frame fires during the next commit", async () => {
    let actorKey = "user:1";
    socialMock.value = makeSocialValue([rootPost], () => true, () => actorKey);
    const rendered = await renderDetail({ pathname: "/moments/posts/1", state: { focusSocialReply: true } });
    const staleFrame = [...frames.values()][0];

    expect(staleFrame).toBeDefined();
    actorKey = "user:5";
    await rendered.rerender(staleFrame);

    expect(composerFocus).not.toHaveBeenCalled();
    await act(async () => rendered.root.unmount());
  });

  it("cancels a pending focus request when detail unmounts before the frame", async () => {
    socialMock.value = makeSocialValue([rootPost], () => true);
    const rendered = await renderDetail({ pathname: "/moments/posts/1", state: { focusSocialReply: true } });

    expect(frames.size).toBe(1);
    await act(async () => rendered.root.unmount());
    expect(frames.size).toBe(0);
    await flushFrames();
    expect(composerFocus).not.toHaveBeenCalled();
  });

  it("opens only the quoted post when a quoted reply card is activated", async () => {
    socialMock.value = makeSocialValue([rootPost, replyPost, quotePost], () => true);
    const rendered = await renderDetail({ pathname: "/moments/posts/1" });
    const quoteCard = [...rendered.container.querySelectorAll("article")].find((article) => article.textContent?.includes("引用正文") && !article.textContent?.includes("回复正文"));

    await act(async () => quoteCard?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(rendered.container.querySelector("output")?.getAttribute("data-url")).toBe("/moments/posts/3");
    await act(async () => rendered.root.unmount());
  });

  it("exposes real post-detail links for reply and quoted cards without pseudo-link article semantics", async () => {
    socialMock.value = makeSocialValue([rootPost, replyPost, quotePost], () => true);
    const rendered = await renderDetail({ pathname: "/moments/posts/1" });
    const replyCard = [...rendered.container.querySelectorAll("article")].find((article) => article.textContent?.includes("回复正文"));
    const quoteCard = [...rendered.container.querySelectorAll("article")].find((article) => article.textContent?.includes("引用正文") && !article.textContent?.includes("回复正文"));
    const findDetailLink = (card: Element | undefined) => [...(card?.querySelectorAll<HTMLAnchorElement>("a") ?? [])].find((link) => link.textContent === "查看动态详情" && link.closest("article") === card);

    expect(findDetailLink(replyCard)?.getAttribute("href")).toBe("/moments/posts/2");
    expect(findDetailLink(quoteCard)?.getAttribute("href")).toBe("/moments/posts/3");
    expect(replyCard?.getAttribute("tabindex")).toBeNull();
    expect(replyCard?.getAttribute("aria-label")).toBeNull();
    expect(quoteCard?.getAttribute("tabindex")).toBeNull();
    expect(quoteCard?.getAttribute("aria-label")).toBeNull();

    await act(async () => rendered.root.unmount());
  });

  it("opens the reply from its whole-card pointer convenience click", async () => {
    socialMock.value = makeSocialValue([rootPost, replyPost, quotePost], () => true);
    const rendered = await renderDetail({ pathname: "/moments/posts/1" });
    const replyCard = [...rendered.container.querySelectorAll("article")].find((article) => article.textContent?.includes("回复正文"));

    await act(async () => replyCard?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(rendered.container.querySelector("output")?.getAttribute("data-url")).toBe("/moments/posts/2");
    await act(async () => rendered.root.unmount());
  });

  it("uses the real reply detail link for native link activation", async () => {
    socialMock.value = makeSocialValue([rootPost, replyPost, quotePost], () => true);
    const rendered = await renderDetail({ pathname: "/moments/posts/1" });
    const replyCard = [...rendered.container.querySelectorAll("article")].find((article) => article.textContent?.includes("回复正文"));
    const detailLink = [...(replyCard?.querySelectorAll<HTMLAnchorElement>("a") ?? [])].find((link) => link.textContent === "查看动态详情" && link.closest("article") === replyCard);

    await act(async () => detailLink?.click());
    expect(rendered.container.querySelector("output")?.getAttribute("data-url")).toBe("/moments/posts/2");
    await act(async () => rendered.root.unmount());
  });

  it("keeps descendant author links and buttons from activating the reply card", async () => {
    socialMock.value = makeSocialValue([rootPost, replyPost, quotePost], () => true);
    const rendered = await renderDetail({ pathname: "/moments/posts/1" });
    const replyCard = [...rendered.container.querySelectorAll("article")].find((article) => article.textContent?.includes("回复正文"))!;
    const authorLink = [...replyCard.querySelectorAll<HTMLAnchorElement>("a")].find((link) => link.textContent === "回复作者")!;

    await act(async () => authorLink.click());
    expect(rendered.container.querySelector("output")?.getAttribute("data-url")).toBe(authorLink.getAttribute("href"));

    await act(async () => rendered.root.unmount());
    socialMock.value = makeSocialValue([rootPost, replyPost, quotePost], () => true);
    const retry = await renderDetail({ pathname: "/moments/posts/1" });
    const retryCard = [...retry.container.querySelectorAll("article")].find((article) => article.textContent?.includes("回复正文"))!;
    const childButton = document.createElement("button");
    const childAction = vi.fn();
    childButton.addEventListener("click", childAction);
    retryCard.append(childButton);

    await act(async () => childButton.click());
    expect(childAction).toHaveBeenCalledTimes(1);
    expect(retry.container.querySelector("output")?.getAttribute("data-url")).toBe("/moments/posts/1");
    await act(async () => retry.root.unmount());
  });
});
