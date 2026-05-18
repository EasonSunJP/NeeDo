import { imageBank } from "../../data/mock";
import type { DineInState } from "./types";

export const dineInShopId = "store-1";
const seedAt = "2026-05-08T18:40:00+09:00";

export const defaultDineInState: DineInState = {
  qrCodes: [
    {
      id: "qr-shop-menu",
      shopId: dineInShopId,
      rawToken: "qr-shop-menu",
      type: "SHOP_MENU",
      targetId: dineInShopId,
      active: true,
      createdBy: "staff-manager",
      createdAt: seedAt
    },
    {
      id: "qr-table-a08",
      shopId: dineInShopId,
      rawToken: "qr-table-a08",
      type: "TABLE_MENU",
      targetId: "facility-table-a08",
      active: true,
      createdBy: "staff-manager",
      createdAt: seedAt
    },
    {
      id: "qr-room-vip3",
      shopId: dineInShopId,
      rawToken: "qr-room-vip3",
      type: "ROOM_MENU",
      targetId: "facility-room-vip3",
      active: true,
      createdBy: "staff-manager",
      createdAt: seedAt
    },
    {
      id: "qr-bed-2",
      shopId: dineInShopId,
      rawToken: "qr-bed-2",
      type: "BED_MENU",
      targetId: "facility-bed-2",
      active: true,
      createdBy: "staff-manager",
      createdAt: seedAt
    },
    {
      id: "qr-checkout-a08",
      shopId: dineInShopId,
      rawToken: "qr-checkout-a08",
      type: "CHECKOUT",
      targetId: "session-a08",
      active: true,
      createdBy: "staff-cashier",
      createdAt: seedAt
    }
  ],
  facilityAreas: [
    { id: "area-main", shopId: dineInShopId, name: "A区", sortOrder: 1, active: true },
    { id: "area-vip", shopId: dineInShopId, name: "VIP", sortOrder: 2, active: true },
    { id: "area-treatment", shopId: dineInShopId, name: "床位", sortOrder: 3, active: true },
    { id: "area-bar", shopId: dineInShopId, name: "吧台", sortOrder: 4, active: true }
  ],
  facilityUnits: [
    {
      id: "facility-table-a01",
      shopId: dineInShopId,
      areaId: "area-main",
      type: "TABLE",
      label: "A-01",
      capacity: 4,
      status: "AVAILABLE",
      qrCodeId: "qr-shop-menu"
    },
    {
      id: "facility-table-a08",
      shopId: dineInShopId,
      areaId: "area-main",
      type: "TABLE",
      label: "A区 8号桌",
      capacity: 4,
      status: "SERVING",
      qrCodeId: "qr-table-a08",
      currentSessionId: "session-a08",
      metadata: { seatLabel: "靠窗四人桌" }
    },
    {
      id: "facility-room-vip3",
      shopId: dineInShopId,
      areaId: "area-vip",
      type: "ROOM",
      label: "VIP 3号包厢",
      capacity: 8,
      status: "CHECKOUT_REQUESTED",
      qrCodeId: "qr-room-vip3",
      currentSessionId: "session-vip3",
      metadata: { facilityFeeJpy: 12000, minimumSpendJpy: 80000, floor: "3F" }
    },
    {
      id: "facility-bed-2",
      shopId: dineInShopId,
      areaId: "area-treatment",
      type: "BED",
      label: "2号床",
      capacity: 1,
      status: "OCCUPIED",
      qrCodeId: "qr-bed-2",
      currentSessionId: "session-bed2",
      metadata: { facilityFeeJpy: 0, seatLabel: "施术中" }
    },
    {
      id: "facility-counter-5",
      shopId: dineInShopId,
      areaId: "area-bar",
      type: "COUNTER_SEAT",
      label: "吧台 5号位",
      capacity: 1,
      status: "CLEANING",
      qrCodeId: "qr-shop-menu"
    }
  ],
  diningSessions: [
    {
      id: "session-a08",
      shopId: dineInShopId,
      facilityUnitId: "facility-table-a08",
      status: "ACTIVE",
      openedByUserId: "customer-1",
      assignedStaffId: "staff-yamada",
      partySize: 3,
      openedAt: "2026-05-08T18:05:00+09:00"
    },
    {
      id: "session-vip3",
      shopId: dineInShopId,
      facilityUnitId: "facility-room-vip3",
      status: "CHECKOUT_REQUESTED",
      openedByStaffId: "staff-manager",
      assignedStaffId: "staff-tanaka",
      assignedCastId: "cast-riko",
      partySize: 6,
      openedAt: "2026-05-08T17:20:00+09:00",
      billLockedAt: "2026-05-08T19:35:00+09:00"
    },
    {
      id: "session-bed2",
      shopId: dineInShopId,
      facilityUnitId: "facility-bed-2",
      status: "ACTIVE",
      openedByUserId: "customer-2",
      assignedStaffId: "staff-suzuki",
      assignedCastId: "cast-mia",
      partySize: 1,
      openedAt: "2026-05-08T18:25:00+09:00"
    }
  ],
  menus: [
    {
      id: "menu-dinner",
      shopId: dineInShopId,
      kind: "FOOD",
      name: { zh: "菜单", ja: "フードメニュー", en: "Food menu", ko: "식사 메뉴" },
      serviceMode: "DINE_IN",
      defaultLanguage: "ja",
      active: true,
      facilityTypeScope: ["TABLE", "COUNTER_SEAT", "BOOTH"]
    },
    {
      id: "menu-drinks",
      shopId: dineInShopId,
      kind: "DRINK",
      name: { zh: "酒单", ja: "ドリンクメニュー", en: "Drink menu", ko: "주류/음료 메뉴" },
      serviceMode: "ROOM",
      defaultLanguage: "ja",
      active: true,
      facilityTypeScope: ["TABLE", "COUNTER_SEAT", "BOOTH", "ROOM", "PRIVATE_AREA", "BED"]
    },
    {
      id: "menu-service",
      shopId: dineInShopId,
      kind: "SERVICE",
      name: { zh: "服务单", ja: "サービスメニュー", en: "Service menu", ko: "서비스 메뉴" },
      serviceMode: "BED",
      defaultLanguage: "ja",
      active: true,
      facilityTypeScope: ["ROOM", "PRIVATE_AREA", "BED"]
    }
  ],
  menuCategories: [
    { id: "cat-recommend", menuId: "menu-dinner", name: { zh: "推荐", ja: "おすすめ", en: "Recommended", ko: "추천" }, sortOrder: 1 },
    { id: "cat-set", menuId: "menu-dinner", name: { zh: "套餐", ja: "セット", en: "Sets", ko: "세트" }, sortOrder: 2 },
    { id: "cat-appetizer", menuId: "menu-dinner", name: { zh: "前菜", ja: "前菜", en: "Appetizers", ko: "전채" }, sortOrder: 3 },
    { id: "cat-cuisine", menuId: "menu-dinner", name: { zh: "料理", ja: "料理", en: "Dishes", ko: "요리" }, sortOrder: 4 },
    { id: "cat-staple", menuId: "menu-dinner", name: { zh: "主食", ja: "主食", en: "Staples", ko: "주식" }, sortOrder: 5 },
    { id: "cat-alcohol", menuId: "menu-drinks", name: { zh: "酒水", ja: "アルコール", en: "Alcohol", ko: "주류" }, sortOrder: 1 },
    { id: "cat-soft-drink", menuId: "menu-drinks", name: { zh: "饮料", ja: "ソフトドリンク", en: "Soft drinks", ko: "음료" }, sortOrder: 2 },
    { id: "cat-service", menuId: "menu-service", name: { zh: "服务", ja: "サービス", en: "Services", ko: "서비스" }, sortOrder: 1 }
  ],
  menuItems: [
    {
      id: "item-beer",
      menuId: "menu-drinks",
      categoryId: "cat-alcohol",
      name: { zh: "生啤", ja: "生ビール", en: "Draft beer", ko: "생맥주" },
      description: { zh: "清爽大杯，可选少冰。", ja: "すっきりした一杯。氷少なめ対応。", en: "Fresh draft beer.", ko: "시원한 생맥주." },
      imageUrl: imageBank.restaurant,
      basePriceJpy: 780,
      taxMode: "TAX_INCLUDED",
      minimumOrderQuantity: 1,
      maximumPerOrderQuantity: 6,
      maximumPerPersonQuantity: 3,
      specialOffer: { active: false, priceJpy: 680, label: "特价" },
      productionArea: "BAR",
      stockStatus: "AVAILABLE",
      active: true,
      optionGroups: [
        {
          id: "beer-size",
          name: { zh: "杯型", ja: "サイズ", en: "Size", ko: "사이즈" },
          required: false,
          options: [
            { id: "beer-medium", name: { zh: "中杯", ja: "中", en: "Medium", ko: "중" }, priceDeltaJpy: 0 },
            { id: "beer-large", name: { zh: "大杯", ja: "大", en: "Large", ko: "대" }, priceDeltaJpy: 220 }
          ]
        }
      ],
      restrictionFlags: ["ALCOHOL", "AGE_CHECK", "IN_STORE_ONLY"]
    },
    {
      id: "item-chicken",
      menuId: "menu-dinner",
      categoryId: "cat-appetizer",
      name: { zh: "炸鸡拼盘", ja: "唐揚げ盛り合わせ", en: "Fried chicken plate", ko: "가라아게 플레이트" },
      description: { zh: "适合 2-3 人分享，可备注酱汁。", ja: "2-3 名向け。ソース指定可。", en: "Share plate for 2-3.", ko: "2-3인 공유 메뉴." },
      imageUrl: imageBank.cafe,
      basePriceJpy: 1280,
      taxMode: "TAX_INCLUDED",
      minimumOrderQuantity: 1,
      maximumPerOrderQuantity: 4,
      specialOffer: { active: false, priceJpy: 980, label: "今日特价" },
      productionArea: "KITCHEN",
      stockStatus: "LIMITED",
      active: true
    },
    {
      id: "item-burger",
      menuId: "menu-dinner",
      categoryId: "cat-staple",
      name: { zh: "和牛汉堡", ja: "和牛バーガー", en: "Wagyu burger", ko: "와규 버거" },
      description: { zh: "招牌汉堡，可加芝士和薯条。", ja: "看板バーガー。チーズとポテト追加可。", en: "Signature burger.", ko: "시그니처 버거." },
      imageUrl: imageBank.restaurant,
      basePriceJpy: 1680,
      taxMode: "TAX_INCLUDED",
      minimumOrderQuantity: 1,
      maximumPerOrderQuantity: 4,
      specialOffer: { active: true, priceJpy: 1480, label: "限时特价" },
      productionArea: "KITCHEN",
      stockStatus: "AVAILABLE",
      active: true
    },
    {
      id: "item-champagne",
      menuId: "menu-drinks",
      categoryId: "cat-alcohol",
      name: { zh: "VIP 香槟套餐", ja: "VIP シャンパンセット", en: "VIP champagne set", ko: "VIP 샴페인 세트" },
      description: { zh: "含 2 小时包厢服务与软饮。", ja: "2 時間ルームサービス・ソフトドリンク付き。", en: "Includes 2h room service.", ko: "2시간 룸 서비스 포함." },
      imageUrl: imageBank.cafe,
      basePriceJpy: 38000,
      taxMode: "TAX_INCLUDED",
      minimumOrderQuantity: 1,
      maximumPerOrderQuantity: 2,
      maximumPerPersonQuantity: 1,
      specialOffer: { active: false, priceJpy: 32800, label: "特价" },
      productionArea: "BAR",
      stockStatus: "AVAILABLE",
      active: true,
      facilityTypeScope: ["ROOM", "PRIVATE_AREA"],
      restrictionFlags: ["ALCOHOL", "AGE_CHECK", "IN_STORE_ONLY"]
    },
    {
      id: "item-extra-care",
      menuId: "menu-service",
      categoryId: "cat-service",
      name: { zh: "护理加钟 20 分钟", ja: "ケア延長 20 分", en: "Care extension 20 min", ko: "케어 연장 20분" },
      description: { zh: "绑定当前担当技师，完成后可评价。", ja: "担当スタッフに紐づけ、完了後に評価できます。", en: "Linked to assigned cast.", ko: "담당자와 연결됩니다." },
      imageUrl: imageBank.massage,
      basePriceJpy: 3200,
      taxMode: "TAX_INCLUDED",
      minimumOrderQuantity: 1,
      maximumPerOrderQuantity: 3,
      specialOffer: { active: false, priceJpy: 2800, label: "特价" },
      productionArea: "CAST",
      stockStatus: "AVAILABLE",
      active: true,
      facilityTypeScope: ["BED"]
    }
  ],
  orderItems: [
    {
      id: "order-item-a08-beer",
      orderId: "order-a08-1",
      menuItemId: "item-beer",
      nameSnapshot: "生啤",
      priceSnapshotJpy: 780,
      quantity: 2,
      optionsSnapshot: ["中杯"],
      note: "少冰",
      productionArea: "BAR",
      status: "READY"
    },
    {
      id: "order-item-a08-chicken",
      orderId: "order-a08-1",
      menuItemId: "item-chicken",
      nameSnapshot: "炸鸡拼盘",
      priceSnapshotJpy: 1280,
      quantity: 1,
      optionsSnapshot: [],
      productionArea: "KITCHEN",
      status: "PREPARING"
    },
    {
      id: "order-item-vip3-champagne",
      orderId: "order-vip3-1",
      menuItemId: "item-champagne",
      nameSnapshot: "VIP 香槟套餐",
      priceSnapshotJpy: 38000,
      quantity: 2,
      optionsSnapshot: ["2小时"],
      productionArea: "BAR",
      status: "SERVED",
      servedAt: "2026-05-08T18:50:00+09:00"
    },
    {
      id: "order-item-bed2-care",
      orderId: "order-bed2-1",
      menuItemId: "item-extra-care",
      nameSnapshot: "护理加钟 20 分钟",
      priceSnapshotJpy: 3200,
      quantity: 1,
      optionsSnapshot: [],
      productionArea: "CAST",
      status: "CONFIRMED"
    }
  ],
  orders: [
    {
      id: "order-a08-1",
      orderNo: "DINE-20260508-0008",
      shopId: dineInShopId,
      sessionId: "session-a08",
      facilityUnitId: "facility-table-a08",
      userId: "customer-1",
      guestLabel: "林小姐",
      status: "PREPARING",
      subtotalJpy: 2840,
      taxJpy: 0,
      serviceFeeJpy: 284,
      facilityFeeJpy: 0,
      discountJpy: 0,
      totalJpy: 3124,
      createdAt: "2026-05-08T18:18:00+09:00",
      acceptedAt: "2026-05-08T18:20:00+09:00",
      assignedStaffId: "staff-yamada",
      alertFlags: ["用户催单"]
    },
    {
      id: "order-vip3-1",
      orderNo: "DINE-20260508-0011",
      shopId: dineInShopId,
      sessionId: "session-vip3",
      facilityUnitId: "facility-room-vip3",
      userId: "customer-3",
      guestLabel: "VIP 访客",
      status: "CHECKOUT_REQUESTED",
      subtotalJpy: 76000,
      taxJpy: 0,
      serviceFeeJpy: 7600,
      facilityFeeJpy: 12000,
      discountJpy: 0,
      totalJpy: 95600,
      createdAt: "2026-05-08T17:55:00+09:00",
      acceptedAt: "2026-05-08T17:56:00+09:00",
      assignedStaffId: "staff-tanaka",
      alertFlags: ["待结账"]
    },
    {
      id: "order-bed2-1",
      orderNo: "DINE-20260508-0014",
      shopId: dineInShopId,
      sessionId: "session-bed2",
      facilityUnitId: "facility-bed-2",
      userId: "customer-2",
      guestLabel: "高桥先生",
      status: "ACCEPTED",
      subtotalJpy: 3200,
      taxJpy: 0,
      serviceFeeJpy: 320,
      facilityFeeJpy: 0,
      discountJpy: 0,
      totalJpy: 3520,
      createdAt: "2026-05-08T18:36:00+09:00",
      acceptedAt: "2026-05-08T18:38:00+09:00",
      assignedStaffId: "staff-suzuki",
      alertFlags: []
    }
  ],
  payments: [
    {
      id: "payment-vip3-1",
      shopId: dineInShopId,
      sessionId: "session-vip3",
      amountJpy: 95600,
      method: "POS",
      status: "OFFLINE_PENDING_CONFIRMATION",
      posReference: "POS-8831"
    }
  ],
  facilityAssignments: [
    {
      id: "assignment-a08",
      shopId: dineInShopId,
      facilityUnitId: "facility-table-a08",
      sessionId: "session-a08",
      staffId: "staff-yamada",
      role: "WAITER",
      assignedAt: "2026-05-08T18:05:00+09:00"
    },
    {
      id: "assignment-vip3",
      shopId: dineInShopId,
      facilityUnitId: "facility-room-vip3",
      sessionId: "session-vip3",
      staffId: "staff-tanaka",
      castId: "cast-riko",
      role: "MANAGER",
      assignedAt: "2026-05-08T17:20:00+09:00"
    }
  ],
  staffPresence: [
    {
      id: "presence-yamada",
      shopId: dineInShopId,
      staffId: "staff-yamada",
      staffName: "山田",
      roleName: "服务员",
      status: "BUSY",
      currentAreaId: "area-main",
      currentTaskCount: 3,
      openCallCount: 1,
      updatedAt: "2026-05-08T18:40:00+09:00"
    },
    {
      id: "presence-tanaka",
      shopId: dineInShopId,
      staffId: "staff-tanaka",
      staffName: "田中",
      roleName: "经理",
      status: "ASSIGNED",
      currentAreaId: "area-vip",
      currentTaskCount: 2,
      openCallCount: 0,
      updatedAt: "2026-05-08T18:39:00+09:00"
    },
    {
      id: "presence-cashier",
      shopId: dineInShopId,
      staffId: "staff-cashier",
      staffName: "佐藤",
      roleName: "收银",
      status: "AVAILABLE",
      currentAreaId: "area-main",
      currentTaskCount: 1,
      openCallCount: 0,
      updatedAt: "2026-05-08T18:42:00+09:00"
    },
    {
      id: "presence-kitchen",
      shopId: dineInShopId,
      staffId: "staff-kitchen",
      staffName: "高田",
      roleName: "厨房",
      status: "ON_SHIFT",
      currentAreaId: "area-main",
      currentTaskCount: 5,
      openCallCount: 0,
      updatedAt: "2026-05-08T18:37:00+09:00"
    }
  ],
  serviceCalls: [
    {
      id: "call-a08-water",
      shopId: dineInShopId,
      sessionId: "session-a08",
      facilityUnitId: "facility-table-a08",
      type: "WATER",
      status: "OPEN",
      assignedStaffId: "staff-yamada",
      createdAt: "2026-05-08T18:34:00+09:00",
      note: "加水"
    },
    {
      id: "call-vip3-checkout",
      shopId: dineInShopId,
      sessionId: "session-vip3",
      facilityUnitId: "facility-room-vip3",
      type: "CHECKOUT",
      status: "ACKNOWLEDGED",
      assignedStaffId: "staff-cashier",
      createdAt: "2026-05-08T19:35:00+09:00",
      note: "确认 POS 收款"
    }
  ],
  auditLogs: [
    {
      id: "audit-order-a08-accepted",
      shopId: dineInShopId,
      actorType: "STAFF",
      actorId: "staff-yamada",
      entityType: "ORDER",
      entityId: "order-a08-1",
      action: "dine_in.order.accepted",
      before: "PENDING",
      after: "ACCEPTED",
      createdAt: "2026-05-08T18:20:00+09:00"
    }
  ],
  reviewIntents: []
};
