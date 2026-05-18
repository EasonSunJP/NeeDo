import type {
  DineInOrderItemStatus,
  DineInOrderStatus,
  DineInMenuKind,
  DineInPaymentStatus,
  FacilityStatus,
  FacilityType,
  MenuItemRestrictionFlag,
  MenuStockStatus,
  ProductionArea,
  StaffPresenceStatus
} from "./types";

export const dineInOrderStatusLabels: Record<DineInOrderStatus, string> = {
  PENDING: "新单",
  ACCEPTED: "已接单",
  PARTIALLY_PREPARING: "部分制作中",
  PREPARING: "制作中",
  PARTIALLY_READY: "部分已出品",
  READY: "待上菜",
  PARTIALLY_SERVED: "部分已上菜",
  SERVED: "已上菜",
  CHECKOUT_REQUESTED: "待结账",
  PAID: "已付款",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  REFUNDED: "已退款"
};

export const dineInOrderItemStatusLabels: Record<DineInOrderItemStatus, string> = {
  SUBMITTED: "已提交",
  CONFIRMED: "已确认",
  PREPARING: "制作中",
  READY: "已出品",
  SERVED: "已上菜",
  UNAVAILABLE: "缺货",
  CANCELLED: "已取消",
  REFUNDED: "已退款"
};

export const facilityStatusLabels: Record<FacilityStatus, string> = {
  AVAILABLE: "空闲",
  RESERVED: "已预约",
  OCCUPIED: "使用中",
  ORDERING: "点单中",
  SERVING: "服务中",
  CHECKOUT_REQUESTED: "待结账",
  PAYMENT_PENDING: "待收款",
  CLEANING: "清洁中",
  BLOCKED: "停用"
};

export const facilityTypeLabels: Record<FacilityType, string> = {
  TABLE: "桌台",
  ROOM: "包厢",
  BED: "床位",
  COUNTER_SEAT: "吧台",
  BOOTH: "卡座",
  PRIVATE_AREA: "包区"
};

export const productionAreaLabels: Record<ProductionArea, string> = {
  KITCHEN: "厨房",
  BAR: "吧台",
  FRONT: "前台",
  CAST: "技师/服务"
};

export const menuStockStatusLabels: Record<MenuStockStatus, string> = {
  AVAILABLE: "可售",
  SOLD_OUT: "售罄",
  LIMITED: "限量"
};

export const dineInMenuKindLabels: Record<DineInMenuKind, string> = {
  FOOD: "菜单",
  DRINK: "酒单",
  SERVICE: "服务单"
};

export const menuItemRestrictionFlagLabels: Record<MenuItemRestrictionFlag, string> = {
  ALCOHOL: "酒精",
  AGE_CHECK: "年龄确认",
  IN_STORE_ONLY: "店内限定",
  ONLINE_RESERVATION_ONLY: "网上预约限定",
  ADVANCE_RESERVATION_ONLY: "提前预约限定",
  BIRTHDAY_ONLY: "生日限定"
};

export const paymentStatusLabels: Record<DineInPaymentStatus, string> = {
  UNPAID: "未付款",
  PAYMENT_CREATED: "已创建支付",
  ONLINE_PROCESSING: "在线处理中",
  OFFLINE_PENDING_CONFIRMATION: "线下待确认",
  CONFIRMED: "已收款",
  PARTIALLY_CONFIRMED: "部分确认",
  FAILED: "失败",
  CANCELLED: "已取消",
  REFUNDED: "已退款"
};

export const staffPresenceStatusLabels: Record<StaffPresenceStatus, string> = {
  ON_SHIFT: "已上班",
  AVAILABLE: "可分配",
  BUSY: "服务中",
  BREAK: "休息中",
  OFF_SHIFT: "已下班",
  ASSIGNED: "已绑定"
};
