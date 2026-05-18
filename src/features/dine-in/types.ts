export type DineInQrType = "SHOP_MENU" | "TABLE_MENU" | "ROOM_MENU" | "BED_MENU" | "ITEM" | "CHECKOUT" | "REVIEW" | "STAFF";
export type DineInQrActionType =
  | "OPEN_DINE_IN_MENU"
  | "OPEN_DINE_IN_ITEM"
  | "OPEN_DINE_IN_BILL"
  | "OPEN_REVIEW"
  | "OPEN_STAFF_PROFILE"
  | "OPEN_SHOP";

export type FacilityType = "TABLE" | "ROOM" | "BED" | "COUNTER_SEAT" | "BOOTH" | "PRIVATE_AREA";
export type FacilityStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "OCCUPIED"
  | "ORDERING"
  | "SERVING"
  | "CHECKOUT_REQUESTED"
  | "PAYMENT_PENDING"
  | "CLEANING"
  | "BLOCKED";
export type DiningSessionStatus = "OPEN" | "ACTIVE" | "CHECKOUT_REQUESTED" | "PAYMENT_PENDING" | "PAID" | "COMPLETED" | "CANCELLED" | "DISPUTED";
export type DineInOrderStatus =
  | "PENDING"
  | "ACCEPTED"
  | "PARTIALLY_PREPARING"
  | "PREPARING"
  | "PARTIALLY_READY"
  | "READY"
  | "PARTIALLY_SERVED"
  | "SERVED"
  | "CHECKOUT_REQUESTED"
  | "PAID"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED";
export type DineInOrderItemStatus = "SUBMITTED" | "CONFIRMED" | "PREPARING" | "READY" | "SERVED" | "UNAVAILABLE" | "CANCELLED" | "REFUNDED";
export type DineInPaymentStatus =
  | "UNPAID"
  | "PAYMENT_CREATED"
  | "ONLINE_PROCESSING"
  | "OFFLINE_PENDING_CONFIRMATION"
  | "CONFIRMED"
  | "PARTIALLY_CONFIRMED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED";
export type DineInPaymentMethod = "ONLINE_CARD" | "CASH" | "STORE_CARD" | "POS" | "OTHER";
export type ProductionArea = "KITCHEN" | "BAR" | "FRONT" | "CAST";
export type MenuStockStatus = "AVAILABLE" | "SOLD_OUT" | "LIMITED";
export type DineInServiceMode = "DINE_IN" | "TAKEOUT" | "ROOM" | "BED";
export type DineInMenuKind = "FOOD" | "DRINK" | "SERVICE";
export type MenuItemRestrictionFlag =
  | "ALCOHOL"
  | "AGE_CHECK"
  | "IN_STORE_ONLY"
  | "ONLINE_RESERVATION_ONLY"
  | "ADVANCE_RESERVATION_ONLY"
  | "BIRTHDAY_ONLY";
export type StaffPresenceStatus = "ON_SHIFT" | "AVAILABLE" | "BUSY" | "BREAK" | "OFF_SHIFT" | "ASSIGNED";
export type ServiceCallType = "CALL_STAFF" | "WATER" | "CHECKOUT" | "URGENT" | "CUSTOM";
export type ServiceCallStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "CANCELLED";

export type LocalizedText = {
  zh: string;
  ja: string;
  en?: string;
  ko?: string;
};

export type DineInQrCode = {
  id: string;
  shopId: string;
  rawToken: string;
  type: DineInQrType;
  targetId: string;
  active: boolean;
  expiresAt?: string;
  createdBy: string;
  createdAt: string;
};

export type FacilityArea = {
  id: string;
  shopId: string;
  name: string;
  sortOrder: number;
  active: boolean;
};

export type FacilityUnit = {
  id: string;
  shopId: string;
  areaId: string;
  type: FacilityType;
  label: string;
  capacity: number;
  status: FacilityStatus;
  qrCodeId: string;
  currentSessionId?: string;
  metadata?: {
    floor?: string;
    minimumSpendJpy?: number;
    facilityFeeJpy?: number;
    seatLabel?: string;
  };
};

export type DiningSession = {
  id: string;
  shopId: string;
  facilityUnitId: string;
  status: DiningSessionStatus;
  openedByUserId?: string;
  openedByStaffId?: string;
  assignedStaffId?: string;
  assignedCastId?: string;
  partySize: number;
  openedAt: string;
  closedAt?: string;
  billLockedAt?: string;
};

export type MenuCategory = {
  id: string;
  menuId: string;
  name: LocalizedText;
  sortOrder: number;
};

export type MenuItemOption = {
  id: string;
  name: LocalizedText;
  priceDeltaJpy: number;
};

export type MenuItemOptionGroup = {
  id: string;
  name: LocalizedText;
  required: boolean;
  options: MenuItemOption[];
};

