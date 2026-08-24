import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  assert(process.env.NODE_ENV !== "production", "payment check cannot use NODE_ENV=production");
  assert(process.env.DEPLOY_ENV !== "prod", "payment check cannot use DEPLOY_ENV=prod");
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    databaseUrl.hostname === "localhost" || databaseUrl.hostname === "127.0.0.1",
    "payment check only accepts a local MySQL host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");

  const [{ AuthRepository }, { BackofficeRepository }, { BookingRepository }, { prisma, disconnectPrisma }] =
    await Promise.all([
      import("../src/repositories/auth.repository"),
      import("../src/repositories/backoffice.repository"),
      import("../src/repositories/booking.repository"),
      import("../src/prisma/client")
    ]);
  const marker = `${Date.now()}-${process.pid}`;
  const passwordHash = await hash("PaymentFlow.2026!", 12);
  const createdUserIds: number[] = [];
  const createdOrderIds: number[] = [];
  const createdSlotIds: number[] = [];
  const createdAvailabilityIds: number[] = [];
  let shopId: number | null = null;
  let serviceId: number | null = null;

  try {
    const category = await prisma.category.findFirst({
      where: { isActive: true, deletedAt: null },
      orderBy: { id: "asc" }
    });
    assert(category, "at least one active category must be seeded");

    const authRepository = new AuthRepository(prisma);
    const backofficeRepository = new BackofficeRepository(prisma);
    const bookingRepository = new BookingRepository(prisma);
    const shop = await backofficeRepository.createShop({
      ownerEmail: `payment-owner-${marker}@needo.test`,
      ownerUsername: `Payment Owner ${marker}`,
      ownerPasswordHash: passwordHash,
      name: `Payment Flow Shop ${marker}`,
      city: "Tokyo",
      address: "Integration 3-3"
    });
    shopId = shop.id;
    assert(shop.ownerUserId, "shop owner user was not created");
    createdUserIds.push(shop.ownerUserId);
    await backofficeRepository.approveShop(shop.id, new Date());

    const technicianAccount = await authRepository.registerUser({
      accountType: "technician",
      city: "Tokyo",
      email: `payment-technician-${marker}@needo.test`,
      ip: "127.0.0.1",
      passwordHash,
      username: `Payment Technician ${marker}`
    });
    const customerAccount = await authRepository.registerUser({
      accountType: "customer",
      email: `payment-customer-${marker}@needo.test`,
      ip: "127.0.0.1",
      passwordHash,
      username: `Payment Customer ${marker}`
    });
    createdUserIds.push(technicianAccount.id, customerAccount.id);
    const technicianProfile = await prisma.technicianProfile.findUnique({
      where: { userId: technicianAccount.id }
    });
    assert(technicianProfile, "technician profile was not created");
    await backofficeRepository.updateTechnician({
      scope: "platform",
      technicianId: technicianProfile.id,
      shopId: shop.id
    });
    await backofficeRepository.approveTechnician({
      scope: "platform",
      technicianId: technicianProfile.id,
      shopId: shop.id,
      approvedAt: new Date()
    });

    const service = await backofficeRepository.createService({
      scope: "platform",
      shopId: shop.id,
      categoryId: category.id,
      name: `Payment Service ${marker}`,
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: 8800,
      durationMinutes: 60,
      status: "published"
    });
    serviceId = service.id;
    const startsAt = new Date("2026-10-15T01:00:00.000Z");
    const scheduleResult = await bookingRepository.createScheduleSlot({
      scope: "merchant",
      shopId: shop.id,
      serviceId: service.id,
      technicianProfileId: technicianProfile.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      capacity: 1
    });
    assert(scheduleResult.outcome === "ok", "formal payment slot could not be created");
    createdSlotIds.push(scheduleResult.slot.id);
    const slotRecord = await prisma.scheduleSlot.findUnique({
      where: { id: scheduleResult.slot.id },
      select: { availabilityId: true }
    });
    if (slotRecord?.availabilityId) createdAvailabilityIds.push(slotRecord.availabilityId);

    const booking = await bookingRepository.createBooking({
      customerUserId: customerAccount.id,
      serviceId: service.id,
      scheduleSlotId: scheduleResult.slot.id,
      fulfillmentMode: "store",
      paymentMethod: "bank_transfer"
    });
    assert(booking, "formal payment booking could not be created");
    createdOrderIds.push(booking.id);
    const confirmedOrder = await bookingRepository.transitionOrder({
      id: booking.id,
      actorUserId: shop.ownerUserId,
      fromStatus: "pending",
      toStatus: "confirmed"
    });
    assert(confirmedOrder?.status === "confirmed", "booking confirmation failed");

    const confirmationInput = {
      scope: "merchant" as const,
      shopId: shop.id,
      orderId: booking.id,
      actorUserId: shop.ownerUserId,
      method: "bank_transfer" as const,
      amountJpy: 8800,
      reference: `BANK-${marker}`,
      note: "local integration confirmation"
    };
    const payment = await bookingRepository.confirmManualPayment(confirmationInput);
    assert(payment.outcome === "ok" && payment.applied, "manual payment was not applied");
    assert(payment.order.paymentStatus === "confirmed", "payment did not become confirmed");
    const retry = await bookingRepository.confirmManualPayment(confirmationInput);
    assert(retry.outcome === "ok" && !retry.applied, "identical payment retry was not idempotent");
    const wrongAmount = await bookingRepository.confirmManualPayment({
      ...confirmationInput,
      amountJpy: 8700
    });
    assert(wrongAmount.outcome === "amount_mismatch", "wrong payment amount was accepted");
    const wrongShop = await bookingRepository.confirmManualPayment({
      ...confirmationInput,
      shopId: shop.id + 999999
    });
    assert(wrongShop.outcome === "not_found", "cross-shop payment access was not hidden");

    const cancelled = await bookingRepository.transitionOrder({
      id: booking.id,
      actorUserId: shop.ownerUserId,
      fromStatus: "confirmed",
      toStatus: "cancelled",
      reason: "integration refund"
    });
    assert(cancelled?.paymentStatus === "refundPending", "cancelled paid order did not request refund");
    const refundInput = {
      scope: "backoffice" as const,
      orderId: booking.id,
      actorUserId: shop.ownerUserId,
      reason: "integration refund",
      reference: `REF-${marker}`
    };
    const refunded = await bookingRepository.refundManualPayment(refundInput);
    assert(refunded.outcome === "ok" && refunded.applied, "manual refund was not applied");
    assert(refunded.order.paymentStatus === "refunded", "payment did not become refunded");
    const refundRetry = await bookingRepository.refundManualPayment(refundInput);
    assert(refundRetry.outcome === "ok" && !refundRetry.applied, "refund retry was not idempotent");

    const financial = await prisma.orderFinancial.findUnique({
      where: { bookingOrderId: booking.id }
    });
    assert(financial?.offlineReportedServiceAmountJpy === 8800, "offline income was not synchronized");
    assert(financial.settlementStatus === "refunded", "refund was not reflected in order finance");

    console.log(JSON.stringify({
      database: databaseName,
      payment: { confirmed: true, idempotentRetry: true, wrongAmountRejected: true, crossShopHidden: true },
      cancellation: { refundPending: true, refunded: true, idempotentRetry: true },
      finance: { offlineIncomeSynchronized: true, refundTimelineSynchronized: true },
      status: "ok"
    }, null, 2));
  } finally {
    if (createdUserIds.length > 0 || createdOrderIds.length > 0 || shopId) {
      await prisma.$transaction(async (transaction) => {
        if (createdOrderIds.length > 0) {
          await transaction.orderFinancial.deleteMany({ where: { bookingOrderId: { in: createdOrderIds } } });
          await transaction.orderStatusHistory.deleteMany({ where: { bookingOrderId: { in: createdOrderIds } } });
          await transaction.bookingOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
        }
        if (createdSlotIds.length > 0) {
          await transaction.scheduleSlot.deleteMany({ where: { id: { in: createdSlotIds } } });
        }
        if (createdAvailabilityIds.length > 0) {
          await transaction.availability.deleteMany({ where: { id: { in: createdAvailabilityIds } } });
        }
        if (serviceId) await transaction.service.deleteMany({ where: { id: serviceId } });
        await transaction.auditLog.deleteMany({ where: { targetType: "User", targetId: { in: createdUserIds } } });
        await transaction.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.userIdentity.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.customerProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.technicianProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
        if (shopId) await transaction.shop.deleteMany({ where: { id: shopId } });
        await transaction.user.deleteMany({ where: { id: { in: createdUserIds } } });
      });
    }
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
