import { type PrismaClient, type Prisma as PrismaTypes } from "@prisma/client";
import { loadAndValidateFormalEnvironment, createTransactionBoundPrismaFacade, runRollbackOnlyTransaction } from "./check-order-fulfillment-checkout-flow";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import type { RouteDistanceProvider } from "../src/services/route-distance.provider";
import {
  hashRouteAddress,
  normalizeJapaneseRouteAddress,
  shopAddressToJapaneseRouteAddress
} from "../src/services/route-estimate.service";

const migrationNames = [
  "20260905150000_shop_travel_fare_routing",
  "20260905160000_route_estimate_schedule_slot_binding",
  "20260905170000_order_checkout_travel_fare_total"
];
const marker = "formal-shop-travel-fare-check";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(`Shop travel-fare checker assertion failed: ${message}`);
};

type SchemaEvidence = {
  migrations: string[];
  tables: string[];
  columns: string[];
  constraints: string[];
  constraintDefinitions: Record<string, string>;
  indexes: string[];
  permissions: string[];
};

const normalizeConstraintDefinition = (value: string): string =>
  value.toLowerCase().replace(/[`()\s]+/gu, "");

export function assertTravelFareSchema(evidence: SchemaEvidence): void {
  const required = {
    migrations: migrationNames,
    tables: ["shop_travel_fare_policy_versions", "shop_travel_fare_bands", "route_estimates", "booking_travel_fare_snapshots"],
    columns: ["order_checkouts.travel_fare_amount_jpy", "booking_orders.fulfillment_address_snapshot", "route_estimates.schedule_slot_id", "route_estimates.consumed_by_booking_order_id"],
    constraints: ["route_estimates.route_estimates_consumption_check", "route_estimates.route_estimates_schedule_slot_fkey", "order_checkouts.order_checkouts_travel_fare_amount_check", "order_checkouts.order_checkouts_total_chk"],
    indexes: ["route_estimates.route_estimates_consumed_booking_key", "route_estimates.route_estimates_schedule_slot_idx", "booking_travel_fare_snapshots.booking_travel_fare_snapshots_booking_key"],
    permissions: ["merchant-admin:travel-fare-policy:read", "merchant-admin:travel-fare-policy:write", "backoffice:travel-fare:read", "booking:travel-estimate:create"]
  } satisfies Record<Exclude<keyof SchemaEvidence, "constraintDefinitions">, string[]>;
  const missing = Object.entries(required).flatMap(([section, values]) => values.filter((value) => !evidence[section as keyof typeof required].includes(value)));
  assert(missing.length === 0, `schema preflight missing ${missing.join(", ")}`);
  const checkoutTotalFormula = normalizeConstraintDefinition(
    evidence.constraintDefinitions["order_checkouts.order_checkouts_total_chk"] ?? ""
  );
  assert(
    checkoutTotalFormula.includes(
      "checkout_amount_jpy=base_amount_jpy+add_on_amount_jpy+travel_fare_amount_jpy-discount_amount_jpy"
    ),
    "order_checkouts_total_chk formula does not include travel fare"
  );
}

async function readSchemaEvidence(client: PrismaClient): Promise<SchemaEvidence> {
  const [migrations, tables, columns, constraints, checkConstraints, indexes, permissions] = await Promise.all([
    client.$queryRaw<Array<{ name: string }>>`SELECT migration_name AS name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    client.$queryRaw<Array<{ name: string }>>`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()`,
    client.$queryRaw<Array<{ tableName: string; columnName: string }>>`SELECT table_name AS tableName, column_name AS columnName FROM information_schema.columns WHERE table_schema = DATABASE()`,
    client.$queryRaw<Array<{ tableName: string; name: string }>>`SELECT table_name AS tableName, constraint_name AS name FROM information_schema.table_constraints WHERE constraint_schema = DATABASE()`,
    client.$queryRaw<Array<{ tableName: string; name: string; definition: string }>>`
      SELECT table_constraints.table_name AS tableName,
        checks.constraint_name AS name,
        checks.check_clause AS definition
      FROM information_schema.check_constraints AS checks
      INNER JOIN information_schema.table_constraints AS table_constraints
        ON table_constraints.constraint_schema = checks.constraint_schema
        AND table_constraints.constraint_name = checks.constraint_name
        AND table_constraints.constraint_type = 'CHECK'
      WHERE checks.constraint_schema = DATABASE()
    `,
    client.$queryRaw<Array<{ tableName: string; name: string }>>`SELECT DISTINCT table_name AS tableName, index_name AS name FROM information_schema.statistics WHERE table_schema = DATABASE()`,
    client.permission.findMany({ where: { code: { in: ["merchant-admin:travel-fare-policy:read", "merchant-admin:travel-fare-policy:write", "backoffice:travel-fare:read", "booking:travel-estimate:create"] }, deletedAt: null }, select: { code: true } })
  ]);
  return {
    migrations: migrations.map((row) => row.name), tables: tables.map((row) => row.name),
    columns: columns.map((row) => `${row.tableName}.${row.columnName}`),
    constraints: constraints.map((row) => `${row.tableName}.${row.name}`),
    constraintDefinitions: Object.fromEntries(
      checkConstraints.map((row) => [`${row.tableName}.${row.name}`, row.definition])
    ),
    indexes: indexes.map((row) => `${row.tableName}.${row.name}`), permissions: permissions.map((row) => row.code)
  };
}

