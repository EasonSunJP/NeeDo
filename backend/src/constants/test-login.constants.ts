import type { SystemRoleCode } from "./permissions.constants";

export type TestUserPortal = "admin" | "merchant" | "technician" | "customer" | "business";

export interface TestUserAccountDefinition {
  email: string;
  username: string;
  avatarUrl: string;
  roleCode: SystemRoleCode;
  identityType: "platform" | "merchant" | "technician" | "customer" | "broker";
  expectedPortal: TestUserPortal;
  purpose: string;
}

export const TEST_USER_ACCOUNTS = [
  {
    email: "admin@example.com",
    username: "神谷 俊介",
    avatarUrl: "/images/generated/profiles/cartoon-profile-02.png",
    roleCode: "admin",
    identityType: "platform",
    expectedPortal: "admin",
    purpose: "运营后台、User Management、权限管理"
  },
  {
    email: "operator@example.com",
    username: "三浦 紗季",
    avatarUrl: "/images/generated/profiles/ai-profile-11.jpg",
    roleCode: "operator",
    identityType: "platform",
    expectedPortal: "admin",
    purpose: "运营后台基础运营功能"
  },
  {
    email: "merchant@example.com",
    username: "青山プライベートケア Lino 公式受付",
    avatarUrl: "/images/generated/stores/store-calm-body-room.jpg",
    roleCode: "merchant_owner",
    identityType: "merchant",
    expectedPortal: "merchant",
    purpose: "商户端、店铺后台、订单中心、排班、财务"
  },
  {
    email: "affiliate@example.com",
    username: "森下 拓海",
    avatarUrl: "/images/generated/profiles/cartoon-profile-05.png",
    roleCode: "broker",
    identityType: "broker",
    expectedPortal: "business",
    purpose: "Afirieito、NDA管理后台、推广计划、素材、归因收益"
  },
  {
    email: "technician@example.com",
    username: "橘 ひかり",
    avatarUrl: "/images/generated/profiles/ai-profile-29.jpg",
    roleCode: "technician",
    identityType: "technician",
    expectedPortal: "technician",
    purpose: "技师端、日程、接单、资料、钱包"
  },
  {
    email: "customer@example.com",
    username: "望月 結菜",
    avatarUrl: "/images/generated/profiles/ai-profile-24.jpg",
    roleCode: "customer",
    identityType: "customer",
    expectedPortal: "customer",
    purpose: "用户端、搜索、预约、订单、IM、Social"
  }
] as const satisfies readonly TestUserAccountDefinition[];

export const REQUIRED_TEST_ACCOUNT_EMAILS = TEST_USER_ACCOUNTS.map((account) => account.email);
