import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { describe, expect, it } from "@jest/globals";
import { resolveDashboardWindow } from "../src/domain/dashboard-period";
import { requireDashboardIntegrationDatabaseUrl } from "./dashboard-integration-safety";

const enabled = process.env.RUN_DASHBOARD_MYSQL_INTEGRATION === "true";
const describeIntegration = enabled ? describe : describe.skip;

const requireSafeDatabaseUrl = (): URL => {
  const envFile = process.env.ENV_FILE?.trim();
  if (!envFile) {
    throw new Error("Dashboard MySQL integration requires an explicit ENV_FILE");
  }
  const loaded = loadDotenv({ path: envFile, override: true });
  if (loaded.error || !loaded.parsed?.DATABASE_URL) {
    throw new Error("Dashboard MySQL integration ENV_FILE must define DATABASE_URL");
  }
  return new URL(
    requireDashboardIntegrationDatabaseUrl({
      envFile,
      databaseUrl: loaded.parsed.DATABASE_URL
    })
  );
};

const rollback = new Error("dashboard operations finance integration rollback");

describeIntegration("Dashboard operations finance against guarded local MySQL", () => {
  it("aggregates only coherent completion evidence and rolls every fixture back", async () => {
    const url = requireSafeDatabaseUrl();
    const [{ PrismaClient }, { PrismaMariaDb }, repositoryModule] = await Promise.all([
      import("@prisma/client"),
      import("@prisma/adapter-mariadb"),
      import("../src/repositories/dashboard-operations-finance.repository")
    ]);
    const adapter = new PrismaMariaDb(
      {
        host: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
        charset: "utf8mb4",
        collation: "utf8mb4_unicode_ci",
        allowPublicKeyRetrieval: false,
        connectionLimit: 1,
        acquireTimeout: 10_000,
        idleTimeout: 30_000,
        connectTimeout: 5_000
      },
      { database: "needo_test" }
    );
    const client = new PrismaClient({ adapter });
    const marker = `opsfin-${randomUUID().replaceAll("-", "").slice(0, 10)}`;

    try {
      const requiredColumns = [
        "booking_orders.id",
        "booking_orders.shop_id",
        "booking_orders.status",
        "booking_orders.payment_status",
        "booking_orders.payment_method",
        "booking_orders.payment_amount_jpy",
        "booking_orders.payment_confirmed_by_id",
        "booking_orders.payment_confirmed_at",
        "booking_orders.payment_refunded_at",
        "booking_orders.deleted_at",
        "shops.id",
        "shops.city",
        "shops.deleted_at",
        "order_checkouts.id",
        "order_checkouts.booking_order_id",
        "order_checkouts.base_amount_jpy",
        "order_checkouts.add_on_amount_jpy",
        "order_checkouts.discount_amount_jpy",
        "order_checkouts.checkout_amount_jpy",
        "order_checkouts.payable_ndp",
        "order_checkouts.payment_method",
        "order_checkouts.payment_selected_at",
        "order_checkouts.ledger_transaction_id",
        "order_checkouts.receipt_confirmed_by_id",
        "order_checkouts.receipt_confirmed_at",
        "order_checkouts.receipt_confirmation_reason",
        "order_checkouts.deleted_at",
        "ledger_transactions.id",
        "ledger_transactions.type",
        "ledger_transactions.status",
        "ledger_transactions.reference_type",
        "ledger_transactions.reference_id",
        "ledger_transactions.amount",
        "ledger_transactions.created_at",
        "ledger_transactions.deleted_at",
        "ndp_exchange_rate_rules.id"
      ];
      const availableColumns = await client.$queryRaw<
        Array<{ tableName: string; columnName: string }>
      >`
        SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN (
            'booking_orders',
            'shops',
            'order_checkouts',
            'ledger_transactions',
            'ndp_exchange_rate_rules'
          )
      `;
      const available = new Set(
        availableColumns.map((column) => `${column.tableName}.${column.columnName}`)
      );
      const missing = requiredColumns.filter((column) => !available.has(column));
      if (missing.length > 0) {
        throw new Error(
          `Dashboard operations finance integration requires the order fulfillment checkout migration; missing ${missing.join(", ")}`
        );
      }

      const externalBaseline = await client.user.count({ where: { needoId: marker } });
      expect(externalBaseline).toBe(0);

      await expect(
        client.$transaction(async (tx) => {
          const reader = new repositoryModule.DashboardOperationsFinanceRepository(tx);
          const window = resolveDashboardWindow(
            { period: "custom", from: "2026-08-20", to: "2026-08-20" },
            new Date("2026-08-20T03:00:00.000Z")
          );
          const currentInside = new Date(
            (window.fromInclusive.getTime() + window.toExclusive.getTime()) / 2
          );
          const previousInside = new Date(
            (window.previousFromInclusive.getTime() + window.previousToExclusive.getTime()) / 2
          );
          const customer = await tx.user.create({
            data: {
              needoId: marker,
              email: `${marker}@needo.local`,
              username: marker
            }
          });
          const [shop, otherCityShop] = await Promise.all([
            tx.shop.create({ data: { name: `${marker}-tokyo`, city: marker, address: "Tokyo" } }),
            tx.shop.create({ data: { name: `${marker}-osaka`, city: `${marker}-other`, address: "Osaka" } })
          ]);
          const [slot, otherCitySlot] = await Promise.all([
            tx.scheduleSlot.create({
              data: {
                shopId: shop.id,
                startsAt: currentInside,
                endsAt: new Date(currentInside.getTime() + 3_600_000),
                status: "BOOKED"
              }
            }),
            tx.scheduleSlot.create({
              data: {
                shopId: otherCityShop.id,
                startsAt: currentInside,
                endsAt: new Date(currentInside.getTime() + 3_600_000),
                status: "BOOKED"
              }
            })
          ]);
          const existingRateVersion = await tx.ndpExchangeRateRule.aggregate({
            _max: { version: true }
          });
          const fixtureRateVersion = (existingRateVersion._max.version ?? 0) + 1;
          if (fixtureRateVersion > 2_147_483_647) {
            throw new Error("Dashboard operations finance integration cannot allocate a fixture rate version");
          }
          const rate = await tx.ndpExchangeRateRule.create({
            data: {
              version: fixtureRateVersion,
              ndpUnits: 1,
              jpyUnits: 1,
              status: "SUPERSEDED",
              effectiveFrom: window.previousFromInclusive,
              idempotencyKey: `${marker}-rate`,
              reason: marker,
              createdById: customer.id
            }
          });
          let sequence = 0;
          const createCompletedCheckout = async (input: {
            shopId?: number;
            slotId?: number;
            confirmedAt: Date;
            amount: number;
            discount: number;
            method: "NDP" | "CASH" | "OTHER";
            status?: "COMPLETED" | "CANCELLED" | "AWAITING_CHECKOUT";
            paymentStatus?: "CONFIRMED" | "REFUNDED" | "PENDING";
            refundedAt?: Date | null;
            orderPaymentAmount?: number;
            invalidLedger?: boolean;
            lateReceipt?: boolean;
          }) => {
            sequence += 1;
            const selectedAt = new Date(input.confirmedAt.getTime() - 2_000);
            const receiptAt = input.lateReceipt
              ? new Date(input.confirmedAt.getTime() + 1_000)
              : new Date(input.confirmedAt.getTime() - 1_000);
            const targetShopId = input.shopId ?? shop.id;
            const targetSlotId = input.slotId ?? slot.id;
            const isManual = input.method === "CASH" || input.method === "OTHER";
            const reason = isManual ? `${marker}-receipt-${sequence}` : null;
            const order = await tx.bookingOrder.create({
              data: {
                orderNo: `${marker}-${sequence}`,
                customerUserId: customer.id,
                shopId: targetShopId,
                scheduleSlotId: targetSlotId,
                status: input.status ?? "COMPLETED",
                priceAmount: input.amount + input.discount,
                startsAt: currentInside,
                endsAt: new Date(currentInside.getTime() + 3_600_000),
                paymentMethod: input.method,
                paymentStatus: input.paymentStatus ?? "CONFIRMED",
                paymentAmountJpy: input.orderPaymentAmount ?? input.amount,
                paymentConfirmedById: customer.id,
                paymentConfirmedAt: input.confirmedAt,
                paymentNote: reason,
                paymentRefundedById: input.refundedAt ? customer.id : null,
                paymentRefundedAt: input.refundedAt ?? null,
                paymentRefundReason: input.refundedAt ? marker : null
              }
            });
            const checkout = await tx.orderCheckout.create({
              data: {
                bookingOrderId: order.id,
                baseAmountJpy: input.amount + input.discount,
                addOnAmountJpy: 0,
                discountAmountJpy: input.discount,
                checkoutAmountJpy: input.amount,
                payableNdp: input.amount,
                ndpRateRuleId: rate.id,
                rateSnapshotJson: { ndpUnits: 1, jpyUnits: 1, version: rate.version },
                calculationSnapshotJson: { source: marker },
                paymentMethod: input.method,
                paymentSelectedAt: selectedAt,
                otherMethodCode: input.method === "OTHER" ? "bank" : null,
                otherMethodLabel: input.method === "OTHER" ? "Bank" : null,
                receiptConfirmedById: isManual ? customer.id : null,
                receiptConfirmedAt: isManual ? receiptAt : null,
                receiptConfirmationReason: reason
              }
            });
            if (input.method === "NDP") {
              const ledger = await tx.ledgerTransaction.create({
                data: {
                  transactionNo: `${marker}-ledger-${sequence}`,
                  idempotencyKey: `${marker}-ledger-${sequence}`,
                  type: input.invalidLedger ? "SEED_CREDIT" : "BOOKING_COMPLETE_SETTLEMENT",
                  status: "APPLIED",
                  referenceType: input.invalidLedger ? "dashboard_fixture" : "order_checkout_payment",
                  referenceId: checkout.id,
                  actorUserId: customer.id,
                  amount: input.amount,
                  currency: "NDP",
                  createdAt: selectedAt
                }
              });
              await tx.orderCheckout.update({
                where: { id: checkout.id },
                data: { ledgerTransactionId: ledger.id }
              });
              await tx.bookingOrder.update({
                where: { id: order.id },
                data: { paymentReference: `checkout:${checkout.id}:ledger:${ledger.id}` }
              });
            } else {
              await tx.bookingOrder.update({
                where: { id: order.id },
                data: { paymentReference: `checkout:${checkout.id}:technician-receipt` }
              });
            }
          };

          await createCompletedCheckout({
            confirmedAt: currentInside,
            amount: 1_000,
            discount: 100,
            method: "NDP"
          });
          await createCompletedCheckout({
            confirmedAt: currentInside,
            amount: 2_000,
            discount: 200,
            method: "CASH"
          });
          await createCompletedCheckout({
            confirmedAt: previousInside,
            amount: 500,
            discount: 50,
            method: "OTHER"
          });
          await createCompletedCheckout({
            confirmedAt: window.fromInclusive,
            amount: 300,
            discount: 30,
            method: "NDP"
          });
          await createCompletedCheckout({
            confirmedAt: window.toExclusive,
            amount: 8_000,
            discount: 800,
            method: "NDP"
          });
          await createCompletedCheckout({
            confirmedAt: currentInside,
            amount: 9_000,
            discount: 900,
            method: "NDP",
            status: "CANCELLED"
          });
          await createCompletedCheckout({
            confirmedAt: currentInside,
            amount: 9_000,
            discount: 900,
            method: "NDP",
            paymentStatus: "REFUNDED",
            refundedAt: currentInside
          });
          await createCompletedCheckout({
            confirmedAt: currentInside,
            amount: 9_000,
            discount: 900,
            method: "NDP",
            status: "AWAITING_CHECKOUT",
            paymentStatus: "PENDING"
          });
          await createCompletedCheckout({
            confirmedAt: currentInside,
            amount: 9_000,
            discount: 900,
            method: "NDP",
            orderPaymentAmount: 8_999
          });
          await createCompletedCheckout({
            confirmedAt: currentInside,
            amount: 9_000,
            discount: 900,
            method: "NDP",
            invalidLedger: true
          });
          await createCompletedCheckout({
            confirmedAt: currentInside,
            amount: 9_000,
            discount: 900,
            method: "CASH",
            lateReceipt: true
          });
          await createCompletedCheckout({
            shopId: otherCityShop.id,
            slotId: otherCitySlot.id,
            confirmedAt: currentInside,
            amount: 999,
            discount: 99,
            method: "NDP"
          });

          await expect(
            reader.getOperationsFinance({ scope: { kind: "platform" }, city: marker, window })
          ).resolves.toEqual({
            grossRevenue: { current: 3_300, previous: 500, dataStatus: "ready" },
            travelFare: { current: null, previous: null, dataStatus: "not_connected" },
            discountAmount: { current: 330, previous: 50, dataStatus: "ready" },
            consumablesSales: { current: null, previous: null, dataStatus: "not_connected" }
          });
          await expect(
            reader.getOperationsFinance({ scope: { kind: "shop", shopId: shop.id }, city: null, window })
          ).resolves.toMatchObject({
            grossRevenue: { current: 3_300, previous: 500 },
            discountAmount: { current: 330, previous: 50 }
          });
          await expect(
            reader.getOperationsFinance({
              scope: { kind: "shop", shopId: otherCityShop.id },
              city: null,
              window
            })
          ).resolves.toMatchObject({
            grossRevenue: { current: 999, previous: 0 },
            discountAmount: { current: 99, previous: 0 }
          });

          throw rollback;
        }, { maxWait: 5_000, timeout: 30_000 })
      ).rejects.toBe(rollback);

      await expect(client.user.count({ where: { needoId: marker } })).resolves.toBe(0);
    } finally {
      await client.$disconnect();
    }
  });
});
