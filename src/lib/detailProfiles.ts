import { demoTechnicianAvatar, imageBank, orders, reviews, schedules, serviceCategories, services } from "../data/mock";
import { formatCustomerMembershipLevel, getCustomerLevelLabel, resolveCustomerMembership } from "../shared/profile-card/customerMembership";
import { formatCustomerGenderLabel, getCustomerCreditReviewCount } from "../shared/profile-card/customerProfileLabels";
import type { Customer, Review, ServiceItem, Store, Technician } from "../types/domain";
import { composeTechnicianReviewTags } from "./technicianReviewTags";
import type {
  DetailAvailabilityItem,
  DetailAvailabilityPreview,
  DetailAvailabilityTone,
  BusinessHourSlot,
  DetailBadge,
  DetailGalleryImage,
  DetailInfoRow,
  DetailPaymentMethod,
  DetailProfile,
  DetailReviewSummary,
  DetailTeamMember,
  PersonalDetailProfile,
  ShopDetailProfile,
  ShopServiceItem
} from "../types/detailProfile";
import { yen } from "./utils";

const detailDemoReferenceDate = "2026-04-17";
const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

const paymentMethodLabels: Record<DetailPaymentMethod, string> = {
  cash: "现金支付",
  offline: "线下支付",
  platform: "平台支付"
};

const customerDetailOverrides: Record<
  string,
  {
    gender: string;
    region: string;
    galleryImages?: string[];
    commonPaymentMethods?: DetailPaymentMethod[];
    preferredServiceTypes?: string[];
    registeredDuration?: string;
    cancelRate?: string;
    noShowRate?: string;
    verifiedStatus?: string;
    demandPreference?: string;
    communicationPreference?: string;
    extraTags?: string[];
    reviewCount?: number;
  }
> = {
  "cus-1": {
    gender: "女",
    region: "东京 · 新宿",
    galleryImages: [imageBank.massage, imageBank.home, imageBank.salon],
    commonPaymentMethods: ["platform", "offline"],
    preferredServiceTypes: ["上门按摩", "深夜放松", "护理预约"],
    registeredDuration: "2年4个月",
    cancelRate: "1.2%",
    noShowRate: "0.0%",
    verifiedStatus: "实名已认证 / 平台信用已认证",
    demandPreference: "偏好在预约前先确认时间、语言和付款方式，夜间预约会优先看响应速度。",
    communicationPreference: "习惯提前写清楚门禁、地址和注意事项，希望对方按备注执行。",
    extraTags: ["沟通顺畅", "守时", "支付稳定"],
    reviewCount: 28
  },
  "cus-2": {
    gender: "男",
    region: "东京 · 涩谷",
    galleryImages: [imageBank.restaurant, imageBank.cafe, imageBank.home],
    commonPaymentMethods: ["offline", "cash"],
    preferredServiceTypes: ["餐饮预约", "周末聚餐"],
    registeredDuration: "1年3个月",
    cancelRate: "3.4%",
    noShowRate: "0.8%",
    verifiedStatus: "实名已认证",
    demandPreference: "偏好先看环境照片、菜单和支付方式，再确认是否下单。",
    communicationPreference: "喜欢简短直接的确认方式，临时变更会尽量提前说明。",
    extraTags: ["周末高活跃", "线下支付稳定"],
    reviewCount: 9
  },
  "cus-3": {
    gender: "女",
    region: "东京 · 银座",
    galleryImages: [imageBank.salon, imageBank.massage, imageBank.cafe],
    commonPaymentMethods: ["platform", "cash"],
    preferredServiceTypes: ["到店美业", "指名预约", "英语沟通服务"],
    registeredDuration: "3年1个月",
    cancelRate: "0.6%",
    noShowRate: "0.0%",
    verifiedStatus: "实名已认证 / 平台高信用用户",
    demandPreference: "出差期间优先选择支持英语沟通和平台支付的门店或技师。",
    communicationPreference: "重视预约准时与服务确认，希望看到明确的价格与规则。",
    extraTags: ["高复购", "高客单", "英语可沟通"],
    reviewCount: 41
  }
};

const technicianDetailOverrides: Record<
  string,
  {
    gender: string;
    region: string;
    galleryImages?: string[];
    serviceMode?: string;
    workYears?: string;
    startPrice?: string;
    availableSchedule?: string;
    minUserCreditScore?: string;
    onlineLabel?: string;
    bookableLabel?: string;
    extraTags?: string[];
    introStyle?: string;
    introStrength?: string;
    introExtra?: string;
  }
