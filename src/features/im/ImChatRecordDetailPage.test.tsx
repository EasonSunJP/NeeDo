// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import { ImChatRecordCard } from "./ImChatRecordCard";
import {
  ImChatRecordDetailPage,
  type ImChatRecordReadApi,
} from "./ImChatRecordDetailPage";
import source from "./ImChatRecordDetailPage.tsx?raw";
import appSource from "../../App.tsx?raw";
import type { ImChatRecordMedia } from "./chat-records";

const publicId = "11111111-1111-4111-8111-111111111111";
const summary = {
  publicId,
  title: "服务器快照标题",
  titleKind: "single" as const,
  preview: "A: immutable",
  senderNames: ["A"],
  senderCount: 1,
  itemCount: 2,
  createdAt: "2026-08-31T10:00:00.000Z",
};
const firstPage = {
  list: [
    {
      id: "2",
      position: 2,
      senderDisplayName: "A",
      senderAvatarUrl: "/snapshot-a.png",
      messageType: "text",
      content: "immutable",
      metadata: null,
      sentAt: "2026-08-31T10:01:00.000Z",
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  nextCursor: 2,
};

function api(overrides: Partial<ImChatRecordReadApi> = {}): ImChatRecordReadApi {
  return {
    getChatRecord: vi.fn(async () => summary),
    listChatRecordItems: vi.fn(async (_id, query) =>
      query?.beforePosition
        ? {
            list: [
              {
                id: "1",
                position: 1,
                senderDisplayName: "B",
                senderAvatarUrl: "/snapshot-b.png",
                messageType: "text",
                content: "older",
                metadata: null,
                sentAt: "2026-08-31T10:00:00.000Z",
              },
            ],
            total: 2,
            page: 2,
            page_size: 20,
            nextCursor: null,
          }
        : firstPage,
    ),
    getChatRecordMedia: vi.fn(),
    ...overrides,
  };
}

function themed(node: React.ReactNode) {
  return <ClientThemeProvider>{node}</ClientThemeProvider>;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ImChatRecordDetailPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("uses the shared header contract and a mutation-free read-only timeline", () => {
    expect(source).toContain("<MobileFullscreenPage");
    expect(source).toContain("<MobileFullscreenHeader");
    expect(source).toContain("info=");
    expect(source).toContain("onClose=");
    expect(source).not.toContain("subtitle=");
    expect(source).not.toContain("MobileFullscreenCloseButton");
    expect(source).not.toContain("ImChatComposer");
    expect(source).not.toContain("ImMessageActionSheet");
    expect(source).not.toContain("linear-gradient");
  });

  it("paginates immutable items and uses snapshot sender, avatar, and time", async () => {
    const recordApi = api();
    await act(async () => {
      root.render(
        themed(<MemoryRouter initialEntries={[`/messages/chat-records/${publicId}`]}>
          <Routes>
            <Route
              path="/messages/chat-records/:publicId"
              element={<ImChatRecordDetailPage api={recordApi} language="zh" scope="user" />}
            />
          </Routes>
        </MemoryRouter>),
      );
    });
    await flush();

    expect(document.body.textContent).toContain("A的聊天记录");
    expect(document.body.textContent).toContain("immutable");
    expect(document.body.textContent).toContain("A");
    expect(document.body.querySelector('img[src="/snapshot-a.png"]')).not.toBeNull();
    expect(document.body.querySelector("time")?.dateTime).toBe("2026-08-31T10:01:00.000Z");

    const loadOlder = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("加载更早"),
    );
    await act(async () => loadOlder?.click());
    await flush();
    expect(document.body.textContent).toContain("older");
    expect(recordApi.listChatRecordItems).toHaveBeenLastCalledWith(publicId, {
      beforePosition: 2,
      pageSize: 20,
    });
  });

  it("fetches protected media as a Blob, revokes object URLs, retries, and ignores stale completion", async () => {
    const createObjectURL = vi.fn(() => "blob:protected-snapshot");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    let attempt = 0;
    const getChatRecordMedia = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("network");
      return {
        blob: new Blob(["image"], { type: "image/png" }),
        contentType: "image/png",
        contentLength: 5,
        etag: `"${"a".repeat(64)}"`,
        cacheControl: "private, max-age=31536000, immutable",
      };
    });
    const recordApi = api({
      getChatRecordMedia,
      listChatRecordItems: vi.fn(async () => ({
        ...firstPage,
        total: 1,
        nextCursor: null,
        list: [
          {
            ...firstPage.list[0],
            messageType: "text",
            content: null,
            metadata: {
              media: {
                checksumSha256: "a".repeat(64),
                mimeType: "image/png",
                size: 5,
              },
            },
          },
        ],
      })),
    });

    await act(async () => {
      root.render(
        themed(<MemoryRouter initialEntries={[`/messages/chat-records/${publicId}`]}>
          <Routes>
            <Route path="/messages/chat-records/:publicId" element={<ImChatRecordDetailPage api={recordApi} language="zh" />} />
          </Routes>
        </MemoryRouter>),
      );
    });
    await flush();
    expect(document.body.textContent).toContain("媒体读取失败");

    const retry = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("重试"),
    );
    await act(async () => retry?.click());
    await flush();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('img[src="blob:protected-snapshot"]')).not.toBeNull();
    expect(document.body.innerHTML).not.toContain("Bearer");
    expect(document.body.innerHTML).not.toContain("/api/v1/im/chat-records/");

    await act(async () => root.unmount());
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:protected-snapshot");
    root = createRoot(container);
    vi.unstubAllGlobals();
  });

  it("closes to the previous page and restores focus to card or favorite openers", async () => {
    const recordApi = api();
    function List() {
      return <ImChatRecordCard language="zh" openerId="favorite-row-7" record={summary} />;
    }
    await act(async () => {
      root.render(
        themed(<MemoryRouter initialEntries={["/me/favorites"]}>
          <Routes>
            <Route path="/me/favorites" element={<List />} />
            <Route path="/messages/chat-records/:publicId" element={<ImChatRecordDetailPage api={recordApi} language="zh" />} />
          </Routes>
        </MemoryRouter>),
      );
    });
    const opener = document.body.querySelector<HTMLAnchorElement>("[data-im-chat-record-opener]")!;
    opener.focus();
    await act(async () => opener.click());
    await flush();
    const close = document.body.querySelector<HTMLButtonElement>('button[aria-label="关闭聊天记录"]')!;
    await act(async () => close.click());
    await flush();
    await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(document.activeElement?.getAttribute("data-im-chat-record-opener")).toBe("favorite-row-7");
  });

  it("does not materialize a protected object URL after route unmount", async () => {
    let resolveMedia!: (value: ImChatRecordMedia) => void;
    const createObjectURL = vi.fn(() => "blob:stale");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const recordApi = api({
      getChatRecordMedia: vi.fn(() => new Promise<ImChatRecordMedia>((resolve) => { resolveMedia = resolve; })),
      listChatRecordItems: vi.fn(async () => ({
        ...firstPage,
        total: 1,
        nextCursor: null,
        list: [{ ...firstPage.list[0], content: null, metadata: { media: { checksumSha256: "b".repeat(64), mimeType: "image/png", size: 5 } } }],
      })),
    });
    await act(async () => root.render(themed(<MemoryRouter initialEntries={[`/messages/chat-records/${publicId}`]}><Routes><Route path="/messages/chat-records/:publicId" element={<ImChatRecordDetailPage api={recordApi} language="zh" />} /></Routes></MemoryRouter>)));
    await flush();
    await act(async () => root.unmount());
    resolveMedia({ blob: new Blob(["image"], { type: "image/png" }), contentType: "image/png", contentLength: 5, etag: `"${"b".repeat(64)}"`, cacheControl: "private, max-age=31536000, immutable" });
    await flush();
    expect(createObjectURL).not.toHaveBeenCalled();
    root = createRoot(container);
    vi.unstubAllGlobals();
  });

  it("rejects malformed public ids without calling the API", async () => {
    const recordApi = api();
    await act(async () => {
      root.render(
        themed(<MemoryRouter initialEntries={["/messages/chat-records/not-a-uuid"]}>
          <Routes>
            <Route path="/messages/chat-records/:publicId" element={<ImChatRecordDetailPage api={recordApi} language="zh" />} />
          </Routes>
        </MemoryRouter>),
      );
    });
    await flush();
    expect(document.body.textContent).toContain("聊天记录不可用");
    expect(recordApi.getChatRecord).not.toHaveBeenCalled();
  });

  it("registers unshadowed record detail routes before dynamic conversations in all scopes", () => {
    for (const prefix of ["", "/merchant", "/technician"]) {
      const recordRoute = `path=\"${prefix}/messages/chat-records/:publicId\"`;
      const conversationRoute = `path=\"${prefix}/messages/:conversationId\"`;
      expect(appSource).toContain(recordRoute);
      expect(appSource.indexOf(recordRoute)).toBeLessThan(appSource.indexOf(conversationRoute));
    }
  });
});
