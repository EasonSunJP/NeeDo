import { filterShopMembers } from "./service";
import type {
  ShopMember,
  ShopMemberAnalyticsDimension,
  ShopMemberAnalyticsItem,
  ShopMemberAnalyticsResult,
  ShopMemberAnalyticsChartType,
  ShopMemberListFilters,
  ShopMemberSnapshot
} from "./types";

export const MEMBER_ANALYTICS_DIMENSIONS = [
  { key: "gender", label: "性别", icon: "gender", chartType: "pie" },
  { key: "age", label: "年龄", icon: "age", chartType: "bar" },
  { key: "card_status", label: "有无卡", icon: "card", chartType: "pie" },
  { key: "source", label: "来源", icon: "source", chartType: "pie" },
  { key: "consume_count", label: "消费次数", icon: "receipt", chartType: "bar" },
  { key: "recharge_count", label: "充值次数", icon: "recharge", chartType: "bar" },
  { key: "card_count", label: "会员卡数", icon: "cards", chartType: "bar" },
  { key: "total_spend", label: "累计消费", icon: "coins", chartType: "bar" }
] satisfies Array<{ key: ShopMemberAnalyticsDimension; label: string; icon: string; chartType: ShopMemberAnalyticsChartType }>;

const chartColors = ["#7c6df2", "#31b77d", "#f2b84b", "#ef6f61", "#52a7e8", "#d778d9", "#6aa89a", "#8a93a6"];

type MemberAnalyticsBucket = { key: string; label: string };

export const MEMBER_ANALYTICS_BUCKETS = {
  gender: [
    { key: "male", label: "男" },
    { key: "female", label: "女" },
    { key: "unknown", label: "不明" },
    { key: "other", label: "其他" }
  ],
  age: [
    { key: "under_20", label: "20岁以下" },
    { key: "20_25", label: "20~25" },
    { key: "25_30", label: "25~30" },
    { key: "30_35", label: "30~35" },
    { key: "35_40", label: "35~40" },
    { key: "40_45", label: "40~45" },
    { key: "45_50", label: "45~50" },
    { key: "50_55", label: "50~55" },
    { key: "55_60", label: "55~60" },
    { key: "60_plus", label: "60岁以上" },
    { key: "unknown", label: "不明" }
  ],
  card_status: [
    { key: "active", label: "持有有效卡" },
    { key: "frozen", label: "冻结卡" },
    { key: "expired", label: "仅有过期卡" },
    { key: "none", label: "无卡" }
  ],
  source: [
    { key: "walk_in", label: "上门客" },
    { key: "member_referral", label: "会员转介绍" },
    { key: "staff_referral", label: "员工转介绍" },
    { key: "line", label: "LINE" },
    { key: "store_acquisition", label: "门店拓客" },
    { key: "platform", label: "平台导入" },
    { key: "legacy_meiyi", label: "美矣" },
    { key: "other", label: "其他" },
    { key: "unknown", label: "未知" }
  ],
  consume_count: [
    { key: "0", label: "0 次" },
    { key: "1", label: "1 次" },
    { key: "2-3", label: "2-3 次" },
    { key: "4-5", label: "4-5 次" },
    { key: "6-10", label: "6-10 次" },
    { key: "10+", label: "10 次以上" }
  ],
  recharge_count: [
    { key: "0", label: "0 次" },
    { key: "1", label: "1 次" },
    { key: "2-3", label: "2-3 次" },
    { key: "4-5", label: "4-5 次" },
    { key: "5+", label: "5 次以上" }
  ],
  card_count: [
    { key: "0", label: "0 张" },
    { key: "1", label: "1 张" },
    { key: "2", label: "2 张" },
    { key: "3", label: "3 张" },
    { key: "4+", label: "4 张以上" }
  ],
  total_spend: [
    { key: "0", label: "0 JPY" },
    { key: "1-9999", label: "1-9,999 JPY" },
    { key: "10000-29999", label: "10,000-29,999 JPY" },
    { key: "30000-49999", label: "30,000-49,999 JPY" },
    { key: "50000-99999", label: "50,000-99,999 JPY" },
    { key: "100000+", label: "100,000 JPY+" }
  ]
} satisfies Record<ShopMemberAnalyticsDimension, MemberAnalyticsBucket[]>;

const sourceLabels: Record<ShopMember["source"], string> = {
  walk_in: "上门客",
  staff_referral: "员工转介绍",
  member_referral: "会员转介绍",
  store_acquisition: "门店拓客",
  platform: "平台导入",
  line: "LINE",
  legacy_meiyi: "美矣",
  other: "其他",
  unknown: "未知"
};