> = {
  "tech-1": {
    gender: "女",
    region: "东京 · 银座",
    galleryImages: [demoTechnicianAvatar, imageBank.massageAlt, imageBank.massage, imageBank.care, imageBank.salon],
    serviceMode: "到店 / 指定上门",
    workYears: "6年",
    startPrice: "¥12,000",
    availableSchedule: "今日 18:00-23:00",
    minUserCreditScore: "7.5",
    onlineLabel: "在线",
    bookableLabel: "可预约",
    extraTags: ["沟通顺畅", "准时", "高回访率", "女性顾客友好"],
    introStyle: "服务前会先确认肩颈压力点、睡眠状态和希望避开的力度，过程偏安静、细致，适合下班后放松。",
    introStrength: "肩颈调理、睡眠放松、轻芳疗和深层舒缓是高频回访项目，适合到店护理，也支持指定区域上门。",
    introExtra: "可中文 / 日语沟通。酒店或住宅上门请提前备注门禁、付款方式和体感偏好，避免现场反复确认。"
  },
  "tech-2": {
    gender: "男",
    region: "东京 · 品川",
    galleryImages: [imageBank.cleaning, imageBank.appliance, imageBank.home],
    serviceMode: "上门",
    workYears: "5年",
    startPrice: "¥8,800",
    availableSchedule: "明日 10:00-18:00",
    onlineLabel: "忙碌中",
    bookableLabel: "可排后续预约",
    extraTags: ["技术熟练", "说明清楚", "效率稳定"],
    introStyle: "偏执行效率型，擅长在较短时间内完成标准化高质量清洁。",
    introStrength: "空调清洗、修水管和家电清洁的复购率较高，适合家庭和小型办公室。",
    introExtra: "可日语 / 英语沟通，若现场条件复杂建议提前发图说明。"
  },
  "tech-3": {
    gender: "女",
    region: "东京 · 池袋",
    galleryImages: [imageBank.nail, imageBank.salon, imageBank.cafe],
    serviceMode: "到店 / 上门",
    workYears: "4年",
    startPrice: "¥9,600",
    availableSchedule: "今日 12:00-20:00",
    onlineLabel: "在线",
    bookableLabel: "可预约",
    extraTags: ["审美稳定", "耐心沟通", "外语可沟通"],
    introStyle: "风格偏精致耐看，擅长根据客户场景做低调但有辨识度的设计。",
    introStrength: "美甲、美睫和上门美业咨询响应快，适合通勤和短期活动前预约。",
    introExtra: "可中文 / 日语沟通，若有参考图可提前发送。"
  }
};

const shopDetailOverrides: Record<
  string,
  {
    categories: string[];
    galleryImages?: string[];
    nearestStation?: string;
    accessInfo?: string;
    averagePrice?: string;
    startPrice?: string;
    paymentMethods?: DetailPaymentMethod[];
    supportForeigner?: boolean;
    languages?: string[];
    reservable?: boolean;
    holidayInfo?: string;
    cancelPolicy?: string;
    shopRules?: string;
    platformRecommendation?: string;
    environmentFeature?: string;
    landmark?: string;
    categoryIds?: string[];
    reviewTags?: string[];
  }
> = {
  "store-1": {
    categories: ["放松护理", "身体调理"],
    galleryImages: [imageBank.massage, imageBank.salon, imageBank.home],
    nearestStation: "银座站 A13 出口步行 3 分钟",
    accessInfo: "从银座中央通进入三丁目巷内，电梯直达 4F。",
    averagePrice: "人均 ¥11,000",
    startPrice: "¥8,000 起",
    paymentMethods: ["platform", "offline", "cash"],
    supportForeigner: true,
    languages: ["日本語", "中文", "English"],
    reservable: true,
    holidayInfo: "不定休，节假日以预约页显示为准",
    cancelPolicy: "开始前 6 小时内取消收取 30%，开始前 2 小时内取消收取 50%。",
    shopRules: "请提前 5 分钟到店；如需指定技师或语言，请在备注中提前说明。",
    platformRecommendation: "安静度和复购率稳定，适合下班后快速放松或长期调理。",
    environmentFeature: "主打安静私密护理，包间与灯光氛围都偏放松系。",
    landmark: "临近银座三越与松屋银座",
    categoryIds: ["massage", "care", "beauty"],
    reviewTags: ["手法稳定", "环境安静", "沟通舒服", "回访率高"]
  },
  "store-2": {
    categories: ["美甲", "美睫"],
    galleryImages: [imageBank.nail, imageBank.salon, imageBank.cafe],
    nearestStation: "涩谷站 Hachiko 口步行 6 分钟",
    accessInfo: "穿过公园通后右转进入神南小路，2F 临街门店。",
    averagePrice: "人均 ¥8,800",
    startPrice: "¥6,500 起",
    paymentMethods: ["platform", "cash"],
    supportForeigner: true,
    languages: ["日本語", "中文"],
    reservable: true,
    holidayInfo: "周三固定休息",
    cancelPolicy: "开始前一天 20:00 后取消将影响后续预约优先级。",
    shopRules: "复杂款式建议提前发送参考图；迟到 15 分钟以上需重新确认档期。",
    platformRecommendation: "适合通勤人群与周末活动前护理，出片快、沟通成本低。",
    environmentFeature: "年轻设计师团队，款式更新快，适合季节性主题预约。",
    landmark: "靠近 MIYASHITA PARK",
    categoryIds: ["beauty"],
    reviewTags: ["款式更新快", "上手细致", "当日可约"]
  },
  "store-3": {
    categories: ["居酒屋", "聚餐预约"],
    galleryImages: [imageBank.restaurant, imageBank.cafe, imageBank.home],
    nearestStation: "惠比寿站西口步行 4 分钟",
    accessInfo: "从惠比寿站西口直走，第二个路口左转即可看到招牌。",
    averagePrice: "人均 ¥5,000",
    startPrice: "套餐 ¥3,800 起",
    paymentMethods: ["offline", "cash", "platform"],
    supportForeigner: true,
    languages: ["日本語", "中文"],
    reservable: true,
    holidayInfo: "周一午间休息",
    cancelPolicy: "聚餐预约请至少提前 4 小时取消，包间预约以店铺确认规则为准。",
    shopRules: "包间与多人预约请提前说明人数和是否需要中文菜单。",
    platformRecommendation: "适合朋友聚餐和轻商务预约，评价集中在菜品稳定与出餐节奏。",
    environmentFeature: "炭火串烧与季节小菜为主，适合晚餐与小型聚会。",
    landmark: "靠近惠比寿南二丁目街角",
    categoryIds: ["dining"],
    reviewTags: ["菜品稳定", "气氛轻松", "中文菜单"]
  },
  "store-4": {
    categories: ["家庭保洁", "家电清洗"],
    galleryImages: [imageBank.cleaning, imageBank.home, imageBank.repair],
    nearestStation: "目黑站步行 8 分钟",
    accessInfo: "从目黑站东口出发，沿山手通方向步行进入下目黑二丁目。",
    averagePrice: "单次 ¥9,600",
    startPrice: "¥6,800 起",
    paymentMethods: ["platform", "offline"],
    supportForeigner: true,
    languages: ["日本語", "English"],
    reservable: true,
    holidayInfo: "年末年初调整营业，以预约页为准",
    cancelPolicy: "上门服务开始前 12 小时内取消收取基础出勤费。",
    shopRules: "请提前确认停车、门禁和所需清洁范围；特殊污渍会现场确认。",
    platformRecommendation: "适合固定周期家庭保洁和家电清洗，规则清晰、响应稳定。",
    environmentFeature: "以标准化清洁流程和验收记录为主，更强调结果一致性。",
    landmark: "靠近目黑不动前沿线",
    categoryIds: ["cleaning", "appliance", "deep", "homecare"],
    reviewTags: ["到达准时", "清洁彻底", "规则清楚"]
  }
};

