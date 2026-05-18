import { customers, orders } from "../../data/mock";
import type {
  ShopMember,
  ShopMemberActivity,
  ShopMemberCard,
  ShopMemberCardLedger,
  ShopMemberCardTemplate,
  ShopMemberCoupon,
  ShopMemberLevel,
  ShopMemberReminder,
  ShopMemberSnapshot
} from "./types";

const demoShopId = "store-1";
const demoOperatorId = "merchant-admin";
const seedNow = "2026-05-06 10:20";

function hashPhone(phone: string) {
  let hash = 0;

  for (const char of phone.replace(/\D/g, "")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return `ph_${hash.toString(16).padStart(8, "0")}`;
}

function memberSource(index: number): ShopMember["source"] {
  const sources: ShopMember["source"][] = [
    "walk_in",
    "member_referral",
    "staff_referral",
    "line",
    "store_acquisition",
    "platform",
    "legacy_meiyi",
    "other"
  ];

  return sources[index % sources.length] ?? "unknown";
}

function memberLanguage(index: number): ShopMember["language"] {
  const languages: ShopMember["language"][] = ["ja", "zh", "en", "ko"];
  return languages[index % languages.length] ?? "other";
}

export function createDefaultShopMemberSnapshot(shopId = demoShopId): ShopMemberSnapshot {
  const levels: ShopMemberLevel[] = [
    {
      id: "level-silver",
      shopId,
      name: "银卡会员",
      rank: 1,
      upgradeRuleType: "total_spend",
      upgradeThreshold: 50000,
      benefits: ["生日提醒", "普通优惠券"],
      status: "active",
      createdAt: "2026-04-01 09:00",
      updatedAt: seedNow
    },
    {
      id: "level-gold",
      shopId,
      name: "金卡会员",
      rank: 2,
      upgradeRuleType: "total_spend",
      upgradeThreshold: 150000,
      benefits: ["优先预约", "储值赠送", "复购提醒"],
      status: "active",
      createdAt: "2026-04-01 09:00",
      updatedAt: seedNow
    },
    {
      id: "level-black",
      shopId,
      name: "黑卡会员",
      rank: 3,
      upgradeRuleType: "manual",
      upgradeThreshold: 0,
      benefits: ["店长专属跟进", "生日权益", "高价值客群"],
      status: "active",
      createdAt: "2026-04-01 09:00",
      updatedAt: seedNow
    }
  ];

  const templates: ShopMemberCardTemplate[] = [
    {
      id: "tpl-value-30000",
      shopId,
      name: "安心储值 30,000",
      note: "适合高频复购客户，本金和赠送额分账记录。",
      cardType: "stored_value",
      price: 30000,
      principalAmount: 30000,
      bonusAmount: 5000,
      totalTimes: 0,
      serviceScope: ["全店服务", "到店护理"],
      validDays: 365,
      refundRule: { refundablePrincipalOnly: true, feeRate: 0 },
      consumeRule: { order: "bonus_first" },
      transferable: false,
      stackableWithCoupon: true,
      crossShopEnabled: false,
      status: "active",
      issuedCount: 26,
      createdBy: demoOperatorId,
      createdAt: "2026-04-01 09:00",
      updatedAt: seedNow
    },
    {
      id: "tpl-times-10",
      shopId,
      name: "90 分钟理疗 10 次卡",
      note: "适合固定项目复购，按次核销并保留本金退款口径。",
      cardType: "times",
      price: 98000,
      principalAmount: 98000,
      bonusAmount: 0,
      totalTimes: 10,
      serviceScope: ["90 分钟理疗", "肩颈舒缓"],
      validDays: 180,
      refundRule: { refundablePrincipalOnly: true, feeRate: 0.08 },
      consumeRule: { order: "manual", unitAmount: 9800 },
      transferable: false,
      stackableWithCoupon: false,
      crossShopEnabled: false,
      status: "active",
      issuedCount: 18,
      createdBy: demoOperatorId,
      createdAt: "2026-04-01 09:00",
      updatedAt: seedNow
    },
    {
      id: "tpl-trial-first",
      shopId,
      name: "新客体验权益卡",
      note: "面向首访客户，开卡后按一次体验权益核销。",
      cardType: "trial",
      price: 0,
      principalAmount: 0,
      bonusAmount: 0,
      totalTimes: 1,
      serviceScope: ["新客体验", "指定员工"],
      validDays: 30,
      refundRule: { refundablePrincipalOnly: true, feeRate: 0 },
      consumeRule: { order: "manual" },
      transferable: false,
      stackableWithCoupon: false,
      crossShopEnabled: false,
      status: "active",
      issuedCount: 9,
      createdBy: demoOperatorId,
      createdAt: "2026-04-08 09:30",
      updatedAt: seedNow
    },
    {
      id: "tpl-vip-discount",
      shopId,
      name: "VIP 折扣权益卡",
      note: "保留生日礼遇和全店折扣权益，不参与次卡扣减。",
      cardType: "discount",
      price: 12000,
      principalAmount: 12000,
      bonusAmount: 0,
      totalTimes: 0,
      serviceScope: ["全店服务 92 折", "生日礼遇"],
      validDays: 365,
      refundRule: { refundablePrincipalOnly: true, feeRate: 0 },
      consumeRule: { order: "manual" },
      transferable: false,
      stackableWithCoupon: true,
      crossShopEnabled: false,
      status: "active",
      issuedCount: 14,
      createdBy: demoOperatorId,
      createdAt: "2026-04-10 11:00",
      updatedAt: seedNow
    }
  ];

  const members: ShopMember[] = customers.slice(0, 22).map((customer, index) => {
    const source = memberSource(index);
    const birthdayMonth = String(1 + (index % 12)).padStart(2, "0");
    const birthdayDay = String(1 + (index % 27)).padStart(2, "0");
    const levelId = index % 7 === 0 ? "level-black" : index % 3 === 0 ? "level-gold" : "level-silver";
    const riskStatus = customer.churnRisk === "high" ? "watch" : "normal";

    return {
      id: `member-${customer.id}`,
      shopId,
      needoUserId: customer.id,
      name: customer.name,
      nickname: customer.nickname,
      avatarUrl: customer.avatar,
      phoneEncrypted: customer.phone,
      phoneHash: hashPhone(customer.phone),
      lineId: index % 4 === 0 ? `line-${customer.id}` : undefined,
      email: index % 5 === 0 ? `${customer.id}@example.test` : undefined,
      birthday: `199${index % 9}-${birthdayMonth}-${birthdayDay}`,
      gender: customer.gender === "private" ? "unknown" : customer.gender ?? "unknown",
      language: memberLanguage(index),
      source,
      levelId,
      tags: Array.from(new Set([...customer.tags.slice(0, 3), index % 5 === 0 ? "沉默" : index % 2 === 0 ? "高价值" : "复购"])),
      notePrivate: index % 4 === 0 ? "偏好提前 LINE 确认时间，避免临时改期。" : undefined,
      riskStatus,
      firstVisitAt: `2026-03-${String(1 + (index % 25)).padStart(2, "0")} 12:00`,
      lastVisitAt: customer.lastOrderAt,
      totalOrders: customer.orderCount,
      totalSpend: customer.ltv,
      createdBy: demoOperatorId,
      createdAt: index < 3 ? `2026-05-06 0${9 + index}:10` : `2026-04-${String(1 + (index % 26)).padStart(2, "0")} 13:20`,
      updatedAt: seedNow
    };
  });

  const cards: ShopMemberCard[] = members.slice(0, 14).map((member, index) => {
    const template = templates[index % templates.length]!;
    const isTimesCard = template.cardType === "times" || template.cardType === "trial";
    const issuedDay = String(1 + (index % 24)).padStart(2, "0");
    const expireDay = String(8 + (index % 18)).padStart(2, "0");
    const status: ShopMemberCard["status"] = index === 5 ? "frozen" : index === 8 ? "expired" : index === 11 ? "refunding" : "active";
    const consumedAmount = template.cardType === "stored_value" ? (index % 4) * 1800 : 0;
    const usedTimes = isTimesCard ? index % 4 : 0;

    return {
      id: `card-${index + 1}`,
      shopId,
      memberId: member.id,
      templateId: template.id,
      cardNo: `MC-${String(index + 1).padStart(5, "0")}`,
      qrTokenHash: `qr_${member.phoneHash}_${index}`,
      cardType: template.cardType,
      status,
      principalBalance: Math.max(0, template.principalAmount - consumedAmount),
      bonusBalance: Math.max(0, template.bonusAmount - Math.min(consumedAmount, template.bonusAmount)),
      remainingTimes: Math.max(0, template.totalTimes - usedTimes),
      startAt: `2026-04-${issuedDay} 11:00`,
      expireAt: index % 3 === 0 ? `2026-05-${expireDay} 23:59` : `2026-10-${expireDay} 23:59`,
      issuedBy: demoOperatorId,
      issuedAt: `2026-04-${issuedDay} 11:00`,
      lastUsedAt: index % 2 === 0 ? `2026-05-0${1 + (index % 5)} 16:30` : undefined,
      metadata: {
        ...(template.cardType === "discount" ? { discountRate: 0.92 } : {}),
        issuedMemberName: member.name,
        issuedMemberPhoneHash: member.phoneHash,
        issuedNeedoUserId: member.needoUserId,
        relationshipIndependent: true
      },
      createdAt: `2026-04-${issuedDay} 11:00`,
      updatedAt: seedNow
    };
  });

  templates.forEach((template) => {
    template.issuedCount = cards.filter((card) => card.templateId === template.id).length;
  });

  const ledgers: ShopMemberCardLedger[] = cards.flatMap((card, index) => {
    const openLedger: ShopMemberCardLedger = {
      id: `ledger-open-${card.id}`,
      shopId,
      memberId: card.memberId,
      cardId: card.id,
      templateId: card.templateId,
      type: "OPEN_CARD",
      amountDelta: card.principalBalance,
      timesDelta: card.remainingTimes,
      principalBefore: 0,
      principalAfter: card.principalBalance,
      bonusBefore: 0,
      bonusAfter: 0,
      timesBefore: 0,
      timesAfter: card.remainingTimes,
      paymentMethod: card.cardType === "trial" ? "none" : index % 2 === 0 ? "card" : "offline_pos",
      paymentRef: card.cardType === "trial" ? undefined : `POS-${card.cardNo}`,
      operatorId: card.issuedBy,
      reason: "开卡",
      createdAt: card.issuedAt
    };

    const bonusLedger: ShopMemberCardLedger | null = card.bonusBalance > 0 ? {
      id: `ledger-bonus-${card.id}`,
      shopId,
      memberId: card.memberId,
      cardId: card.id,
      templateId: card.templateId,
      relatedLedgerId: openLedger.id,
      type: "BONUS_GRANT",
      amountDelta: card.bonusBalance,
      timesDelta: 0,
      principalBefore: card.principalBalance,
      principalAfter: card.principalBalance,
      bonusBefore: 0,
      bonusAfter: card.bonusBalance,
      timesBefore: card.remainingTimes,
      timesAfter: card.remainingTimes,
      paymentMethod: "none",
      operatorId: card.issuedBy,
      reason: "开卡赠送",
      createdAt: card.issuedAt
    } : null;

    return bonusLedger ? [openLedger, bonusLedger] : [openLedger];
  });

  const coupons: ShopMemberCoupon[] = members.slice(0, 8).map((member, index) => ({
    id: `coupon-${index + 1}`,
    shopId,
    memberId: member.id,
    batchId: "batch-may-birthday",
    name: index % 2 === 0 ? "生日 1,000 円券" : "沉默客唤醒券",
    couponType: "fixed_amount",
    amount: index % 2 === 0 ? 1000 : 1500,
    minSpend: 8000,
    serviceScope: ["全店服务"],
    startAt: "2026-05-01 00:00",
    expireAt: "2026-05-31 23:59",
    status: index === 3 ? "used" : "unused",
    usedOrderId: index === 3 ? orders[0]?.id : undefined,
    createdAt: "2026-05-01 09:00",
    updatedAt: seedNow
  }));

  const reminders: ShopMemberReminder[] = [
    {
      id: "reminder-expire",
      shopId,
      title: "3 张会员卡将在 7 天内到期",
      detail: "建议先通知高价值会员，并确认是否需要续卡或保留本金。",
      actionLabel: "查看到期卡",
      severity: "warning",
      count: 3
    },
    {
      id: "reminder-silent",
      shopId,
      title: "12 位老客 30 天未复购",
      detail: "可按标签筛选沉默客，一键发送唤醒券。",
      actionLabel: "筛选老客",
      severity: "info",
      count: 12
    },
    {
      id: "reminder-refund",
      shopId,
      title: "2 笔退款申请待店长确认",
      detail: "退款审批属于敏感操作，确认后会写入操作日志。",
      actionLabel: "处理退款",
      severity: "danger",
      count: 2
    }
  ];

  const activities: ShopMemberActivity[] = [
    {
      id: "activity-open",
      shopId,
      memberId: members[0]?.id ?? "member-cus-1",
      title: `${members[0]?.name ?? "会员"} 开通 10 次卡`,
      detail: "90 分钟理疗 10 次卡，实收 98,000 円。",
      at: "2026-05-06 09:42",
      tone: "green"
    },
    {
      id: "activity-verify",
      shopId,
      memberId: members[1]?.id ?? "member-cus-2",
      title: `${members[1]?.name ?? "会员"} 核销 1 次服务`,
      detail: "已扣除次卡 1 次，剩余 4 次。",
      at: "2026-05-06 10:12",
      tone: "blue"
    },
    {
      id: "activity-topup",
      shopId,
      memberId: members[2]?.id ?? "member-cus-3",
      title: `${members[2]?.name ?? "会员"} 充值储值卡`,
      detail: "充值 30,000 円，赠送 5,000 円。",
      at: "2026-05-06 10:20",
      tone: "yellow"
    }
  ];

  return {
    members,
    levels,
    templates,
    cards,
    ledgers,
    coupons,
    operationLogs: [],
    reminders,
    activities,
    revision: 1
  };
}
