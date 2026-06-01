import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import {
  AppIcon,
  AppTopBar,
  EmptyStatePanel,
  FeatureSegmentedTabs,
  IconMetricAction,
  PageScaffold,
  PrimaryButton,
  SecondaryButton,
  StickyBottomBar,
  UnifiedListItem,
  type IconName,
  floatingHeaderControlButtonClassName
} from "../../components/client-ui/AppScaffold";
import { featureCarouselFrameClassName, FeatureCarousel, type FeatureCarouselSlide } from "../../components/client-ui/FeatureCarousel";
import { AvailabilityCalendar } from "../../components/mobile/AvailabilityCalendar";
import { ClientEdgeMask } from "../../components/mobile/ClientEdgeMask";
import { FloatingHomeHeader, floatingHeaderGlassPanelClassName, floatingHeaderInnerClassName } from "../../components/mobile/FloatingHomeHeader";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MomentActionBar } from "../../components/mobile/MomentActionBar";
import { OfferInfoCard } from "../../components/mobile/OfferInfoCard";
import { SectionTitle } from "../../components/mobile/SectionTitle";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { ImageAdjustmentEditor } from "../../components/ui/ImageAdjustmentEditor";
import { ImageGalleryManager } from "../../components/ui/ImageGalleryManager";
import { ShareNetworkIcon } from "../../components/ui/ShareNetworkIcon";
import { customers, orders, reviews, services } from "../../data/mock";
import { coreReadApi, coreReadIdFromRoute, mapCoreShopToStore, mapCoreTechnicianToTechnician } from "../../features/core-read/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import { pricingModeApi, type BookingNavigationResponse } from "../../features/pricing-mode/api";
import { SocialEmptyState, SocialPostItem } from "../../features/social/components/UnifiedSocialUi";
import { useSocial } from "../../features/social/context";
import { profileKey, sortPostsByNewest } from "../../features/social/utils";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { appendNeedoExternalInfoPost } from "../../lib/needoExchangeBridge";
import { readImageFilesAsDataUrls } from "../../lib/imageUpload";
import { buildStoreCheckoutRoute } from "../../lib/storeBookingRoute";
import {
  detectStorePresentationIndustry,
  getStorePresentationConfig,
  normalizeStorePresentationConfig,
  type StorePresentationIndustry
} from "../../lib/storePresentation";
import { getStoreCardDecorationConfig, getStoreDecorationBlockConfig, getStoreUiDecoration } from "../../lib/storeUiDecoration";
import { cn, yen } from "../../lib/utils";
import { shareContent } from "../../lib/share";
import { TechnicianShowcaseCard } from "../../shared/profile-card";
import { SimpleRatingBadge } from "../../shared/profile-card/SimpleRatingBadge";
import { getScopedProfileDetailPath, getScopedTechnicianServiceListPath } from "../../shared/profile-detail";
import { updateCustomerEntity, updateStoreEntity, updateTechnicianEntity, useEntityStore } from "../../state/entityStore";
import type { SocialPost } from "../../features/social/types";
import type { Order, OrderStatus, Review, ServiceItem, Store, StoreCardDecorationConfig, StoreDecorationBlockId, StoreMenuConfig, StoreOfferConfig, StorePresentationConfig, Technician } from "../../types/domain";

type StoreTab = "home" | "seats" | "menu" | "moments" | "offers" | "map";
type StoreIndustry = StorePresentationIndustry;
type StoreDisplayEditorMode = "gallery" | "basic" | "presentation" | "menu" | "technician";
type StoreDisplayExternalEditorMode = Extract<StoreDisplayEditorMode, "gallery" | "basic" | "presentation">;
type ActiveStoreDisplayEditor = {
  menuCard?: MenuCard;
  mode: StoreDisplayEditorMode;
  target: string;
};
type PendingStoreImageEdit = {
  apply: (editedImage: string) => void;
  aspectRatio: number;
  description?: string;
  frameClassName?: string;
  frameWidth?: number;
  source: string;
  title: string;
};
type StoreDetailExperienceProps = {
  embedded?: boolean;
  onEditFocus?: (focus: StoreDisplayExternalEditorMode) => void;
  pricingControl?: ReactNode;
  pricingMode?: "store" | "technician";
  technicianPricingRatePercent?: number;
  privacyControl?: ReactNode;
  scope?: "user" | "merchant";
  store: Store;
  techniciansOverride?: Technician[];
};

function storeDetailRouteEntityIdToApiId(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const direct = coreReadIdFromRoute(normalized);
  if (direct) {
    return direct;
  }

  const suffix = normalized.match(/(\d+)$/)?.[1];
  return suffix ? Number(suffix) : null;
}

type SeatCard = {
  id: string;
  name: string;
  description: string;
  capacity: string;
  tags: string[];
  priceHint: string;
  slot: string;
  assignable: string;
  cover: string;
};

type MenuCard = StoreMenuConfig;

type OfferCard = StoreOfferConfig;
type StoreProfileConfig = StorePresentationConfig;
type StoreMapDetailCopy = {
  bookingRule: string;
  buyout: string;
  chargeNote: string;
  childrenPolicy: string;
  courseInfo: string;
  drinkInfo: string;
  equipmentNote: string;
  genre: string;
  locationInfo: string;
  maxReservationPeople: string;
  menuInfo: string;
  officialAccount: string;
  officialContact: string;
  phoneContact: string;
  privateRoom: string;
  seatInfo: string;
  seatCount: string;
  serviceSupport: string;
  smokingPolicy: string;
};

const baseBookingDate = new Date(2026, 3, 22);
const storeBookingCtaButtonClassName = "h-[52px] min-w-[176px] justify-center gap-2 px-7 text-center text-sm";
const storeBottomActionRowClassName = "mx-auto flex w-full max-w-[888px] items-center gap-3 px-4 pb-2";
const storeBottomSecondaryButtonClassName = "h-[52px] shrink-0 gap-2 px-5 shadow-[0_12px_26px_rgba(0,0,0,0.20)] backdrop-blur-xl";
const storeBottomPrimaryButtonClassName = "h-[52px] flex-1 gap-2 px-5 text-sm shadow-[0_12px_30px_color-mix(in_srgb,var(--client-primary)_20%,transparent)]";
const merchantScheduleEditorHref = "/merchant/schedule?tab=planning";
const storeDisplayEditorBottomBarStyle = { "--client-main-nav-action-offset": "0px" } as CSSProperties;
const storeDisplayEditorBottomMaskStyle = {
  "--client-edge-mask-bottom-mid-opacity": "0.2",
  "--client-edge-mask-bottom-mid-stop": "34%",
  "--client-edge-mask-bottom-strong-opacity": "0.64",
  "--client-edge-mask-bottom-strong-stop": "70%",
  "--client-edge-mask-bottom-end-opacity": "0.94"
} as CSSProperties;
const storeDisplayEditorContentClassName = "mx-auto grid w-full max-w-[390px] gap-4";
const storeDisplayEditorBottomShellClassName = "max-w-[480px] !px-5 !pb-[calc(max(env(safe-area-inset-bottom),12px)+10px)]";
const storeDisplayEditorBottomPanelClassName = "!rounded-none !border-0 !bg-transparent !p-0 !shadow-none !backdrop-blur-none";
const storeInlineEditButtonSizeClassName = "h-10 w-10";
const storeInlineEditIconSizeClassName = "h-4 w-4";
const storeMenuCoverReferenceWidth = 344;
const storeMenuCoverFrameWidthClassName = "mx-auto w-full max-w-[344px]";
const storeMenuCoverRadiusClassName = "rounded-[26px]";
const storeMenuCardCoverFallbackHeight = 140;
const storeHeroGalleryCardHeight = 204;
const storeHeroGalleryFrameWidth = 390;
const storeHeroGalleryAspectRatio = storeHeroGalleryFrameWidth / storeHeroGalleryCardHeight;
const storeHeroGalleryEditorFrameWidth = 344;
const storeHeroGalleryRadiusClassName = "rounded-[28px]";
const storeCompactMetricPillClassName =
  "inline-flex h-[38px] w-full min-w-0 items-center justify-center gap-1.5 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-2 text-[12px] font-normal text-[color:var(--client-muted)] transition";
const storeBasicEditorFields = [
  { label: "店铺名称", key: "name" },
  { label: "首页角标", key: "rankLabel" },
  { label: "店铺地址", key: "address" },
  { label: "服务区域", key: "area" },
  { label: "营业时间", key: "businessHours" }
] as const;
type StoreBasicEditorFieldKey = (typeof storeBasicEditorFields)[number]["key"];

function getStoreMenuCardCoverHeight(cardUi?: StoreCardDecorationConfig) {
  const coverHeight = Number.parseInt(cardUi?.coverHeight ?? "", 10);

  return Number.isFinite(coverHeight) && coverHeight > 0 ? coverHeight : storeMenuCardCoverFallbackHeight;
}

function getStoreMenuImageEditorAspectRatio(cardUi?: StoreCardDecorationConfig) {
  return storeMenuCoverReferenceWidth / getStoreMenuCardCoverHeight(cardUi);
}

function getStoreMenuCoverFrameStyle(cardUi?: StoreCardDecorationConfig): CSSProperties {
  return {
    aspectRatio: `${storeMenuCoverReferenceWidth} / ${getStoreMenuCardCoverHeight(cardUi)}`
  };
}

function buildNextStoreMenuCard({
  images,
  menuCards,
  source,
  store
}: {
  images: string[];
  menuCards: MenuCard[];
  source?: MenuCard;
  store: Store;
}): MenuCard {
  const template = source ?? menuCards[0];
  const nextIndex = menuCards.length + 1;

  return {
    id: `${store.id}-menu-${nextIndex}`,
    sourceServiceId: (template?.sourceServiceId ?? "") || `${store.id}-service-${nextIndex}`,
    name: template ? `${template.name} 副本` : store.name,
    subtitle: template?.subtitle ?? store.description,
    duration: template?.duration ?? "60 分钟",
    priceLabel: template?.priceLabel ?? store.priceLabel,
    audience: template?.audience ?? store.area,
    tags: template?.tags.slice(0, 3) ?? store.tags.slice(0, 3),
    cover: template?.cover ?? images[0] ?? store.cover,
    highlights: template?.highlights.slice(0, 3) ?? ["可预约"]
  };
}

function isTechnicianDisplayVisible(technician: Technician) {
  return technician.visible !== false;
}

const storeIndustryServiceCategoryMap: Record<StoreIndustry, string[]> = {
  massage: ["massage"],
  beauty: ["beauty"],
  dining: ["dining"],
  cleaning: ["cleaning", "appliance"]
};
const storeOfferEditorFields = [
  { label: "标题", key: "title" },
  { label: "利益点", key: "benefit" },
  { label: "利用条件", key: "conditions" },
  { label: "适用范围", key: "applicable" },
  { label: "有效期", key: "validUntil" },
  { label: "叠加规则", key: "stackingRule" }
] as const;

function listToText(items: string[]) {
  return items.join("\n");
}

function textToList(value: string) {
  return value
    .split(/\n|,|，|、|\//)
    .map((item) => item.trim())
    .filter(Boolean);
}

const storeMapDetailCopyByIndustry: Record<StoreIndustry, StoreMapDetailCopy> = {
  massage: {
    bookingRule: "预约可。建议提前 10 分钟到店，20 分钟以上未联系的迟到可能取消。",
    buyout: "可咨询。安静时段和团体护理请以店铺确认结果为准。",
    chargeNote: "平台预约确认后保留时段；延长、指名和房型追加费用以店铺确认为准。",
    childrenPolicy: "儿童同行请提前咨询，护理区以安静环境为主。",
    courseInfo: "60 / 90 / 120 分钟护理套餐，可预约担当。",
    drinkInfo: "温热水、养生茶可到店确认。",
    equipmentNote: "到店后会再次确认清洁、换气和护理房准备情况。",
    genre: "身体护理、按摩、放松调理",
    locationInfo: "隐私护理空间，靠近车站，晚间到店也容易找到。",
    maxReservationPeople: "到店同时 6 人，双人同行需提前确认。",
    menuInfo: "肩颈、腰背、全身放松和深夜恢复护理。",
    officialAccount: "NeeDo 店铺页 / 平台聊天",
    officialContact: "平台聊天咨询优先，预约确认短信会附楼层、门禁和紧急联系说明。",
    phoneContact: "电话咨询请以预约确认短信内联系方式为准。",
    privateRoom: "有。单人护理房、双人护理房可提前确认。",
    seatInfo: "独立护理房为主，支持单人护理、双人同行和安静休息需求。",
    seatCount: "护理房 4 间 / 接待位 2 席。",
    serviceSupport: "适合下班后恢复、运动后调整、深夜放松和女性用户到店。",
    smokingPolicy: "全室禁烟，护理前后请在指定区域等候。"
  },
  beauty: {
    bookingRule: "预约可。设计款和连续护理建议提前预约，迟到超过 15 分钟需重新确认可用时段。",
    buyout: "可咨询。作品拍摄和多人护理请以店铺确认结果为准。",
    chargeNote: "平台预约确认后保留时段；追加设计、卸除和特殊材料费用以店铺确认为准。",
    childrenPolicy: "儿童同行请提前咨询，护理位周边以安静操作为主。",
    courseInfo: "单色、设计款、连续护理套餐可预约。",
    drinkInfo: "饮品提供以店铺当天说明为准。",
    equipmentNote: "到店后会确认作品相册、颜色样本和护理位准备情况。",
    genre: "美容、美甲、美睫、护理",
    locationInfo: "通勤区护理空间，适合活动前准备和周末预约。",
    maxReservationPeople: "到店同时 4 人，并排护理需提前确认。",
    menuInfo: "美甲、美睫、卸除和自然风格咨询。",
    officialAccount: "NeeDo 店铺页 / 平台聊天",
    officialContact: "平台聊天咨询优先，预约确认短信会附楼层、门铃和作品图沟通说明。",
    phoneContact: "电话咨询请以预约确认短信内联系方式为准。",
    privateRoom: "有。单人护理位和并排护理位可确认。",
    seatInfo: "单人护理位为主，适合午休补妆、下班整理和周末预约。",
    seatCount: "护理位 6 席。",
    serviceSupport: "适合通勤护理、活动前准备、自然风格咨询和女性用户到店。",
    smokingPolicy: "店内禁烟，护理前后请在等候区确认作品和注意事项。"
  },
  dining: {
    bookingRule: "预约可。包间和多人席建议提前预约，迟到超过 15 分钟需重新确认保留时间。",
    buyout: "可。50 人以上和包场会食请提前咨询。",
    chargeNote: "平台订金用于保留席位；套餐变更、饮品追加和服务费以店铺确认为准。",
    childrenPolicy: "儿童可，婴儿车入店和儿童椅请提前确认。",
    courseInfo: "套餐、畅饮和多人席可预约。",
    drinkInfo: "日本酒、烧酎、葡萄酒、鸡尾酒可确认。",
    equipmentNote: "到店后会确认席位、菜单说明和多人用餐准备情况。",
    genre: "居酒屋、日本料理、会食",
    locationInfo: "隐秘感餐厅，适合朋友小聚和商务会食。",
    maxReservationPeople: "着席 52 人。",
    menuInfo: "野菜料理、鱼料理和健康美容菜单可确认。",
    officialAccount: "NeeDo 店铺页 / 平台聊天",
    officialContact: "平台聊天咨询优先，预约确认短信会附楼层、入口和人数变更说明。",
    phoneContact: "电话咨询请以预约确认短信内联系方式为准。",
    privateRoom: "有。4 人、6 人、8 人席可确认。",
    seatInfo: "吧台、双人桌和包间可选，适合朋友小聚、家族用餐和商务会食。",
    seatCount: "50 席（桌席、吧台）。",
    serviceSupport: "支持饮品说明、多人预约、纪念日备注和多语言菜单确认。",
    smokingPolicy: "店内禁烟区域优先，吸烟规则请以店铺确认为准。"
  },
  cleaning: {
    bookingRule: "预约可。到店咨询和上门确认都需提前预约，迟到超过 15 分钟需重新确认可用时段。",
    buyout: "可咨询。企业维护和周期预约请以报价单为准。",
    chargeNote: "平台预约确认后保留咨询时段；材料费、加急费和现场追加以报价单为准。",
    childrenPolicy: "儿童同行请提前咨询，器材展示区需由成人陪同。",
    courseInfo: "到店咨询、上门确认和周期维护可预约。",
    drinkInfo: "咨询区饮品以服务中心当天说明为准。",
    equipmentNote: "到店后会确认器材展示、报价单和照片验收说明。",
    genre: "家庭清洁、企业维护、修水管",
    locationInfo: "服务中心和器材展示区，适合先确认范围、报价和上门时间。",
    maxReservationPeople: "咨询同时 6 人，上门团队人数以报价单为准。",
    menuInfo: "家庭保洁、企业清扫、修水管和照片验收。",
    officialAccount: "NeeDo 店铺页 / 平台聊天",
    officialContact: "平台聊天咨询优先，预约确认短信会附入口、担当和上门前确认事项。",
    phoneContact: "电话咨询请以预约确认短信内联系方式为准。",
    privateRoom: "有。咨询桌和企业洽谈位可确认。",
    seatInfo: "到店咨询桌和器材展示区为主，适合先确认范围、报价和上门时间。",
    seatCount: "咨询位 4 席 / 器材展示区。",
    serviceSupport: "适合家庭清洁、企业维护、修水管咨询和周期预约。",
    smokingPolicy: "咨询区禁烟，上门作业规则请以担当确认内容为准。"
  }
};

function openStatusCopy(status: "open" | "resting" | "closed") {
  if (status === "open") {
    return "营业中";
  }

  if (status === "resting") {
    return "休息中";
  }

  return "已打烊";
}

function bookingCtaCopy(status: "open" | "resting" | "closed") {
  if (status === "open") {
    return "立即预约";
  }

  if (status === "resting") {
    return "申请预约";
  }

  return "电话咨询";
}

function nextSlotTime(slot: string) {
  return slot.replace(/^(今日|明日)\s*/, "");
}

const alwaysBookableTimeOptions = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";

  return `${String(hour).padStart(2, "0")}:${minute}`;
});

