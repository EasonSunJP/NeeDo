import type { SocialSimulationType } from "./social-simulation-plan";

export interface FormalTestAccountExportSource {
  accountType: string;
  displayName: string;
  email: string;
  identityScopeId?: number | null;
  socialType: SocialSimulationType;
  userId: number;
}

export interface FormalTestAccountIdentitySource {
  scopeId: number | null;
  scopeType: string | null;
}

export interface FormalTestAccountExportRow {
  accountType: string;
  needoId: string;
  nickname: string;
  email: string;
  password: string;
}

const ACCOUNT_TYPE_LABELS: Readonly<Record<string, string>> = {
  admin: "运营后台超级管理员",
  operator: "运营后台运营管理员",
  merchant_owner: "店铺服务号",
  technician: "技师",
  customer: "一般用户",
  broker: "渠道合作账号"
};

const prefixBySocialType: Readonly<Record<SocialSimulationType, "u" | "b" | "s">> = {
  user: "u",
  technician: "b",
  shop: "s"
};

export const formatFormalNeeDoId = (
  socialType: SocialSimulationType,
  userId: number
): string => {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error(`NeeDo account sequence must be a positive integer: ${userId}.`);
  }
  return `${prefixBySocialType[socialType]}${String(userId).padStart(10, "0")}`;
};

export const resolveFormalNeeDoSequence = (
  accountType: string,
  socialType: SocialSimulationType,
  userId: number,
  identities: readonly FormalTestAccountIdentitySource[]
): number => {
  const scopeType =
    socialType === "user"
      ? "customer_profile"
      : accountType === "merchant_owner"
      ? "shop"
      : accountType === "technician"
        ? "technician_profile"
        : null;

  if (!scopeType) return userId;

  const scopeId = identities.find((identity) => identity.scopeType === scopeType)?.scopeId;
  if (!scopeId || !Number.isInteger(scopeId) || scopeId <= 0) {
    throw new Error(`NeeDo identity scope is missing for ${accountType} user ${userId}.`);
  }
  return scopeId;
};

export const buildFormalTestAccountExportRow = (
  source: FormalTestAccountExportSource,
  password: string
): FormalTestAccountExportRow => ({
  accountType: ACCOUNT_TYPE_LABELS[source.accountType] ?? source.accountType,
  needoId: formatFormalNeeDoId(source.socialType, source.identityScopeId ?? source.userId),
  nickname: source.displayName,
  email: source.email,
  password
});

export const orderFormalTestAccountExports = (
  rows: readonly FormalTestAccountExportRow[]
): FormalTestAccountExportRow[] =>
  [...rows].sort((left, right) => {
    if (left.email === "admin@example.com") return -1;
    if (right.email === "admin@example.com") return 1;

    const leftFixed = left.email.endsWith("@example.com");
    const rightFixed = right.email.endsWith("@example.com");
    if (leftFixed !== rightFixed) return leftFixed ? -1 : 1;

    return left.email.localeCompare(right.email, "en");
  });
