import { describe, expect, it } from "vitest";
import { technicianAutomationTranslations } from "./automation-i18n";

describe("technician automation translations", () => {
  it("owns the next-cycle planning copy outside the base i18n map", () => {
    expect(technicianAutomationTranslations["下一周期确认"]?.ja).toBe("次周期の確認");
    expect(technicianAutomationTranslations["返回排班首页"]?.en).toBe("Back to schedule home");
    expect(technicianAutomationTranslations["查看反馈进度"]?.ko).toBe("피드백 진행 보기");
  });

  it("translates the historical bank transfer setting", () => {
    expect(technicianAutomationTranslations["银行转账（历史订单）"]).toMatchObject({
      "zh-Hant": expect.any(String),
      ja: expect.any(String),
      en: expect.any(String),
      ko: expect.any(String)
    });
  });
});
