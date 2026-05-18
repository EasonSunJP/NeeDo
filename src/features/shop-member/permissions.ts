import type { ShopMemberPermission, ShopMemberRole } from "./types";

export const SHOP_MEMBER_PERMISSIONS = [
  "shop.member.view",
  "shop.member.create",
  "shop.member.update",
  "shop.member.delete",
  "shop.member.tag.manage",
  "shop.member.card.template.manage",
  "shop.member.card.issue",
  "shop.member.card.topup",
  "shop.member.card.consume",
  "shop.member.card.refund.request",
  "shop.member.card.refund.approve",
  "shop.member.card.adjust",
  "shop.member.card.freeze",
  "shop.member.card.unfreeze",
  "shop.member.coupon.issue",
  "shop.member.analytics.view",
  "shop.member.finance.view",
  "shop.member.export",
  "shop.member.operation_log.view"
] satisfies ShopMemberPermission[];

export const SHOP_MEMBER_SENSITIVE_ACTIONS = [
  "refund.approve",
  "card.adjust",
  "bonus.over_threshold",
  "card.expire_at.update",
  "card.freeze",
  "card.unfreeze",
  "member.delete",
  "export.members",
  "verify.cross_shop",
  "verify.cancel"
] as const;

const rolePermissionMap: Record<ShopMemberRole, ShopMemberPermission[]> = {
  owner: [...SHOP_MEMBER_PERMISSIONS],
  manager: SHOP_MEMBER_PERMISSIONS.filter((permission) => !["shop.member.delete", "shop.member.export"].includes(permission)),
  staff: [
    "shop.member.view",
    "shop.member.create",
    "shop.member.update",
    "shop.member.card.issue",
    "shop.member.card.topup",
    "shop.member.card.consume",
    "shop.member.coupon.issue"
  ],
  cast: ["shop.member.view"],
  accountant: [
    "shop.member.view",
    "shop.member.analytics.view",
    "shop.member.finance.view",
    "shop.member.export",
    "shop.member.card.refund.request",
    "shop.member.operation_log.view"
  ]
};

export function hasShopMemberPermission(role: ShopMemberRole, permission: ShopMemberPermission) {
  return rolePermissionMap[role].includes(permission);
}

export function assertShopMemberPermission(role: ShopMemberRole, permission: ShopMemberPermission) {
  if (!hasShopMemberPermission(role, permission)) {
    throw new Error(`当前账号无权执行 ${permission}`);
  }
}

export function maskShopMemberPhone(phone: string, role: ShopMemberRole) {
  if (role !== "cast") {
    return phone;
  }

  const digits = phone.replace(/\D/g, "");

  if (digits.length < 7) {
    return "****";
  }

  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}