function getTodayBookingDate() {
  const today = new Date();

  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function detectStoreIndustry(store: Store): StoreIndustry {
  return detectStorePresentationIndustry(store);
}

function buildStoreProfileConfig(store: Store, industry: StoreIndustry): StoreProfileConfig {
  if (store.presentation) {
    return getStorePresentationConfig(store, industry);
  }

  switch (industry) {
    case "beauty":
      return {
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
      };
    case "dining":
      return {
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
      };
    case "cleaning":
      return {
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
      };
    case "massage":
    default:
      return {
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
      };
  }
}

function buildSeatCards(store: Store, industry: StoreIndustry): SeatCard[] {
  const gallery = store.gallery.length > 0 ? store.gallery : [store.cover];

  switch (industry) {
    case "beauty":
      return [
        {
          id: "seat-beauty-1",
          name: "窗边单间护理位",
          description: "适合自然光拍照和细节护理，首次到店用户更容易放松。",
          capacity: "1 人",
          tags: ["拍照友好", "单间", "首次推荐"],
          priceHint: "追加费 ¥0",
          slot: "今日 18:30",
          assignable: "可指定设计师",
          cover: gallery[0] ?? store.cover
        },
        {
          id: "seat-beauty-2",
          name: "并排双人护理位",
          description: "适合朋友同行或情侣到店，一次完成基础护理和拍照返图。",
          capacity: "2 人",
          tags: ["并排护理", "朋友同行", "通勤快约"],
          priceHint: "追加费 ¥1,000",
          slot: "明日 12:00",
          assignable: "支持并排安排",
          cover: gallery[1] ?? gallery[0] ?? store.cover
        },
        {
          id: "seat-beauty-3",
          name: "深度护理包间",
          description: "适合较长时段护理或需要完整隐私感的用户。",
          capacity: "1-2 人",
          tags: ["包间", "安静", "高客单"],
          priceHint: "追加费 ¥1,500",
          slot: "明日 15:30",
          assignable: "按项目开放",
          cover: gallery[2] ?? gallery[0] ?? store.cover
        }
      ];
    case "dining":
      return [
        {
          id: "seat-dining-1",
          name: "炭火吧台席",
          description: "适合 1-2 人轻松用餐，可以近距离看到炭火出品过程。",
          capacity: "1-2 位",
          tags: ["吧台", "轻社交", "临时可约"],
          priceHint: "最低消费 ¥3,000",
          slot: "今日 20:15",
          assignable: "按先到先得",
          cover: gallery[0] ?? store.cover
        },
        {
          id: "seat-dining-2",
          name: "双人临窗桌",
          description: "适合约会和朋友小聚，离主通道较远，环境更安静。",
          capacity: "2 位",
          tags: ["双人", "安静", "约会推荐"],
          priceHint: "最低消费 ¥8,000",
          slot: "今日 21:00",
          assignable: "可备注靠窗",
          cover: gallery[1] ?? gallery[0] ?? store.cover
        },
        {
          id: "seat-dining-3",
          name: "四人独立包间",
          description: "适合小型聚餐和商务沟通，支持预留欢迎小食。",
          capacity: "4-6 位",
          tags: ["包间", "聚会", "商务"],
          priceHint: "最低消费 ¥18,000",
          slot: "明日 19:30",
          assignable: "可指定包间",
          cover: gallery[2] ?? gallery[0] ?? store.cover
        }
      ];
    case "cleaning":
      return [
        {
          id: "seat-clean-1",
          name: "首次咨询位",
          description: "适合先说明户型、照片和预算，再决定上门方案。",
          capacity: "1-2 人",
          tags: ["首次推荐", "方案确认", "器材说明"],
          priceHint: "到店咨询免费",
          slot: "今日 17:00",
          assignable: "支持企业客户",
          cover: gallery[0] ?? store.cover
        },
        {
          id: "seat-clean-2",
          name: "企业对公咨询桌",
          description: "适合办公室清扫、周期服务和发票需求确认。",
          capacity: "2-4 人",
          tags: ["企业", "发票", "长期合作"],
          priceHint: "支持月结",
          slot: "明日 10:30",
          assignable: "按负责人预约",
          cover: gallery[1] ?? gallery[0] ?? store.cover
        },
        {
          id: "seat-clean-3",
          name: "器材展示区",
          description: "到店可直接看清洗设备、耗材和作业防护方式。",
          capacity: "1-3 人",
          tags: ["设备展示", "照片验收", "深度清洁"],
          priceHint: "免费参观说明",
          slot: "明日 14:00",
          assignable: "需预约",
          cover: gallery[2] ?? gallery[0] ?? store.cover
        }
      ];
    case "massage":
    default:
      return [
        {
          id: "seat-massage-1",
          name: "静音单人房",
          description: "适合下班后快速放松，灯光偏柔和，肩颈和全身项目都能安排。",
          capacity: "1 人",
          tags: ["安静", "单人房", "女性欢迎"],
          priceHint: "追加费 ¥0",
          slot: store.nextSlot,
          assignable: "可指定担当",
          cover: gallery[0] ?? store.cover
        },
        {
          id: "seat-massage-2",
          name: "双人并列房",
          description: "适合同伴同行或情侣到店，可同步安排不同疗程。",
          capacity: "2 人",
          tags: ["双人房", "同行推荐", "深夜可约"],
          priceHint: "追加费 ¥1,000",
          slot: "今日 20:30",
          assignable: "支持同室不同担当",
          cover: gallery[1] ?? gallery[0] ?? store.cover
        },
        {
          id: "seat-massage-3",
          name: "VIP 热敷房",
          description: "适合长时段深度护理，包含热敷、独立更衣和更强隐私感。",
          capacity: "1-2 人",
          tags: ["VIP", "热敷", "高客单"],
          priceHint: "追加费 ¥2,000",
          slot: "明日 11:00",
          assignable: "仅部分套餐开放",
          cover: gallery[2] ?? gallery[0] ?? store.cover
        }
      ];
  }
}

function getStoreIndustryServices(industry: StoreIndustry) {
  return services.filter((item) => storeIndustryServiceCategoryMap[industry].includes(item.categoryId));
}

function buildServiceMenuPriceRangeLabel(store: Store, industry: StoreIndustry) {
  const prices = getStoreIndustryServices(industry)
    .slice(0, 3)
    .flatMap((item) => [item.priceFrom, ...item.packages.map((servicePackage) => servicePackage.price)])
    .filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length === 0) {
    return store.priceLabel;
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  return minPrice === maxPrice ? yen(minPrice) : `${yen(minPrice)}-${yen(maxPrice)}`;
}

function buildDisplayedMenuPriceRangeLabel(menuCards: MenuCard[], fallback: string) {
  const prices = menuCards
    .flatMap((menuCard) => menuCard.priceLabel.match(/\d[\d,]*/g) ?? [])
    .map((price) => Number(price.replace(/,/g, "")))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length === 0) {
    return fallback;
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  return minPrice === maxPrice ? yen(minPrice) : `${yen(minPrice)}-${yen(maxPrice)}`;
}

function buildMenuCards(store: Store, industry: StoreIndustry): MenuCard[] {
  const fallbackServiceId = services[0]?.id ?? "svc-fallback";
  const matchedServices = getStoreIndustryServices(industry)
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      sourceServiceId: item.id,
      name: item.name,
      subtitle: item.summary,
      duration: `${item.packages[0]?.durationMinutes ?? 60} 分钟`,
      priceLabel: yen(item.priceFrom),
      audience: item.serviceAreas[0] ?? store.area,
      tags: item.tags.slice(0, 3),
      cover: item.cover,
      highlights: item.packages[0]?.includes.slice(0, 3) ?? item.notice.slice(0, 3)
    }));

  if (matchedServices.length > 0) {
    return matchedServices;
  }

  switch (industry) {
    case "dining":
      return [
        {
          id: "menu-dining-1",
          sourceServiceId: fallbackServiceId,
          name: "季节炭火双人套餐",
          subtitle: "前菜、炭火拼盘和当日小菜的轻社交套餐，适合第一次到店。",
          duration: "90 分钟",
          priceLabel: "¥9,800 / 2 位",
          audience: "2 人聚餐",
          tags: ["热门", "双人", "首访推荐"],
          cover: store.gallery[0] ?? store.cover,
          highlights: ["炭火拼盘", "季节小菜", "欢迎饮品"]
        },
        {
          id: "menu-dining-2",
          sourceServiceId: fallbackServiceId,
          name: "四人包间宴会组合",
          subtitle: "适合轻商务和朋友小聚，含包间预留与饮品搭配建议。",
          duration: "120 分钟",
          priceLabel: "¥18,000 起",
          audience: "4-6 位",
          tags: ["包间", "聚会", "预约优先"],
          cover: store.gallery[1] ?? store.cover,
          highlights: ["包间保留", "季节烤物", "饮品建议"]
        },
        {
          id: "menu-dining-3",
          sourceServiceId: fallbackServiceId,
          name: "当日主推单点组合",
          subtitle: "给临时到店或想先试一轮主打菜品的用户更低决策门槛。",
          duration: "60 分钟",
          priceLabel: "人均 ¥5,000",
          audience: "1-2 位",
          tags: ["单点", "临时可约", "轻量下单"],
          cover: store.gallery[2] ?? store.cover,
          highlights: ["主推串烧", "季节沙拉", "限定甜点"]
        }
      ];
    default:
      return [
        {
          id: `${store.id}-fallback-1`,
          sourceServiceId: fallbackServiceId,
          name: "标准到店服务",
          subtitle: "根据当前店铺主营项目整理出的通用预约入口。",
          duration: "60 分钟",
          priceLabel: store.priceLabel,
          audience: store.area,
          tags: store.tags.slice(0, 3),
          cover: store.cover,
          highlights: ["支持预约", "到店确认", "平台记录"]
        }
      ];
  }
}

function mergeMenuCardOverrides(baseCards: MenuCard[], overrides: StoreMenuConfig[] | undefined): MenuCard[] {
  if (!overrides?.length) {
    return baseCards;
  }

  return overrides.map((override, index) => {
    const baseCard = baseCards[index] ?? override;

    if (!override) {
      return baseCard;
    }

    return {
      ...baseCard,
      ...override,
      highlights: override.highlights.length > 0 ? override.highlights : baseCard.highlights,
      tags: override.tags.length > 0 ? override.tags : baseCard.tags
    };
  });
}

function buildRelevantReviews(store: Store, storeTechnicians: Technician[]): Review[] {
  const targetNames = new Set([store.name, ...storeTechnicians.map((item) => item.name)]);
  const matchedReviews = reviews.filter((review) => targetNames.has(review.targetName));

  return matchedReviews.length > 0 ? matchedReviews.slice(0, 3) : reviews.slice(0, 3);
}

function getReviewAvatar(customerName: string, index: number) {
  return customers.find((customer) => customer.name === customerName)?.avatar ?? customers[index % customers.length]?.avatar;
}

function FeaturedReviewRatingBadge({ rating }: { rating: number }) {
  return (
    <div className="shrink-0 rounded-[15px] border border-[color:color-mix(in_srgb,var(--client-primary)_26%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-primary)_17%,var(--client-surface)_83%)] px-2.5 py-2 text-left shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_14%,transparent)]">
      <p className="text-[10px] font-black leading-none text-[color:var(--client-muted)]">服务评价</p>
      <p className="mt-1 whitespace-nowrap leading-none">
        <span className="text-[22px] font-black tracking-normal text-[color:var(--client-primary)]">{rating.toFixed(1)}</span>
        <span className="ml-0.5 text-[13px] font-black tracking-normal text-[color:var(--client-muted)]">/5</span>
      </p>
    </div>
  );
}

