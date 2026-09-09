import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import type { PrismaClient } from "@prisma/client";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../src/services/auth.service";
import type { PayRunPayload } from "../src/services/payroll.service";

export const FIXTURE_MARKER = "qa-multishop-pricing-settlement-20260909";

type Environment = Record<string, string | undefined>;

export function validatePersistentMultishopEnvironment(environment: Environment): void {
  if (!environment.FORMAL_BACKEND_ENV_FILE?.trim()) {
    throw new Error("FORMAL_BACKEND_ENV_FILE is required");
  }
  if (
    /^(?:prod|production|staging)$/i.test(environment.NODE_ENV?.trim() ?? "") ||
    /^(?:prod|production|staging)$/i.test(environment.DEPLOY_ENV?.trim() ?? "")
  ) {
    throw new Error("Persistent multishop checker refuses a production environment");
  }
  const rawUrl = environment.DATABASE_URL?.trim();
  if (!rawUrl) throw new Error("DATABASE_URL is required");
  const target = new URL(rawUrl);
  if (target.protocol !== "mysql:") throw new Error("DATABASE_URL must use MySQL");
  const host = target.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("DATABASE_URL must use a loopback MySQL host");
  }
  const databaseName = decodeURIComponent(target.pathname.replace(/^\/+/, ""));
  if (
    !/(?:dev|test|local)/i.test(databaseName) ||
    /(?:prod(?:uction)?|staging|live)/i.test(databaseName)
  ) {
    throw new Error("DATABASE_URL must name a local development or test database");
  }
}

