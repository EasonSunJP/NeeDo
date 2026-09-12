import type { FeaturePermission } from "../../auth/featurePermissions";

export type MerchantPrimaryModuleKey = "orders" | "roster" | "staff" | "members" | "dine_order" | "menu" | "floor_control";

export type MerchantPrimaryModule = {
  key: MerchantPrimaryModuleKey;
  label: string;
  caption: string;
  route: string;
  icon: "sparkles" | "calendar" | "shield" | "heart" | "order" | "menu" | "floor";
  badge?: "Test";
  permission?: FeaturePermission;
};

export const merchantPrimaryModules: MerchantPrimaryModule[] = [
  {
    key: "orders",
    label: "预约一览",
    caption: "已排与未排预约",
    route: "/merchant/schedule?tab=appointments",
    icon: "sparkles"
  },
  {
    key: "roster",
    label: "排班",
    caption: "今日排班与自动化",
    route: "/merchant/schedule",
    icon: "calendar"
  },
  {
    key: "staff",
    label: "员工",
    caption: "员工与担当",
    route: "/merchant/staff",
    icon: "shield"
  },
  {
    key: "members",
    label: "会员",
    caption: "会员与会员卡",
    route: "/merchant/member",
    icon: "heart",
    badge: "Test",
    permission: "shop.member.view"
  },
  {
    key: "dine_order",
    label: "点菜",
    caption: "扫码店内单",
    route: "/merchant/dine/orders",
    icon: "order",
    badge: "Test",
    permission: "store.dine-in.order.view"
  },
  {
    key: "menu",
    label: "菜单",
    caption: "商品与售罄",
    route: "/merchant/menu",
    icon: "menu",
    badge: "Test",
    permission: "store.dine-in.menu.view"
  },
  {
    key: "floor_control",
    label: "场控",
    caption: "桌台包厢床位",
    route: "/merchant/floor",
    icon: "floor",
    badge: "Test",
    permission: "store.dine-in.floor.view"
  }
];
