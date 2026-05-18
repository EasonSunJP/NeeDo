import type { PortalScope } from "./demoAccount";

export type FeaturePermission =
  | "store.scheduling.overview.view"
  | "store.scheduling.current.view"
  | "store.scheduling.today.view"
  | "store.scheduling.technician-status.view"
  | "store.scheduling.automation.edit"
  | "store.scheduling.one-click.run"
  | "store.scheduling.batch-confirm.run"
  | "store.dispatch.view"
  | "store.dispatch.manage"
  | "store.stage-layout.view"
  | "store.stage-layout.manage"
  | "store.inventory.view"
  | "store.inventory.manage"
  | "store.dine-in.order.view"
  | "store.dine-in.order.manage"
  | "store.dine-in.menu.view"
  | "store.dine-in.menu.manage"
  | "store.dine-in.floor.view"
  | "store.dine-in.floor.manage"
  | "store.dine-in.qr.manage"
  | "ops.store-ops.cross-store"
  | "shop.member.view"
  | "shop.member.create"
  | "shop.member.update"
  | "shop.member.delete"
  | "shop.member.tag.manage"
  | "shop.member.card.template.manage"
  | "shop.member.card.issue"
  | "shop.member.card.topup"
  | "shop.member.card.consume"
  | "shop.member.card.refund.request"
  | "shop.member.card.refund.approve"
  | "shop.member.card.adjust"
  | "shop.member.card.freeze"
  | "shop.member.card.unfreeze"
  | "shop.member.coupon.issue"
  | "shop.member.analytics.view"
  | "shop.member.finance.view"
  | "shop.member.export"
  | "shop.member.operation_log.view";

const portalFeaturePermissions: Record<PortalScope, FeaturePermission[]> = {
  user: [],
  merchant: [
    "store.scheduling.overview.view",
    "store.scheduling.current.view",
    "store.scheduling.today.view",
    "store.scheduling.technician-status.view",
    "store.scheduling.automation.edit",
    "store.scheduling.one-click.run",
    "store.scheduling.batch-confirm.run",
    "store.dispatch.view",
    "store.dispatch.manage",
    "store.stage-layout.view",
    "store.stage-layout.manage",
    "store.inventory.view",
    "store.inventory.manage",
    "store.dine-in.order.view",
    "store.dine-in.order.manage",
    "store.dine-in.menu.view",
    "store.dine-in.menu.manage",
    "store.dine-in.floor.view",
    "store.dine-in.floor.manage",
    "store.dine-in.qr.manage",
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
  ],
  technician: [],
  business: [],
  admin: []
};

export function getPortalFeaturePermissions(portal: PortalScope) {
  return portalFeaturePermissions[portal];
}

export function hasPortalFeaturePermission(portal: PortalScope, permission: FeaturePermission) {
  return portalFeaturePermissions[portal].includes(permission);
}
