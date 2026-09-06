import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { AppError } from "../src/utils/app-error";

const REFUND_AMOUNT_JPY = 8_800;
const REWARD_NDP = 1_000;

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const assertSafeLocalDatabase = (): string => {
  const blocked = new Set(["staging", "prod", "production"]);
  assert(
    !blocked.has((process.env.NODE_ENV ?? "").trim().toLowerCase()),
    "refund check rejects production"
  );
  assert(
    !blocked.has((process.env.DEPLOY_ENV ?? "").trim().toLowerCase()),
    "refund check rejects staging and production deploy environments"
  );
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname),
    "refund check only accepts a local MySQL host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//u, "");
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(
    !/(^|[_-])(prod|production|staging)([_-]|$)/iu.test(databaseName),
    "refund check rejects production-looking database names"
  );
  return databaseName;
};

const expectAppError = async (
  action: () => Promise<unknown>,
  expected: { statusCode: number; message: string }
): Promise<void> => {
  try {
    await action();
  } catch (error) {
    assert(error instanceof AppError, "refund checker expected an AppError");
    assert(
      error.statusCode === expected.statusCode && error.message === expected.message,
      "refund checker received an unexpected AppError"
    );
    return;
  }
  throw new Error("refund checker expected command to fail");
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const databaseName = assertSafeLocalDatabase();
  const [
    { AuditLogRepository },
    { AuditLogService },
    { OrderRefundCaseRepository },
    { OrderRefundCaseService },
    { createFormalTestUser, deleteFormalTestUserFoundations },
    { prisma, disconnectPrisma }
  ] = await Promise.all([
    import("../src/repositories/audit-log.repository"),
    import("../src/services/audit-log.service"),
    import("../src/repositories/order-refund-case.repository"),
    import("../src/services/order-refund-case.service"),
    import("./support/formal-test-user"),
    import("../src/prisma/client")
  ]);

  const marker = `order-refund-case-${Date.now()}-${process.pid}`;
  const compact = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const proof: Record<string, boolean | string> = {
    database: databaseName,
    "merchant-approved-refund": false,
    "merchant-rejected-without-operations": false,
    "customer-complaint-platform-refund": false,
    "merchant-complaint-platform-reject": false,
    "customer-receipt-required": false,
    "affiliate-reward-preserved": false,
    "claimant-wallet-preserved": false,
    "no-affiliate-reversal-transactions": false,
    "idempotent-replay": false,
    "stale-version-conflict": false,
    "cross-shop-hidden": false,
    "cleanup-complete": false
  };
  const userIds: number[] = [];
  const extraIdentityIds: number[] = [];
  const shopIds: number[] = [];
  const categoryIds: number[] = [];
  const serviceIds: number[] = [];
  const slotIds: number[] = [];
  const orderIds: number[] = [];
  const taskIds: number[] = [];
  const claimIds: number[] = [];
  const attributionIds: number[] = [];
  const rewardIds: number[] = [];
  const rewardTransactionIds: number[] = [];
  const ledgerTransactionIds: number[] = [];
  const walletIds: number[] = [];

  try {
    const passwordHash = await hash("OrderRefundCaseFlow.2026!", 12);
    const createUser = async (label: string) => {
      const user = await createFormalTestUser(prisma, {
        email: `${marker}-${label}@needo.test`,
        passwordHash,
        username: `${marker} ${label}`
      });
      userIds.push(user.id);
      const customerIdentity = user.identities.find((identity) => identity.type === "customer");
      assert(customerIdentity, "formal test user is missing a customer identity");
      return { user, customerIdentity };
    };

    const customerA = await createUser("customer-a");
    const customerB = await createUser("customer-b");
    const customerC = await createUser("customer-c");
    const merchant = await createUser("merchant");
    const otherMerchant = await createUser("other-merchant");
    const operator = await createUser("operator");
    const claimant = await createUser("claimant");
    const category = await prisma.category.create({
      data: { code: `${marker}-category`, name: `${marker} category` }
    });
    categoryIds.push(category.id);
    const shop = await prisma.shop.create({
      data: {
        ownerUserId: merchant.user.id,
        name: `${marker} shop`,
        city: "Tokyo",
        address: "Local refund acceptance",
        status: "published",
        pricingMode: "MERCHANT"
      }
    });
    shopIds.push(shop.id);
    const otherShop = await prisma.shop.create({
      data: {
        ownerUserId: otherMerchant.user.id,
        name: `${marker} other shop`,
        city: "Tokyo",
        address: "Local scope acceptance",
        status: "published",
        pricingMode: "MERCHANT"
      }
    });
    shopIds.push(otherShop.id);
    const merchantIdentity = await prisma.userIdentity.create({
      data: {
        userId: merchant.user.id,
        type: "merchant_owner",
        scopeType: "shop",
        scopeId: shop.id,
        displayName: `${marker} merchant`,
        activeKey: `${marker}-merchant`,
        isActive: true
      }
    });
    const otherMerchantIdentity = await prisma.userIdentity.create({
      data: {
        userId: otherMerchant.user.id,
        type: "merchant_owner",
        scopeType: "shop",
        scopeId: otherShop.id,
        displayName: `${marker} other merchant`,
        activeKey: `${marker}-other-merchant`,
        isActive: true
      }
    });
    const platformIdentity = await prisma.userIdentity.create({
      data: {
        userId: operator.user.id,
        type: "platform",
        scopeType: "global",
        scopeId: null,
        displayName: `${marker} operator`,
        activeKey: `${marker}-operator`,
        isActive: true
      }
    });
    extraIdentityIds.push(merchantIdentity.id, otherMerchantIdentity.id, platformIdentity.id);
    const service = await prisma.service.create({
      data: {
        categoryId: category.id,
        shopId: shop.id,
        name: `${marker} service`,
        city: "Tokyo",
        priceAmount: REFUND_AMOUNT_JPY,
        durationMinutes: 60,
        status: "published"
      }
    });
    serviceIds.push(service.id);
    const publisherWallet = await prisma.wallet.create({
      data: { ownerType: "SHOP", ownerId: shop.id, availableBalance: 10_000, frozenBalance: 0 }
    });
    const claimantWallet = await prisma.wallet.create({
      data: {
        ownerType: "USER",
        ownerId: claimant.user.id,
        availableBalance: 2_500,
        frozenBalance: 0
      }
    });
    walletIds.push(publisherWallet.id, claimantWallet.id);

    const actor = (input: {
      user: { id: number; email: string };
      identity: { id: number; type: string; scopeType: string | null; scopeId: number | null };
    }) => ({
      userId: input.user.id,
      email: input.user.email,
      accessTokenJti: `${marker}-${input.identity.id}`,
      accessTokenExpiresAt: Math.floor(Date.now() / 1_000) + 900,
      currentIdentityId: input.identity.id,
      currentIdentityType: input.identity.type,
      currentIdentityScopeType: input.identity.scopeType,
      currentIdentityScopeId: input.identity.scopeId,
      roles: [input.identity.type],
      permissions: []
    });
    const customerActor = (entry: typeof customerA) =>
      actor({ user: entry.user, identity: entry.customerIdentity });
    const merchantActor = actor({ user: merchant.user, identity: merchantIdentity });
    const otherMerchantActor = actor({ user: otherMerchant.user, identity: otherMerchantIdentity });
    const operatorActor = actor({ user: operator.user, identity: platformIdentity });
    const context = { ip: "127.0.0.1", userAgent: "order-refund-case-flow-checker" };
    const refund = new OrderRefundCaseService(
      new OrderRefundCaseRepository(prisma),
      new AuditLogService(new AuditLogRepository(prisma))
    );
    const now = new Date();

    const createCompletedOrder = async (label: string, customer: typeof customerA) => {
      const slot = await prisma.scheduleSlot.create({
        data: {
          serviceId: service.id,
          shopId: shop.id,
          startsAt: new Date(now.getTime() + slotIds.length * 7_200_000),
          endsAt: new Date(now.getTime() + (slotIds.length + 1) * 7_200_000),
          capacity: 1,
          status: "AVAILABLE"
        }
      });
      slotIds.push(slot.id);
      const order = await prisma.bookingOrder.create({
        data: {
          orderNo: `RFD-${compact}-${label}`.slice(0, 40),
          customerUserId: customer.user.id,
          serviceId: service.id,
          shopId: shop.id,
          scheduleSlotId: slot.id,
          status: "COMPLETED",
          priceAmount: REFUND_AMOUNT_JPY,
          currency: "JPY",
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          paymentMethod: "ONSITE",
          paymentStatus: "CONFIRMED",
          paymentAmountJpy: REFUND_AMOUNT_JPY,
          paymentConfirmedById: merchant.user.id,
          paymentConfirmedAt: now,
          paymentReference: `${marker}-${label}-paid`
        }
      });
      orderIds.push(order.id);
      await prisma.orderFinancial.create({
        data: {
          bookingOrderId: order.id,
          customerUserId: customer.user.id,
          shopId: shop.id,
          serviceAmountJpy: REFUND_AMOUNT_JPY,
          platformCollectedServiceAmountJpy: REFUND_AMOUNT_JPY,
          settlementStatus: "settled"
        }
      });
      const task = await prisma.affiliateTask.create({
        data: {
          taskCode: `${marker}-${label}`.slice(0, 80),
          lineageKey: `${marker}-${label}`.slice(0, 80),
          publisherType: "SHOP",
          publisherShopId: shop.id,
          name: `${marker} ${label}`,
          rewardNdpPerCompletedOrder: REWARD_NDP,
          totalBudgetNdp: REWARD_NDP,
          reservedBudgetNdp: REWARD_NDP,
          customerDiscountType: "NONE",
          claimStartsAt: new Date(now.getTime() - 86_400_000),
          claimEndsAt: new Date(now.getTime() + 86_400_000),
          taskStartsAt: new Date(now.getTime() - 86_400_000),
          taskEndsAt: new Date(now.getTime() + 86_400_000),
          attributionWindowDays: 14,
          serviceScopeMode: "SELECTED_SERVICES",
          status: "ACTIVE",
          reviewedById: merchant.user.id,
          reviewedAt: now,
          submittedAt: now,
          activatedAt: now,
          shops: { create: { shopId: shop.id, shopNameSnapshot: shop.name } },
          services: {
            create: {
              shopId: shop.id,
              serviceId: service.id,
              serviceNameSnapshot: service.name,
              servicePriceJpySnapshot: REFUND_AMOUNT_JPY
            }
          }
        }
      });
      taskIds.push(task.id);
      const claim = await prisma.affiliateClaim.create({
        data: {
          taskId: task.id,
          userId: claimant.user.id,
          activeKey: `${marker}-${label}-claim`.slice(0, 160),
          publicCode: `NDO-${compact}-${label}`.slice(0, 40).toUpperCase(),
          publicTokenId: `${compact}-${label}-token`.slice(0, 80),
          tokenHash: `${marker}-${label}-token-hash`.slice(0, 128),
          status: "ACTIVE",
          expiresAt: new Date(now.getTime() + 86_400_000)
        }
      });
      claimIds.push(claim.id);
      const attribution = await prisma.affiliateAttribution.create({
        data: {
          taskId: task.id,
          claimId: claim.id,
          bookingOrderId: order.id,
          activeKey: `${marker}-${label}-attribution`.slice(0, 120),
          claimantUserId: claimant.user.id,
          customerUserId: customer.user.id,
          shopId: shop.id,
          serviceId: service.id,
          source: "CODE",
          originalPriceJpy: REFUND_AMOUNT_JPY,
          finalPriceJpy: REFUND_AMOUNT_JPY,
          rewardAllocatedNdp: REWARD_NDP,
          status: "SETTLED",
          attributedAt: now,
          qualifiedAt: now,
          settledAt: now,
          expiresAt: new Date(now.getTime() + 86_400_000)
        }
      });
      attributionIds.push(attribution.id);
      const reward = await prisma.affiliateReward.create({
        data: {
          attributionId: attribution.id,
          taskId: task.id,
          claimId: claim.id,
          bookingOrderId: order.id,
          publisherWalletId: publisherWallet.id,
          claimantWalletId: claimantWallet.id,
          rewardNdp: REWARD_NDP,
          status: "SETTLED",
          settledAt: now
        }
      });
      rewardIds.push(reward.id);
      const ledger = await prisma.ledgerTransaction.create({
        data: {
          transactionNo: `RFD-${compact}-${label}-settle`.slice(0, 40),
          idempotencyKey: `${marker}-${label}-affiliate-settlement`.slice(0, 160),
          type: "AFFILIATE_REWARD_SETTLEMENT",
          status: "APPLIED",
          referenceType: "affiliate_reward",
          referenceId: reward.id,
          actorUserId: merchant.user.id,
          amount: REWARD_NDP,
          currency: "NDP",
          metadata: { marker, label }
        }
      });
      ledgerTransactionIds.push(ledger.id);
      const rewardTransaction = await prisma.affiliateRewardTransaction.create({
        data: {
          rewardId: reward.id,
          ledgerTransactionId: ledger.id,
          kind: "SETTLEMENT",
          amountNdp: REWARD_NDP
        }
      });
      rewardTransactionIds.push(rewardTransaction.id);
      return { order, reward };
    };

    const approved = await createCompletedOrder("approved", customerA);
    const approvedRequest = await refund.request(customerActor(customerA), context, {
      orderId: approved.order.id,
      idempotencyKey: `${marker}-approved-request`,
      expectedVersion: 0,
      reason: "service issue"
    });
    const requestReplay = await refund.request(customerActor(customerA), context, {
      orderId: approved.order.id,
      idempotencyKey: `${marker}-approved-request`,
      expectedVersion: 0,
      reason: "service issue"
    });
    assert(
      requestReplay.kind === "replayed" &&
        requestReplay.value.publicId === approvedRequest.value.publicId,
      "exact refund request replay was not idempotent"
    );
    proof["idempotent-replay"] = true;
    const approvedDecision = await refund.merchantApprove(
      merchantActor,
      context,
      approved.order.id,
      approvedRequest.value.publicId,
      {
        idempotencyKey: `${marker}-approved-decision`,
        expectedVersion: 1,
        note: "shop accepts responsibility"
      }
    );
    proof["merchant-approved-refund"] =
      approvedDecision.status === "refund_pending" && approvedDecision.responsibility === "shop";
    await expectAppError(
      () =>
        refund.confirmCustomerReceipt(
          customerActor(customerA),
          context,
          approved.order.id,
          approvedRequest.value.publicId,
          { idempotencyKey: `${marker}-early-receipt`, expectedVersion: 2 }
        ),
      { statusCode: 409, message: "error.order_refund_case.invalid_state" }
    );
    const beforeEvidenceOrder = await prisma.bookingOrder.findUniqueOrThrow({
      where: { id: approved.order.id }
    });
    assert(
      beforeEvidenceOrder.paymentStatus === "CONFIRMED" &&
        beforeEvidenceOrder.paymentRefundedAt === null,
      "refund completed before customer receipt confirmation"
    );
    proof["customer-receipt-required"] = true;
    await expectAppError(
      () =>
        refund.submitEvidence(
          merchantActor,
          context,
          approved.order.id,
          approvedRequest.value.publicId,
          {
            idempotencyKey: `${marker}-stale-evidence`,
            expectedVersion: 1,
            reference: "bank-transfer-stale"
          }
        ),
      { statusCode: 409, message: "error.order_refund_case.version_conflict" }
    );
    proof["stale-version-conflict"] = true;
    await expectAppError(
      () =>
        refund.merchantApprove(
          otherMerchantActor,
          context,
          approved.order.id,
          approvedRequest.value.publicId,
          { idempotencyKey: `${marker}-cross-shop`, expectedVersion: 2, note: "not our shop" }
        ),
      { statusCode: 404, message: "error.order_refund_case.not_found" }
    );
    proof["cross-shop-hidden"] = true;
    const evidence = await refund.submitEvidence(
      merchantActor,
      context,
      approved.order.id,
      approvedRequest.value.publicId,
      {
        idempotencyKey: `${marker}-approved-evidence`,
        expectedVersion: 2,
        reference: "bank-transfer-approved"
      }
    );
    assert(
      evidence.status === "customer_confirmation_pending",
      "merchant evidence did not wait for customer receipt confirmation"
    );
    const afterEvidenceOrder = await prisma.bookingOrder.findUniqueOrThrow({
      where: { id: approved.order.id }
    });
    const afterEvidenceFinancial = await prisma.orderFinancial.findUniqueOrThrow({
      where: { bookingOrderId: approved.order.id }
    });
    assert(
      afterEvidenceOrder.paymentStatus === "CONFIRMED" &&
        afterEvidenceOrder.paymentRefundedAt === null &&
        afterEvidenceOrder.paymentRefundedById === null &&
        afterEvidenceOrder.paymentRefundReference === null &&
        afterEvidenceOrder.paymentRefundReason === null &&
        afterEvidenceOrder.paymentReference === beforeEvidenceOrder.paymentReference &&
        afterEvidenceOrder.paymentConfirmedById === beforeEvidenceOrder.paymentConfirmedById &&
        afterEvidenceOrder.paymentConfirmedAt?.getTime() ===
          beforeEvidenceOrder.paymentConfirmedAt?.getTime() &&
        afterEvidenceOrder.paymentAmountJpy === beforeEvidenceOrder.paymentAmountJpy &&
        afterEvidenceFinancial.settlementStatus === "settled",
      "merchant evidence changed order payment or financial settlement before customer receipt"
    );
    const rewardBefore = await prisma.affiliateReward.findUniqueOrThrow({
      where: { id: approved.reward.id }
    });
    const walletBefore = await prisma.wallet.findUniqueOrThrow({
      where: { id: claimantWallet.id }
    });
    const settled = await refund.confirmCustomerReceipt(
      customerActor(customerA),
      context,
      approved.order.id,
      approvedRequest.value.publicId,
      { idempotencyKey: `${marker}-approved-receipt`, expectedVersion: 3 }
    );
    assert(settled.status === "refunded", "customer receipt confirmation did not complete refund");
    const afterReceiptOrder = await prisma.bookingOrder.findUniqueOrThrow({
      where: { id: approved.order.id }
    });
    const afterReceiptFinancial = await prisma.orderFinancial.findUniqueOrThrow({
      where: { bookingOrderId: approved.order.id }
    });
    assert(
      afterReceiptOrder.paymentStatus === "REFUNDED" &&
        afterReceiptOrder.paymentRefundedAt !== null &&
        afterReceiptOrder.paymentRefundedById === customerA.user.id &&
        afterReceiptOrder.paymentRefundReference === "bank-transfer-approved" &&
        afterReceiptOrder.paymentRefundReason === "service issue" &&
        afterReceiptFinancial.settlementStatus === "refunded",
      "customer receipt confirmation did not persist the expected order refund and financial settlement"
    );
    const rewardAfter = await prisma.affiliateReward.findUniqueOrThrow({
      where: { id: approved.reward.id }
    });
    const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: claimantWallet.id } });
    proof["affiliate-reward-preserved"] =
      JSON.stringify(rewardBefore) === JSON.stringify(rewardAfter);
    proof["claimant-wallet-preserved"] =
      JSON.stringify(walletBefore) === JSON.stringify(walletAfter);
    assert(
      proof["affiliate-reward-preserved"] && proof["claimant-wallet-preserved"],
      "completed-order refund changed an Affiliate reward or claimant wallet"
    );

    const rejected = await createCompletedOrder("customer-dispute", customerB);
    const rejectedRequest = await refund.request(customerActor(customerB), context, {
      orderId: rejected.order.id,
      idempotencyKey: `${marker}-reject-request`,
      expectedVersion: 0,
      reason: "refund requested"
    });
    const rejectedDecision = await refund.merchantReject(
      merchantActor,
      context,
      rejected.order.id,
      rejectedRequest.value.publicId,
      { idempotencyKey: `${marker}-reject-decision`, expectedVersion: 1, note: "shop denies" }
    );
    assert(
      rejectedDecision.status === "merchant_rejected" &&
        (await prisma.orderRefundDispute.count({
          where: { bookingOrderId: rejected.order.id, deletedAt: null }
        })) === 0,
      "merchant rejection silently created an operations dispute"
    );
    proof["merchant-rejected-without-operations"] = true;
    const customerComplaint = await refund.openComplaint(
      customerActor(customerB),
      context,
      rejected.order.id,
      rejectedRequest.value.publicId,
      {
        idempotencyKey: `${marker}-customer-complaint`,
        expectedVersion: 2,
        reason: "customer disputes rejection"
      }
    );
    assert(
      customerComplaint.dispute?.publicId,
      "customer complaint did not create an operations dispute"
    );
    const platformRefund = await refund.resolveDispute(
      operatorActor,
      context,
      customerComplaint.dispute.publicId,
      {
        idempotencyKey: `${marker}-platform-refund`,
        expectedVersion: 1,
        resolution: "refund",
        publicReason: "platform supports customer"
      }
    );
    assert(
      platformRefund.status === "refund_pending",
      "platform refund decision did not return case to payment evidence"
    );
    await refund.submitEvidence(
      merchantActor,
      context,
      rejected.order.id,
      rejectedRequest.value.publicId,
      {
        idempotencyKey: `${marker}-customer-dispute-evidence`,
        expectedVersion: 4,
        reference: "bank-transfer-dispute"
      }
    );
    const customerDisputeRefund = await refund.confirmCustomerReceipt(
      customerActor(customerB),
      context,
      rejected.order.id,
      rejectedRequest.value.publicId,
      { idempotencyKey: `${marker}-customer-dispute-receipt`, expectedVersion: 5 }
    );
    proof["customer-complaint-platform-refund"] = customerDisputeRefund.status === "refunded";

    const merchantDispute = await createCompletedOrder("merchant-dispute", customerC);
    const merchantDisputeRequest = await refund.request(customerActor(customerC), context, {
      orderId: merchantDispute.order.id,
      idempotencyKey: `${marker}-merchant-dispute-request`,
      expectedVersion: 0,
      reason: "refund requested"
    });
    await refund.merchantReject(
      merchantActor,
      context,
      merchantDispute.order.id,
      merchantDisputeRequest.value.publicId,
      {
        idempotencyKey: `${marker}-merchant-dispute-reject`,
        expectedVersion: 1,
        note: "shop disputes"
      }
    );
    const merchantComplaint = await refund.openComplaint(
      merchantActor,
      context,
      merchantDispute.order.id,
      merchantDisputeRequest.value.publicId,
      {
        idempotencyKey: `${marker}-merchant-complaint`,
        expectedVersion: 2,
        reason: "merchant asks for review"
      }
    );
    assert(merchantComplaint.dispute?.publicId, "merchant complaint did not create a dispute");
    const platformReject = await refund.resolveDispute(
      operatorActor,
      context,
      merchantComplaint.dispute.publicId,
      {
        idempotencyKey: `${marker}-platform-reject`,
        expectedVersion: 1,
        resolution: "reject",
        publicReason: "platform rejects refund"
      }
    );
    proof["merchant-complaint-platform-reject"] = platformReject.status === "dispute_rejected";

    const rewardTransactions = await prisma.affiliateRewardTransaction.findMany({
      where: { rewardId: { in: rewardIds }, deletedAt: null },
      select: { id: true, kind: true, ledgerTransactionId: true }
    });
    for (const transaction of rewardTransactions) {
      if (!rewardTransactionIds.includes(transaction.id)) rewardTransactionIds.push(transaction.id);
      if (!ledgerTransactionIds.includes(transaction.ledgerTransactionId)) {
        ledgerTransactionIds.push(transaction.ledgerTransactionId);
      }
    }
    const ledgerTransactions = await prisma.ledgerTransaction.findMany({
      where: {
        id: { in: rewardTransactions.map((transaction) => transaction.ledgerTransactionId) },
        deletedAt: null
      },
      select: { id: true, type: true }
    });
    for (const transaction of ledgerTransactions) {
      if (!ledgerTransactionIds.includes(transaction.id)) ledgerTransactionIds.push(transaction.id);
    }
    const reversalCount = ledgerTransactions.filter(
      (transaction) =>
        transaction.type === "AFFILIATE_REWARD_REVERSAL" ||
        transaction.type === "AFFILIATE_REWARD_RECOVERY"
    ).length;
    const recoveryCount = rewardTransactions.filter(
      (transaction) => transaction.kind === "REVERSAL" || transaction.kind === "RECOVERY"
    ).length;
    assert(
      reversalCount === 0 && recoveryCount === 0,
      "completed-order refund created Affiliate reversal or recovery transactions"
    );
    proof["no-affiliate-reversal-transactions"] = true;
    assert(
      Object.entries(proof)
        .filter(([key]) => key !== "database" && key !== "cleanup-complete")
        .every(([, value]) => value === true),
      "refund checker did not establish every business proof"
    );
  } finally {
    await prisma.$transaction(async (transaction) => {
      const caseIds = (
        await transaction.orderRefundCase.findMany({
          where: { bookingOrderId: { in: orderIds } },
          select: { id: true }
        })
      ).map((row) => row.id);
      const disputeIds = (
        await transaction.orderRefundDispute.findMany({
          where: { orderRefundCaseId: { in: caseIds } },
          select: { id: true }
        })
      ).map((row) => row.id);
      await transaction.orderRefundDisputeRevision.deleteMany({
        where: { orderRefundDisputeId: { in: disputeIds } }
      });
      await transaction.orderRefundDispute.deleteMany({ where: { id: { in: disputeIds } } });
      await transaction.orderRefundCaseEvent.deleteMany({
        where: { bookingOrderId: { in: orderIds } }
      });
      await transaction.orderRefundCase.deleteMany({ where: { id: { in: caseIds } } });
      await transaction.notification.deleteMany({
        where: { recipientUserId: { in: userIds }, title: { startsWith: "order_refund." } }
      });
      await transaction.auditLog.deleteMany({
        where: { actorId: { in: userIds }, action: { startsWith: "order_refund." } }
      });
      const capturedRewardTransactions = await transaction.affiliateRewardTransaction.findMany({
        where: { rewardId: { in: rewardIds } },
        select: { id: true, ledgerTransactionId: true }
      });
      for (const rewardTransaction of capturedRewardTransactions) {
        if (!rewardTransactionIds.includes(rewardTransaction.id)) {
          rewardTransactionIds.push(rewardTransaction.id);
        }
        if (!ledgerTransactionIds.includes(rewardTransaction.ledgerTransactionId)) {
          ledgerTransactionIds.push(rewardTransaction.ledgerTransactionId);
        }
      }
      await transaction.affiliateRewardTransaction.deleteMany({
        where: { id: { in: rewardTransactionIds } }
      });
      await transaction.affiliateReward.deleteMany({ where: { id: { in: rewardIds } } });
      await transaction.affiliateAttribution.deleteMany({ where: { id: { in: attributionIds } } });
      await transaction.ledgerTransaction.deleteMany({
        where: { id: { in: ledgerTransactionIds } }
      });
      await transaction.orderFinancial.deleteMany({ where: { bookingOrderId: { in: orderIds } } });
      await transaction.bookingOrder.deleteMany({ where: { id: { in: orderIds } } });
      await transaction.affiliateClaim.deleteMany({ where: { id: { in: claimIds } } });
      await transaction.affiliateTaskService.deleteMany({ where: { taskId: { in: taskIds } } });
      await transaction.affiliateTaskShop.deleteMany({ where: { taskId: { in: taskIds } } });
      await transaction.affiliateTask.deleteMany({ where: { id: { in: taskIds } } });
      await transaction.scheduleSlot.deleteMany({ where: { id: { in: slotIds } } });
      await transaction.service.deleteMany({ where: { id: { in: serviceIds } } });
      await transaction.wallet.deleteMany({ where: { id: { in: walletIds } } });
      await transaction.merchantIdentityProfile.deleteMany({
        where: { identityId: { in: extraIdentityIds } }
      });
      await transaction.publicIdentifier.deleteMany({
        where: { userIdentityId: { in: extraIdentityIds } }
      });
      await transaction.userIdentity.deleteMany({ where: { id: { in: extraIdentityIds } } });
      await transaction.shop.deleteMany({ where: { id: { in: shopIds } } });
      await transaction.category.deleteMany({ where: { id: { in: categoryIds } } });
      await deleteFormalTestUserFoundations(transaction, userIds);
      await transaction.user.deleteMany({ where: { id: { in: userIds } } });
    });
    const [cases, disputes, events, orders, rewards, transactions, wallets] = await Promise.all([
      prisma.orderRefundCase.count({ where: { bookingOrderId: { in: orderIds } } }),
      prisma.orderRefundDispute.count({ where: { bookingOrderId: { in: orderIds } } }),
      prisma.orderRefundCaseEvent.count({ where: { bookingOrderId: { in: orderIds } } }),
      prisma.bookingOrder.count({ where: { id: { in: orderIds } } }),
      prisma.affiliateReward.count({ where: { id: { in: rewardIds } } }),
      prisma.ledgerTransaction.count({ where: { id: { in: ledgerTransactionIds } } }),
      prisma.wallet.count({ where: { id: { in: walletIds } } })
    ]);
    assert(
      cases + disputes + events + orders + rewards + transactions + wallets === 0,
      "refund checker cleanup left marker-owned rows behind"
    );
    proof["cleanup-complete"] = true;
    await disconnectPrisma();
  }
  console.log(JSON.stringify(proof));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
