import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";

describe("identity application translations", () => {
  it("localizes the legal and bank-name rules without losing their meaning", () => {
    expect(translateText("确认并开启", "ja")).toBe("確認して有効化");
    expect(translateText("法人名义申请时，银行账户名义必须与法人名称一致。", "en")).toContain("must match");
    expect(translateText("个人名义申请时，银行账户名义必须与 eKYC 姓名一致。", "ja")).toContain("eKYC");
  });

  it("keeps the exact 15-day boundary in every supported non-Chinese locale", () => {
    const source = "试用期计算：开启日当月剩余少于 15 天时，自动额外增加同等剩余天数；剩余正好 15 天或大于 15 天时，当月计为试用第一个月。";
    expect(translateText(source, "ja")).toContain("ちょうど15日");
    expect(translateText(source, "en")).toContain("exactly 15");
    expect(translateText(source, "ko")).toContain("정확히 15일");
    expect(translateText(source, "zh-Hant")).toContain("正好 15 天");
  });
});