function dedupeStrings(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatMonthDayLabel(dateKey: string) {
  const date = parseDateKey(dateKey);
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function formatWeekdayLabel(dateKey: string) {
  if (dateKey === detailDemoReferenceDate) {
    return "今";
  }

  const diffDays = Math.round((parseDateKey(dateKey).getTime() - parseDateKey(detailDemoReferenceDate).getTime()) / 86_400_000);

  if (diffDays === 1) {
    return "明";
  }

  return weekdayLabels[parseDateKey(dateKey).getDay()] ?? "";
}

function formatTenScaleScore(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }

  return Number(Math.max(0, Math.min(10, value)).toFixed(1));
}

function normalizeFiveStarScore(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }

  return formatTenScaleScore(value);
}

function inferCustomerScore(customer: Customer) {
  return formatTenScaleScore(customer.activeScore / 20);
}

function inferReviewUnitLabel(roleType: DetailProfile["roleType"]) {
  return roleType === "shop" ? "条点评" : "人评价";
}

function buildGalleryImages(displayName: string, sources: string[], fallback: string[]) {
  return dedupeStrings([...sources, ...fallback]).map((src, index): DetailGalleryImage => ({
    src,
    alt: `${displayName} 图片 ${index + 1}`
  }));
}

function getBadgeTone(index: number): DetailBadge["tone"] {
  const tones: Array<DetailBadge["tone"]> = ["primary", "success", "warning", "neutral"];
  return tones[index % tones.length];
}

function buildTagBadges(labels: string[]) {
  return dedupeStrings(labels).map((label, index) => ({
    label,
    tone: getBadgeTone(index)
  }));
}

function buildPaymentMethodLabels(methods: DetailPaymentMethod[]) {
  return dedupeStrings(methods.map((method) => paymentMethodLabels[method]));
}

function buildUpcomingDateKeys(length = 7) {
  const baseDate = parseDateKey(detailDemoReferenceDate);
  return Array.from({ length }, (_, index) => formatDateKey(addDays(baseDate, index)));
}

function buildAvailabilityItem(input: {
  dateKey: string;
  statusLabel: string;
  tone: DetailAvailabilityTone;
  meta?: string;
  caption?: string;
}): DetailAvailabilityItem {
  return {
    id: input.dateKey,
    dateLabel: formatMonthDayLabel(input.dateKey),
    weekdayLabel: formatWeekdayLabel(input.dateKey),
    statusLabel: input.statusLabel,
    tone: input.tone,
    meta: input.meta,
    caption: input.caption
  };
}

function formatTimeRange(start: string, end: string) {
  return `${start}-${end}`;
}

function getCustomerReviewCount(customer: Customer) {
  return customerDetailOverrides[customer.id]?.reviewCount ?? getCustomerCreditReviewCount(customer);
}

function getCustomerGender(customer: Customer) {
  return customerDetailOverrides[customer.id]?.gender ?? formatCustomerGenderLabel(customer.gender);
}

function getCustomerRegion(customer: Customer) {
  return customerDetailOverrides[customer.id]?.region ?? "东京";
}

function getCustomerPaymentMethods(customer: Customer) {
  return customerDetailOverrides[customer.id]?.commonPaymentMethods ?? (customer.tags.some((tag) => tag.includes("线下")) ? ["offline", "cash"] : ["platform", "offline"]);
}

