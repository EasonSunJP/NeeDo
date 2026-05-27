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
});
