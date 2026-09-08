/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import { I18nProvider } from "../../i18n/I18nProvider";
import { type Language } from "../../i18n/translations";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import { ImScopeProvider } from "./scope";
import source from "./pages.tsx?raw";
import componentsSource from "./components.tsx?raw";
import supportSource from "./MembershipSupportEntry.tsx?raw";

const roomHarness = vi.hoisted(() => ({
  entityStore: { customers: [], stores: [], technicians: [] } as Record<string, unknown>,
  social: {
    getActorForScope: () => "user:current-user",
    getFollowing: () => [],
    profiles: {},
    toggleFollow: vi.fn(),
  } as Record<string, unknown>,
  store: null as Record<string, unknown> | null,
}));

vi.mock("./store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./store")>();

  return {
    ...actual,
    useImStore: () => roomHarness.store,
  };
});

vi.mock("../social/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../social/context")>();

  return {
    ...actual,
    useSocial: () => roomHarness.social,
  };
});

vi.mock("../../state/entityStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../state/entityStore")>();

  return {
    ...actual,
    useEntityStore: () => roomHarness.entityStore,
  };
});

import { ImConversationRoomPage, ImNewConversationPage } from "./pages";
import { ImMessageMultiSelectOverlay } from "./ImMessageMultiSelectOverlay";
import { translateImUiText } from "./ui-copy";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class RoomMediaRecorder {
  static instances: RoomMediaRecorder[] = [];

  mimeType = "audio/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: (() => void) | null = null;
  state: RecordingState = "inactive";

  constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {
    RoomMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
  }

  emitData(blob: Blob) {
    this.ondataavailable?.({ data: blob } as BlobEvent);
  }

  finishStop() {
    this.onstop?.();
  }
}

function buildConversationRoomStore() {
  const currentUser = {
    accountId: "current-account",
    avatar: "/current-avatar.png",
    id: "current-user",
    nickname: "我",
    profileKind: "user",
    searchableFields: ["我"],
    sortKey: "W",
    status: "online",
    tags: [],
    userIdLabel: "NeeDo ID: current-user",
  };
  const partner = {
    accountId: "partner-account",
    avatar: "/partner-avatar.png",
    id: "partner-user",
    nickname: "测试好友",
    profileKind: "user",
    searchableFields: ["测试好友"],
    signature: "正式会话测试",
    sortKey: "C",
    status: "online",
    tags: [],
    userIdLabel: "NeeDo ID: partner-user",
  };
  const conversation = {
    avatar: partner.avatar,
    contactUserId: partner.id,
    draftText: "不要清空这段草稿",
    id: "conversation-room",
    isMuted: false,
    isPinned: false,
    lastMessagePreview: "",
    lastMessageTime: "2026-08-31T00:00:00.000Z",
    memberIds: [currentUser.id, partner.id],
    title: partner.nickname,
    type: "single",
    unreadCount: 0,
    updatedAt: "2026-08-31T00:00:00.000Z",
  };
  const sendVoiceMessage = vi.fn()
    .mockRejectedValueOnce(new Error("network unavailable"))
    .mockResolvedValueOnce(undefined);

  return {
    activeConversationId: undefined,
    api: { uploadImage: vi.fn() },
    config: {
      allowStrangerMessaging: false,
      preserveConversationAfterDelete: true,
      recallWindowMs: 120_000,
      separatorThresholdMs: 300_000,
      syncDraftAcrossDevices: true,
    },
    contacts: [{
      createdAt: "2026-08-31T00:00:00.000Z",
      id: "contact-partner",
      isBlocked: false,
      isStarred: false,
      ownerUserId: currentUser.id,
      relationStatus: "active",
      source: "friend",
      tags: [],
      targetUserId: partner.id,
      updatedAt: "2026-08-31T00:00:00.000Z",
    }],
    conversations: [conversation],
    currentUserId: currentUser.id,
    batchDeleteMessages: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn(),
    favoriteSelectedMessages: vi.fn().mockResolvedValue(undefined),
    friendRequests: [],
    loadConversation: vi.fn().mockResolvedValue(conversation),
    loadMessages: vi.fn().mockResolvedValue([]),
    markConversationRead: vi.fn().mockResolvedValue(undefined),
    members: [{ conversationId: conversation.id, joinedAt: conversation.updatedAt, userId: currentUser.id }, { conversationId: conversation.id, joinedAt: conversation.updatedAt, userId: partner.id }],
    messagesByConversation: { [conversation.id]: [] },
    paginationByConversation: { [conversation.id]: { hasMore: false, loaded: true, loading: false, nextCursor: null } },
    recallMessage: vi.fn(),
    sendFriendRequest: vi.fn(),
    sendMessage: vi.fn(),
    sendVoiceMessage,
    setActiveConversation: vi.fn(),
    setDraft: vi.fn(),
    setPendingChatRecordForward: vi.fn(),
    status: "ready",
    translateMessages: vi.fn().mockResolvedValue([]),
    ui: { drafts: {}, searchHistory: [] },
    users: [currentUser, partner],
    usersById: { [currentUser.id]: currentUser, [partner.id]: partner },
  };
}

function buildForwardPageStore({
  conversationId = "existing-conversation",
  conversations = [],
  ensureDirectConversation,
  messageIds = ["700", "701"],
  pending = true,
  forwardSelectedMessages = vi.fn().mockResolvedValue(undefined),
}: {
  conversationId?: string;
  conversations?: Record<string, unknown>[];
  ensureDirectConversation?: ReturnType<typeof vi.fn>;
  messageIds?: string[];
  pending?: boolean;
  forwardSelectedMessages?: ReturnType<typeof vi.fn>;
} = {}) {
  const user = {
    accountId: "partner-account",
    avatar: "/partner-avatar.png",
    id: "partner-user",
    nickname: "测试好友",
    profileKind: "person",
    searchableFields: ["测试好友"],
    sortKey: "C",
    status: "online",
    tags: [],
    userIdLabel: "NeeDo ID: partner-user",
  };
  const contact = {
    id: "contact-1",
    ownerUserId: "current-user",
    targetUserId: user.id,
    relationStatus: "active",
    source: "manual",
    isBlocked: false,
    isStarred: false,
    tags: [],
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
  };
  const secondUser = { ...user, accountId: "second-account", id: "second-user", nickname: "第二好友", searchableFields: ["第二好友"], userIdLabel: "NeeDo ID: second-user" };
  const secondContact = { ...contact, id: "contact-2", targetUserId: secondUser.id };
  return {
    api: {},
    contacts: [contact, secondContact],
    conversations,
    currentUserId: "current-user",
    ensureDirectConversation: ensureDirectConversation ?? vi.fn().mockImplementation((userId: string) => Promise.resolve({ id: userId === secondUser.id ? "second-conversation" : conversationId })),
    forwardSelectedMessages,
    members: [],
    pendingChatRecordForward: pending
      ? { sourceConversationId: "source-conversation", messageIds }
      : null,
    searchDirectory: vi.fn().mockResolvedValue({ users: [] }),
    setPendingChatRecordForward: vi.fn(),
    users: [user, secondUser],
    usersById: { [user.id]: user, [secondUser.id]: secondUser },
  };
}

