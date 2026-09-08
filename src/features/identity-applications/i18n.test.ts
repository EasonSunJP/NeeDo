import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";
import { identityApplicationTranslations } from "./i18n";

describe("identity application translations", () => {
  it.each([
    ["zh-Hant", "店鋪申請草稿已變更。本頁未儲存的資料已保留，請複製後重新開啟申請。"],
    ["ja", "店舗申請の下書きが変更されています。このページの未保存の内容は保持されています。内容をコピーしてから申請を開き直してください。"],
    ["en", "The shop application draft has changed. Your unsaved details are preserved on this page. Copy them before reopening the application."],
    ["ko", "매장 신청 초안이 변경되었습니다. 이 페이지의 저장되지 않은 내용은 유지됩니다. 내용을 복사한 후 신청을 다시 열어 주세요."]
  ] as const)("resolves the retained application conflict message in %s", (language, expected) => {
    expect(translateText("店铺申请草稿已发生变更。本页未保存资料已保留，请复制后重新打开申请。", language)).toBe(expected);
  });

  it.each([
    ["zh-Hant", "選擇店鋪展示圖", "{title}說明"],
    ["ja", "店舗画像を選択", "{title}の説明"],
    ["en", "Choose shop image", "About {title}"],
    ["ko", "매장 이미지 선택", "{title} 안내"]
  ] as const)("resolves scoped application labels in %s through the global translator", (language, upload, section) => {
    expect.soft(translateText("选择店铺展示图", language)).toBe(upload);
    expect.soft(translateText("申请分区说明：{title}", language)).toBe(section);
  });

  it("localizes the seven-section merchant form and its validation copy", () => {
    const sources = ["名义", "基础信息", "申请人", "请输入申请人姓名", "本人确认（eKYC）", "已本人确认", "费用区间", "最低费用", "最高费用", "请完整填写费用区间", "最低费用不能高于最高费用", "店铺简介", "上传店铺第一张展示图", "选择店铺展示图", "申请分区说明：{title}", "主页效果预览",
      "选择以个人或法人主体提交店铺申请。", "填写申请人与店铺的正式联系资料。", "填写主页展示的最低与最高服务费用。", "简介会显示在店铺主页。", "支持 JPEG 或 PNG，并作为主页第一张展示图。", "按照店铺主页的正式组件实时预览申请资料。"];
    for (const language of ["zh-Hant", "ja", "en", "ko"] as const) {
      for (const source of sources) expect(identityApplicationTranslations[source]?.[language], `${language}: ${source}`).toBeTruthy();
      expect(translateText("申请人", language)).not.toBe("申请人");
      expect(translateText("费用区间", language)).not.toBe("费用区间");
      expect(translateText("本人确认（eKYC）", language)).toContain("eKYC");
    }
  });

  it("localizes the activation and affiliate withdrawal rules without losing their meaning", () => {
    expect(translateText("确认并开启", "ja")).toBe("確認して有効化");
    expect(translateText("联盟营销赚取的 NDP 在提现时必须完成 eKYC 并填写银行账户；银行账户名义人必须与 eKYC 姓名一致。", "en")).toContain("exactly matches");
  });

  it("localizes the merchant bank declaration rule without claiming a name match", () => {
    const source = "银行账户名义仅按填写内容登记，不与申请人或法人名称进行一致性判断。";
    for (const language of ["zh-Hant", "ja", "en", "ko"] as const) {
      expect(translateText(source, language)).not.toBe(source);
      expect(translateText(source, language).toLowerCase()).not.toContain("must match");
    }
  });

  it("keeps the exact 15-day boundary in every supported non-Chinese locale", () => {
    const source = "试用期计算：开启日当月剩余少于 15 天时，自动额外增加同等剩余天数；剩余正好 15 天或大于 15 天时，当月计为试用第一个月。";
    expect(translateText(source, "ja")).toContain("ちょうど15日");
    expect(translateText(source, "en")).toContain("exactly 15");
    expect(translateText(source, "ko")).toContain("정확히 15일");
    expect(translateText(source, "zh-Hant")).toContain("正好 15 天");
  });
});
