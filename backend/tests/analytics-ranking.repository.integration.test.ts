import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse as parseDotenv } from "dotenv";
import { describe, expect, it } from "@jest/globals";
import { resolveDashboardWindow } from "../src/domain/dashboard-period";
import { AnalyticsRankingIncompleteEvidenceError } from "../src/domain/analytics-ranking";
import {
  analyticsRankingRequiredIndexes,
  assertAnalyticsRankingIntegrationSchema,
  requireAnalyticsRankingIntegrationAuthority
} from "./analytics-ranking-integration-safety";

const enabled = process.env.RUN_ANALYTICS_RANKING_MYSQL_INTEGRATION === "true";
const describeIntegration = enabled ? describe : describe.skip;
class RankingRollback extends Error {}

function requireSafeDatabaseUrl(): URL {
  const envFile = process.env.FORMAL_BACKEND_ENV_FILE?.trim();
  if (!envFile) throw new Error("Analytics ranking MySQL integration requires FORMAL_BACKEND_ENV_FILE");
  const parsed = parseDotenv(readFileSync(envFile));
  return new URL(requireAnalyticsRankingIntegrationAuthority({
    enabled: process.env.RUN_ANALYTICS_RANKING_MYSQL_INTEGRATION,
    envFile,
    parsed,
    runtime: process.env
  }));
}