async function captureBaseline(client: PrismaClient) {
  const [policies, bands, estimates, snapshots, slots, orders, checkouts, orderFinancials, wallets, ledgerTransactions, walletLedgers, reconciliations, audits] = await Promise.all([
    client.shopTravelFarePolicyVersion.count(), client.shopTravelFareBand.count(), client.routeEstimate.count(), client.bookingTravelFareSnapshot.count(),
    client.scheduleSlot.count(), client.bookingOrder.count(), client.orderCheckout.count(),
    client.orderFinancial.count(), client.wallet.count(), client.ledgerTransaction.count(), client.walletLedger.count(), client.financeReconciliation.count(),
    client.auditLog.count({ where: { action: { in: ["merchant_admin.travel_fare_policy.publish", "booking.travel_estimate.create"] } } })
  ]);
  return { policies, bands, estimates, snapshots, slots, orders, checkouts, orderFinancials, wallets, ledgerTransactions, walletLedgers, reconciliations, audits };
}

const actor = (user: { id: number; email: string }, identityType: string, scopeType: string, scopeId: number): AuthenticatedAccessContext => ({
  userId: user.id, email: user.email, accessTokenJti: marker, accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 900,
  currentIdentityId: user.id, currentIdentityType: identityType, currentIdentityScopeType: scopeType, currentIdentityScopeId: scopeId,
  roles: [identityType], permissions: []
});

