import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";
import { identityApplicationTranslations } from "./i18n";

describe("identity application translations", () => {
  it("localizes the seven-section merchant form and its validation copy", () => {
    const sources = ["名义", "基础信息", "申请人", "请输入申请人姓名", "本人确认（eKYC）", "已本人确认", "费用区间", "最低费用", "最高费用", "请完整填写费用区间", "最低费用不能高于最高费用", "店铺简介", "上传店铺第一张展示图", "选择图片", "主页效果预览",
      "选择以个人或法人主体提交店铺申请。", "填写申请人与店铺的正式联系资料。", "填写主页展示的最低与最高服务费用。", "简介会显示在店铺主页。", "支持 JPEG 或 PNG，并作为主页第一张展示图。", "按照店铺主页的正式组件实时预览申请资料。"];
    for (const language of ["zh-Hant", "ja", "en", "ko"] as const) {
      for (const source of sources) expect(identityApplicationTranslations[source]?.[language], `${language}: ${source}`).toBeTruthy();
      expect(translateText("申请人", language)).not.toBe("申请人");
      expect(translateText("费用区间", language)).not.toBe("费用区间");
      expect(translateText("本人确认（eKYC）", language)).toContain("eKYC");
    }
  });

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