export type DineInMenu = {
  id: string;
  shopId: string;
  kind: DineInMenuKind;
  name: LocalizedText;
  serviceMode: DineInServiceMode;
  defaultLanguage: "zh" | "ja" | "en" | "ko";
  active: boolean;
  facilityTypeScope?: FacilityType[];
};

export type DineInMenuItem = {
  id: string;
  menuId: string;
  categoryId: string;
  name: LocalizedText;
  description: LocalizedText;
  imageUrl: string;
  basePriceJpy: number;
  taxMode: "TAX_INCLUDED" | "TAX_EXCLUDED";
  minimumOrderQuantity?: number;
  maximumPurchaseQuantity?: number;
  maximumPerOrderQuantity?: number;
  maximumPerPersonQuantity?: number;
  specialOffer?: {
    active: boolean;
    priceJpy: number;
    label: string;
  };
  productionArea: ProductionArea;
  stockStatus: MenuStockStatus;
  active: boolean;
  facilityTypeScope?: FacilityType[];
  optionGroups?: MenuItemOptionGroup[];
  restrictionFlags?: MenuItemRestrictionFlag[];
};

export type DineInOrderItem = {
  id: string;
  orderId: string;
  menuItemId: string;
  nameSnapshot: string;
  priceSnapshotJpy: number;
  quantity: number;
  optionsSnapshot: string[];
  note?: string;
  productionArea: ProductionArea;
  status: DineInOrderItemStatus;
  assignedStaffId?: string;
  servedAt?: string;
};

export type DineInOrder = {
  id: string;
  orderNo: string;
  shopId: string;
  sessionId: string;
  facilityUnitId: string;
  userId?: string;
  guestLabel: string;
  status: DineInOrderStatus;
  subtotalJpy: number;
  taxJpy: number;
  serviceFeeJpy: number;
  facilityFeeJpy: number;
  discountJpy: number;
  totalJpy: number;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
  assignedStaffId?: string;
  alertFlags: string[];
};

export type DineInPayment = {
  id: string;
  shopId: string;
  sessionId: string;
  orderId?: string;
  amountJpy: number;
  method: DineInPaymentMethod;
  status: DineInPaymentStatus;
  confirmedByStaffId?: string;
  posReference?: string;
  receiptImageUrl?: string;
  confirmedAt?: string;
};

export type FacilityAssignment = {
  id: string;
  shopId: string;
  facilityUnitId: string;
  sessionId: string;
  staffId: string;
  castId?: string;
  role: "WAITER" | "CASHIER" | "MANAGER" | "CAST";
  assignedAt: string;
  releasedAt?: string;
};

export type StaffPresence = {
  id: string;
  shopId: string;
  staffId: string;
  staffName: string;
  roleName: string;
  status: StaffPresenceStatus;
  currentAreaId?: string;
  currentTaskCount: number;
  openCallCount: number;
  updatedAt: string;
};

export type ServiceCall = {
  id: string;
  shopId: string;
  sessionId: string;
  facilityUnitId: string;
  type: ServiceCallType;
  status: ServiceCallStatus;
  assignedStaffId?: string;
  createdAt: string;
  resolvedAt?: string;
  note?: string;
};

export type DineInAuditLog = {
  id: string;
  shopId: string;
  actorType: "USER" | "STAFF" | "SYSTEM" | "ADMIN";
  actorId: string;
  entityType: "ORDER" | "ITEM" | "PAYMENT" | "SESSION" | "FACILITY" | "MENU" | "QR";
  entityId: string;
  action: string;
  before?: string;
  after?: string;
  createdAt: string;
};

export type ReviewIntent = {
  id: string;
  shopId: string;
  sessionId: string;
  orderIds: string[];
  targets: Array<"SHOP" | "MENU_ITEM" | "STAFF" | "CAST" | "SESSION">;
  status: "OPEN" | "SUBMITTED";
  createdAt: string;
};

export type DineInState = {
  qrCodes: DineInQrCode[];
  facilityAreas: FacilityArea[];
  facilityUnits: FacilityUnit[];
  diningSessions: DiningSession[];
  menus: DineInMenu[];
  menuCategories: MenuCategory[];
  menuItems: DineInMenuItem[];
  orderItems: DineInOrderItem[];
  orders: DineInOrder[];
  payments: DineInPayment[];
  facilityAssignments: FacilityAssignment[];
  staffPresence: StaffPresence[];
  serviceCalls: ServiceCall[];
  auditLogs: DineInAuditLog[];
  reviewIntents: ReviewIntent[];
};

export type DineInCartLineInput = {
  menuItemId: string;
  quantity: number;
  optionIds?: string[];
  note?: string;
};

export type QrResolution = {
  qrId: string;
  type: DineInQrType;
  shopId: string;
  facilityUnitId?: string;
  sessionId?: string;
  action: {
    type: DineInQrActionType;
    url: string;
  };
  context: {
    shopName: string;
    facilityLabel?: string;
    serviceMode: "DINE_IN";
  };
};
