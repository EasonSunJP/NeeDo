import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ImContactActivityEntry, getConversationInfoStartChatTarget, imConversationQuickSearchItems } from "./pages";
import { getImRoleConfig } from "./role-config";
import pagesSource from "./pages.tsx?raw";

describe("IM pages", () => {
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
    expect(componentSource).toContain('aria-live="assertive"');
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
