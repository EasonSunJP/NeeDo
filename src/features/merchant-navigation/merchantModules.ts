import type { FeaturePermission } from "../../auth/featurePermissions";

export type MerchantPrimaryModuleKey = "orders" | "roster" | "staff" | "members" | "dine_order" | "menu" | "floor_control";

export type MerchantPrimaryModule = {
  key: MerchantPrimaryModuleKey;
  labelZh: string;
  labelJa: string;
  caption: string;
  route: string;
  icon: "sparkles" | "calendar" | "shield" | "heart" | "order" | "menu" | "floor";
  permission?: FeaturePermission;
};

export const merchantPrimaryModules: MerchantPrimaryModule[] = [
  {
    key: "orders",
    labelZh: "订单",
    labelJa: "注文",
    caption: "预约与平台订单",
    route: "/merchant/orders",
    icon: "sparkles"
  },
  {
    key: "roster",
    labelZh: "排班",
    labelJa: "シフト",
    caption: "今日排班与自动化",
    route: "/merchant/schedule",
    icon: "calendar"
  },
  {
    key: "staff",
    labelZh: "员工",
    labelJa: "スタッフ",
    caption: "员工与担当",
    route: "/merchant/staff",
    icon: "shield"
  },
  {
    key: "members",
    labelZh: "会员",
    labelJa: "会員",
    caption: "会员与会员卡",
    route: "/merchant/member",
    icon: "heart",
    permission: "shop.member.view"
  },
  {
    key: "dine_order",
    labelZh: "点单",
    labelJa: "オーダー",
    caption: "扫码店内单",
    route: "/merchant/dine/orders",
    icon: "order",
    permission: "store.dine-in.order.view"
  },
  {
    key: "menu",
    labelZh: "菜单",
    labelJa: "メニュー",
    caption: "商品与售罄",
    route: "/merchant/menu",
    icon: "menu",
    permission: "store.dine-in.menu.view"
  },
  {
    key: "floor_control",
    labelZh: "场控",
    labelJa: "店内",
    caption: "桌台包厢床位",
    route: "/merchant/floor",
    icon: "floor",
    permission: "store.dine-in.floor.view"
  }
];
