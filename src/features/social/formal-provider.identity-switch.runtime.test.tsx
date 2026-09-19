/** @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../../auth/AuthProvider";
import type { PaginatedRealtimeData, RealtimeSocialPost } from "../realtime/api";

const authMock = vi.hoisted(() => ({
  value: { isRestoring: false, session: null as AuthSession | null }
}));
const realtimeMock = vi.hoisted(() => ({
  getSocialPost: vi.fn(),
  listNotifications: vi.fn(),
  listSocialPosts: vi.fn()
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => authMock.value
}));

vi.mock("../realtime/api", () => ({
  realtimeApi: realtimeMock,
  subscribeRealtimeEvents: vi.fn(() => vi.fn())
}));

import { SocialProvider, useSocial } from "./context";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function makeSession(identityId: number): AuthSession {
  return {
    id: 7,
    username: `identity-${identityId}`,
    avatarUrl: null,
    loggedInAt: "2026-08-31T00:00:00.000Z",
    currentIdentity: {
      id: identityId,
      type: "customer"
    }
  } as AuthSession;
}

function makeWirePost(content: string): RealtimeSocialPost {
  return {
    id: content === "identity-a" ? 700 : 800,
    authorUserId: 7,
    author: {
      avatarUrl: null,
      displayName: content,
      entityType: "user",
      identityId: content === "identity-a" ? 70 : 80,
      joinedAt: "2026-08-31T00:00:00.000Z",
      userId: 7,
      username: content
    },
    content,
    createdAt: "2026-08-31T00:00:00.000Z",
    media: { items: [] },
    replyCount: 0,
    replyToPostId: null,
    visibility: "public"
  };
}

function makePage(post: RealtimeSocialPost): PaginatedRealtimeData<RealtimeSocialPost> {
  return { list: [post], page: 1, page_size: 100, total: 1 };
}

function PostProbe() {
  const { state } = useSocial();
  return <output>{state.posts.map((post) => post.text).join(",")}</output>;
}

function ThreadProbe() {
  const { ensurePostThread } = useSocial();
  useEffect(() => {
    void ensurePostThread("700");
  }, [ensurePostThread]);
  return null;
}

describe("formal Social exact identity isolation", () => {
  beforeEach(() => {
    authMock.value = { isRestoring: false, session: makeSession(70) };
    realtimeMock.getSocialPost.mockReset();
    realtimeMock.listSocialPosts.mockReset();
    realtimeMock.listNotifications.mockReset().mockResolvedValue({
      list: [], page: 1, page_size: 100, total: 0
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("keeps identity B visible after delayed identity A bootstrap responses resolve", async () => {
    const identityAPage = deferred<PaginatedRealtimeData<RealtimeSocialPost>>();
    const identityBPage = makePage(makeWirePost("identity-b"));
    realtimeMock.listSocialPosts.mockImplementation(() =>
      authMock.value.session?.currentIdentity.id === 70
        ? identityAPage.promise
        : Promise.resolve(identityBPage)
    );

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const render = async () => {
      await act(async () => {
        root.render(<SocialProvider><PostProbe /></SocialProvider>);
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    await render();
    expect(container.querySelector("output")?.textContent).toBe("");

    authMock.value = { isRestoring: false, session: makeSession(71) };
    await render();
    expect(container.querySelector("output")?.textContent).toBe("identity-b");

    identityAPage.resolve(makePage(makeWirePost("identity-a")));
    await act(async () => {
      await identityAPage.promise;
      await Promise.resolve();
    });

    expect(container.querySelector("output")?.textContent).toBe("identity-b");
    await act(async () => root.unmount());
  });

  it("aborts an identity A thread request when the exact active identity changes", async () => {
    const observedSignals: AbortSignal[] = [];
    const pendingUntilAbort = (signal: AbortSignal | undefined) => new Promise<never>((_resolve, reject) => {
      if (!signal) return;
      observedSignals.push(signal);
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
    const parent = makeWirePost("identity-b");
    const emptyReplies = { list: [], page: 1, page_size: 100, total: 0 };
    realtimeMock.getSocialPost.mockImplementation((_id, options?: { signal?: AbortSignal }) =>
      authMock.value.session?.currentIdentity.id === 70
        ? pendingUntilAbort(options?.signal)
        : Promise.resolve(parent)
    );
    realtimeMock.listSocialPosts.mockImplementation((
      query: { replyToPostId?: number },
      options?: { signal?: AbortSignal }
    ) => {
      if (query.replyToPostId && authMock.value.session?.currentIdentity.id === 70) {
        return pendingUntilAbort(options?.signal);
      }
      return Promise.resolve(query.replyToPostId ? emptyReplies : makePage(parent));
    });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const render = async () => {
      await act(async () => {
        root.render(<SocialProvider><ThreadProbe /></SocialProvider>);
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    await render();
    expect(observedSignals).toHaveLength(2);
    expect(observedSignals.every((signal) => !signal.aborted)).toBe(true);

    authMock.value = { isRestoring: false, session: makeSession(71) };
    await render();

    expect(observedSignals.every((signal) => signal.aborted)).toBe(true);
    await act(async () => root.unmount());
  });
});
