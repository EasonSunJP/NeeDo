import { afterEach, describe, expect, it, vi } from "vitest";
import {
  autoTranslatePlanCategoryDraft,
  createInitialPlanWizardFlatRatePayoutDraft,
  planWizardFlatRatePayoutItems,
  planWizardPayoutValueModeOptions,
  planWizardSteps,
  translatePlanCategoryDraft,
  type PlanWizardLocalizedText
} from "./model";

function getCategoryOptions() {
  return planWizardSteps.flatMap((step) => step.fields).find((field) => field.key === "category")?.options ?? [];
}

describe("business CPS plan category translation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("fills the other category languages from the existing category dictionary", () => {
    const translated = autoTranslatePlanCategoryDraft(
      { ja: "", en: "", ko: "", "zh-Hant": "", zh: "软件 / SaaS" },
      getCategoryOptions()
    );

    expect(translated.ja).toBe("ソフトウェア / SaaS");
    expect(translated.en).toBe("Software / SaaS");
    expect(translated.ko).toBe("소프트웨어 / SaaS");
    expect(translated["zh-Hant"]).toBe("軟體 / SaaS");
    expect(translated.zh).toBe("软件 / SaaS");
  });

  it("uses the translation API response to fill arbitrary category text", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        translations: {
          ja: "テストカテゴリ",
          en: "Test category",
          ko: "테스트 카테고리",
          "zh-Hant": "測試類別",
          zh: "测试类别"
        }
      })
    } as Response);
    const draft: PlanWizardLocalizedText = { ja: "", en: "", ko: "", "zh-Hant": "", zh: "测试类别" };
    const translated = await translatePlanCategoryDraft(draft, getCategoryOptions());

    expect(fetchMock).toHaveBeenCalled();
    expect(translated.ja).toBe("テストカテゴリ");
    expect(translated.en).toBe("Test category");
    expect(translated.ko).toBe("테스트 카테고리");
    expect(translated["zh-Hant"]).toBe("測試類別");
    expect(translated.zh).toBe("测试类别");
  });

  it("fills arbitrary category text locally in static demo mode without calling translation APIs", async () => {
    vi.stubEnv("VITE_NEEDO_STATIC_DEMO", "true");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const draft: PlanWizardLocalizedText = { ja: "", en: "", ko: "", "zh-Hant": "", zh: "线下体验联动" };
    const translated = await translatePlanCategoryDraft(draft, []);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(translated).toMatchObject({
      ja: "线下体验联动",
      en: "线下体验联动",
      ko: "线下体验联动",
      "zh-Hant": "线下体验联动",
      zh: "线下体验联动"
    });
  });
});

describe("business CPS flat-rate payout fields", () => {
  it("uses fixed finance-ready fields with amount or percentage mode", () => {
    const field = planWizardSteps
      .flatMap((step) => step.fields)
      .find((item) => item.key === "flatRatePayout");
    const hasStandalonePercentageField = planWizardSteps
      .flatMap((step) => step.fields)
      .some((item) => item.label.zh.includes("百分比抽成"));
    const draft = createInitialPlanWizardFlatRatePayoutDraft();

    expect(field?.inputType).toBe("number");
    expect(field?.label.zh).toBe("金额和抽成");
    expect(hasStandalonePercentageField).toBe(false);
    expect(planWizardSteps[2].fields.map((item) => item.key ?? item.label.zh)).toEqual(["计费模式", "售后验证期 (Hold Period)", "flatRatePayout"]);
    expect(planWizardSteps[2].fields[0]?.options?.map((item) => item.zh)).toEqual(["CPS（依成交付费）", "CPA（依动作付费）"]);
    expect(planWizardFlatRatePayoutItems.map((item) => item.key)).toEqual(["firstOrder", "periodOrder", "periodSpend"]);
    expect(planWizardPayoutValueModeOptions.map((item) => item.value)).toEqual(["amount", "percentage"]);
    expect(draft.firstOrder.mode).toBe("amount");
    expect(draft.firstOrder.amountValue).toBe("1000");
    expect(draft.firstOrder.percentageValue).toBe("10");
    expect(draft.periodOrder.period).toBe("90");
    expect(draft.periodSpend.period).toBe("forever");
  });
});