function loadEnvironment(environment: Environment): Record<string, string> {
  const requested = environment.FORMAL_BACKEND_ENV_FILE?.trim();
  if (!requested) throw new Error("FORMAL_BACKEND_ENV_FILE is required");
  const path = resolve(requested);
  if (!existsSync(path)) throw new Error("FORMAL_BACKEND_ENV_FILE does not exist");
  const values = { ...environment, ...parse(readFileSync(path, "utf8")) } as Record<string, string>;
  validatePersistentMultishopEnvironment({ ...values, FORMAL_BACKEND_ENV_FILE: path });
  return values;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Multishop settlement assertion failed: ${message}`);
}

const context: AuthRequestContext = {
  ip: "127.0.0.1",
  userAgent: "needo-local-multishop-settlement-checker"
};

type ShopFixture = {
  id: number;
  publicId: string;
  name: string;
  pricingMode: "MERCHANT" | "TECHNICIAN";
  commissionRateBps: number;
};

type CaseFixture = {
  key: string;
  shop: ShopFixture;
  payment: "ndp" | "cash";
  serviceId: number | null;
  technicianServiceId: number | null;
  serviceName: string;
  priceJpy: number;
};

type Fixture = {
  customerUserId: number;
  customerProfileId: number;
  technicianUserId: number;
  technicianProfileId: number;
  operatorUserId: number;
  technicianPublicId: string;
  pausedTechnicianUserId: number;
  pausedTechnicianProfileId: number;
  pausedTechnicianPublicId: string;
  shops: ShopFixture[];
  cases: CaseFixture[];
};

async function ensureUser(
  prisma: PrismaClient,
  input: { email: string; needoId: string; accountNo: string; username: string }
) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    assert(existing.isTestAccount, `${input.email} is not marker-owned test data`);
    return existing;
  }
  const collision = await prisma.user.findFirst({
    where: { OR: [{ needoId: input.needoId }, { accountNo: input.accountNo }] }
  });
  assert(!collision, `${input.needoId} is already allocated`);
  return prisma.user.create({
    data: {
      ...input,
      primaryIdentityType: "U",
      emailVerifiedAt: new Date(),
      isActive: true,
      isTestAccount: true
    }
  });
}

async function ensureIdentity(
  prisma: PrismaClient,
  input: {
    userId: number;
    type: "customer" | "technician";
    scopeType: "customer_profile" | "technician_profile";
    scopeId: number;
    displayName: string;
    publicId: string;
    numberPart: string;
    kind: "U" | "S";
  }
) {
  const existing = await prisma.userIdentity.findFirst({
    where: { userId: input.userId, type: input.type, deletedAt: null },
    include: { publicIdentifier: true }
  });
  const identity =
    existing ??
    (await prisma.userIdentity.create({
      data: {
        userId: input.userId,
        type: input.type,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        displayName: input.displayName,
        isDefault: true,
        isActive: true
      },
      include: { publicIdentifier: true }
    }));
  if (!identity.publicIdentifier) {
    await prisma.publicIdentifier.create({
      data: {
        publicId: input.publicId,
        numberPart: input.numberPart,
        kind: input.kind,
        userIdentityId: identity.id,
        loginAllowed: true,
        searchable: true,
        status: "ACTIVE"
      }
    });
  } else {
    assert(
      identity.publicIdentifier.publicId === input.publicId,
      `${input.type} public ID drifted`
    );
  }
  return identity;
}

async function ensureShop(
  prisma: PrismaClient,
  input: {
    operatorUserId: number;
    suffix: string;
    numberPart: string;
    pricingMode: "MERCHANT" | "TECHNICIAN";
    commissionRateBps: number;
    location: {
      countryCode: string;
      admin1RegionId: number;
      admin2RegionId: number;
      datasetVersion: string;
    };
  }
): Promise<ShopFixture> {
  const name = `${FIXTURE_MARKER}-${input.suffix}`;
  const existing = await prisma.shop.findFirst({ where: { name, deletedAt: null } });
  const shop =
    existing ??
    (await prisma.shop.create({
      data: {
        ownerUserId: input.operatorUserId,
        createdById: input.operatorUserId,
        name,
        city: "Tokyo",
        address: "Local QA retained fixture",
        status: "published",
        pricingMode: input.pricingMode,
        technicianPricingRatePercent: 100
      }
    }));
  assert(shop.pricingMode === input.pricingMode, `${name} pricing mode drifted`);
  const publicId = `shop${input.numberPart}`;
  const identifier = await prisma.publicIdentifier.findUnique({ where: { shopId: shop.id } });
  if (!identifier) {
    await prisma.publicIdentifier.create({
      data: {
        publicId,
        numberPart: input.numberPart,
        kind: "SHOP",
        shopId: shop.id,
        loginAllowed: false,
        searchable: true,
        status: "ACTIVE"
      }
    });
  } else {
    assert(identifier.publicId === publicId, `${name} public ID drifted`);
  }
  await prisma.shopServiceLocation.upsert({
    where: { shopId: shop.id },
    create: {
      shopId: shop.id,
      ...input.location,
      verifiedAt: new Date(),
      verifiedById: input.operatorUserId
    },
    update: { deletedAt: null }
  });
  return {
    id: shop.id,
    publicId,
    name,
    pricingMode: input.pricingMode,
    commissionRateBps: input.commissionRateBps
  };
}

async function ensureFoundation(prisma: PrismaClient): Promise<Fixture> {
  const customer = await ensureUser(prisma, {
    email: `${FIXTURE_MARKER}-customer@example.invalid`,
    needoId: "u9090909001",
    accountNo: "9090909001",
    username: "QA Multi-shop Customer"
  });
  const technician = await ensureUser(prisma, {
    email: `${FIXTURE_MARKER}-technician@example.invalid`,
    needoId: "u9090909002",
    accountNo: "9090909002",
    username: "QA Multi-shop Technician"
  });
  const operator = await ensureUser(prisma, {
    email: `${FIXTURE_MARKER}-operator@example.invalid`,
    needoId: "u9090909003",
    accountNo: "9090909003",
    username: "QA Multi-shop Operator"
  });
  const pausedTechnician = await ensureUser(prisma, {
    email: `${FIXTURE_MARKER}-paused-technician@example.invalid`,
    needoId: "u9090909004",
    accountNo: "9090909004",
    username: "QA Zero-shop Technician"
  });
  const customerProfile = await prisma.customerProfile.upsert({
    where: { userId: customer.id },
    create: { userId: customer.id, displayName: "QA Multi-shop Customer", city: "Tokyo" },
    update: { deletedAt: null }
  });
  const technicianProfile = await prisma.technicianProfile.upsert({
    where: { userId: technician.id },
    create: {
      userId: technician.id,
      displayName: "QA Multi-shop Technician",
      city: "Tokyo",
      status: "published",
      employmentType: "INDEPENDENT"
    },
    update: { deletedAt: null, status: "published" }
  });
  const pausedTechnicianProfile = await prisma.technicianProfile.upsert({
    where: { userId: pausedTechnician.id },
    create: {
      userId: pausedTechnician.id,
      displayName: "QA Zero-shop Technician",
      city: "Tokyo",
      status: "published",
      employmentType: "INDEPENDENT"
    },
    update: { deletedAt: null, status: "published" }
  });
  await ensureIdentity(prisma, {
    userId: customer.id,
    type: "customer",
    scopeType: "customer_profile",
    scopeId: customerProfile.id,
    displayName: customerProfile.displayName,
    publicId: "u9090909001",
    numberPart: "9090909001",
    kind: "U"
  });
  await ensureIdentity(prisma, {
    userId: technician.id,
    type: "technician",
    scopeType: "technician_profile",
    scopeId: technicianProfile.id,
    displayName: technicianProfile.displayName,
    publicId: "s9090909002",
    numberPart: "9090909002",
    kind: "S"
  });
  await ensureIdentity(prisma, {
    userId: pausedTechnician.id,
    type: "technician",
    scopeType: "technician_profile",
    scopeId: pausedTechnicianProfile.id,
    displayName: pausedTechnicianProfile.displayName,
    publicId: "s9090909004",
    numberPart: "9090909004",
    kind: "S"
  });
  const location = await prisma.shopServiceLocation.findFirst({
    where: { deletedAt: null, countryCode: "JP" },
    select: {
      countryCode: true,
      admin1RegionId: true,
      admin2RegionId: true,
      datasetVersion: true
    }
  });
  assert(location, "a verified local shop service location is required");
  const shops = await Promise.all([
    ensureShop(prisma, {
      operatorUserId: operator.id,
      suffix: "merchant",
      numberPart: "9090909101",
      pricingMode: "MERCHANT",
      commissionRateBps: 6000,
      location
    }),
    ensureShop(prisma, {
      operatorUserId: operator.id,
      suffix: "technician-a",
      numberPart: "9090909102",
      pricingMode: "TECHNICIAN",
      commissionRateBps: 5500,
      location
    }),
    ensureShop(prisma, {
      operatorUserId: operator.id,
      suffix: "technician-b",
      numberPart: "9090909103",
      pricingMode: "TECHNICIAN",
      commissionRateBps: 6500,
      location
    })
  ]);
  await prisma.technicianProfile.update({
    where: { id: technicianProfile.id },
    data: { shopId: shops[0]!.id }
  });
  for (const shop of shops) {
    const activeKey = `technician:${technicianProfile.id}:shop:${shop.id}`;
    const affiliation = await prisma.technicianShopAffiliation.findFirst({
      where: { technicianProfileId: technicianProfile.id, shopId: shop.id, activeKey }
    });
    if (!affiliation) {
      await prisma.technicianShopAffiliation.create({
        data: {
          technicianProfileId: technicianProfile.id,
          shopId: shop.id,
          relationshipType: "PARTNER",
          workStatus: "ACTIVE",
          startsAt: new Date("2026-09-01T00:00:00.000Z"),
          activeKey,
          createdById: operator.id,
          updatedById: operator.id
        }
      });
    }
    const compensationName = `${FIXTURE_MARKER}-${shop.id}`;
    const compensation = await prisma.technicianCompensationProfile.findFirst({
      where: {
        shopId: shop.id,
        technicianProfileId: technicianProfile.id,
        name: compensationName,
        deletedAt: null
      }
    });
    if (!compensation) {
      await prisma.technicianCompensationProfile.create({
        data: {
          shopId: shop.id,
          technicianProfileId: technicianProfile.id,
          name: compensationName,
          status: "active",
          version: 1,
          wageMode: "commission",
          commissionRateBps: shop.commissionRateBps,
          extensionCommissionRateBps: shop.commissionRateBps,
          effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
          createdById: operator.id,
          updatedById: operator.id
        }
      });
    } else {
      assert(
        compensation.commissionRateBps === shop.commissionRateBps,
        `${shop.name} compensation rate drifted`
      );
    }
  }
  const category = await prisma.category.upsert({
    where: { code: `${FIXTURE_MARKER}-category` },
    create: { code: `${FIXTURE_MARKER}-category`, name: "QA multi-shop settlement" },
    update: { deletedAt: null }
  });
  const caseDefinitions = [
    {
      key: "merchant-ndp",
      shop: shops[0]!,
      payment: "ndp" as const,
      name: `${FIXTURE_MARKER}-store-service-ndp`,
      priceJpy: 8800
    },
    {
      key: "merchant-cash",
      shop: shops[0]!,
      payment: "cash" as const,
      name: `${FIXTURE_MARKER}-store-service-cash`,
      priceJpy: 12000
    },
    {
      key: "technician-ndp",
      shop: shops[1]!,
      payment: "ndp" as const,
      name: `${FIXTURE_MARKER}-technician-service-ndp`,
      priceJpy: 9900
    },
    {
      key: "technician-cash",
      shop: shops[2]!,
      payment: "cash" as const,
      name: `${FIXTURE_MARKER}-technician-service-cash`,
      priceJpy: 15000
    }
  ];
  const cases: CaseFixture[] = [];
  for (const definition of caseDefinitions) {
    if (definition.shop.pricingMode === "MERCHANT") {
      const existing = await prisma.service.findFirst({
        where: { shopId: definition.shop.id, name: definition.name, deletedAt: null }
      });
      const service =
        existing ??
        (await prisma.service.create({
          data: {
            categoryId: category.id,
            shopId: definition.shop.id,
            name: definition.name,
            city: "Tokyo",
            priceAmount: definition.priceJpy,
            durationMinutes: 60,
            status: "published"
          }
        }));
      assert(
        Number(service.priceAmount) === definition.priceJpy,
        `${definition.key} price drifted`
      );
      cases.push({
        ...definition,
        serviceName: definition.name,
        serviceId: service.id,
        technicianServiceId: null
      });
    } else {
      const existing = await prisma.technicianService.findFirst({
        where: {
          shopId: definition.shop.id,
          technicianId: technicianProfile.id,
          name: definition.name,
          deletedAt: null
        }
      });
      const service =
        existing ??
        (await prisma.technicianService.create({
          data: {
            shopId: definition.shop.id,
            technicianId: technicianProfile.id,
            name: definition.name,
            categoryId: category.id,
            priceAmount: definition.priceJpy,
            durationMinutes: 60,
            isActive: true,
            isBookable: true,
            reviewStatus: "APPROVED",
            createdBy: technician.id,
            updatedBy: technician.id
          }
        }));
      assert(service.priceAmount === definition.priceJpy, `${definition.key} price drifted`);
      cases.push({
        ...definition,
        serviceName: definition.name,
        serviceId: null,
        technicianServiceId: service.id
      });
    }
  }
  return {
    customerUserId: customer.id,
    customerProfileId: customerProfile.id,
    technicianUserId: technician.id,
    technicianProfileId: technicianProfile.id,
    operatorUserId: operator.id,
    technicianPublicId: "s9090909002",
    pausedTechnicianUserId: pausedTechnician.id,
    pausedTechnicianProfileId: pausedTechnicianProfile.id,
    pausedTechnicianPublicId: "s9090909004",
    shops,
    cases
  };
}

function actor(input: {
  userId: number;
  identityType: string;
  scopeType: string;
  scopeId: number;
}): AuthenticatedAccessContext {
  return {
    userId: input.userId,
    email: `${FIXTURE_MARKER}@example.invalid`,
    accessTokenJti: FIXTURE_MARKER,
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    roles: [input.identityType],
    permissions: [],
    currentIdentityType: input.identityType,
    currentIdentityScopeType: input.scopeType,
    currentIdentityScopeId: input.scopeId
  };
}

async function ensureSlot(
  prisma: PrismaClient,
  fixture: Fixture,
  item: CaseFixture,
  index: number
) {
  const existing = await prisma.scheduleSlot.findFirst({
    where: {
      shopId: item.shop.id,
      technicianProfileId: fixture.technicianProfileId,
      serviceId: item.serviceId,
      technicianServiceId: item.technicianServiceId,
      deletedAt: null
    },
    orderBy: { id: "asc" }
  });
  if (existing) return existing;
  const startsAt = new Date(Date.UTC(2099, 0, 2, index * 2, 0, 0));
  return prisma.scheduleSlot.create({
    data: {
      shopId: item.shop.id,
      technicianProfileId: fixture.technicianProfileId,
      serviceId: item.serviceId,
      technicianServiceId: item.technicianServiceId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
      capacity: 1,
      bookedCount: 0,
      status: "AVAILABLE"
    }
  });
}

async function runOrders(prisma: PrismaClient, fixture: Fixture) {
  const [
    { BookingRepository },
    { BookingService },
    { LedgerRepository },
    { LedgerService },
    { AuditLogRepository },
    { AuditLogService },
    { NdpExchangeRateRepository },
    { NdpExchangeRateService },
    { OrderFinanceRepository },
    { OrderFinanceService },
    { serviceIncomeReportBodySchema }
  ] = await Promise.all([
    import("../src/repositories/booking.repository"),
    import("../src/services/booking.service"),
    import("../src/repositories/ledger.repository"),
    import("../src/services/ledger.service"),
    import("../src/repositories/audit-log.repository"),
    import("../src/services/audit-log.service"),
    import("../src/repositories/ndp-exchange-rate.repository"),
    import("../src/services/ndp-exchange-rate.service"),
    import("../src/repositories/order-finance.repository"),
    import("../src/services/order-finance.service"),
    import("../src/validators/order-finance.validator")
  ]);
  const audit = new AuditLogService(new AuditLogRepository(prisma));
  const ledger = new LedgerService(new LedgerRepository(prisma));
  const rate = new NdpExchangeRateService(new NdpExchangeRateRepository(prisma), audit);
  const booking = new BookingService(
    new BookingRepository(prisma),
    ledger,
    undefined,
    audit,
    undefined,
    rate,
    () => new Date()
  );
  const finance = new OrderFinanceService(new OrderFinanceRepository(prisma), audit);
  const customerActor = actor({
    userId: fixture.customerUserId,
    identityType: "customer",
    scopeType: "customer_profile",
    scopeId: fixture.customerProfileId
  });
  const technicianActor = actor({
    userId: fixture.technicianUserId,
    identityType: "technician",
    scopeType: "technician_profile",
    scopeId: fixture.technicianProfileId
  });
  const completed = [];
  const existingCompletedNdp = await prisma.bookingOrder.count({
    where: {
      customerUserId: fixture.customerUserId,
      note: { startsWith: FIXTURE_MARKER },
      paymentMethod: "NDP",
      paymentStatus: "CONFIRMED",
      deletedAt: null
    }
  });
  if (existingCompletedNdp === 0) {
    await prisma.wallet.upsert({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "USER",
          ownerId: fixture.customerUserId,
          currency: "TEST_NDP"
        }
      },
      create: {
        ownerType: "USER",
        ownerId: fixture.customerUserId,
        currency: "TEST_NDP",
        availableBalance: 1_000_000
      },
      update: { availableBalance: 1_000_000, frozenBalance: 0 }
    });
  }
  const effectiveRate = await prisma.ndpExchangeRateRule.findFirst({
    where: { status: "ACTIVE", deletedAt: null },
    orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }]
  });
  assert(effectiveRate, "an active local NDP exchange rate is required");

  for (const [index, item] of fixture.cases.entries()) {
    const note = `${FIXTURE_MARKER}:${item.key}`;
    let order = await prisma.bookingOrder.findFirst({ where: { note, deletedAt: null } });
    if (!order) {
      const slot = await ensureSlot(prisma, fixture, item, index + 1);
      const created = await booking.createBooking(customerActor, {
        scheduleSlotId: slot.id,
        ...(item.serviceId ? { serviceId: item.serviceId } : {}),
        ...(item.technicianServiceId ? { technicianServiceId: item.technicianServiceId } : {}),
        expectedPriceAmountJpy: item.priceJpy,
        fulfillmentMode: "store",
        paymentMethod: "onsite",
        note
      });
      assert(created.serviceName === item.serviceName, `${item.key} displayed service mismatch`);
      assert(Number(created.priceAmount) === item.priceJpy, `${item.key} displayed price mismatch`);
      assert(
        created.pricingModeSnapshot === item.shop.pricingMode.toLowerCase(),
        `${item.key} pricing mode snapshot mismatch`
      );
      assert(
        created.serviceOwnerType === (item.serviceId ? "shop" : "technician"),
        `${item.key} serviceOwnerType mismatch`
      );
      const now = new Date(Date.now() - (fixture.cases.length - index) * 60_000);
      order = await prisma.bookingOrder.update({
        where: { id: created.id },
        data: { status: "CONFIRMED", startsAt: now, endsAt: new Date(now.getTime() + 60 * 60_000) }
      });
      await prisma.orderStatusHistory.create({
        data: {
          bookingOrderId: order.id,
          fromStatus: "PENDING",
          toStatus: "CONFIRMED",
          actorUserId: fixture.technicianUserId,
          reason: `${FIXTURE_MARKER}:confirmed`
        }
      });
      const snapshot = created.serviceSnapshot as Record<string, unknown> | null;
      const compensationBasisVersion =
        typeof snapshot?.compensationBasisVersion === "string"
          ? snapshot.compensationBasisVersion
          : null;
      assert(
        compensationBasisVersion?.startsWith("technician_override:"),
        `${item.key} compensation basis missing`
      );
      await prisma.orderFinancial.create({
        data: {
          bookingOrderId: order.id,
          customerUserId: fixture.customerUserId,
          shopId: item.shop.id,
          technicianProfileId: fixture.technicianProfileId,
          serviceAmountJpy: item.priceJpy,
          baseServiceAmountJpy: item.priceJpy,
          extensionAmountJpy: 0,
          nominationChargeAmountJpy: 0,
          wasTechnicianNominated: false,
          compensationBasisVersion,
          ndpCurrency: "TEST_NDP",
          platformFeeEnabledSnapshot: false
        }
      });
    }
    assert(order.shopId === item.shop.id, `${item.key} shop snapshot drifted`);
    assert(
      order.technicianProfileId === fixture.technicianProfileId,
      `${item.key} technician snapshot drifted`
    );
    assert(
      order.serviceNameSnapshot === item.serviceName,
      `${item.key} stored service name drifted`
    );
    assert(Number(order.priceAmount) === item.priceJpy, `${item.key} stored price drifted`);
    assert(
      order.pricingModeSnapshot === item.shop.pricingMode,
      `${item.key} stored pricing mode drifted`
    );
    assert(
      order.serviceOwnerType === (item.serviceId ? "SHOP" : "TECHNICIAN"),
      `${item.key} stored service owner drifted`
    );
    if (order.status !== "COMPLETED") {
      await booking.startService(
        customerActor,
        order.id,
        {
          actor: "customer",
          idempotencyKey: `${note}:start`
        },
        context
      );
      await booking.endService(
        customerActor,
        order.id,
        {
          reason: "completed",
          idempotencyKey: `${note}:end`
        },
        context
      );
      await booking.getCheckout(customerActor, order.id);
      await booking.selectCheckoutPaymentMethod(
        customerActor,
        order.id,
        {
          method: item.payment,
          idempotencyKey: `${note}:select-payment`
        },
        context
      );
      if (item.payment === "ndp") {
        await booking.payCheckoutWithNdp(
          customerActor,
          order.id,
          {
            idempotencyKey: `${note}:test-ndp-payment`
          },
          context
        );
      } else {
        await booking.confirmCheckoutReceipt(
          technicianActor,
          order.id,
          {
            reason: `${FIXTURE_MARKER}:cash-received`,
            idempotencyKey: `${note}:cash-receipt`
          },
          context
        );
      }
      order = await prisma.bookingOrder.findUniqueOrThrow({ where: { id: order.id } });
    }
    const financial = await prisma.orderFinancial.findUniqueOrThrow({
      where: { bookingOrderId: order.id }
    });
    if (
      financial.serviceIncomeStatus !== "confirmed" ||
      !["ready_for_payroll", "payroll_approved"].includes(financial.settlementStatus)
    ) {
      const merchantActor = actor({
        userId: fixture.operatorUserId,
        identityType: "merchant",
        scopeType: "shop",
        scopeId: item.shop.id
      });
      await finance.reportMerchantServiceIncome(
        merchantActor,
        context,
        order.id,
        serviceIncomeReportBodySchema.parse({
          serviceAmountJpy: item.priceJpy,
          baseServiceAmountJpy: item.priceJpy,
          extensionAmountJpy: 0,
          nominationChargeAmountJpy: 0,
          wasTechnicianNominated: false,
          platformCollectedServiceAmountJpy: item.payment === "ndp" ? item.priceJpy : 0,
          offlineReportedServiceAmountJpy: item.payment === "cash" ? item.priceJpy : 0,
          paymentChannel: item.payment === "ndp" ? "platform_online" : "offline_cash",
          confirmNow: true,
          note
        })
      );
    }
    const merchantActor = actor({
      userId: fixture.operatorUserId,
      identityType: "merchant",
      scopeType: "shop",
      scopeId: item.shop.id
    });
    const platformActor = actor({
      userId: fixture.operatorUserId,
      identityType: "platform",
      scopeType: "global",
      scopeId: fixture.operatorUserId
    });
    const [merchantView, operationsView, checkout] = await Promise.all([
      finance.getMerchantOrderFinance(merchantActor, context, order.id),
      finance.getBackofficeOrderFinance(platformActor, context, order.id),
      prisma.orderCheckout.findUniqueOrThrow({ where: { bookingOrderId: order.id } })
    ]);
    const ledgerPayment = await prisma.ledgerTransaction.findFirst({
      where: {
        referenceType: "order_checkout_payment",
        referenceId: checkout.id,
        deletedAt: null
      },
      include: { entries: true }
    });
    assert(
      JSON.stringify(merchantView) === JSON.stringify(operationsView),
      `${item.key} merchant and operations finance views diverged`
    );
    assert(merchantView.serviceIncomeStatus === "confirmed", `${item.key} income not confirmed`);
    assert(
      merchantView.paymentChannel === (item.payment === "ndp" ? "platform_online" : "offline_cash"),
      `${item.key} payment channel mismatch`
    );
    assert(merchantView.technicianIncomePreview, `${item.key} technicianIncomePreview missing`);
    const expectedTechnician = Math.round((item.priceJpy * item.shop.commissionRateBps) / 10_000);
    assert(
      merchantView.technicianIncomePreview.technicianNetIncomeJpy === expectedTechnician,
      `${item.key} technician split mismatch`
    );
    assert(
      merchantView.technicianIncomePreview.shopEstimatedGrossProfitJpy ===
        item.priceJpy - expectedTechnician,
      `${item.key} shop split mismatch: expected ${item.priceJpy - expectedTechnician}, received ${merchantView.technicianIncomePreview.shopEstimatedGrossProfitJpy}`
    );
    if (item.payment === "ndp") {
      assert(
        checkout.ledgerTransactionId && ledgerPayment?.currency === "TEST_NDP",
        `${item.key} TEST_NDP ledger evidence missing`
      );
      assert(
        ledgerPayment.entries.some((entry) => entry.direction === "AVAILABLE_DEBIT"),
        `${item.key} TEST_NDP debit entry missing`
      );
    } else {
      assert(
        checkout.receiptConfirmedAt && checkout.ledgerTransactionId === null && !ledgerPayment,
        `${item.key} offline cash evidence invalid`
      );
    }
    completed.push({
      id: order.id,
      orderNo: order.orderNo,
      key: item.key,
      shopId: item.shop.id,
      serviceName: order.serviceNameSnapshot,
      pricingMode: item.shop.pricingMode.toLowerCase(),
      serviceOwnerType: order.serviceOwnerType.toLowerCase(),
      payment: item.payment === "ndp" ? "TEST_NDP" : "offline_cash",
      priceJpy: item.priceJpy,
      technicianIncomeJpy: expectedTechnician,
      shopIncomeJpy: item.priceJpy - expectedTechnician
    });
  }
  return { completed, finance };
}

async function verifyNavigation(prisma: PrismaClient, fixture: Fixture): Promise<void> {
  const [
    { PricingModeRepository },
    { PricingModeService },
    { AuditLogRepository },
    { AuditLogService }
  ] = await Promise.all([
    import("../src/repositories/pricing-mode.repository"),
    import("../src/services/pricing-mode.service"),
    import("../src/repositories/audit-log.repository"),
    import("../src/services/audit-log.service")
  ]);
  const pricing = new PricingModeService(
    new PricingModeRepository(prisma),
    new AuditLogService(new AuditLogRepository(prisma))
  );
  for (const shop of fixture.shops) {
    const navigation = await pricing.getBookingNavigation(shop.id, { page: 1, pageSize: 100 });
    if (shop.pricingMode === "MERCHANT") {
      assert(navigation.entry === "service_menu", `${shop.name} did not open store services`);
      const names = navigation.services?.list.map((service) => service.name) ?? [];
      assert(
        fixture.cases
          .filter((item) => item.shop.id === shop.id)
          .every((item) => names.includes(item.serviceName)),
        `${shop.name} store services missing`
      );
    } else {
      assert(navigation.entry === "technician_list", `${shop.name} did not open technicians`);
      assert(
        navigation.technicians?.list.some((item) => item.id === fixture.technicianProfileId),
        `${shop.name} technician missing`
      );
      const services = await pricing.listPublicTechnicianServices(
        shop.id,
        fixture.technicianProfileId,
        { page: 1, pageSize: 100 }
      );
      assert(
        fixture.cases
          .filter((item) => item.shop.id === shop.id)
          .every((item) => services.list.some((service) => service.name === item.serviceName)),
        `${shop.name} technician services missing`
      );
    }
  }
}

async function ensurePayroll(prisma: PrismaClient, fixture: Fixture, orderIds: number[]) {
  const [{ PayrollRepository }, { PayrollService }, { AuditLogRepository }, { AuditLogService }] =
    await Promise.all([
      import("../src/repositories/payroll.repository"),
      import("../src/services/payroll.service"),
      import("../src/repositories/audit-log.repository"),
      import("../src/services/audit-log.service")
    ]);
  const payroll = new PayrollService(
    new PayrollRepository(prisma),
    new AuditLogService(new AuditLogRepository(prisma))
  );
  const orders = await prisma.bookingOrder.findMany({ where: { id: { in: orderIds } } });
  const first = Math.min(...orders.map((order) => order.startsAt.getTime())) - 60_000;
  const last = Math.max(...orders.map((order) => order.endsAt.getTime())) + 60_000;
  const periodStart = new Date(first);
  const periodEnd = new Date(last);
  const technicianActor = actor({
    userId: fixture.technicianUserId,
    identityType: "technician",
    scopeType: "technician_profile",
    scopeId: fixture.technicianProfileId
  });
  const payRuns: PayRunPayload[] = [];
  for (const shop of fixture.shops) {
    const merchantActor = actor({
      userId: fixture.operatorUserId,
      identityType: "merchant",
      scopeType: "shop",
      scopeId: shop.id
    });
    let stored = await prisma.payRun.findFirst({
      where: { shopId: shop.id, periodStart, periodEnd, deletedAt: null },
      orderBy: { id: "asc" }
    });
    let payRun = stored
      ? await payroll.getMerchantPayRun(merchantActor, context, stored.id)
      : await payroll.generateMerchantPayRun(merchantActor, context, {
          shopId: shop.id,
          periodStart,
          periodEnd,
          manualLines: []
        });
    if (stored && payRun.payslips.length === 0) {
      await prisma.payRun.update({ where: { id: stored.id }, data: { status: "reviewing" } });
      payRun = await payroll.recalculateMerchantPayRun(merchantActor, context, stored.id);
    }
    if (payRun.status === "draft" || payRun.status === "reviewing") {
      payRun = await payroll.publishMerchantPayRun(merchantActor, context, payRun.id);
    }
    if (payRun.status === "published") {
      for (const payslip of payRun.payslips) {
        await payroll.confirmTechnicianPayslip(technicianActor, context, payslip.id);
      }
      payRun = await payroll.getMerchantPayRun(merchantActor, context, payRun.id);
    }
    if (payRun.status === "confirmed") {
      payRun = await payroll.approveMerchantPayRun(merchantActor, context, payRun.id);
    }
    assert(payRun.status === "approved", `${shop.name} pay run is not approved: ${payRun.status}`);
    assert(
      payRun.payslips.length === 1 && payRun.payslips[0]!.commissionJpy > 0,
      `${shop.name} technician commission payslip missing`
    );
    payRuns.push(payRun);
    stored = await prisma.payRun.findUnique({ where: { id: payRun.id } });
    assert(stored?.deletedAt === null, `${shop.name} pay run was not retained`);
  }
  const page = { page: 1, pageSize: 100 };
  const [technicianView, operationsView] = await Promise.all([
    payroll.listTechnicianPayslips(technicianActor, context, page),
    payroll.listBackofficePayRuns(
      actor({
        userId: fixture.operatorUserId,
        identityType: "platform",
        scopeType: "global",
        scopeId: fixture.operatorUserId
      }),
      context,
      { ...page, from: periodStart, to: periodEnd }
    )
  ]);
  assert(
    payRuns.every((payRun) => operationsView.list.some((item) => item.id === payRun.id)),
    "operations pay-run view is missing a fixture shop"
  );
  assert(
    payRuns.every((payRun) => technicianView.list.some((item) => item.payRunId === payRun.id)),
    "technician payslip view is missing a fixture shop"
  );
  for (const shop of fixture.shops) {
    const merchantView = await payroll.listMerchantPayRuns(
      actor({
        userId: fixture.operatorUserId,
        identityType: "merchant",
        scopeType: "shop",
        scopeId: shop.id
      }),
      context,
      page
    );
    assert(
      merchantView.list.some((item) => payRuns.some((payRun) => payRun.id === item.id)),
      `${shop.name} merchant pay-run view missing`
    );
  }
  return payRuns.map((payRun) => ({
    id: payRun.id,
    shopId: payRun.shopId,
    status: payRun.status,
    commissionJpy: payRun.totalCommissionJpy,
    netPayJpy: payRun.totalNetPayJpy
  }));
}

export async function runPersistentMultishopPricingSettlementCheck(): Promise<void> {
  const values = loadEnvironment(process.env);
  Object.entries(values).forEach(([name, value]) => {
    process.env[name] = value;
  });
  process.env.AUTH_TOKEN_AUDIENCE ||= "needo-backend";
  const { prisma } = await import("../src/prisma/client");
  try {
    const fixture = await ensureFoundation(prisma);
    assert(fixture.shops.length === 3, "technician must be affiliated with three shops");
    const affiliations = await prisma.technicianShopAffiliation.findMany({
      where: {
        technicianProfileId: fixture.technicianProfileId,
        workStatus: "ACTIVE",
        deletedAt: null,
        shopId: { in: fixture.shops.map((shop) => shop.id) }
      }
    });
    assert(
      affiliations.length === 3 && affiliations.every((row) => row.relationshipType === "PARTNER"),
      "three active partner affiliations were not retained"
    );
    const { TechnicianProfileRepository } =
      await import("../src/repositories/technician-profile.repository");
    const selfProfile = await new TechnicianProfileRepository(prisma).findMine(
      fixture.technicianUserId,
      fixture.technicianProfileId
    );
    assert(selfProfile?.shopAccessStatus === "active", "technician shop access is not active");
    assert(selfProfile.shopAffiliations.length === 3, "self profile did not expose three shops");
    assert(
      selfProfile.shopAffiliations[0]?.shopId === fixture.shops[0]!.id,
      "initial shop was not returned first"
    );
    const pausedSelfProfile = await new TechnicianProfileRepository(prisma).findMine(
      fixture.pausedTechnicianUserId,
      fixture.pausedTechnicianProfileId
    );
    assert(
      pausedSelfProfile?.shopAccessStatus === "requires_shop" &&
        pausedSelfProfile.shopAffiliations.length === 0,
      "zero-shop technician identity was not retained in paused state"
    );
    await verifyNavigation(prisma, fixture);
    const { completed } = await runOrders(prisma, fixture);
    const payRuns = await ensurePayroll(
      prisma,
      fixture,
      completed.map((order) => order.id)
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          marker: FIXTURE_MARKER,
          retained: true,
      technician: { id: fixture.technicianProfileId, publicId: fixture.technicianPublicId },
      pausedTechnician: {
        id: fixture.pausedTechnicianProfileId,
        publicId: fixture.pausedTechnicianPublicId,
        shopAccessStatus: pausedSelfProfile.shopAccessStatus
      },
          shops: fixture.shops.map(({ id, publicId, name, pricingMode, commissionRateBps }) => ({
            id,
            publicId,
            name,
            pricingMode: pricingMode.toLowerCase(),
            commissionRateBps
          })),
          orders: completed,
          payRuns
        },
        null,
        2
      )}\n`
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  runPersistentMultishopPricingSettlementCheck().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
