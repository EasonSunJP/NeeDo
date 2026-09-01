import { describe, expect, it } from "vitest";
import { translations } from "../../i18n/translations";
import source from "./NdpExchangeRatePage.tsx?raw";

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
});
