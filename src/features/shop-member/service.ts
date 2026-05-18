import { assertShopMemberPermission } from "./permissions";
import { createDefaultShopMemberSnapshot } from "./seed";
import type {
  ShopMember,
  ShopMemberCard,
  ShopMemberCardLedger,
  ShopMemberCardTemplate,
  ShopMemberConsumeOrder,
  ShopMemberListFilters,
  ShopMemberOperationLog,
  ShopMemberPaymentMethod,
  ShopMemberRole,
  ShopMemberSnapshot,
  ShopMemberSource
} from "./types";

type WriteResult = {
  snapshot: ShopMemberSnapshot;
  ledgers: ShopMemberCardLedger[];
};

type CreateMemberInput = {
  shopId: string;
  name: string;
  phone: string;
  operatorId: string;
  role?: ShopMemberRole;
  source?: ShopMemberSource;
  tags?: string[];
  notePrivate?: string;
  now?: string;
};

type IssueCardInput = {
  memberId: string;
  templateId: string;
  operatorId: string;
  role?: ShopMemberRole;
  paymentMethod: ShopMemberPaymentMethod;
  paymentRef?: string;
  now?: string;
};

type UpdateCardTemplateInput = {
  templateId: string;
  operatorId: string;
  role?: ShopMemberRole;
  name: string;
  note?: string;
  principalAmount: number;
  bonusAmount: number;
  now?: string;
};

type TopupCardInput = {
  cardId: string;
  principalAmount: number;
  bonusAmount?: number;
  operatorId: string;
  role?: ShopMemberRole;
  paymentMethod: ShopMemberPaymentMethod;
  paymentRef?: string;
  reason?: string;
  now?: string;
};

type ConsumeCardInput = {
  cardId: string;
  amount?: number;
  times?: number;
  operatorId: string;
  role?: ShopMemberRole;
  orderId?: string;
  reason?: string;
  paymentRef?: string;
  consumeOrder?: ShopMemberConsumeOrder;
  idempotencyKey?: string;
  now?: string;
};

type CardStatusInput = {
  cardId: string;
  operatorId: string;
  role?: ShopMemberRole;
  reason: string;
  now?: string;
};

type RefundInput = {
  cardId: string;
  amount: number;
  operatorId: string;
  role?: ShopMemberRole;
  approvedBy?: string;
  reason: string;
  now?: string;
};

const defaultRole: ShopMemberRole = "manager";

function cloneSnapshot(snapshot: ShopMemberSnapshot) {
  return JSON.parse(JSON.stringify(snapshot)) as ShopMemberSnapshot;
}

function nowLabel() {
  return new Date().toISOString().replace("T", " ").slice(0, 16);
}

function addDays(dateLabel: string, days: number) {
  const date = new Date(dateLabel.replace(" ", "T"));
  date.setDate(date.getDate() + days);

  return date.toISOString().replace("T", " ").slice(0, 16);
}

function createId(prefix: string, count: number) {
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
}