function buildForwardConversation(id: string, type: "single" | "group", contactUserId?: string) {
  return { avatar: "", autoTranslateMessages: false, contactUserId, id, isMuted: false, isPinned: false, lastMessagePreview: "最近消息", lastMessageTime: "2026-08-31T00:00:00.000Z", memberIds: type === "group" ? ["current-user", "partner-user"] : ["current-user", contactUserId], title: type === "group" ? "项目群" : "测试好友", type, unreadCount: 0, updatedAt: "2026-08-31T00:00:00.000Z" };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function useTestLanguage(language: Language = "zh") {
  window.localStorage.setItem("needo.language", language);
  window.localStorage.setItem("needo.language.mode", "manual");
}

async function renderForwardPage(store: Record<string, unknown>, entries = ["/messages/new?mode=forward"]) {
  useTestLanguage();
  roomHarness.store = store;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <I18nProvider>
          <ClientThemeProvider>
            <ImScopeProvider scope="user">
              <Routes>
                <Route path="/messages/new" element={<ImNewConversationPage />} />
                <Route path="/messages" element={<LocationProbe />} />
                <Route path="/messages/:conversationId" element={<LocationProbe />} />
              </Routes>
            </ImScopeProvider>
          </ClientThemeProvider>
        </I18nProvider>
      </MemoryRouter>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

afterEach(() => {
  vi.useRealTimers();
  RoomMediaRecorder.instances = [];
  roomHarness.store = null;
  window.localStorage.clear();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (navigator as Navigator & { mediaDevices?: MediaDevices }).mediaDevices;
  delete (URL as typeof URL & { createObjectURL?: typeof URL.createObjectURL }).createObjectURL;
  delete (URL as typeof URL & { revokeObjectURL?: typeof URL.revokeObjectURL }).revokeObjectURL;
});

describe("IM chat-record and multiselect five-language copy", () => {
  const sources = [
    "翻译", "隐藏译文", "多选", "已选择 {count} 条信息", "选择到这里",
    "转发", "复制", "收藏", "删除", "聊天记录", "最多选择100条信息",
    "本月免费翻译额度已用完", "翻译请求较多，请稍后重试", "翻译服务暂不可用，请稍后重试",
    "翻译失败，请稍后重试", "将从你的聊天记录中删除 {count} 条信息，不影响对方。",
    "聊天记录不可用", "转发内容已失效，请重新选择",
  ] as const;
  const values: Record<Language, readonly string[]> = {
    zh: sources,
    "zh-Hant": [
      "翻譯", "隱藏譯文", "多選", "已選擇 {count} 則訊息", "選擇到這裡",
      "轉發", "複製", "收藏", "刪除", "聊天記錄", "最多選擇100則訊息",
      "本月免費翻譯額度已用完", "翻譯請求較多，請稍後再試", "翻譯服務暫不可用，請稍後再試",
      "翻譯失敗，請稍後再試", "將從你的聊天記錄中刪除 {count} 則訊息，不影響對方。",
      "聊天記錄不可用", "轉發內容已失效，請重新選擇",
    ],
    ja: [
      "翻訳", "翻訳を非表示", "複数選択", "{count}件のメッセージを選択済み", "ここまで",
      "シェア", "コピー", "お気に入り", "削除", "チャット履歴", "メッセージは最大100件まで選択できます",
      "今月の無料翻訳上限に達しました", "翻訳リクエストが多すぎます。しばらくしてからもう一度お試しください", "翻訳サービスを一時的に利用できません。しばらくしてからもう一度お試しください",
      "翻訳に失敗しました。しばらくしてからもう一度お試しください", "チャット履歴から{count}件のメッセージを削除します。相手側には影響しません。",
      "チャット履歴を利用できません", "シェアする内容の有効期限が切れました。もう一度選択してください",
    ],
    en: [
      "Translate", "Hide translation", "Select multiple", "{count} messages selected", "Select to here",
      "Forward", "Copy", "Favorite", "Delete", "Chat history", "You can select up to 100 messages",
      "This month's free translation quota has been used up", "Too many translation requests. Try again later.", "Translation service is temporarily unavailable. Try again later.",
      "Translation failed. Try again later.", "Delete {count} messages from your chat history. This won't affect the other person.",
      "Chat record unavailable", "Forwarding selection expired. Select the messages again.",
    ],
    ko: [
      "번역", "번역 숨기기", "여러 개 선택", "메시지 {count}개 선택됨", "여기까지 선택",
      "전달", "복사", "즐겨찾기", "삭제", "채팅 기록", "메시지는 최대 100개까지 선택할 수 있습니다",
      "이번 달 무료 번역 한도를 모두 사용했습니다", "번역 요청이 많습니다. 잠시 후 다시 시도해 주세요", "번역 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요",
      "번역에 실패했습니다. 잠시 후 다시 시도해 주세요", "채팅 기록에서 메시지 {count}개를 삭제합니다. 상대방에게는 영향을 주지 않습니다.",
      "채팅 기록을 사용할 수 없습니다", "전달할 내용이 만료되었습니다. 다시 선택해 주세요",
    ],
  };

  it.each<Language>(["zh", "zh-Hant", "ja", "en", "ko"])("uses exact complete %s phrases", (language) => {
    expect(sources.map((source) => translateImUiText(source, language))).toEqual(values[language]);
  });

  const fallbackSources = ["回复", "显示译文", "信息置顶", "取消信息置顶", "撤回", "已复制"] as const;
  const fallbackValues: Record<Exclude<Language, "zh">, readonly string[]> = {
    "zh-Hant": ["回覆", "顯示譯文", "信息置顶", "取消信息置顶", "撤回", "已複製"],
    ja: ["返信", "翻訳を表示", "情報ピン留め", "キャンセル情報ピン留め", "撤回する", "コピーしました"],
    en: ["Reply", "Show translation", "InformationPinned", "CancelInformationPinned", "Withdraw", "Copied"],
    ko: ["답글", "번역 보기", "정보고정됨", "취소정보고정됨", "철회하다", "복사됨"],
  };

  it.each<Exclude<Language, "zh">>(["zh-Hant", "ja", "en", "ko"])("falls back to the shared dictionary for unmapped %s action copy", (language) => {
    expect(fallbackSources.map((source) => translateImUiText(source, language))).toEqual(fallbackValues[language]);
  });

  it.each<Language>(["zh", "zh-Hant", "ja", "en", "ko"])("renders complete dynamic-count phrases in %s", async (language) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<ImMessageMultiSelectOverlay
      deleteConfirmationOpen language={language} notice="最多选择100条信息"
      onCancel={vi.fn()} onConfirmDelete={vi.fn()} onCopy={vi.fn()} onDelete={vi.fn()}
      onDismissDeleteConfirmation={vi.fn()} onFavorite={vi.fn()} onForward={vi.fn()}
      onSelectToPoint={vi.fn()} pendingAction={null} selectedCount={3}
    />));
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe(values[language][3]?.replace("{count}", "3"));
    expect(container.querySelector('[role="dialog"] p')?.textContent).toBe(values[language][15]?.replace("{count}", "3"));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(values[language][10]);
    await act(async () => root.unmount());
  });
});