const genderLabels: Record<ShopMember["gender"], string> = {
  male: "男",
  female: "女",
  other: "其他",
  unknown: "不明"
};

function parseMemberAge(member: ShopMember) {
  if (!member.birthday) {
    return null;
  }

  const year = Number(member.birthday.slice(0, 4));

  if (!Number.isFinite(year)) {
    return null;
  }

  return Math.max(0, 2026 - year);
}

function bucketAge(member: ShopMember) {
  const age = parseMemberAge(member);

  if (age === null) {
    return { key: "unknown", label: "不明" };
  }

  if (age < 20) {
    return { key: "under_20", label: "20岁以下" };
  }

  if (age < 25) {
    return { key: "20_25", label: "20~25" };
  }

  if (age < 30) {
    return { key: "25_30", label: "25~30" };
  }

  if (age < 35) {
    return { key: "30_35", label: "30~35" };
  }

  if (age < 40) {
    return { key: "35_40", label: "35~40" };
  }

  if (age < 45) {
    return { key: "40_45", label: "40~45" };
  }

  if (age < 50) {
    return { key: "45_50", label: "45~50" };
  }

  if (age < 55) {
    return { key: "50_55", label: "50~55" };
  }

  if (age < 60) {
    return { key: "55_60", label: "55~60" };
  }

  return { key: "60_plus", label: "60岁以上" };
}

function bucketCount(value: number, kind: "consume" | "recharge" | "card") {
  if (kind === "recharge") {
    if (value === 0) return { key: "0", label: "0 次" };
    if (value === 1) return { key: "1", label: "1 次" };
    if (value <= 3) return { key: "2-3", label: "2-3 次" };
    if (value <= 5) return { key: "4-5", label: "4-5 次" };
    return { key: "5+", label: "5 次以上" };
  }

  if (kind === "card") {
    if (value === 0) return { key: "0", label: "0 张" };
    if (value === 1) return { key: "1", label: "1 张" };
    if (value === 2) return { key: "2", label: "2 张" };
    if (value === 3) return { key: "3", label: "3 张" };
    return { key: "4+", label: "4 张以上" };
  }

  if (value === 0) return { key: "0", label: "0 次" };
  if (value === 1) return { key: "1", label: "1 次" };
  if (value <= 3) return { key: "2-3", label: "2-3 次" };
  if (value <= 5) return { key: "4-5", label: "4-5 次" };
  if (value <= 10) return { key: "6-10", label: "6-10 次" };
  return { key: "10+", label: "10 次以上" };
}

function bucketSpend(value: number) {
  if (value <= 0) return { key: "0", label: "0 JPY" };
  if (value < 10000) return { key: "1-9999", label: "1-9,999 JPY" };
  if (value < 30000) return { key: "10000-29999", label: "10,000-29,999 JPY" };
  if (value < 50000) return { key: "30000-49999", label: "30,000-49,999 JPY" };
  if (value < 100000) return { key: "50000-99999", label: "50,000-99,999 JPY" };
  return { key: "100000+", label: "100,000 JPY+" };
}

export function getMemberAnalyticsGroup(snapshot: ShopMemberSnapshot, member: ShopMember, dimension: ShopMemberAnalyticsDimension) {
  const memberCards = snapshot.cards.filter((card) => card.memberId === member.id);

  switch (dimension) {
    case "gender":
      return { key: member.gender, label: genderLabels[member.gender] };
    case "age":
      return bucketAge(member);
    case "source":
      return { key: member.source, label: sourceLabels[member.source] };
    case "card_status": {
      if (memberCards.some((card) => card.status === "active")) {
        return { key: "active", label: "持有有效卡" };
      }

      if (memberCards.some((card) => card.status === "frozen")) {
        return { key: "frozen", label: "冻结卡" };
      }

      if (memberCards.some((card) => card.status === "expired")) {
        return { key: "expired", label: "仅有过期卡" };
      }

      return { key: "none", label: "无卡" };
    }
    case "consume_count":
      return bucketCount(member.totalOrders, "consume");
    case "recharge_count": {
      const rechargeCount = snapshot.ledgers.filter((ledger) => ledger.memberId === member.id && ledger.type === "TOP_UP").length;
      return bucketCount(rechargeCount, "recharge");
    }
    case "card_count":
      return bucketCount(memberCards.length, "card");
    case "total_spend":
      return bucketSpend(member.totalSpend);
  }
}

