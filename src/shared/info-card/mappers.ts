import type { DetailProfile } from "../../types/detailProfile";
import type { Customer, ServicePaymentMethod, Store, Technician } from "../../types/domain";
import { getProfileDetailPath } from "../profile-detail/paths";
import { formatCustomerMembershipLevel, getCustomerLevelLabel, resolveCustomerMembership } from "../profile-card/customerMembership";
import { formatCustomerCreditScore, formatCustomerGenderLabel } from "../profile-card/customerProfileLabels";
import { getStoreCardDecorationConfig } from "../../lib/storeUiDecoration";
import type { InfoCardData, InfoCardEntitySource, ShopInfoCardData, TechnicianInfoCardData, UserInfoCardData } from "./types";
import {
  buildInfoCardBadge,
  formatInfoCardRating,
  formatStorePriceSummary,
  formatStoreStatus,
  formatTechnicianPriceLabel,
  formatTechnicianStatus
} from "./utils";

const paymentMethodLabels: Record<ServicePaymentMethod, string> = {
  platform: "平台支付",
  offline: "线下支付",
  prepay: "需预付",
  cash: "现金支付",
  paypay: "PayPay",
  paypal: "PayPal",
  wechatpay: "WeChat Pay",
  alipay: "Alipay"
};

function mapPaymentMethods(paymentMethods?: ServicePaymentMethod[]) {
  return paymentMethods?.map((item) => paymentMethodLabels[item]) ?? [];
}

export function buildShopInfoCardData(store: Store, technicians: Technician[] = []): ShopInfoCardData {
  const storeStatus = formatStoreStatus(store.openStatus);
  const assignedTechnicians = technicians.filter((item) => item.storeId === store.id);
  const cardUi = getStoreCardDecorationConfig(store, "store");

  return {
    id: store.id,
    entityType: "shop",
    coverImage: store.cover,
    avatar: store.cover,
    displayName: store.name,
    subtitle: store.rankLabel || "附近可预约门店",
    region: store.area,
    serviceArea: store.address,
    status: storeStatus.label,
    isBookable: store.openStatus !== "closed",
    rating: store.rating,
    ratingType: "店铺评分",
    reviewCount: store.reviewCount,
    tags: store.tags,
    priceLabel: store.priceLabel,
    badgeList: [
      buildInfoCardBadge("店铺"),
      buildInfoCardBadge(storeStatus.label, storeStatus.tone)
    ],
    description: store.description,
    metaLines: [
      `${store.area} · ${store.priceLabel}`,
      store.businessHours ? `营业时间：${store.businessHours}` : ""
    ].filter(Boolean),
    nextAvailability: store.nextSlot,
    metricList: [
      { label: "服务评价", tone: "accent", value: formatInfoCardRating(store.rating, store.reviewCount).replace("★ ", "") },
      { label: "区域", tone: "neutral", value: store.area },
      { label: "价格", tone: "warning", value: store.priceLabel }
    ],
    highlightChips: [store.nextSlot, ...store.tags].filter(Boolean).slice(0, 4),
    detailPath: getProfileDetailPath("shop", store.id),
    cardUi,
    shopCategory: store.rankLabel,
    businessHours: store.businessHours,
    averagePrice: formatStorePriceSummary(store.priceLabel),
    intro: store.description,
    technicianCount: assignedTechnicians.length || undefined,
    serviceCategories: store.tags.slice(0, 3),
    addressSummary: store.address,
    reservable: store.openStatus !== "closed"
  };
}

export function buildUserInfoCardData(customer: Customer): UserInfoCardData {
  const creditScore = Number((customer.activeScore / 20).toFixed(1));
  const creditScoreText = formatCustomerCreditScore(customer);
  const levelLabel = getCustomerLevelLabel(customer.activeScore);
  const membership = resolveCustomerMembership(customer.memberLevel);
  const membershipBadge = membership.kind ? buildInfoCardBadge(membership.label, "neutral") : null;

  return {
    id: customer.id,
    entityType: "user",
    coverImage: customer.avatar,
    avatar: customer.avatar,
    displayName: customer.nickname || customer.name,
    subtitle: formatCustomerMembershipLevel(customer.memberLevel, levelLabel),
    region: `ID ${customer.systemId}`,
    serviceArea: customer.languages?.join(" / "),
    status: `信用度 ${creditScoreText}`,
    rating: creditScore,
    ratingType: "信用度",
    reviewCount: customer.orderCount,
    tags: customer.tags,
    badgeList: [
      ...(membershipBadge ? [membershipBadge] : []),
      buildInfoCardBadge(levelLabel, "neutral")
    ],
    description: customer.bio,
    metaLines: [
      `信用度 ${formatCustomerCreditScore(customer, { withMax: true })}`,
      customer.languages?.length ? `语言：${customer.languages.join(" / ")}` : "",
      customer.lastOrderAt ? `最近活跃：${customer.lastOrderAt}` : ""
    ].filter(Boolean),
    metricList: [
      { label: "信用度", tone: "accent", value: creditScoreText },
      { label: "订单", tone: "neutral", value: `${customer.orderCount}` },
      { label: "等级", tone: "warning", value: levelLabel }
    ],
    highlightChips: customer.tags.slice(0, 4),
    detailPath: getProfileDetailPath("user", customer.id),
    gender: formatCustomerGenderLabel(customer.gender),
    intro: customer.bio,
    contactActions: ["聊天", "关注"]
  };
}