function getCustomerPreferredServiceTypes(customer: Customer) {
  return customerDetailOverrides[customer.id]?.preferredServiceTypes ?? customer.tags.slice(0, 3);
}

function getCustomerVerifiedStatus(customer: Customer) {
  return customerDetailOverrides[customer.id]?.verifiedStatus;
}

function getCustomerRecentSummary(customer: Customer) {
  return reviews.find((review) => review.customerName === customer.name)?.content;
}

function getCustomerUpcomingOrders(customer: Customer) {
  return orders
    .filter((order) => order.customerId === customer.id && order.bookedAt.slice(0, 10) >= detailDemoReferenceDate)
    .sort((left, right) => left.bookedAt.localeCompare(right.bookedAt));
}

function getCustomerAvailabilityPreview(customer: Customer): DetailAvailabilityPreview {
  const upcomingOrders = getCustomerUpcomingOrders(customer);
  const preferredServiceTypes = getCustomerPreferredServiceTypes(customer);
  const nextBookingDateKey = customer.nextBookingAt?.slice(0, 10);
  const items = buildUpcomingDateKeys().map((dateKey, index) => {
    const dayOrders = upcomingOrders.filter((order) => order.bookedAt.startsWith(dateKey));
    const primaryOrder = dayOrders[0];

    if (primaryOrder) {
      const statusLabel =
        primaryOrder.status === "inService"
          ? "服务中"
          : primaryOrder.status === "scheduled" || primaryOrder.status === "confirmed"
            ? "已预约"
            : "待确认";

      return buildAvailabilityItem({
        dateKey,
        statusLabel,
        tone: primaryOrder.status === "inService" ? "busy" : "available",
        meta: primaryOrder.bookedAt.slice(11, 16),
        caption: primaryOrder.area
      });
    }

    if (nextBookingDateKey === dateKey && customer.nextBookingAt) {
      return buildAvailabilityItem({
        dateKey,
        statusLabel: "已预约",
        tone: "available",
        meta: customer.nextBookingAt.slice(11, 16),
        caption: getCustomerRegion(customer)
      });
    }

    return buildAvailabilityItem({
      dateKey,
      statusLabel: index === 0 ? "可联系" : index % 3 === 0 ? "空闲" : "无安排",
      tone: index === 0 ? "limited" : "neutral",
      meta: preferredServiceTypes[0] ?? "常用服务",
      caption: getCustomerRegion(customer)
    });
  });

  return {
    title: "近期预约 / 活跃安排",
    caption: "保留同一套详情骨架，但对用户页展示最近预约与联系节奏，而不是硬套技师排班。",
    actionLabel: "查看预约记录",
    footer: customer.nextBookingAt ? `下次预约 ${customer.nextBookingAt}` : `最近下单 ${customer.lastOrderAt}`,
    items
  };
}

function getTechnicianGender(technician: Technician) {
  return technicianDetailOverrides[technician.id]?.gender ?? "未公开";
}

function getTechnicianRegion(technician: Technician) {
  return technicianDetailOverrides[technician.id]?.region ?? technician.serviceAreas[0] ?? "东京";
}

function getTechnicianServiceMode(technician: Technician) {
  return technicianDetailOverrides[technician.id]?.serviceMode ?? (technician.role === "cleaner" ? "上门" : "到店 / 上门");
}

function getTechnicianWorkYears(technician: Technician) {
  return technicianDetailOverrides[technician.id]?.workYears ?? `${Math.max(2, Math.round(technician.orderCount / 220))}年`;
}

function getTechnicianStartPrice(technician: Technician) {
  if (technicianDetailOverrides[technician.id]?.startPrice) {
    return technicianDetailOverrides[technician.id]?.startPrice ?? "";
  }

  if (technician.bidBudgetMin) {
    return yen(Number(technician.bidBudgetMin));
  }

  return "¥8,000";
}

function getTechnicianAvailableSchedule(technician: Technician) {
  if (technicianDetailOverrides[technician.id]?.availableSchedule) {
    return technicianDetailOverrides[technician.id]?.availableSchedule ?? "";
  }

  const freeSlot = schedules.find((schedule) => schedule.staffId === technician.id && schedule.status === "free");

  return freeSlot ? `${freeSlot.date} ${freeSlot.startTime}-${freeSlot.endTime}` : "按聊天确认";
}

function getTechnicianPaymentMethods(technician: Technician) {
  const source = technician.paymentMethods ?? ["platform", "offline"];
  const methods: DetailPaymentMethod[] = [];

  if (source.includes("platform")) {
    methods.push("platform");
  }

  if (source.includes("offline")) {
    methods.push("offline");
  }

  if (technician.role !== "cleaner") {
    methods.push("cash");
  }

  return Array.from(new Set(methods));
}

function getTechnicianPrepayRequired(technician: Technician) {
  return technician.paymentMethods?.includes("prepay") ?? false;
}

function getTechnicianCreditThreshold(technician: Technician) {
  return technicianDetailOverrides[technician.id]?.minUserCreditScore;
}

function getTechnicianRecentSummary(technician: Technician) {
  return reviews.find((review) => review.targetName === technician.name)?.content;
}

