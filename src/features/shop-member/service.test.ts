import { describe, expect, it } from "vitest";
import {
  consumeShopMemberCard,
  createEmptyShopMemberSnapshot,
  createShopMember,
  freezeShopMemberCard,
  getTemplateIssuedCount,
  issueShopMemberCard,
  topupShopMemberCard,
  updateShopMemberCardTemplate,
  approveShopMemberCardRefund
} from "./service";

function createMemberReadySnapshot() {
  const empty = createEmptyShopMemberSnapshot();
  return createShopMember(empty, {
    shopId: "store-1",
    name: "测试会员",
    phone: "+81 80-1111-2222",
    operatorId: "owner-1",
    role: "owner",
    now: "2026-05-06 09:00"
  });
}

describe("shop member card ledger service", () => {
  it("writes OPEN_CARD and BONUS_GRANT when issuing a stored-value card", () => {
    const snapshot = createMemberReadySnapshot();
    const member = snapshot.members[0]!;
    const result = issueShopMemberCard(snapshot, {
      memberId: member.id,
      templateId: "tpl-value-30000",
      operatorId: "manager-1",
      role: "manager",
      paymentMethod: "offline_pos",
      paymentRef: "POS-001",
      now: "2026-05-06 09:10"
    });
    const card = result.snapshot.cards[0]!;

    expect(result.ledgers.map((ledger) => ledger.type)).toEqual(["OPEN_CARD", "BONUS_GRANT"]);
    expect(card.principalBalance).toBe(30000);
    expect(card.bonusBalance).toBe(5000);
    expect(result.snapshot.ledgers).toHaveLength(2);
  });

  it("edits card template copy and amounts without letting issued count drift", () => {
    const snapshot = createMemberReadySnapshot();
    const beforeCount = getTemplateIssuedCount(snapshot, "tpl-value-30000");

    const updated = updateShopMemberCardTemplate(snapshot, {
      templateId: "tpl-value-30000",
      operatorId: "owner-1",
      role: "owner",
      name: "黑卡储值 50,000",
      note: "店长可按客户复购节奏调整。",
      principalAmount: 50000,
      bonusAmount: 8000,
      now: "2026-05-06 09:08"
    });
    const template = updated.templates.find((item) => item.id === "tpl-value-30000")!;

    expect(template.name).toBe("黑卡储值 50,000");
    expect(template.note).toBe("店长可按客户复购节奏调整。");
    expect(template.principalAmount).toBe(50000);
    expect(template.bonusAmount).toBe(8000);
    expect(template.price).toBe(50000);
    expect(template.issuedCount).toBe(beforeCount);
    expect(updated.operationLogs.at(-1)?.action).toBe("card_template.update");
  });

  it("derives issued count from actual cards and keeps issued card ownership independent of contact relation", () => {
    const snapshot = createMemberReadySnapshot();
    const member = snapshot.members[0]!;
    const result = issueShopMemberCard(snapshot, {
      memberId: member.id,
      templateId: "tpl-value-30000",
      operatorId: "manager-1",
      role: "manager",
      paymentMethod: "offline_pos",
      now: "2026-05-06 09:10"
    });
    const card = result.snapshot.cards[0]!;
    const template = result.snapshot.templates.find((item) => item.id === "tpl-value-30000")!;

    expect(template.issuedCount).toBe(getTemplateIssuedCount(result.snapshot, template.id));
    expect(card.metadata).toMatchObject({
      issuedMemberName: "测试会员",
      issuedMemberPhoneHash: member.phoneHash,
      relationshipIndependent: true
    });
  });

  it("keeps principal and bonus balances separated during topup and bonus-first consume", () => {
    let snapshot = createMemberReadySnapshot();
    const member = snapshot.members[0]!;
    snapshot = issueShopMemberCard(snapshot, {
      memberId: member.id,
      templateId: "tpl-value-30000",
      operatorId: "manager-1",
      role: "manager",
      paymentMethod: "offline_pos",
      now: "2026-05-06 09:10"
    }).snapshot;
    const cardId = snapshot.cards[0]!.id;

    snapshot = topupShopMemberCard(snapshot, {
      cardId,
      principalAmount: 30000,
      bonusAmount: 5000,
      operatorId: "manager-1",
      role: "manager",
      paymentMethod: "offline_pos",
      now: "2026-05-06 09:20"
    }).snapshot;

    let card = snapshot.cards[0]!;
    expect(card.principalBalance).toBe(60000);
    expect(card.bonusBalance).toBe(10000);

    const consumeResult = consumeShopMemberCard(snapshot, {
      cardId,
      amount: 8000,
      operatorId: "staff-1",
      role: "staff",
      idempotencyKey: "verify-001",
      now: "2026-05-06 09:30"
    });

    card = consumeResult.snapshot.cards[0]!;
    expect(consumeResult.ledgers.map((ledger) => ledger.type)).toEqual(["CONSUME_BONUS"]);
    expect(card.principalBalance).toBe(60000);
    expect(card.bonusBalance).toBe(2000);

    const secondConsume = consumeShopMemberCard(consumeResult.snapshot, {
      cardId,
      amount: 5000,
      operatorId: "staff-1",
      role: "staff",
      idempotencyKey: "verify-002",
      now: "2026-05-06 09:40"
    });

    card = secondConsume.snapshot.cards[0]!;
    expect(secondConsume.ledgers.map((ledger) => ledger.type)).toEqual(["CONSUME_BONUS", "CONSUME_PRINCIPAL"]);
    expect(card.principalBalance).toBe(57000);
    expect(card.bonusBalance).toBe(0);
  });

  it("consumes times cards once and treats repeated idempotency keys as a no-op", () => {
    let snapshot = createMemberReadySnapshot();
    const member = snapshot.members[0]!;
    snapshot = issueShopMemberCard(snapshot, {
      memberId: member.id,
      templateId: "tpl-times-10",
      operatorId: "manager-1",
      role: "manager",
      paymentMethod: "card",
      now: "2026-05-06 09:10"
    }).snapshot;
    const cardId = snapshot.cards[0]!.id;

    const first = consumeShopMemberCard(snapshot, {
      cardId,
      times: 1,
      operatorId: "staff-1",
      role: "staff",
      idempotencyKey: "times-verify-001",
      now: "2026-05-06 09:20"
    });
    const second = consumeShopMemberCard(first.snapshot, {
      cardId,
      times: 1,
      operatorId: "staff-1",
      role: "staff",
      idempotencyKey: "times-verify-001",
      now: "2026-05-06 09:21"
    });

    expect(first.snapshot.cards[0]!.remainingTimes).toBe(9);
    expect(second.snapshot.cards[0]!.remainingTimes).toBe(9);
    expect(second.ledgers).toHaveLength(1);
  });

  it("blocks consume for frozen cards and blocks unauthorized refund approval", () => {
    let snapshot = createMemberReadySnapshot();
    const member = snapshot.members[0]!;
    snapshot = issueShopMemberCard(snapshot, {
      memberId: member.id,
      templateId: "tpl-value-30000",
      operatorId: "manager-1",
      role: "manager",
      paymentMethod: "card",
      now: "2026-05-06 09:10"
    }).snapshot;
    const cardId = snapshot.cards[0]!.id;

    snapshot = freezeShopMemberCard(snapshot, {
      cardId,
      operatorId: "owner-1",
      role: "owner",
      reason: "风控确认",
      now: "2026-05-06 09:20"
    }).snapshot;

    expect(() => consumeShopMemberCard(snapshot, {
      cardId,
      amount: 1000,
      operatorId: "staff-1",
      role: "staff",
      now: "2026-05-06 09:30"
    })).toThrow("会员卡已冻结");

    expect(() => approveShopMemberCardRefund(snapshot, {
      cardId,
      amount: 1000,
      operatorId: "staff-1",
      role: "staff",
      reason: "前台尝试审批",
      now: "2026-05-06 09:40"
    })).toThrow("当前账号无权执行 shop.member.card.refund.approve");
  });
});
