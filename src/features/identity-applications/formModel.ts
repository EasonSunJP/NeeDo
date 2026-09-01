import type { Language } from "../../i18n/translations";
import type { ContractLanguage } from "./api";

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
  contactPhone: string;
  responsiblePersonName: string;
  description: string;
  serviceCategoryIds: number[];
  businessKeywordIds: number[];
};

export function validateMerchantShowcase(input: MerchantShowcaseForm) {
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
    [input.responsiblePersonName, "请输入负责人姓名"],
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