function hashPhone(phone: string) {
  let hash = 0;

  for (const char of phone.replace(/\D/g, "")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return `ph_${hash.toString(16).padStart(8, "0")}`;
}

function touch(snapshot: ShopMemberSnapshot) {
  snapshot.revision += 1;
  return snapshot;
}

function findMember(snapshot: ShopMemberSnapshot, memberId: string) {
  const member = snapshot.members.find((item) => item.id === memberId && !item.deletedAt);

  if (!member) {
    throw new Error("会员不存在或已删除");
  }

  return member;
}

function findTemplate(snapshot: ShopMemberSnapshot, templateId: string) {
  const template = snapshot.templates.find((item) => item.id === templateId);

  if (!template) {
    throw new Error("会员卡模板不存在");
  }

  return template;
}

function findCard(snapshot: ShopMemberSnapshot, cardId: string) {
  const card = snapshot.cards.find((item) => item.id === cardId);

  if (!card) {
    throw new Error("会员卡不存在");
  }

  return card;
}

function assertCardCanConsume(card: ShopMemberCard) {
  if (card.status === "frozen") {
    throw new Error("会员卡已冻结，不能核销");
  }

  if (card.status === "expired") {
    throw new Error("会员卡已过期，不能核销");
  }

  if (card.status !== "active") {
    throw new Error(`会员卡当前状态为 ${card.status}，不能核销`);
  }
}

function createLedger(
  snapshot: ShopMemberSnapshot,
  card: ShopMemberCard,
  patch: Omit<ShopMemberCardLedger, "id" | "shopId" | "memberId" | "cardId" | "createdAt"> & { createdAt?: string }
) {
  const ledger: ShopMemberCardLedger = {
    id: createId("ledger", snapshot.ledgers.length),
    shopId: card.shopId,
    memberId: card.memberId,
    cardId: card.id,
    createdAt: patch.createdAt ?? nowLabel(),
    ...patch
  };

  snapshot.ledgers.push(ledger);
  return ledger;
}

function addActivity(snapshot: ShopMemberSnapshot, card: ShopMemberCard, title: string, detail: string, at: string) {
  snapshot.activities.unshift({
    id: createId("activity", snapshot.activities.length),
    shopId: card.shopId,
    memberId: card.memberId,
    title,
    detail,
    at,
    tone: "green"
  });
}

function recordOperation(
  snapshot: ShopMemberSnapshot,
  log: Omit<ShopMemberOperationLog, "id" | "createdAt"> & { createdAt?: string }
) {
  snapshot.operationLogs.push({
    id: createId("oplog", snapshot.operationLogs.length),
    createdAt: log.createdAt ?? nowLabel(),
    ...log
  });
}

function cardTemplateLabel(template: ShopMemberCardTemplate) {
  if (template.cardType === "stored_value") {
    return `${template.name} · 储值`;
  }

  if (template.cardType === "times") {
    return `${template.name} · ${template.totalTimes} 次`;
  }

  return template.name;
}

export function getTemplateIssuedCount(snapshot: ShopMemberSnapshot, templateId: string) {
  return snapshot.cards.filter((card) => card.templateId === templateId).length;
}

export function createEmptyShopMemberSnapshot(shopId = "store-1") {
  const seeded = createDefaultShopMemberSnapshot(shopId);

  return {
    ...seeded,
    members: [],
    cards: [],
    ledgers: [],
    coupons: [],
    operationLogs: [],
    reminders: [],
    activities: [],
    revision: 1
  } satisfies ShopMemberSnapshot;
}

export function createShopMember(snapshot: ShopMemberSnapshot, input: CreateMemberInput) {
  assertShopMemberPermission(input.role ?? defaultRole, "shop.member.create");
  const next = cloneSnapshot(snapshot);
  const timestamp = input.now ?? nowLabel();
  const phoneHash = hashPhone(input.phone);

  if (next.members.some((member) => member.shopId === input.shopId && member.phoneHash === phoneHash && !member.deletedAt)) {
    throw new Error("同一手机号已经存在会员");
  }

  const member: ShopMember = {
    id: createId("member", next.members.length),
    shopId: input.shopId,
    name: input.name.trim(),
    phoneEncrypted: input.phone,
    phoneHash,
    gender: "unknown",
    language: "ja",
    source: input.source ?? "walk_in",
    tags: input.tags ?? [],
    notePrivate: input.notePrivate,
    riskStatus: "normal",
    totalOrders: 0,
    totalSpend: 0,
    createdBy: input.operatorId,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  next.members.unshift(member);

  recordOperation(next, {
    shopId: input.shopId,
    operatorId: input.operatorId,
    action: "member.create",
    targetType: "member",
    targetId: member.id,
    after: member,
    reason: "新建会员",
    createdAt: timestamp
  });

  return touch(next);
}

export function issueShopMemberCard(snapshot: ShopMemberSnapshot, input: IssueCardInput): WriteResult {
  assertShopMemberPermission(input.role ?? defaultRole, "shop.member.card.issue");
  const next = cloneSnapshot(snapshot);
  const timestamp = input.now ?? nowLabel();
  const member = findMember(next, input.memberId);
  const template = findTemplate(next, input.templateId);

  if (template.status !== "active") {
    throw new Error("会员卡模板未启用，不能开卡");
  }

  const card: ShopMemberCard = {
    id: createId("card", next.cards.length),
    shopId: member.shopId,
    memberId: member.id,
    templateId: template.id,
    cardNo: `MC-${String(next.cards.length + 1).padStart(5, "0")}`,
    qrTokenHash: `${member.phoneHash}_${template.id}_${next.cards.length + 1}`,
    cardType: template.cardType,
    status: "active",
    principalBalance: template.principalAmount,
    bonusBalance: template.bonusAmount,
    remainingTimes: template.totalTimes,
    startAt: timestamp,
    expireAt: addDays(timestamp, template.validDays),
    issuedBy: input.operatorId,
    issuedAt: timestamp,
    metadata: {
      ...(template.cardType === "discount" ? { discountRate: 0.92 } : {}),
      issuedMemberName: member.name,
      issuedMemberPhoneHash: member.phoneHash,
      issuedNeedoUserId: member.needoUserId,
      relationshipIndependent: true
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };

  next.cards.unshift(card);
  template.issuedCount = getTemplateIssuedCount(next, template.id);
  template.updatedAt = timestamp;

  const openLedger = createLedger(next, card, {
    templateId: template.id,
    type: "OPEN_CARD",
    amountDelta: template.principalAmount,
    timesDelta: template.totalTimes,
    principalBefore: 0,
    principalAfter: template.principalAmount,
    bonusBefore: 0,
    bonusAfter: 0,
    timesBefore: 0,
    timesAfter: template.totalTimes,
    paymentMethod: input.paymentMethod,
    paymentRef: input.paymentRef,
    operatorId: input.operatorId,
    reason: "开卡",
    createdAt: timestamp
  });
  const ledgers = [openLedger];

  if (template.bonusAmount > 0) {
    ledgers.push(
      createLedger(next, card, {
        templateId: template.id,
        relatedLedgerId: openLedger.id,
        type: "BONUS_GRANT",
        amountDelta: template.bonusAmount,
        timesDelta: 0,
        principalBefore: template.principalAmount,
        principalAfter: template.principalAmount,
        bonusBefore: 0,
        bonusAfter: template.bonusAmount,
        timesBefore: template.totalTimes,
        timesAfter: template.totalTimes,
        paymentMethod: "none",
        operatorId: input.operatorId,
        reason: "开卡赠送",
        createdAt: timestamp
      })
    );
  }

  addActivity(next, card, `${member.name} 开通 ${template.name}`, `实收 ${template.price.toLocaleString("ja-JP")} 円，卡号 ${card.cardNo}。`, timestamp);

  return {
    snapshot: touch(next),
    ledgers
  };
}

export function updateShopMemberCardTemplate(snapshot: ShopMemberSnapshot, input: UpdateCardTemplateInput) {
  assertShopMemberPermission(input.role ?? defaultRole, "shop.member.card.template.manage");
  const next = cloneSnapshot(snapshot);
  const timestamp = input.now ?? nowLabel();
  const template = findTemplate(next, input.templateId);
  const before = { ...template };
  const name = input.name.trim();
  const note = input.note?.trim();

  if (!name) {
    throw new Error("会员卡名称不能为空");
  }

  if (!Number.isFinite(input.principalAmount) || input.principalAmount < 0) {
    throw new Error("本金必须为 0 以上");
  }

  if (!Number.isFinite(input.bonusAmount) || input.bonusAmount < 0) {
    throw new Error("赠送额必须为 0 以上");
  }

  template.name = name;
  template.note = note || undefined;
  template.principalAmount = Math.round(input.principalAmount);
  template.bonusAmount = Math.round(input.bonusAmount);
  template.price = template.principalAmount;
  template.issuedCount = getTemplateIssuedCount(next, template.id);
  template.updatedAt = timestamp;

  recordOperation(next, {
    shopId: template.shopId,
    operatorId: input.operatorId,
    action: "card_template.update",
    targetType: "card_template",
    targetId: template.id,
    before,
    after: template,
    reason: "编辑会员卡模板",
    createdAt: timestamp
  });

  return touch(next);
}

export function topupShopMemberCard(snapshot: ShopMemberSnapshot, input: TopupCardInput): WriteResult {
  assertShopMemberPermission(input.role ?? defaultRole, "shop.member.card.topup");

  if (input.principalAmount <= 0) {
    throw new Error("充值本金必须大于 0");
  }

  const next = cloneSnapshot(snapshot);
  const timestamp = input.now ?? nowLabel();
  const card = findCard(next, input.cardId);
  const member = findMember(next, card.memberId);

  if (card.status === "cancelled" || card.status === "refunded" || card.status === "expired") {
    throw new Error("当前会员卡状态不能充值");
  }

  const principalBefore = card.principalBalance;
  const bonusBefore = card.bonusBalance;
  card.principalBalance += input.principalAmount;
  card.bonusBalance += input.bonusAmount ?? 0;
  card.updatedAt = timestamp;

  const ledgers = [
    createLedger(next, card, {
      templateId: card.templateId,
      type: "TOP_UP",
      amountDelta: input.principalAmount,
      timesDelta: 0,
      principalBefore,
      principalAfter: card.principalBalance,
      bonusBefore,
      bonusAfter: bonusBefore,
      timesBefore: card.remainingTimes,
      timesAfter: card.remainingTimes,
      paymentMethod: input.paymentMethod,
      paymentRef: input.paymentRef,
      operatorId: input.operatorId,
      reason: input.reason ?? "会员充值",
      createdAt: timestamp
    })
  ];

  if ((input.bonusAmount ?? 0) > 0) {
    ledgers.push(
      createLedger(next, card, {
        templateId: card.templateId,
        relatedLedgerId: ledgers[0].id,
        type: "BONUS_GRANT",
        amountDelta: input.bonusAmount ?? 0,
        timesDelta: 0,
        principalBefore: card.principalBalance,
        principalAfter: card.principalBalance,
        bonusBefore,
        bonusAfter: card.bonusBalance,
        timesBefore: card.remainingTimes,
        timesAfter: card.remainingTimes,
        paymentMethod: "none",
        operatorId: input.operatorId,
        reason: "充值赠送",
        createdAt: timestamp
      })
    );
  }

  addActivity(next, card, `${member.name} 完成会员充值`, `本金 ${input.principalAmount.toLocaleString("ja-JP")} 円，赠送 ${(input.bonusAmount ?? 0).toLocaleString("ja-JP")} 円。`, timestamp);

  return {
    snapshot: touch(next),
    ledgers
  };
}

export function consumeShopMemberCard(snapshot: ShopMemberSnapshot, input: ConsumeCardInput): WriteResult {
  assertShopMemberPermission(input.role ?? defaultRole, "shop.member.card.consume");

  if (input.idempotencyKey) {
    const existing = snapshot.ledgers.filter((ledger) => ledger.idempotencyKey === input.idempotencyKey && ledger.cardId === input.cardId);

    if (existing.length > 0) {
      return {
        snapshot,
        ledgers: existing
      };
    }
  }

  const next = cloneSnapshot(snapshot);
  const timestamp = input.now ?? nowLabel();
  const card = findCard(next, input.cardId);
  const member = findMember(next, card.memberId);
  const template = findTemplate(next, card.templateId);
  assertCardCanConsume(card);

  const ledgers: ShopMemberCardLedger[] = [];
  const timesToConsume = Math.max(0, Math.floor(input.times ?? (card.cardType === "times" || card.cardType === "trial" ? 1 : 0)));
  const amountToConsume = Math.max(0, input.amount ?? 0);

  if (timesToConsume > 0) {
    if (card.remainingTimes < timesToConsume) {
      throw new Error("会员卡剩余次数不足");
    }

    const timesBefore = card.remainingTimes;
    card.remainingTimes -= timesToConsume;
    ledgers.push(
      createLedger(next, card, {
        templateId: card.templateId,
        orderId: input.orderId,
        idempotencyKey: input.idempotencyKey,
        type: "CONSUME_TIMES",
        amountDelta: 0,
        timesDelta: -timesToConsume,
        principalBefore: card.principalBalance,
        principalAfter: card.principalBalance,
        bonusBefore: card.bonusBalance,
        bonusAfter: card.bonusBalance,
        timesBefore,
        timesAfter: card.remainingTimes,
        paymentMethod: "none",
        paymentRef: input.paymentRef,
        operatorId: input.operatorId,
        reason: input.reason ?? "扫码核销",
        createdAt: timestamp
      })
    );
  }

  if (amountToConsume > 0) {
    const totalBalance = card.principalBalance + card.bonusBalance;

    if (totalBalance < amountToConsume) {
      throw new Error("会员卡余额不足");
    }

    const order = input.consumeOrder ?? (template.consumeRule.order === "manual" ? "bonus_first" : template.consumeRule.order);
    const firstBucket = order === "principal_first" ? "principal" : "bonus";
    const secondBucket = firstBucket === "principal" ? "bonus" : "principal";
    let remainingAmount = amountToConsume;

    for (const bucket of [firstBucket, secondBucket] as const) {
      if (remainingAmount <= 0) {
        break;
      }

      const available = bucket === "bonus" ? card.bonusBalance : card.principalBalance;
      const deduct = Math.min(available, remainingAmount);

      if (deduct <= 0) {
        continue;
      }

      const principalBefore = card.principalBalance;
      const bonusBefore = card.bonusBalance;

      if (bucket === "bonus") {
        card.bonusBalance -= deduct;
      } else {
        card.principalBalance -= deduct;
      }

      remainingAmount -= deduct;
      ledgers.push(
        createLedger(next, card, {
          templateId: card.templateId,
          orderId: input.orderId,
          idempotencyKey: input.idempotencyKey,
          type: bucket === "bonus" ? "CONSUME_BONUS" : "CONSUME_PRINCIPAL",
          amountDelta: -deduct,
          timesDelta: 0,
          principalBefore,
          principalAfter: card.principalBalance,
          bonusBefore,
          bonusAfter: card.bonusBalance,
          timesBefore: card.remainingTimes,
          timesAfter: card.remainingTimes,
          paymentMethod: "none",
          paymentRef: input.paymentRef,
          operatorId: input.operatorId,
          reason: input.reason ?? "会员卡核销",
          createdAt: timestamp
        })
      );
    }
  }

  if (ledgers.length === 0) {
    throw new Error("本次核销没有可扣减的余额或次数");
  }

  card.lastUsedAt = timestamp;
  card.updatedAt = timestamp;

  if ((card.cardType === "times" || card.cardType === "trial") && card.remainingTimes === 0) {
    card.status = "used_up";
  }

  addActivity(next, card, `${member.name} 完成会员卡核销`, `${cardTemplateLabel(template)}，本次扣除 ${timesToConsume > 0 ? `${timesToConsume} 次` : `${amountToConsume.toLocaleString("ja-JP")} 円`}。`, timestamp);

  return {
    snapshot: touch(next),
    ledgers
  };
}

export function freezeShopMemberCard(snapshot: ShopMemberSnapshot, input: CardStatusInput): WriteResult {
  assertShopMemberPermission(input.role ?? defaultRole, "shop.member.card.freeze");
  const next = cloneSnapshot(snapshot);
  const timestamp = input.now ?? nowLabel();
  const card = findCard(next, input.cardId);

  if (card.status !== "active") {
    throw new Error("只有启用中的会员卡可以冻结");
  }

  const before = { status: card.status };
  card.status = "frozen";
  card.updatedAt = timestamp;

  const ledger = createLedger(next, card, {
    templateId: card.templateId,
    type: "FREEZE",
    amountDelta: 0,
    timesDelta: 0,
    principalBefore: card.principalBalance,
    principalAfter: card.principalBalance,
    bonusBefore: card.bonusBalance,
    bonusAfter: card.bonusBalance,
    timesBefore: card.remainingTimes,
    timesAfter: card.remainingTimes,
    paymentMethod: "none",
    operatorId: input.operatorId,
    reason: input.reason,
    createdAt: timestamp
  });

  recordOperation(next, {
    shopId: card.shopId,
    operatorId: input.operatorId,
    action: "card.freeze",
    targetType: "member_card",
    targetId: card.id,
    before,
    after: { status: card.status },
    reason: input.reason,
    createdAt: timestamp
  });

  return {
    snapshot: touch(next),
    ledgers: [ledger]
  };
}

export function unfreezeShopMemberCard(snapshot: ShopMemberSnapshot, input: CardStatusInput): WriteResult {
  assertShopMemberPermission(input.role ?? defaultRole, "shop.member.card.unfreeze");
  const next = cloneSnapshot(snapshot);
  const timestamp = input.now ?? nowLabel();
  const card = findCard(next, input.cardId);

  if (card.status !== "frozen") {
    throw new Error("只有冻结中的会员卡可以解冻");
  }

  const before = { status: card.status };
  card.status = "active";
  card.updatedAt = timestamp;

  const ledger = createLedger(next, card, {
    templateId: card.templateId,
    type: "UNFREEZE",
    amountDelta: 0,
    timesDelta: 0,
    principalBefore: card.principalBalance,
    principalAfter: card.principalBalance,
    bonusBefore: card.bonusBalance,
    bonusAfter: card.bonusBalance,
    timesBefore: card.remainingTimes,
    timesAfter: card.remainingTimes,
    paymentMethod: "none",
    operatorId: input.operatorId,
    reason: input.reason,
    createdAt: timestamp
  });

  recordOperation(next, {
    shopId: card.shopId,
    operatorId: input.operatorId,
    action: "card.unfreeze",
    targetType: "member_card",
    targetId: card.id,
    before,
    after: { status: card.status },
    reason: input.reason,
    createdAt: timestamp
  });

  return {
    snapshot: touch(next),
    ledgers: [ledger]
  };
}

export function requestShopMemberCardRefund(snapshot: ShopMemberSnapshot, input: RefundInput): WriteResult {
  assertShopMemberPermission(input.role ?? defaultRole, "shop.member.card.refund.request");
  const next = cloneSnapshot(snapshot);
  const timestamp = input.now ?? nowLabel();
  const card = findCard(next, input.cardId);

  if (input.amount <= 0 || input.amount > card.principalBalance) {
    throw new Error("退款申请金额只能来自剩余本金");
  }

  const before = { status: card.status };
  card.status = "refunding";
  card.updatedAt = timestamp;

  const ledger = createLedger(next, card, {
    templateId: card.templateId,
    type: "REFUND_REQUEST",
    amountDelta: -input.amount,
    timesDelta: 0,
    principalBefore: card.principalBalance,
    principalAfter: card.principalBalance,
    bonusBefore: card.bonusBalance,
    bonusAfter: card.bonusBalance,
    timesBefore: card.remainingTimes,
    timesAfter: card.remainingTimes,
    paymentMethod: "none",
    operatorId: input.operatorId,
    reason: input.reason,
    createdAt: timestamp
  });

  recordOperation(next, {
    shopId: card.shopId,
    operatorId: input.operatorId,
    action: "refund.request",
    targetType: "member_card",
    targetId: card.id,
    before,
    after: { status: card.status, requestedAmount: input.amount },
    reason: input.reason,
    createdAt: timestamp
  });

  return {
    snapshot: touch(next),
    ledgers: [ledger]
  };
}

export function approveShopMemberCardRefund(snapshot: ShopMemberSnapshot, input: RefundInput): WriteResult {
  assertShopMemberPermission(input.role ?? "owner", "shop.member.card.refund.approve");
  const next = cloneSnapshot(snapshot);
  const timestamp = input.now ?? nowLabel();
  const card = findCard(next, input.cardId);

  if (input.amount <= 0 || input.amount > card.principalBalance) {
    throw new Error("退款审批金额只能来自剩余本金");
  }

  const principalBefore = card.principalBalance;
  card.principalBalance -= input.amount;
  card.status = card.principalBalance + card.bonusBalance <= 0 && card.remainingTimes <= 0 ? "refunded" : "active";
  card.updatedAt = timestamp;

  const ledger = createLedger(next, card, {
    templateId: card.templateId,
    type: "REFUND_APPROVE",
    amountDelta: -input.amount,
    timesDelta: 0,
    principalBefore,
    principalAfter: card.principalBalance,
    bonusBefore: card.bonusBalance,
    bonusAfter: card.bonusBalance,
    timesBefore: card.remainingTimes,
    timesAfter: card.remainingTimes,
    paymentMethod: "none",
    operatorId: input.operatorId,
    approvedBy: input.approvedBy ?? input.operatorId,
    reason: input.reason,
    createdAt: timestamp
  });

  recordOperation(next, {
    shopId: card.shopId,
    operatorId: input.operatorId,
    action: "refund.approve",
    targetType: "member_card",
    targetId: card.id,
    before: { principalBalance: principalBefore },
    after: { principalBalance: card.principalBalance, status: card.status },
    reason: input.reason,
    createdAt: timestamp
  });

  return {
    snapshot: touch(next),
    ledgers: [ledger]
  };
}

export function getMemberActiveCards(snapshot: ShopMemberSnapshot, memberId: string) {
  return snapshot.cards.filter((card) => card.memberId === memberId && card.status === "active");
}

export function getCardLedgerTotal(card: ShopMemberCard) {
  return card.principalBalance + card.bonusBalance;
}

export function filterShopMembers(snapshot: ShopMemberSnapshot, filters: ShopMemberListFilters = {}) {
  const normalizedKeyword = filters.keyword?.trim().toLowerCase();
  const activeCardMemberIds = new Set(snapshot.cards.filter((card) => card.status === "active").map((card) => card.memberId));

  return snapshot.members.filter((member) => {
    if (member.deletedAt) {
      return false;
    }

    if (normalizedKeyword) {
      const target = [member.name, member.nickname, member.phoneEncrypted, member.phoneHash, member.lineId, ...member.tags].filter(Boolean).join(" ").toLowerCase();

      if (!target.includes(normalizedKeyword)) {
        return false;
      }
    }

    if (filters.levelId && member.levelId !== filters.levelId) {
      return false;
    }

    if (filters.tag && !member.tags.includes(filters.tag)) {
      return false;
    }

    if (filters.source && filters.source !== "all" && member.source !== filters.source) {
      return false;
    }

    if (typeof filters.hasCard === "boolean" && activeCardMemberIds.has(member.id) !== filters.hasCard) {
      return false;
    }

    if (filters.riskStatus && filters.riskStatus !== "all" && member.riskStatus !== filters.riskStatus) {
      return false;
    }

    return true;
  });
}