describeIntegration("AnalyticsRankingRepository against guarded local MySQL", () => {
  it("proves NDP/cash/other rankings, filtering, evidence rejection and outer rollback", async () => {
    const url = requireSafeDatabaseUrl();
    const [{ PrismaClient }, { PrismaMariaDb }, repositoryModule] = await Promise.all([
      import("@prisma/client"), import("@prisma/adapter-mariadb"),
      import("../src/repositories/analytics-ranking.repository")
    ]);
    const adapter = new PrismaMariaDb({
      host: url.hostname, port: url.port ? Number(url.port) : undefined,
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
      database: "needo_test", charset: "utf8mb4", collation: "utf8mb4_unicode_ci",
      connectionLimit: 1, acquireTimeout: 10_000, idleTimeout: 30_000,
      connectTimeout: 5_000, allowPublicKeyRetrieval: false
    }, { database: "needo_test" });
    const client = new PrismaClient({ adapter });
    const marker = `ranking-${randomUUID().slice(0, 8)}`;
    const evaluatedAt = new Date("2026-09-01T05:30:00.000Z");
    const confirmedAt = new Date("2026-08-31T03:00:00.000Z");
    const selectedAt = new Date("2026-08-31T02:55:00.000Z");
    const window = resolveDashboardWindow({ period: "last7days" }, evaluatedAt);

    try {
      const tables = [...new Set((await import("./analytics-ranking-integration-safety"))
        .analyticsRankingRequiredColumns.map((column) => column.split(".")[0]))];
      const [columns, indexes, migrations] = await Promise.all([
        client.$queryRawUnsafe<Array<{ tableName: string; columnName: string }>>(
          `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${tables.map(() => "?").join(",")})`, ...tables
        ),
        client.$queryRawUnsafe<Array<{ tableName: string; indexName: string; columnName: string; seqInIndex: bigint; nonUnique: bigint }>>(
          `SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, COLUMN_NAME AS columnName, SEQ_IN_INDEX AS seqInIndex, NON_UNIQUE AS nonUnique FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME IN (${analyticsRankingRequiredIndexes.map(() => "?").join(",")})`,
          ...analyticsRankingRequiredIndexes.map((index) => index.indexName)
        ),
        client.$queryRaw<Array<{ migrationName: string }>>`
          SELECT migration_name AS migrationName FROM _prisma_migrations
          WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        `
      ]);
      assertAnalyticsRankingIntegrationSchema(columns, indexes, migrations.map((row) => row.migrationName));

      const readBaseline = async () => (await client.$queryRaw<Array<Record<string, bigint>>>`
        SELECT
          (SELECT COUNT(*) FROM users) AS users,
          (SELECT COUNT(*) FROM customer_profiles) AS customerProfiles,
          (SELECT COUNT(*) FROM categories) AS categories,
          (SELECT COUNT(*) FROM shops) AS shops,
          (SELECT COUNT(*) FROM technician_profiles) AS technicianProfiles,
          (SELECT COUNT(*) FROM services) AS services,
          (SELECT COUNT(*) FROM technician_services) AS technicianServices,
          (SELECT COUNT(*) FROM ndp_exchange_rate_rules) AS rateRules,
          (SELECT COUNT(*) FROM schedule_slots) AS scheduleSlots,
          (SELECT COUNT(*) FROM booking_orders) AS bookingOrders,
          (SELECT COUNT(*) FROM order_service_sessions) AS sessions,
          (SELECT COUNT(*) FROM order_add_ons) AS addOns,
          (SELECT COUNT(*) FROM order_checkouts) AS checkouts,
          (SELECT COUNT(*) FROM order_service_events) AS serviceEvents,
          (SELECT COUNT(*) FROM ledger_transactions) AS ledgerTransactions,
          (SELECT COUNT(*) FROM audit_logs) AS auditLogs
      `)[0];
      const baseline = await readBaseline();
      await expect(client.$transaction(async (rawTx) => {
        const tx = rawTx;
        const operator = await tx.user.create({ data: { needoId: `u8${Date.now().toString().slice(-9)}`,
          email: `${marker}-operator@needo.local`, username: marker } });
        const customer = await tx.user.create({ data: { needoId: `u7${Date.now().toString().slice(-9)}`,
          email: `${marker}-customer@needo.local`, username: `${marker}-customer` } });
        const technicianUser = await tx.user.create({ data: { needoId: `u6${Date.now().toString().slice(-9)}`,
          email: `${marker}-tech@needo.local`, username: `${marker}-tech` } });
        await tx.customerProfile.create({ data: { userId: customer.id, displayName: `${marker}-customer` } });
        const category = await tx.category.create({ data: { code: marker, name: marker } });
        const shop = await tx.shop.create({ data: { name: marker, city: "东京", address: "Tokyo" } });
        const technician = await tx.technicianProfile.create({ data: {
          userId: technicianUser.id, shopId: shop.id, displayName: marker, city: "东京"
        } });
        const service = await tx.service.create({ data: { categoryId: category.id, shopId: shop.id,
          name: `${marker}-service`, city: "东京", priceAmount: 10_000,
          durationMinutes: 60 } });
        const addOnService = await tx.service.create({ data: { categoryId: category.id, shopId: shop.id,
          name: `${marker}-addon`, city: "东京", priceAmount: 2_000,
          durationMinutes: 15, createdAt: new Date("2026-01-02T00:00:00.000Z") } });
        const tieAddOnService = await tx.service.create({ data: { categoryId: category.id, shopId: shop.id,
          name: `${marker}-tie-addon`, city: "东京", priceAmount: 2_000,
          durationMinutes: 15, createdAt: addOnService.createdAt } });
        const technicianService = await tx.technicianService.create({ data: {
          shopId: shop.id, technicianId: technician.id, name: `${marker}-tech-service`,
          categoryId: category.id, priceAmount: 10_000, durationMinutes: 60
        } });
        const rate = await tx.ndpExchangeRateRule.create({ data: { version: Date.now() % 2_000_000_000,
          ndpUnits: 1, jpyUnits: 1, status: "ACTIVE", effectiveFrom: new Date("2026-01-01"),
          activeKey: marker, idempotencyKey: `${marker}-rate`, reason: marker, createdById: operator.id } });

        const createFormalOrder = async (method: "NDP" | "CASH" | "OTHER", ordinal: number) => {
          const addOnCount = method === "NDP" ? 2 : 1;
          const addOnAmountJpy = 2_000 * addOnCount;
          const discountAmountJpy = method === "NDP" ? 1_000 : 0;
          const checkoutAmountJpy = 10_000 + addOnAmountJpy - discountAmountJpy;
          const slot = await tx.scheduleSlot.create({ data: { serviceId: method === "CASH" ? null : service.id,
            technicianServiceId: method === "CASH" ? technicianService.id : null,
            shopId: shop.id, technicianProfileId: technician.id,
            startsAt: new Date("2026-08-31T01:00:00Z"), endsAt: new Date("2026-08-31T02:00:00Z") } });
          const order = await tx.bookingOrder.create({ data: { orderNo: `${marker}-${ordinal}`,
            customerUserId: customer.id, serviceId: method === "CASH" ? null : service.id,
            technicianServiceId: method === "CASH" ? technicianService.id : null,
            shopId: shop.id, technicianProfileId: technician.id, scheduleSlotId: slot.id,
            status: "COMPLETED", priceAmount: 10_000, currency: "JPY",
            startsAt: new Date("2026-08-31T01:00:00Z"), endsAt: new Date("2030-01-01T00:00:00Z"),
            paymentMethod: method, paymentStatus: "CONFIRMED", paymentAmountJpy: checkoutAmountJpy,
            paymentConfirmedById: method === "NDP" ? customer.id : method === "CASH" ? technicianUser.id : operator.id,
            paymentConfirmedAt: confirmedAt } });
          const session = await tx.orderServiceSession.create({ data: { bookingOrderId: order.id,
            verificationHash: marker, startedAt: selectedAt, endedAt: selectedAt, endedByUserId: technicianUser.id } });
          const addOns = [];
          for (let index = 0; index < addOnCount; index += 1) {
            const selectedAddOnService = (ordinal + index) % 2 === 0 ? addOnService : tieAddOnService;
            addOns.push(await tx.orderAddOn.create({ data: { bookingOrderId: order.id,
              serviceSessionId: session.id, serviceId: selectedAddOnService.id, status: "ACCEPTED",
              serviceNameSnapshot: selectedAddOnService.name, priceAmountJpy: 2_000, currency: "JPY",
              durationMinutes: 15, serviceSnapshotJson: { serviceId: selectedAddOnService.id },
              proposedByUserId: technicianUser.id, proposedAt: new Date(selectedAt.getTime() - 1000),
              acceptedByUserId: customer.id, acceptedAt: selectedAt } }));
          }
          const checkout = await tx.orderCheckout.create({ data: { bookingOrderId: order.id,
            baseAmountJpy: 10_000, addOnAmountJpy, discountAmountJpy,
            checkoutAmountJpy, payableNdp: checkoutAmountJpy, ndpRateRuleId: rate.id,
            rateSnapshotJson: { ndpUnits: 1, jpyUnits: 1, version: rate.version },
            calculationSnapshotJson: { formula: "base_plus_accepted_add_ons_minus_discount",
              baseAmountJpy: 10_000, addOnAmountJpy, discountAmountJpy,
              checkoutAmountJpy, acceptedAddOnIds: addOns.map((addOn) => addOn.id) },
            paymentMethod: method, paymentSelectedAt: selectedAt,
            otherMethodCode: method === "OTHER" ? "bank" : null,
            otherMethodLabel: method === "OTHER" ? "Bank transfer" : null,
            receiptConfirmedById: method === "NDP" ? null : method === "CASH" ? technicianUser.id : operator.id,
            receiptConfirmedAt: method === "NDP" ? null : confirmedAt,
            receiptConfirmationReason: method === "NDP" ? null : "received" } });
          await tx.orderServiceEvent.create({ data: { bookingOrderId: order.id,
            serviceSessionId: session.id, orderCheckoutId: checkout.id, eventType: "PAYMENT_METHOD_SELECTED",
            actorUserId: customer.id, idempotencyKey: `${marker}-${ordinal}-selected`, occurredAt: selectedAt,
            metadata: method === "NDP" ? { method: "ndp" } : method === "CASH" ? { method: "cash" }
              : { method: "other", otherMethodCode: "bank", otherMethodLabel: "Bank transfer" } } });
          if (method === "NDP") {
            const ledger = await tx.ledgerTransaction.create({ data: { transactionNo: `${marker}-${ordinal}-ledger`,
              idempotencyKey: `${marker}-${ordinal}-ledger`, type: "BOOKING_COMPLETE_SETTLEMENT",
              referenceType: "order_checkout_payment", referenceId: checkout.id, actorUserId: customer.id,
              amount: checkoutAmountJpy, currency: "NDP", createdAt: confirmedAt } });
            await tx.orderCheckout.update({ where: { id: checkout.id }, data: { ledgerTransactionId: ledger.id } });
            await tx.bookingOrder.update({ where: { id: order.id }, data: {
              paymentReference: `checkout:${checkout.id}:ledger:${ledger.id}` } });
            await tx.orderServiceEvent.create({ data: { bookingOrderId: order.id,
              serviceSessionId: session.id, orderCheckoutId: checkout.id, eventType: "NDP_PAYMENT_APPLIED",
              actorUserId: customer.id, idempotencyKey: `${marker}-${ordinal}-paid`,
              reason: "checkout_ndp_payment_applied", occurredAt: confirmedAt,
              metadata: { paymentEvidence: "ndp_ledger", ledgerTransactionId: ledger.id } } });
          } else {
            const evidence = method === "CASH" ? "technician_receipt_confirmation" : "operations_receipt_override";
            const reference = method === "CASH" ? `checkout:${checkout.id}:technician-receipt`
              : `checkout:${checkout.id}:operations-receipt`;
            await tx.bookingOrder.update({ where: { id: order.id }, data: {
              paymentReference: reference, paymentNote: "received" } });
            await tx.orderServiceEvent.create({ data: { bookingOrderId: order.id,
              serviceSessionId: session.id, orderCheckoutId: checkout.id, eventType: "RECEIPT_CONFIRMED",
              actorUserId: method === "CASH" ? technicianUser.id : operator.id,
              idempotencyKey: `${marker}-${ordinal}-receipt`, reason: "received", occurredAt: confirmedAt,
              metadata: { paymentEvidence: evidence, reason: "received" } } });
            if (method === "OTHER") await tx.auditLog.create({ data: { actorId: operator.id,
              action: "backoffice.order.checkout.receipt_override", targetType: "BookingOrder",
              targetId: order.id, metadata: { orderId: order.id, checkoutId: checkout.id,
                selectedMethod: "other", checkoutAmountJpy, reason: "received" } } });
          }
          return { order, checkout, session, addOns };
        };

        const ndp = await createFormalOrder("NDP", 1);
        const cash = await createFormalOrder("CASH", 2);
        const other = await createFormalOrder("OTHER", 3);
        const repository = new repositoryModule.AnalyticsRankingRepository(rawTx);
        for (const kind of ["service", "technician", "customer"] as const) {
          for (const metric of ["gmv", "completedCount"] as const) {
            const result = await repository.listRankings({ kind, metric, window, evaluatedAt,
              city: "东京", categoryId: category.id, page: 1, pageSize: 10 });
            if (kind === "service") {
              expect(result).toMatchObject({ total: 4, page: 1, page_size: 10 });
              const expected = metric === "gmv"
                ? [
                  [service.publicId, 19_000, 2],
                  [technicianService.publicId, 10_000, 1],
                  [addOnService.publicId, 4_000, 2],
                  [tieAddOnService.publicId, 4_000, 2]
                ]
                : [
                  [service.publicId, 19_000, 2],
                  [addOnService.publicId, 4_000, 2],
                  [tieAddOnService.publicId, 4_000, 2],
                  [technicianService.publicId, 10_000, 1]
                ];
              expect(result.list.map((item) => [item.entityPublicId, item.gmvJpy, item.completedCount]))
                .toEqual(expected);
              expect(result.list.map((item) => item.rank)).toEqual([1, 2, 3]);
            } else {
              expect(result).toMatchObject({ total: 1, page: 1, page_size: 10 });
              expect(result.list[0]).toMatchObject({
                rank: 1,
                entityPublicId: kind === "technician" ? technicianUser.needoId : customer.needoId,
                gmvJpy: 37_000,
                completedCount: 3,
                categoryId: category.id
              });
            }
          }
        }

        const customerRanking = (city: string | null = "东京", categoryId: number | null = null) =>
          repository.listRankings({ kind: "customer", metric: "gmv", window,
            evaluatedAt, city, categoryId, page: 1, pageSize: 10 });
        const expectIncomplete = async () => {
          await expect(customerRanking()).rejects.toBeInstanceOf(AnalyticsRankingIncompleteEvidenceError);
        };
        const ndpSnapshot = (acceptedAddOnIds: number[]) => ({
          formula: "base_plus_accepted_add_ons_minus_discount",
          baseAmountJpy: 10_000,
          addOnAmountJpy: 4_000,
          discountAmountJpy: 1_000,
          checkoutAmountJpy: 13_000,
          acceptedAddOnIds
        });

        const receiptWithinWindow = new Date(selectedAt.getTime() + 60_000);
        await tx.orderCheckout.update({ where: { id: cash.checkout.id }, data: {
          receiptConfirmedAt: receiptWithinWindow
        } });
        await tx.orderServiceEvent.updateMany({ where: {
          bookingOrderId: cash.order.id, eventType: "RECEIPT_CONFIRMED"
        }, data: { occurredAt: receiptWithinWindow } });
        await expect(customerRanking()).resolves.toMatchObject({
          list: [{ gmvJpy: 37_000, completedCount: 3 }]
        });

        const setNdpEvidenceTime = async (at: Date) => {
          const selectionTime = new Date(at.getTime() - 60_000);
          await tx.bookingOrder.update({ where: { id: ndp.order.id }, data: { paymentConfirmedAt: at } });
          await tx.orderCheckout.update({ where: { id: ndp.checkout.id }, data: { paymentSelectedAt: selectionTime } });
          await tx.orderServiceSession.update({ where: { id: ndp.session.id }, data: {
            startedAt: selectionTime, endedAt: selectionTime
          } });
          await tx.ledgerTransaction.updateMany({ where: {
            referenceType: "order_checkout_payment", referenceId: ndp.checkout.id
          }, data: { createdAt: at } });
          await tx.orderServiceEvent.updateMany({ where: {
            bookingOrderId: ndp.order.id, eventType: "PAYMENT_METHOD_SELECTED"
          }, data: { occurredAt: selectionTime } });
          await tx.orderServiceEvent.updateMany({ where: {
            bookingOrderId: ndp.order.id, eventType: "NDP_PAYMENT_APPLIED"
          }, data: { occurredAt: at } });
        };
        await setNdpEvidenceTime(window.fromInclusive);
        await expect(customerRanking()).resolves.toMatchObject({
          list: [{ gmvJpy: 37_000, completedCount: 3 }]
        });
        await setNdpEvidenceTime(window.toExclusive);
        await expect(customerRanking()).resolves.toMatchObject({
          list: [{ gmvJpy: 24_000, completedCount: 2 }]
        });
        await setNdpEvidenceTime(confirmedAt);

        await tx.shop.update({ where: { id: shop.id }, data: { city: "大阪" } });
        await expect(customerRanking("东京")).resolves.toMatchObject({ total: 0, list: [] });
        await expect(customerRanking("大阪")).resolves.toMatchObject({
          list: [{ gmvJpy: 37_000, completedCount: 3 }]
        });
        await tx.shop.update({ where: { id: shop.id }, data: { city: "东京" } });

        const otherCategory = await tx.category.create({ data: { code: `${marker}-other`, name: `${marker}-other` } });
        await tx.service.updateMany({ where: { id: { in: [addOnService.id, tieAddOnService.id] } },
          data: { categoryId: otherCategory.id } });
        await expect(repository.listRankings({ kind: "service", metric: "gmv", window,
          evaluatedAt, city: "东京", categoryId: category.id, page: 1, pageSize: 10 }))
          .resolves.toMatchObject({ total: 2, list: [
            { entityPublicId: service.publicId, gmvJpy: 19_000, completedCount: 2 },
            { entityPublicId: technicianService.publicId, gmvJpy: 10_000, completedCount: 1 }
          ] });
        await expect(repository.listRankings({ kind: "service", metric: "completedCount", window,
          evaluatedAt, city: "东京", categoryId: otherCategory.id, page: 1, pageSize: 10 }))
          .resolves.toMatchObject({ total: 2, list: [
            { entityPublicId: addOnService.publicId, gmvJpy: 4_000, completedCount: 2 },
            { entityPublicId: tieAddOnService.publicId, gmvJpy: 4_000, completedCount: 2 }
          ] });
        await tx.service.updateMany({ where: { id: { in: [addOnService.id, tieAddOnService.id] } },
          data: { categoryId: category.id } });

        await tx.category.update({ where: { id: category.id }, data: { deletedAt: evaluatedAt } });
        await expect(repository.listRankings({ kind: "service", metric: "gmv", window,
          evaluatedAt, city: "东京", categoryId: null, page: 1, pageSize: 10 }))
          .resolves.toMatchObject({ total: 0, list: [] });
        await tx.category.update({ where: { id: category.id }, data: { deletedAt: null } });

        await tx.technicianProfile.update({ where: { id: technician.id }, data: { deletedAt: evaluatedAt } });
        await expect(customerRanking()).resolves.toMatchObject({ total: 0, list: [] });
        await tx.technicianProfile.update({ where: { id: technician.id }, data: { deletedAt: null } });

        await tx.user.update({ where: { id: customer.id }, data: { isActive: false } });
        await expect(customerRanking()).resolves.toMatchObject({ total: 0, list: [] });
        await tx.user.update({ where: { id: customer.id }, data: { isActive: true } });

        await tx.service.update({ where: { id: service.id }, data: { deletedAt: evaluatedAt } });
        await expect(repository.listRankings({ kind: "service", metric: "gmv", window,
          evaluatedAt, city: "东京", categoryId: category.id, page: 1, pageSize: 10 }))
          .resolves.toMatchObject({ total: 3 });
        await tx.service.update({ where: { id: service.id }, data: { deletedAt: null } });

        await tx.orderCheckout.update({ where: { id: ndp.checkout.id }, data: {
          calculationSnapshotJson: {
            formula: "base_plus_accepted_add_ons_minus_discount", baseAmountJpy: 10_000,
            addOnAmountJpy: 4_000, discountAmountJpy: 1_000, checkoutAmountJpy: 13_000
          }
        } });
        await expectIncomplete();
        await tx.orderCheckout.update({ where: { id: ndp.checkout.id }, data: {
          calculationSnapshotJson: ndpSnapshot(ndp.addOns.map((addOn) => addOn.id))
        } });

        await tx.orderCheckout.update({ where: { id: ndp.checkout.id }, data: {
          calculationSnapshotJson: ndpSnapshot([...ndp.addOns].reverse().map((addOn) => addOn.id))
        } });
        await expectIncomplete();
        await tx.orderCheckout.update({ where: { id: ndp.checkout.id }, data: {
          calculationSnapshotJson: ndpSnapshot(ndp.addOns.map((addOn) => addOn.id))
        } });

        await tx.bookingOrder.update({ where: { id: cash.order.id }, data: {
          paymentReference: `checkout:${cash.checkout.id}:operations-receipt`
        } });
        await expectIncomplete();
        await tx.bookingOrder.update({ where: { id: cash.order.id }, data: {
          paymentReference: `checkout:${cash.checkout.id}:technician-receipt`
        } });

        await tx.orderCheckout.update({ where: { id: ndp.checkout.id }, data: { otherMethodCode: "stale" } });
        await expectIncomplete();
        await tx.orderCheckout.update({ where: { id: ndp.checkout.id }, data: { otherMethodCode: null } });

        await tx.orderAddOn.update({ where: { id: ndp.addOns[0]!.id }, data: { currency: "USD" } });
        await expectIncomplete();
        await tx.orderAddOn.update({ where: { id: ndp.addOns[0]!.id }, data: { currency: "JPY" } });

        await tx.bookingOrder.update({ where: { id: ndp.order.id }, data: { currency: "jpy" } });
        await expectIncomplete();
        await tx.bookingOrder.update({ where: { id: ndp.order.id }, data: { currency: "JPY" } });
        throw new RankingRollback();
      }, { isolationLevel: "Serializable", timeout: 60_000 })).rejects.toBeInstanceOf(RankingRollback);
      expect(await readBaseline()).toEqual(baseline);
    } finally {
      await client.$disconnect();
    }
  }, 90_000);
});
