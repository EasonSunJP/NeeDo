import { ApiClientError } from "../../api/httpClient";
import {
  identityApplicationMediaErrorMessage,
  merchantApplicationErrorMessage,
  normalizeBankDigits,
  validateMerchantBankAccount
} from "./formModel";
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
      nearestStation: "",
      stationTravelMinutes: "",
      stationAccess: "",
      contactPhone: "0312345678",
      responsiblePersonName: "山田 花",
      description: "静かな個室ケア",
      serviceCategoryIds: [1],
      businessKeywordIds: [10]
    };
    expect(validateMerchantShowcase(common)).toBe("请输入法人名称");
    expect(validateMerchantShowcase({ ...common, corporateLegalName: "株式会社銀座ケア", corporateLegalNameKana: "" })).toBe("请输入法人名称片假名");
    expect(validateMerchantShowcase({ ...common, applicantKind: "individual" })).toBeNull();
    expect(validateMerchantShowcase({ ...common, applicantKind: "individual", serviceCategoryIds: [] })).toBe("请至少选择一个服务种类");
    expect(validateMerchantShowcase({ ...common, applicantKind: "individual", responsiblePersonName: "" })).toBe("请输入申请人姓名");
  });

  it("maps the app locale to the three signed contract languages", () => {
    expect(getContractLanguage("ja")).toBe("ja");
    expect(getContractLanguage("en")).toBe("en");
    expect(getContractLanguage("zh-Hant")).toBe("zh-CN");
    expect(getContractLanguage("ko")).toBe("ja");
  });
});


describe("merchant bank validation", () => {
  const bank = { bankCode: "0009", bankName: "三井住友銀行", branchCode: "001", branchName: "本店", accountType: "ordinary" as const, accountNumber: "1234567", accountHolderName: "ヤマダタロウ" };
  it.each([
    ["branchCode", "01", "请输入3位数字的支店代码"],
    ["branchName", " ", "请输入支店名称"],
    ["accountNumber", "123", "请输入4至12位数字的账号"],
    ["accountNumber", "1234567890123", "请输入4至12位数字的账号"],
    ["accountNumber", "123a567", "请输入4至12位数字的账号"]
  ])("identifies invalid %s", (field, value, message) => {
    expect(validateMerchantBankAccount({ ...bank, [field]: value })).toBe(message);
  });
  it("accepts fullwidth numeric input without dropping invalid characters", () => {
    expect(normalizeBankDigits(" ０１２ ３ ")).toBe("0123");
    expect(normalizeBankDigits("１２Ａ")).toBe("12A");
    expect(validateMerchantBankAccount(bank)).toBeNull();
  });
  it("distinguishes expired login from version conflicts and eKYC requirements", () => {
    expect(merchantApplicationErrorMessage(new ApiClientError("error.auth.expired", 401, 401))).toContain("重新登录");
    expect(merchantApplicationErrorMessage(new Error("error.identity_application.version_conflict"))).toContain("申请资料已变更");
    expect(merchantApplicationErrorMessage(new Error("error.identity_application.ekyc_required"))).toContain("eKYC");
  });
  it("turns local and server media validation failures into actionable copy", () => {
    expect(identityApplicationMediaErrorMessage(new Error("error.image_upload.quality_failed")))
      .toContain("质量验证未通过");
    expect(identityApplicationMediaErrorMessage(
      new Error("error.identity_application.preview_mismatch")
    )).toContain("与原始材料不一致");
  });
});
