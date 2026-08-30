/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import { ImScopeProvider } from "./scope";
import source from "./pages.tsx?raw";
import componentsSource from "./components.tsx?raw";

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

import { ImConversationRoomPage } from "./pages";

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
    deleteMessage: vi.fn(),
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
    status: "ready",
    ui: { drafts: {}, searchHistory: [] },
    users: [currentUser, partner],
    usersById: { [currentUser.id]: currentUser, [partner.id]: partner },
  };
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
    expect(profileSource).toContain("onClose={fromRequests");
    expect(profileSource).not.toContain("subtitle=");
    expect(profileSource).not.toContain("gradient");
  });

  it("uses the formal identity information card on the directory profile", () => {
    const start = source.indexOf("export function ImDirectoryProfilePage");
    const end = source.indexOf("export function ImContactDetailPage", start);
    const profileSource = source.slice(start, end);

    expect(profileSource).toContain("<ConversationIdentityProfileCard");
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

describe("IM automatic translation display wiring", () => {
  it("passes the confirmed room preference to message bubbles and pinned text previews", () => {
    const start = source.indexOf("export function ImConversationRoomPage");
    const end = source.indexOf("export function ImConversationInfoPage", start);
    const roomSource = source.slice(start, end);

    expect(roomSource).toContain("const messageTranslation = {");
    expect(roomSource).toContain("enabled: conversation?.autoTranslateMessages ?? false");
    expect(roomSource).toContain("language");
    expect(roomSource).toContain("translation={messageTranslation}");
    expect(roomSource).toContain("buildMessageDisplayPreview(");
    expect(roomSource).toContain("ImRuntimeI18nPreviewText");
  });

  it("translates only non-draft conversation previews at the page boundary", () => {
    const start = source.indexOf("export function ImConversationListPage");
    const end = source.indexOf("export function ImContactsListPage", start);
    const listSource = source.slice(start, end);

    expect(source).toContain("getImPreviewDisplayText(");
    expect(source).toContain("conversation.autoTranslateMessages");
    expect(source).toContain("preview.isDraft");
    expect(source).toContain("isImConversationPreviewTranslationEligible(conversation)");
    expect(source).toContain("isImConversationPreviewRuntimeProtected(conversation)");
    expect(source).toContain('conversation.type !== "system"');
    expect(source).not.toContain("isImUserGeneratedPreviewText");
    expect(listSource).toContain("buildConversationDisplayPreview(conversation, language)");
  });

  it("displays search results with the owning conversation preference without changing matching", () => {
    const start = source.indexOf("export function ImSearchPage");
    const end = source.indexOf("export function ImOrganizationContactsPage", start);
    const searchSource = source.slice(start, end);

    expect(searchSource).toContain("message.conversationId");
    expect(searchSource).toContain("buildMessageDisplayPreview(");
    expect(searchSource).toContain("ImRuntimeI18nPreviewText");
    expect(searchSource).toContain("store.search(deferredQuery, conversationId)");
  });

  it("uses the same authoritative structured preview for pinned messages", () => {
    const start = source.indexOf("export function ImConversationRoomPage");
    const end = source.indexOf("export function ImConversationInfoPage", start);
    const roomSource = source.slice(start, end);
    const pinnedStart = roomSource.indexOf("{pinnedMessages.map((message) => {");
    const pinnedEnd = roomSource.indexOf("})}", pinnedStart);
    const pinnedSource = roomSource.slice(pinnedStart, pinnedEnd);

    expect(pinnedSource).toContain("buildMessageDisplayPreview(");
    expect(pinnedSource).toContain("ImRuntimeI18nPreviewText");
  });

  it("copies displayed text while forward and recall continue to use the stored message", () => {
    const start = source.indexOf("export function ImConversationRoomPage");
    const end = source.indexOf("export function ImConversationInfoPage", start);
    const roomSource = source.slice(start, end);

    expect(roomSource).toContain("getImMessageCopyText(message, selectedContent, messageTranslation)");
    expect(source).toContain("store.forwardMessage(forwardMessageId, conversation.id)");
    expect(roomSource).toContain("restoreImComposerDraft(message.content, message.ext?.richText)");
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

describe("ImConversationRoomPage voice recording integration", () => {
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
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: trackStop }],
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
