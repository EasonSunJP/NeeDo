import type { Store, StoreMenuConfig, StoreOfferConfig, StorePresentationConfig } from "../types/domain";

export type StorePresentationIndustry = "massage" | "beauty" | "dining" | "cleaning";

const defaultStorePresentationByIndustry: Record<StorePresentationIndustry, StorePresentationConfig> = {
  beauty: {
    subtitle: "快节奏通勤区里的轻护理门店，适合午休补妆、下班前整理和周末约会准备。",
    favoriteCount: 1860,
    distance: "距涩谷站步行 5 分钟",
    station: "涩谷站 B1 出口",
    access: "从涩谷站 B1 出口步行约 5 分钟，门店位于二层，楼下有明显招牌。",
    seatLabel: "环境",
    menuLabel: "菜单",
    peopleLabel: "到店人数",
    paymentMethods: ["Visa / Mastercard", "PayPay", "平台预付", "银联"],
    equipment: ["化妆镜", "作品相册", "Wifi", "女性欢迎"],
    parking: "周边商场停车场可抵扣 1 小时",
    routeGuide: "预约后会同步发送楼层和门铃提示，晚间到店可直接按前台呼叫。",
    seatFilters: ["全部", "单间", "并排护理", "拍照友好", "首次推荐"],
    offers: [
      {
        id: "offer-new-beauty",
        title: "新客护理组合",
        benefit: "首单减 ¥1,500",
        conditions: "限指定基础项目，周一至周四可用",
        applicable: "单色美甲 / 自然款美睫",
        validUntil: "2026-05-10",
        stackingRule: "可与平台券叠加一次"
      },
      {
        id: "offer-photo-beauty",
        title: "返图晒单返现",
        benefit: "完成晒单返 600 积分",
        conditions: "需授权作品图展示 30 天",
        applicable: "全店项目",
        validUntil: "长期有效",
        stackingRule: "不可与会员返现叠加"
      }
    ]
  },
  dining: {
    subtitle: "适合朋友小聚和下班后轻社交，首屏先让用户看懂环境、可约时段和优惠信息。",
    favoriteCount: 3280,
    distance: "距惠比寿站步行 4 分钟",
    station: "JR 惠比寿站西口",
    access: "JR 惠比寿站西口步行 4 分钟，沿主路进入巷口后右侧即到。",
    seatLabel: "环境",
    menuLabel: "菜单",
    peopleLabel: "就餐人数",
    paymentMethods: ["信用卡", "交通卡", "PayPay", "平台订金"],
    equipment: ["包间", "吧台", "英文菜单", "禁烟区域"],
    parking: "无专属停车位，周边有合作停车楼",
    routeGuide: "高峰时段建议提前 10 分钟到店，包间会保留 15 分钟。",
    seatFilters: ["全部", "吧台", "双人桌", "包间", "聚会推荐"],
    offers: [
      {
        id: "offer-dinner-1",
        title: "平日早段套餐",
        benefit: "18:30 前入店 9 折",
        conditions: "限 2 人以上预约，需提前 2 小时下单",
        applicable: "炭火拼盘 / 双人套餐",
        validUntil: "2026-05-31",
        stackingRule: "不可与会员价叠加"
      },
      {
        id: "offer-dinner-2",
        title: "包间预约礼",
        benefit: "赠送欢迎小食",
        conditions: "包间最低消费达标即可领取",
        applicable: "4-6 人包间",
        validUntil: "长期有效",
        stackingRule: "可与新人券叠加"
      }
    ]
  },
  cleaning: {
    subtitle: "把到店咨询、方案确认和后续上门履约放到同一页里，让用户先看懂价格、流程与可约时间。",
    favoriteCount: 1260,
    distance: "目黑站附近服务中心",
    station: "JR 目黑站步行 6 分钟",
    access: "服务中心可预约到店说明，也支持在线确认后直接安排上门。",
    seatLabel: "环境",
    menuLabel: "菜单",
    peopleLabel: "服务人数",
    paymentMethods: ["平台预付", "对公转账", "现金", "信用卡"],
    equipment: ["到店咨询桌", "器材展示", "企业发票", "照片验收"],
    parking: "支持作业车辆短停确认",
    routeGuide: "到店咨询后可直接锁定上门时间，器材说明和报价单会同步发送。",
    seatFilters: ["全部", "首次咨询", "企业客户", "修水管", "深度清洁"],
    offers: [
      {
        id: "offer-clean-1",
        title: "首次上门减免",
        benefit: "首单最高减 ¥2,000",
        conditions: "限 2 小时以上标准方案",
        applicable: "家庭日常保洁 / 修水管",
        validUntil: "2026-05-20",
        stackingRule: "不可与企业价叠加"
      },
      {
        id: "offer-clean-2",
        title: "周期预约礼",
        benefit: "连续 4 周返 1 次深度清洁券",
        conditions: "每周固定时段履约",
        applicable: "家庭长期维护",
        validUntil: "长期有效",
        stackingRule: "可与平台积分叠加"
      }
    ]
  },
  massage: {
    subtitle: "安静私密的身体护理门店，强调最近可约、房型、担当与深夜放松体验。",
    favoriteCount: 2420,
    distance: "距银座站步行 3 分钟",
    station: "东京 Metro 银座站 A9 出口",
    access: "从银座站 A9 出口步行约 3 分钟，楼下有便利店，晚间到店也容易找到。",
    seatLabel: "环境",
    menuLabel: "菜单",
    peopleLabel: "到店人数",
    paymentMethods: ["Visa / Mastercard", "PayPay", "平台预付", "交通卡"],
    equipment: ["独立更衣", "淋浴", "Wifi", "女性欢迎"],
    parking: "附近付费停车场步行 2 分钟",
    routeGuide: "19:00 后电梯口门禁会自动开启，预约短信内附详细入店指引。",
    seatFilters: ["全部", "单人房", "双人房", "安静", "女性推荐"],
    offers: [
      {
        id: "offer-massage-1",
        title: "新人放松礼",
        benefit: "首单立减 ¥2,000",
        conditions: "限 60 分钟以上基础疗程",
        applicable: "肩颈舒缓 / 全身放松",
        validUntil: "2026-05-15",
        stackingRule: "可与平台券叠加一次"
      },
      {
        id: "offer-massage-2",
        title: "晚间到店优惠",
        benefit: "21:00 后预约送 10 分钟热敷",
        conditions: "需在当日 18:00 前完成预约",
        applicable: "全部房型",
        validUntil: "长期有效",
        stackingRule: "不可与会员赠时叠加"
      }
    ]
  }
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function normalizeStringArray(value: unknown, fallback: string[], options?: { allowEmpty?: boolean; maxLength?: number }) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const next = Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())));
  const limited = typeof options?.maxLength === "number" ? next.slice(0, options.maxLength) : next;

  if (limited.length > 0) {
    return limited;
  }

  return options?.allowEmpty ? [] : [...fallback];
}