describe("ImNewConversationPage chat-record forwarding", () => {
  it("renders an expired selection as non-submittable", async () => {
    const store = buildForwardPageStore({ pending: false });
    const view = await renderForwardPage(store);

    expect(view.container.textContent).toContain("转发内容已失效，请重新选择");
    expect(view.container.textContent).not.toContain("测试好友");
    expect(store.ensureDirectConversation).not.toHaveBeenCalled();

    await act(async () => view.root.unmount());
  });

  it("clears the transient selection and navigates back on explicit cancel", async () => {
    const store = buildForwardPageStore();
    const view = await renderForwardPage(store, [
      "/messages",
      "/messages/new?mode=forward",
    ]);

    await act(async () => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="返回"]')?.click();
      await Promise.resolve();
    });

    expect(store.setPendingChatRecordForward).toHaveBeenCalledWith(null);
    expect(view.container.querySelector('[data-testid="location"]')?.textContent).toBe("/messages");
    await act(async () => view.root.unmount());
  });

  it.each([
    ["source direct", buildForwardConversation("source-conversation", "single", "partner-user"), "测试好友"],
    ["source group", buildForwardConversation("source-conversation", "group"), "项目群"],
    ["existing direct", buildForwardConversation("direct-conversation", "single", "partner-user"), "测试好友"],
    ["existing group", buildForwardConversation("group-conversation", "group"), "项目群"],
  ])("forwards directly to an %s target without ensuring a new direct conversation", async (_label, conversation, targetLabel) => {
    const store = buildForwardPageStore({ conversations: [conversation] });
    const view = await renderForwardPage(store);

    await act(async () => {
      const target = view.container.querySelector<HTMLButtonElement>(`[data-forward-conversation-id="${conversation.id}"] button`);
      expect(target?.textContent).toContain(targetLabel);
      target?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(store.ensureDirectConversation).not.toHaveBeenCalled();
    expect(store.forwardSelectedMessages).toHaveBeenCalledWith(conversation.id, expect.any(String));
    expect(view.container.querySelector('[data-testid="location"]')?.textContent).toBe(`/messages/${conversation.id}`);
    await act(async () => view.root.unmount());
  });

  it("does not offer a contact as new when any valid existing direct conversation already targets it", async () => {
    const sourceDirect = buildForwardConversation("source-conversation", "single", "partner-user");
    const store = buildForwardPageStore({ conversations: [sourceDirect] });
    const view = await renderForwardPage(store);
    const partnerTargets = Array.from(view.container.querySelectorAll("button"))
      .filter((button) => button.textContent?.includes("测试好友"));
    expect(partnerTargets).toHaveLength(1);
    expect(view.container.querySelector('[data-forward-conversation-id="source-conversation"]')).not.toBeNull();
    await act(async () => view.root.unmount());
  });

  it("uses contacts only to create a new direct target", async () => {
    const store = buildForwardPageStore({ conversationId: "new-conversation" });
    const view = await renderForwardPage(store);
    await act(async () => {
      Array.from(view.container.querySelectorAll("button")).find((button) => button.textContent?.includes("测试好友"))?.click();
      await Promise.resolve(); await Promise.resolve();
    });
    expect(store.ensureDirectConversation).toHaveBeenCalledWith("partner-user");
    expect(store.forwardSelectedMessages).toHaveBeenCalledWith("new-conversation", expect.any(String));
    await act(async () => view.root.unmount());
  });

  it("retains the selection and reuses one idempotency key after a failed attempt", async () => {
    const forwardSelectedMessages = vi
      .fn()
      .mockRejectedValueOnce(new Error("error.im.delivery_failed"))
      .mockResolvedValueOnce(undefined);
    const store = buildForwardPageStore({ forwardSelectedMessages });
    const view = await renderForwardPage(store);
    const target = () => Array.from(view.container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("测试好友"));

    await act(async () => {
      target()?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.container.textContent).toContain("转发失败，请重试");
    expect(view.container.textContent).toContain("已选 2 条消息");
    expect(store.setPendingChatRecordForward).not.toHaveBeenCalled();

    await act(async () => {
      target()?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(forwardSelectedMessages).toHaveBeenCalledTimes(2);
    expect(store.ensureDirectConversation).toHaveBeenCalledTimes(1);
    expect(forwardSelectedMessages.mock.calls[0]?.[1]).toBe(
      forwardSelectedMessages.mock.calls[1]?.[1],
    );
    expect(view.container.querySelector('[data-testid="location"]')?.textContent).toBe("/messages/existing-conversation");
    await act(async () => view.root.unmount());
  });

  it("uses a new idempotency key when the user switches targets after failure", async () => {
    const forwardSelectedMessages = vi.fn().mockRejectedValue(new Error("error.im.delivery_failed"));
    const store = buildForwardPageStore({ forwardSelectedMessages });
    const view = await renderForwardPage(store);
    for (const label of ["测试好友", "第二好友"]) {
      await act(async () => {
        Array.from(view.container.querySelectorAll("button")).find((button) => button.textContent?.includes(label))?.click();
        await Promise.resolve(); await Promise.resolve();
      });
    }
    expect(forwardSelectedMessages).toHaveBeenCalledTimes(2);
    expect(forwardSelectedMessages.mock.calls[0]?.[0]).toBe("existing-conversation");
    expect(forwardSelectedMessages.mock.calls[1]?.[0]).toBe("second-conversation");
    expect(forwardSelectedMessages.mock.calls[0]?.[1]).not.toBe(forwardSelectedMessages.mock.calls[1]?.[1]);
    await act(async () => view.root.unmount());
  });

  it("suppresses same-tick double submission", async () => {
    let resolveForward!: () => void;
    const forwardSelectedMessages = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { resolveForward = resolve; }));
    const store = buildForwardPageStore({ forwardSelectedMessages });
    const view = await renderForwardPage(store);
    const target = Array.from(view.container.querySelectorAll("button")).find((button) => button.textContent?.includes("测试好友"));
    await act(async () => { target?.click(); target?.click(); await Promise.resolve(); });
    expect(store.ensureDirectConversation).toHaveBeenCalledTimes(1);
    expect(forwardSelectedMessages).toHaveBeenCalledTimes(1);
    await act(async () => { resolveForward(); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => view.root.unmount());
  });

  it("ignores cancel while a forward target is resolving", async () => {
    let resolveConversation!: (conversation: { id: string }) => void;
    const ensureDirectConversation = vi.fn().mockImplementation(() => new Promise<{ id: string }>((resolve) => { resolveConversation = resolve; }));
    const store = buildForwardPageStore({ ensureDirectConversation });
    const view = await renderForwardPage(store, ["/messages", "/messages/new?mode=forward"]);
    await act(async () => {
      Array.from(view.container.querySelectorAll("button")).find((button) => button.textContent?.includes("测试好友"))?.click();
      view.container.querySelector<HTMLButtonElement>('button[aria-label="返回"]')?.click();
      await Promise.resolve();
    });
    expect(store.setPendingChatRecordForward).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-testid="location"]')?.textContent).toBeUndefined();
    await act(async () => { resolveConversation({ id: "existing-conversation" }); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => view.root.unmount());
  });
});

describe("ImNewConversationPage directory query handoff", () => {
  it("initializes the editable formal directory query from the URL", () => {
    expect(source).toContain(
      'const [query, setQuery] = useState(searchParams.get("q")?.trim() ?? "");'
    );
    expect(source).toContain("store.searchDirectory(keyword)");
    expect(source).toContain('value={query}');
  });

  it("opens an account profile instead of directly adding or starting chat", () => {
    const start = source.indexOf("export function ImNewConversationPage");
    const friendModeStart = source.indexOf("isFriendMode ?", start);
    const friendModeEnd = source.indexOf(": isCollectMode ?", friendModeStart);
    const friendModeSource = source.slice(friendModeStart, friendModeEnd);

    expect(friendModeSource).toContain("config.routes.directoryProfile(user.id)");
    expect(friendModeSource).toContain("点击账号查看资料并发送好友申请");
    expect(friendModeSource).not.toContain("addFriendAndOpen");
    expect(friendModeSource).not.toContain("ensureDirectConversation");
  });

  it("uses the shared fullscreen detail header for the directory profile", () => {
    const start = source.indexOf("export function ImDirectoryProfilePage");
    const end = source.indexOf("export function ImContactDetailPage", start);
    const profileSource = source.slice(start, end);

    expect(profileSource).toContain("<MobileFullscreenPage");
    expect(profileSource).toContain("<MobileFullscreenHeader");
    expect(profileSource).toContain('info={t("查看资料")}');
    expect(profileSource).toContain("const closeDirectoryProfile = () => {");
    expect(profileSource).toContain("onClose={closeDirectoryProfile}");
    expect(profileSource).not.toContain("onClose={fromRequests");
    expect(profileSource).not.toContain("subtitle=");
    expect(profileSource).not.toContain("gradient");
  });

  it("uses the expanded formal technician card only when contact details are authorized", () => {
    const start = source.indexOf("export function ImDirectoryProfilePage");
    const end = source.indexOf("export function ImContactDetailPage", start);
    const profileSource = source.slice(start, end);

    expect(profileSource).toContain("<ConversationIdentityProfileCard");
    expect(profileSource).toContain("<TechnicianPublicInfoCard");
    expect(profileSource).toContain("formalData={formalTechnicianProfileCard.formalData}");
    expect(profileSource).toContain("buildFormalTechnicianProfileCard(profile)");
    expect(profileSource).toContain("identityCard={profile.identityCard}");
    expect(profileSource).toContain("viewerScope={scope}");
    expect(profileSource).not.toContain("<ContactSummaryCard");
  });

  it("renders friend-request actions as independent buttons without a shared visual capsule", () => {
    const start = source.indexOf("function ImFriendProfileActionBar");
    const end = source.indexOf("export function ImDirectoryProfilePage", start);
    const actionBarSource = source.slice(start, end);

    expect(actionBarSource).toContain('className="pointer-events-auto flex gap-3"');
    expect(actionBarSource).not.toContain("rounded-[28px] border");
    expect(actionBarSource).not.toContain("backdrop-blur-xl");
  });

  it("promotes an accepted directory profile to the complete contact information page", () => {
    const start = source.indexOf("export function ImDirectoryProfilePage");
    const end = source.indexOf("export function ImContactDetailPage", start);
    const profileSource = source.slice(start, end);

    expect(profileSource).toContain("profile?.user.id !== userId || !isFriendProfile");
    expect(profileSource).toContain("store.ensureDirectConversation(userId)");
    expect(profileSource).toContain("config.routes.conversationInfo(conversation.id)");
    expect(profileSource).toContain("navigate(config.routes.conversationInfo(conversation.id), { replace: true })");
    expect(profileSource).toContain("contactInfoRedirectAttempt");
    expect(profileSource).toContain("contactInfoRedirectFailed");
  });

  it("keeps an active request from either directory source on the independent friend action page", () => {
    const start = source.indexOf("export function ImDirectoryProfilePage");
    const end = source.indexOf("export function ImContactDetailPage", start);
    const profileSource = source.slice(start, end);

    expect(profileSource).toContain("profile?.friendRequest ?? (");
    expect(profileSource).toContain("store.friendRequests.find((item) => item.id === requestId)");
    expect(profileSource).toContain("const activePendingRequest = isActiveFriendRequest(request);");
    expect(profileSource).toContain('profile?.relationship === "friend" && !activePendingRequest');
    expect(profileSource).toContain("profile?.user.id !== userId || !isFriendProfile");
    expect(profileSource).toContain("<ImFriendProfileActionBar");
  });

  it("renders the current account as read-only contact information without relationship controls", () => {
    const start = source.indexOf("export function ImDirectoryProfilePage");
    const end = source.indexOf("export function ImContactDetailPage", start);
    const profileSource = source.slice(start, end);

    expect(profileSource).toContain(
      'const isSelfProfile = profile?.user.id === userId && profile?.relationship === "self";',
    );
    expect(profileSource).toContain("{!isSelfProfile ? (");
    expect(profileSource).toContain("profile && !isFriendProfile && !isSelfProfile");
    expect(profileSource).toContain("<ConversationIdentityProfileCard");
    expect(profileSource).toContain("<ImContactActivityEntry");
  });

  it("uses contact information naming for contact pages while retaining group settings naming", () => {
    const profileStart = source.indexOf("export function ImDirectoryProfilePage");
    const contactDetailStart = source.indexOf("export function ImContactDetailPage", profileStart);
    const conversationInfoStart = source.indexOf("export function ImConversationInfoPage", contactDetailStart);
    const conversationInfoEnd = source.indexOf("export function ImConversationSearchPage", conversationInfoStart);
    const profileSource = source.slice(profileStart, contactDetailStart);
    const contactDetailSource = source.slice(contactDetailStart, conversationInfoStart);
    const conversationInfoSource = source.slice(conversationInfoStart, conversationInfoEnd);

    expect(profileSource).toContain('title={t("联系人信息")}');
    expect(profileSource).not.toContain('title={t("账号信息")}');
    expect(contactDetailSource.match(/title=\{t\("联系人信息"\)\}/g)).toHaveLength(2);
    expect(conversationInfoSource).toContain(
      'title={t(conversation.type === "single" ? "联系人信息" : "信息设置")}',
    );
    expect(conversationInfoSource).toContain(
      'actions={<IconButton icon="close" label={t("关闭")} onClick={() => navigate(-1)} />}',
    );
  });

  it("uses the formal identity profile card in one-to-one conversation settings", () => {
    const start = source.indexOf("export function ImConversationInfoPage");
    const end = source.indexOf("export function ImConversationSearchPage", start);
    const infoSource = source.slice(start, end);

    expect(infoSource).toContain("store.getDirectoryProfile");
    expect(infoSource).toContain("<ConversationIdentityProfileCard");
    expect(infoSource).not.toContain("infoMiniCard");
    expect(infoSource).not.toContain("<SocialProfileMiniCard");
    expect(infoSource).not.toContain("<ContactSummaryCard");
  });

  it("refreshes authoritative IM identities when conversation and contact lists become ready", () => {
    const conversationsStart = source.indexOf("export function ImConversationListPage");
    const contactsStart = source.indexOf("export function ImContactsListPage", conversationsStart);
    const contactsEnd = source.indexOf("export function ImFriendRequestsPage", contactsStart);
    const conversationsSource = source.slice(conversationsStart, contactsStart);
    const contactsSource = source.slice(contactsStart, contactsEnd);

    [conversationsSource, contactsSource].forEach((pageSource) => {
      expect(pageSource).toContain('if (store.status !== "ready")');
      expect(pageSource).toContain("void store.refresh();");
      expect(pageSource).toContain("[store.refresh, store.status]");
    });
  });

  it("renders the directory response user in the conversation identity card", () => {
    const start = source.indexOf("export function ImConversationInfoPage");
    const end = source.indexOf("export function ImConversationSearchPage", start);
    const infoSource = source.slice(start, end);

    expect(infoSource).toContain("user={conversationDirectoryProfile?.user ?? user}");
  });

  it("routes both friend-deletion entry points through the shared confirmation flow", () => {
    const contactsStart = source.indexOf("export function ImContactsListPage");
    const contactsEnd = source.indexOf("export function ImFriendRequestsPage", contactsStart);
    const contactsSource = source.slice(contactsStart, contactsEnd);
    const infoStart = source.indexOf("export function ImConversationInfoPage");
    const infoEnd = source.indexOf("export function ImMediaRecordsPage", infoStart);
    const infoSource = source.slice(infoStart, infoEnd);

    expect(source).toContain('from "./FriendDeletionConfirmDialog"');
    expect(source.match(/<FriendDeletionConfirmDialog/g)).toHaveLength(2);

    expect(contactsSource).toContain("useFriendDeletionConfirmation<ContactRelation>");
    expect(contactsSource).toContain("contactDeletion.requestDeletion(contact)");
    expect(contactsSource).not.toContain("onClick: () => void store.deleteContact(contact.id)");

    expect(infoSource).toContain("useFriendDeletionConfirmation<ContactRelation>");
    expect(infoSource).toContain("contactDeletion.requestDeletion(contact)");
    expect(infoSource).toContain("navigate(config.routes.contacts, { replace: true })");
    expect(infoSource).not.toContain("onClick={() => void store.deleteContact(contact.id)}");
  });

  it("replaces friend-only settings actions with a formal add-friend action after the relationship is removed", () => {
    const start = source.indexOf("export function ImConversationInfoPage");
    const end = source.indexOf("export function ImConversationSearchPage", start);
    const infoSource = source.slice(start, end);

    expect(infoSource).toContain("resolveDirectoryProfileActions(");
    expect(infoSource).toContain('conversationFriendActions.includes("send_request")');
    expect(infoSource).toContain('conversationFriendActions.includes("accept")');
    expect(infoSource).toContain("store.sendFriendRequest");
    expect(infoSource).toContain("store.acceptFriendRequest");
    expect(infoSource).toContain('contact?.id, formalActivityTargetUserId');
    expect(infoSource).toContain('{t("添加好友")}');
  });
});

describe("IM membership support entry wiring", () => {
  it("keeps the configured support benefit outside formal users and conversations", () => {
    const start = source.indexOf("export function ImContactsListPage");
    const end = source.indexOf("export function ImFriendRequestsPage", start);
    const contactsSource = source.slice(start, end);

    expect(source).toContain('from "./MembershipSupportEntry"');
    expect(contactsSource).toContain(
      '<MembershipSupportEntry enabled={scope === "user"} language={language} />'
    );
    expect(supportSource).not.toContain("supportUserId");
    expect(supportSource).not.toContain("supportConversationId");
    expect(supportSource).not.toContain("usersById");
  });
});

describe("IM automatic translation display wiring", () => {
  it("passes the confirmed room preference only to message bubbles", () => {
    const start = source.indexOf("export function ImConversationRoomPage");
    const end = source.indexOf("export function ImConversationInfoPage", start);
    const roomSource = source.slice(start, end);

    expect(roomSource).toContain("const automaticTranslationEnabled = conversation?.autoTranslateMessages ?? false;");
    expect(roomSource).toContain("getVisibleMessageTranslation(message)");
    expect(roomSource).toContain("language");
    expect(roomSource).toContain("translation={");
    expect(roomSource).not.toContain("buildMessageDisplayPreview(");
  });

  it("keeps conversation previews outside the automatic translation boundary", () => {
    const start = source.indexOf("export function ImConversationListPage");
    const end = source.indexOf("export function ImContactsListPage", start);
    const listSource = source.slice(start, end);

    expect(source).not.toContain("getImPreviewDisplayText(");
    expect(listSource).toContain("buildConversationRawPreview(conversation)");
    expect(listSource).not.toContain("conversation.autoTranslateMessages");
  });

  it("keeps search results raw without consulting the conversation preference", () => {
    const start = source.indexOf("export function ImSearchPage");
    const end = source.indexOf("export function ImOrganizationContactsPage", start);
    const searchSource = source.slice(start, end);

    expect(searchSource).toContain("message.conversationId");
    expect(searchSource).not.toContain("buildMessageDisplayPreview(");
    expect(searchSource).not.toContain("autoTranslateMessages");
    expect(searchSource).toContain("store.search(deferredQuery, conversationId)");
  });

  it("keeps pinned previews raw", () => {
    const start = source.indexOf("export function ImConversationRoomPage");
    const end = source.indexOf("export function ImConversationInfoPage", start);
    const roomSource = source.slice(start, end);
    const pinnedStart = roomSource.indexOf("{pinnedMessages.map((message) => {");
    const pinnedEnd = roomSource.indexOf("})}", pinnedStart);
    const pinnedSource = roomSource.slice(pinnedStart, pinnedEnd);

    expect(pinnedSource).toContain("buildMessageRawPreview(");
    expect(pinnedSource).not.toContain("messageTranslation");
  });

  it("copies the visible translated text while forward and recall continue to use the stored message", () => {
    const start = source.indexOf("export function ImConversationRoomPage");
    const end = source.indexOf("export function ImConversationInfoPage", start);
    const roomSource = source.slice(start, end);

    expect(roomSource).toContain("getImMessageCopyText(message, getVisibleMessageTranslation(message)?.content)");
    expect(roomSource).not.toContain("selectedContent");
    expect(roomSource).toContain("store.setPendingChatRecordForward({");
    expect(roomSource).toContain("messageIds: [message.id]");
    expect(source).not.toContain('searchParams.get("messageId")');
    expect(roomSource).toContain("restoreImComposerDraft(message.content, message.ext?.richText)");
  });
});

function installConversationRoomDomStubs() {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0)
  );
  const cancelAnimationFrame = vi.fn((handle: number) => window.clearTimeout(handle));
  vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
  Object.defineProperty(window, "requestAnimationFrame", { configurable: true, value: requestAnimationFrame });
  Object.defineProperty(window, "cancelAnimationFrame", { configurable: true, value: cancelAnimationFrame });
}

