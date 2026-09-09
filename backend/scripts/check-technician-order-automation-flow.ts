import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import type { PrismaClient } from "@prisma/client";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../src/services/auth.service";

export const AUTOMATION_FIXTURE_MARKER = "qa-technician-order-automation-20260909";
const MULTISHOP_MARKER = "qa-multishop-pricing-settlement-20260909";

type Environment = Record<string, string | undefined>;

export function validateTechnicianAutomationEnvironment(environment: Environment): void {
  if (!environment.FORMAL_BACKEND_ENV_FILE?.trim()) {
    throw new Error("FORMAL_BACKEND_ENV_FILE is required");
  }
  if (/^(?:prod|production|staging)$/i.test(environment.NODE_ENV?.trim() ?? "") ||
      /^(?:prod|production|staging)$/i.test(environment.DEPLOY_ENV?.trim() ?? "")) {
    throw new Error("Technician automation checker refuses a production environment");
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
  if (!/(?:dev|test|local)/i.test(databaseName) || /(?:prod(?:uction)?|staging|live)/i.test(databaseName)) {
    throw new Error("DATABASE_URL must name a local development or test database");
  }
}

function loadEnvironment(environment: Environment): Record<string, string> {
  const requested = environment.FORMAL_BACKEND_ENV_FILE?.trim();
  if (!requested) throw new Error("FORMAL_BACKEND_ENV_FILE is required");
  const path = resolve(requested);
  if (!existsSync(path)) throw new Error("FORMAL_BACKEND_ENV_FILE does not exist");
  const values = { ...environment, ...parse(readFileSync(path, "utf8")) } as Record<string, string>;
  validateTechnicianAutomationEnvironment({ ...values, FORMAL_BACKEND_ENV_FILE: path });
  return values;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Technician automation assertion failed: ${message}`);
}

const requestContext: AuthRequestContext = {
  ip: "127.0.0.1",
  userAgent: "needo-local-technician-automation-checker"
};

function access(input: {
  userId: number;
  identityId: number;
  publicId: string;
  profileId: number;
}): AuthenticatedAccessContext {
  return {
    userId: input.userId,
    email: `${AUTOMATION_FIXTURE_MARKER}@example.invalid`,
    accessTokenJti: AUTOMATION_FIXTURE_MARKER,
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    roles: ["technician"],
    permissions: ["technician:automation-settings:read", "technician:automation-settings:write"],
    currentIdentityId: input.identityId,
    currentPublicId: input.publicId,
    currentIdentityType: "technician",
    currentIdentityScopeType: "technician_profile",
    currentIdentityScopeId: input.profileId
  };
}

async function ensureAutomationCustomer(
  prisma: PrismaClient,
  input: { suffix: string; numberPart: string }
) {
  const email = `${AUTOMATION_FIXTURE_MARKER}-${input.suffix}@example.invalid`;
  const publicId = `u${input.numberPart}`;
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const collision = await prisma.user.findFirst({
      where: { OR: [{ needoId: publicId }, { accountNo: input.numberPart }] }
    });
    assert(!collision, `${publicId} is already allocated`);
    user = await prisma.user.create({
      data: {
        email,
        needoId: publicId,
        accountNo: input.numberPart,
        username: `QA automation ${input.suffix}`,
        primaryIdentityType: "U",
        emailVerifiedAt: new Date(),
        isActive: true,
        isTestAccount: true
      }
    });
  }
  assert(user.isTestAccount, `${email} is not marker-owned test data`);
  const profile = await prisma.customerProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, displayName: `QA automation ${input.suffix}`, city: "Tokyo" },
    update: { deletedAt: null }
  });
  let identity = await prisma.userIdentity.findFirst({
    where: { userId: user.id, type: "customer", deletedAt: null },
    include: { publicIdentifier: true }
  });
  identity ??= await prisma.userIdentity.create({
    data: {
      userId: user.id,
      type: "customer",
      scopeType: "customer_profile",
      scopeId: profile.id,
      displayName: profile.displayName,
      isDefault: true,
      isActive: true
    },
    include: { publicIdentifier: true }
  });
  if (!identity.publicIdentifier) {
    await prisma.publicIdentifier.create({
      data: {
        publicId,
        numberPart: input.numberPart,
        kind: "U",
        userIdentityId: identity.id,
        loginAllowed: true,
        searchable: true,
        status: "ACTIVE"
      }
    });
    identity = await prisma.userIdentity.findUniqueOrThrow({
      where: { id: identity.id },
      include: { publicIdentifier: true }
    });
  }
  assert(identity.publicIdentifier?.publicId === publicId, `${publicId} identity drifted`);
  return { user, profile, identity };
}

function customerAccess(input: {
  user: { id: number; email: string | null };
  profile: { id: number };
  identity: { id: number; publicIdentifier: { publicId: string } | null };
}): AuthenticatedAccessContext {
  assert(input.identity.publicIdentifier, "customer public identifier missing");
  return {
    userId: input.user.id,
    email: input.user.email ?? `${AUTOMATION_FIXTURE_MARKER}@example.invalid`,
    accessTokenJti: AUTOMATION_FIXTURE_MARKER,
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    roles: ["customer"],
    permissions: [],
    currentIdentityId: input.identity.id,
    currentPublicId: input.identity.publicIdentifier.publicId,
    currentIdentityType: "customer",
    currentIdentityScopeType: "customer_profile",
    currentIdentityScopeId: input.profile.id
  };
}

async function loadFoundation(prisma: PrismaClient) {
  const [customer, technician, pausedTechnician, shop, successService, mismatchService] = await Promise.all([
    prisma.user.findUnique({ where: { email: `${MULTISHOP_MARKER}-customer@example.invalid` } }),
    prisma.user.findUnique({ where: { email: `${MULTISHOP_MARKER}-technician@example.invalid` } }),
    prisma.user.findUnique({ where: { email: `${MULTISHOP_MARKER}-paused-technician@example.invalid` } }),
    prisma.shop.findFirst({ where: { name: `${MULTISHOP_MARKER}-merchant`, deletedAt: null } }),
    prisma.service.findFirst({ where: { name: `${MULTISHOP_MARKER}-store-service-ndp`, deletedAt: null } }),
    prisma.service.findFirst({ where: { name: `${MULTISHOP_MARKER}-store-service-cash`, deletedAt: null } })
  ]);
  assert(customer && technician && pausedTechnician && shop && successService && mismatchService,
    "run check:multishop-pricing-settlement first to create the retained foundation");
  const [customerIdentity, technicianProfile, pausedProfile] = await Promise.all([
    prisma.userIdentity.findFirst({ where: { userId: customer.id, type: "customer", isActive: true, deletedAt: null }, include: { publicIdentifier: true } }),
    prisma.technicianProfile.findUnique({ where: { userId: technician.id } }),
    prisma.technicianProfile.findUnique({ where: { userId: pausedTechnician.id } })
  ]);
  assert(customerIdentity?.publicIdentifier && technicianProfile && pausedProfile, "fixture identities are incomplete");
  const [technicianIdentity, pausedIdentity] = await Promise.all([
    prisma.userIdentity.findFirst({ where: { userId: technician.id, type: "technician", isActive: true, deletedAt: null }, include: { publicIdentifier: true } }),
    prisma.userIdentity.findFirst({ where: { userId: pausedTechnician.id, type: "technician", isActive: true, deletedAt: null }, include: { publicIdentifier: true } })
  ]);
  assert(technicianIdentity?.publicIdentifier && pausedIdentity?.publicIdentifier, "technician public identities are incomplete");
  await Promise.all([
    prisma.technicianProfile.update({ where: { id: technicianProfile.id }, data: { verifiedAt: technicianProfile.verifiedAt ?? new Date() } }),
    prisma.technicianProfile.update({ where: { id: pausedProfile.id }, data: { verifiedAt: pausedProfile.verifiedAt ?? new Date() } })
  ]);
  return {
    customer,
    customerIdentity,
    technician,
    technicianProfile,
    technicianIdentity,
    pausedTechnician,
    pausedProfile,
    pausedIdentity,
    shop,
    successService,
    mismatchService
  };
}

async function ensureSetting(
  service: import("../src/services/technician-automation.service").TechnicianAutomationService,
  actor: AuthenticatedAccessContext,
  kind: "booking" | "request",
  serviceId: number
) {
  const { defaultTechnicianAutomationRules } = await import("../src/validators/technician-automation.validator");
  const current = await service.getSetting(actor, kind);
  const rules = {
    ...defaultTechnicianAutomationRules(kind),
    maxDistanceKm: null,
    serviceIds: [serviceId],
    onlyOnline: false,
    requestStartWindow: "any" as const,
    requireMatchingTags: false
  };
  if (current.enabled && JSON.stringify(current.rules) === JSON.stringify(rules)) {
    return current;
  }
  return service.updateSetting(actor, kind, {
    enabled: true,
    expectedVersion: current.version,
    rules
  }, requestContext);
}

async function ensureFundedWallet(
  prisma: PrismaClient,
  input: { ownerType: "SHOP" | "USER"; ownerId: number; currency: "NDP" | "TEST_NDP" }
) {
  const selector = {
    ownerType_ownerId_currency: input
  };
  const existing = await prisma.wallet.findUnique({ where: selector });
  if (!existing) {
    return prisma.wallet.create({
      data: { ...input, availableBalance: 1_000_000 }
    });
  }
  if (existing.availableBalance < 100_000) {
    return prisma.wallet.update({
      where: selector,
      data: { availableBalance: { increment: 1_000_000 } }
    });
  }
  return existing;
}

async function ensureSlot(
  prisma: PrismaClient,
  input: { shopId: number; technicianProfileId: number; serviceId: number; startsAt: Date }
) {
  const existing = await prisma.scheduleSlot.findFirst({
    where: {
      shopId: input.shopId,
      technicianProfileId: input.technicianProfileId,
      serviceId: input.serviceId,
      startsAt: input.startsAt,
      deletedAt: null
    }
  });
  return existing ?? prisma.scheduleSlot.create({
    data: {
      shopId: input.shopId,
      technicianProfileId: input.technicianProfileId,
      serviceId: input.serviceId,
      startsAt: input.startsAt,
      endsAt: new Date(input.startsAt.getTime() + 60 * 60_000),
      capacity: 1,
      bookedCount: 0,
      status: "AVAILABLE"
    }
  });
}

async function ensureBooking(
  prisma: PrismaClient,
  booking: import("../src/services/booking.service").BookingService,
  customerActor: AuthenticatedAccessContext,
  input: { key: string; shopId: number; technicianProfileId: number; serviceId: number; startsAt: Date; priceJpy: number }
) {
  const note = `${AUTOMATION_FIXTURE_MARKER}:${input.key}`;
  const existing = await prisma.bookingOrder.findFirst({ where: { note, deletedAt: null } });
  if (existing) return existing;
  const slot = await ensureSlot(prisma, input);
  const created = await booking.createBooking(customerActor, {
    scheduleSlotId: slot.id,
    serviceId: input.serviceId,
    expectedPriceAmountJpy: input.priceJpy,
    fulfillmentMode: "store",
    paymentMethod: "onsite",
    note
  });
  return prisma.bookingOrder.findUniqueOrThrow({ where: { id: created.id } });
}

async function ensureRequest(
  prisma: PrismaClient,
  input: {
    key: string;
    customerUserId: number;
    customerIdentityId: number;
    customerPublicId: string;
    shopId: number;
    technicianProfileId: number;
    serviceId: number;
    startsAt: Date;
  }
) {
  const idempotencyKey = `${AUTOMATION_FIXTURE_MARKER}:${input.key}`;
  let post = await prisma.exchangePost.findUnique({ where: { idempotencyKey } });
  const slot = await ensureSlot(prisma, input);
  if (!post) {
    post = await prisma.exchangePost.create({
      data: {
        authorUserId: input.customerUserId,
        authorIdentityId: input.customerIdentityId,
        ownerIdentityId: input.customerIdentityId,
        publisherPublicId: input.customerPublicId,
        publisherIdentityType: "customer",
        publisherDisplayName: "QA automation customer",
        type: "DEMAND",
        status: "PUBLISHED",
        title: `${AUTOMATION_FIXTURE_MARKER}-${input.key}`,
        detail: "Retained local technician automation acceptance data",
        contentLocale: "ZH_CN",
        areaLabel: "Tokyo",
        serviceStartAt: input.startsAt,
        serviceEndAt: new Date(input.startsAt.getTime() + 60 * 60_000),
        expiresAt: new Date("2099-12-31T00:00:00.000Z"),
        idempotencyKey,
        payloadFingerprint: "a".repeat(64),
        demand: {
          create: {
            targetProviderCount: 1,
            targetProviderLimitSnapshot: 1,
            publisherCapacitySource: "CUSTOMER_MEMBERSHIP",
            membershipLevelSnapshot: "standard",
            matchMode: "SELECTIVE",
            budgetMode: "TOTAL",
            budgetMinJpy: 8_000,
            budgetMaxJpy: 12_000,
            addressLine1: "Local QA",
            serviceMode: "STORE"
          }
        }
      }
    });
    await prisma.exchangeRequestMatching.create({
      data: {
        exchangePostId: post.id,
        status: "OPEN",
        effectiveTargetProviderCount: 1,
        effectiveBudgetMaxJpy: 12_000,
        version: 1
      }
    });
  }
  return { post, slot };
}

export async function runTechnicianOrderAutomationCheck(): Promise<void> {
  const values = loadEnvironment(process.env);
  Object.entries(values).forEach(([name, value]) => { process.env[name] = value; });
  process.env.AUTH_TOKEN_AUDIENCE ||= "needo-backend";
  const [{ prisma }, { TechnicianAutomationRepository }, { TechnicianAutomationService },
    { TechnicianAutomationProcessor }, { BookingRepository }, { BookingService },
    { LedgerRepository }, { LedgerService }, { AuditLogRepository }, { AuditLogService },
    { NdpExchangeRateRepository }, { NdpExchangeRateService }, { ExchangeClaimRepository },
    { ExchangePostRepository }, { ExchangeClaimService }, { FeeRuleRepository },
    { FeeCalculationService }, { PlatformFeePolicyRepository }, { PlatformFeePolicyService }] = await Promise.all([
      import("../src/prisma/client"),
      import("../src/repositories/technician-automation.repository"),
      import("../src/services/technician-automation.service"),
      import("../src/services/technician-automation-processor"),
      import("../src/repositories/booking.repository"),
      import("../src/services/booking.service"),
      import("../src/repositories/ledger.repository"),
      import("../src/services/ledger.service"),
      import("../src/repositories/audit-log.repository"),
      import("../src/services/audit-log.service"),
      import("../src/repositories/ndp-exchange-rate.repository"),
      import("../src/services/ndp-exchange-rate.service"),
      import("../src/repositories/exchange-claim.repository"),
      import("../src/repositories/exchange.repository"),
      import("../src/services/exchange-claim.service"),
      import("../src/repositories/fee-rule.repository"),
      import("../src/services/fee-calculation.service"),
      import("../src/repositories/platform-fee-policy.repository"),
      import("../src/services/platform-fee-policy.service")
    ]);
  try {
    const fixture = await loadFoundation(prisma);
    const [mismatchCustomer, zeroShopCustomer] = await Promise.all([
      ensureAutomationCustomer(prisma, { suffix: "mismatch-customer", numberPart: "9090909011" }),
      ensureAutomationCustomer(prisma, { suffix: "zero-shop-customer", numberPart: "9090909012" })
    ]);
    const repository = new TechnicianAutomationRepository(prisma);
    const settings = new TechnicianAutomationService(repository);
    const audit = new AuditLogService(new AuditLogRepository(prisma));
    const feeCalculation = new FeeCalculationService(new FeeRuleRepository(prisma));
    const platformFeePolicy = new PlatformFeePolicyService(new PlatformFeePolicyRepository(prisma), audit);
    const ledger = new LedgerService(
      new LedgerRepository(prisma),
      feeCalculation,
      undefined,
      undefined,
      platformFeePolicy
    );
    const rate = new NdpExchangeRateService(new NdpExchangeRateRepository(prisma), audit);
    const booking = new BookingService(new BookingRepository(prisma), ledger, undefined, audit, undefined, rate, () => new Date());
    const claimService = new ExchangeClaimService(new ExchangeClaimRepository(prisma), new ExchangePostRepository(prisma));
    await Promise.all([
      ensureFundedWallet(prisma, { ownerType: "SHOP", ownerId: fixture.shop.id, currency: "NDP" }),
      ensureFundedWallet(prisma, { ownerType: "SHOP", ownerId: fixture.shop.id, currency: "TEST_NDP" }),
      ensureFundedWallet(prisma, { ownerType: "USER", ownerId: fixture.technician.id, currency: "NDP" }),
      ensureFundedWallet(prisma, { ownerType: "USER", ownerId: fixture.technician.id, currency: "TEST_NDP" })
    ]);
    const technicianActor = access({
      userId: fixture.technician.id,
      identityId: fixture.technicianIdentity.id,
      publicId: fixture.technicianIdentity.publicIdentifier!.publicId,
      profileId: fixture.technicianProfile.id
    });
    const pausedActor = access({
      userId: fixture.pausedTechnician.id,
      identityId: fixture.pausedIdentity.id,
      publicId: fixture.pausedIdentity.publicIdentifier!.publicId,
      profileId: fixture.pausedProfile.id
    });
    const customerActor = customerAccess({
      user: fixture.customer,
      profile: { id: fixture.customerIdentity.scopeId! },
      identity: fixture.customerIdentity
    });
    const mismatchCustomerActor = customerAccess(mismatchCustomer);
    const zeroShopCustomerActor = customerAccess(zeroShopCustomer);
    const [bookingSetting, requestSetting] = await Promise.all([
      ensureSetting(settings, technicianActor, "booking", fixture.successService.id),
      ensureSetting(settings, technicianActor, "request", fixture.successService.id)
    ]);
    await ensureSetting(settings, pausedActor, "booking", fixture.successService.id);
    const processor = new TechnicianAutomationProcessor(
      repository,
      {
        confirmBooking: async (input) => {
          await booking.transitionOrder({ ...technicianActor, currentIdentityId: input.technicianIdentityId }, input.orderId, "confirm");
        }
      },
      {
        applyRequest: async (input) => {
          await claimService.createClaim(
            technicianActor,
            input.postId,
            { scheduleSlotId: input.scheduleSlotId, quoteAmountJpy: input.quoteAmountJpy, message: input.message },
            input.idempotencyKey,
            requestContext,
            { suppressQuickMatching: true }
          );
        }
      }
    );

    const bookingSuccess = await ensureBooking(prisma, booking, customerActor, {
      key: "booking-success-v5", shopId: fixture.shop.id, technicianProfileId: fixture.technicianProfile.id,
      serviceId: fixture.successService.id, startsAt: new Date("2099-02-01T01:00:00.000Z"), priceJpy: Number(fixture.successService.priceAmount)
    });
    const bookingMismatch = await ensureBooking(prisma, booking, mismatchCustomerActor, {
      key: "booking-mismatch-v5", shopId: fixture.shop.id, technicianProfileId: fixture.technicianProfile.id,
      serviceId: fixture.mismatchService.id, startsAt: new Date("2099-02-01T03:00:00.000Z"), priceJpy: Number(fixture.mismatchService.priceAmount)
    });
    await processor.processBooking(bookingSuccess.id);
    await processor.processBooking(bookingMismatch.id);
    await processor.processBooking(bookingSuccess.id);
    await processor.processBooking(bookingMismatch.id);

    const requestSuccess = await ensureRequest(prisma, {
      key: "request-success", customerUserId: fixture.customer.id, customerIdentityId: fixture.customerIdentity.id,
      customerPublicId: fixture.customerIdentity.publicIdentifier!.publicId, shopId: fixture.shop.id,
      technicianProfileId: fixture.technicianProfile.id, serviceId: fixture.successService.id,
      startsAt: new Date("2099-02-02T01:00:00.000Z")
    });
    const requestMismatch = await ensureRequest(prisma, {
      key: "request-mismatch", customerUserId: fixture.customer.id, customerIdentityId: fixture.customerIdentity.id,
      customerPublicId: fixture.customerIdentity.publicIdentifier!.publicId, shopId: fixture.shop.id,
      technicianProfileId: fixture.technicianProfile.id, serviceId: fixture.mismatchService.id,
      startsAt: new Date("2099-02-02T03:00:00.000Z")
    });
    await processor.processRequest(requestSuccess.post.id);
    await processor.processRequest(requestMismatch.post.id);
    await processor.processRequest(requestSuccess.post.id);
    await processor.processRequest(requestMismatch.post.id);

    let pausedOrder = await prisma.bookingOrder.findFirst({
      where: { note: `${AUTOMATION_FIXTURE_MARKER}:booking-zero-shop-v2`, deletedAt: null }
    });
    if (!pausedOrder) {
      const affiliation = await prisma.technicianShopAffiliation.create({
        data: {
          technicianProfileId: fixture.pausedProfile.id,
          shopId: fixture.shop.id,
          relationshipType: "PARTNER",
          workStatus: "ACTIVE",
          activeKey: `${AUTOMATION_FIXTURE_MARKER}:paused-affiliation`,
          createdById: fixture.pausedTechnician.id,
          updatedById: fixture.pausedTechnician.id
        }
      });
      pausedOrder = await ensureBooking(prisma, booking, zeroShopCustomerActor, {
        key: "booking-zero-shop-v2", shopId: fixture.shop.id, technicianProfileId: fixture.pausedProfile.id,
        serviceId: fixture.successService.id, startsAt: new Date("2099-02-01T05:00:00.000Z"), priceJpy: Number(fixture.successService.priceAmount)
      });
      await prisma.technicianShopAffiliation.update({
        where: { id: affiliation.id },
        data: { workStatus: "ENDED", endsAt: new Date(), activeKey: null }
      });
    }
    await processor.processBooking(pausedOrder.id);

    const [successOrder, mismatchOrder, zeroShopOrder, bookingSuccessDecision, bookingMismatchDecision,
      requestSuccessDecision, requestMismatchDecision, successClaims, mismatchClaims, zeroCandidate,
      zeroProfile] = await Promise.all([
        prisma.bookingOrder.findUniqueOrThrow({ where: { id: bookingSuccess.id } }),
        prisma.bookingOrder.findUniqueOrThrow({ where: { id: bookingMismatch.id } }),
        prisma.bookingOrder.findUniqueOrThrow({ where: { id: pausedOrder.id } }),
        prisma.technicianAutomationDecisionLog.findUnique({ where: { idempotencyKey: `booking:${bookingSuccess.id}:${fixture.technicianProfile.id}:accept_booking` } }),
        prisma.technicianAutomationDecisionLog.findUnique({ where: { idempotencyKey: `booking:${bookingMismatch.id}:${fixture.technicianProfile.id}:accept_booking` } }),
        prisma.technicianAutomationDecisionLog.findUnique({ where: { idempotencyKey: `request:${requestSuccess.post.id}:${fixture.technicianProfile.id}:apply_request` } }),
        prisma.technicianAutomationDecisionLog.findUnique({ where: { idempotencyKey: `request:${requestMismatch.post.id}:${fixture.technicianProfile.id}:apply_request` } }),
        prisma.exchangeClaim.count({ where: { exchangePostId: requestSuccess.post.id, technicianProfileId: fixture.technicianProfile.id, deletedAt: null } }),
        prisma.exchangeClaim.count({ where: { exchangePostId: requestMismatch.post.id, technicianProfileId: fixture.technicianProfile.id, deletedAt: null } }),
        repository.loadBookingCandidate(pausedOrder.id),
        new (await import("../src/repositories/technician-profile.repository")).TechnicianProfileRepository(prisma)
          .findMine(fixture.pausedTechnician.id, fixture.pausedProfile.id)
      ]);
    assert(successOrder.status === "CONFIRMED" && bookingSuccessDecision?.outcome === "EXECUTED", "matching Booking was not auto-accepted");
    assert(mismatchOrder.status === "PENDING" && bookingMismatchDecision?.outcome === "NOT_MATCHED", "non-matching Booking did not remain manual");
    assert((bookingMismatchDecision.failedReasons as string[]).includes("service:not_selected"), "Booking mismatch reason missing");
    assert(successClaims === 1 && requestSuccessDecision?.outcome === "EXECUTED", "matching Request was not auto-applied exactly once");
    assert(mismatchClaims === 0 && requestMismatchDecision?.outcome === "NOT_MATCHED", "non-matching Request did not stay in the candidate pool");
    assert((requestMismatchDecision.failedReasons as string[]).includes("service:not_selected"), "Request mismatch reason missing");
    assert(zeroShopOrder.status === "PENDING" && zeroCandidate === null, "zero-shop technician auto-accepted a Booking");
    assert(zeroProfile?.shopAccessStatus === "requires_shop", "zero-shop technician was not paused");
    const expectedDecisionKeys = [
      `booking:${bookingSuccess.id}:${fixture.technicianProfile.id}:accept_booking`,
      `booking:${bookingMismatch.id}:${fixture.technicianProfile.id}:accept_booking`,
      `request:${requestSuccess.post.id}:${fixture.technicianProfile.id}:apply_request`,
      `request:${requestMismatch.post.id}:${fixture.technicianProfile.id}:apply_request`
    ];
    const decisions = await prisma.technicianAutomationDecisionLog.count({
      where: { idempotencyKey: { in: expectedDecisionKeys }, deletedAt: null }
    });
    assert(decisions === expectedDecisionKeys.length, "automation decision idempotency drifted");
    process.stdout.write(`${JSON.stringify({
      marker: AUTOMATION_FIXTURE_MARKER,
      retained: true,
      rounds: {
        bookingMatched: { orderId: successOrder.id, status: successOrder.status, outcome: bookingSuccessDecision.outcome },
        bookingNotMatched: { orderId: mismatchOrder.id, status: mismatchOrder.status, outcome: bookingMismatchDecision.outcome, failedReasons: bookingMismatchDecision.failedReasons },
        requestMatched: { postId: requestSuccess.post.id, claimCount: successClaims, outcome: requestSuccessDecision.outcome },
        requestNotMatched: { postId: requestMismatch.post.id, claimCount: mismatchClaims, outcome: requestMismatchDecision.outcome, failedReasons: requestMismatchDecision.failedReasons },
        repeatedTriggers: "idempotent",
        zeroShop: { orderId: zeroShopOrder.id, status: zeroShopOrder.status, shopAccessStatus: zeroProfile.shopAccessStatus }
      },
      settingVersions: { booking: bookingSetting.version, request: requestSetting.version }
    }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  runTechnicianOrderAutomationCheck().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