function FeaturedReviewCard({ index, review }: { index: number; review: Review }) {
  return (
    <article className="rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 text-left shadow-[0_18px_42px_rgba(0,0,0,0.05)]">
      <div className="flex items-start gap-3">
        <AvatarImage
          alt={review.customerName}
          className="h-11 w-11 shrink-0 !rounded-[14px] border border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)]"
          src={getReviewAvatar(review.customerName, index)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="truncate text-[17px] font-black leading-6 text-[color:var(--client-text)]">{review.customerName}</h4>
              <p className="mt-1 text-[11px] font-medium leading-none tracking-normal text-[color:color-mix(in_srgb,var(--client-muted)_68%,transparent)]">
                {review.createdAt}
              </p>
            </div>
            <FeaturedReviewRatingBadge rating={review.rating} />
          </div>
          <p className="mt-3 text-sm leading-6 text-[color:var(--client-muted)]">{review.content}</p>
        </div>
      </div>
    </article>
  );
}

function buildTimeOptions(industry: StoreIndustry, nextSlot: string, alwaysBookable = false) {
  if (alwaysBookable) {
    return alwaysBookableTimeOptions;
  }

  const defaults: Record<StoreIndustry, string[]> = {
    massage: ["18:30", "19:30", "20:30", "21:30"],
    beauty: ["11:00", "13:00", "16:30", "19:00"],
    dining: ["18:00", "19:30", "20:30", "21:00"],
    cleaning: ["10:00", "13:00", "15:30", "17:00"]
  };
  const preferred = nextSlotTime(nextSlot);
  const pool = defaults[industry];

  return pool.includes(preferred) ? pool : [preferred, ...pool];
}

function getInitialSelectedDate(nextSlot: string, alwaysBookable = false) {
  const date = alwaysBookable ? getTodayBookingDate() : new Date(baseBookingDate);

  if (nextSlot.startsWith("明日")) {
    date.setDate(date.getDate() + 1);
  }

  return date;
}

function formatDateParam(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseStoreBookingDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeStoreBookingTimeParam(value: string | null) {
  const normalized = value?.trim() ?? "";

  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : null;
}

const confirmedTechnicianBookingStatuses = new Set<OrderStatus>(["confirmed", "scheduled", "inService"]);

function normalizeBookingMatchText(value: string | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, "").trim();
}

function parseBookingDurationMinutes(value: string | undefined) {
  const match = value?.match(/(\d+)\s*(?:分钟|分)/);
  const duration = match ? Number(match[1]) : Number.NaN;

  return Number.isFinite(duration) && duration > 0 ? duration : 60;
}

function parseBookingDateTime(date: string, time: string) {
  const timestamp = new Date(`${date}T${time}:00`).getTime();

  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function parseOrderBookingStart(order: Order) {
  const [date = "", time = ""] = order.bookedAt.split(" ");

  return parseBookingDateTime(date, time);
}

function doBookingWindowsOverlap(startAt: number, durationMinutes: number, otherStartAt: number, otherDurationMinutes: number) {
  if (!Number.isFinite(startAt) || !Number.isFinite(otherStartAt)) {
    return false;
  }

  const endAt = startAt + durationMinutes * 60_000;
  const otherEndAt = otherStartAt + otherDurationMinutes * 60_000;

  return startAt < otherEndAt && otherStartAt < endAt;
}

function isTechnicianUnavailableForSelectedTime({
  bookingDurationMinutes,
  selectedDate,
  selectedTime,
  store,
  technician
}: {
  bookingDurationMinutes: number;
  selectedDate: Date;
  selectedTime: string;
  store: Store;
  technician: Technician;
}) {
  const technicianName = normalizeBookingMatchText(technician.name);
  const technicianNickname = normalizeBookingMatchText(technician.nickname);
  const storeName = normalizeBookingMatchText(store.name);
  const selectedStartAt = parseBookingDateTime(formatDateParam(selectedDate), selectedTime);

  return orders.some((order) => {
    if (!confirmedTechnicianBookingStatuses.has(order.status)) {
      return false;
    }

    const orderTechnicianName = normalizeBookingMatchText(order.technicianName);
    const orderStoreName = normalizeBookingMatchText(order.storeName);
    const sameTechnician = Boolean(
      orderTechnicianName &&
        (orderTechnicianName === technicianName ||
          orderTechnicianName === technicianNickname)
    );
    const sameStoreOrCrossStoreBooking = !orderStoreName || orderStoreName === storeName;

    return (
      sameTechnician &&
      sameStoreOrCrossStoreBooking &&
      doBookingWindowsOverlap(
        selectedStartAt,
        bookingDurationMinutes,
        parseOrderBookingStart(order),
        parseBookingDurationMinutes(order.itemName)
      )
    );
  });
}

function parsePriceNumber(value: string) {
  const match = value.match(/\d[\d,]*/);

  return match ? Number(match[0].replace(/,/g, "")) : 0;
}

function resolveOfferExpiryIso(value: string) {
  if (value === "长期有效") {
    return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  }

  const parsed = Date.parse(value.length <= 10 ? `${value}T23:59:59` : value);

  if (Number.isNaN(parsed)) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  return new Date(parsed).toISOString();
}

function formatOfferCountdown(value: string, nowMs: number) {
  if (value === "长期有效") {
    return "长期有效";
  }

  const parsed = Date.parse(value.length <= 10 ? `${value}T23:59:59` : value);

  if (Number.isNaN(parsed)) {
    return "期限待确认";
  }

  const remainingMs = parsed - nowMs;

  if (remainingMs <= 0) {
    return "已结束";
  }

  const totalMinutes = Math.floor(remainingMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `剩余 ${days}天 ${String(hours).padStart(2, "0")}小时`;
  }

  if (hours > 0) {
    return `剩余 ${String(hours).padStart(2, "0")}小时 ${String(minutes).padStart(2, "0")}分`;
  }

  return `剩余 ${String(Math.max(0, minutes)).padStart(2, "0")}分`;
}

function getOfferSeed(offer: OfferCard) {
  return Array.from(offer.id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function getOfferLikeCount(offer: OfferCard) {
  return 28 + (getOfferSeed(offer) % 67);
}

function getOfferReplyCount(offer: OfferCard) {
  return 9 + (getOfferSeed(offer) % 23);
}

function InfoRow({
  children,
  label,
  value
}: {
  children?: ReactNode;
  label: string;
  value?: ReactNode;
}) {
  return (
    <div className="border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] pb-2.5 last:border-b-0 last:pb-0">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[color:var(--client-muted)]">{label}</p>
      {children ?? <p className="mt-1.5 text-sm font-semibold leading-6 text-[color:var(--client-text)]">{value}</p>}
    </div>
  );
}

function StoreMapInfoRow({
  children,
  label,
  value
}: {
  children?: ReactNode;
  label: string;
  value?: ReactNode;
}) {
  return (
    <div className="grid gap-1.5 border-b border-[color:color-mix(in_srgb,var(--client-line)_50%,transparent)] pb-3 text-left last:border-b-0 last:pb-0 sm:grid-cols-[132px,minmax(0,1fr)] sm:gap-4">
      <p className="text-left text-[11px] font-black tracking-[0.12em] text-[color:var(--client-muted)]">{label}</p>
      <div className="min-w-0 text-left text-[13px] font-semibold leading-6 text-[color:var(--client-text)]">{children ?? value}</div>
    </div>
  );
}

function StoreMapSectionHeading({ caption, title }: { caption?: string; title: string }) {
  return (
    <div className="min-w-0">
      {caption ? <p className="text-[11px] font-black tracking-[0.16em] text-[color:var(--client-primary)]">{caption}</p> : null}
      <h4 className="mt-1 text-[17px] font-black leading-6 text-[color:var(--client-text)]">{title}</h4>
    </div>
  );
}

function StoreMapTagList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          className="inline-flex min-h-[30px] items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_58%,transparent)] px-3 py-1 text-[11px] font-bold leading-4 text-[color:var(--client-muted)]"
          key={item}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function FlatCard({
  children,
  className,
  editor
}: {
  children: ReactNode;
  className?: string;
  editor?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] p-4 shadow-[0_14px_30px_rgba(0,0,0,0.06)]",
        className
      )}
    >
      {editor ? <div className="absolute right-3 top-3 z-10">{editor}</div> : null}
      {children}
    </div>
  );
}

function CollapsibleSectionButton({
  collapsed,
  label,
  onToggle
}: {
  collapsed: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? "展开" : "收起"}${label}`}
      className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)] text-[color:var(--client-text)] shadow-[0_10px_22px_rgba(0,0,0,0.10)] transition active:scale-95"
      onClick={onToggle}
      title={collapsed ? "展开" : "收起"}
      type="button"
    >
      <AppIcon className="h-4 w-4" name={collapsed ? "plus" : "minus"} />
    </button>
  );
}

function StoreTechnicianSelectableCard({
  active,
  fallbackServices,
  isMerchantEditable = false,
  language,
  onSelect,
  profileTo,
  rankIndex,
  technician,
  technicianVisible = true,
  unavailable = false
}: {
  active: boolean;
  fallbackServices: ServiceItem[];
  isMerchantEditable?: boolean;
  language: Language;
  onSelect: () => void;
  profileTo?: string;
  rankIndex: number;
  technician: Technician;
  technicianVisible?: boolean;
  unavailable?: boolean;
}) {
  return (
    <TechnicianShowcaseCard
      aria-label={unavailable ? "当前时间不可约" : active ? "已选技师" : "待选技师"}
      className={cn(
        "h-full w-full",
        isMerchantEditable && !technicianVisible && "opacity-70 saturate-[0.72]",
        !isMerchantEditable && unavailable && "opacity-70 saturate-[0.72]"
      )}
      detailTo={profileTo}
      fallbackServices={fallbackServices}
      language={language}
      metricLayout="split"
      onSelect={onSelect}
      rankIndex={rankIndex}
      selected={isMerchantEditable ? technicianVisible : unavailable ? false : active}
      selectionActiveIcon={isMerchantEditable ? "eye" : "check"}
      selectionAriaLabel={unavailable ? "当前时间不可约" : isMerchantEditable ? (technicianVisible ? "隐藏技师" : "显示技师") : active ? "已选技师" : "待选技师"}
      selectionDisabled={unavailable}
      selectionInactiveIcon={unavailable ? "x" : isMerchantEditable ? "eyeOff" : "plus"}
      technician={technician}
    />
  );
}

function getStoreTechnicianDisplayName(technician: Technician) {
  return technician.nickname?.trim() || technician.name;
}

function getStoreTechnicianPhoto(technician: Technician) {
  return technician.avatar || technician.gallery?.[0] || "";
}

function formatStoreTechnicianRating(value: number) {
  const normalized = Number.isFinite(value) && value > 0 ? value : 0;

  return normalized > 5 ? normalized / 2 : normalized;
}

function normalizeStoreTechnicianMatchText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function scoreStoreServiceForTechnician(service: ServiceItem, technician: Technician) {
  const serviceText = normalizeStoreTechnicianMatchText([service.name, service.summary, ...service.tags, ...service.serviceAreas].join(" "));
  const targets = [technician.name, technician.nickname ?? "", ...technician.skills, ...(technician.profileTags ?? []), ...technician.serviceAreas]
    .map(normalizeStoreTechnicianMatchText)
    .filter(Boolean);

  return targets.reduce((total, target) => total + Number(Boolean(target && serviceText.includes(target))), 0);
}

function getStoreRecommendedServiceForTechnician(technician: Technician, fallbackServices: ServiceItem[]) {
  return [...fallbackServices].sort((left, right) => scoreStoreServiceForTechnician(right, technician) - scoreStoreServiceForTechnician(left, technician))[0] ?? null;
}

function StoreTechnicianServiceListRow({
  fallbackServices,
  isMerchantEditable = false,
  onSelect,
  onToggleVisibility,
  profileTo,
  quoteRatePercent = 100,
  selected,
  serviceListTo,
  technician,
  technicianVisible = true,
  unavailable = false
}: {
  fallbackServices: ServiceItem[];
  isMerchantEditable?: boolean;
  onSelect?: () => void;
  onToggleVisibility?: () => void;
  profileTo: string;
  quoteRatePercent?: number;
  selected?: boolean;
  serviceListTo: string;
  technician: Technician;
  technicianVisible?: boolean;
  unavailable?: boolean;
}) {
  const displayName = getStoreTechnicianDisplayName(technician);
  const recommendedService = getStoreRecommendedServiceForTechnician(technician, fallbackServices);
  const packageInfo = recommendedService?.packages[0];
  const price = packageInfo?.price ?? recommendedService?.priceFrom ?? Number.parseInt(technician.bidBudgetMin ?? "", 10);
  const displayedPrice = Number.isFinite(price) && price > 0 ? Math.round((price * quoteRatePercent) / 100) : price;
  const duration = packageInfo?.durationMinutes ?? 60;
  const priceLabel = Number.isFinite(displayedPrice) && displayedPrice > 0 ? yen(displayedPrice) : "预约确认";
  const serviceName = recommendedService?.name ?? technician.skills[0] ?? "预约服务";
  const favoriteCount = Math.max(0, technician.orderCount);
  const shareCount = 0;
  const statusLabel = technician.status === "available" ? "可预约" : technician.status === "busy" ? "预约确认中" : "休息中";
  const headline = [technician.age ? `${technician.age}岁` : "", technician.height ?? "", technician.skills[0], technician.serviceAreas[0]]
    .filter(Boolean)
    .join(" / ");
  const showSelectionAction = !isMerchantEditable && typeof selected === "boolean" && Boolean(onSelect);

  return (
    <article
      className={cn(
        "relative grid grid-cols-[118px_minmax(0,1fr)] gap-3 overflow-hidden rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_92%,transparent)] p-2.5 shadow-[0_14px_28px_rgba(0,0,0,0.14)]",
        isMerchantEditable && !technicianVisible && "opacity-70 saturate-[0.72]",
        !isMerchantEditable && unavailable && "opacity-70 saturate-[0.72]"
      )}
    >
      {isMerchantEditable && onToggleVisibility ? (
        <StoreSelectionIconButton
          active={technicianVisible}
          activeIcon="eye"
          className="absolute right-2 top-2 z-30 h-11 w-11"
          inactiveIcon="eyeOff"
          label={technicianVisible ? "隐藏技师" : "显示技师"}
          onSelect={onToggleVisibility}
        />
      ) : null}
      {showSelectionAction && onSelect ? (
        <StoreSelectionIconButton
          active={Boolean(selected) && !unavailable}
          activeIcon="check"
          className="absolute right-2 top-2 z-30 h-11 w-11"
          disabled={unavailable}
          inactiveIcon={unavailable ? "x" : "plus"}
          label={unavailable ? "当前时间不可约" : selected ? "已选技师" : "待选技师"}
          onSelect={onSelect}
        />
      ) : null}
      <Link
        aria-label={`查看${displayName}动态`}
        className="group relative min-h-[158px] overflow-hidden rounded-[14px] bg-black active:scale-[0.99]"
        title="查看技师动态"
        to={profileTo}
      >
        <img
          alt={displayName}
          className="absolute inset-0 h-full w-full scale-[1.035] object-cover transition duration-300 group-hover:scale-[1.06]"
          src={getGeneratedImageThumbnailUrl(getStoreTechnicianPhoto(technician))}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/18 via-transparent to-black/32" />
        <div className="absolute left-2 right-[5px] top-2 z-20 flex items-start justify-between gap-1">
          <SimpleRatingBadge compact value={formatStoreTechnicianRating(technician.rating).toFixed(1)} />
          <div className="flex shrink-0 items-start -space-x-[4px]">
            <IconMetricAction count={favoriteCount} icon="heart" label={`关注 ${favoriteCount}`} size="cluster" />
            <IconMetricAction count={shareCount} icon="share" label={`转发 ${shareCount}`} size="cluster" />
          </div>
        </div>
      </Link>

      <Link
        aria-label={`查看技师服务列表 ${displayName}`}
        className="flex min-w-0 flex-col justify-between rounded-[14px] py-1 pl-1.5 pr-1.5 text-left active:scale-[0.99]"
        title="查看技师服务列表"
        to={serviceListTo}
      >
        <div className={cn("min-w-0", (isMerchantEditable || showSelectionAction) && "pr-12")}>
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="min-w-0 truncate text-[18px] font-black leading-6 text-[color:var(--client-text)]">{displayName}</h3>
          </div>
          {headline ? <p className="mt-1 line-clamp-1 text-[12px] font-semibold text-[color:var(--client-muted)]">{headline}</p> : null}
          <p className="mt-2 text-[12px] font-black text-[color:var(--client-text)]">
            {statusLabel} · 接单率 {technician.acceptRate}%
          </p>
        </div>

        <div className="relative mt-3 rounded-[13px] border border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_8%,transparent)] py-2 pl-3 pr-11">
          <span
            aria-hidden="true"
            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--client-primary)] bg-[color:color-mix(in_srgb,var(--client-primary-soft)_58%,transparent)] text-[color:var(--client-primary)]"
          >
            <AppIcon className="h-4 w-4" name="info" />
          </span>
          <p className="text-[10px] font-black uppercase leading-none text-[color:var(--client-primary)]">推荐服务</p>
          <h4 className="mt-1.5 line-clamp-2 text-[14px] font-black leading-5 text-[color:var(--client-text)]">{serviceName}</h4>
          <p className="mt-1 flex min-w-0 items-baseline gap-1 text-[12px] font-semibold text-[color:var(--client-muted)]">
            <strong className="text-[17px] font-black text-[color:var(--client-text)]">{priceLabel}</strong>
            <span className="min-w-0 truncate">/ {duration}分钟(含税)</span>
          </p>
        </div>
      </Link>
    </article>
  );
}

function StoreSelectionIconButton({
  active,
  activeIcon = "check",
  className,
  disabled = false,
  inactiveIcon = "plus",
  label,
  onSelect
}: {
  active: boolean;
  activeIcon?: IconName;
  className?: string;
  disabled?: boolean;
  inactiveIcon?: IconName;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "focus-ring inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border backdrop-blur-md transition active:scale-95",
        disabled
          ? "border-[#ff5f6e]/80 bg-black/44 text-[#ff5f6e] shadow-[0_10px_24px_rgba(0,0,0,0.22)]"
          : active
            ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#06100b] shadow-[0_14px_30px_color-mix(in_srgb,var(--client-primary)_36%,transparent)]"
            : "border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_42%,transparent)] text-[color:var(--client-text)] shadow-[0_10px_24px_rgba(0,0,0,0.18)]",
        className
      )}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <AppIcon className="h-5 w-5" name={active ? activeIcon : inactiveIcon} />
    </button>
  );
}

function StoreInlineEditLink({
  to,
  onClick,
  active = false,
  label = "编辑",
  className
}: {
  to?: string;
  onClick?: () => void;
  active?: boolean;
  label?: string;
  className?: string;
}) {
  const classes = cn(
    "focus-ring inline-flex shrink-0 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_92%,transparent)] text-[color:var(--client-text)] shadow-[0_10px_22px_rgba(0,0,0,0.12)] backdrop-blur-xl transition hover:-translate-y-0.5",
    active && "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#06100b]",
    storeInlineEditButtonSizeClassName,
    className
  );
  const content = (
    <>
      <AppIcon className={cn(storeInlineEditIconSizeClassName, active && "!text-[#06100b]")} name={active ? "check" : "edit"} />
      <span className="sr-only">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        aria-label={label}
        className={classes}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        title={label}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      aria-label={label}
      className={classes}
      title={label}
      to={to ?? "#"}
    >
      {content}
    </Link>
  );
}

function StoreMenuCoverImage({
  alt,
  cardUi,
  className,
  frameClassName = storeMenuCoverRadiusClassName,
  image
}: {
  alt: string;
  cardUi?: StoreCardDecorationConfig;
  className?: string;
  frameClassName?: string;
  image: string;
}) {
  return (
    <div
      className={cn("relative block overflow-hidden bg-black", storeMenuCoverFrameWidthClassName, frameClassName, className)}
      style={getStoreMenuCoverFrameStyle(cardUi)}
    >
      <img alt={alt} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(image)} />
    </div>
  );
}

function MerchantAddServiceButton({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      className="focus-ring inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_42%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-primary)_16%,var(--client-surface)_84%)] px-4 text-sm font-black text-[color:var(--client-text)] shadow-[0_14px_28px_color-mix(in_srgb,var(--client-primary)_10%,transparent)]"
      onClick={onAdd}
      type="button"
    >
      <AppIcon className="h-4 w-4 text-[color:var(--client-primary)]" name="plus" />
      添加服务
    </button>
  );
}

function PricingModeHiddenWarning({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[18px] border border-[#ff4d5e] bg-[#ff314f]/12 px-3 py-2 text-[11px] font-black leading-5 text-[#ff9aa5] shadow-[0_12px_28px_rgba(255,49,79,0.16)]">
      <span
        aria-hidden="true"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-[3px] border-[#ff4d5e] bg-[#ff314f]/18 text-[15px] font-black leading-none text-[#ff4d5e]"
      >
        !
      </span>
      <span className="min-w-0">{message}</span>
    </div>
  );
}

const inlineTextEditorClassName =
  "min-w-0 rounded-[12px] border border-[color:color-mix(in_srgb,var(--client-primary)_44%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-bg)_86%,transparent)] px-2 py-1 text-[color:var(--client-text)] outline-none shadow-[0_0_0_3px_color-mix(in_srgb,var(--client-primary)_10%,transparent)]";
const editableTagSlotCount = 10;

function buildEditableTagSlots(tags: string[]) {
  return Array.from({ length: editableTagSlotCount }, (_, index) => tags[index] ?? "");
}

function InlineEditableText({
  className,
  editing,
  multiline = false,
  onChange,
  rows = 2,
  value
}: {
  className?: string;
  editing: boolean;
  multiline?: boolean;
  onChange: (value: string) => void;
  rows?: number;
  value: string;
}) {
  if (!editing) {
    return <span className={className}>{value}</span>;
  }

  if (multiline) {
    return (
      <textarea
        className={cn(inlineTextEditorClassName, "block w-full resize-none leading-inherit", className)}
        data-page-drag-ignore="true"
        data-scroll-drag-ignore="true"
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        value={value}
      />
    );
  }

  return (
    <input
      className={cn(inlineTextEditorClassName, "inline-flex w-full leading-inherit", className)}
      data-page-drag-ignore="true"
      data-scroll-drag-ignore="true"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  );
}

function EditableTagChips({
  editing,
  onChange,
  tags
}: {
  editing: boolean;
  onChange: (tags: string[]) => void;
  tags: string[];
}) {
  const previousEditingRef = useRef(editing);
  const [draftTags, setDraftTags] = useState(() => buildEditableTagSlots(tags));

  useEffect(() => {
    if ((editing && !previousEditingRef.current) || !editing) {
      setDraftTags(buildEditableTagSlots(tags));
    }
    previousEditingRef.current = editing;
  }, [editing, tags]);

  if (editing) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {draftTags.map((tag, index) => (
          <input
            aria-label={`标签 ${index + 1}`}
            className="min-h-10 min-w-0 rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_54%,var(--client-line))] bg-[color:var(--client-primary-soft)] px-4 py-2 text-[12px] font-black text-[color:var(--client-primary)] outline-none"
            data-page-drag-ignore="true"
            data-scroll-drag-ignore="true"
            key={`tag-slot-${index}`}
            onChange={(event) => {
              const nextDraftTags = [...draftTags];
              nextDraftTags[index] = event.target.value;
              setDraftTags(nextDraftTags);
              onChange(nextDraftTags.map((item) => item.trim()).filter(Boolean).slice(0, editableTagSlotCount));
            }}
            value={tag}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.filter(Boolean).map((tag) => (
        <span
          className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary)]"
          key={tag}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function buildEditableChipSlots(items: string[], count: number) {
  return Array.from({ length: count }, (_, index) => items[index] ?? "");
}

function EditableMenuChipInputs({
  children,
  editing,
  items,
  onChange,
  slotCount = 3,
  solid = false,
  wrap = true
}: {
  children?: ReactNode;
  editing: boolean;
  items: string[];
  onChange: (items: string[]) => void;
  slotCount?: number;
  solid?: boolean;
  wrap?: boolean;
}) {
  const previousEditingRef = useRef(editing);
  const [draftItems, setDraftItems] = useState(() => buildEditableChipSlots(items, slotCount));

  useEffect(() => {
    if ((editing && !previousEditingRef.current) || !editing) {
      setDraftItems(buildEditableChipSlots(items, slotCount));
    }
    previousEditingRef.current = editing;
  }, [editing, items, slotCount]);

  if (editing) {
    return (
      <div className={cn("flex gap-1", wrap ? "flex-wrap" : "flex-nowrap overflow-hidden")}>
        {draftItems.map((item, index) => (
          <input
            aria-label={`菜单标签 ${index + 1}`}
            className="h-7 w-[86px] shrink-0 rounded-[9px] border border-[color:color-mix(in_srgb,var(--client-primary)_44%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-bg)_84%,transparent)] px-2 text-[10px] font-black text-[color:var(--client-primary)] outline-none"
            data-page-drag-ignore="true"
            data-scroll-drag-ignore="true"
            key={`menu-chip-${index}`}
            onChange={(event) => {
              const nextItems = [...draftItems];
              nextItems[index] = event.target.value;
              setDraftItems(nextItems);
              onChange(nextItems.map((nextItem) => nextItem.trim()).filter(Boolean));
            }}
            value={item}
          />
        ))}
        {children}
      </div>
    );
  }

  return (
    <div className={cn("flex gap-1", wrap ? "flex-wrap" : "flex-nowrap overflow-hidden")}>
      {items.slice(0, slotCount).map((item) => (
        <span
          className={cn(
            "min-w-0 truncate whitespace-nowrap rounded-[9px] border px-2 py-0.5 text-[10px] font-black",
            solid
              ? "border-transparent bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]"
              : "border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] text-[color:var(--client-muted)]"
          )}
          key={item}
        >
          {item}
        </span>
      ))}
      {children}
    </div>
  );
}

type TransportModeId = "walk" | "bike" | "train" | "car";
type TransportEstimate = {
  id: TransportModeId;
  label: string;
  minutes: number;
};

function getBaseWalkingMinutes(distanceText: string) {
  const match = distanceText.match(/(\d+)\s*分钟/);

  return match ? Number(match[1]) : 12;
}

function buildTransportEstimates(distanceText: string): TransportEstimate[] {
  const walkingMinutes = Math.max(1, getBaseWalkingMinutes(distanceText));

  return [
    { id: "walk", label: "步行", minutes: walkingMinutes },
    { id: "bike", label: "自行车", minutes: Math.max(2, Math.round(walkingMinutes * 0.45)) },
    { id: "train", label: "电车", minutes: Math.max(6, Math.round(walkingMinutes * 0.7 + 4)) },
    { id: "car", label: "开车", minutes: Math.max(5, Math.round(walkingMinutes * 0.6 + 3)) }
  ];
}

function formatStoreCompactCount(value: number) {
  const safeValue = Math.max(0, Math.floor(value));

  if (safeValue >= 1000) {
    const compactValue = Math.floor(safeValue / 100) / 10;

    return `${compactValue.toFixed(1).replace(/\.0$/, "")}k`;
  }

  return `${safeValue}`;
}

function formatStoreDetailedCount(value: number) {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.floor(value)));
}

function StoreMetricDetailButton({
  active,
  ariaLabel,
  icon,
  label,
  metric,
  onClick,
  primary
}: {
  active: boolean;
  ariaLabel: string;
  icon: IconName;
  label: ReactNode;
  metric: "rating" | "favorite";
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      aria-expanded={active}
      aria-label={ariaLabel}
      className={cn(
        storeCompactMetricPillClassName,
        "focus-ring",
        primary && "text-[color:var(--client-primary)]",
        active && "border-[color:color-mix(in_srgb,var(--client-primary)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,var(--client-surface))] text-[color:var(--client-primary)]"
      )}
      data-page-drag-ignore="true"
      data-scroll-drag-ignore="true"
      data-store-metric-detail={metric}
      onClick={onClick}
      type="button"
    >
      <AppIcon className="h-4 w-4 shrink-0" name={icon} />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

function TransportEstimatePill({ className, distanceText }: { className?: string; distanceText: string }) {
  const [selectedMode, setSelectedMode] = useState<TransportModeId>("train");
  const [menuOpen, setMenuOpen] = useState(false);
  const estimates = useMemo(() => buildTransportEstimates(distanceText), [distanceText]);
  const selectedEstimate = estimates.find((estimate) => estimate.id === selectedMode) ?? estimates[0];

  return (
    <div
      className="relative min-w-0"
      data-page-drag-ignore="true"
      data-scroll-drag-ignore="true"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setMenuOpen(false);
        }
      }}
    >
      <button
        aria-expanded={menuOpen}
        aria-haspopup="listbox"
        aria-label="选择移动方式"
        className={cn(
          storeCompactMetricPillClassName,
          "client-transport-estimate-trigger focus-ring text-[12px] font-normal text-[color:var(--client-muted)]",
          menuOpen && "border-[color:color-mix(in_srgb,var(--client-primary)_48%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_10%,var(--client-surface))]",
          className
        )}
        onClick={() => setMenuOpen((current) => !current)}
        type="button"
      >
        <AppIcon className="h-4 w-4 shrink-0" name="map" />
        <span className="min-w-0 truncate">
          {selectedEstimate.label} {selectedEstimate.minutes} 分钟
        </span>
      </button>
      {menuOpen ? (
        <div
          className="client-transport-estimate-menu absolute right-0 top-[calc(100%+6px)] z-50 w-[156px] rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,black_8%)] p-1.5 shadow-[0_16px_34px_rgba(0,0,0,0.34)] backdrop-blur-xl"
          role="listbox"
        >
          {estimates.map((estimate) => {
            const selected = estimate.id === selectedEstimate.id;

            return (
              <button
                aria-selected={selected}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-left text-[12px] font-normal text-[color:var(--client-text)] transition",
                  selected
                    ? "bg-[color:var(--client-primary)] text-[color:var(--client-bg)]"
                    : "text-[color:var(--client-muted)] hover:bg-[color:color-mix(in_srgb,var(--client-primary)_10%,transparent)] hover:text-[color:var(--client-text)]"
                )}
                key={estimate.id}
                onClick={() => {
                  setSelectedMode(estimate.id);
                  setMenuOpen(false);
                }}
                role="option"
                type="button"
              >
                <span className="w-4 text-center">{selected ? "✓" : ""}</span>
                <span>
                  {estimate.label} {estimate.minutes} 分钟
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const businessHourTimeOptions = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";

  return `${String(hour).padStart(2, "0")}:${minute}`;
});

function parseBusinessHours(value: string) {
  const match = value.match(/(\d{1,2}:\d{2})\s*[-~〜ー–]\s*(\d{1,2}:\d{2})/);

  return {
    end: match?.[2] ?? "23:00",
    start: match?.[1] ?? "11:00"
  };
}

function TimeWheelColumn({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<number | null>(null);
  const itemHeight = 36;

  useEffect(() => {
    const selectedIndex = Math.max(0, options.indexOf(value));

    containerRef.current?.scrollTo({
      behavior: "smooth",
      top: selectedIndex * itemHeight
    });
  }, [options, value]);

  useEffect(
    () => () => {
      if (scrollTimerRef.current !== null) {
        window.clearTimeout(scrollTimerRef.current);
      }
    },
    []
  );

  return (
    <div className="min-w-0">
      <p className="mb-1 text-center text-[10px] font-black text-[color:var(--client-muted)]">{label}</p>
      <div className="relative overflow-hidden rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-primary)_30%,var(--client-line))] bg-black/35">
        <div className="pointer-events-none absolute inset-x-2 top-1/2 z-10 h-9 -translate-y-1/2 rounded-[12px] border border-[color:color-mix(in_srgb,var(--client-primary)_46%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_16%,transparent)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-9 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-9 bg-gradient-to-t from-black/70 to-transparent" />
        <div
          className="scrollbar-none h-[108px] snap-y snap-mandatory overflow-y-auto overscroll-contain py-9"
          data-page-drag-ignore="true"
          data-scroll-drag-ignore="true"
          onScroll={(event) => {
            if (scrollTimerRef.current !== null) {
              window.clearTimeout(scrollTimerRef.current);
            }

            const scrollTop = event.currentTarget.scrollTop;
            scrollTimerRef.current = window.setTimeout(() => {
              const selectedIndex = Math.min(options.length - 1, Math.max(0, Math.round(scrollTop / itemHeight)));
              onChange(options[selectedIndex]);
            }, 90);
          }}
          ref={containerRef}
        >
          {options.map((option) => (
            <button
              className={cn(
                "relative z-30 flex h-9 w-full snap-center items-center justify-center text-[18px] font-black tracking-[0.02em] transition",
                option === value ? "text-[color:var(--client-primary)]" : "text-[color:var(--client-muted)]"
              )}
              key={option}
              onClick={() => onChange(option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BusinessHoursRangePicker({
  onChange,
  value
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const parsed = parseBusinessHours(value);
  const updateRange = (key: "start" | "end", nextValue: string) => {
    const start = key === "start" ? nextValue : parsed.start;
    const end = key === "end" ? nextValue : parsed.end;

    onChange(`${start}-${end}`);
  };

  return (
    <div className="mt-1.5 grid grid-cols-2 gap-2" data-page-drag-ignore="true" data-scroll-drag-ignore="true">
      <TimeWheelColumn label="开始" onChange={(nextValue) => updateRange("start", nextValue)} options={businessHourTimeOptions} value={parsed.start} />
      <TimeWheelColumn label="结束" onChange={(nextValue) => updateRange("end", nextValue)} options={businessHourTimeOptions} value={parsed.end} />
    </div>
  );
}

function StoreDisplayInlineEditor({
  config,
  images,
  industry,
  mode,
  store
}: {
  config: StorePresentationConfig;
  images: string[];
  industry: StoreIndustry;
  mode: StoreDisplayEditorMode;
  store: Store;
}) {
  const updateBasicStoreField = (key: (typeof storeBasicEditorFields)[number]["key"], value: string) => {
    updateStoreEntity(store.id, { [key]: value } as Partial<Pick<Store, (typeof storeBasicEditorFields)[number]["key"]>>);
  };
  const updatePresentationField = <Key extends keyof StorePresentationConfig>(key: Key, value: StorePresentationConfig[Key]) => {
    updateStoreEntity(store.id, {
      presentation: normalizeStorePresentationConfig({ ...config, [key]: value }, industry)
    });
  };
  const updateOfferField = <Key extends keyof StoreOfferConfig>(offerIndex: number, key: Key, value: StoreOfferConfig[Key]) => {
    updateStoreEntity(store.id, {
      presentation: normalizeStorePresentationConfig(
        {
          ...config,
          offers: config.offers.map((offer, index) => (index === offerIndex ? { ...offer, [key]: value } : offer))
        },
        industry
      )
    });
  };
  const updateGallery = (nextImages: string[]) => {
    const gallery = nextImages.filter(Boolean).slice(0, 5);
    updateStoreEntity(store.id, {
      cover: gallery[0] ?? store.cover,
      gallery
    });
  };
  const editorTitle = mode === "gallery" ? "编辑图片" : mode === "basic" ? "编辑资料" : "编辑展示文字";

  return (
    <section
      className={storeDisplayEditorContentClassName}
      data-page-drag-ignore="true"
      data-scroll-drag-ignore="true"
    >
      {mode === "gallery" ? null : (
        <div className="px-1">
          <strong className="text-sm font-black text-[color:var(--client-text)]">{editorTitle}</strong>
        </div>
      )}

      {mode === "gallery" ? (
        <>
          <div className="grid gap-3">
            <h2 className="px-1 text-sm font-black text-[color:var(--client-text)]">轮播简介</h2>
            <StoreDisplayEditorInput
              label="轮播简介"
              multiline
              onChange={(value) => updatePresentationField("subtitle", value)}
              rows={3}
              value={config.subtitle}
            />
          </div>
          <ImageGalleryManager
            className="text-[color:var(--client-text)]"
            coverHint="第 1 张会同步为首图和店铺头像底图。"
            description="当前上传或替换后，下面的轮播图、缩略图和环境图会立即刷新。"
            editorAspectRatio={storeHeroGalleryAspectRatio}
            editorFrameClassName={storeHeroGalleryRadiusClassName}
            editorFrameWidth={storeHeroGalleryEditorFrameWidth}
            images={images}
            label="展示图片"
            maxImages={5}
            onChange={updateGallery}
            previewAspectRatio={storeHeroGalleryAspectRatio}
            previewFrameClassName={storeHeroGalleryRadiusClassName}
          />
        </>
      ) : null}

      {mode === "basic" ? (
        <div className="grid gap-3 text-sm">
          {storeBasicEditorFields.map((field) => (
            <label className="grid gap-1" key={field.key}>
              <span className="text-xs font-bold text-[color:var(--client-muted)]">{field.label}</span>
              <input
                className="h-10 rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-[color:var(--client-text)] outline-none"
                onChange={(event) => updateBasicStoreField(field.key, event.target.value)}
                value={store[field.key]}
              />
            </label>
          ))}
          <label className="grid gap-1">
            <span className="text-xs font-bold text-[color:var(--client-muted)]">店铺标签</span>
            <textarea
              className="min-h-[78px] rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 py-2 text-[color:var(--client-text)] outline-none"
              onChange={(event) => updateStoreEntity(store.id, { tags: textToList(event.target.value) })}
              value={listToText(store.tags)}
            />
          </label>
        </div>
      ) : null}

      {mode === "presentation" ? (
        <div className="grid gap-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              { label: "最近车站", key: "station", value: config.station },
              { label: "距离说明", key: "distance", value: config.distance },
              { label: "停车 / 补充说明", key: "parking", value: config.parking }
            ] as const).map((field) => (
              <label className="grid gap-1" key={field.key}>
                <span className="text-xs font-bold text-[color:var(--client-muted)]">{field.label}</span>
                <input
                  className="h-10 rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-[color:var(--client-text)] outline-none"
                  onChange={(event) => updatePresentationField(field.key, event.target.value)}
                  value={field.value}
                />
              </label>
            ))}
          </div>
          <label className="grid gap-1">
            <span className="text-xs font-bold text-[color:var(--client-muted)]">交通说明</span>
            <textarea
              className="min-h-[72px] rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 py-2 text-[color:var(--client-text)] outline-none"
              onChange={(event) => updatePresentationField("access", event.target.value)}
              value={config.access}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-bold text-[color:var(--client-muted)]">到店提示</span>
            <textarea
              className="min-h-[72px] rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 py-2 text-[color:var(--client-text)] outline-none"
              onChange={(event) => updatePresentationField("routeGuide", event.target.value)}
              value={config.routeGuide}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              { label: "环境标签", key: "seatLabel" },
              { label: "菜单标签", key: "menuLabel" },
              { label: "人数标签", key: "peopleLabel" }
            ] as const).map((field) => (
              <label className="grid gap-1" key={field.key}>
                <span className="text-xs font-bold text-[color:var(--client-muted)]">{field.label}</span>
                <input
                  className="h-10 rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-[color:var(--client-text)] outline-none"
                  onChange={(event) => updatePresentationField(field.key, event.target.value)}
                  value={config[field.key]}
                />
              </label>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              { label: "支付方式", key: "paymentMethods", value: config.paymentMethods },
              { label: "设备 / 服务标记", key: "equipment", value: config.equipment },
              { label: "环境筛选标签", key: "seatFilters", value: config.seatFilters }
            ] as const).map((field) => (
              <label className="grid gap-1" key={field.key}>
                <span className="text-xs font-bold text-[color:var(--client-muted)]">{field.label}</span>
                <textarea
                  className="min-h-[80px] rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 py-2 text-[color:var(--client-text)] outline-none"
                  onChange={(event) => updatePresentationField(field.key, textToList(event.target.value))}
                  value={listToText(field.value)}
                />
              </label>
            ))}
          </div>
          <div className="grid gap-3">
            {config.offers.map((offer, index) => (
              <div className="rounded-[18px] border border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,transparent)] p-3" key={offer.id}>
                <div className="mb-2 text-xs font-black text-[color:var(--client-text)]">情报 {index + 1}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {storeOfferEditorFields.map((field) => (
                    <label className="grid gap-1" key={field.key}>
                      <span className="text-xs font-bold text-[color:var(--client-muted)]">{field.label}</span>
                      <input
                        className="h-10 rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-[color:var(--client-text)] outline-none"
                        onChange={(event) => updateOfferField(index, field.key, event.target.value)}
                        value={offer[field.key]}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StoreDisplayEditorPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className={storeDisplayEditorContentClassName}>
      <h2 className="px-1 text-sm font-black text-[color:var(--client-text)]">{title}</h2>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function StoreDisplayEditorInput({
  label,
  multiline = false,
  onChange,
  rows = 2,
  value
}: {
  label: string;
  multiline?: boolean;
  onChange: (value: string) => void;
  rows?: number;
  value: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-bold text-[color:var(--client-muted)]">{label}</span>
      {multiline ? (
        <textarea
          className="min-h-[82px] rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 py-2 text-sm text-[color:var(--client-text)] outline-none"
          data-page-drag-ignore="true"
          data-scroll-drag-ignore="true"
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          value={value}
        />
      ) : (
        <input
          className="h-10 rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-sm text-[color:var(--client-text)] outline-none"
          data-page-drag-ignore="true"
          data-scroll-drag-ignore="true"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      )}
    </label>
  );
}

function getStoreDisplayEditorTitle(mode: StoreDisplayEditorMode) {
  if (mode === "gallery") {
    return "编辑图片";
  }

  if (mode === "basic") {
    return "编辑资料";
  }

  if (mode === "menu") {
    return "编辑菜单";
  }

  if (mode === "technician") {
    return "编辑技师资料";
  }

  return "编辑展示文字";
}

function getTargetEntityId(target: string, prefixes: string[]) {
  const prefix = prefixes.find((item) => target.startsWith(item));

  return prefix ? target.slice(prefix.length) : "";
}

function StoreDisplayFullscreenEditor({
  config,
  fallbackMenuCard,
  images,
  industry,
  menuCards,
  mode,
  onClose,
  packageCardUi,
  store,
  target,
  technicians
}: {
  config: StorePresentationConfig;
  fallbackMenuCard?: MenuCard;
  images: string[];
  industry: StoreIndustry;
  menuCards: MenuCard[];
  mode: StoreDisplayEditorMode;
  onClose: () => void;
  packageCardUi: StoreCardDecorationConfig;
  store: Store;
  target: string;
  technicians: Technician[];
}) {
  const menuCardId = getTargetEntityId(target, ["home-menu-", "menu-"]);
  const menuIndex = menuCards.findIndex((menuCard) => menuCard.id === menuCardId);
  const menuCard = menuIndex >= 0 ? menuCards[menuIndex] : fallbackMenuCard;
  const technicianId = getTargetEntityId(target, ["technician-"]);
  const technician = technicians.find((item) => item.id === technicianId) ?? technicians[0];
  const title = getStoreDisplayEditorTitle(mode);
  const menuImageAspectRatio = getStoreMenuImageEditorAspectRatio(packageCardUi);
  const showMenuDeleteAction = mode === "menu" && Boolean(menuCard) && menuIndex >= 0;
  const [pendingFullscreenImageEdit, setPendingFullscreenImageEdit] = useState<PendingStoreImageEdit | null>(null);
  const openFullscreenImageEditor = (source: string, apply: (editedImage: string) => void, options?: Partial<Pick<PendingStoreImageEdit, "aspectRatio" | "description" | "frameClassName" | "frameWidth" | "title">>) => {
    setPendingFullscreenImageEdit({
      apply,
      aspectRatio: options?.aspectRatio ?? 1,
      description: options?.description,
      frameClassName: options?.frameClassName,
      frameWidth: options?.frameWidth,
      source,
      title: options?.title ?? "图片编辑"
    });
  };
  const applyFullscreenImageEdit = (editedImage: string) => {
    pendingFullscreenImageEdit?.apply(editedImage);
    setPendingFullscreenImageEdit(null);
  };
  const updateBasicStoreField = (key: StoreBasicEditorFieldKey, value: string) => {
    updateStoreEntity(store.id, { [key]: value } as Partial<Pick<Store, StoreBasicEditorFieldKey>>);
  };
  const updatePresentationField = <Key extends keyof StorePresentationConfig>(key: Key, value: StorePresentationConfig[Key]) => {
    updateStoreEntity(store.id, {
      presentation: normalizeStorePresentationConfig({ ...config, [key]: value }, industry)
    });
  };
  const updateMenuCards = (nextMenuCards: MenuCard[]) => {
    updateStoreEntity(store.id, {
      presentation: normalizeStorePresentationConfig(
        {
          ...config,
          menuCards: nextMenuCards
        },
        industry
      )
    });
  };
  const updateMenuCard = <Key extends keyof MenuCard>(key: Key, value: MenuCard[Key]) => {
    if (!menuCard) {
      return;
    }

    const nextMenuCard = { ...menuCard, [key]: value };

    updateMenuCards(menuIndex >= 0 ? menuCards.map((item, index) => (index === menuIndex ? nextMenuCard : item)) : [...menuCards, nextMenuCard]);
  };
  const removeMenuCard = () => {
    if (menuCards.length <= 1 || menuIndex < 0) {
      return;
    }

    updateMenuCards(menuCards.filter((_, index) => index !== menuIndex));
    onClose();
  };
  const updateGallery = (nextImages: string[]) => {
    const gallery = nextImages.filter(Boolean).slice(0, 5);
    updateStoreEntity(store.id, {
      cover: gallery[0] ?? store.cover,
      gallery
    });
  };
  const replaceFullscreenMenuImage = async (files: FileList | null) => {
    const [nextImage] = await readImageFilesAsDataUrls(files, 1);

    if (!nextImage) {
      return;
    }

    openFullscreenImageEditor(nextImage, (editedImage) => updateMenuCard("cover", editedImage), {
      aspectRatio: menuImageAspectRatio,
      frameClassName: storeMenuCoverRadiusClassName,
      frameWidth: storeMenuCoverReferenceWidth,
      title: "菜单图片编辑"
    });
  };
  const updateTechnicianField = <Key extends keyof Technician>(key: Key, value: Technician[Key]) => {
    if (!technician) {
      return;
    }

    updateTechnicianEntity(technician.id, { [key]: value } as Partial<Technician>);
  };
  const updateTechnicianImages = (nextImages: string[]) => {
    if (!technician) {
      return;
    }

    const gallery = nextImages.filter(Boolean).slice(0, 5);
    updateTechnicianEntity(technician.id, {
      avatar: gallery[0] ?? technician.avatar,
      gallery
    });
  };

  return (
    <MobileFullscreenPage className="z-[95]">
      <MobileFullscreenHeader
        className="client-store-display-editor-glass-header"
        info="修改、添加或减少当前展示内容"
        onClose={onClose}
        showSpacer={false}
        title={title}
      />
      <main className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+136px)] pt-[calc(env(safe-area-inset-top,0px)+92px)]">
        {mode === "gallery" || mode === "basic" || mode === "presentation" ? (
          <StoreDisplayInlineEditor
            config={config}
            images={images}
            industry={industry}
            mode={mode}
            store={store}
          />
        ) : null}

        {mode === "menu" ? (
          menuCard ? (
            <StoreDisplayEditorPanel title="服务内容">
              <div className="grid gap-3">
                <StoreMenuCoverImage alt={menuCard.name} cardUi={packageCardUi} image={menuCard.cover} />
                <label className="focus-ring inline-flex h-11 cursor-pointer items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_80%,transparent)] px-4 text-sm font-black text-[color:var(--client-text)]">
                  替换图片
                  <input
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const fileInput = event.currentTarget;
                      void replaceFullscreenMenuImage(fileInput.files).finally(() => {
                        fileInput.value = "";
                      });
                    }}
                    type="file"
                  />
                </label>
              </div>
              <StoreDisplayEditorInput label="标题" onChange={(value) => updateMenuCard("name", value)} value={menuCard.name} />
              <StoreDisplayEditorInput label="说明" multiline onChange={(value) => updateMenuCard("subtitle", value)} value={menuCard.subtitle} />
              <div className="grid gap-3 sm:grid-cols-3">
                <StoreDisplayEditorInput label="时长" onChange={(value) => updateMenuCard("duration", value)} value={menuCard.duration} />
                <StoreDisplayEditorInput label="价格" onChange={(value) => updateMenuCard("priceLabel", value)} value={menuCard.priceLabel} />
                <StoreDisplayEditorInput label="适用对象" onChange={(value) => updateMenuCard("audience", value)} value={menuCard.audience} />
              </div>
              <StoreDisplayEditorInput label="服务标签" multiline onChange={(value) => updateMenuCard("tags", textToList(value))} value={listToText(menuCard.tags)} />
              <StoreDisplayEditorInput label="亮点标签" multiline onChange={(value) => updateMenuCard("highlights", textToList(value))} value={listToText(menuCard.highlights)} />
            </StoreDisplayEditorPanel>
          ) : (
            <EmptyStatePanel caption="当前还没有可编辑的服务内容。" title="暂无服务内容" />
          )
        ) : null}

        {mode === "technician" ? (
          technician ? (
            <div className="grid gap-3">
              <ImageGalleryManager
                className="text-[color:var(--client-text)]"
                coverHint="第 1 张会同步为技师卡片主图。"
                description="可以替换、增加或删除当前技师卡片图片。"
                editorAspectRatio={1}
                editorTitle="技师图片编辑"
                images={[technician.avatar, ...(technician.gallery ?? []).filter((image) => image !== technician.avatar)].filter(Boolean).slice(0, 5)}
                label="技师图片"
                maxImages={5}
                onChange={updateTechnicianImages}
              />
              <StoreDisplayEditorPanel title="技师文字与标签">
                <div className="grid gap-3 sm:grid-cols-2">
                  <StoreDisplayEditorInput label="姓名" onChange={(value) => updateTechnicianField("name", value)} value={technician.name} />
                  <StoreDisplayEditorInput label="显示昵称" onChange={(value) => updateTechnicianField("nickname", value)} value={technician.nickname ?? ""} />
                </div>
                <StoreDisplayEditorInput label="简介" multiline onChange={(value) => updateTechnicianField("bio", value)} rows={3} value={technician.bio ?? ""} />
                <StoreDisplayEditorInput label="技能" multiline onChange={(value) => updateTechnicianField("skills", textToList(value))} value={listToText(technician.skills)} />
                <StoreDisplayEditorInput label="服务区域" multiline onChange={(value) => updateTechnicianField("serviceAreas", textToList(value))} value={listToText(technician.serviceAreas)} />
                <StoreDisplayEditorInput label="展示标签" multiline onChange={(value) => updateTechnicianField("profileTags", textToList(value))} value={listToText(technician.profileTags ?? [])} />
              </StoreDisplayEditorPanel>
            </div>
          ) : (
            <EmptyStatePanel caption="当前没有可编辑的技师卡片。" title="暂无技师资料" />
          )
        ) : null}
      </main>
      <ClientEdgeMask edge="bottom" style={storeDisplayEditorBottomMaskStyle} />
      <StickyBottomBar className={storeDisplayEditorBottomShellClassName} panelClassName={storeDisplayEditorBottomPanelClassName} style={storeDisplayEditorBottomBarStyle}>
        <div className={cn("grid w-full gap-2", showMenuDeleteAction ? "grid-cols-[0.78fr_1.16fr_1.18fr]" : "grid-cols-2")}>
          <SecondaryButton className="h-12 min-w-0 px-2 text-xs" onClick={onClose}>
            取消
          </SecondaryButton>
          {showMenuDeleteAction ? (
            <button
              className="focus-ring inline-flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-full border border-[color:color-mix(in_srgb,var(--client-accent)_42%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-accent)_14%,var(--client-bg)_86%)] px-2 text-xs font-black text-[color:color-mix(in_srgb,var(--client-accent)_82%,white_18%)] shadow-[0_12px_24px_color-mix(in_srgb,var(--client-accent)_12%,transparent)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={menuCards.length <= 1}
              onClick={removeMenuCard}
              type="button"
            >
              <AppIcon className="h-4 w-4 shrink-0" name="trash" />
              <span className="min-w-0 whitespace-nowrap">删除当前服务</span>
            </button>
          ) : null}
          <PrimaryButton className="h-12 min-w-0 gap-1.5 px-2 text-xs" onClick={onClose}>
            <AppIcon className="h-4 w-4 shrink-0" name="check" />
            <span className="min-w-0 whitespace-nowrap">保存并关闭</span>
          </PrimaryButton>
        </div>
      </StickyBottomBar>
      {pendingFullscreenImageEdit ? (
        <ImageAdjustmentEditor
          aspectRatio={pendingFullscreenImageEdit.aspectRatio}
          description={pendingFullscreenImageEdit.description}
          frameClassName={pendingFullscreenImageEdit.frameClassName}
          frameWidth={pendingFullscreenImageEdit.frameWidth}
          onApply={applyFullscreenImageEdit}
          onCancel={() => setPendingFullscreenImageEdit(null)}
          source={pendingFullscreenImageEdit.source}
          title={pendingFullscreenImageEdit.title}
        />
      ) : null}
    </MobileFullscreenPage>
  );
}

function CompactMenuCard({
  item,
  cardUi,
  activeIcon = "check",
  editing = false,
  inactiveIcon = "plus",
  selected = false,
  selectLabel,
  showHighlights = false,
  showSelectAction = true,
  editor,
  onChange,
  onSelect,
  onReplaceImage
}: {
  item: MenuCard;
  cardUi?: StoreCardDecorationConfig;
  activeIcon?: IconName;
  editing?: boolean;
  inactiveIcon?: IconName;
  selected?: boolean;
  selectLabel: string;
  showHighlights?: boolean;
  showSelectAction?: boolean;
  editor?: ReactNode;
  onChange?: (item: MenuCard) => void;
  onSelect: () => void;
  onReplaceImage?: (files: FileList | null) => void;
}) {
  const solidTags = cardUi?.tagStyle === "实心";
  const updateField = <Key extends keyof MenuCard>(key: Key, value: MenuCard[Key]) => {
    onChange?.({ ...item, [key]: value });
  };

  return (
    <FlatCard className="p-2.5" editor={editor}>
      <div className={cn("grid gap-2.5 sm:items-start", showSelectAction ? "sm:grid-cols-[88px,minmax(0,1fr),104px]" : "sm:grid-cols-[88px,minmax(0,1fr)]")}>
        <div className="relative">
          <StoreMenuCoverImage alt={item.name} cardUi={cardUi} image={item.cover} />
          {editing ? (
            <label className="absolute inset-x-2 bottom-2 cursor-pointer rounded-full bg-black/58 px-3 py-1.5 text-center text-[11px] font-black text-white shadow-[0_8px_18px_rgba(0,0,0,0.28)] backdrop-blur">
              替换图片
              <input
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  onReplaceImage?.(event.target.files);
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
          ) : null}
        </div>
        <div className="min-w-0">
          <EditableMenuChipInputs editing={editing} items={item.tags} onChange={(tags) => updateField("tags", tags)} slotCount={3} solid={solidTags} wrap={false}>
            <InlineEditableText
              className="min-w-0 truncate whitespace-nowrap rounded-[9px] border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-2 py-0.5 text-[10px] font-black text-[color:var(--client-muted)]"
              editing={editing}
              onChange={(value) => updateField("duration", value)}
              value={item.duration}
            />
            <InlineEditableText
              className="min-w-0 truncate whitespace-nowrap rounded-[9px] border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-2 py-0.5 text-[10px] font-black text-[color:var(--client-muted)]"
              editing={editing}
              onChange={(value) => updateField("audience", value)}
              value={item.audience}
            />
          </EditableMenuChipInputs>
          <InlineEditableText
            className="mt-1.5 block text-[17px] font-black leading-[1.16] tracking-[-0.03em] text-[color:var(--client-text)]"
            editing={editing}
            multiline
            onChange={(value) => updateField("name", value)}
            rows={2}
            value={item.name}
          />
          <InlineEditableText
            className="mt-1 block text-[12px] leading-5 text-[color:var(--client-muted)]"
            editing={editing}
            multiline
            onChange={(value) => updateField("subtitle", value)}
            rows={2}
            value={item.subtitle}
          />
          <div className="mt-2 flex min-w-0 items-center justify-between gap-2 sm:flex-wrap sm:justify-start sm:gap-x-3 sm:gap-y-1">
            <InlineEditableText
              className="min-w-[88px] shrink-0 text-[22px] font-black tracking-[-0.04em] text-[color:var(--client-primary)] sm:w-[112px]"
              editing={editing}
              onChange={(value) => updateField("priceLabel", value)}
              value={item.priceLabel}
            />
            {showSelectAction ? (
              <StoreSelectionIconButton active={selected} activeIcon={activeIcon} className="ml-auto sm:hidden" inactiveIcon={inactiveIcon} label={selectLabel} onSelect={onSelect} />
            ) : null}
          </div>
          {showHighlights ? (
            <div className="mt-2">
              <EditableMenuChipInputs editing={editing} items={item.highlights} onChange={(highlights) => updateField("highlights", highlights)} slotCount={3} solid />
            </div>
          ) : null}
        </div>
        {showSelectAction ? (
          <div className="hidden justify-end sm:flex">
            <StoreSelectionIconButton active={selected} activeIcon={activeIcon} inactiveIcon={inactiveIcon} label={selectLabel} onSelect={onSelect} />
          </div>
        ) : null}
      </div>
    </FlatCard>
  );
}

function EnvironmentGalleryCard({
  image,
  caption,
  onOpen,
  editor,
  editing = false,
  onReplace
}: {
  image: string;
  caption: string;
  onOpen: () => void;
  editor?: ReactNode;
  editing?: boolean;
  onReplace?: (files: FileList | null) => void;
}) {
  return (
    <figure className="space-y-2.5">
      <div className="relative">
        <button className="focus-ring block w-full overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]" onClick={editing ? undefined : onOpen} type="button">
        <img alt={caption} className="h-[248px] w-full scale-[1.035] object-cover transition duration-300 hover:scale-[1.06] sm:h-[280px]" src={getGeneratedImageThumbnailUrl(image)} />
        </button>
        {editor ? <div className="absolute right-3 top-3 z-10">{editor}</div> : null}
        {editing ? (
          <label className="focus-ring absolute bottom-3 left-3 z-10 cursor-pointer rounded-full bg-black/58 px-3 py-2 text-[12px] font-black text-white backdrop-blur">
            替换图片
            <input
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                onReplace?.(event.target.files);
                event.target.value = "";
              }}
              type="file"
            />
          </label>
        ) : null}
      </div>
      <figcaption className="px-0.5 text-[12px] font-semibold leading-5 text-[color:var(--client-text)]">{caption}</figcaption>
    </figure>
  );
}

export function StoreDetailExperience({
  embedded = false,
  onEditFocus,
  pricingControl,
  pricingMode = "store",
  privacyControl,
  scope = "user",
  store,
  technicianPricingRatePercent,
  techniciansOverride
}: StoreDetailExperienceProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const { language } = useI18n();
  const { customers, technicians } = useEntityStore();
  const displayedTechnicians = techniciansOverride ?? technicians;
  const storeApiId = useMemo(() => storeDetailRouteEntityIdToApiId(store.id), [store.id]);
  const [bookingNavigation, setBookingNavigation] = useState<BookingNavigationResponse | null>(null);
  const { getActorForScope, getProfilePosts } = useSocial();
  const currentCustomer = customers.find((customer) => customer.id === session?.linkedCustomerId) ?? customers[0];
  const industry = detectStoreIndustry(store);
  const socialActorKey = getActorForScope(scope);
  const isMerchantShell =
    typeof window !== "undefined" && (window.location.pathname.includes("merchant") || window.location.hash.startsWith("#/merchant"));
  const isMerchantOwnedStore = Boolean(session && session.linkedStoreId === store.id && session.allowedPortals.includes("merchant"));
  const isMerchantEditable = Boolean(
    onEditFocus || scope === "merchant" || (isMerchantOwnedStore && (session?.portal === "merchant" || isMerchantShell))
  );
  const isTechnicianPricingEntry =
    !isMerchantEditable && bookingNavigation?.pricingMode === "technician";
  const isTechnicianPricingActive = isMerchantEditable ? pricingMode === "technician" : isTechnicianPricingEntry;
  const effectiveTechnicianPricingRatePercent = isTechnicianPricingActive
    ? technicianPricingRatePercent ?? bookingNavigation?.technicianPricingRatePercent ?? 100
    : 100;
  const heroBlock = useMemo(() => getStoreDecorationBlockConfig(store, "hero"), [store.id, store.uiDecoration]);
  const bookingBlock = useMemo(() => getStoreDecorationBlockConfig(store, "booking"), [store.id, store.uiDecoration]);
  const menuBlock = useMemo(() => getStoreDecorationBlockConfig(store, "menu"), [store.id, store.uiDecoration]);
  const technicianBlock = useMemo(() => getStoreDecorationBlockConfig(store, "technicians"), [store.id, store.uiDecoration]);
  const galleryBlock = useMemo(() => getStoreDecorationBlockConfig(store, "gallery"), [store.id, store.uiDecoration]);
  const shouldRenderServiceMenu = menuBlock.visible;
  const shouldRenderHomeServiceMenu = menuBlock.visible && (isMerchantEditable || !isTechnicianPricingActive);
  const serviceMenuTabLabel = isTechnicianPricingActive ? "技师" : "菜单";
  const shouldRenderTechnicianShowcase = technicianBlock.visible;
  const shouldShowServicePackagesInMenu = isMerchantEditable || !isTechnicianPricingActive;
  const shouldShowTechniciansInMenu = isMerchantEditable || isTechnicianPricingActive;
  const blockOrderMap = useMemo(
    () => Object.fromEntries(getStoreUiDecoration(store).blocks.map((block, index) => [block.id, index])),
    [store.id, store.uiDecoration]
  ) as Record<string, number>;
  const packageCardUi = useMemo(() => getStoreCardDecorationConfig(store, "package"), [store.id, store.uiDecoration]);

  useEffect(() => {
    if (!storeApiId || isMerchantEditable) {
      setBookingNavigation(null);
      return;
    }

    let mounted = true;
    pricingModeApi
      .getBookingNavigation(storeApiId, { page: 1, pageSize: 20 })
      .then((result) => {
        if (mounted) {
          setBookingNavigation(result);
        }
      })
      .catch(() => {
        if (mounted) {
          setBookingNavigation(null);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isMerchantEditable, storeApiId]);

  const storeTechnicians = useMemo(
    () =>
      displayedTechnicians
        .filter((item) => (item.storeId === store.id || item.relatedStoreIds?.includes(store.id)) && (isMerchantEditable || isTechnicianDisplayVisible(item)))
        .slice(0, 8),
    [displayedTechnicians, isMerchantEditable, store.id]
  );
  const config = useMemo(() => buildStoreProfileConfig(store, industry), [industry, store, store.presentation]);
  const seatCards = useMemo(() => buildSeatCards(store, industry), [industry, store]);
  const baseMenuCards = useMemo(() => buildMenuCards(store, industry), [industry, store]);
  const menuCards = useMemo(() => mergeMenuCardOverrides(baseMenuCards, config.menuCards), [baseMenuCards, config.menuCards]);
  const servicePriceRangeLabel = useMemo(() => buildDisplayedMenuPriceRangeLabel(menuCards, buildServiceMenuPriceRangeLabel(store, industry)), [industry, menuCards, store]);
  const displayedBudgetLabel = industry === "cleaning" ? "¥10,000 - ¥20,000" : servicePriceRangeLabel.replace(/\s*-\s*/g, " - ");
  const mapDetailCopy = storeMapDetailCopyByIndustry[industry];
  const relevantReviews = useMemo(() => buildRelevantReviews(store, storeTechnicians), [store, storeTechnicians]);
  const socialPosts = useMemo(() => {
    const authorKeys = [profileKey({ entityType: "shop", id: store.id })];
    const merged = new Map<string, SocialPost>();

    authorKeys.forEach((authorKey) => {
      getProfilePosts(authorKey, "posts", socialActorKey).forEach((post) => {
        merged.set(post.id, post);
      });
    });

    return sortPostsByNewest(Array.from(merged.values())).sort((left, right) => {
      if (left.isPinned !== right.isPinned) {
        return Number(right.isPinned) - Number(left.isPinned);
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [getProfilePosts, socialActorKey, store.id]);
  const images = useMemo(() => {
    const sourceImages = store.gallery.length > 0 ? store.gallery : [store.cover];
    return Array.from(new Set(sourceImages.filter(Boolean))).slice(0, 5);
  }, [store.cover, store.gallery]);
  const heroSlides = useMemo<FeatureCarouselSlide[]>(
    () =>
      images.map((image, index) => ({
        id: `${store.id}-hero-${index}`,
        image,
        title: store.name,
        caption: config.subtitle
      })),
    [config.subtitle, images, store.id, store.name]
  );
  const environmentGalleryItems = useMemo(
    () =>
      images.map((image, index) => ({
        id: `${store.id}-environment-${index}`,
        image,
        caption:
          seatCards[index]?.description ??
          seatCards[index % Math.max(1, seatCards.length)]?.description ??
          store.tags[index % Math.max(1, store.tags.length)] ??
          config.subtitle
      })),
    [config.subtitle, images, seatCards, store.id, store.tags]
  );
  const timeOptions = useMemo(() => buildTimeOptions(industry, store.nextSlot, store.alwaysBookable), [industry, store.alwaysBookable, store.nextSlot]);
  const routeTechnicianId = searchParams.get("technician")?.trim() ?? "";
  const routeDateParam = searchParams.get("date");
  const routeTimeParam = searchParams.get("time");
  const routeVisitDate = useMemo(() => parseStoreBookingDateParam(routeDateParam), [routeDateParam]);
  const routeTime = useMemo(() => normalizeStoreBookingTimeParam(routeTimeParam), [routeTimeParam]);
  const routedBookingTechnician = useMemo(
    () =>
      displayedTechnicians.find(
        (technician) =>
          technician.id === routeTechnicianId &&
          (technician.storeId === store.id || technician.relatedStoreIds?.includes(store.id))
      ) ?? null,
    [displayedTechnicians, routeTechnicianId, store.id]
  );
  const primaryCheckoutTarget = menuCards[0]?.sourceServiceId ?? services[0]?.id ?? "svc-fallback";
  const baseShareCount = useMemo(() => socialPosts.reduce((sum, post) => sum + post.repostCount, 0), [socialPosts]);
  const pinnedSocialPost = socialPosts.find((post) => post.isPinned);
  const regularSocialPosts = pinnedSocialPost ? socialPosts.filter((post) => post.id !== pinnedSocialPost.id) : socialPosts;

  const [isFavorite, setIsFavorite] = useState(false);
  const [activeMetricDetail, setActiveMetricDetail] = useState<"rating" | "favorite" | null>(null);
  const [activeTab, setActiveTab] = useState<StoreTab>("home");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedVisitDate, setSelectedVisitDate] = useState(() => routeVisitDate ?? getInitialSelectedDate(store.nextSlot, store.alwaysBookable));
  const [selectedPeople, setSelectedPeople] = useState(industry === "dining" ? "2名" : "1名");
  const [selectedTime, setSelectedTime] = useState(routeTime ?? timeOptions[0] ?? nextSlotTime(store.nextSlot));
  const [selectedMenuCardId, setSelectedMenuCardId] = useState(primaryCheckoutTarget);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState(routeTechnicianId);
  const [serviceMenuCollapsed, setServiceMenuCollapsed] = useState(false);
  const [servicePackageMenuCollapsed, setServicePackageMenuCollapsed] = useState(false);
  const [technicianListCollapsed, setTechnicianListCollapsed] = useState(false);
  const [shareBoost, setShareBoost] = useState(0);
  const [offersNowMs, setOffersNowMs] = useState(() => Date.now());
  const [likedOfferIds, setLikedOfferIds] = useState<string[]>([]);
  const [translatedOfferIds, setTranslatedOfferIds] = useState<string[]>([]);
  const [offerReplyBoosts, setOfferReplyBoosts] = useState<Record<string, number>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [activeEditor, setActiveEditor] = useState<ActiveStoreDisplayEditor | null>(null);
  const [pendingStoreImageEdit, setPendingStoreImageEdit] = useState<PendingStoreImageEdit | null>(null);

  useEffect(() => {
    setActiveTab("home");
    setActiveMetricDetail(null);
    setActiveImageIndex(0);
    setSelectedVisitDate(routeVisitDate ?? getInitialSelectedDate(store.nextSlot, store.alwaysBookable));
    setSelectedPeople(industry === "dining" ? "2名" : "1名");
    setSelectedTime(routeTime ?? buildTimeOptions(industry, store.nextSlot, store.alwaysBookable)[0] ?? nextSlotTime(store.nextSlot));
    setSelectedMenuCardId(primaryCheckoutTarget);
    setSelectedTechnicianId(routeTechnicianId);
    setServiceMenuCollapsed(false);
    setServicePackageMenuCollapsed(false);
    setTechnicianListCollapsed(false);
    setShareBoost(0);
    setLikedOfferIds([]);
    setTranslatedOfferIds([]);
    setOfferReplyBoosts({});
    setLightboxIndex(null);
    setActiveEditor(null);
  }, [industry, primaryCheckoutTarget, routeTechnicianId, routeTime, routeVisitDate, store.alwaysBookable, store.id, store.nextSlot]);

  useEffect(() => {
    setActiveImageIndex((current) => Math.min(current, Math.max(0, images.length - 1)));
  }, [images.length]);

  useEffect(() => {
    if (activeTab !== "offers") {
      return;
    }

    const timer = window.setInterval(() => {
      setOffersNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeTab]);

  useEffect(() => {
    if (lightboxIndex === null) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxIndex(null);
        return;
      }

      if (event.key === "ArrowLeft") {
        setLightboxIndex((current) => (current === null ? current : (current - 1 + images.length) % images.length));
      }

      if (event.key === "ArrowRight") {
        setLightboxIndex((current) => (current === null ? current : (current + 1) % images.length));
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [images.length, lightboxIndex]);

  const favoriteCount = config.favoriteCount + (isFavorite ? 1 : 0);
  const shareCount = baseShareCount + shareBoost;
  const selectedCheckoutTarget = menuCards.some((item) => item.sourceServiceId === selectedMenuCardId) ? selectedMenuCardId : primaryCheckoutTarget;
  const selectedBookingDurationMinutes = useMemo(
    () => parseBookingDurationMinutes(menuCards.find((item) => item.sourceServiceId === selectedCheckoutTarget)?.duration),
    [menuCards, selectedCheckoutTarget]
  );
  const unavailableTechnicianIds = useMemo(() => {
    if (isMerchantEditable) {
      return new Set<string>();
    }

    return new Set(
      storeTechnicians
        .filter((technician) =>
          isTechnicianUnavailableForSelectedTime({
            bookingDurationMinutes: selectedBookingDurationMinutes,
            selectedDate: selectedVisitDate,
            selectedTime,
            store,
            technician
          })
        )
        .map((technician) => technician.id)
    );
  }, [isMerchantEditable, selectedBookingDurationMinutes, selectedTime, selectedVisitDate, store, storeTechnicians]);
  const selectedBookingTechnician = useMemo(
    () => {
      const selected = displayedTechnicians.find(
        (technician) =>
          technician.id === selectedTechnicianId &&
          !unavailableTechnicianIds.has(technician.id) &&
          (technician.storeId === store.id || technician.relatedStoreIds?.includes(store.id)) &&
          (isMerchantEditable || isTechnicianDisplayVisible(technician))
      );

      if (selected) {
        return selected;
      }

      return routedBookingTechnician && !unavailableTechnicianIds.has(routedBookingTechnician.id)
        ? routedBookingTechnician
        : null;
    },
    [displayedTechnicians, isMerchantEditable, routedBookingTechnician, selectedTechnicianId, store.id, unavailableTechnicianIds]
  );
  useEffect(() => {
    if (selectedTechnicianId && unavailableTechnicianIds.has(selectedTechnicianId)) {
      setSelectedTechnicianId("");
    }
  }, [selectedTechnicianId, unavailableTechnicianIds]);
  const displayedTimeOptions = useMemo(
    () => (timeOptions.includes(selectedTime) ? timeOptions : [selectedTime, ...timeOptions]),
    [selectedTime, timeOptions]
  );
  const buildBookingHref = (checkoutTarget: string) =>
    buildStoreCheckoutRoute(checkoutTarget, {
      date: formatDateParam(selectedVisitDate),
      people: selectedPeople,
      storeId: store.id,
      technicianId: selectedBookingTechnician?.id,
      time: selectedTime
    });
  const bookingHref = buildBookingHref(selectedCheckoutTarget);
  const canForwardOfferToNeedo = session?.portal === "merchant" && session.linkedStoreId === store.id && !isMerchantEditable;
  const updateBasicStoreField = (key: StoreBasicEditorFieldKey, value: string) => {
    updateStoreEntity(store.id, { [key]: value } as Partial<Pick<Store, StoreBasicEditorFieldKey>>);
  };
  const updatePresentationField = <Key extends keyof StorePresentationConfig>(key: Key, value: StorePresentationConfig[Key]) => {
    updateStoreEntity(store.id, {
      presentation: normalizeStorePresentationConfig({ ...config, [key]: value }, industry)
    });
  };
  const updateOfferField = <Key extends keyof StoreOfferConfig>(offerIndex: number, key: Key, value: StoreOfferConfig[Key]) => {
    updateStoreEntity(store.id, {
      presentation: normalizeStorePresentationConfig(
        {
          ...config,
          offers: config.offers.map((offer, index) => (index === offerIndex ? { ...offer, [key]: value } : offer))
        },
        industry
      )
    });
  };
  const updateMenuCards = (nextMenuCards: MenuCard[]) => {
    updateStoreEntity(store.id, {
      presentation: normalizeStorePresentationConfig(
        {
          ...config,
          menuCards: nextMenuCards
        },
        industry
      )
    });
  };
  const updateMenuCard = (menuIndex: number, nextMenuCard: MenuCard) => {
    updateMenuCards(menuCards.map((menuCard, index) => (index === menuIndex ? nextMenuCard : menuCard)));
  };
  const updateGallery = (nextImages: string[]) => {
    const gallery = nextImages.filter(Boolean).slice(0, 5);
    updateStoreEntity(store.id, {
      cover: gallery[0] ?? store.cover,
      gallery
    });
  };
  const openStoreImageEditor = (source: string, apply: (editedImage: string) => void, options?: Partial<Pick<PendingStoreImageEdit, "aspectRatio" | "description" | "frameClassName" | "frameWidth" | "title">>) => {
    setPendingStoreImageEdit({
      apply,
      aspectRatio: options?.aspectRatio ?? 1,
      description: options?.description,
      frameClassName: options?.frameClassName,
      frameWidth: options?.frameWidth,
      source,
      title: options?.title ?? "图片编辑"
    });
  };
  const applyStoreImageEdit = (editedImage: string) => {
    pendingStoreImageEdit?.apply(editedImage);
    setPendingStoreImageEdit(null);
  };
  const toggleTechnicianDisplayVisibility = (technician: Technician) => {
    const currentVisible = isTechnicianDisplayVisible(technician);

    updateTechnicianEntity(technician.id, { visible: !isTechnicianDisplayVisible(technician) });
    if (currentVisible && selectedTechnicianId === technician.id) {
      setSelectedTechnicianId("");
    }
  };
  const replaceGalleryImage = async (imageIndex: number, files: FileList | null) => {
    const [nextImage] = await readImageFilesAsDataUrls(files, 1);

    if (!nextImage) {
      return;
    }

    openStoreImageEditor(nextImage, (editedImage) => updateGallery(images.map((image, index) => (index === imageIndex ? editedImage : image))), {
      aspectRatio: storeHeroGalleryAspectRatio,
      frameClassName: storeHeroGalleryRadiusClassName,
      frameWidth: storeHeroGalleryEditorFrameWidth,
      title: "展示图片编辑"
    });
  };
  const replaceMenuCardImage = async (menuIndex: number, files: FileList | null) => {
    const [nextImage] = await readImageFilesAsDataUrls(files, 1);

    if (!nextImage) {
      return;
    }

    openStoreImageEditor(nextImage, (editedImage) => updateMenuCard(menuIndex, { ...menuCards[menuIndex], cover: editedImage }), {
      aspectRatio: getStoreMenuImageEditorAspectRatio(packageCardUi),
      frameClassName: storeMenuCoverRadiusClassName,
      frameWidth: storeMenuCoverReferenceWidth,
      title: "菜单图片编辑"
    });
  };
  const addMerchantMenuCard = () => {
    const nextMenuCard = buildNextStoreMenuCard({
      images,
      menuCards,
      store
    });
    const nextMenuCardEditorTarget = activeTab === "menu" ? `menu-${nextMenuCard.id}` : `home-menu-${nextMenuCard.id}`;

    setServiceMenuCollapsed(false);
    setServicePackageMenuCollapsed(false);
    updateMenuCards([...menuCards, nextMenuCard]);
    if (!onEditFocus) {
      setActiveEditor({ menuCard: nextMenuCard, mode: "menu", target: nextMenuCardEditorTarget });
    }
  };
  const handleMerchantEditFocus = (focus: StoreDisplayEditorMode, target: string = focus) => {
    if (onEditFocus) {
      onEditFocus(focus === "gallery" || focus === "basic" || focus === "presentation" ? focus : "presentation");
      return;
    }

    setActiveEditor((current) => (current?.target === target ? null : { mode: focus, target }));
  };
  const isMerchantEditorActive = (target: string) => !onEditFocus && activeEditor?.target === target;
  const renderMerchantEditor = (
    focus: StoreDisplayEditorMode,
    label = "编辑",
    className?: string,
    _size: "default" | "compact" = "default",
    target: string = focus
  ) =>
    isMerchantEditable ? (
      <StoreInlineEditLink
        active={isMerchantEditorActive(target)}
        className={className}
        label={isMerchantEditorActive(target) ? "完成修改" : label}
        onClick={() => handleMerchantEditFocus(focus, target)}
      />
    ) : null;
  const renderActiveInlineEditor = (_target: string) => null;

  const toggleOfferLike = (offerId: string) => {
    setLikedOfferIds((current) => (current.includes(offerId) ? current.filter((item) => item !== offerId) : [...current, offerId]));
  };

  const toggleOfferTranslation = (offerId: string) => {
    setTranslatedOfferIds((current) => (current.includes(offerId) ? current.filter((item) => item !== offerId) : [...current, offerId]));
  };

  const bumpOfferReply = (offerId: string) => {
    setOfferReplyBoosts((current) => ({ ...current, [offerId]: (current[offerId] ?? 0) + 1 }));
  };

  const forwardOfferToNeedo = (offer: OfferCard, coverImage: string) => {
    const currentPoints = currentCustomer?.points ?? 0;

    if (currentPoints < 1000) {
      window.alert("当前积分不足 1000 point，暂时无法发送到 NeeDo 情报页。");
      return;
    }

    const shouldContinue = window.confirm("本次发送情报需要耗费 1000 point，是否继续？");

    if (!shouldContinue) {
      return;
    }

    updateCustomerEntity(currentCustomer.id, (customer) => ({
      points: Math.max(0, (customer.points ?? 0) - 1000)
    }));

    appendNeedoExternalInfoPost({
      author: store.name,
      area: offer.applicable,
      budget: parsePriceNumber(menuCards[0]?.priceLabel ?? store.priceLabel),
      detail: offer.stackingRule,
      expiresAt: resolveOfferExpiryIso(offer.validUntil),
      image: coverImage,
      role: "店铺情报",
      tags: [offer.benefit, store.area, ...store.tags.slice(0, 2)],
      time: offer.conditions,
      title: offer.title
    });

    navigate("/needo?tab=reverse");
  };
  const getTechnicianServiceListTo = (technicianId: string) => getScopedTechnicianServiceListPath(scope, store.id, technicianId);

  const renderTechnicianServiceListRows = ({ selectable = false }: { selectable?: boolean } = {}) =>
    storeTechnicians.length > 0 ? (
      <div className="mt-3 grid gap-2.5">
        {storeTechnicians.map((technician) => {
          const active = selectedBookingTechnician?.id === technician.id;
          const technicianVisible = isTechnicianDisplayVisible(technician);
          const unavailable = !isMerchantEditable && unavailableTechnicianIds.has(technician.id);

          return (
            <StoreTechnicianServiceListRow
              fallbackServices={services}
              isMerchantEditable={isMerchantEditable}
              key={technician.id}
              onSelect={selectable ? () => {
                if (unavailable) {
                  return;
                }

                setSelectedTechnicianId(active ? "" : technician.id);
              } : undefined}
              onToggleVisibility={() => toggleTechnicianDisplayVisibility(technician)}
              profileTo={getScopedProfileDetailPath(scope, "technician", technician.id)}
              quoteRatePercent={effectiveTechnicianPricingRatePercent}
              selected={selectable ? active : undefined}
              serviceListTo={getTechnicianServiceListTo(technician.id)}
              technician={technician}
              technicianVisible={technicianVisible}
              unavailable={selectable ? unavailable : false}
            />
          );
        })}
      </div>
    ) : (
      <EmptyStatePanel caption="当前商户还没有开放可预约技师。" title="暂无技师" />
    );
  const technicianServiceListRows = renderTechnicianServiceListRows();
  const storeHomeTechnicianServiceListRows = renderTechnicianServiceListRows({ selectable: true });
  const renderServiceMenuPackageSection = ({
    key,
    showHighlights = false,
    showSectionHeader = true,
    targetPrefix,
    visibleCards
  }: {
    key: string;
    showHighlights?: boolean;
    showSectionHeader?: boolean;
    targetPrefix: "home-menu" | "menu";
    visibleCards: MenuCard[];
  }) =>
    shouldShowServicePackagesInMenu ? (
      <section className="space-y-3" key={key}>
        {showSectionHeader ? (
          <SectionTitle caption="店铺提供的服务套餐菜单" title="服务套餐菜单">
            <CollapsibleSectionButton
              collapsed={servicePackageMenuCollapsed}
              label="服务套餐菜单"
              onToggle={() => setServicePackageMenuCollapsed((current) => !current)}
            />
          </SectionTitle>
        ) : null}
        {isMerchantEditable && isTechnicianPricingActive ? (
          <PricingModeHiddenWarning message="技师定价已开启，服务套餐菜单已隐藏，不会被用户看到。" />
        ) : null}
        {!showSectionHeader || !servicePackageMenuCollapsed ? (
          <div className="grid gap-2.5">
          {visibleCards.map((item, index) => {
            const menuIndex = menuCards.findIndex((menuCard) => menuCard.id === item.id);
            const editorTarget = `${targetPrefix}-${item.id}`;
            const active = selectedCheckoutTarget === item.sourceServiceId;
            const menuEditorActive = isMerchantEditorActive(editorTarget);
            const serviceSelectLabel = active ? "已选服务套餐" : "选择服务套餐";

            return (
              <div className="grid gap-2" key={item.id}>
                <CompactMenuCard
                  activeIcon="check"
                  cardUi={packageCardUi}
                  editing={menuEditorActive}
                  editor={renderMerchantEditor("menu", "编辑菜单", undefined, "default", editorTarget)}
                  inactiveIcon="plus"
                  item={item}
                  onChange={(nextMenuCard) => updateMenuCard(menuIndex >= 0 ? menuIndex : index, nextMenuCard)}
                  onReplaceImage={(files) => {
                    void replaceMenuCardImage(menuIndex >= 0 ? menuIndex : index, files);
                  }}
                  onSelect={() => {
                    setSelectedMenuCardId(item.sourceServiceId);
                  }}
                  selected={active}
                  selectLabel={serviceSelectLabel}
                  showHighlights={showHighlights}
                  showSelectAction={!isMerchantEditable}
                />
                {renderActiveInlineEditor(editorTarget)}
              </div>
            );
          })}
          {isMerchantEditable ? (
            <MerchantAddServiceButton onAdd={addMerchantMenuCard} />
          ) : null}
          </div>
        ) : null}
      </section>
    ) : null;
  const renderTechnicianMenuListSection = (key: string) =>
    shouldShowTechniciansInMenu ? (
      <section className="space-y-3" key={key}>
        <SectionTitle showInfo={false} title="技师列表" />
        {isMerchantEditable && !isTechnicianPricingActive ? (
          <PricingModeHiddenWarning message="商户定价已开启，技师列表已隐藏，不会被用户看到。" />
        ) : null}
        {technicianServiceListRows}
      </section>
    ) : null;
  const serviceMenuHomePackageSection = renderServiceMenuPackageSection({
    key: "service-package-menu",
    showSectionHeader: false,
    targetPrefix: "home-menu",
    visibleCards: isMerchantEditable ? menuCards : menuCards.slice(0, 3)
  });
  const serviceMenuPackageSection = renderServiceMenuPackageSection({
    key: "service-package-menu-tab",
    showHighlights: true,
    targetPrefix: "menu",
    visibleCards: menuCards
  });
  const technicianMenuListSection = renderTechnicianMenuListSection("technician-list-tab");
  const serviceMenuTabOrderedSections = isTechnicianPricingActive
    ? [technicianMenuListSection, serviceMenuPackageSection]
    : [serviceMenuPackageSection, technicianMenuListSection];

  const tabs = useMemo<Array<{ label: string; value: StoreTab }>>(
    () => [
      { label: "首页", value: "home" },
      ...(galleryBlock.visible ? [{ label: "环境", value: "seats" as const }] : []),
      ...(shouldRenderServiceMenu ? [{ label: serviceMenuTabLabel, value: "menu" as const }] : []),
      { label: "动态", value: "moments" },
      { label: "情报", value: "offers" },
      { label: "地图", value: "map" }
    ],
    [galleryBlock.visible, serviceMenuTabLabel, shouldRenderServiceMenu]
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.value === activeTab)) {
      setActiveTab("home");
    }
  }, [activeTab, tabs]);

  const tabSwitcher = (
    <FeatureSegmentedTabs
      items={tabs}
      onChange={setActiveTab}
      value={activeTab}
    />
  );
  const blockOrderStyle = (blockId: StoreDecorationBlockId): CSSProperties => ({
    order: blockOrderMap[blockId] ?? 0
  });
  const basicCardEditing = isMerchantEditorActive("basic-card");
  const heroGalleryEditing = isMerchantEditorActive("hero-gallery");
  const mapLocationEditing = isMerchantEditorActive("map-location");
  const mapGuideEditing = isMerchantEditorActive("map-guide");

  const content = (
    <>
      {activeTab === "home" ? (
        <div className="flex flex-col gap-4">
          <section className="space-y-2.5" style={blockOrderStyle("hero")}>
            {heroBlock.visible ? (
              <div className="space-y-2.5">
                <div className="relative">
                  <FeatureCarousel
                    activeIndex={activeImageIndex}
                    autoRotateMs={null}
                    cardHeightClassName="h-[204px]"
                    onActiveIndexChange={setActiveImageIndex}
                    renderSlide={({ slide, index }) => (
                      <>
                        <img alt={slide.title} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(slide.image)} />
                        {slide.caption ? (
                          <>
                            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/72 via-black/34 to-transparent" />
                            <p className="absolute inset-x-4 bottom-8 max-w-[76%] text-[13px] font-bold leading-5 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
                              {slide.caption}
                            </p>
                          </>
                        ) : null}
                        {heroGalleryEditing ? (
                          <div className="relative flex h-full items-end justify-end p-4 pb-8 text-white">
                            <label className="focus-ring inline-flex w-fit cursor-pointer items-center rounded-full bg-black/58 px-3 py-2 text-[12px] font-black text-white backdrop-blur">
                              替换图片
                              <input
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => {
                                  void replaceGalleryImage(index, event.target.files);
                                  event.target.value = "";
                                }}
                                type="file"
                              />
                            </label>
                          </div>
                        ) : !isMerchantEditable ? (
                          <button
                            aria-label={`打开${store.name}大图 ${index + 1}`}
                            className="absolute inset-0"
                            onClick={() => setLightboxIndex(index)}
                            type="button"
                          >
                            <span className="sr-only">打开大图</span>
                          </button>
                        ) : null}
                      </>
                    )}
                    slides={heroSlides}
                  />
                  {renderMerchantEditor("gallery", "编辑图片", "absolute right-3 top-3 z-30", "default", "hero-gallery")}
                </div>

                <div className={cn(featureCarouselFrameClassName, "scrollbar-none flex gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-1 pb-1")}>
                  {images.map((image, index) => (
                    <div className="relative h-16 w-16 shrink-0" key={`${image}-${index}`}>
                      <button
                        className={cn(
                          "h-16 w-16 overflow-hidden rounded-[20px] border transition",
                          index === activeImageIndex
                            ? "border-[color:var(--client-primary)] shadow-[0_10px_22px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                            : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] opacity-78"
                        )}
                        onClick={() => setActiveImageIndex(index)}
                        type="button"
                      >
                        <img alt={`${store.name} 缩略图 ${index + 1}`} className="h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(image)} />
                      </button>
                      {renderMerchantEditor(
                        "gallery",
                        "编辑",
                        "absolute right-1 top-1 z-10 border-white/20 bg-black/55 text-white shadow-none",
                        "compact",
                        "hero-gallery"
                      )}
                      {heroGalleryEditing ? (
                        <label className="absolute inset-x-1 bottom-1 z-10 cursor-pointer rounded-full bg-black/58 px-2 py-1 text-center text-[10px] font-black text-white backdrop-blur">
                          替换
                          <input
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                              void replaceGalleryImage(index, event.target.files);
                              event.target.value = "";
                            }}
                            type="file"
                          />
                        </label>
                      ) : null}
                    </div>
                  ))}
                </div>
                {renderActiveInlineEditor("hero-gallery")}
              </div>
            ) : null}

            <FlatCard className="store-basic-info-block space-y-3 !rounded-none !border-0 !bg-transparent !p-0 !shadow-none">
              <div className="grid grid-cols-3 gap-2">
                <StoreMetricDetailButton
                  active={activeMetricDetail === "rating"}
                  ariaLabel="查看评价件数"
                  icon="star"
                  label={store.rating.toFixed(1)}
                  metric="rating"
                  onClick={() => setActiveMetricDetail((current) => (current === "rating" ? null : "rating"))}
                  primary
                />
                <StoreMetricDetailButton
                  active={activeMetricDetail === "favorite"}
                  ariaLabel="查看收藏详细数字"
                  icon="heart"
                  label={formatStoreCompactCount(favoriteCount)}
                  metric="favorite"
                  onClick={() => setActiveMetricDetail((current) => (current === "favorite" ? null : "favorite"))}
                />
                <TransportEstimatePill className="w-full min-w-0 justify-center gap-1.5 px-2 text-[12px] !font-normal" distanceText={config.distance} />
              </div>
              {activeMetricDetail ? (
                <div className="inline-flex w-full items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_48%,transparent)] px-3 py-2 text-[12px] font-normal text-[color:var(--client-muted)]">
                  {activeMetricDetail === "rating" ? (
                    <span>
                      评价件数 {formatStoreDetailedCount(store.reviewCount)}
                    </span>
                  ) : (
                    <span>
                      收藏人数 {formatStoreDetailedCount(favoriteCount)}
                    </span>
                  )}
                </div>
              ) : null}

              <div className="grid gap-x-4 gap-y-3 border-y border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] py-3 sm:grid-cols-2">
                <InfoRow label="预算">
                  <p className="mt-1.5 text-sm font-normal leading-6 text-[color:var(--client-text)]">{displayedBudgetLabel}</p>
                </InfoRow>
                <InfoRow label="地址">
                  <InlineEditableText
                    className="mt-1.5 block text-sm font-semibold leading-6"
                    editing={basicCardEditing}
                    onChange={(value) => updateBasicStoreField("address", value)}
                    value={store.address}
                  />
                </InfoRow>
                <InfoRow label="最近车站">
                  {basicCardEditing ? (
                    <div className="mt-1.5 grid gap-1.5">
                      <InlineEditableText
                        className="text-sm font-semibold leading-6"
                        editing
                        onChange={(value) => updatePresentationField("station", value)}
                        value={config.station}
                      />
                      <p className="text-sm font-semibold leading-6 text-[color:var(--client-muted)]">{config.distance}</p>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm font-semibold leading-6 text-[color:var(--client-text)]">
                      {config.station} · {config.distance}
                    </p>
                  )}
                </InfoRow>
                <InfoRow label="营业时间">
                  {basicCardEditing ? (
                    <BusinessHoursRangePicker onChange={(value) => updateBasicStoreField("businessHours", value)} value={store.businessHours} />
                  ) : (
                    <p className="mt-1.5 text-sm font-semibold leading-6 text-[color:var(--client-text)]">{store.businessHours}</p>
                  )}
                </InfoRow>
                <InfoRow label="最近可约">
                  <p className="mt-1.5 text-sm font-semibold leading-6 text-[color:var(--client-text)]">{store.nextSlot}</p>
                </InfoRow>
              </div>

              <EditableTagChips editing={basicCardEditing} onChange={(tags) => updateStoreEntity(store.id, { tags })} tags={store.tags} />
            </FlatCard>
          </section>

          {bookingBlock.visible ? (
            <section style={blockOrderStyle("booking")}>
              <SectionTitle caption="选择来店日期、人数与时间" title="选择预约时间">
                {isMerchantEditable ? (
                  <StoreInlineEditLink
                    className="border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] text-[color:var(--client-text)]"
                    label="编辑排班"
                    to={merchantScheduleEditorHref}
                  />
                ) : null}
              </SectionTitle>
              <div className="mt-3">
                <FlatCard
                  className="space-y-3 bg-[color:color-mix(in_srgb,var(--client-surface)_58%,transparent)]"
                >
                  <AvailabilityCalendar
                    onPeopleChange={setSelectedPeople}
                    onSelectDate={(date) => setSelectedVisitDate(date)}
                    onSelectDay={(day) => setSelectedVisitDate(new Date(selectedVisitDate.getFullYear(), selectedVisitDate.getMonth(), day))}
                    onTimeChange={setSelectedTime}
                    alwaysAvailable={store.alwaysBookable}
                    people={selectedPeople}
                    selectedDate={selectedVisitDate}
                    selectedDay={selectedVisitDate.getDate()}
                    time={selectedTime}
                    timeOptions={displayedTimeOptions}
                    title="来店日"
                  />
                  <div className="flex justify-center border-t border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] pt-3">
                    <PrimaryButton className={storeBookingCtaButtonClassName} to={bookingHref}>
                      <AppIcon className="h-4 w-4" name="calendar" />
                      <span>{bookingCtaCopy(store.openStatus)}</span>
                    </PrimaryButton>
                  </div>
                </FlatCard>
              </div>
            </section>
          ) : null}

          {shouldRenderHomeServiceMenu ? (
            <section style={blockOrderStyle("menu")}>
              <SectionTitle caption="先看当前最受欢迎的预约菜单" title={menuBlock.name}>
                <CollapsibleSectionButton
                  collapsed={serviceMenuCollapsed}
                  label={menuBlock.name}
                  onToggle={() => setServiceMenuCollapsed((current) => !current)}
                />
              </SectionTitle>
              {!serviceMenuCollapsed ? (
                <div className="mt-3 grid gap-4">{serviceMenuHomePackageSection}</div>
              ) : null}
            </section>
          ) : null}

          {shouldRenderTechnicianShowcase ? (
            <section style={blockOrderStyle("technicians")}>
              <SectionTitle showInfo={false} title={technicianBlock.name}>
                <CollapsibleSectionButton
                  collapsed={technicianListCollapsed}
                  label={technicianBlock.name}
                  onToggle={() => setTechnicianListCollapsed((current) => !current)}
                />
              </SectionTitle>
              {!technicianListCollapsed ? (
                isTechnicianPricingActive ? (
                  storeHomeTechnicianServiceListRows
                ) : storeTechnicians.length > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    {storeTechnicians.map((technician, index) => {
                      const active = selectedBookingTechnician?.id === technician.id;
                      const technicianVisible = isTechnicianDisplayVisible(technician);
                      const unavailable = !isMerchantEditable && unavailableTechnicianIds.has(technician.id);

                      return (
                        <StoreTechnicianSelectableCard
                          active={active}
                          fallbackServices={services}
                          isMerchantEditable={isMerchantEditable}
                          key={technician.id}
                          language={language}
                          onSelect={() => {
                            if (isMerchantEditable) {
                              toggleTechnicianDisplayVisibility(technician);
                              return;
                            }

                            if (unavailable) {
                              return;
                            }

                            setSelectedTechnicianId(active ? "" : technician.id);
                          }}
                          profileTo={getScopedProfileDetailPath(scope, "technician", technician.id)}
                          rankIndex={index}
                          technician={technician}
                          technicianVisible={technicianVisible}
                          unavailable={unavailable}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <EmptyStatePanel caption="当前商户还没有开放可预约技师。" title="暂无技师" />
                )
              ) : null}
            </section>
          ) : null}

          <section style={{ order: 99 }}>
            <SectionTitle caption="近期来店用户的真实反馈" title="精选评价" />
            <div className="mt-3 grid gap-3">
              {relevantReviews.map((review, index) => (
                <FeaturedReviewCard index={index} key={review.id} review={review} />
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "seats" && galleryBlock.visible ? (
        <div className="space-y-4">
          <section>
            <SectionTitle caption="主要环境照片一览，直接看空间氛围即可" title={galleryBlock.name} />
            <div className="mt-3 grid grid-cols-1 gap-y-5 sm:grid-cols-2 sm:gap-x-3 sm:gap-y-4">
              {environmentGalleryItems.map((item, index) => {
                const editorTarget = `gallery-${item.id}`;

                return (
                  <div className="grid gap-2" key={item.id}>
                    <EnvironmentGalleryCard
                      caption={item.caption}
                      editing={isMerchantEditorActive(editorTarget)}
                      editor={renderMerchantEditor("gallery", "编辑图片", undefined, "default", editorTarget)}
                      image={item.image}
                      onOpen={() => setLightboxIndex(index)}
                      onReplace={(files) => {
                        void replaceGalleryImage(index, files);
                      }}
                    />
                    {renderActiveInlineEditor(editorTarget)}
                  </div>
                );
              })}
            </div>
            {environmentGalleryItems.length === 0 ? <EmptyStatePanel caption="当前门店还没有上传环境照片。" title="暂无环境照片" /> : null}
          </section>
        </div>
      ) : null}

      {activeTab === "menu" && shouldRenderServiceMenu ? (
        <div className="space-y-4">
          {serviceMenuTabOrderedSections}
        </div>
      ) : null}

      {activeTab === "moments" ? (
        <section className="overflow-hidden border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_12%,transparent)]">
          {pinnedSocialPost ? (
            <div className="border-b border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]">
              <div className="px-4 py-3 text-xs font-semibold text-[color:var(--client-muted)] sm:px-5">置顶动态</div>
              <SocialPostItem actorKey={socialActorKey} post={pinnedSocialPost} scope={scope} />
            </div>
          ) : null}

          {regularSocialPosts.length > 0 ? (
            regularSocialPosts.map((post) => <SocialPostItem actorKey={socialActorKey} key={post.id} post={post} scope={scope} />)
          ) : pinnedSocialPost ? null : (
            <div className="p-4">
              <SocialEmptyState description="这家门店暂时还没有公开动态。" title="暂无动态" />
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "offers" ? (
        <div className="space-y-4">
          <section>
            <SectionTitle caption="优惠、营业提醒和近期主推都放在这里" title="情报" />
            <div className="mt-3 grid gap-2.5">
              {config.offers.map((offer, index) => {
                const coverImage = menuCards[index % Math.max(1, menuCards.length)]?.cover ?? images[index % Math.max(1, images.length)];
                const editorTarget = `offer-${offer.id}`;
                const offerEditorActive = isMerchantEditorActive(editorTarget);

                return (
                  <div className="grid gap-2" key={offer.id}>
                    <OfferInfoCard
                      cornerBadge={
                        isMerchantEditable ? <AppIcon className={cn("h-4 w-4", offerEditorActive && "!text-[#06100b]")} name={offerEditorActive ? "check" : "edit"} /> : canForwardOfferToNeedo ? <ShareNetworkIcon className="h-4 w-4" /> : undefined
                      }
                      cornerBadgeAriaLabel={isMerchantEditable ? (offerEditorActive ? "完成修改" : "编辑情报展示") : canForwardOfferToNeedo ? "付费转发到 NeeDo 情报页" : undefined}
                      cornerBadgeClassName={
                        isMerchantEditable
                          ? cn(
                              "grid h-10 w-10 place-items-center !border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] !bg-[color:color-mix(in_srgb,var(--client-surface)_92%,transparent)] px-0 py-0 !text-[color:var(--client-text)] !shadow-[0_10px_22px_rgba(0,0,0,0.12)] backdrop-blur-xl",
                              offerEditorActive && "!border-[color:var(--client-primary)] !bg-[color:var(--client-primary)] !text-[#06100b]"
                            )
                          : canForwardOfferToNeedo
                            ? "grid h-10 w-10 place-items-center px-0 py-0"
                          : undefined
                      }
                      expiryValue={
                        <InlineEditableText
                          className="text-[13px] font-semibold"
                          editing={offerEditorActive}
                          onChange={(value) => updateOfferField(index, "validUntil", value)}
                          value={offer.validUntil}
                        />
                      }
                      expiryCountdown={formatOfferCountdown(offer.validUntil, offersNowMs)}
                      fields={[
                        {
                          label: "利用条件",
                          value: (
                            <InlineEditableText
                              className="text-[13px] font-semibold leading-5"
                              editing={offerEditorActive}
                              multiline
                              onChange={(value) => updateOfferField(index, "conditions", value)}
                              rows={2}
                              value={offer.conditions}
                            />
                          )
                        },
                        {
                          label: "适用范围",
                          value: (
                            <InlineEditableText
                              className="text-[13px] font-semibold leading-5"
                              editing={offerEditorActive}
                              multiline
                              onChange={(value) => updateOfferField(index, "applicable", value)}
                              rows={2}
                              value={offer.applicable}
                            />
                          )
                        }
                      ]}
                      footer={
                        <MomentActionBar
                          bordered={false}
                          likeCount={getOfferLikeCount(offer) + (likedOfferIds.includes(offer.id) ? 1 : 0)}
                          liked={likedOfferIds.includes(offer.id)}
                          onForward={() => {
                            void shareContent({
                              title: `${offer.title} | ${store.name}`,
                              text: `${offer.benefit} · ${offer.conditions} · ${offer.applicable}`,
                              url: `/stores/${store.id}`
                            });
                          }}
                          onLike={() => toggleOfferLike(offer.id)}
                          onReply={() => bumpOfferReply(offer.id)}
                          onTranslate={() => toggleOfferTranslation(offer.id)}
                          replyCount={getOfferReplyCount(offer) + (offerReplyBoosts[offer.id] ?? 0)}
                          tone="client"
                          translated={translatedOfferIds.includes(offer.id)}
                        />
                      }
                      image={coverImage}
                      imageAlt={`${offer.title} 缩略图`}
                      imageLabel="情报"
                      noteValue={
                        <InlineEditableText
                          className="text-[13px] font-semibold leading-6"
                          editing={offerEditorActive}
                          multiline
                          onChange={(value) => updateOfferField(index, "stackingRule", value)}
                          rows={2}
                          value={offer.stackingRule}
                        />
                      }
                      onCornerBadgeClick={
                        isMerchantEditable
                          ? () => handleMerchantEditFocus("presentation", editorTarget)
                          : canForwardOfferToNeedo
                            ? () => forwardOfferToNeedo(offer, coverImage)
                            : undefined
                      }
                      titleBadge="NEW"
                      title={
                        <InlineEditableText
                          className="text-[20px] font-black leading-[1.24] tracking-[-0.03em]"
                          editing={offerEditorActive}
                          multiline
                          onChange={(value) => updateOfferField(index, "title", value)}
                          rows={2}
                          value={offer.title}
                        />
                      }
                    />
                    {renderActiveInlineEditor(editorTarget)}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "map" ? (
        <div className="space-y-4">
          <section>
            <SectionTitle caption="地址、交通和到店提示一屏看完" title="店铺信息" />
            <div className="mt-3 grid gap-3">
              <FlatCard className={cn("space-y-4", isMerchantEditable && "pr-14")} editor={isMerchantEditable ? renderMerchantEditor("basic", "编辑位置", undefined, "default", "map-location") : undefined}>
                <div className="relative h-40 overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#151717,#1d2422_54%,#0f1514)]">
                  <img alt={`${store.name} 地图预览`} className="absolute inset-0 h-full w-full scale-[1.035] object-cover opacity-30" src={getGeneratedImageThumbnailUrl(store.cover)} />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_srgb,var(--client-primary)_28%,transparent),transparent_42%),radial-gradient(circle_at_80%_78%,color-mix(in_srgb,var(--client-warm)_18%,transparent),transparent_36%)]" />
                  <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-1 text-[10px] font-black text-white">地图预览</div>
                </div>
                <StoreMapSectionHeading title="店铺基础信息" />
                <div className="grid gap-3">
                  <StoreMapInfoRow label="店名" value={store.name} />
                  <StoreMapInfoRow label="地址">
                    <InlineEditableText
                      className="block text-[13px] font-semibold leading-6 text-[color:var(--client-text)]"
                      editing={mapLocationEditing}
                      onChange={(value) => updateBasicStoreField("address", value)}
                      value={store.address}
                    />
                  </StoreMapInfoRow>
                  <StoreMapInfoRow label="交通手段">
                    <div className="space-y-1.5">
                      <InlineEditableText
                        className="block text-[13px] font-semibold leading-6 text-[color:var(--client-text)]"
                        editing={mapLocationEditing}
                        onChange={(value) => updatePresentationField("station", value)}
                        value={config.station}
                      />
                      <p className="text-[13px] font-semibold leading-6 text-[color:var(--client-muted)]">{config.distance}</p>
                      <InlineEditableText
                        className="block text-[13px] font-semibold leading-6 text-[color:var(--client-muted)]"
                        editing={mapLocationEditing}
                        multiline
                        onChange={(value) => updatePresentationField("access", value)}
                        rows={2}
                        value={config.access}
                      />
                    </div>
                  </StoreMapInfoRow>
                  <StoreMapInfoRow label="分类" value={mapDetailCopy.genre} />
                </div>
                <StoreMapTagList items={[config.distance, config.parking, store.openStatus === "open" ? "可预约" : "需确认时段"]} />
                {isMerchantEditable ? null : (
                  <div className="flex justify-center border-t border-[color:color-mix(in_srgb,var(--client-line)_50%,transparent)] pt-3">
                    <PrimaryButton className={storeBookingCtaButtonClassName} to={bookingHref}>
                      <AppIcon className="h-4 w-4" name="calendar" />
                      <span>立即预约</span>
                    </PrimaryButton>
                  </div>
                )}
              </FlatCard>
              {renderActiveInlineEditor("map-location")}

              <FlatCard
                className={cn("space-y-4", isMerchantEditable && "pr-14")}
                editor={isMerchantEditable ? renderMerchantEditor("presentation", "编辑说明", undefined, "default", "map-guide") : undefined}
              >
                <StoreMapSectionHeading title="店铺详细信息" />
                <div className="grid gap-3">
                  <StoreMapInfoRow label="预约・咨询" value="平台聊天咨询 / 立即预约" />
                  <StoreMapInfoRow label="预约可否">
                    <div className="space-y-1.5">
                      <p>{store.openStatus === "open" ? "可预约" : "需确认时段"}</p>
                      <p className="text-[13px] font-semibold leading-6 text-[color:var(--client-muted)]">{mapDetailCopy.bookingRule}</p>
                    </div>
                  </StoreMapInfoRow>
                  <StoreMapInfoRow label="营业时间">
                    {mapGuideEditing ? (
                      <BusinessHoursRangePicker onChange={(value) => updateBasicStoreField("businessHours", value)} value={store.businessHours} />
                    ) : (
                      store.businessHours
                    )}
                  </StoreMapInfoRow>
                  <StoreMapInfoRow label="预算" value={displayedBudgetLabel} />
                  <StoreMapInfoRow label="支付方式">
                    <InlineEditableText
                      className="block text-[13px] font-semibold leading-6 text-[color:var(--client-text)]"
                      editing={mapGuideEditing}
                      multiline
                      onChange={(value) => updatePresentationField("paymentMethods", textToList(value))}
                      rows={2}
                      value={config.paymentMethods.join(" / ")}
                    />
                  </StoreMapInfoRow>
                  <StoreMapInfoRow label="服务费・其他费用" value={mapDetailCopy.chargeNote} />
                </div>
              </FlatCard>

              <FlatCard className="space-y-4">
                <StoreMapSectionHeading title="席・设备" />
                <div className="grid gap-3">
                  <StoreMapInfoRow label="席数" value={mapDetailCopy.seatCount} />
                  <StoreMapInfoRow label="最大预约人数" value={mapDetailCopy.maxReservationPeople} />
                  <StoreMapInfoRow label="个室" value={mapDetailCopy.privateRoom} />
                  <StoreMapInfoRow label="包场" value={mapDetailCopy.buyout} />
                  <StoreMapInfoRow label="禁烟・吸烟" value={mapDetailCopy.smokingPolicy} />
                  <StoreMapInfoRow label="停车场" value={config.parking} />
                  <StoreMapInfoRow label="空间・设备">
                    <div className="space-y-1.5">
                      <p>{mapDetailCopy.seatInfo}</p>
                      {mapGuideEditing || config.equipment.length > 0 ? (
                        <InlineEditableText
                          className="block text-[13px] font-semibold leading-6 text-[color:var(--client-muted)]"
                          editing={mapGuideEditing}
                          multiline
                          onChange={(value) => updatePresentationField("equipment", textToList(value))}
                          rows={2}
                          value={config.equipment.join(" / ")}
                        />
                      ) : null}
                      <p className="text-[13px] font-semibold leading-6 text-[color:var(--client-muted)]">{mapDetailCopy.equipmentNote}</p>
                    </div>
                  </StoreMapInfoRow>
                </div>
              </FlatCard>

              <FlatCard className="space-y-4">
                <StoreMapSectionHeading title="菜单" />
                <div className="grid gap-3">
                  <StoreMapInfoRow label="套餐">
                    <div className="space-y-1.5">
                      <p>{mapDetailCopy.courseInfo}</p>
                      {menuCards.length > 0 ? (
                        <p className="text-[13px] font-semibold leading-6 text-[color:var(--client-muted)]">
                          {menuCards.map((item) => item.name).slice(0, 3).join(" / ")}
                        </p>
                      ) : null}
                    </div>
                  </StoreMapInfoRow>
                  <StoreMapInfoRow label="饮品" value={mapDetailCopy.drinkInfo} />
                  <StoreMapInfoRow label="服务内容" value={mapDetailCopy.menuInfo} />
                </div>
              </FlatCard>

              <FlatCard className="space-y-4">
                <StoreMapSectionHeading title="特点・相关信息" />
                <div className="grid gap-3">
                  <StoreMapInfoRow label="利用场景" value={mapDetailCopy.serviceSupport} />
                  <StoreMapInfoRow label="位置氛围" value={mapDetailCopy.locationInfo} />
                  <StoreMapInfoRow label="服务" value={mapDetailCopy.officialContact} />
                  <StoreMapInfoRow label="儿童同行" value={mapDetailCopy.childrenPolicy} />
                  <StoreMapInfoRow label="官方账号" value={mapDetailCopy.officialAccount} />
                  <StoreMapInfoRow label="电话咨询" value={mapDetailCopy.phoneContact} />
                  <StoreMapInfoRow label="到店提示">
                    <InlineEditableText
                      className="block text-[13px] font-semibold leading-6 text-[color:var(--client-text)]"
                      editing={mapGuideEditing}
                      multiline
                      onChange={(value) => updatePresentationField("routeGuide", value)}
                      rows={2}
                      value={config.routeGuide}
                    />
                  </StoreMapInfoRow>
                </div>
              </FlatCard>
              {renderActiveInlineEditor("map-guide")}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );

  const lightbox = lightboxIndex !== null ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/88 px-4 py-8 backdrop-blur-sm"
          role="dialog"
        >
          <button
            aria-label="关闭图片预览"
            className="focus-ring absolute right-4 top-[max(16px,env(safe-area-inset-top,0px)+8px)] inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
            onClick={() => setLightboxIndex(null)}
            type="button"
          >
            ✕
          </button>
          {images.length > 1 ? (
            <button
              aria-label="上一张"
              className="focus-ring absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white"
              onClick={() => setLightboxIndex((current) => (current === null ? current : (current - 1 + images.length) % images.length))}
              type="button"
            >
              ‹
            </button>
          ) : null}
          <img alt={`${store.name} 大图 ${lightboxIndex + 1}`} className="max-h-full max-w-full rounded-[24px] object-contain" src={images[lightboxIndex]} />
          {images.length > 1 ? (
            <button
              aria-label="下一张"
              className="focus-ring absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white"
              onClick={() => setLightboxIndex((current) => (current === null ? current : (current + 1) % images.length))}
              type="button"
            >
              ›
            </button>
          ) : null}
          <div className="absolute inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom,0px)+8px)] flex justify-center">
            <div className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-white">
              {lightboxIndex + 1} / {images.length}
            </div>
          </div>
        </div>
      ) : null;
  const fullscreenEditor = activeEditor ? (
    <StoreDisplayFullscreenEditor
      config={config}
      fallbackMenuCard={activeEditor.menuCard}
      images={images}
      industry={industry}
      menuCards={menuCards}
      mode={activeEditor.mode}
      onClose={() => setActiveEditor(null)}
      packageCardUi={packageCardUi}
      store={store}
      target={activeEditor.target}
      technicians={storeTechnicians}
    />
  ) : null;
  const storeImageEditor = pendingStoreImageEdit ? (
    <ImageAdjustmentEditor
      aspectRatio={pendingStoreImageEdit.aspectRatio}
      description={pendingStoreImageEdit.description}
      frameClassName={pendingStoreImageEdit.frameClassName}
      frameWidth={pendingStoreImageEdit.frameWidth}
      onApply={applyStoreImageEdit}
      onCancel={() => setPendingStoreImageEdit(null)}
      source={pendingStoreImageEdit.source}
      title={pendingStoreImageEdit.title}
    />
  ) : null;

  if (embedded) {
    const hasMerchantControls = Boolean(pricingControl || privacyControl);

    return (
      <div className="space-y-4 pb-6">
        <section className="relative z-50 space-y-3 overflow-visible">
          {renderMerchantEditor("basic", "编辑资料", "absolute right-0 top-0 z-30", "default", "basic-card")}
          <div className={cn("relative", hasMerchantControls && "min-h-[112px]")}>
            <div className="min-w-0 pr-12">
              <h2 className="text-[24px] font-black tracking-[-0.04em] text-[color:var(--client-text)]">{store.name}</h2>
              <p className="mt-1 text-sm text-[color:var(--client-muted)]">{store.address}</p>
            </div>
            {hasMerchantControls ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {pricingControl ? <div>{pricingControl}</div> : <div />}
                {privacyControl ? <div>{privacyControl}</div> : <div />}
              </div>
            ) : null}
          </div>
          <div className="-mx-1">{tabSwitcher}</div>
          {renderActiveInlineEditor("basic-card")}
        </section>
        <div className="relative z-0">{content}</div>
        {lightbox}
        {fullscreenEditor}
        {storeImageEditor}
      </div>
    );
  }

  return (
    <PageScaffold contentClassName="pb-40 pt-[calc(env(safe-area-inset-top,0px)+148px)] sm:pt-[calc(env(safe-area-inset-top,0px)+156px)]" navItems={[]}>
      <FloatingHomeHeader
        className="gap-0"
        frameClassName="z-40"
        maxWidth="1600px"
        panelClassName={cn(floatingHeaderGlassPanelClassName, "border-b-transparent bg-transparent text-[color:var(--client-text)] backdrop-blur-none")}
        showSpacer={false}
        spacerGapPx={0}
      >
        <div className={cn(floatingHeaderInnerClassName, "sm:px-4 lg:px-5")}>
          <div className="mx-auto w-full max-w-[1480px]">
            <div className="flex min-h-[54px] items-start gap-3">
              <button
                aria-label="返回"
                className={cn(floatingHeaderControlButtonClassName, "h-12 w-12 shrink-0")}
                onClick={() => navigate(-1)}
                type="button"
              >
                <AppIcon className="h-5 w-5" name="back" />
              </button>
              <div className="min-w-0 flex-1 pt-2">
                <h1 className="truncate text-[22px] font-black leading-none tracking-[-0.04em] text-[color:var(--client-text)]">{store.name}</h1>
                <p className="mt-2 truncate text-[12px] font-semibold leading-none text-[color:var(--client-muted)]">{store.address}</p>
              </div>
              <div className="flex h-[54px] shrink-0 items-start gap-2">
                <IconMetricAction
                  active={isFavorite}
                  count={favoriteCount}
                  icon="heart"
                  label={isFavorite ? "取消收藏" : "收藏店铺"}
                  onClick={() => setIsFavorite((current) => !current)}
                />
                <IconMetricAction
                  count={shareCount}
                  icon="share"
                  label="转发店铺"
                  onClick={() => {
                    void shareContent({
                      title: `${store.name} | NeeDo`,
                      text: `${store.name} · ${store.area}`,
                      url: `/stores/${store.id}`
                    }).then((result) => {
                      if (result.status !== "cancelled" && result.status !== "unsupported") {
                        setShareBoost((current) => current + 1);
                      }
                    });
                  }}
                />
              </div>
            </div>
            <div className="mt-2">{tabSwitcher}</div>
          </div>
        </div>
      </FloatingHomeHeader>

      <div className="space-y-3">{content}</div>

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-[calc(env(safe-area-inset-bottom,0px)+9.75rem)] bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,var(--client-bg)_46%,transparent)_30%,color-mix(in_srgb,var(--client-bg)_88%,transparent)_62%,var(--client-bg)_100%)]"
      />
      <div className="safe-nav-bottom fixed inset-x-0 bottom-0 z-40">
        <div className={storeBottomActionRowClassName}>
          <SecondaryButton className={storeBottomSecondaryButtonClassName} to="/messages">
            <AppIcon className="h-4 w-4" name="chat" />
            <span>聊天咨询</span>
          </SecondaryButton>
          <PrimaryButton className={storeBottomPrimaryButtonClassName} to={bookingHref}>
            <AppIcon className="h-4 w-4" name="calendar" />
            <span>{bookingCtaCopy(store.openStatus)}</span>
          </PrimaryButton>
        </div>
      </div>

      {lightbox}
      {fullscreenEditor}
      {storeImageEditor}
    </PageScaffold>
  );
}

function StoreDetailStatus({
  description,
  scope,
  title
}: {
  description: string;
  scope: "user" | "merchant";
  title: string;
}) {
  return (
    <PageScaffold contentClassName="space-y-5 pb-28" navItems={scope === "merchant" ? [] : undefined}>
      <AppTopBar subtitle="真实 API 数据源" title="店铺详情" />
      <EmptyStatePanel caption={description} title={title} />
    </PageScaffold>
  );
}

export function StoreDetailPage({ scope = "user" }: { scope?: "user" | "merchant" } = {}) {
  const { id } = useParams();
  const { stores } = useEntityStore();
  const apiId = coreReadIdFromRoute(id);
  const shopQuery = useCoreReadQuery(
    () => (apiId ? coreReadApi.getShopDetail(apiId) : null),
    [apiId]
  );
  const apiStore = useMemo(() => (shopQuery.data ? mapCoreShopToStore(shopQuery.data) : null), [shopQuery.data]);
  const apiTechnicians = useMemo(
    () => shopQuery.data?.technicians.map((technician) => mapCoreTechnicianToTechnician({
      ...technician,
      bio: null,
      serviceArea: shopQuery.data?.city ?? technician.city,
      yearsExperience: 0,
      mediaAssets: [],
      services: shopQuery.data?.services ?? [],
      createdAt: shopQuery.data?.createdAt ?? "",
      updatedAt: shopQuery.data?.updatedAt ?? ""
    })) ?? [],
    [shopQuery.data]
  );
  const legacyStore = stores.find((item) => item.id === id) ?? stores[0];
  const store = apiId ? apiStore : legacyStore;

  if (apiId && shopQuery.loading) {
    return <StoreDetailStatus description="正在从 /api/v1/shops 读取店铺资料。" scope={scope} title="正在载入店铺" />;
  }

  if (apiId && shopQuery.error) {
    return <StoreDetailStatus description={shopQuery.error} scope={scope} title="店铺读取失败" />;
  }

  if (!store) {
    return <StoreDetailStatus description="当前店铺暂时没有公开资料。" scope={scope} title="暂无店铺资料" />;
  }

  return <StoreDetailExperience scope={scope} store={store} techniciansOverride={apiId ? apiTechnicians : undefined} />;
}
