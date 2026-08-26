import { describe, expect, it } from "vitest";
import {
  getContractLanguage,
  splitApplicationList,
  validateMerchantShowcase,
  validateTechnicianProfile
} from "./formModel";

describe("identity application form model", () => {
  it("normalizes comma and line separated optional lists", () => {
    expect(splitApplicationList("银座、涩谷\n 新宿, 银座 ")).toEqual(["银座", "涩谷", "新宿"]);
  });

  it("requires only the technician name and selected shop", () => {
    expect(validateTechnicianProfile({ applicantName: "", targetShopId: null })).toBe("请输入本人姓名");
    expect(validateTechnicianProfile({ applicantName: "山田 花", targetShopId: null })).toBe("请选择申请入驻的店铺");
    expect(validateTechnicianProfile({ applicantName: "山田 花", targetShopId: 8 })).toBeNull();
  });

  it("validates corporate identity names while keeping individual applications separate", () => {
    const common = {
      applicantKind: "corporate" as const,
      corporateLegalName: "",
      corporateLegalNameKana: "",
      representativeName: "山田 花",
      representativeNameKana: "ヤマダハナ",
      shopName: "銀座ケア",
      businessAddress: "東京都中央区",
      contactPhone: "0312345678",
      responsiblePersonName: "山田 花",
      description: "静かな個室ケア"
    };
    expect(validateMerchantShowcase(common)).toBe("请输入法人名称");
    expect(validateMerchantShowcase({ ...common, corporateLegalName: "株式会社銀座ケア", corporateLegalNameKana: "" })).toBe("请输入法人名称片假名");
    expect(validateMerchantShowcase({ ...common, applicantKind: "individual" })).toBeNull();
  });

  it("maps the app locale to the three signed contract languages", () => {
    expect(getContractLanguage("ja")).toBe("ja");
    expect(getContractLanguage("en")).toBe("en");
    expect(getContractLanguage("zh-Hant")).toBe("zh-CN");
    expect(getContractLanguage("ko")).toBe("ja");
  });
});