async function renderConversationRoom(store: Record<string, unknown>, conversationId = "conversation-room", language: Language = "zh") {
  useTestLanguage(language);
  roomHarness.store = store;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/messages/${conversationId}`]}>
        <I18nProvider>
          <ClientThemeProvider>
            <ImScopeProvider scope="user">
              <ImConversationRoomPage conversationId={conversationId} />
            </ImScopeProvider>
          </ClientThemeProvider>
        </I18nProvider>
      </MemoryRouter>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

async function renderRoutedConversationRoom(store: Record<string, unknown>, conversationId = "conversation-room") {
  useTestLanguage();
  roomHarness.store = store;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/messages/${conversationId}`]}>
        <I18nProvider>
          <ClientThemeProvider>
            <ImScopeProvider scope="user">
              <Routes>
                <Route path="/messages/:conversationId" element={<><ImConversationRoomPage conversationId={conversationId} /><LocationProbe /></>} />
                <Route path="*" element={<LocationProbe />} />
              </Routes>
            </ImScopeProvider>
          </ClientThemeProvider>
        </I18nProvider>
      </MemoryRouter>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

async function openActionMenuForText(text: string) {
  const bubble = Array.from(document.querySelectorAll<HTMLElement>("[data-im-message-bubble]"))
    .find((element) => element.textContent?.includes(text));
  expect(bubble).not.toBeUndefined();
  await act(async () => {
    bubble?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 12, clientY: 12 }));
    await Promise.resolve();
  });
  return document.querySelector<HTMLElement>("[data-im-message-action-sheet]");
}

function clickMenuButton(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-im-message-action-sheet] button"))
    .find((candidate) => candidate.textContent?.includes(label));
  expect(button).not.toBeUndefined();
  button?.click();
}

