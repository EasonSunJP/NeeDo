import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import { ImChatComposer } from "./components";
import {
  ImContactActivityEntry,
  ImConversationUnavailableState,
  getConversationInfoStartChatTarget,
  imConversationQuickSearchItems,
  isConversationNotFoundError
} from "./pages";
import { getImHomeRoute, getImRoleConfig } from "./role-config";
import pagesSource from "./pages.tsx?raw";
import componentsSource from "./components.tsx?raw";
const stylesSource = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("IM pages", () => {
  it("keeps the unavailable chat composer visible while natively disabling every control", () => {
    const markup = renderToStaticMarkup(
      createElement(ImChatComposer, {
        disabled: true,
        draft: "",
        isNight: true,
        onDraftChange: () => undefined,
        onPanelChange: () => undefined,
        onSend: () => undefined,
        panel: null
      })
    );

    expect(markup).toContain('data-im-composer-disabled="true"');
    expect(markup).toContain('data-im-composer-control="voice-input"');
    expect(markup).toContain('data-im-composer-control="emoji-chat"');
    expect(markup).toContain('placeholder="发送消息"');
    expect(markup.match(/disabled=""/g)).toHaveLength(4);
  });

  it("recognizes only formal and legacy inaccessible-conversation errors", () => {
    expect(isConversationNotFoundError(new Error("error.realtime.conversation_not_found"))).toBe(true);
    expect(isConversationNotFoundError(new Error("Conversation not found"))).toBe(true);
    expect(isConversationNotFoundError(new Error("error.network.timeout"))).toBe(false);
    expect(isConversationNotFoundError(new Error("Conversation not found after timeout"))).toBe(false);
    expect(isConversationNotFoundError("error.realtime.conversation_not_found")).toBe(false);
  });

  it("renders an empty inert chat underlay below one clear invalid-chat prompt", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          ClientThemeProvider,
          null,
          createElement(ImConversationUnavailableState, { onReturnHome: () => undefined })
        )
      )
    );

    expect(markup).toContain('data-im-conversation-unavailable-underlay="true"');
    expect(markup).toContain('inert=""');
    expect(markup).toContain("im-conversation-wallpaper");
    expect(markup).toContain('data-im-composer-disabled="true"');
    expect(markup).toContain('data-im-conversation-unavailable-scrim="true"');
    expect(markup).toContain("backdrop-blur-[4px]");
    expect(markup).toContain('data-im-conversation-unavailable-dialog="true"');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("无效聊天，无法进入");
    expect(markup).toContain("该对话可能不存在、已被删除，或当前账号无权访问。");
    expect(markup.match(/返回首页/g)).toHaveLength(1);
    expect(markup).not.toContain("找不到会话");
    expect(markup).not.toContain("会话可能已被删除");
    expect(markup).not.toContain('aria-label="更多"');
    expect(markup).not.toContain("im-conversation-scroll");
  });

  it("returns each IM portal to its scoped home route", () => {
    expect(getImHomeRoute("user")).toBe("/");
    expect(getImHomeRoute("merchant")).toBe("/merchant");
    expect(getImHomeRoute("technician")).toBe("/technician");
  });

  it("keeps an inaccessible conversation in a monotonic route-local state", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationRoomPage");
    const componentEnd = pagesSource.indexOf("export function ImConversationInfoPage", componentStart);
    const componentSource = pagesSource.slice(componentStart, componentEnd);
    const unavailableStateIndex = componentSource.indexOf('conversationRouteStatus === "unavailable"');
    const missingConversationIndex = componentSource.indexOf("if (!conversation)");

    expect(componentSource).toContain(
      'useState<"loading" | "ready" | "unavailable">("loading")'
    );
    expect(componentSource).toContain("let conversationRequestUnavailable = false");
    expect(componentSource).toContain("conversationRequestUnavailable = true");
    expect(componentSource).toContain('setConversationRouteStatus("unavailable")');
    expect(componentSource).toContain("!conversationRequestUnavailable");
    expect(componentSource).toContain("<ImConversationUnavailableState");
    expect(componentSource).toContain("navigate(getImHomeRoute(scope), { replace: true })");
    expect(componentSource).not.toContain("navigate(config.routes.messages, { replace: true });");
    expect(unavailableStateIndex).toBeGreaterThan(-1);
    expect(missingConversationIndex).toBeGreaterThan(unavailableStateIndex);
  });

  it("renders the recent friend activity state as a text-only link", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(ImContactActivityEntry, {
          status: "recent_posts",
          to: "/moments/users/237"
        })
      )
    );

    expect(markup).toContain('href="/moments/users/237"');
    expect(markup).toContain("前往好友的动态页");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<video");
  });

  it("renders the no-recent-post state as the same clickable text-only entry", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(ImContactActivityEntry, {
          status: "no_recent_posts",
          to: "/moments/users/237"
        })
      )
    );

    expect(markup).toContain('href="/moments/users/237"');
    expect(markup).toContain("好友近期无动态");
    expect(markup).not.toContain("暂无动态");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<video");
  });

  it("places the friend activity entry immediately after the contact tags section", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationInfoPage");
    const componentEnd = pagesSource.indexOf("export function ImConversationSearchPage", componentStart);
    const componentSource = pagesSource.slice(componentStart, componentEnd);
    const tagsIndex = componentSource.indexOf('>标签</h2>');
    const activityIndex = componentSource.indexOf("<ImContactActivityEntry");

    expect(tagsIndex).toBeGreaterThan(-1);
    expect(activityIndex).toBeGreaterThan(tagsIndex);
    expect(componentSource.slice(tagsIndex, activityIndex)).toContain("</section>");
    expect(componentSource).not.toContain("ImContactMomentsEntry");
    expect(componentSource).not.toContain("infoSocialPreviewMedia");
  });

  it("defines icon-backed quick search entries for conversation search", () => {
    expect(imConversationQuickSearchItems.map((item) => item.label)).toEqual([
      "群成员",
      "日",
      "图片和视频",
      "文件",
      "URL",
      "音乐和音频",
      "交易",
      "小程序",
      "频道",
      "从联系人卡片添加",
      "地点",
      "笔记",
      "商品和店铺",
      "礼物",
      "贴纸"
    ]);
    expect(imConversationQuickSearchItems.every((item) => item.icon)).toBe(true);
  });

  it("resolves the fixed start-chat action only for single-contact info pages", () => {
    const config = getImRoleConfig("user");

    expect(getConversationInfoStartChatTarget(config, { id: "conversation-amy", type: "single" })).toBe("/messages/conversation-amy");
    expect(getConversationInfoStartChatTarget(config, { id: "conversation-group", type: "group" })).toBeUndefined();
    expect(getConversationInfoStartChatTarget(config, undefined)).toBeUndefined();
  });

  it("keeps chat and contact home pages from adding document-level bottom scroll padding", () => {
    const fixedShellMatches = pagesSource.match(/<MobileShell className="!pb-0 overflow-hidden" navItems=\{config\.navItems\} showTopEdgeMask=\{false\}>/g) ?? [];

    expect(fixedShellMatches).toHaveLength(2);
  });

  it("keeps chat and contact home headers compact without current-user profile cards", () => {
    const messagesStart = pagesSource.indexOf("export function ImConversationListPage");
    const contactsStart = pagesSource.indexOf("export function ImContactsListPage");
    const nextPageStart = pagesSource.indexOf("export function ImFriendRequestsPage");
    const messagesSource = pagesSource.slice(messagesStart, contactsStart);
    const contactsSource = pagesSource.slice(contactsStart, nextPageStart);

    expect(messagesSource).toContain("compactHeader");
    expect(contactsSource).toContain("compactHeader");
    expect(messagesSource).not.toContain("ImCurrentActorHeader");
    expect(contactsSource).not.toContain("ImCurrentActorHeader");
    expect(pagesSource).not.toContain("function ImCurrentActorHeader");
  });

  it("drives both friend-request entry state and message failure copy from formal state", () => {
    expect(pagesSource).toContain("getIncomingPendingFriendRequestCount(");
    expect(pagesSource).toContain("selectLatestFriendRequestsByCounterpart(");
    expect(pagesSource).toContain("config.routes.directoryProfile(counterpartId)");
    expect(componentsSource).toContain('message.failureReason === "not_friends"');
    expect(componentsSource).toContain("对方不是你的好友，信息发送失败");
  });

  it("lets conversation wallpaper sit behind the fixed glass top bar", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationRoomPage");
    const componentEnd = pagesSource.indexOf("function ImMessageSelectionHandles");
    const componentSource = pagesSource.slice(componentStart, componentEnd);

    expect(componentSource).toContain("centerTitle");
    expect(componentSource).toContain('className="im-conversation-glass-header"');
    expect(componentSource).toContain("fixed");
    expect(componentSource).toContain("pt-[calc(env(safe-area-inset-top)+70px)]");
    expect(componentSource).toContain("im-conversation-wallpaper pointer-events-none absolute inset-0");
  });

  it("keeps the message viewport behind both glass bars while preserving terminal insets", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationRoomPage");
    const componentEnd = pagesSource.indexOf("function ImMessageSelectionHandles");
    const componentSource = pagesSource.slice(componentStart, componentEnd);

    expect(componentSource).toContain('data-im-conversation-layout="true"');
    expect(componentSource).toContain("im-conversation-scroll--glass-underlay");
    expect(componentsSource).toContain("const composerRootRef = useRef<HTMLDivElement | null>(null)");
    expect(componentsSource).toContain("new ResizeObserver(updateComposerInset)");
    expect(componentsSource).toContain("--im-composer-overlay-height");
    expect(componentSource).toContain("const keepTerminalMessageAboveComposer = () =>");
    expect(componentSource).toContain("listWasNearBottomRef.current");
    expect(componentSource).toContain('list.addEventListener("load", keepTerminalMessageAboveComposer, true)');
    expect(componentSource).toContain('list.addEventListener("loadedmetadata", keepTerminalMessageAboveComposer, true)');
  });

  it("shows one return-to-latest control when the terminal message position is outside the viewport", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationRoomPage");
    const componentEnd = pagesSource.indexOf("function ImMessageSelectionHandles");
    const componentSource = pagesSource.slice(componentStart, componentEnd);

    expect(componentSource).toContain('data-im-latest-position="true"');
    expect(componentSource).toContain("observeImLatestPosition");
    expect(componentSource).toContain("!latestPositionVisible && !menuState && !mediaPreview");
    expect(componentSource).toContain("getImReturnScrollBehavior()");
    expect(componentSource).not.toContain("条新消息");
  });

  it("uses confirmed standard recall and restores text only after success", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationRoomPage");
    const componentEnd = pagesSource.indexOf("function ImMessageSelectionHandles");
    const componentSource = pagesSource.slice(componentStart, componentEnd);
    const recallStart = componentSource.indexOf(
      "const recallMessage = (message: ConversationMessage) =>",
    );
    const actionsStart = componentSource.indexOf(
      "const createMessageActions",
      recallStart,
    );
    const recallSource = componentSource.slice(recallStart, actionsStart);

    expect(componentSource).not.toContain("messageRecallTraceThresholdMs");
    expect(recallSource).not.toContain("setHiddenMessageIds");
    expect(recallSource).toContain(
      'store.recallMessage(message.conversationId, message.id, "standard")',
    );
    expect(recallSource).toContain(".then(() => {");
    expect(recallSource).toContain("message.type === \"text\" ? message.content : \"\"");
    expect(recallSource).toContain("if (mediaPreview?.id === message.id)");
    expect(recallSource).toContain("setMediaPreview(null)");
    expect(recallSource.indexOf("setDraft(originalContent)")).toBeGreaterThan(
      recallSource.indexOf(".then(() => {"),
    );
    expect(recallSource).toContain("store.setDraft(conversationId, originalContent)");
    expect(recallSource).toContain("textareaRef.current?.focus()");
    expect(recallSource).toContain(
      "textareaRef.current?.setSelectionRange(originalContent.length, originalContent.length)",
    );
    expect(recallSource).toContain("发送超过3分钟后无法撤回");
    expect(recallSource).toContain("撤回失败，请稍后重试");
    const recallFailureStart = recallSource.indexOf(".catch((error: unknown) => {");
    const recallFailureEnd = recallSource.indexOf(".finally(", recallFailureStart);
    const recallFailureSource = recallSource.slice(recallFailureStart, recallFailureEnd);
    expect(recallFailureStart).toBeGreaterThan(-1);
    expect(recallFailureEnd).toBeGreaterThan(recallFailureStart);
    expect(recallFailureSource).toContain("closeMessageMenu();");
    expect(componentSource).toContain('aria-live="assertive"');
  });

  it("persists single-message deletion before removing the local bubble", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationRoomPage");
    const componentEnd = pagesSource.indexOf("function ImMessageSelectionHandles");
    const componentSource = pagesSource.slice(componentStart, componentEnd);
    const actionStart = componentSource.indexOf('key: "delete-local"');
    const actionEnd = componentSource.indexOf("return { primaryActions", actionStart);
    const actionSource = componentSource.slice(actionStart, actionEnd);

    expect(actionStart).toBeGreaterThan(-1);
    expect(actionSource).toContain("store.deleteMessage(message.conversationId, message.id)");
    expect(actionSource).toContain(".then(() => {");
    expect(actionSource).not.toContain("setHiddenMessageIds");
  });

  it("opens media in a full-screen zoomable viewer with download and forwarding", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationRoomPage");
    const componentEnd = pagesSource.indexOf("function ImMessageSelectionHandles");
    const componentSource = pagesSource.slice(componentStart, componentEnd);

    expect(pagesSource).toContain('import { createPortal } from "react-dom";');
    expect(componentSource).toContain('data-testid="im-media-viewer"');
    expect(componentSource).toContain('role="dialog"');
    expect(componentSource).toContain('aria-modal="true"');
    expect(componentSource).toContain("createPortal(");
    expect(componentSource).toContain('document.querySelector<HTMLElement>(".client-shell") ?? document.body');
    expect(componentSource).toContain("isolate");
    expect(componentSource).toContain("bg-black text-white");
    expect(componentSource).not.toContain("bg-black/96");
    expect(componentSource).toContain("object-contain");
    expect(componentSource).toContain("mediaPreviewScale");
    expect(componentSource).toContain("Math.min(4");
    expect(componentSource).toContain("Math.max(1");
    expect(componentSource).toContain("download={mediaPreview.ext?.fileName");
    expect(componentSource).toContain('mode: "forward"');
    expect(componentSource).toContain("messageId: mediaPreview.id");
    expect(componentSource).toContain("<video");
  });

  it("anchors the long-press action menu to the selected message instead of the composer edge", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationRoomPage");
    const componentEnd = pagesSource.indexOf("function ImMessageSelectionHandles");
    const componentSource = pagesSource.slice(componentStart, componentEnd);

    expect(componentSource).toContain("anchorElement={messageRefs.current[menuState.message.id]}");
    expect(componentSource).not.toContain('scrollIntoView({ block: "end", behavior: "smooth" })');
    expect(componentsSource).toContain("anchorElement: HTMLElement | null;");
    expect(componentsSource).toContain("anchorElement.getBoundingClientRect()");
    expect(componentsSource).toContain('position: "fixed"');
    expect(componentsSource).toContain('placement: "above"');
    expect(componentsSource).toContain('document.querySelector<HTMLElement>(".client-shell") ?? document.body');
    expect(componentsSource).toContain("createPortal(actionMenu, portalTarget)");
    expect(componentsSource).not.toContain('style={{ height: expanded ? "min(76dvh, 620px)" : "min(43dvh, 360px)" }}');
  });

  it("does not render a bottom divider beneath the pinned-message tray", () => {
    const trayStart = pagesSource.indexOf("{pinnedMessages.length > 0 ? (");
    const sectionStart = pagesSource.indexOf("<section", trayStart);
    const sectionEnd = pagesSource.indexOf(">", sectionStart);
    const sectionOpening = pagesSource.slice(sectionStart, sectionEnd);
    const rowStart = pagesSource.indexOf('<div className="im-pinned-message-container', sectionEnd);
    const rowEnd = pagesSource.indexOf(">", rowStart);
    const rowOpening = pagesSource.slice(rowStart, rowEnd);

    expect(trayStart).toBeGreaterThan(-1);
    expect(sectionStart).toBeGreaterThan(trayStart);
    expect(sectionEnd).toBeGreaterThan(sectionStart);
    expect(sectionOpening).not.toContain("border-b");
    expect(sectionOpening).toContain("z-20");
    expect(sectionOpening).toContain("absolute inset-x-0");
    expect(sectionOpening).toContain("im-pinned-message-tray");
    expect(rowOpening).not.toContain("bg-");
    expect(rowOpening).toContain("im-pinned-message-container");
    expect(stylesSource).toContain(".im-pinned-message-container");
    expect(stylesSource).toContain("var(--client-elevated) 50%");
    expect(stylesSource).toContain("backdrop-filter: blur(12px)");
  });

  it("does not expose legacy message actions that only close the menu", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationRoomPage");
    const componentEnd = pagesSource.indexOf("function ImMessageSelectionHandles");
    const componentSource = pagesSource.slice(componentStart, componentEnd);
    const actionStart = componentSource.indexOf("const createMessageActions");
    const actionEnd = componentSource.indexOf("const availableMoreActions", actionStart);
    const actionSource = componentSource.slice(actionStart, actionEnd);

    expect(actionSource).not.toContain('key: "translate"');
    expect(actionSource).not.toContain('key: "multi-select"');
    expect(actionSource).not.toContain("onClick: closeMessageMenu");
    expect(componentSource).toContain('setActionNotice("已复制")');
    expect(componentSource).toContain('setActionNotice("复制失败，请重试")');
  });

  it("routes quick reactions through the store and suppresses duplicate in-flight taps", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationRoomPage");
    const componentEnd = pagesSource.indexOf("function ImMessageSelectionHandles");
    const componentSource = pagesSource.slice(componentStart, componentEnd);

    expect(componentSource).toContain("const reactionPendingKeysRef = useRef(new Set<string>());");
    expect(componentSource).toContain("if (reactionPendingKeysRef.current.has(pendingKey))");
    expect(componentSource).toContain(".setMessageReaction(conversationId, message.id, reaction, !reactedByMe)");
    expect(componentSource).not.toContain("void api\n      .setMessageReaction");
  });

  it("always suppresses the native desktop context menu before preserving a message text selection", () => {
    const componentStart = pagesSource.indexOf("function MessagePressable");
    const componentEnd = pagesSource.indexOf("function ImQuickMenuItem", componentStart);
    const componentSource = pagesSource.slice(componentStart, componentEnd);
    const contextMenuStart = componentSource.indexOf("onContextMenu={(event) => {");
    const contextMenuEnd = componentSource.indexOf("onPointerCancel", contextMenuStart);
    const contextMenuSource = componentSource.slice(contextMenuStart, contextMenuEnd);

    expect(contextMenuStart).toBeGreaterThan(-1);
    expect(contextMenuSource.indexOf("event.preventDefault()"))
      .toBeLessThan(contextMenuSource.indexOf("hasActiveImMessageTextSelection"));
  });

  it("keeps portal action-sheet pointer events out of the conversation dismissal path", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationRoomPage");
    const componentEnd = pagesSource.indexOf("function ImMessageSelectionHandles");
    const componentSource = pagesSource.slice(componentStart, componentEnd);
    const handlerStart = componentSource.indexOf("const handleConversationPointerDownCapture");
    const handlerEnd = componentSource.indexOf("const selectMessageText", handlerStart);
    const handlerSource = componentSource.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThan(-1);
    expect(handlerSource).toContain("event.nativeEvent.composedPath()");
    expect(handlerSource).toContain("[data-im-message-action-sheet='true']");
    expect(handlerSource).toContain("[data-im-composer-root='true']");
  });

  it("handles privacy-save and leave failures inside the settings page instead of crashing the app", () => {
    expect(pagesSource).toContain('showInfoToast("隐私模式设置已保存")');
    expect(pagesSource).toContain('showInfoToast("隐私模式设置失败，请稍后重试")');
    expect(pagesSource).toContain('showInfoToast("退出群聊失败，请稍后重试")');
  });

  it("requires an owner successor, offers dissolution, and lets ordinary members leave directly", () => {
    expect(pagesSource).toContain("转让群主并退出");
    expect(pagesSource).toContain("选择新群主");
    expect(pagesSource).toContain("解散群聊");
    expect(pagesSource).toContain("store.dissolveConversation(conversation.id)");
    expect(pagesSource).toContain("store.removeConversationMember(");
    expect(pagesSource).toContain("transferOwnerUserId,");
    expect(pagesSource).toContain("群成员不足 2 人时将自动解散");
  });

  it("renders eight recent emojis before a scrollable complete emoji catalog", () => {
    expect(componentsSource).toContain("loadRecentImEmojis");
    expect(componentsSource).toContain("recordRecentImEmoji");
    expect(componentsSource).toContain("saveRecentImEmojis");
    expect(componentsSource).toContain("最近使用");
    expect(componentsSource).toContain("所有表情");
    expect(componentsSource).toContain("recentEmojis.map");
    expect(componentsSource).toContain("IM_COMMON_EMOJIS.map");
  });

  it("renders recall failures as a prominent alert above the composer", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationRoomPage");
    const componentEnd = pagesSource.indexOf("function ImMessageSelectionHandles");
    const componentSource = pagesSource.slice(componentStart, componentEnd);
    const noticeStart = componentSource.indexOf("{actionNotice ? (");
    const menuStart = componentSource.indexOf("{menuState ? (", noticeStart);
    const noticeSource = componentSource.slice(noticeStart, menuStart);

    expect(noticeStart).toBeGreaterThan(-1);
    expect(menuStart).toBeGreaterThan(noticeStart);
    expect(noticeSource).toContain('role="alert"');
    expect(noticeSource).toContain('data-testid="im-conversation-action-notice"');
    expect(noticeSource).toContain("pointer-events-none absolute inset-x-0");
    expect(noticeSource).toContain("z-40");
    expect(noticeSource).toContain("text-sm");
    expect(noticeSource).not.toContain("recordingHintClass");
  });

  it("keeps the composer mounted while message actions are open and hides it only for fullscreen media", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationRoomPage");
    const componentEnd = pagesSource.indexOf("function ImMessageSelectionHandles", componentStart);
    const componentSource = pagesSource.slice(componentStart, componentEnd);
    const openMenuStart = componentSource.indexOf("const openMessageMenu =");
    const openMenuEnd = componentSource.indexOf("const toggleMessageReaction", openMenuStart);
    const openMenuSource = componentSource.slice(openMenuStart, openMenuEnd);
    const menuStart = componentSource.indexOf("{menuState ? (");
    const composerGateStart = componentSource.indexOf("{!mediaPreview ? (", menuStart);
    const mediaViewerStart = componentSource.indexOf("{mediaPreview && typeof document", composerGateStart);
    const composerSource = componentSource.slice(composerGateStart, mediaViewerStart);

    expect(openMenuStart).toBeGreaterThan(-1);
    expect(openMenuSource).not.toContain("setPanel(null)");
    expect(openMenuSource).not.toContain("setVoiceMode(false)");
    expect(menuStart).toBeGreaterThan(-1);
    expect(composerGateStart).toBeGreaterThan(menuStart);
    expect(componentSource.slice(menuStart, composerGateStart)).toContain(") : null}");
    expect(composerSource).toContain("<ImChatComposer");
    expect(composerSource).toContain("quotedMessage ?");
  });

  it("uses the same media-aware preview for the reply composer instead of exposing attachment URLs", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationRoomPage");
    const componentEnd = pagesSource.indexOf("function ImMessageSelectionHandles", componentStart);
    const componentSource = pagesSource.slice(componentStart, componentEnd);
    const quotedBarStart = componentSource.indexOf("{quotedMessage ? (");
    const composerStart = componentSource.indexOf("<ImChatComposer", quotedBarStart);
    const quotedBarSource = componentSource.slice(quotedBarStart, composerStart);

    expect(quotedBarSource).toContain("<ImQuotedMessagePreview message={quotedMessage} />");
    expect(quotedBarSource).not.toContain('quotedMessage.content || "媒体消息"');
  });

  it("stages a selected image in the composer and uploads it only when the combined message is sent", () => {
    const componentStart = pagesSource.indexOf("export function ImConversationRoomPage");
    const componentEnd = pagesSource.indexOf("function ImMessageSelectionHandles", componentStart);
    const componentSource = pagesSource.slice(componentStart, componentEnd);

    expect(componentSource).toContain("const [pendingImage, setPendingImage]");
    expect(componentSource).toContain("const prepareSelectedImage = async (file?: File) =>");
    expect(componentSource).not.toContain("const sendSelectedImage = async (file?: File) =>");
    expect(componentSource).toContain("pendingImage={pendingImage}");
    expect(componentSource).toContain("onRemovePendingImage={clearPendingImage}");
    expect(componentSource).toContain("const upload = await api.uploadImage(conversationId, pendingImage.file)");
    expect(componentSource).toContain("caption: messageText || undefined");
    expect(componentSource).toContain("void prepareSelectedImage(file)");
  });

  it("keeps the hide member profiles switch independent from privacy mode in group creation", () => {
    const componentStart = pagesSource.indexOf("export function ImNewConversationPage");
    const componentEnd = pagesSource.length;
    const componentSource = pagesSource.slice(componentStart, componentEnd);
    const privacyConditionIndex = componentSource.indexOf("{privacyModeEnabled ? (");
    const hideProfilesSwitchIndex = componentSource.indexOf("是否隐藏成员名称和资料");

    expect(privacyConditionIndex).toBeGreaterThan(-1);
    expect(hideProfilesSwitchIndex).toBeGreaterThan(-1);
    expect(hideProfilesSwitchIndex).toBeLessThan(privacyConditionIndex);
    expect(componentSource).not.toContain("setHideMemberProfilesEnabled(false)");
    expect(componentSource).not.toContain("rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-bg)_46%,transparent)] px-3 py-3");
    expect(componentSource).toContain('<ToggleSwitch ariaLabel="是否隐藏成员名称和资料" checked={hideMemberProfilesEnabled} onChange={setHideMemberProfilesEnabled} size="md" />');
    expect(componentSource).toContain("privacyModeEnabled || hideMemberProfilesEnabled");
  });
});