export function getTechnicianReviewDisplayTags(technician: Technician) {
  const config = technicianDetailOverrides[technician.id] ?? {};

  return composeTechnicianReviewTags({
    specialTags: technician.profileTags ?? [],
    fallbackTags: technician.skills,
    customerCustomTags: config.extraTags ?? []
  });
}

function getTechnicianUpcomingSchedules(technician: Technician) {
  return schedules
    .filter((schedule) => schedule.staffId === technician.id && schedule.date >= detailDemoReferenceDate)
    .sort((left, right) => `${left.date}${left.startTime}`.localeCompare(`${right.date}${right.startTime}`));
}

function getTechnicianAvailabilityPreview(technician: Technician): DetailAvailabilityPreview {
  const upcomingSchedules = getTechnicianUpcomingSchedules(technician);
  const items = buildUpcomingDateKeys().map((dateKey) => {
    const daySchedules = upcomingSchedules.filter((schedule) => schedule.date === dateKey);
    const freeSchedules = daySchedules.filter((schedule) => schedule.status === "free");
    const bookedSchedules = daySchedules.filter((schedule) => schedule.status === "booked");
    const blockedSchedules = daySchedules.filter((schedule) => schedule.status === "blocked");

    if (freeSchedules.length > 0) {
      const firstFree = freeSchedules[0];

      return buildAvailabilityItem({
        dateKey,
        statusLabel: bookedSchedules.length > 0 ? "仍可预约" : "可预约",
        tone: bookedSchedules.length > 0 ? "limited" : "available",
        meta: formatTimeRange(firstFree.startTime, firstFree.endTime),
        caption: technician.serviceAreas[0] ?? getTechnicianRegion(technician)
      });
    }

    if (bookedSchedules.length > 0) {
      return buildAvailabilityItem({
        dateKey,
        statusLabel: "档期紧张",
        tone: "busy",
        meta: formatTimeRange(bookedSchedules[0].startTime, bookedSchedules[bookedSchedules.length - 1].endTime),
        caption: technician.serviceAreas[0] ?? getTechnicianRegion(technician)
      });
    }

    if (blockedSchedules.length > 0) {
      return buildAvailabilityItem({
        dateKey,
        statusLabel: "休息",
        tone: "offline",
        meta: "暂停接单",
        caption: technician.serviceAreas[0] ?? getTechnicianRegion(technician)
      });
    }

    return buildAvailabilityItem({
      dateKey,
      statusLabel: technician.status === "available" ? "可沟通" : technician.status === "busy" ? "可候补" : "休息",
      tone: technician.status === "available" ? "neutral" : technician.status === "busy" ? "limited" : "offline",
      meta: getTechnicianAvailableSchedule(technician),
      caption: technician.serviceAreas[0] ?? getTechnicianRegion(technician)
    });
  });

  return {
    title: "近期可预约 / 排班概览",
    caption: "首屏只放最近 7 天关键档期，减少厚重表格感，继续保留完整预约判断信息。",
    actionLabel: "查看更多排班",
    footer: getTechnicianAvailableSchedule(technician),
    items
  };
}

function parseBusinessHours(input: string): BusinessHourSlot[] {
  const matched = input.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);

  if (!matched) {
    return [{ label: "每日", open: input, close: "" }];
  }

  return [{ label: "每日", open: matched[1], close: matched[2] }];
}

function compareTimeValue(open: string, close: string) {
  const [openHour, openMinute] = open.split(":").map(Number);
  const [closeHour, closeMinute] = close.split(":").map(Number);

  return {
    openMinutes: openHour * 60 + openMinute,
    closeMinutes: closeHour * 60 + closeMinute
  };
}

function getShopOpenStatus(store: Store) {
  const slots = parseBusinessHours(store.businessHours);
  const firstSlot = slots[0];

  if (!firstSlot || !firstSlot.close) {
    return store.openStatus === "open" ? "营业中" : store.openStatus === "resting" ? "休息中" : "已打烊";
  }

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const { openMinutes, closeMinutes } = compareTimeValue(firstSlot.open, firstSlot.close);
  const isOpen = closeMinutes > openMinutes
    ? nowMinutes >= openMinutes && nowMinutes <= closeMinutes
    : nowMinutes >= openMinutes || nowMinutes <= closeMinutes;

  return isOpen ? "营业中" : "休息中";
}

function getShopConfig(store: Store) {
  return shopDetailOverrides[store.id] ?? {
    categories: [store.mode === "store" ? "到店服务" : "上门服务"],
    paymentMethods: ["platform", "offline"] as DetailPaymentMethod[],
    supportForeigner: false,
    languages: ["日本語"],
    reservable: true,
    categoryIds: [store.mode === "store" ? "beauty" : "cleaning"],
    reviewTags: store.tags
  };
}

function pickShopServices(store: Store) {
  const config = getShopConfig(store);
  const categoryIds = config.categoryIds ?? [];
  const matchedServices = services.filter((service) => categoryIds.includes(service.categoryId)).slice(0, 4);

  return matchedServices.map((service): ShopServiceItem => ({
    id: service.id,
    name: service.name,
    summary: service.summary,
    priceLabel: yen(service.priceFrom),
    durationLabel: `${service.packages[0]?.durationMinutes ?? 60} 分钟起`,
    tags: service.tags.slice(0, 3)
  }));
}

