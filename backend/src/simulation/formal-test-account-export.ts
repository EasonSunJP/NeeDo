export interface FormalTestAccountExportSource {
  accountType: string;
  displayName: string;
  email: string;
  needoId: string;
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

export const buildFormalTestAccountExportRow = (
  source: FormalTestAccountExportSource,
  password: string
): FormalTestAccountExportRow => {
  if (!/^n\d{10}$/.test(source.needoId)) {
    throw new Error("NeeDo ID must match n plus ten digits.");
  }

  return {
    accountType: ACCOUNT_TYPE_LABELS[source.accountType] ?? source.accountType,
    needoId: source.needoId,
    nickname: source.displayName,
    email: source.email,
    password
  };
};

export const orderFormalTestAccountExports = (
  rows: readonly FormalTestAccountExportRow[]
): FormalTestAccountExportRow[] =>
  [...rows].sort((left, right) => {
    if (left.email === "admin@lifedance.com") return -1;
    if (right.email === "admin@lifedance.com") return 1;

    const leftFixed = left.email.endsWith("@example.com");
    const rightFixed = right.email.endsWith("@example.com");
    if (leftFixed !== rightFixed) return leftFixed ? -1 : 1;

    return left.email.localeCompare(right.email, "en");
  });
