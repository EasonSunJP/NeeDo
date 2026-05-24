import { describe, expect, it } from "vitest";
import { imConversationQuickSearchItems } from "./pages";

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
});