function pickShopTeamMembers(store: Store, technicians: Technician[]) {
  return technicians
    .filter((technician) => technician.storeId === store.id)
    .slice(0, 4)
    .map((technician): DetailTeamMember => ({
      id: technician.id,
      name: technician.nickname ?? technician.name,
      subtitle: `${technician.languages.join(" / ")} · ${technician.skills.slice(0, 2).join(" / ")}`,
      avatar: technician.avatar,
      score: normalizeFiveStarScore(technician.rating),
      reviewCount: technician.reviewCount,
      tags: dedupeStrings([...(technician.profileTags ?? []), ...technician.skills]).slice(0, 3)
    }));
}

function getShopRecentSummary(store: Store) {
  return reviews.find((review) => review.targetName === store.name)?.content;
}

function buildReviewSummary(params: {
  roleType: DetailProfile["roleType"];
  scoreLabel: string;
  score?: number;
  reviewCount: number;
  tags: string[];
  recentSummary?: string;
}): DetailReviewSummary {
  return {
    scoreLabel: params.scoreLabel,
    score: params.score,
    reviewCount: params.reviewCount,
    reviewUnitLabel: inferReviewUnitLabel(params.roleType),
    tags: dedupeStrings(params.tags).slice(0, 8),
    recentSummary: params.recentSummary
  };
}

function buildInfoRows(entries: Array<[string, string | undefined]>) {
  return entries
    .filter(([, value]) => Boolean(value && value.trim()))
    .map(([label, value]): DetailInfoRow => ({ label, value: value ?? "" }));
}

export function buildUserDetailProfile(customer: Customer): PersonalDetailProfile {
  const config = customerDetailOverrides[customer.id] ?? {};
  const reviewCount = getCustomerReviewCount(customer);
  const score = inferCustomerScore(customer);
  const paymentMethods = getCustomerPaymentMethods(customer);
  const preferredServiceTypes = getCustomerPreferredServiceTypes(customer);
  const verifiedStatus = getCustomerVerifiedStatus(customer);
  const scoreText = typeof score === "number" ? score.toFixed(1) : undefined;
  const reviewLabel = reviewCount > 0 ? `${reviewCount}人评价` : "暂无评价";
  const levelLabel = getCustomerLevelLabel(customer.activeScore);
  const membership = resolveCustomerMembership(customer.memberLevel);

  return {
    id: customer.id,
    roleType: "user",
    displayName: customer.nickname?.trim() || customer.name,
    subtitle: formatCustomerMembershipLevel(customer.memberLevel, levelLabel),
    avatar: customer.avatar,
    galleryImages: buildGalleryImages(customer.name, [customer.avatar, ...(config.galleryImages ?? [])], [imageBank.home]),
    scoreLabel: "信用度",
    score,
    reviewCount,
    reviewLabel,
    locationLabel: getCustomerRegion(customer),
    statusBadges: buildTagBadges([getCustomerGender(customer), verifiedStatus ?? "资料已完善"]).slice(0, 2),
    quickBadges: buildTagBadges([
      ...customer.languages ?? [],
      ...buildPaymentMethodLabels(paymentMethods),
      ...preferredServiceTypes,
      verifiedStatus?.includes("平台") ? "平台认证" : "",
      verifiedStatus?.includes("实名") ? "实名认证" : ""
    ]).slice(0, 8),
    summaryBadges: buildTagBadges([
      scoreText ? `信用度 ${scoreText}` : "信用度待完善",
      reviewLabel,
      getCustomerRegion(customer),
      membership.kind ? membership.label : "",
      levelLabel
    ]),
    availabilityPreview: getCustomerAvailabilityPreview(customer),
    basicInfoRows: buildInfoRows([
      ["系统ID", customer.systemId],
      ["性别", getCustomerGender(customer)],
      ["年龄", customer.age],
      ["身高", customer.height],
      ["所在区域", getCustomerRegion(customer)],
      ["支持语言", customer.languages?.join(" / ")],
      ["常用服务类型", preferredServiceTypes.join(" / ")],
      ["常用支付方式", buildPaymentMethodLabels(paymentMethods).join(" / ")],
      ["会员种类", formatCustomerMembershipLevel(customer.memberLevel, levelLabel)],
      ["历史订单数", `${customer.orderCount}`],
      ["注册时长", config.registeredDuration]
    ]),
    capabilityTitle: "信用信息",
    capabilityRows: buildInfoRows([
      ["信用度", scoreText ? `${scoreText} /5` : undefined],
      ["评价人数", reviewLabel],
      ["取消率", config.cancelRate],
      ["爽约率", config.noShowRate],
      ["认证状态", verifiedStatus],
      ["最近预约", customer.nextBookingAt],
      ["最近下单", customer.lastOrderAt]
    ]),
    introBlocks: [
      { title: "自我介绍", content: customer.bio?.trim() || "这个用户暂时还没有补充自我介绍。" },
      ...(config.demandPreference ? [{ title: "需求偏好", content: config.demandPreference }] : []),
      ...(config.communicationPreference ? [{ title: "沟通偏好", content: config.communicationPreference }] : [])
    ],
    tags: dedupeStrings([...(customer.tags ?? []), ...(config.extraTags ?? [])]),
    reviewSummary: buildReviewSummary({
      roleType: "user",
      scoreLabel: "信用度",
      score,
      reviewCount,
      tags: [...(customer.tags ?? []), ...(config.extraTags ?? [])],
      recentSummary: getCustomerRecentSummary(customer)
    })
  };
}