function normalizeOffer(raw: Partial<StoreOfferConfig> | undefined, fallback: StoreOfferConfig, index: number): StoreOfferConfig {
  return {
    id: normalizeString(raw?.id, fallback.id || `offer-${index + 1}`),
    title: normalizeString(raw?.title, fallback.title),
    benefit: normalizeString(raw?.benefit, fallback.benefit),
    conditions: normalizeString(raw?.conditions, fallback.conditions),
    applicable: normalizeString(raw?.applicable, fallback.applicable),
    validUntil: normalizeString(raw?.validUntil, fallback.validUntil),
    stackingRule: normalizeString(raw?.stackingRule, fallback.stackingRule)
  };
}

function normalizeMenuCard(raw: Partial<StoreMenuConfig> | undefined, index: number): StoreMenuConfig {
  const fallbackId = `menu-${index + 1}`;

  return {
    id: normalizeString(raw?.id, fallbackId),
    sourceServiceId: normalizeString(raw?.sourceServiceId, normalizeString(raw?.id, fallbackId)),
    name: normalizeString(raw?.name, `菜单 ${index + 1}`),
    subtitle: normalizeString(raw?.subtitle, "门店推荐服务"),
    duration: normalizeString(raw?.duration, "60 分钟"),
    priceLabel: normalizeString(raw?.priceLabel, "到店确认"),
    audience: normalizeString(raw?.audience, "当前门店"),
    tags: normalizeStringArray(raw?.tags, [], { allowEmpty: true, maxLength: 5 }),
    cover: normalizeString(raw?.cover, ""),
    highlights: normalizeStringArray(raw?.highlights, [], { allowEmpty: true, maxLength: 5 })
  };
}

export function detectStorePresentationIndustry(store?: Pick<Store, "tags"> | null): StorePresentationIndustry {
  const tagText = store?.tags.join(" ") ?? "";

  if (tagText.includes("美甲") || tagText.includes("美睫")) {
    return "beauty";
  }

  if (tagText.includes("居酒屋") || tagText.includes("包间")) {
    return "dining";
  }

  if (tagText.includes("保洁") || tagText.includes("清扫") || tagText.includes("修水管") || tagText.includes("水回り")) {
    return "cleaning";
  }

  return "massage";
}

export function getDefaultStorePresentationConfig(industry: StorePresentationIndustry = "massage"): StorePresentationConfig {
  return clone(defaultStorePresentationByIndustry[industry]);
}

export function normalizeStorePresentationConfig(
  raw?: Partial<StorePresentationConfig> | null,
  industry: StorePresentationIndustry = "massage"
): StorePresentationConfig {
  const defaults = getDefaultStorePresentationConfig(industry);
  const rawOffers = Array.isArray(raw?.offers) ? raw.offers : [];
  const rawMenuCards = Array.isArray(raw?.menuCards) ? raw.menuCards : [];

  return {
    subtitle: normalizeString(raw?.subtitle, defaults.subtitle),
    favoriteCount: normalizeNumber(raw?.favoriteCount, defaults.favoriteCount),
    distance: normalizeString(raw?.distance, defaults.distance),
    station: normalizeString(raw?.station, defaults.station),
    access: normalizeString(raw?.access, defaults.access),
    seatLabel: normalizeString(raw?.seatLabel, defaults.seatLabel),
    menuLabel: normalizeString(raw?.menuLabel, defaults.menuLabel),
    peopleLabel: normalizeString(raw?.peopleLabel, defaults.peopleLabel),
    paymentMethods: normalizeStringArray(raw?.paymentMethods, defaults.paymentMethods, { allowEmpty: true, maxLength: 8 }),
    equipment: normalizeStringArray(raw?.equipment, defaults.equipment, { allowEmpty: true, maxLength: 10 }),
    parking: normalizeString(raw?.parking, defaults.parking),
    routeGuide: normalizeString(raw?.routeGuide, defaults.routeGuide),
    seatFilters: normalizeStringArray(raw?.seatFilters, defaults.seatFilters, { allowEmpty: true, maxLength: 8 }),
    offers: defaults.offers.map((fallback, index) => normalizeOffer(rawOffers[index], fallback, index)),
    menuCards: rawMenuCards.map((menuCard, index) => normalizeMenuCard(menuCard, index))
  };
}

export function getStorePresentationConfig(
  store?: (Pick<Store, "presentation" | "tags"> & Partial<Pick<Store, "id">>) | null,
  industry = detectStorePresentationIndustry(store)
) {
  return normalizeStorePresentationConfig(store?.presentation, industry);
}