export function buildTechnicianInfoCardData(technician: Technician): TechnicianInfoCardData {
  const status = formatTechnicianStatus(technician.status);
  const paymentMethods = mapPaymentMethods(technician.paymentMethods);
  const tagPool = technician.profileTags?.length ? technician.profileTags : technician.skills;
  const priceLabel = formatTechnicianPriceLabel(technician.bidBudgetMin, technician.bidBudgetMax);

  return {
    id: technician.id,
    entityType: "technician",
    coverImage: technician.avatar,
    avatar: technician.avatar,
    displayName: technician.nickname || technician.name,
    subtitle: technician.identityLabel || "个人技师",
    region: technician.serviceAreas[0] || "东京",
    serviceArea: technician.serviceAreas.join("、"),
    status: status.label,
    isBookable: technician.status !== "off",
    isOnline: technician.status === "available",
    rating: technician.rating,
    ratingType: "服务评分",
    reviewCount: technician.reviewCount,
    tags: tagPool,
    priceLabel: priceLabel || undefined,
    badgeList: [
      buildInfoCardBadge("技师"),
      buildInfoCardBadge(status.label, status.tone)
    ],
    description: technician.bio,
    metaLines: [
      tagPool.slice(0, 3).join(" / "),
      technician.serviceAreas.join("、"),
      `接单率 ${technician.acceptRate}% · 取消率 ${technician.cancelRate}%`
    ].filter(Boolean),
    nextAvailability: status.nextAvailability,
    metricList: [
      { label: "服务评价", tone: "accent", value: typeof technician.rating === "number" ? technician.rating.toFixed(1) : "待完善" },
      { label: "接单率", tone: "success", value: `${technician.acceptRate}%` },
      { label: "价格", tone: "warning", value: priceLabel || "待沟通" }
    ],
    highlightChips: [
      technician.canServeForeigners ? "可接待外国人" : "",
      ...technician.languages.slice(0, 2),
      ...tagPool.slice(0, 2)
    ].filter(Boolean),
    detailPath: getProfileDetailPath("technician", technician.id),
    age: technician.age,
    serviceTypes: technician.skills,
    languages: technician.languages,
    supportForeigner: technician.canServeForeigners,
    paymentMethods,
    prepayRequired: technician.paymentMethods?.includes("prepay"),
    intro: technician.bio,
    schedulePreview: [status.nextAvailability || "预约时间待确认"],
    workStyleTags: technician.profileTags,
    acceptanceRate: technician.acceptRate,
    cancelRate: technician.cancelRate
  };
}