export function buildTechnicianDetailProfile(technician: Technician): PersonalDetailProfile {
  const config = technicianDetailOverrides[technician.id] ?? {};
  const score = normalizeFiveStarScore(technician.rating);
  const scoreText = typeof score === "number" ? score.toFixed(1) : undefined;
  const reviewLabel = technician.reviewCount > 0 ? `${technician.reviewCount}人评价` : "暂无评价";
  const paymentMethods = getTechnicianPaymentMethods(technician);
  const creditThreshold = getTechnicianCreditThreshold(technician);
  const prepayRequired = getTechnicianPrepayRequired(technician);
  const reviewDisplayTags = getTechnicianReviewDisplayTags(technician);

  return {
    id: technician.id,
    roleType: "technician",
    displayName: technician.nickname?.trim() || technician.name,
    subtitle: technician.identityLabel ?? "认证技师",
    avatar: technician.avatar,
    galleryImages: buildGalleryImages(technician.name, [...(technician.gallery ?? []), technician.avatar, ...(config.galleryImages ?? [])], [imageBank.massage]),
    scoreLabel: "服务评价",
    score,
    reviewCount: technician.reviewCount,
    reviewLabel,
    locationLabel: `${getTechnicianRegion(technician)} · ${technician.serviceAreas.join(" / ")}`,
    statusBadges: buildTagBadges([
      config.onlineLabel ?? (technician.status === "off" ? "离线" : "在线"),
      config.bookableLabel ?? (technician.status === "off" ? "暂不可预约" : "可预约"),
      getTechnicianGender(technician)
    ]).slice(0, 3),
    quickBadges: buildTagBadges([
      technician.canServeForeigners ? "可接待外国人" : "暂不接待外国人",
      ...technician.languages,
      ...technician.skills,
      ...buildPaymentMethodLabels(paymentMethods),
      prepayRequired ? "需预付" : "无需预付",
      creditThreshold ? `仅接待信用分 ≥ ${creditThreshold}` : ""
    ]).slice(0, 8),
    summaryBadges: buildTagBadges([
      scoreText ? `服务评价 ${scoreText}` : "评价待完善",
      reviewLabel,
      getTechnicianRegion(technician),
      technician.identityLabel ?? "认证技师"
    ]),
    availabilityPreview: getTechnicianAvailabilityPreview(technician),
    basicInfoRows: buildInfoRows([
      ["系统ID", technician.systemId],
      ["性别", getTechnicianGender(technician)],
      ["年龄", technician.age],
      ["身高", technician.height],
      ["所在区域", getTechnicianRegion(technician)],
      ["服务区域", technician.serviceAreas.join(" / ")],
      ["服务方式", getTechnicianServiceMode(technician)],
      ["从业年限", getTechnicianWorkYears(technician)],
      ["服务种类", technician.skills.join(" / ")],
      ["开始价格", getTechnicianStartPrice(technician)],
      ["价格区间", technician.bidBudgetMin && technician.bidBudgetMax ? `${yen(Number(technician.bidBudgetMin))} - ${yen(Number(technician.bidBudgetMax))}` : undefined],
      ["可预约时间段", getTechnicianAvailableSchedule(technician)]
    ]),
    capabilityTitle: "规则与交易信息",
    capabilityRows: buildInfoRows([
      ["服务评价", scoreText ? `${scoreText} /5` : undefined],
      ["评价人数", reviewLabel],
      ["接单率", `${technician.acceptRate}%`],
      ["取消率", `${technician.cancelRate}%`],
      ["支持支付方式", buildPaymentMethodLabels(paymentMethods).join(" / ")],
      ["是否需要预付", prepayRequired ? "需预付" : "无需预付"],
      ["接单条件", technician.status === "off" ? "当前暂不接单" : "按区域与档期确认"],
      ["信用门槛", creditThreshold ? `仅接待信用分 ≥ ${creditThreshold}` : undefined],
      ["平台担保", paymentMethods.includes("platform") ? "支持" : "暂未启用"],
      ["可接待外国人", technician.canServeForeigners ? "支持" : "暂不支持"],
      ["支持语言", technician.languages.join(" / ")]
    ]),
    introBlocks: [
      { title: "自我介绍", content: technician.bio?.trim() || "这个技师暂时还没有补充介绍。" },
      ...(config.introStyle ? [{ title: "服务风格", content: config.introStyle }] : []),
      ...(config.introStrength ? [{ title: "擅长内容", content: config.introStrength }] : []),
      ...(config.introExtra ? [{ title: "补充说明", content: config.introExtra }] : [])
    ],
    tags: dedupeStrings([...(technician.profileTags ?? []), ...(config.extraTags ?? []), ...technician.skills]),
    reviewSummary: buildReviewSummary({
      roleType: "technician",
      scoreLabel: "服务评价",
      score,
      reviewCount: technician.reviewCount,
      tags: reviewDisplayTags,
      recentSummary: getTechnicianRecentSummary(technician)
    })
  };
}

