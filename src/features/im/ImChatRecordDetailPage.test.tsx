// @vitest-environment jsdom

import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import { I18nProvider, I18nRuntime } from "../../i18n/I18nProvider";
import { ImChatRecordCard } from "./ImChatRecordCard";
import {
  ImChatRecordDetailPage,
  type ImChatRecordReadApi,
} from "./ImChatRecordDetailPage";
import source from "./ImChatRecordDetailPage.tsx?raw";
import appSource from "../../App.tsx?raw";
import type { ImChatRecordMedia } from "./chat-records";
import { restoreImChatRecordFocus } from "./chat-record-focus";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function RouteSwitch({ api: recordApi }: { api: ImChatRecordReadApi }) {
  const navigate = useNavigate();
  return (
    <>
      <button data-testid="route-a" onClick={() => navigate(`/messages/chat-records/${publicId}`)} type="button">A</button>
      <button data-testid="route-b" onClick={() => navigate("/messages/chat-records/22222222-2222-4222-8222-222222222222")} type="button">B</button>
      <button data-testid="route-c" onClick={() => navigate("/messages/chat-records/33333333-3333-4333-8333-333333333333")} type="button">C</button>
      <Routes><Route path="/messages/chat-records/:publicId" element={<ImChatRecordDetailPage api={recordApi} language="zh" />} /></Routes>
    </>
  );
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
    document.documentElement.lang = "";
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it("restores focus to the exact second card when duplicate records share a publicId", async () => {
    const recordApi = api();
    function DuplicateList() {
      return <><ImChatRecordCard language="zh" record={{ ...summary, id: "favorite-a", bundlePublicId: summary.publicId }} /><ImChatRecordCard language="zh" record={{ ...summary, id: "favorite-b", bundlePublicId: summary.publicId }} /></>;
    }
    await act(async () => root.render(themed(<MemoryRouter initialEntries={["/me/favorites"]}><Routes><Route path="/me/favorites" element={<DuplicateList />} /><Route path="/messages/chat-records/:publicId" element={<ImChatRecordDetailPage api={recordApi} language="zh" />} /></Routes></MemoryRouter>)));
    const openers = document.querySelectorAll<HTMLAnchorElement>("[data-im-chat-record-opener]");
    expect(openers[0]?.id).not.toBe(openers[1]?.id);
    await act(async () => openers[1]?.click());
    await flush();
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="关闭聊天记录"]')?.click());
    await flush();
    await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(document.activeElement).toBe(document.querySelectorAll("[data-im-chat-record-opener]")[1]);
  });

  it("waits for an asynchronously remounted opener before focusing it", async () => {
    const recordApi = api();
    let visits = 0;
    function DelayedList() {
      const [visible, setVisible] = useState(() => visits++ === 0);
      useEffect(() => {
        if (!visible) window.setTimeout(() => setVisible(true), 0);
      }, [visible]);
      return visible ? <ImChatRecordCard language="zh" openerId="async-record-card" record={summary} /> : null;
    }
    await act(async () => root.render(themed(<MemoryRouter initialEntries={["/me/favorites"]}><Routes><Route path="/me/favorites" element={<DelayedList />} /><Route path="/messages/chat-records/:publicId" element={<ImChatRecordDetailPage api={recordApi} language="zh" />} /></Routes></MemoryRouter>)));
    await act(async () => document.querySelector<HTMLAnchorElement>("[data-im-chat-record-opener]")?.click());
    await flush();
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="关闭聊天记录"]')?.click());
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)));
    expect(document.activeElement).toBe(document.querySelector("[data-im-chat-record-opener]"));
  });

  it("disconnects the bounded focus observer when an opener never remounts", async () => {
    vi.useFakeTimers();
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 1));
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
    restoreImChatRecordFocus("missing-opener", { maxFrames: 2 });
    await vi.advanceTimersByTimeAsync(10);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  it("rejects protected media whose binary headers do not match the immutable descriptor", async () => {
    const createObjectURL = vi.fn(() => "blob:mismatch");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const recordApi = api({
      getChatRecordMedia: vi.fn(async () => ({ blob: new Blob(["image"], { type: "image/png" }), contentType: "image/jpeg", contentLength: 6, etag: `"${"c".repeat(64)}"`, cacheControl: "private" })),
      listChatRecordItems: vi.fn(async () => ({ ...firstPage, total: 1, nextCursor: null, list: [{ ...firstPage.list[0], content: null, metadata: { media: { checksumSha256: "b".repeat(64), mimeType: "image/png", size: 5 } } }] })),
    });
    await act(async () => root.render(themed(<MemoryRouter initialEntries={[`/messages/chat-records/${publicId}`]}><Routes><Route path="/messages/chat-records/:publicId" element={<ImChatRecordDetailPage api={recordApi} language="zh" />} /></Routes></MemoryRouter>)));
    await flush();
    expect(document.body.textContent).toContain("媒体读取失败");
    expect(createObjectURL).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("revokes every item-owned URL exactly once when equal checksums appear more than once", async () => {
    let index = 0;
    const createObjectURL = vi.fn(() => `blob:shared-${++index}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const descriptor = { media: { checksumSha256: "d".repeat(64), mimeType: "image/png", size: 5 } };
    const recordApi = api({
      getChatRecordMedia: vi.fn(async () => ({ blob: new Blob(["image"], { type: "image/png" }), contentType: "image/png", contentLength: 5, etag: `"${"d".repeat(64)}"`, cacheControl: "private" })),
      listChatRecordItems: vi.fn(async () => ({ ...firstPage, total: 2, nextCursor: null, list: [{ ...firstPage.list[0], id: "media-1", position: 1, content: null, metadata: descriptor }, { ...firstPage.list[0], id: "media-2", position: 2, content: null, metadata: descriptor }] })),
    });
    await act(async () => root.render(themed(<MemoryRouter initialEntries={[`/messages/chat-records/${publicId}`]}><Routes><Route path="/messages/chat-records/:publicId" element={<ImChatRecordDetailPage api={recordApi} language="zh" />} /></Routes></MemoryRouter>)));
    await flush();
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
    expect(revokeObjectURL.mock.calls.map(([url]) => url).sort()).toEqual(["blob:shared-1", "blob:shared-2"]);
    root = createRoot(container);
    vi.unstubAllGlobals();
  });

  it("renders protected video and file snapshots with their immutable typed display metadata", async () => {
    const createObjectURL = vi.fn((blob: Blob) => blob.type === "video/mp4" ? "blob:video" : "blob:file");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const videoChecksum = "1".repeat(64);
    const fileChecksum = "2".repeat(64);
    const recordApi = api({
      getChatRecordMedia: vi.fn(async (_id, checksum) => checksum === videoChecksum
        ? { blob: new Blob(["video"], { type: "video/mp4" }), contentType: "video/mp4", contentLength: 5, etag: `"${videoChecksum}"`, cacheControl: "private" }
        : { blob: new Blob(["file"], { type: "application/pdf" }), contentType: "application/pdf", contentLength: 4, etag: `"${fileChecksum}"`, cacheControl: "private" }),
      listChatRecordItems: vi.fn(async () => ({
        ...firstPage,
        total: 2,
        nextCursor: null,
        list: [
          {
            ...firstPage.list[0],
            id: "video-item",
            position: 1,
            messageType: "video",
            content: null,
            metadata: { snapshotVersion: 1, type: "video", display: { caption: "原始视频说明", duration: 12 }, media: { checksumSha256: videoChecksum, mimeType: "video/mp4", size: 5 } },
          },
          {
            ...firstPage.list[0],
            id: "file-item",
            position: 2,
            messageType: "file",
            content: null,
            metadata: { snapshotVersion: 1, type: "file", display: { fileName: "契約書.pdf" }, media: { checksumSha256: fileChecksum, mimeType: "application/pdf", size: 4 } },
          },
        ],
      })),
    });

    await act(async () => root.render(themed(<MemoryRouter initialEntries={[`/messages/chat-records/${publicId}`]}><Routes><Route path="/messages/chat-records/:publicId" element={<ImChatRecordDetailPage api={recordApi} language="ja" />} /></Routes></MemoryRouter>)));
    await flush();

    expect(document.querySelector('video[src="blob:video"]')).not.toBeNull();
    expect(document.body.textContent).toContain("原始视频说明");
    expect(document.body.textContent).toContain("契約書.pdf");
    expect(document.body.textContent).not.toContain("[文件]");
    vi.unstubAllGlobals();
  });

  it("reconstructs structured immutable snapshots without translating sender or authored fields", async () => {
    const recordApi = api({
      listChatRecordItems: vi.fn(async () => ({
        ...firstPage,
        total: 4,
        nextCursor: null,
        list: [
          { ...firstPage.list[0], id: "location", position: 1, messageType: "location", content: "不要显示这个回退", metadata: { snapshotVersion: 1, type: "location", display: { location: { title: "東京駅", address: "東京都千代田区", latitude: 35.681, longitude: 139.767 } } } },
          { ...firstPage.list[0], id: "contact", position: 2, messageType: "contact-card", content: "不要显示这个回退", metadata: { snapshotVersion: 1, type: "contact-card", display: { contactCard: { userId: "u1", displayName: "山田太郎", avatar: "/avatar.png", profileKind: "person", headline: "本人说明" } } } },
          { ...firstPage.list[0], id: "service", position: 3, messageType: "service-card", content: "不要显示这个回退", metadata: { snapshotVersion: 1, type: "service-card", display: { serviceCard: { serviceId: "s1", name: "整体コース", cover: "/cover.png", summary: "作者写的介绍", priceLabel: "¥5,000" } } } },
          { ...firstPage.list[0], id: "schedule", position: 4, messageType: "schedule-invite", content: "不要显示这个回退", metadata: { snapshotVersion: 1, type: "schedule-invite", display: { scheduleInvite: { scheduleId: "sc1", title: "面談", date: "2026-09-01", timeRange: "10:00–11:00", note: "原始备注" } } } },
        ],
      })),
    });

    await act(async () => root.render(themed(<MemoryRouter initialEntries={[`/messages/chat-records/${publicId}`]}><Routes><Route path="/messages/chat-records/:publicId" element={<ImChatRecordDetailPage api={recordApi} language="en" />} /></Routes></MemoryRouter>)));
    await flush();

    for (const authoredText of ["東京駅", "東京都千代田区", "山田太郎", "本人说明", "整体コース", "作者写的介绍", "面談", "原始备注"]) {
      expect(document.body.textContent).toContain(authoredText);
    }
    expect(document.body.textContent).not.toContain("不要显示这个回退");
  });

  it.each([
    ["zh", "東京駅的聊天记录", "聊天记录说明"],
    ["zh-Hant", "東京駅的聊天記錄", "聊天記錄說明"],
    ["ja", "東京駅のチャット履歴", "チャット履歴の説明"],
    ["en", "東京駅's chat history", "About this chat record"],
    ["ko", "東京駅의 채팅 기록", "채팅 기록 안내"],
  ] as const)("keeps sender and authored detail fields immutable under the %s I18nRuntime while preserving localized chrome", async (language, expectedTitle, expectedInfoLabel) => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 1));
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
    localStorage.setItem("needo.language", language);
    localStorage.setItem("needo.language.mode", "manual");
    const recordApi = api({
      getChatRecord: vi.fn(async () => ({ ...summary, senderNames: ["東京駅"], senderCount: 1, titleKind: "single" as const })),
      listChatRecordItems: vi.fn(async () => ({
        ...firstPage,
        total: 1,
        nextCursor: null,
        list: [{
          ...firstPage.list[0],
          id: "runtime-location",
          position: 1,
          senderDisplayName: "東京駅",
          messageType: "location",
          content: "",
          metadata: { snapshotVersion: 1, type: "location", display: { location: { title: "東京駅", address: "东京站", latitude: 35.681, longitude: 139.767 } } },
        }],
      })),
    });

    await act(async () => root.render(
      <MemoryRouter initialEntries={[`/messages/chat-records/${publicId}`]}>
        <I18nProvider>
          <I18nRuntime>
            {themed(<Routes><Route path="/messages/chat-records/:publicId" element={<ImChatRecordDetailPage api={recordApi} language={language} />} /></Routes>)}
          </I18nRuntime>
        </I18nProvider>
      </MemoryRouter>,
    ));
    await flush();
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 5)); });

    const snapshot = document.querySelector<HTMLElement>(".im-chat-record-timeline > li");
    expect.soft(snapshot?.getAttribute("data-no-i18n")).toBeNull();
    expect(snapshot?.querySelectorAll("[data-no-i18n]").length).toBeGreaterThanOrEqual(3);
    expect(snapshot?.textContent).toContain("東京駅");
    expect(snapshot?.textContent).toContain("东京站");
    expect(snapshot?.textContent).not.toContain("Tokyo Station");
    expect(document.querySelector("h1")?.textContent).toBe(expectedTitle);
    expect(document.querySelector(`button[aria-label="${expectedInfoLabel}"]`)).not.toBeNull();
  });

  it.each([
    ["zh-Hant", ["店鋪服務", "服務", "待確認", "邀請對象：", "提醒："]],
    ["ja", ["店舗サービス", "サービス", "確認待ち", "邀请対象：", "リマインド："]],
    ["en", ["Store service", "Service", "Pending Confirmation", "Invitee:", "Remind:"]],
    ["ko", ["매장 서비스", "서비스", "확인 대기", "초대 대상:", "Ti Xing:"]],
  ] as const)("localizes static service and schedule labels in %s without changing authored snapshot fields", async (language, expectedStaticLabels) => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 1));
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
    localStorage.setItem("needo.language", language);
    localStorage.setItem("needo.language.mode", "manual");
    const recordApi = api({
      listChatRecordItems: vi.fn(async () => ({
        ...firstPage,
        total: 2,
        nextCursor: null,
        list: [
          {
            ...firstPage.list[0],
            id: "runtime-service",
            position: 1,
            senderDisplayName: "東京駅",
            messageType: "service-card",
            content: "",
            metadata: { snapshotVersion: 1, type: "service-card", display: { serviceCard: { serviceId: "s1", name: "東京駅", cover: "/cover.png", summary: "东京站", priceLabel: "東京駅", tags: ["东京站"] } } },
          },
          {
            ...firstPage.list[0],
            id: "runtime-schedule",
            position: 2,
            senderDisplayName: "東京駅",
            messageType: "schedule-invite",
            content: "",
            metadata: { snapshotVersion: 1, type: "schedule-invite", display: { scheduleInvite: { scheduleId: "sc1", title: "東京駅", date: "2026-09-01", timeRange: "10:00", hostName: "东京站", attendeeLabel: "東京駅", location: "东京站", reminderLabel: "東京駅", note: "东京站" } } },
          },
        ],
      })),
    });

    await act(async () => root.render(
      <MemoryRouter initialEntries={[`/messages/chat-records/${publicId}`]}>
        <I18nProvider>
          <I18nRuntime>
            {themed(<Routes><Route path="/messages/chat-records/:publicId" element={<ImChatRecordDetailPage api={recordApi} language={language} />} /></Routes>)}
          </I18nRuntime>
        </I18nProvider>
      </MemoryRouter>,
    ));
    await flush();
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 5)); });

    const snapshots = Array.from(document.querySelectorAll<HTMLElement>(".im-chat-record-timeline > li"));
    expect(snapshots).toHaveLength(2);
    expect.soft(snapshots.every((snapshot) => !snapshot.hasAttribute("data-no-i18n"))).toBe(true);
    expectedStaticLabels.forEach((label) => expect(document.body.textContent).toContain(label));
    snapshots.forEach((snapshot) => {
      expect(snapshot.textContent).toContain("東京駅");
      expect(snapshot.textContent).toContain("东京站");
      expect(snapshot.textContent).not.toContain("Tokyo Station");
    });
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

  it("renders complete English detail, info, media failure, and retry copy", async () => {
    const recordApi = api({
      getChatRecordMedia: vi.fn().mockRejectedValue(new Error("network")),
      listChatRecordItems: vi.fn(async () => ({ ...firstPage, total: 1, nextCursor: null, list: [{ ...firstPage.list[0], content: null, metadata: { media: { checksumSha256: "e".repeat(64), mimeType: "image/png", size: 5 } } }] })),
    });
    await act(async () => root.render(themed(<MemoryRouter initialEntries={[`/messages/chat-records/${publicId}`]}><Routes><Route path="/messages/chat-records/:publicId" element={<ImChatRecordDetailPage api={recordApi} language="en" />} /></Routes></MemoryRouter>)));
    await flush();
    expect(document.body.textContent).toContain("A's chat history");
    const infoButton = document.querySelector('button[aria-label="About this chat record"]') as HTMLButtonElement;
    expect(infoButton).not.toBeNull();
    await act(async () => infoButton.click());
    expect(document.body.textContent).toContain("This page shows a read-only message snapshot");
    expect(document.body.textContent).toContain("Couldn't load media");
    expect(document.body.textContent).toContain("Retry");
    expect(document.querySelector('button[aria-label="Close chat record"]')).not.toBeNull();
  });

  it("registers unshadowed record detail routes before dynamic conversations in all scopes", () => {
    for (const prefix of ["", "/merchant", "/technician"]) {
      const recordRoute = `path=\"${prefix}/messages/chat-records/:publicId\"`;
      const conversationRoute = `path=\"${prefix}/messages/:conversationId\"`;
      expect(appSource).toContain(recordRoute);
      expect(appSource.indexOf(recordRoute)).toBeLessThan(appSource.indexOf(conversationRoute));
    }
  });

  it("clears the old record immediately and ignores a slow initial response after publicId changes", async () => {
    const aSummary = deferred<typeof summary>();
    const aItems = deferred<typeof firstPage>();
    const recordApi = api({
      getChatRecord: vi.fn((id) => id === publicId ? aSummary.promise : Promise.resolve({ ...summary, publicId: id, senderNames: ["B"], preview: "B: current" })),
      listChatRecordItems: vi.fn((id) => id === publicId ? aItems.promise : Promise.resolve({ ...firstPage, list: [{ ...firstPage.list[0], id: "b-item", senderDisplayName: "B", content: "current" }] })),
    });
    await act(async () => root.render(themed(<MemoryRouter initialEntries={[`/messages/chat-records/${publicId}`]}><RouteSwitch api={recordApi} /></MemoryRouter>)));
    await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="route-b"]')?.click());
    await flush();
    expect(document.body.textContent).toContain("B的聊天记录");
    expect(document.body.textContent).toContain("current");
    aSummary.resolve(summary);
    aItems.resolve(firstPage);
    await flush();
    expect(document.body.textContent).toContain("B的聊天记录");
    expect(document.body.textContent).not.toContain("immutable");
  });

  it("does not show old title/items while a replacement fails and ignores an old late page", async () => {
    const oldPage = deferred<Awaited<ReturnType<ImChatRecordReadApi["listChatRecordItems"]>>>();
    const recordApi = api({
      getChatRecord: vi.fn((id) => id.endsWith("333333333333") ? Promise.reject(new Error("gone")) : Promise.resolve(id === publicId ? summary : { ...summary, publicId: id, senderNames: ["B"], preview: "B" })),
      listChatRecordItems: vi.fn((id, query) => {
        if (id.endsWith("333333333333")) return Promise.reject(new Error("gone"));
        if (id === publicId && query?.beforePosition) return oldPage.promise;
        return Promise.resolve({ ...firstPage, nextCursor: id === publicId ? 2 : null, list: [{ ...firstPage.list[0], id: id === publicId ? "a" : "b", senderDisplayName: id === publicId ? "A" : "B", content: id === publicId ? "old-initial" : "current" }] });
      }),
    });
    await act(async () => root.render(themed(<MemoryRouter initialEntries={[`/messages/chat-records/${publicId}`]}><RouteSwitch api={recordApi} /></MemoryRouter>)));
    await flush();
    const loadOlder = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("加载更早"));
    await act(async () => loadOlder?.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="route-b"]')?.click());
    await flush();
    oldPage.resolve({ ...firstPage, nextCursor: null, list: [{ ...firstPage.list[0], id: "late", position: 1, content: "late-old-page" }] });
    await flush();
    expect(document.body.textContent).toContain("current");
    expect(document.body.textContent).not.toContain("late-old-page");
    await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="route-c"]')?.click());
    expect(document.body.textContent).not.toContain("B的聊天记录");
    expect(document.body.textContent).not.toContain("current");
    await flush();
    expect(document.body.textContent).toContain("聊天记录不可用");
    expect(document.body.textContent).not.toContain("current");
  });
});
