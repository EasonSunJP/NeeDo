import { describe, expect, it } from "vitest";
import { translateText, type Language } from "../../i18n/translations";
import { shopAnalyticsTranslations } from "./i18n";
import "./registerI18n";

const expectedSources = [
  "搜索今日预约",
  "搜索预约、客户、员工、状态",
  "今日预约时间线",
  "正在加载今日预约",
  "本店今日预约加载失败",
  "没有匹配的今日预约",
  "查看今日预约",
  "查看营业额",
  "查询营业额日期",
  "请选择开始日期和结束日期",
  "开始日期不能晚于结束日期",
  "选择数据期间"
] as const;

describe("shop analytics translations", () => {
  it("keeps every extracted merchant dashboard entry complete", () => {
    expect(Object.keys(shopAnalyticsTranslations).sort()).toEqual([...expectedSources].sort());

    for (const source of expectedSources) {
      for (const language of ["zh-Hant", "ja", "en", "ko"] as const satisfies readonly Language[]) {
        expect(shopAnalyticsTranslations[source]?.[language], `${source}:${language}`).toBeTruthy();
      }
    }
  });

  it("registers the split feature copy before a merchant dashboard renders", () => {
    expect(translateText("搜索今日预约", "ja")).toBe("本日の予約を検索");
    expect(translateText("选择数据期间", "en")).toBe("Select data period");
  });
});