export function getShopMemberOverview(snapshot: ShopMemberSnapshot, shopId: string) {
  const members = snapshot.members.filter((member) => member.shopId === shopId && !member.deletedAt);
  const activeCards = snapshot.cards.filter((card) => card.shopId === shopId && card.status === "active");
  const today = "2026-05-06";
  const todayLedgers = snapshot.ledgers.filter((ledger) => ledger.shopId === shopId && ledger.createdAt.startsWith(today));
  const todayOpenIncome = todayLedgers.filter((ledger) => ledger.type === "OPEN_CARD").reduce((sum, ledger) => sum + Math.max(0, ledger.amountDelta), 0);
  const todayTopupIncome = todayLedgers.filter((ledger) => ledger.type === "TOP_UP").reduce((sum, ledger) => sum + Math.max(0, ledger.amountDelta), 0);
  const todayVerifyCount = todayLedgers.filter((ledger) => ledger.type === "CONSUME_TIMES" || ledger.type === "CONSUME_PRINCIPAL" || ledger.type === "CONSUME_BONUS").length;
  const expiringSoonCards = activeCards.filter((card) => card.expireAt >= today && card.expireAt <= "2026-05-13").length;
  const unpaidPrincipalBalance = activeCards.reduce((sum, card) => sum + card.principalBalance, 0);
  const unpaidBonusBalance = activeCards.reduce((sum, card) => sum + card.bonusBalance, 0);

  return {
    activeMemberCount: members.length,
    todayNewMemberCount: members.filter((member) => member.createdAt.startsWith(today)).length,
    todayVerifyCount,
    expiringSoonCards,
    todayOpenIncome,
    todayTopupIncome,
    unpaidPrincipalBalance,
    unpaidBonusBalance,
    cardUserCount: new Set(activeCards.map((card) => card.memberId)).size,
    refundRequestCount: snapshot.cards.filter((card) => card.shopId === shopId && card.status === "refunding").length
  };
}

export function getShopMemberAnalytics(
  snapshot: ShopMemberSnapshot,
  dimension: ShopMemberAnalyticsDimension,
  filters: ShopMemberListFilters = {}
): ShopMemberAnalyticsResult {
  const baseMembers = filterShopMembers(snapshot, filters);
  const groupKeys = filters.groupKeys ?? (filters.groupKey ? [filters.groupKey] : undefined);
  const groupKeySet = groupKeys ? new Set(groupKeys) : null;
  const members = groupKeySet
    ? baseMembers.filter((member) => groupKeySet.has(getMemberAnalyticsGroup(snapshot, member, dimension).key))
    : baseMembers;
  const totalSpend = members.reduce((sum, member) => sum + member.totalSpend, 0);
  const paidOrderCount = members.reduce((sum, member) => sum + member.totalOrders, 0);
  const activeCardMemberIds = new Set(snapshot.cards.filter((card) => card.status === "active").map((card) => card.memberId));
  const bucketConfig = MEMBER_ANALYTICS_BUCKETS[dimension];
  const grouped = new Map<string, { label: string; value: number }>(bucketConfig.map((item) => [item.key, { label: item.label, value: 0 }]));

  members.forEach((member) => {
    const group = getMemberAnalyticsGroup(snapshot, member, dimension);
    const current = grouped.get(group.key) ?? { label: group.label, value: 0 };
    current.value += 1;
    grouped.set(group.key, current);
  });

  const total = Array.from(grouped.values()).reduce((sum, item) => sum + item.value, 0);
  const items: ShopMemberAnalyticsItem[] = Array.from(grouped.entries())
    .map(([key, item], index) => ({
      key,
      label: item.label,
      value: item.value,
      percentage: total > 0 ? Number(((item.value / total) * 100).toFixed(1)) : 0,
      color: chartColors[index % chartColors.length] ?? chartColors[0]!
    }));
  const dimensionConfig = MEMBER_ANALYTICS_DIMENSIONS.find((item) => item.key === dimension);

  return {
    summary: {
      memberCount: members.length,
      avgTicket: paidOrderCount > 0 ? Math.round(totalSpend / paidOrderCount) : 0,
      totalSpend,
      paidOrderCount,
      cardUserCount: members.filter((member) => activeCardMemberIds.has(member.id)).length
    },
    dimension,
    chartType: dimensionConfig?.chartType ?? "pie",
    total,
    items
  };
}
