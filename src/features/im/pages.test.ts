import { describe, expect, it } from "vitest";
import { getConversationInfoStartChatTarget, imConversationQuickSearchItems } from "./pages";
import { getImRoleConfig } from "./role-config";
import pagesSource from "./pages.tsx?raw";

describe("IM pages", () => {
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