export function buildInfoCardDataFromDetail(detail: DetailProfile): InfoCardData {
  if (detail.roleType === "shop") {
    const openBadgeTone = detail.openStatusLabel === "营业中" ? "success" : "warning";

    return {
      id: detail.id,
      entityType: "shop",
      coverImage: detail.galleryImages[0]?.src,
      avatar: detail.galleryImages[0]?.src,
      displayName: detail.displayName,
      subtitle: detail.subtitle,
      region: detail.mapInfo.nearestStation || detail.mapInfo.address,
      serviceArea: detail.mapInfo.address,
      status: detail.openStatusLabel,
      isBookable: detail.openStatusLabel !== "暂未营业",
      rating: detail.score,
      ratingType: "店铺评分",
      reviewCount: detail.reviewCount,
      tags: detail.tags,
      priceLabel: detail.priceSummary,
      badgeList: [
        buildInfoCardBadge(detail.openStatusLabel, openBadgeTone),
        ...detail.categories.slice(0, 2).map((item) => buildInfoCardBadge(item))
      ],
      description: detail.introBlocks[0]?.content,
      metaLines: [
        detail.priceSummary,
        detail.mapInfo.nearestStation || detail.mapInfo.address
      ].filter(Boolean),
      nextAvailability: detail.coreInfoItems[0]?.caption || detail.coreInfoItems[0]?.value,
      metricList: [
        { label: detail.scoreLabel, tone: "accent", value: typeof detail.score === "number" ? detail.score.toFixed(1) : "暂无评分" },
        { label: "评价", tone: "neutral", value: detail.reviewLabel },
        { label: "价格", tone: "warning", value: detail.priceSummary }
      ],
      highlightChips: [...detail.summaryBadges.map((item) => item.label), ...detail.categories].slice(0, 5),
      detailPath: getProfileDetailPath("shop", detail.id),
      shopCategory: detail.categories[0],
      businessHours: detail.businessHours.map((item) => `${item.label} ${item.open}-${item.close}`).join(" / "),
      averagePrice: detail.priceSummary,
      intro: detail.introBlocks[0]?.content,
      technicianCount: detail.teamMembers.length || undefined,
      serviceCategories: detail.categories,
      addressSummary: detail.mapInfo.address
    };
  }

  if (detail.roleType === "user") {
    return {
      id: detail.id,
      entityType: "user",
      coverImage: detail.galleryImages[0]?.src,
      avatar: detail.avatar || detail.galleryImages[0]?.src,
      displayName: detail.displayName,
      subtitle: detail.subtitle,
      region: detail.locationLabel,
      serviceArea: detail.capabilityRows.find((item) => item.label.includes("语言"))?.value,
      status: detail.statusBadges[0]?.label,
      rating: detail.score,
      ratingType: "信用度",
      reviewCount: detail.reviewCount,
      tags: detail.tags,
      badgeList: detail.statusBadges.slice(0, 2).map((item) =>
        buildInfoCardBadge(item.label, item.tone === "success" ? "success" : item.tone === "warning" ? "warning" : "neutral")
      ),
      description: detail.introBlocks[0]?.content,
      metaLines: [
        detail.locationLabel,
        detail.basicInfoRows.slice(0, 2).map((item) => `${item.label}：${item.value}`).join(" · ")
      ].filter(Boolean),
      metricList: [
        { label: detail.scoreLabel, tone: "accent", value: typeof detail.score === "number" ? detail.score.toFixed(1) : "暂无评分" },
        { label: "评价", tone: "neutral", value: detail.reviewLabel },
        { label: "状态", tone: "warning", value: detail.statusBadges[0]?.label || "待更新" }
      ],
      highlightChips: [...detail.summaryBadges.map((item) => item.label), ...detail.tags].slice(0, 5),
      detailPath: getProfileDetailPath("user", detail.id),
      intro: detail.introBlocks[0]?.content,
      contactActions: ["聊天", "联系"]
    };
  }

  return {
    id: detail.id,
    entityType: "technician",
    coverImage: detail.galleryImages[0]?.src,
    avatar: detail.avatar || detail.galleryImages[0]?.src,
    displayName: detail.displayName,
    subtitle: detail.subtitle,
    region: detail.locationLabel,
    serviceArea: detail.locationLabel,
    status: detail.statusBadges[0]?.label,
    isBookable: detail.statusBadges.some((item) => item.label.includes("可预约")),
    isOnline: detail.statusBadges.some((item) => item.label.includes("在线")),
    rating: detail.score,
    ratingType: "服务评分",
    reviewCount: detail.reviewCount,
    tags: detail.tags,
    priceLabel: detail.basicInfoRows.find((item) => item.label.includes("价格") || item.label.includes("预算"))?.value,
    badgeList: detail.statusBadges.slice(0, 3).map((item) => buildInfoCardBadge(item.label, item.tone === "success" ? "success" : item.tone === "warning" ? "warning" : "neutral")),
    description: detail.introBlocks[0]?.content,
    metaLines: [
      detail.locationLabel,
      detail.capabilityRows.slice(0, 2).map((item) => `${item.label}：${item.value}`).join(" · ")
    ].filter(Boolean),
    nextAvailability: detail.availabilityPreview.items[0]?.statusLabel,
    metricList: [
      { label: detail.scoreLabel, tone: "accent", value: typeof detail.score === "number" ? detail.score.toFixed(1) : "暂无评分" },
      { label: "评价", tone: "neutral", value: detail.reviewLabel },
      { label: "状态", tone: "success", value: detail.statusBadges[0]?.label || "待更新" }
    ],
    highlightChips: [...detail.summaryBadges.map((item) => item.label), ...detail.quickBadges.map((item) => item.label)].slice(0, 5),
    detailPath: getProfileDetailPath("technician", detail.id),
    intro: detail.introBlocks[0]?.content
  };
}

export function buildInfoCardData(source: InfoCardEntitySource): InfoCardData {
  if ("store" in source) {
    return buildShopInfoCardData(source.store, source.technicians);
  }

  if ("customer" in source) {
    return buildUserInfoCardData(source.customer);
  }

  if ("technician" in source) {
    return buildTechnicianInfoCardData(source.technician);
  }

  return buildInfoCardDataFromDetail(source.detail);
}