export function buildShopDetailProfile(store: Store, technicians: Technician[]): ShopDetailProfile {
  const config = getShopConfig(store);
  const businessHours = parseBusinessHours(store.businessHours);
  const score = normalizeFiveStarScore(store.rating);
  const scoreText = typeof score === "number" ? score.toFixed(1) : undefined;
  const reviewLabel = store.reviewCount > 0 ? `${store.reviewCount}条点评` : "暂无评价";
  const paymentMethods = buildPaymentMethodLabels(config.paymentMethods ?? ["platform", "offline"]);
  const pickedServices = pickShopServices(store);

  return {
    id: store.id,
    roleType: "shop",
    displayName: store.name,
    subtitle: `${config.categories.join(" / ")} · ${store.area}`,
    galleryImages: buildGalleryImages(store.name, [store.cover, ...store.gallery, ...(config.galleryImages ?? [])], [imageBank.home]),
    scoreLabel: "评分",
    score,
    reviewCount: store.reviewCount,
    reviewLabel,
    priceSummary: [config.averagePrice, config.startPrice].filter(Boolean).join(" · "),
    categories: config.categories,
    openStatusLabel: getShopOpenStatus(store),
    businessHours,
    summaryBadges: buildTagBadges([
      scoreText ? `评分 ${scoreText}` : "评分待完善",
      reviewLabel,
      store.area,
      ...config.categories
    ]),
    introBlocks: [
      { title: "店铺简介", content: store.description },
      ...(config.platformRecommendation ? [{ title: "平台推荐理由", content: config.platformRecommendation }] : []),
      ...(config.environmentFeature ? [{ title: "环境特色", content: config.environmentFeature }] : [])
    ],
    tags: dedupeStrings([...(config.reviewTags ?? []), ...store.tags]),
    reviewSummary: buildReviewSummary({
      roleType: "shop",
      scoreLabel: "店铺评分",
      score,
      reviewCount: store.reviewCount,
      tags: [...(config.reviewTags ?? []), ...store.tags],
      recentSummary: getShopRecentSummary(store)
    }),
    coreInfoItems: [
      { label: "营业状态", value: getShopOpenStatus(store), caption: `最近可约 ${store.nextSlot}` },
      {
        label: "营业时间",
        value: businessHours.map((slot) => `${slot.open}${slot.close ? `-${slot.close}` : ""}`).join(" / "),
        caption: businessHours.map((slot) => slot.label).join(" / ")
      },
      { label: "地址 / 商圈", value: store.address, caption: store.area },
      { label: "交通方式", value: config.nearestStation ?? "交通信息待补充", caption: config.accessInfo },
      { label: "支付方式", value: paymentMethods.join(" / ") || "待补充" },
      { label: "外语与接待", value: config.supportForeigner ? "可接待外国人" : "主要接待本地用户", caption: (config.languages ?? []).join(" / ") },
      { label: "是否可预约", value: config.reservable ? "可预约" : "暂不可预约" }
    ],
    detailInfoRows: buildInfoRows([
      ["店铺名称", store.name],
      ["店铺分类", config.categories.join(" / ")],
      ["地址", store.address],
      ["交通方式", config.accessInfo],
      ["最近车站", config.nearestStation],
      ["营业时间", businessHours.map((slot) => `${slot.label} ${slot.open}${slot.close ? `-${slot.close}` : ""}`).join(" / ")],
      ["休息日", config.holidayInfo],
      ["平均消费", config.averagePrice],
      ["起步价格", config.startPrice],
      ["支付方式", paymentMethods.join(" / ")],
      ["支持平台支付", (config.paymentMethods ?? []).includes("platform") ? "支持" : "不支持"],
      ["支持线下支付", (config.paymentMethods ?? []).includes("offline") ? "支持" : "不支持"],
      ["支持现金支付", (config.paymentMethods ?? []).includes("cash") ? "支持" : "不支持"],
      ["可接待外国人", config.supportForeigner ? "支持" : "暂不支持"],
      ["支持语言", (config.languages ?? []).join(" / ")],
      ["店铺规则", config.shopRules],
      ["取消规则", config.cancelPolicy]
    ]),
    serviceItems: pickedServices,
    teamMembers: pickShopTeamMembers(store, technicians),
    mapInfo: {
      address: store.address,
      access: config.accessInfo ?? "交通说明待补充",
      nearestStation: config.nearestStation,
      landmark: config.landmark
    }
  };
}

export function buildDetailProfileFromEntity(params: {
  customer?: Customer | null;
  technician?: Technician | null;
  store?: Store | null;
  technicians?: Technician[];
}) {
  if (params.customer) {
    return buildUserDetailProfile(params.customer);
  }

  if (params.technician) {
    return buildTechnicianDetailProfile(params.technician);
  }

  if (params.store) {
    return buildShopDetailProfile(params.store, params.technicians ?? []);
  }

  return null;
}

export function getServiceCategoryName(categoryId: ServiceItem["categoryId"]) {
  return serviceCategories.find((category) => category.id === categoryId)?.name ?? "服务";
}

export function getReviewByTargetName(targetName: string) {
  return reviews.find((review: Review) => review.targetName === targetName);
}
