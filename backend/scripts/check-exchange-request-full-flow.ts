import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { requireSafeExchangeClaimFlowEnvironment } from "./support/exchange-claim-flow-safety";
import { createExchangeBookingFixture, ownerAccess } from "./check-exchange-booking-conversion-flow";

class Rollback extends Error {}

async function main() {
  const target = requireSafeExchangeClaimFlowEnvironment(process.env.ENV_FILE);
  assert.match(target.databaseName, /^needo_request_full_test_[a-f0-9]{12}$/u);
  process.env.ENV_FILE = target.envFile;
  const [
    { prisma, disconnectPrisma },
    { ExchangePostRepository },
    { ExchangeService },
    { ExchangeRequestFeeRepository },
    { ExchangeRequestFeeService },
    { LedgerRepository },
    { LedgerService },
    { ExchangeClaimRepository },
    { ExchangeClaimService },
    { ExchangeMatchingRepository },
    { ExchangeMatchingService },
    { ExchangeBookingConversionRepository },
    { ExchangeBookingConversionService },
    { AuditLogService },
    { AuditLogRepository },
    { FeeRuleRepository },
    { FeeCalculationService },
    { PlatformFeePolicyRepository },
    { PlatformFeePolicyService },
    { NdpExchangeRateRepository },
    { NdpExchangeRateService },
    { BookingRepository },
    { BookingService },
    { publishExchangePostSchema }
  ] = await Promise.all([
    import("../src/prisma/client"),
    import("../src/repositories/exchange.repository"),
    import("../src/services/exchange.service"),
    import("../src/repositories/exchange-request-fee.repository"),
    import("../src/services/exchange-request-fee.service"),
    import("../src/repositories/ledger.repository"),
    import("../src/services/ledger.service"),
    import("../src/repositories/exchange-claim.repository"),
    import("../src/services/exchange-claim.service"),
    import("../src/repositories/exchange-matching.repository"),
    import("../src/services/exchange-matching.service"),
    import("../src/repositories/exchange-booking-conversion.repository"),
    import("../src/services/exchange-booking-conversion.service"),
    import("../src/services/audit-log.service"),
    import("../src/repositories/audit-log.repository"),
    import("../src/repositories/fee-rule.repository"),
    import("../src/services/fee-calculation.service"),
    import("../src/repositories/platform-fee-policy.repository"),
    import("../src/services/platform-fee-policy.service"),
    import("../src/repositories/ndp-exchange-rate.repository"),
    import("../src/services/ndp-exchange-rate.service"),
    import("../src/repositories/booking.repository"),
    import("../src/services/booking.service"),
    import("../src/validators/exchange.validators")
  ]);
  const marker = `request-full-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const paymentMode = process.env.REQUEST_FULL_PAYMENT_MODE ?? "cash";
  assert(["cash", "ndp"].includes(paymentMode));
  const context = { ip: "127.0.0.1", userAgent: marker };
  let report: Record<string, unknown> | null = null;
  try {
    const database = await prisma.$queryRaw<Array<{ name: string }>>`SELECT DATABASE() AS name`;
    assert.equal(database[0]?.name, target.databaseName);
    await prisma.$transaction(async (tx) => {
      const fixture = await createExchangeBookingFixture(tx, marker);
      const initialWallet = await tx.wallet.findUniqueOrThrow({ where: { id: fixture.walletId } });
      // Let the fresh fixture complete a future service during this rollback-only check.
      await tx.platformSettingVersion.updateMany({ where: { activeKey: "active" }, data: {
        anytimeServiceTestEnabled: true
      } });
      const customerProfile = await tx.customerProfile.create({ data: {
        userId: fixture.ownerUserId, displayName: marker, city: "Tokyo", membershipLevel: "standard"
      } });
      await tx.userIdentity.update({ where: { id: fixture.ownerIdentityId }, data: {
        scopeType: "customer_profile", scopeId: customerProfile.id
      } });
      const customer = {
        ...ownerAccess(fixture),
        currentIdentityScopeType: "customer_profile",
        currentIdentityScopeId: customerProfile.id
      };
      const shopNumber = String(fixture.shopId).padStart(10, "0");
      await tx.publicIdentifier.create({ data: {
        shopId: fixture.shopId, publicId: `shop${shopNumber}`,
        numberPart: shopNumber, kind: "SHOP", status: "ACTIVE"
      } });
      const now = new Date();
      const startsAt = new Date(Math.ceil((now.getTime() + 8 * 3_600_000) / 1_800_000) * 1_800_000);
      const endsAt = new Date(startsAt.getTime() + 3_600_000);
      const expiresAt = new Date(startsAt.getTime() - 3_600_000);
      const providers = [];
      for (let i = 0; i < 2; i++) {
        const profileId = fixture.technicianProfileIds[i];
        const user = await tx.technicianProfile.update({
          where: { id: profileId }, data: { verifiedAt: now },
          include: { user: true }
        });
        const identity = await tx.userIdentity.findUniqueOrThrow({
          where: { id: fixture.providerIdentityIds[i] }, include: { publicIdentifier: true }
        });
        await tx.technicianWorkState.create({ data: {
          technicianProfileId: profileId, shopId: fixture.shopId,
          status: i === 0 ? "on_duty" : "off_duty"
        } });
        const availability = await tx.availability.create({ data: {
          shopId: fixture.shopId, technicianProfileId: profileId,
          startsAt, endsAt, isScheduleControlWindow: true
        } });
        const slot = await tx.scheduleSlot.create({ data: {
          shopId: fixture.shopId, technicianProfileId: profileId,
          availabilityId: availability.id, serviceId: fixture.serviceId,
          startsAt, endsAt, capacity: 1, status: "AVAILABLE"
        } });
        providers.push({
          profileId, slotId: slot.id,
          actor: {
            userId: user.userId, email: user.user.email,
            accessTokenJti: marker, accessTokenExpiresAt: 0,
            currentIdentityId: identity.id,
            currentPublicId: identity.publicIdentifier!.publicId,
            currentIdentityType: "technician",
            currentIdentityScopeType: "technician_profile",
            currentIdentityScopeId: profileId,
            roles: ["technician"], permissions: ["exchange:claims:create"]
          }
        });
      }
      const audit = new AuditLogService(new AuditLogRepository(tx));
      const feeCalculation = new FeeCalculationService(new FeeRuleRepository(tx));
      const platformFeePolicy = new PlatformFeePolicyService(new PlatformFeePolicyRepository(tx), audit);
      const ledger = new LedgerService(new LedgerRepository(tx), feeCalculation, undefined, undefined, platformFeePolicy);
      // A newly migrated empty database may activate the publication fee after the current instant.
      await tx.platformFeeRuleSet.updateMany({ where: { familyCode: "exchange_request_publication" }, data: {
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z")
      } });
      await tx.platformFeeRule.updateMany({ where: { ruleSet: { familyCode: "exchange_request_publication" } }, data: {
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z")
      } });
      const feeProbe = new ExchangeRequestFeeService(new ExchangeRequestFeeRepository(tx));
      const publicationFee = await feeProbe.resolveCurrent(now);
      const exchange = new ExchangeService(
        new ExchangePostRepository(tx), () => now, undefined,
        new ExchangeRequestFeeService(new ExchangeRequestFeeRepository(tx)), ledger
      );
      const input = publishExchangePostSchema.parse({
        type: "demand", title: `${marker} Request`, detail: "Full local flow",
        contentLocale: "ja", serviceStartAt: startsAt, serviceEndAt: endsAt,
        expiresAt, serviceMode: "store", targetProviderCount: 1,
        matchMode: "selective", budgetMode: "total",
        budgetMinJpy: 12_000, budgetMaxJpy: 12_000,
        addressLine1: "東京都渋谷区"
      });
      assert.equal(input.type, "demand");
      const published = await exchange.publish(customer, input, `${marker}:publish`);
      const postId = published.id;
      const financial = await tx.exchangeRequestFinancial.findUnique({ where: { exchangePostId: postId } });
      assert.equal(financial?.state, "HELD");
      console.log(JSON.stringify({ step: "published", postId, financialState: financial.state }));

      const claims = new ExchangeClaimService(new ExchangeClaimRepository(tx), new ExchangePostRepository(tx));
      const createdClaims = [];
      for (const [i, provider] of providers.entries()) {
        const options = await claims.listOptions(provider.actor, postId, { page: 1, page_size: 20 });
        assert(options.list.some((option) => option.scheduleSlotId === provider.slotId));
        const claim = await claims.createClaim(provider.actor, postId, {
          scheduleSlotId: provider.slotId, quoteAmountJpy: 12_000,
          message: i === 0 ? "online manual application" : "offline manual application"
        }, `${marker}:manual-claim:${i}`, context);
        createdClaims.push(claim);
      }
      const withdrawn = await claims.withdrawClaim(
        providers[0].actor, createdClaims[0].id, `${marker}:withdraw`, context
      );
      assert.equal(withdrawn.status, "withdrawn");
      assert.equal(await claims.getMine(providers[0].actor, postId), null);
      const visibleAfterWithdrawal = await claims.listReceived(customer, postId, { page: 1, page_size: 20 });
      assert.equal(visibleAfterWithdrawal.total, 1);
      assert(visibleAfterWithdrawal.list.every((claim) => claim.id !== withdrawn.id));
      const availableAgain = await claims.listOptions(providers[0].actor, postId, { page: 1, page_size: 20 });
      assert(availableAgain.list.some((option) => option.scheduleSlotId === providers[0].slotId));
      createdClaims[0] = await claims.createClaim(providers[0].actor, postId, {
        scheduleSlotId: providers[0].slotId, quoteAmountJpy: 12_000,
        message: "online manual reapplication"
      }, `${marker}:manual-reclaim`, context);
      assert.notEqual(createdClaims[0].id, withdrawn.id);
      console.log(JSON.stringify({ step: "withdrawn-hidden-and-reapplied", withdrawn: withdrawn.id, replacement: createdClaims[0].id }));
      const persistedClaims = await tx.exchangeClaim.findMany({ where: { exchangePostId: postId } });
      assert.equal(persistedClaims.length, 3);
      assert.equal(persistedClaims.filter((claim) => claim.status === "ACTIVE").length, 2);
      assert.equal(persistedClaims.filter((claim) => claim.status === "WITHDRAWN").length, 1);
      const offlineState = await tx.technicianWorkState.findUniqueOrThrow({ where: {
        technicianProfileId_shopId: { technicianProfileId: providers[1].profileId, shopId: fixture.shopId }
      } });
      assert.equal(offlineState.status, "off_duty");
      console.log(JSON.stringify({ step: "manual-claims", postId, online: createdClaims[0].id, offline: createdClaims[1].id }));

      const open = await tx.exchangeRequestMatching.findUniqueOrThrow({ where: { exchangePostId: postId } });
      const selected = await new ExchangeMatchingService(new ExchangeMatchingRepository(tx)).selectMatching(
        customer, postId,
        { selectedClaimIds: [createdClaims[1].id], expectedVersion: open.version,
          budgetConfirmation: null, targetConfirmation: null },
        `${marker}:select`, context
      );
      assert.equal(selected.status, "matched");
      const [chosenClaim, unchosenClaim] = await Promise.all([
        tx.exchangeClaim.findUniqueOrThrow({ where: { id: createdClaims[1].id } }),
        tx.exchangeClaim.findUniqueOrThrow({ where: { id: createdClaims[0].id } })
      ]);
      assert.equal(chosenClaim.status, "MATCHED");
      assert.notEqual(unchosenClaim.status, "MATCHED");
      let orderSequence = 7200;
      const conversion = new ExchangeBookingConversionService(
        new ExchangeBookingConversionRepository(tx, () => ++orderSequence),
        audit,
        { invalidateCancelledBooking: async () => undefined } as never,
        { assertServiceEkyc: async () => undefined } as never,
        undefined, () => now
      );
      const converted = await conversion.createBookings(
        customer, postId, { expectedVersion: selected.version }, `${marker}:convert`, context
      );
      assert.equal(converted.orders.length, 1);
      const orderId = converted.orders[0].orderId;
      const rate = new NdpExchangeRateService(new NdpExchangeRateRepository(tx), audit);
      const booking = new BookingService(new BookingRepository(tx), ledger, undefined, audit, undefined, rate);
      const confirmed = await booking.transitionOrder(providers[1].actor, orderId, "confirm");
      assert.equal(confirmed.status, "confirmed");
      console.log(JSON.stringify({ step: "confirmed", orderId, orderStatus: confirmed.status }));
      await tx.technicianWorkState.updateMany({ where: {
        technicianProfileId: providers[1].profileId, shopId: fixture.shopId
      }, data: { status: "on_duty", syncedAt: new Date() } });

      const started = await booking.startService(customer, orderId, {
        actor: "customer", idempotencyKey: `${marker}:start`
      }, context);
      assert.equal(started.status, "inService");
      const ended = await booking.endService(customer, orderId, {
        reason: "completed", idempotencyKey: `${marker}:end`
      }, context);
      assert.equal(ended.status, "awaitingCheckout");
      console.log(JSON.stringify({ step: "service-ended", orderId, orderStatus: ended.status }));

      const checkout = await booking.getCheckout(customer, orderId);
      const selectedPayment = await booking.selectCheckoutPaymentMethod(customer, orderId, {
        method: paymentMode as "cash" | "ndp", idempotencyKey: `${marker}:${paymentMode}-select`
      }, context);
      assert.equal(selectedPayment.status, paymentMode === "cash" ? "awaitingPaymentConfirmation" : "awaitingCheckout");
      const completedCheckout = paymentMode === "cash"
        ? await booking.confirmCheckoutReceipt(providers[1].actor, orderId, {
          reason: "cash received", idempotencyKey: `${marker}:cash-receipt`
        }, context)
        : await booking.payCheckoutWithNdp(customer, orderId, {
          idempotencyKey: `${marker}:ndp-payment`
        }, context);
      assert.equal(completedCheckout.status, "completed");
      if (paymentMode === "ndp") {
        const replay = await booking.payCheckoutWithNdp(customer, orderId, {
          idempotencyKey: `${marker}:ndp-payment`
        }, context);
        assert.equal(replay.id, completedCheckout.id);
      }
      const paidOrder = await tx.bookingOrder.findUniqueOrThrow({ where: { id: orderId } });
      assert.equal(paidOrder.status, "COMPLETED");
      assert.equal(paidOrder.paymentStatus, "CONFIRMED");
      const [checkoutRow, orderFinancial, requestFinancial, wallet, histories] = await Promise.all([
        tx.orderCheckout.findUniqueOrThrow({ where: { bookingOrderId: orderId } }),
        tx.orderFinancial.findUnique({ where: { bookingOrderId: orderId } }),
        tx.exchangeRequestFinancial.findUniqueOrThrow({ where: { exchangePostId: postId } }),
        tx.wallet.findUniqueOrThrow({ where: { id: fixture.walletId } }),
        tx.orderStatusHistory.findMany({ where: { bookingOrderId: orderId }, orderBy: { id: "asc" } })
      ]);
      assert.equal(checkoutRow.paymentMethod, paymentMode.toUpperCase());
      assert.equal(requestFinancial.state, "HELD");
      assert.equal(orderFinancial?.paymentChannel, paymentMode === "cash" ? "offline_cash" : "platform_test_ndp");
      assert.equal(orderFinancial?.serviceIncomeStatus, "confirmed");
      if (paymentMode === "cash") {
        assert.equal(wallet.availableBalance, initialWallet.availableBalance - publicationFee.amountNdp);
        assert.equal(checkoutRow.ledgerTransactionId, null);
      } else {
        assert(checkoutRow.ledgerTransactionId !== null);
        assert(checkout.payableNdp > 0);
        assert.equal(wallet.availableBalance,
          initialWallet.availableBalance - publicationFee.amountNdp - checkout.payableNdp);
        const debit = await tx.ledgerTransaction.findUniqueOrThrow({
          where: { id: checkoutRow.ledgerTransactionId }
        });
        assert.equal(debit.amount, checkout.payableNdp);
        assert.equal(debit.referenceType, "order_checkout_payment");
        assert.equal(debit.referenceId, checkout.id);
        assert.equal(debit.currency, "TEST_NDP");
      }
      assert.equal(wallet.frozenBalance, initialWallet.frozenBalance + publicationFee.amountNdp);
      assert.deepEqual(histories.map((history) => `${history.fromStatus}->${history.toStatus}`), [
        "null->PENDING", "PENDING->CONFIRMED", "CONFIRMED->IN_SERVICE",
        "IN_SERVICE->AWAITING_CHECKOUT",
        ...(paymentMode === "cash" ? ["AWAITING_CHECKOUT->AWAITING_PAYMENT_CONFIRMATION",
          "AWAITING_PAYMENT_CONFIRMATION->COMPLETED"] : ["AWAITING_CHECKOUT->COMPLETED"])
      ]);
      console.log(JSON.stringify({ step: "paid", orderId, checkoutId: checkout.id,
        orderStatus: paidOrder.status, paymentStatus: paidOrder.paymentStatus,
        checkoutMethod: checkoutRow.paymentMethod, ledgerTransactionId: checkoutRow.ledgerTransactionId,
        payableNdp: checkout.payableNdp, requestFeeState: requestFinancial.state,
        orderFinancial: orderFinancial ? {
          paymentChannel: orderFinancial.paymentChannel,
          serviceIncomeStatus: orderFinancial.serviceIncomeStatus,
          cRequestFeeActualNdp: orderFinancial.cRequestFeeActualNdp,
          bPlatformFeeActualNdp: orderFinancial.bPlatformFeeActualNdp
        } : null,
        wallet: { available: wallet.availableBalance, frozen: wallet.frozenBalance },
        histories: histories.map((history) => `${history.fromStatus}->${history.toStatus}`)
      }));

      const customerReview = await booking.createOrderReview(customer, orderId, {
        targetType: "technician", rating: 5, tags: [],
        comment: "服务完成", idempotencyKey: `${marker}:customer-review`
      }, context);
      const technicianReview = await booking.createOrderReview(providers[1].actor, orderId, {
        targetType: "customer", rating: 5, tags: [],
        comment: "服务完成", idempotencyKey: `${marker}:technician-review`
      }, context);
      assert(customerReview.applied && technicianReview.applied);
      const reviews = await tx.orderReview.findMany({ where: { bookingOrderId: orderId } });
      assert.equal(reviews.length, 2);
      assert.deepEqual(new Set(reviews.map((review) => review.reviewerUserId)),
        new Set([fixture.ownerUserId, providers[1].actor.userId]));
      console.log(JSON.stringify({ step: "reviewed", orderId, reviewCount: reviews.length }));

      report = { database: target.databaseName, requestPublished: true,
        manualOnlineClaim: true, manualOfflineClaim: true, matchedOfflineClaim: true,
        orderConfirmed: true, serviceStarted: true, serviceEnded: true,
        paymentMode, paymentConfirmed: true, orderCompleted: true, bothReviewsSubmitted: true,
        publicationFeeHeld: true };

      throw new Rollback();
    }, { maxWait: 10_000, timeout: 120_000 });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  } finally {
    await disconnectPrisma();
  }
  assert(report, "full flow did not reach its final assertion");
  const { prisma: verifier, disconnectPrisma: disconnectVerifier } = await import("../src/prisma/client");
  try {
    assert.equal(await verifier.user.count({ where: { email: { contains: marker } } }), 0);
    assert.equal(await verifier.exchangePost.count({ where: { title: { contains: marker } } }), 0);
  } finally {
    await disconnectVerifier();
  }
  console.log(JSON.stringify({ ...report, rollbackVerified: true }));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
