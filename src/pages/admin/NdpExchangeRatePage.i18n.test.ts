// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ndpExchangeRateApi, type NdpExchangeRateOverview } from "../../api/ndpExchangeRate";
import { I18nProvider } from "../../i18n/I18nProvider";
import {
  languageLocales,
  translateTextForContext,
  translations,
  type Language
} from "../../i18n/translations";
import source from "./NdpExchangeRatePage.tsx?raw";
import { NdpExchangeRatePage } from "./NdpExchangeRatePage";

vi.mock("../../api/ndpExchangeRate", () => ({
  ndpExchangeRateApi: { getOverview: vi.fn(), publish: vi.fn() }
}));
vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => createElement("div", null, children)
}));
vi.mock("../../auth/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: ReactNode }) => createElement("div", null, children)
}));

const requiredPhrases = [
  "NDP 汇率",
  "按整数比例发布不可变汇率版本；订单结算会保存当时使用的正式快照。",
  "发布新汇率",
  "当前汇率",
  "计划汇率",
  "版本历史",
  "当前生效",
  "下一计划",
  "汇率数据加载失败",
  "版本冲突后最新数据刷新失败：",
  "正在加载汇率数据…",
  "当前没有生效汇率",
  "当前没有计划中的汇率",
  "重试只读数据",
  "NDP 数量",
  "JPY 数量",
  "生效时间",
  "设置理由",
  "确认发布内容",
  "发布确认",
  "确认并发布",
  "返回修改",
  "不可变版本历史",
  "时间状态以数据评估时间 {time} 为准。",
  "共 {total} 个版本",
  "时间状态",
  "汇率",
  "生效区间",
  "计划中",
  "暂无汇率版本记录",
  "NDP 数量必须是范围内的正整数",
  "JPY 数量必须是范围内的正整数",
  "请输入有效的生效时间",
  "设置理由必须包含可见文字，且不超过 500 个字符",
  "发布结果尚未确认，请保持内容不变后重试",
  "幂等键已用于其他发布内容，请修改后重试",
  "版本或生效时间链已变化，草稿已保留，请重新确认",
  "请求失败，请稍后重试"
] as const;

describe("NDP exchange-rate operations i18n", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    document.body.replaceChildren();
  });

  it("provides nonblank translations for every core operation phrase", () => {
    for (const phrase of requiredPhrases) {
      expect(translations[phrase], phrase).toMatchObject({
        "zh-Hant": expect.any(String),
        ja: expect.any(String),
        en: expect.any(String),
        ko: expect.any(String)
      });
      for (const value of Object.values(translations[phrase] ?? {})) {
        expect(value.trim(), phrase).not.toBe("");
      }
    }
  });

  it("keeps every visible phrase inside the five-language runtime", () => {
    expect(source).not.toContain("data-no-i18n");
  });

  it.each<Language>(["zh", "zh-Hant", "ja", "en", "ko"])(
    "renders complete evaluated-time, total-count, and pagination sentences in %s",
    async (language) => {
      const evaluatedAt = "2026-09-15T00:00:00.000Z";
      const overview: NdpExchangeRateOverview = {
        current: null,
        nextScheduled: null,
        latestVersion: 3,
        evaluatedAt,
        history: { list: [], total: 23, page: 1, page_size: 20 }
      };
      vi.mocked(ndpExchangeRateApi.getOverview).mockResolvedValue(overview);
      window.localStorage.setItem("needo.language", language);
      window.localStorage.setItem("needo.language.mode", "manual");
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(createElement(
          MemoryRouter,
          { initialEntries: ["/admin/settings/ndp-exchange-rate"] },
          createElement(I18nProvider, null, createElement(NdpExchangeRatePage))
        ));
        await Promise.resolve();
      });
      await act(async () => { await Promise.resolve(); });

      const replace = (sourceText: string, values: Record<string, string>) =>
        Object.entries(values).reduce(
          (text, [key, value]) => text.replace(`{${key}}`, value),
          translateTextForContext(sourceText, language, { portal: "admin" })
        );
      const expectedTime = new Date(evaluatedAt).toLocaleString(languageLocales[language]);
      expect(container.textContent).toContain(replace(
        "时间状态以数据评估时间 {time} 为准。",
        { time: expectedTime }
      ));
      expect(container.textContent).toContain(replace("共 {total} 个版本", { total: "23" }));
      expect(container.textContent).toContain(replace(
        "第 {current} / {total} 页",
        { current: "1", total: "2" }
      ));
      if (language !== "zh") {
        expect(container.textContent).not.toContain(`时间状态以数据评估时间 ${expectedTime} 为准。`);
        expect(container.textContent).not.toContain("共 23 个版本");
        expect(container.textContent).not.toContain("第 1 / 2 页");
      }

      act(() => root.unmount());
      container.remove();
    }
  );
});
