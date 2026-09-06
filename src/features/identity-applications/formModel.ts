import type { Language } from "../../i18n/translations";
import type { BankAccountInput, ContractLanguage } from "./api";

export const splitApplicationList = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(/[\n,，、]/u)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

export function validateTechnicianProfile(input: { applicantName: string; targetShopId: number | null }) {
  if (!input.applicantName.trim()) {
    return "请输入本人姓名";
  }

  if (!input.targetShopId) {
    return "请选择申请入驻的店铺";
  }

  return null;
}

export type MerchantShowcaseForm = {
  applicantKind: "corporate" | "individual";
  corporateLegalName: string;
  corporateLegalNameKana: string;
  representativeName: string;
  representativeNameKana: string;
  shopName: string;
  businessAddress: string;
  nearestStation: string;
  stationTravelMinutes: string;
  stationAccess: string;
  contactPhone: string;
  responsiblePersonName: string;
  responsibleFamilyName?: string;
  responsibleGivenName?: string;
  description: string;
  serviceCategoryIds: number[];
  businessKeywordIds: number[];
};

export function splitApplicantName(name: string) {
  const [familyName = "", ...given] = name.trim().split(/[\s\u3000]+/u);
  return { familyName, givenName: given.join(" ") };
}

export function validateMerchantShowcase(input: MerchantShowcaseForm) {
  if (input.responsibleFamilyName !== undefined && (!input.responsibleFamilyName.trim() || !input.responsibleGivenName?.trim())) return "请填写申请人的姓和名";
  if (input.stationTravelMinutes && (!/^\d+$/u.test(input.stationTravelMinutes) || !Number.isSafeInteger(Number(input.stationTravelMinutes)))) {
    return "到店时间请输入非负整数（分钟）";
  }
  if (input.applicantKind === "corporate" && !input.corporateLegalName.trim()) {
    return "请输入法人名称";
  }
  if (input.applicantKind === "corporate" && !input.corporateLegalNameKana.trim()) {
    return "请输入法人名称片假名";
  }
  if (input.serviceCategoryIds.length === 0) {
    return "请至少选择一个服务种类";
  }

  const required: Array<[string, string]> = [
    [input.representativeName, "请输入法人或代表者姓名"],
    [input.representativeNameKana, "请输入法人或代表者姓名片假名"],
    [input.shopName, "请输入店铺名称"],
    [input.businessAddress, "请输入店铺地址"],
    [input.contactPhone, "请输入联系电话"],
    [input.responsiblePersonName, "请输入申请人姓名"],
    [input.description, "请输入服务展示说明"]
  ];

  return required.find(([value]) => !value.trim())?.[1] ?? null;
}

export function getContractLanguage(language: Language): ContractLanguage {
  if (language === "en") {
    return "en";
  }
  if (language === "ja" || language === "ko") {
    return "ja";
  }
  return "zh-CN";
}

export function normalizeBankDigits(value: string) {
  return value.normalize("NFKC").replace(/\s/gu, "");
}

export function validateMerchantBankAccount(bank: BankAccountInput) {
  if (!/^\d{4}$/u.test(bank.bankCode) || !bank.bankName.trim()) return "请选择银行";
  if (!/^\d{3}$/u.test(bank.branchCode)) return "请输入3位数字的支店代码";
  if (!bank.branchName.trim()) return "请输入支店名称";
  if (!/^\d{4,12}$/u.test(bank.accountNumber)) return "请输入4至12位数字的账号";
  if (!bank.accountHolderName.trim()) return "请输入账户名义人";
  return null;
}

export function merchantApplicationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const messages: Record<string, string> = {
    "error.identity_application.ekyc_required": "未找到可用于银行账户核验的 eKYC 认证资料，请在本人验证页面核对状态或联系平台客服。",
    "error.bank_account.holder_name_mismatch": "账户名义与已验证的本人姓名或法人名称不一致，请核对片假名。",
    "error.identity_application.version_conflict": "申请资料已变更。本页填写内容已保留，请复制后重新打开申请。",
    "error.identity_application.submitted_snapshot_locked": "申请已提交，不能继续修改。请重新打开申请查看进度。"
  };
  if (error && typeof error === "object" && "status" in error && error.status === 401) {
    return "登录状态已失效，请重新登录后继续申请。";
  }
  return messages[message] ?? message;
}