async function runFlow(transaction: PrismaTypes.TransactionClient): Promise<void> {
  const [
    { AuditLogRepository },
    { BookingRepository },
    { DashboardOperationsFinanceRepository },
    { FeeRuleRepository },
    { LedgerRepository },
    { NdpExchangeRateRepository },
    { PlatformFeePolicyRepository },
    { RouteEstimateRepository },
    { ShopTravelFarePolicyRepository },
    { TravelOperationsRepository },
    { AuditLogService },
    { BookingService },
    { resolveDashboardWindow },
    { FeeCalculationService },
    { LedgerService },
    { NdpExchangeRateService },
    { PlatformFeePolicyService },
    { RouteEstimateService },
    { ShopTravelFarePolicyService }
  ] = await Promise.all([
    import("../src/repositories/audit-log.repository"),
    import("../src/repositories/booking.repository"),
    import("../src/repositories/dashboard-operations-finance.repository"),
    import("../src/repositories/fee-rule.repository"),
    import("../src/repositories/ledger.repository"),
    import("../src/repositories/ndp-exchange-rate.repository"),
    import("../src/repositories/platform-fee-policy.repository"),
    import("../src/repositories/route-estimate.repository"),
    import("../src/repositories/shop-travel-fare-policy.repository"),
    import("../src/repositories/travel-operations.repository"),
    import("../src/services/audit-log.service"),
    import("../src/services/booking.service"),
    import("../src/domain/dashboard-period"),
    import("../src/services/fee-calculation.service"),
    import("../src/services/ledger.service"),
    import("../src/services/ndp-exchange-rate.service"),
    import("../src/services/platform-fee-policy.service"),
    import("../src/services/route-estimate.service"),
    import("../src/services/shop-travel-fare-policy.service")
  ]);
  const tx = createTransactionBoundPrismaFacade(transaction) as unknown as PrismaClient;
  const now = new Date();
  const service = await transaction.service.findFirst({
    where: { status: "published", serviceMode: { in: ["home", "both", "onsite"] }, deletedAt: null, shop: { status: "published", deletedAt: null } },
    select: { id: true, publicId: true, shopId: true, name: true, priceAmount: true, currency: true, durationMinutes: true, shop: { select: { city: true, name: true } } }
  });
  const customer = await transaction.user.findFirst({
    where: {
      isTestAccount: true,
      deletedAt: null,
      customerProfile: { is: { deletedAt: null } }
    },
    select: {
      id: true,
      email: true,
      customerProfile: { select: { id: true } }
    }
  });
  const rate = await transaction.ndpExchangeRateRule.findFirst({ where: { status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }], deletedAt: null }, orderBy: { version: "desc" } });
  assert(service && customer && rate, "requires one published home-capable service, customer, and active NDP rate");
  const affiliation = await transaction.technicianShopAffiliation.findFirst({
    where: { shopId: service.shopId, workStatus: "ACTIVE", activeKey: { not: null }, deletedAt: null },
    select: {
      technicianProfile: { select: { id: true, user: { select: { id: true, email: true } } } },
      shopEmployee: { select: { user: { select: { id: true, email: true } }, status: true, deletedAt: true } }
    }
  });
  assert(affiliation?.shopEmployee?.status === "ACTIVE" && !affiliation.shopEmployee.deletedAt, "requires one active technician who is also an authorized shop employee");
  const merchantMembership = await transaction.merchantShopMembership.findFirst({
    where: { shopId: service.shopId, activeKey: { not: null }, deletedAt: null, merchantAccount: { status: "active", deletedAt: null, ownerUserId: { not: null } } },
    select: { merchantAccount: { select: { owner: { select: { id: true, email: true } } } } }
  });
  const merchantOwner = merchantMembership?.merchantAccount.owner;
  assert(merchantOwner, "requires one active merchant account owner for the selected shop");

  await transaction.shopTravelFarePolicyVersion.updateMany({ where: { shopId: service.shopId, deletedAt: null }, data: { deletedAt: now } });
  const audit = new AuditLogService(new AuditLogRepository(tx));
  const merchantActor = actor(merchantOwner, "merchant_owner", "shop", service.shopId);
  const customerActor = actor(customer, "customer", "user", customer.id);
  customerActor.currentIdentityScopeType = "customer_profile";
  customerActor.currentIdentityScopeId = customer.customerProfile?.id ?? null;
  const policyService = new ShopTravelFarePolicyService(new ShopTravelFarePolicyRepository(tx), audit);
  const policy = await policyService.publishVersion(merchantActor, { ip: "127.0.0.1", userAgent: marker }, {
    expectedVersion: 0, effectiveFrom: new Date(now.getTime() - 60_000).toISOString(), reason: marker,
    bands: [{ maximumDistanceMeters: 5_000, fareAmountJpy: 800 }, { maximumDistanceMeters: 10_000, fareAmountJpy: 1_200 }]
  });
  assert(policy.version === 1 && policy.bands.length === 2, "immutable policy publication did not persist two bands");
  const operationsPolicies = await new TravelOperationsRepository(tx).listFarePolicies(
    { page: 1, pageSize: 100, shopKeyword: service.shop.name },
    now
  );
  assert(
    operationsPolicies.list.some(
      (item) =>
        item.shopId === service.shopId &&
        item.current?.publicId === policy.publicId &&
        item.current.bands.length === 2
    ),
    "operations policy visibility did not read the persisted policy"
  );

  const slot = await transaction.scheduleSlot.create({ data: { serviceId: service.id, shopId: service.shopId, technicianProfileId: affiliation.technicianProfile.id, startsAt: new Date(now.getTime() + 86_400_000), endsAt: new Date(now.getTime() + 86_400_000 + service.durationMinutes * 60_000), capacity: 1, bookedCount: 0, status: "AVAILABLE" } });

  const deterministicProvider: RouteDistanceProvider = { key: "geoapify", getDrivingRoute: async () => ({ providerCode: "geoapify", providerRequestId: marker, distanceMeters: 4_200, durationSeconds: 900 }) };
  const destination = { countryCode: "JP" as const, postalCode: "104-0061", prefecture: "東京都", city: "中央区", addressLine1: "銀座1-2-3", building: "NeeDo 301" };
  const estimateService = new RouteEstimateService(new RouteEstimateRepository(tx), deterministicProvider, audit, { estimateTtlSeconds: 600, cacheTtlSeconds: 300 }, () => now);
  const estimatePayload = await estimateService.create(customerActor, { ip: "127.0.0.1", userAgent: marker }, { servicePublicId: service.publicId, scheduleSlotId: slot.id, destination });
  assert(estimatePayload.distanceMeters === 4_200 && estimatePayload.fareAmountJpy === 800 && !estimatePayload.cached, "deterministic provider estimate was not persisted");
  const estimate = await transaction.routeEstimate.findUniqueOrThrow({ where: { publicId: estimatePayload.publicId }, include: { policyVersion: true, matchedBand: true } });

  const booking = new BookingRepository(tx);
  const feeCalculation = new FeeCalculationService(new FeeRuleRepository(tx));
  const platformFeePolicy = new PlatformFeePolicyService(
    new PlatformFeePolicyRepository(tx),
    audit
  );
  const ledger = new LedgerService(
    new LedgerRepository(tx),
    feeCalculation,
    undefined,
    undefined,
    platformFeePolicy
  );
  const ndpExchangeRate = new NdpExchangeRateService(
    new NdpExchangeRateRepository(tx),
    audit
  );
  const bookingService = new BookingService(
    booking,
    ledger,
    undefined,
    audit,
    undefined,
    ndpExchangeRate,
    () => now
  );
  const bookingResult = await booking.createBooking({
    customerUserId: customer.id,
    serviceId: service.id,
    scheduleSlotId: slot.id,
    fulfillmentMode: "home",
    serviceLocation: { source: "CUSTOMER_SERVICE_LOCATION", countryCode: "JP", admin1Code: "13", admin2Code: "13102" },
    paymentMethod: "onsite",
    fulfillmentAddress: destination,
    travelEstimatePublicId: estimatePayload.publicId,
    note: marker
  });
  assert(bookingResult && !("travelEstimateError" in bookingResult), "formal booking path rejected the route estimate");
  const order = bookingResult.order;
  const storedOrder = await transaction.bookingOrder.findUniqueOrThrow({ where: { id: order.id }, select: { fulfillmentAddressSnapshot: true } });
  const storedSnapshot = await transaction.bookingTravelFareSnapshot.findUnique({ where: { bookingOrderId: order.id } });
  const consumedEstimate = await transaction.routeEstimate.findUniqueOrThrow({ where: { id: estimate.id } });
  assert(storedSnapshot?.fareAmountJpy === 800, "formal booking path did not persist the immutable travel-fare snapshot");
  assert(consumedEstimate.consumedByBookingOrderId === order.id && consumedEstimate.consumedAt, "formal booking path did not consume the estimate exactly once");
  assert(/東京都/u.test(JSON.stringify(storedOrder.fulfillmentAddressSnapshot)), "formal booking path did not persist the authorized address snapshot");

  const repeatedConsumption = await transaction.routeEstimate.updateMany({
    where: { id: estimate.id, consumedAt: null, consumedByBookingOrderId: null, expiresAt: { gt: now }, deletedAt: null },
    data: { consumedAt: now, consumedByBookingOrderId: order.id }
  });
  assert(repeatedConsumption.count === 0, "consumed estimate accepted a second conditional mutation");

  const technician = affiliation.technicianProfile;
  const technicianActor = actor(
    technician.user,
    "technician",
    "technician_profile",
    technician.id
  );
  const requestContext = { ip: "127.0.0.1", userAgent: marker };
  await Promise.all([
    transaction.wallet.upsert({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "SHOP",
          ownerId: service.shopId,
          currency: "TEST_NDP"
        }
      },
      create: {
        ownerType: "SHOP",
        ownerId: service.shopId,
        currency: "TEST_NDP",
        availableBalance: 1_000_000
      },
      update: { availableBalance: 1_000_000 }
    }),
    transaction.wallet.upsert({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "USER",
          ownerId: technician.user.id,
          currency: "TEST_NDP"
        }
      },
      create: {
        ownerType: "USER",
        ownerId: technician.user.id,
        currency: "TEST_NDP",
        availableBalance: 1_000_000
      },
      update: { availableBalance: 1_000_000 }
    })
  ]);
  const confirmed = await bookingService.transitionOrder(technicianActor, order.id, "confirm");
  assert(confirmed.status === "confirmed", "formal booking confirmation failed");
  const verificationCode = await booking.getServiceVerificationCode(order.id);
  const started = await bookingService.startService(
    technicianActor,
    order.id,
    { actor: "technician", verificationCode, idempotencyKey: `${marker}-start` },
    requestContext
  );
  assert(started.status === "inService", "formal service start failed");
  const ended = await bookingService.endService(
    technicianActor,
    order.id,
    { reason: marker, idempotencyKey: `${marker}-end` },
    requestContext
  );
  assert(ended.status === "awaitingCheckout", "formal service completion failed");
  const checkoutSnapshot = await bookingService.getCheckout(customerActor, order.id);
  assert(checkoutSnapshot.checkoutAmountJpy === Math.round(Number(service.priceAmount)) + 800 && checkoutSnapshot.payableNdp === Math.ceil(checkoutSnapshot.checkoutAmountJpy * rate.ndpUnits / rate.jpyUnits), "checkout arithmetic or NDP conversion is incorrect");
  const selected = await bookingService.selectCheckoutPaymentMethod(
    customerActor,
    order.id,
    { method: "cash", idempotencyKey: `${marker}-cash` },
    requestContext
  );
  assert(selected.status === "awaitingPaymentConfirmation", "formal cash payment selection failed");
  const completed = await bookingService.confirmCheckoutReceipt(
    technicianActor,
    order.id,
    { reason: marker, idempotencyKey: `${marker}-receipt` },
    requestContext
  );
  assert(completed.status === "completed", "formal receipt confirmation failed");

  const dashboard = new DashboardOperationsFinanceRepository(tx);
  const dashboardInput = { scope: { kind: "shop" as const, shopId: service.shopId }, city: null, window: resolveDashboardWindow({ period: "today" }, now) };
  const recognized = await dashboard.getOperationsFinance(dashboardInput);
  assert(recognized.travelFare.current >= 800, "completed payment-evidenced travel fare was not recognized");
  const refunded = await bookingService.refundManualPayment(
    merchantActor,
    order.id,
    { reason: marker, reference: marker },
    requestContext
  );
  assert(refunded.paymentStatus === "refunded", "formal cash refund failed");
  const excluded = await dashboard.getOperationsFinance(dashboardInput);
  assert(excluded.travelFare.current === recognized.travelFare.current - 800, "refunded travel fare was not excluded");

  const auditRows = await transaction.auditLog.findMany({ where: { action: { in: ["merchant_admin.travel_fare_policy.publish", "booking.travel_estimate.create"] }, createdAt: { gte: now } }, select: { action: true, actorId: true, metadata: true } });
  assert(new Set(auditRows.map((row) => row.action)).size === 2, "policy and estimate audit evidence is missing");
  assert(auditRows.some((row) => row.actorId === merchantActor.userId) && auditRows.some((row) => row.actorId === customer.id), "policy and estimate audits are not bound to their authorized principals");
  assert(!/apiKey|credential|destinationAddressHash|銀座1-2-3/iu.test(JSON.stringify(auditRows)), "audit evidence leaked credentials or customer address data");
  assert((await transaction.scheduleSlot.findUnique({ where: { id: slot.id }, select: { shopId: true } }))?.shopId === service.shopId, "formal fixture slot is not visible inside the rollback transaction");
}