async function rerenderConversationRoom(
  root: ReturnType<typeof createRoot>,
  conversationId = "conversation-room",
) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/messages/${conversationId}`]}>
        <I18nProvider>
          <ClientThemeProvider>
            <ImScopeProvider scope="user">
              <ImConversationRoomPage conversationId={conversationId} />
            </ImScopeProvider>
          </ClientThemeProvider>
        </I18nProvider>
      </MemoryRouter>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

function dispatchRoomPointer(
  target: Element,
  type: "pointercancel" | "pointerdown" | "pointermove" | "pointerup",
  clientX: number,
  clientY: number,
) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
  Object.defineProperty(event, "pointerId", { configurable: true, value: 1 });
  target.dispatchEvent(event);
}

function roomMessage(overrides: Record<string, unknown>) {
  return {
    conversationId: "conversation-room",
    id: "501",
    localId: "501",
    senderId: "partner-user",
    type: "text",
    content: "消息一",
    status: "sent",
    sentAt: "2026-08-31T00:01:00.000Z",
    clientSeq: 1,
    ...overrides,
  };
}

describe("ImConversationRoomPage formal message multiselect", () => {
  it("cancels a stationary chat-record-card tap without activating its underlying route", async () => {
    installConversationRoomDomStubs();
    localStorage.setItem("needo.language", "zh");
    const store = buildConversationRoomStore();
    store.messagesByConversation["conversation-room"] = [
      roomMessage({ content: "进入多选" }),
      roomMessage({
        clientSeq: 2,
        content: "后端标题",
        ext: { chatRecord: { publicId: "11111111-1111-4111-8111-111111111111", itemCount: 1, preview: "A: saved", senderNames: ["A"], titleKind: "single" } },
        id: "502",
        localId: "502",
        sentAt: "2026-08-31T00:02:00.000Z",
        type: "chat-record",
      }),
    ];
    const view = await renderRoutedConversationRoom(store);
    await openActionMenuForText("进入多选");
    clickMenuButton("多选");
    await act(async () => { await Promise.resolve(); });
    const opener = view.container.querySelector<HTMLAnchorElement>("[data-im-chat-record-opener]")!;

    await act(async () => {
      dispatchRoomPointer(opener, "pointerdown", 10, 10);
      dispatchRoomPointer(opener, "pointerup", 10, 10);
      opener.click();
      await Promise.resolve();
    });

    expect(view.container.querySelector('[data-im-multiselect-action-bar]')).toBeNull();
    expect(view.container.querySelector('[data-testid="location"]')?.textContent).toBe("/messages/conversation-room");

    await act(async () => {
      opener.click();
      await Promise.resolve();
    });
    expect(view.container.querySelector('[data-testid="location"]')?.textContent).toBe("/messages/chat-records/11111111-1111-4111-8111-111111111111");
    await act(async () => view.root.unmount());
  });

  it("enters from the eligible menu action, anchors the pressed row, and uses only row circles as toggles", async () => {
    installConversationRoomDomStubs();
    localStorage.setItem("needo.language", "zh");
    const store = buildConversationRoomStore();
    store.messagesByConversation["conversation-room"] = [
      roomMessage({}),
      roomMessage({ id: "502", localId: "502", content: "消息二", clientSeq: 2, sentAt: "2026-08-31T00:02:00.000Z" }),
    ];
    const view = await renderConversationRoom(store);

    await openActionMenuForText("消息一");
    const multiselectButton = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-im-message-action-sheet] button"))
      .find((button) => button.textContent?.includes("多选"));
    expect(multiselectButton?.disabled).toBe(false);
    await act(async () => multiselectButton?.click());

    expect(view.container.querySelector('[data-im-multiselect-selected-count="1"]')).not.toBeNull();
    const circles = view.container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]');
    expect(circles).toHaveLength(2);
    expect(circles[0]?.getAttribute("aria-checked")).toBe("true");
    expect(circles[1]?.getAttribute("aria-checked")).toBe("false");
    await act(async () => circles[1]?.click());
    expect(view.container.querySelector('[data-im-multiselect-selected-count="2"]')).not.toBeNull();
    expect(circles[1]?.getAttribute("aria-checked")).toBe("true");

    const secondBubble = Array.from(view.container.querySelectorAll<HTMLElement>("[data-im-message-bubble]"))
      .find((element) => element.textContent?.includes("消息二"))!;
    await act(async () => {
      dispatchRoomPointer(secondBubble, "pointerdown", 10, 10);
      dispatchRoomPointer(secondBubble, "pointerup", 10, 10);
    });
    expect(view.container.querySelector('[data-im-multiselect-action-bar]')).toBeNull();
    await act(async () => view.root.unmount());
  });

  it("keeps selection after drag release and pointercancel, but exits on a later stationary message tap", async () => {
    installConversationRoomDomStubs();
    localStorage.setItem("needo.language", "zh");
    const store = buildConversationRoomStore();
    store.messagesByConversation["conversation-room"] = [roomMessage({ content: "手势消息" })];
    const view = await renderConversationRoom(store);
    await openActionMenuForText("手势消息");
    clickMenuButton("多选");
    await act(async () => { await Promise.resolve(); });
    const bubble = view.container.querySelector<HTMLElement>("[data-im-message-bubble]")!;

    await act(async () => {
      dispatchRoomPointer(bubble, "pointerdown", 10, 10);
      dispatchRoomPointer(bubble, "pointermove", 10, 24);
      dispatchRoomPointer(bubble, "pointerup", 10, 24);
    });
    expect(view.container.querySelector('[data-im-multiselect-action-bar]')).not.toBeNull();

    await act(async () => {
      dispatchRoomPointer(bubble, "pointerdown", 10, 10);
      dispatchRoomPointer(bubble, "pointercancel", 10, 10);
      dispatchRoomPointer(bubble, "pointerup", 10, 10);
    });
    expect(view.container.querySelector('[data-im-multiselect-action-bar]')).not.toBeNull();

    await act(async () => {
      dispatchRoomPointer(bubble, "pointerdown", 10, 10);
      dispatchRoomPointer(bubble, "pointerup", 10, 10);
    });
    expect(view.container.querySelector('[data-im-multiselect-action-bar]')).toBeNull();
    await act(async () => view.root.unmount());
  });

  it("copies visible translations in sender format and keeps selection when the clipboard rejects", async () => {
    installConversationRoomDomStubs();
    localStorage.setItem("needo.language", "zh");
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const store = buildConversationRoomStore();
    store.conversations = [{ ...store.conversations[0], autoTranslateMessages: true }];
    store.messagesByConversation["conversation-room"] = [
      roomMessage({ content: "原文一" }),
      roomMessage({ id: "502", localId: "502", senderId: "current-user", content: "原文二", clientSeq: 2, sentAt: "2026-08-31T00:02:00.000Z" }),
    ];
    store.translateMessages = vi.fn().mockResolvedValue([{ messageId: "501", status: "translated", translatedContent: "译文一" }]);
    const view = await renderConversationRoom(store);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await openActionMenuForText("原文一");
    clickMenuButton("多选");
    await act(async () => { await Promise.resolve(); });
    const circles = view.container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]');
    await act(async () => circles[1]?.click());
    const copy = view.container.querySelector<HTMLButtonElement>('[data-im-multiselect-action="copy"]')!;
    await act(async () => { copy.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(writeText).toHaveBeenCalledWith("测试好友:译文一\n我:原文二");
    expect(view.container.querySelector('[data-im-multiselect-action-bar]')).not.toBeNull();
    expect(view.container.textContent).toContain("复制失败，请重试");
    await act(async () => view.root.unmount());
  });

  it("keeps all actions locked while favorite is pending and exits only after success", async () => {
    installConversationRoomDomStubs();
    localStorage.setItem("needo.language", "zh");
    let resolveFavorite!: () => void;
    const store = buildConversationRoomStore();
    store.messagesByConversation["conversation-room"] = [roomMessage({ content: "收藏消息" })];
    store.favoriteSelectedMessages = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { resolveFavorite = resolve; }));
    const view = await renderConversationRoom(store);
    await openActionMenuForText("收藏消息");
    clickMenuButton("多选");
    await act(async () => { await Promise.resolve(); });
    const favorite = view.container.querySelector<HTMLButtonElement>('[data-im-multiselect-action="favorite"]')!;
    await act(async () => favorite.click());
    expect(store.favoriteSelectedMessages).toHaveBeenCalledTimes(1);
    expect([...view.container.querySelectorAll<HTMLButtonElement>('[data-im-multiselect-action-bar] button')].every((button) => button.disabled)).toBe(true);
    await act(async () => { favorite.click(); await Promise.resolve(); });
    expect(store.favoriteSelectedMessages).toHaveBeenCalledTimes(1);
    await act(async () => { resolveFavorite(); await Promise.resolve(); await Promise.resolve(); });
    expect(view.container.querySelector('[data-im-multiselect-action-bar]')).toBeNull();
    await act(async () => view.root.unmount());
  });

  it("reuses the same favorite UUID after an ambiguous lost response and does not duplicate a pending click", async () => {
    installConversationRoomDomStubs();
    localStorage.setItem("needo.language", "zh");
    let rejectFirst!: (error: unknown) => void;
    const first = new Promise<void>((_resolve, reject) => { rejectFirst = reject; });
    const store = buildConversationRoomStore();
    store.messagesByConversation["conversation-room"] = [roomMessage({ content: "收藏重试" })];
    store.favoriteSelectedMessages = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(undefined);
    const view = await renderConversationRoom(store);
    await openActionMenuForText("收藏重试");
    clickMenuButton("多选");
    await act(async () => { await Promise.resolve(); });
    const favorite = view.container.querySelector<HTMLButtonElement>('[data-im-multiselect-action="favorite"]')!;
    await act(async () => { favorite.click(); favorite.click(); await Promise.resolve(); });
    expect(store.favoriteSelectedMessages).toHaveBeenCalledTimes(1);
    await act(async () => { rejectFirst(new Error("lost response")); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { favorite.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(store.favoriteSelectedMessages).toHaveBeenCalledTimes(2);
    expect(store.favoriteSelectedMessages.mock.calls[0]?.[2]).toBe(store.favoriteSelectedMessages.mock.calls[1]?.[2]);
    await act(async () => view.root.unmount());
  });

  it("reuses the same batch-delete UUID after an ambiguous failure", async () => {
    installConversationRoomDomStubs();
    localStorage.setItem("needo.language", "zh");
    const store = buildConversationRoomStore();
    store.messagesByConversation["conversation-room"] = [roomMessage({ content: "删除重试" })];
    store.batchDeleteMessages = vi.fn()
      .mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce(undefined);
    const view = await renderConversationRoom(store);
    await openActionMenuForText("删除重试");
    clickMenuButton("多选");
    await act(async () => { await Promise.resolve(); });
    await act(async () => view.container.querySelector<HTMLButtonElement>('[data-im-multiselect-action="delete"]')?.click());
    const confirm = () => Array.from(view.container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
      .find((button) => button.textContent?.trim() === "删除")!;
    await act(async () => { confirm().click(); await Promise.resolve(); await Promise.resolve(); });
    expect(view.container.querySelector('[data-im-multiselect-action-bar]')).not.toBeNull();
    await act(async () => { confirm().click(); await Promise.resolve(); await Promise.resolve(); });
    expect(store.batchDeleteMessages).toHaveBeenCalledTimes(2);
    expect(store.batchDeleteMessages.mock.calls[0]?.[2]).toBe(store.batchDeleteMessages.mock.calls[1]?.[2]);
    await act(async () => view.root.unmount());
  });

  it("confirms atomic local-only deletion and forwards single selections through chat-record state", async () => {
    installConversationRoomDomStubs();
    localStorage.setItem("needo.language", "zh");
    const store = buildConversationRoomStore();
    store.messagesByConversation["conversation-room"] = [roomMessage({ content: "操作消息" })];
    const view = await renderConversationRoom(store);
    await openActionMenuForText("操作消息");
    clickMenuButton("多选");
    await act(async () => { await Promise.resolve(); });
    const deleteButton = view.container.querySelector<HTMLButtonElement>('[data-im-multiselect-action="delete"]')!;
    await act(async () => deleteButton.click());
    expect(view.container.textContent).toContain("将从你的聊天记录中删除 1 条信息，不影响对方。");
    const confirm = Array.from(view.container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
      .find((button) => button.textContent?.trim() === "删除")!;
    await act(async () => { confirm.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(store.batchDeleteMessages).toHaveBeenCalledWith("conversation-room", ["501"], expect.any(String));
    expect(view.container.querySelector('[data-im-multiselect-action-bar]')).toBeNull();

    await openActionMenuForText("操作消息");
    clickMenuButton("多选");
    await act(async () => { await Promise.resolve(); });
    const forward = view.container.querySelector<HTMLButtonElement>('[data-im-multiselect-action="forward"]')!;
    await act(async () => forward.click());
    expect(store.setPendingChatRecordForward).toHaveBeenCalledWith({ sourceConversationId: "conversation-room", messageIds: ["501"] });
    expect(view.container.querySelector('[data-im-multiselect-action-bar]')).toBeNull();
    await act(async () => view.root.unmount());
  });
});

describe("ImConversationRoomPage translation actions", () => {
  it.each([
    ["zh-Hant", "回覆", "信息置顶", "撤回", "複製", "已複製"],
    ["ja", "返信", "情報ピン留め", "撤回する", "コピー", "コピーしました"],
    ["en", "Reply", "InformationPinned", "Withdraw", "Copy", "Copied"],
    ["ko", "답글", "정보고정됨", "철회하다", "복사", "복사됨"],
  ] as const)("renders shared-fallback menu actions and notices in %s", async (language, reply, pin, recall, copy, copied) => {
    installConversationRoomDomStubs();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const store = buildConversationRoomStore();
    store.messagesByConversation["conversation-room"] = [{
      conversationId: "conversation-room",
      id: "fallback-message",
      localId: "fallback-message",
      senderId: "partner-user",
      type: "text",
      content: "fallback-message-content",
      status: "sent",
      sentAt: "2026-08-31T00:01:00.000Z",
      clientSeq: 1,
    }];
    const view = await renderConversationRoom(store, "conversation-room", language);

    const menu = await openActionMenuForText("fallback-message-content");
    expect(menu?.textContent).toContain(reply);
    expect(menu?.textContent).toContain(pin);
    expect(menu?.textContent).toContain(recall);
    await act(async () => {
      clickMenuButton(copy);
      await Promise.resolve();
    });
    expect(view.container.textContent).toContain(copied);
    expect(writeText).toHaveBeenCalledWith("fallback-message-content");
    await act(async () => view.root.unmount());
  });

  it("manually translates the current message below the original, hides and re-shows the cached text, then copies the visible translation", async () => {
    installConversationRoomDomStubs();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const store = buildConversationRoomStore();
    store.messagesByConversation["conversation-room"] = [{
      conversationId: "conversation-room",
      id: "501",
      localId: "501",
      senderId: "partner-user",
      type: "text",
      content: "测试测试",
      status: "sent",
      sentAt: "2026-08-31T00:01:00.000Z",
      clientSeq: 1,
    }];
    store.translateMessages = vi.fn().mockResolvedValue([
      { messageId: "501", status: "translated", translatedContent: "テストテスト" },
    ]);
    const view = await renderConversationRoom(store);

    await openActionMenuForText("测试测试");
    clickMenuButton("翻译");
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(view.container.textContent).toContain("测试测试");
    expect(view.container.querySelector('[data-im-message-translation="true"]')?.textContent).toBe("テストテスト");

    await openActionMenuForText("测试测试");
    expect(document.querySelector("[data-im-message-action-sheet]")?.textContent).toContain("隐藏译文");
    clickMenuButton("隐藏译文");
    await act(async () => { await Promise.resolve(); });
    expect(view.container.querySelector('[data-im-message-translation="true"]')).toBeNull();

    await openActionMenuForText("测试测试");
    expect(document.querySelector("[data-im-message-action-sheet]")?.textContent).toContain("显示译文");
    clickMenuButton("显示译文");
    await act(async () => { await Promise.resolve(); });
    expect(view.container.querySelector('[data-im-message-translation="true"]')?.textContent).toBe("テストテスト");

    await openActionMenuForText("测试测试");
    clickMenuButton("复制");
    await act(async () => { await Promise.resolve(); });
    expect(writeText).toHaveBeenCalledWith("テストテスト");
    expect(store.translateMessages).toHaveBeenCalledTimes(1);
    await act(async () => view.root.unmount());
  });

  it.each([
    [new ApiClientError("error.im.translation_quota_exceeded", 45601, 456), "本月免费翻译额度已用完"],
    [new ApiClientError("error.im.translation_rate_limited", 42905, 429), "翻译请求较多，请稍后重试"],
    [new ApiClientError("error.im.translation_timeout", 503, 503), "翻译服务暂不可用，请稍后重试"],
    [new ApiClientError("error.validation", 40001, 400), "翻译失败，请稍后重试"],
  ])("keeps the original visible and copied while rendering the mapped manual translation error: %s", async (translationError, expectedNotice) => {
    installConversationRoomDomStubs();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const store = buildConversationRoomStore();
    store.messagesByConversation["conversation-room"] = [{
      conversationId: "conversation-room",
      id: "502",
      localId: "502",
      senderId: "partner-user",
      type: "text",
      content: "失败原文",
      status: "sent",
      sentAt: "2026-08-31T00:01:00.000Z",
      clientSeq: 1,
    }];
    store.translateMessages = vi.fn().mockRejectedValue(translationError);
    const view = await renderConversationRoom(store);

    await openActionMenuForText("失败原文");
    clickMenuButton("翻译");
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(view.container.textContent).toContain("失败原文");
    expect(view.container.querySelector('[data-im-message-translation="true"]')).toBeNull();
    expect(view.container.textContent).toContain(expectedNotice);

    await openActionMenuForText("失败原文");
    clickMenuButton("复制");
    await act(async () => { await Promise.resolve(); });
    expect(writeText).toHaveBeenCalledWith("失败原文");
    await act(async () => view.root.unmount());
  });

  it.each([
    ["same_language", "当前内容无需翻译"],
    ["ineligible", "此消息不支持翻译"],
  ] as const)("reports the manual %s result without treating it as a provider failure", async (status, expectedNotice) => {
    installConversationRoomDomStubs();
    const store = buildConversationRoomStore();
    store.messagesByConversation["conversation-room"] = [{
      conversationId: "conversation-room",
      id: "503",
      localId: "503",
      senderId: "partner-user",
      type: "text",
      content: "无需变更的原文",
      status: "sent",
      sentAt: "2026-08-31T00:01:00.000Z",
      clientSeq: 1,
    }];
    store.translateMessages = vi.fn().mockResolvedValue([{ messageId: "503", status }]);
    const view = await renderConversationRoom(store);

    await openActionMenuForText("无需变更的原文");
    clickMenuButton("翻译");
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(view.container.textContent).toContain(expectedNotice);
    expect(view.container.textContent).not.toContain("翻译失败，请稍后重试");
    expect(view.container.querySelector('[data-im-message-translation="true"]')).toBeNull();
    expect(store.translateMessages).toHaveBeenCalledWith("conversation-room", ["503"], "zh");
    await act(async () => view.root.unmount());
  });

  it("shows automatic translations below the original, copies the visible translation, and disables the manual menu action while auto translation is enabled", async () => {
    installConversationRoomDomStubs();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const store = buildConversationRoomStore();
    store.conversations = [{ ...store.conversations[0], autoTranslateMessages: true }];
    store.messagesByConversation["conversation-room"] = [{
      conversationId: "conversation-room",
      id: "601",
      localId: "601",
      senderId: "partner-user",
      type: "text",
      content: "自动原文",
      status: "sent",
      sentAt: "2026-08-31T00:01:00.000Z",
      clientSeq: 1,
    }];
    store.translateMessages = vi.fn().mockResolvedValue([
      { messageId: "601", status: "translated", translatedContent: "自動訳文" },
    ]);
    const view = await renderConversationRoom(store);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.container.textContent).toContain("自动原文");
    expect(view.container.querySelector('[data-im-message-translation="true"]')?.textContent).toBe("自動訳文");

    await openActionMenuForText("自动原文");
    const translateButton = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-im-message-action-sheet] button"))
      .find((candidate) => candidate.textContent?.includes("翻译"));
    expect(translateButton?.disabled).toBe(true);
    clickMenuButton("复制");
    await act(async () => { await Promise.resolve(); });
    expect(writeText).toHaveBeenCalledWith("自動訳文");
    expect(store.translateMessages).toHaveBeenCalledTimes(1);
    await act(async () => view.root.unmount());
  });

  it("treats same-language and ineligible automatic responses as completed, then translates only newly loaded messages", async () => {
    installConversationRoomDomStubs();
    const store = buildConversationRoomStore();
    store.conversations = [{ ...store.conversations[0], autoTranslateMessages: true }];
    store.messagesByConversation["conversation-room"] = [
      {
        conversationId: "conversation-room",
        id: "701",
        localId: "701",
        senderId: "partner-user",
        type: "text",
        content: "同语言",
        status: "sent",
        sentAt: "2026-08-31T00:01:00.000Z",
        clientSeq: 1,
      },
      {
        conversationId: "conversation-room",
        id: "702",
        localId: "702",
        senderId: "partner-user",
        type: "text",
        content: "不可翻译",
        status: "sent",
        sentAt: "2026-08-31T00:01:01.000Z",
        clientSeq: 2,
      },
    ];
    store.translateMessages = vi.fn().mockResolvedValueOnce([
      { messageId: "701", status: "same_language" },
      { messageId: "702", status: "ineligible" },
    ]).mockResolvedValueOnce([
      { messageId: "703", status: "translated", translatedContent: "新訳文" },
    ]);
    const view = await renderConversationRoom(store);
    expect(store.translateMessages).toHaveBeenCalledTimes(1);
    expect(store.translateMessages.mock.calls[0]?.[1]).toEqual(["701", "702"]);

    store.messagesByConversation["conversation-room"] = [
      ...store.messagesByConversation["conversation-room"],
      {
        conversationId: "conversation-room",
        id: "703",
        localId: "703",
        senderId: "partner-user",
        type: "text",
        content: "新消息",
        status: "sent",
        sentAt: "2026-08-31T00:01:02.000Z",
        clientSeq: 3,
      },
    ];
    await rerenderConversationRoom(view.root);
    expect(store.translateMessages).toHaveBeenCalledTimes(2);
    expect(store.translateMessages.mock.calls[1]?.[1]).toEqual(["703"]);
    await act(async () => view.root.unmount());
  });

  it("throttles automatic retry after a rejected request instead of re-requesting on every rerender", async () => {
    installConversationRoomDomStubs();
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const store = buildConversationRoomStore();
    store.conversations = [{ ...store.conversations[0], autoTranslateMessages: true }];
    const baseMessage = {
      conversationId: "conversation-room",
      id: "801",
      localId: "801",
      senderId: "partner-user",
      type: "text" as const,
      content: "需要节流",
      status: "sent" as const,
      sentAt: "2026-08-31T00:01:00.000Z",
      clientSeq: 1,
    };
    store.messagesByConversation["conversation-room"] = [baseMessage];
    store.translateMessages = vi.fn()
      .mockRejectedValueOnce(new ApiClientError("error.network.timeout", 408, 408))
      .mockResolvedValueOnce([{ messageId: "801", status: "translated", translatedContent: "節流訳文" }]);

    const view = await renderConversationRoom(store);
    expect(store.translateMessages).toHaveBeenCalledTimes(1);

    store.messagesByConversation["conversation-room"] = [{ ...baseMessage }];
    now = 1_001;
    await rerenderConversationRoom(view.root);
    expect(store.translateMessages).toHaveBeenCalledTimes(1);

    store.messagesByConversation["conversation-room"] = [{ ...baseMessage }];
    now = 6_001;
    await rerenderConversationRoom(view.root);
    expect(store.translateMessages).toHaveBeenCalledTimes(2);
    await act(async () => view.root.unmount());
  });

  it("loads automatic translations for eligible other-party messages in deduped chunks and ignores late results after switching conversations", async () => {
    installConversationRoomDomStubs();
    const store = buildConversationRoomStore();
    store.conversations = [
      { ...store.conversations[0], autoTranslateMessages: true },
      { ...store.conversations[0], id: "conversation-next", autoTranslateMessages: true, memberIds: ["current-user", "partner-user"] },
    ];
    store.messagesByConversation["conversation-room"] = [
      ...Array.from({ length: 52 }, (_, index) => ({
        conversationId: "conversation-room",
        id: String(index + 1),
        localId: String(index + 1),
        senderId: "partner-user",
        type: "text" as const,
        content: `消息${index + 1}`,
        status: "sent" as const,
        sentAt: "2026-08-31T00:01:00.000Z",
        clientSeq: index + 1,
      })),
      {
        conversationId: "conversation-room",
        id: "53",
        localId: "53",
        senderId: "current-user",
        type: "text" as const,
        content: "自己的消息",
        status: "sent" as const,
        sentAt: "2026-08-31T00:01:00.000Z",
        clientSeq: 53,
      },
      {
        conversationId: "conversation-room",
        id: "local-54",
        localId: "local-54",
        senderId: "partner-user",
        type: "text" as const,
        content: "本地待发送",
        status: "sending" as const,
        sentAt: "2026-08-31T00:01:00.000Z",
        clientSeq: 54,
      },
    ];
    store.messagesByConversation["conversation-next"] = [{
      conversationId: "conversation-next",
      id: "901",
      localId: "901",
      senderId: "partner-user",
      type: "text",
      content: "新会话",
      status: "sent",
      sentAt: "2026-08-31T00:02:00.000Z",
      clientSeq: 1,
    }];
    const pendingResolvers: Array<() => void> = [];
    store.translateMessages = vi.fn().mockImplementation((_conversationId: string, messageIds: string[]) =>
      new Promise((resolve) => pendingResolvers.push(() => resolve(
        messageIds.map((messageId) => ({ messageId, status: "translated", translatedContent: `译文${messageId}` })),
      )))
    );
    const view = await renderConversationRoom(store);
    expect(store.translateMessages).toHaveBeenCalledTimes(2);
    expect(store.translateMessages.mock.calls[0]?.[1]).toHaveLength(50);
    expect(store.translateMessages.mock.calls[1]?.[1]).toEqual(["51", "52"]);

    await act(async () => {
      view.root.render(
        <MemoryRouter initialEntries={["/messages/conversation-next"]}>
          <I18nProvider>
            <ClientThemeProvider>
              <ImScopeProvider scope="user">
                <ImConversationRoomPage conversationId="conversation-next" />
              </ImScopeProvider>
            </ClientThemeProvider>
          </I18nProvider>
        </MemoryRouter>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    pendingResolvers.forEach((resolve) => resolve());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(view.container.textContent).not.toContain("译文1");
    expect(view.container.textContent).toContain("新会话");
    await act(async () => view.root.unmount());
  });

  it("ignores a late manual translation result after the conversation changes", async () => {
    installConversationRoomDomStubs();
    const store = buildConversationRoomStore();
    store.conversations = [
      store.conversations[0],
      { ...store.conversations[0], id: "conversation-next", memberIds: ["current-user", "partner-user"], title: "新会话" },
    ];
    store.messagesByConversation["conversation-room"] = [{
      conversationId: "conversation-room",
      id: "901",
      localId: "901",
      senderId: "partner-user",
      type: "text",
      content: "旧会话原文",
      status: "sent",
      sentAt: "2026-08-31T00:01:00.000Z",
      clientSeq: 1,
    }];
    store.messagesByConversation["conversation-next"] = [{
      conversationId: "conversation-next",
      id: "902",
      localId: "902",
      senderId: "partner-user",
      type: "text",
      content: "新会话原文",
      status: "sent",
      sentAt: "2026-08-31T00:02:00.000Z",
      clientSeq: 1,
    }];
    let resolveTranslation: ((value: { messageId: string; status: "translated"; translatedContent: string }[]) => void) | undefined;
    store.translateMessages = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveTranslation = resolve;
    }));
    const view = await renderConversationRoom(store);

    await openActionMenuForText("旧会话原文");
    clickMenuButton("翻译");
    await rerenderConversationRoom(view.root, "conversation-next");
    await act(async () => {
      resolveTranslation?.([{ messageId: "901", status: "translated", translatedContent: "遅延訳文" }]);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.container.textContent).toContain("新会话原文");
    expect(view.container.textContent).not.toContain("遅延訳文");
    await act(async () => view.root.unmount());
  });
});

describe("IM contact information automatic translation control", () => {
  const start = source.indexOf("export function ImConversationInfoPage");
  const end = source.indexOf("export function ImConversationSearchPage", start);
  const infoSource = source.slice(start, end);

  it("renders a single-chat-only control before mute and pin using the confirmed conversation value", () => {
    const translationIndex = infoSource.indexOf("聊天内容自动翻译");
    const muteIndex = infoSource.indexOf("消息免打扰");
    const pinIndex = infoSource.indexOf("置顶聊天");

    expect(infoSource).toContain('conversation.type === "single" ? (');
    expect(infoSource).toContain('title={t("聊天内容自动翻译")}');
    expect(infoSource).toContain('caption={t("打开后按当前 App 语言显示；关闭后显示原文")}');
    expect(infoSource).toContain("checked={conversation.autoTranslateMessages}");
    expect(translationIndex).toBeGreaterThan(-1);
    expect(translationIndex).toBeLessThan(muteIndex);
    expect(muteIndex).toBeLessThan(pinIndex);
  });

  it("disables repeated requests while pending and keeps the checked value server-confirmed", () => {
    expect(infoSource).toContain("const [autoTranslatePending, setAutoTranslatePending] = useState(false);");
    expect(infoSource).toContain("if (!conversation || conversation.type !== \"single\" || autoTranslatePending)");
    expect(infoSource).toContain("setAutoTranslatePending(true)");
    expect(infoSource).toContain("await store.setConversationAutoTranslateMessages(conversation.id, next)");
    expect(infoSource).toContain("setAutoTranslatePending(false)");
    expect(infoSource).toContain("disabled={autoTranslatePending}");
    expect(infoSource).not.toContain("setAutoTranslateMessages(");
  });

  it("shows a localized failure without introducing optimistic checked state", () => {
    expect(infoSource).toContain('showInfoToast(t("聊天内容自动翻译设置失败，请稍后重试"))');
    expect(infoSource).toContain("finally {");
    expect(infoSource).not.toContain("setAutoTranslateChecked");
  });

  it("forwards the pending state through ToggleRow to the native switch", () => {
    const toggleStart = componentsSource.indexOf("export function ToggleRow");
    const toggleEnd = componentsSource.indexOf("function formatSize", toggleStart);
    const toggleSource = componentsSource.slice(toggleStart, toggleEnd);

    expect(toggleSource).toContain("disabled?: boolean;");
    expect(toggleSource).toContain("disabled={disabled}");
  });
});

describe("ImConversationRoomPage formal contact-card picker", () => {
  it("loads authoritative candidates and sends the selected public user id through the dedicated store action", async () => {
    installConversationRoomDomStubs();
    const store = buildConversationRoomStore();
    store.conversations[0].draftText = "";
    const listContactCardCandidates = vi.fn().mockResolvedValue({
      list: [
        {
          avatarUrl: "/current-avatar.png",
          needoId: "u0000000100",
          nickname: "我的正式名片",
          relationship: "self",
          targetUserId: "u0000000100",
        },
        {
          avatarUrl: "/friend-avatar.png",
          needoId: "u0000000201",
          nickname: "山田花子",
          relationship: "friend",
          targetUserId: "u0000000201",
        },
      ],
      page: 1,
      page_size: 20,
      total: 2,
    });
    const sendContactCard = vi.fn().mockResolvedValue(roomMessage({
      content: "山田花子",
      id: "contact-card-701",
      localId: "contact-card-701",
      type: "contact-card",
    }));
    store.api = { ...store.api, listContactCardCandidates };
    store.sendContactCard = sendContactCard;
    vi.spyOn(crypto, "randomUUID").mockReturnValue("11111111-1111-4111-8111-111111111111");

    const view = await renderConversationRoom(store);
    await expect.poll(() => view.container.querySelector("button[aria-label='打开更多功能']")).not.toBeNull();
    const moreButton = view.container.querySelector<HTMLButtonElement>("button[aria-label='打开更多功能']")!;
    await act(async () => {
      moreButton.click();
      await Promise.resolve();
    });
    const cardButton = Array.from(view.container.querySelectorAll<HTMLButtonElement>("[data-im-composer-panel='more'] button"))
      .find((button) => button.textContent?.includes("名片"));
    expect(cardButton).not.toBeUndefined();

    await act(async () => {
      cardButton!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(listContactCardCandidates).toHaveBeenCalledWith("conversation-room", {
      page: 1,
      pageSize: 50,
    });
    expect(view.container.textContent).toContain("我的正式名片");
    expect(view.container.textContent).toContain("山田花子");
    expect(view.container.textContent).toContain("u0000000201");

    const friendCandidate = view.container.querySelector<HTMLButtonElement>(
      "[data-im-contact-card-candidate='u0000000201']",
    )!;
    await act(async () => {
      friendCandidate.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sendContactCard).toHaveBeenCalledWith(
      "conversation-room",
      "u0000000201",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(store.sendMessage).not.toHaveBeenCalled();
    expect(view.container.textContent).not.toContain("发送名片");
    await act(async () => view.root.unmount());
  });

  it("renders a V2 contact-card directly from the immutable message snapshot", async () => {
    installConversationRoomDomStubs();
    const store = buildConversationRoomStore();
    store.messagesByConversation["conversation-room"] = [roomMessage({
      content: "山田花子",
      ext: {
        contactCard: {
          avatar: "/hanako.png",
          displayName: "山田花子",
          ekycVerified: true,
          entityKind: "customer",
          headline: "预约前请先确认时间、语言和付款方式。",
          level: 12,
          needoId: "u0000000201",
          profileKind: "person",
          simpleBottomColor: "#132630",
          simpleTopColor: "#0d2f27",
          snapshotVersion: 2,
          userId: "u0000000201",
          userIdLabel: "u0000000201",
        },
      },
      id: "contact-card-v2",
      localId: "contact-card-v2",
      type: "contact-card",
    })];

    const view = await renderConversationRoom(store);
    await expect.poll(() => view.container.querySelector("[data-platform-membership-simple-card='true']")).not.toBeNull();
    expect(view.container.textContent).toContain("山田花子");
    expect(view.container.textContent).toContain("Lv.12");
    expect(view.container.textContent).toContain("ID u0000000201");
    expect(view.container.textContent).toContain("预约前请先确认时间、语言和付款方式。");
    await act(async () => view.root.unmount());
  });

  it("resolves an unknown snapshot public id and opens the shared contact information page", async () => {
    installConversationRoomDomStubs();
    const store = buildConversationRoomStore();
    const directoryUser = {
      ...store.users[1],
      accountId: "u0000000201",
      id: "directory-user-201",
      userIdLabel: "u0000000201",
    };
    const searchDirectory = vi.fn().mockResolvedValue({ users: [directoryUser] });
    store.api = { ...store.api, searchDirectory };
    store.messagesByConversation["conversation-room"] = [roomMessage({
      content: "山田花子",
      ext: {
        contactCard: {
          avatar: "/hanako.png",
          displayName: "山田花子",
          ekycVerified: true,
          entityKind: "customer",
          headline: "正式简介",
          level: 12,
          needoId: "u0000000201",
          profileKind: "person",
          snapshotVersion: 2,
          userId: "u0000000201",
          userIdLabel: "u0000000201",
        },
      },
      id: "contact-card-route",
      localId: "contact-card-route",
      type: "contact-card",
    })];

    const view = await renderRoutedConversationRoom(store);
    await expect.poll(() => view.container.querySelector<HTMLElement>(
      "[data-platform-membership-simple-card='true']",
    )).toBeTruthy();
    await act(async () => {
      view.container.querySelector<HTMLElement>("[data-platform-membership-simple-card='true']")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(searchDirectory).toHaveBeenCalledWith("u0000000201");
    expect(view.container.querySelector("[data-testid='location']")?.textContent)
      .toBe("/contacts/directory/directory-user-201");
    await act(async () => view.root.unmount());
  });
});

describe("ImConversationRoomPage voice recording integration", () => {
  it("never opens the action sheet for chat-record messages while ordinary messages retain it", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
    const store = buildConversationRoomStore();
    const base = { localId: "record-delivery", conversationId: "conversation-room", senderId: "partner-user", status: "sent", sentAt: "2026-08-31T00:01:00.000Z", clientSeq: 1 } as const;
    store.messagesByConversation["conversation-room"] = [
      { ...base, id: "record-delivery", type: "chat-record", content: "backend title", ext: { chatRecord: { publicId: "11111111-1111-4111-8111-111111111111", itemCount: 1, preview: "A: saved", senderNames: ["A"], titleKind: "single" } } },
      { ...base, id: "ordinary-message", localId: "ordinary-message", clientSeq: 2, type: "text", content: "ordinary" },
    ];
    roomHarness.store = store;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<MemoryRouter><I18nProvider><ClientThemeProvider><ImScopeProvider scope="user"><ImConversationRoomPage conversationId="conversation-room" /></ImScopeProvider></ClientThemeProvider></I18nProvider></MemoryRouter>); await Promise.resolve(); await Promise.resolve(); });
    vi.useFakeTimers();
    await act(async () => {
      document.querySelector("[data-im-chat-record-opener]")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 4, clientY: 4 }));
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(document.querySelector("[data-im-message-action-sheet]")).toBeNull();
    const ordinary = Array.from(document.querySelectorAll<HTMLElement>("[data-im-message-bubble]")).find((element) => element.textContent?.includes("ordinary"));
    await act(async () => {
      ordinary?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 4, clientY: 4 }));
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(document.querySelector("[data-im-message-action-sheet]")).not.toBeNull();
    await act(async () => root.unmount());
    vi.useRealTimers();
  });

  it("shows the unsupported recording notice again after the previous notice expires", async () => {
    vi.useFakeTimers();
    roomHarness.store = buildConversationRoomStore();
    window.localStorage.setItem("needo.language", "zh");
    window.localStorage.setItem("needo.language.mode", "manual");
    window.localStorage.setItem("needo.client.theme", "light-green");
    window.localStorage.setItem("needo.client.theme.mode", "manual");
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/messages/conversation-room"]}>
          <I18nProvider>
            <ClientThemeProvider>
              <ImScopeProvider scope="user">
                <ImConversationRoomPage conversationId="conversation-room" />
              </ImScopeProvider>
            </ClientThemeProvider>
          </I18nProvider>
        </MemoryRouter>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const voiceButton = container.querySelector<HTMLButtonElement>("button[aria-label='录制语音']")!;
    await act(async () => {
      voiceButton.click();
      await Promise.resolve();
    });
    expect(container.querySelector("[data-testid='im-conversation-action-notice']")?.textContent)
      .toContain("当前设备不支持浏览器录音");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_600);
    });
    expect(container.querySelector("[data-testid='im-conversation-action-notice']")).toBeNull();

    await act(async () => {
      voiceButton.click();
      await Promise.resolve();
    });
    expect(container.querySelector("[data-testid='im-conversation-action-notice']")?.textContent)
      .toContain("当前设备不支持浏览器录音");

    await act(async () => root.unmount());
  });

  it("keeps the recorded Blob and draft after a failed send, then closes and restores focus after retry succeeds", async () => {
    const store = buildConversationRoomStore();
    roomHarness.store = store;
    window.localStorage.setItem("needo.language", "zh");
    window.localStorage.setItem("needo.language.mode", "manual");
    window.localStorage.setItem("needo.client.theme", "light-green");
    window.localStorage.setItem("needo.client.theme.mode", "manual");

    const trackStop = vi.fn();
    const inputTrack = Object.assign(new EventTarget(), {
      kind: "audio",
      muted: false,
      readyState: "live",
      stop: trackStop,
    });
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [inputTrack],
    } as unknown as MediaStream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:conversation-room-voice"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal("MediaRecorder", RoomMediaRecorder);
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(0));
      return 1;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "readyState", "get")
      .mockReturnValue(HTMLMediaElement.HAVE_CURRENT_DATA);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/messages/conversation-room"]}>
          <I18nProvider>
            <ClientThemeProvider>
              <ImScopeProvider scope="user">
                <ImConversationRoomPage conversationId="conversation-room" />
              </ImScopeProvider>
            </ClientThemeProvider>
          </I18nProvider>
        </MemoryRouter>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const editor = container.querySelector<HTMLElement>("[data-im-composer-rich-input='true']")!;
    expect(editor.textContent).toBe("不要清空这段草稿");

    const voiceButton = container.querySelector<HTMLButtonElement>("button[aria-label='录制语音']")!;
    expect(voiceButton).not.toBeNull();
    await act(async () => {
      voiceButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const underlay = container.querySelector<HTMLElement>("[data-im-conversation-voice-underlay='true']")!;
    expect(container.querySelector("[data-im-voice-recording-overlay='true'][role='dialog']")).not.toBeNull();
    expect(underlay.hasAttribute("inert")).toBe(true);
    expect(underlay.getAttribute("aria-hidden")).toBe("true");
    expect(RoomMediaRecorder.instances).toHaveLength(1);

    const recorder = RoomMediaRecorder.instances[0]!;
    const recordedChunk = new Blob(["recorded voice"], { type: "audio/webm" });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button[aria-label='停止录音']")!.click();
      recorder.emitData(recordedChunk);
      recorder.finishStop();
      await Promise.resolve();
      await Promise.resolve();
    });

    const previewAudio = container.querySelector<HTMLAudioElement>("audio[src='blob:conversation-room-voice']");
    expect(previewAudio).not.toBeNull();
    expect(play).toHaveBeenCalledTimes(1);
    expect(container.querySelector("button[aria-label='删除录音']")).not.toBeNull();
    expect(container.querySelector("button[aria-label='重放录音']")).not.toBeNull();
    expect(container.querySelector("button[aria-label='发送录音']")).not.toBeNull();
    expect(container.querySelector("[data-im-voice-playback-time='true']")?.textContent).toBe("0:00 / 0:01");

    previewAudio!.currentTime = 1;
    await act(async () => previewAudio!.dispatchEvent(new Event("timeupdate", { bubbles: true })));
    expect(container.querySelector("[data-im-voice-playback-time='true']")?.textContent).toBe("0:01 / 0:01");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button[aria-label='发送录音']")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(store.sendVoiceMessage).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-im-voice-recording-overlay='true'][role='dialog']")).not.toBeNull();
    expect(container.querySelector<HTMLAudioElement>("audio[src='blob:conversation-room-voice']")).toBe(previewAudio);
    expect(container.querySelector("button[aria-label='删除录音']")).not.toBeNull();
    expect(container.querySelector("button[aria-label='重放录音']")).not.toBeNull();
    expect(container.querySelector("button[aria-label='发送录音']")).not.toBeNull();
    expect(container.querySelector<HTMLElement>("[data-im-composer-rich-input='true']")?.textContent).toBe("不要清空这段草稿");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button[aria-label='重放录音']")!.click();
      await Promise.resolve();
    });
    expect(play).toHaveBeenCalledTimes(2);
    expect(previewAudio!.currentTime).toBe(0);
    expect(container.querySelector("[data-im-voice-playback-time='true']")?.textContent).toBe("0:00 / 0:01");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button[aria-label='发送录音']")!.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(store.sendVoiceMessage).toHaveBeenCalledTimes(2);
    const firstSend = store.sendVoiceMessage.mock.calls[0]!;
    const secondSend = store.sendVoiceMessage.mock.calls[1]!;
    expect(firstSend[0]).toBe("conversation-room");
    expect(secondSend[0]).toBe("conversation-room");
    expect(firstSend[1]).toBeInstanceOf(Blob);
    expect(secondSend[1]).toBe(firstSend[1]);
    expect(firstSend[2]).toEqual({
      durationSeconds: 1,
      fileName: expect.stringMatching(/^voice-\d+\.webm$/),
    });
    expect(secondSend[2]).toEqual({
      durationSeconds: 1,
      fileName: expect.stringMatching(/^voice-\d+\.webm$/),
    });
    expect(container.querySelector("[data-im-voice-recording-overlay='true']")).toBeNull();
    expect(underlay.hasAttribute("inert")).toBe(false);
    expect(underlay.hasAttribute("aria-hidden")).toBe(false);
    expect(container.querySelector<HTMLElement>("[data-im-composer-rich-input='true']")?.textContent).toBe("不要清空这段草稿");
    expect(voiceButton).toBe(document.activeElement);
    expect(trackStop).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });
});
