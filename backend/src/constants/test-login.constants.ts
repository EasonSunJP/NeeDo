import type { SystemRoleCode } from "./permissions.constants";

export type TestUserPortal = "admin" | "merchant" | "technician" | "customer";

export interface TestUserAccountDefinition {
  email: string;
  username: string;
  roleCode: SystemRoleCode;
  identityType: "platform" | "merchant" | "technician" | "customer";
  expectedPortal: TestUserPortal;
  purpose: string;
}

export const TEST_USER_ACCOUNTS = [
  {
    email: "admin@example.com",
    username: "NeeDo Super Admin",
    roleCode: "admin",
    identityType: "platform",
    expectedPortal: "admin",
    purpose: "运营后台、User Management、权限管理"
  },
  {
    email: "operator@example.com",
    username: "NeeDo Operator",
    roleCode: "operator",
    identityType: "platform",
    expectedPortal: "admin",
    purpose: "运营后台基础运营功能"
  },
  {
    email: "merchant@example.com",
    username: "NeeDo Merchant Owner",
    roleCode: "merchant_owner",
    identityType: "merchant",
    expectedPortal: "merchant",
    purpose: "商户端、店铺后台、订单中心、排班、财务"
  },
  {
    email: "technician@example.com",
    username: "NeeDo Technician",
    roleCode: "technician",
    identityType: "technician",
    expectedPortal: "technician",
    purpose: "技师端、日程、接单、资料、钱包"
  },
  {
    email: "customer@example.com",
    username: "NeeDo Customer",
    roleCode: "customer",
    identityType: "customer",
    expectedPortal: "customer",
    purpose: "用户端、搜索、预约、订单、IM、Social"
  }
] as const satisfies readonly TestUserAccountDefinition[];

export const REQUIRED_TEST_ACCOUNT_EMAILS = TEST_USER_ACCOUNTS.map((account) => account.email);