async function runConcurrentConsumptionCheck(client: PrismaClient): Promise<void> {
  const baseline = await captureBaseline(client);
  const markerSuffix = `${Date.now().toString(36)}-${process.pid}`;
  const destination = normalizeJapaneseRouteAddress({
    countryCode: "JP",
    postalCode: "104-0061",
    prefecture: "東京都",
    city: "中央区",
    addressLine1: "銀座1-2-3",
    building: "NeeDo 301"
  });
  const created = await client.$transaction(async (transaction) => {
    const customer = await transaction.user.findFirst({
      where: { isTestAccount: true, deletedAt: null },
      select: { id: true }
    });
    const category = await transaction.category.findFirst({
      where: { isActive: true, deletedAt: null },
      select: { id: true }
    });
    assert(customer && category, "concurrency check requires one test user and active category");
    const shop = await transaction.shop.create({
      data: {
        name: `Travel fare race ${markerSuffix}`,
        city: "東京都中央区",
        address: "〒104-0061 東京都中央区銀座4-5-6",
        status: "published"
      }
    });
    const service = await transaction.service.create({
      data: {
        categoryId: category.id,
        shopId: shop.id,
        name: `Travel fare race ${markerSuffix}`,
        city: shop.city,
        serviceMode: "onsite",
        priceAmount: 8_800,
        durationMinutes: 60,
        status: "published"
      }
    });
    const startsAt = new Date(Date.now() + 86_400_000);
    const slot = await transaction.scheduleSlot.create({
      data: {
        serviceId: service.id,
        shopId: shop.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
        capacity: 2,
        bookedCount: 0,
        status: "AVAILABLE"
      }
    });
    const policy = await transaction.shopTravelFarePolicyVersion.create({
      data: {
        shopId: shop.id,
        version: 1,
        effectiveFrom: new Date(Date.now() - 60_000),
        publishedByUserId: customer.id,
        reason: marker
      }
    });
    const band = await transaction.shopTravelFareBand.create({
      data: {
        policyVersionId: policy.id,
        ordinal: 0,
        maximumDistanceMeters: 10_000,
        fareAmountJpy: 800
      }
    });
    const estimate = await transaction.routeEstimate.create({
      data: {
        customerUserId: customer.id,
        shopId: shop.id,
        serviceId: service.id,
        scheduleSlotId: slot.id,
        policyVersionId: policy.id,
        matchedBandId: band.id,
        providerCode: "geoapify",
        providerRequestId: `${marker}-concurrent`,
        originAddressHash: hashRouteAddress(
          shopAddressToJapaneseRouteAddress({ city: shop.city, address: shop.address })
        ),
        destinationAddressHash: hashRouteAddress(destination),
        distanceMeters: 4_200,
        durationSeconds: 900,
        fareAmountJpy: 800,
        expiresAt: new Date(Date.now() + 600_000)
      }
    });
    return {
      customerId: customer.id,
      shopId: shop.id,
      serviceId: service.id,
      slotId: slot.id,
      policyId: policy.id,
      bandId: band.id,
      estimateId: estimate.id,
      estimatePublicId: estimate.publicId
    };
  });

  const bookingInput = {
    customerUserId: created.customerId,
    serviceId: created.serviceId,
    scheduleSlotId: created.slotId,
    fulfillmentMode: "home" as const,
    serviceLocation: { source: "CUSTOMER_SERVICE_LOCATION" as const, countryCode: "JP" as const, admin1Code: "13", admin2Code: "13102" },
    paymentMethod: "onsite" as const,
    fulfillmentAddress: destination,
    travelEstimatePublicId: created.estimatePublicId,
    note: marker
  };
  try {
    const { BookingRepository } = await import("../src/repositories/booking.repository");
    const firstRepository = new BookingRepository(client);
    const secondRepository = new BookingRepository(client);
    const settled = await Promise.allSettled([
      firstRepository.createBooking(bookingInput),
      secondRepository.createBooking(bookingInput)
    ]);
    const rejected = settled.filter((result) => result.status === "rejected");
    const results = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    const successes = results.filter(
      (result): result is Exclude<NonNullable<typeof result>, { travelEstimateError: string }> =>
        Boolean(result && !("travelEstimateError" in result))
    );
    const consumedFailures = results.filter(
      (result) => result && "travelEstimateError" in result && result.travelEstimateError === "consumed"
    );
    assert(rejected.length === 0, "concurrent estimate consumption raised an unexpected transaction error");
    assert(successes.length === 1, "concurrent estimate consumption created more or fewer than one booking");
    assert(consumedFailures.length === 1, "concurrent estimate loser did not receive the consumed result");
    const successfulOrderId = successes[0]!.order.id;
    const [estimate, snapshots, orders] = await Promise.all([
      client.routeEstimate.findUniqueOrThrow({ where: { id: created.estimateId } }),
      client.bookingTravelFareSnapshot.count({ where: { routeEstimateId: created.estimateId } }),
      client.bookingOrder.count({ where: { id: successfulOrderId } })
    ]);
    assert(
      estimate.consumedByBookingOrderId === successfulOrderId && snapshots === 1 && orders === 1,
      "concurrent estimate consumption did not persist exactly one order and snapshot"
    );
  } finally {
    await client.$transaction(async (transaction) => {
      const fixtureOrders = await transaction.bookingOrder.findMany({
        where: { shopId: created.shopId, scheduleSlotId: created.slotId },
        select: { id: true }
      });
      const fixtureOrderIds = fixtureOrders.map((order) => order.id);
      await transaction.bookingTravelFareSnapshot.deleteMany({
        where: {
          OR: [
            { routeEstimateId: created.estimateId },
            ...(fixtureOrderIds.length > 0
              ? [{ bookingOrderId: { in: fixtureOrderIds } }]
              : [])
          ]
        }
      });
      await transaction.routeEstimate.delete({ where: { id: created.estimateId } });
      if (fixtureOrderIds.length > 0) {
        await transaction.orderStatusHistory.deleteMany({
          where: { bookingOrderId: { in: fixtureOrderIds } }
        });
        await transaction.bookingOrder.deleteMany({ where: { id: { in: fixtureOrderIds } } });
      }
      await transaction.scheduleSlot.delete({ where: { id: created.slotId } });
      await transaction.shopTravelFareBand.delete({ where: { id: created.bandId } });
      await transaction.shopTravelFarePolicyVersion.delete({ where: { id: created.policyId } });
      await transaction.service.delete({ where: { id: created.serviceId } });
      await transaction.shop.delete({ where: { id: created.shopId } });
    });
  }
  assert(
    JSON.stringify(await captureBaseline(client)) === JSON.stringify(baseline),
    "concurrency fixture cleanup did not restore the full baseline"
  );
}

export async function runShopTravelFareFlowCheck(): Promise<void> {
  const formalEnvironment = loadAndValidateFormalEnvironment(process.env);
  for (const [name, value] of Object.entries(formalEnvironment.values)) process.env[name] = value;
  const { prisma } = await import("../src/prisma/client");
  try {
    assertTravelFareSchema(await readSchemaEvidence(prisma));
    await runRollbackOnlyTransaction(prisma, () => captureBaseline(prisma), runFlow);
    await runConcurrentConsumptionCheck(prisma);
    process.stdout.write("Shop travel-fare flow verified; ROLLBACK completed and baseline restored.\n");
  } finally { await prisma.$disconnect(); }
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  runShopTravelFareFlowCheck().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Shop travel-fare check failed"}\n`); process.exitCode = 1; });
}
