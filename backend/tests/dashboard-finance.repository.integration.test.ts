import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { describe, expect, it } from "@jest/globals";
import type { Prisma } from "@prisma/client";
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

const rollback = new Error("dashboard integration rollback");

describeIntegration("Dashboard finance repositories against guarded local MySQL", () => {
  it("enforces financial timing, currency, cutoff, JSON, and authoritative booking-shop isolation", async () => {
    const url = requireSafeDatabaseUrl();
    const [{ PrismaClient }, { PrismaMariaDb }, financeModule, merchantModule] =
      await Promise.all([
        import("@prisma/client"),
        import("@prisma/adapter-mariadb"),
        import("../src/repositories/dashboard-finance.repository"),
        import("../src/repositories/dashboard-merchant.repository")
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
    const marker = `dashit-${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const window = resolveDashboardWindow(
      { period: "custom", from: "2026-08-20", to: "2026-08-20" },
      new Date("2026-08-20T03:00:00.000Z")
    );
    const inside = new Date("2026-08-20T03:00:00.000Z");
    const before = new Date("2026-08-19T14:00:00.000Z");
    const after = new Date("2026-08-20T16:00:00.000Z");
    let orderSequence = 0;
    let transactionSequence = 0;

    const createTransaction = (
      tx: Prisma.TransactionClient,
      input: { currency: string; createdAt: Date; amount?: number }
    ) => {
      transactionSequence += 1;
      return tx.ledgerTransaction.create({
        data: {
          transactionNo: `${marker}-tx-${transactionSequence}`,
          idempotencyKey: `${marker}-tx-${transactionSequence}`,
          type: "SEED_CREDIT",
          status: "APPLIED",
          referenceType: "dashboard_integration",
          referenceId: transactionSequence,
          amount: input.amount ?? 1,
          currency: input.currency,
          createdAt: input.createdAt
        }
      });
    };

    try {
      const requiredColumns = [
        "users.is_test_account",
        "order_financials.ndp_currency",
        "order_financials.user_reward_status",
        "order_financials.user_reward_granted_at"
      ];
      const availableColumns = await client.$queryRaw<
        Array<{ tableName: string; columnName: string }>
      >`
        SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('users', 'order_financials')
      `;
      const availableColumnKeys = new Set(
        availableColumns.map((column) => `${column.tableName}.${column.columnName}`)
      );
      const missingColumns = requiredColumns.filter(
        (column) => !availableColumnKeys.has(column)
      );
      if (missingColumns.length > 0) {
        throw new Error(
          `Dashboard MySQL integration requires the current repository schema; missing ${missingColumns.join(", ")}`
        );
      }

      await client.$transaction(async (tx) => {
        const financeRepository = new financeModule.DashboardFinanceRepository(tx);
        const baseline = await financeRepository.getFinanceFacts({
          scope: { kind: "platform" },
          city: marker,
          window
        });
        const customer = await tx.user.create({
          data: {
            needoId: marker,
            email: `${marker}@needo.local`,
            username: marker
          }
        });
        const [shopA, shopB] = await Promise.all([
          tx.shop.create({
            data: { name: `${marker}-a`, city: marker, address: "Tokyo" }
          }),
          tx.shop.create({
            data: { name: `${marker}-b`, city: "Osaka", address: "Osaka" }
          })
        ]);
        await tx.publicIdentifier.create({
          data: {
            publicId: `s${String(shopA.id).padStart(10, "0")}`,
            numberPart: String(shopA.id).padStart(10, "0").slice(-10),
            kind: "SHOP",
            shopId: shopA.id
          }
        });
        await tx.saasBillingProfile.create({
          data: {
            subjectType: "shop",
            subjectId: shopA.id,
            shopId: shopA.id,
            activeKey: `${marker}-billing`,
            billingCadence: "monthly",
            trialStatus: "active",
            trialEndsAt: after
          }
        });
        const [slotA, slotB] = await Promise.all([
          tx.scheduleSlot.create({
            data: {
              shopId: shopA.id,
              startsAt: inside,
              endsAt: new Date(inside.getTime() + 60 * 60 * 1000),
              status: "BOOKED"
            }
          }),
          tx.scheduleSlot.create({
            data: {
              shopId: shopB.id,
              startsAt: inside,
              endsAt: new Date(inside.getTime() + 60 * 60 * 1000),
              status: "BOOKED"
            }
          })
        ]);

        const createOrder = async (input: {
          shopId: number;
          scheduleSlotId: number;
          startsAt?: Date;
          paymentStatus?: "CONFIRMED" | "REFUNDED";
        }) => {
          orderSequence += 1;
          const startsAt = input.startsAt ?? inside;
          return tx.bookingOrder.create({
            data: {
              orderNo: `${marker}-o-${orderSequence}`,
              customerUserId: customer.id,
              shopId: input.shopId,
              scheduleSlotId: input.scheduleSlotId,
              status: "COMPLETED",
              priceAmount: 1_000,
              startsAt,
              endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
              paymentStatus: input.paymentStatus ?? "CONFIRMED"
            }
          });
        };
        const createFinancial = async (input: {
          bookingOrderId: number;
          shopId: number;
          currency?: string;
          bFee?: number;
          cFee?: number;
          reward?: number;
          rewardAt?: Date | null;
          rewardStatus?: "PAID" | "PENDING";
          incomeStatus?: string;
          profit?: number | string | undefined;
        }) => tx.orderFinancial.create({
          data: {
            bookingOrderId: input.bookingOrderId,
            customerUserId: customer.id,
            shopId: input.shopId,
            ndpCurrency: input.currency ?? "NDP",
            bPlatformFeeActualNdp: input.bFee ?? 0,
            cRequestFeeActualNdp: input.cFee ?? 0,
            userRewardNdp: input.reward ?? 0,
            userRewardStatus: input.rewardStatus ?? "PENDING",
            userRewardGrantedAt: input.rewardAt,
            serviceIncomeStatus: input.incomeStatus ?? "reported",
            moneyTimelineJson: [
              {
                type: "technician_income_estimated",
                metadata: input.profit === undefined
                  ? { source: marker }
                  : { shopEstimatedGrossProfitJpy: input.profit }
              }
            ],
            createdAt: before
          }
        });

        const valid = await createOrder({ shopId: shopA.id, scheduleSlotId: slotA.id });
        await createFinancial({
          bookingOrderId: valid.id,
          shopId: shopA.id,
          bFee: 100,
          cFee: 20,
          reward: 10,
          rewardAt: inside,
          rewardStatus: "PAID",
          profit: 700
        });
        const outsideBooking = await createOrder({
          shopId: shopA.id,
          scheduleSlotId: slotA.id,
          startsAt: before
        });
        await createFinancial({
          bookingOrderId: outsideBooking.id,
          shopId: shopA.id,
          bFee: 999,
          cFee: 999,
          reward: 7,
          rewardAt: inside,
          rewardStatus: "PAID"
        });
        const outsideReward = await createOrder({ shopId: shopA.id, scheduleSlotId: slotA.id });
        await createFinancial({
          bookingOrderId: outsideReward.id,
          shopId: shopA.id,
          bFee: 30,
          reward: 100,
          rewardAt: after,
          rewardStatus: "PAID",
          profit: "900"
        });
        const testCurrency = await createOrder({ shopId: shopA.id, scheduleSlotId: slotA.id });
        await createFinancial({
          bookingOrderId: testCurrency.id,
          shopId: shopA.id,
          currency: "TEST_NDP",
          bFee: 50,
          cFee: 5,
          reward: 3,
          rewardAt: inside,
          rewardStatus: "PAID"
        });
        const missingProfit = await createOrder({ shopId: shopA.id, scheduleSlotId: slotA.id });
        await createFinancial({ bookingOrderId: missingProfit.id, shopId: shopA.id });
        const refundedProfit = await createOrder({
          shopId: shopA.id,
          scheduleSlotId: slotA.id,
          paymentStatus: "REFUNDED"
        });
        await createFinancial({
          bookingOrderId: refundedProfit.id,
          shopId: shopA.id,
          profit: 800
        });
        const unreportedProfit = await createOrder({ shopId: shopA.id, scheduleSlotId: slotA.id });
        await createFinancial({
          bookingOrderId: unreportedProfit.id,
          shopId: shopA.id,
          incomeStatus: "unreported",
          profit: 600
        });
        const mismatched = await createOrder({ shopId: shopB.id, scheduleSlotId: slotB.id });
        await createFinancial({
          bookingOrderId: mismatched.id,
          shopId: shopA.id,
          bFee: 5_000,
          cFee: 5_000,
          reward: 500,
          rewardAt: inside,
          rewardStatus: "PAID",
          profit: 9_000
        });

        await Promise.all([
          tx.walletHold.create({
            data: {
              ownerType: "SHOP",
              ownerId: shopA.id,
              bookingOrderId: valid.id,
              feeType: "b_platform_fee",
              holdAmountNdp: 100,
              capturedAmountNdp: 30,
              capturedAt: inside,
              releasedAmountNdp: 20,
              releasedAt: after,
              currency: "NDP",
              idempotencyKey: `${marker}-hold-1`,
              createdAt: before
            }
          }),
          tx.walletHold.create({
            data: {
              ownerType: "SHOP",
              ownerId: shopA.id,
              bookingOrderId: valid.id,
              feeType: "b_platform_fee",
              holdAmountNdp: 50,
              capturedAmountNdp: 50,
              capturedAt: after,
              currency: "NDP",
              idempotencyKey: `${marker}-hold-2`,
              createdAt: before
            }
          }),
          tx.walletHold.create({
            data: {
              ownerType: "SHOP",
              ownerId: shopA.id,
              bookingOrderId: valid.id,
              feeType: "c_request_fee",
              holdAmountNdp: 20,
              currency: "NDP",
              idempotencyKey: `${marker}-hold-3`,
              createdAt: before
            }
          }),
          tx.walletHold.create({
            data: {
              ownerType: "SHOP",
              ownerId: shopA.id,
              bookingOrderId: valid.id,
              feeType: "b_platform_fee",
              holdAmountNdp: 40,
              releasedAmountNdp: 10,
              releasedAt: inside,
              currency: "TEST_NDP",
              idempotencyKey: `${marker}-hold-4`,
              createdAt: before
            }
          })
        ]);

        const [formalWallet, nonPositiveWallet, testWallet] = await Promise.all([
          tx.wallet.create({
            data: {
              ownerType: "PLATFORM",
              ownerId: customer.id,
              currency: "NDP",
              availableBalance: 9_999
            }
          }),
          tx.wallet.create({
            data: {
              ownerType: "PLATFORM",
              ownerId: customer.id + 1_000_000,
              currency: "NDP",
              availableBalance: -25
            }
          }),
          tx.wallet.create({
            data: {
              ownerType: "PLATFORM",
              ownerId: customer.id,
              currency: "TEST_NDP",
              availableBalance: 8_888
            }
          }),
        ]);
        await tx.wallet.create({
          data: {
            ownerType: "SHOP",
            ownerId: shopA.id,
            currency: "NDP",
            availableBalance: 250,
            frozenBalance: 25
          }
        });
        const [formalBeforeTx, formalAfterTx, negativeTx, testTx] = await Promise.all([
          createTransaction(tx, { currency: "NDP", createdAt: before }),
          createTransaction(tx, { currency: "NDP", createdAt: after }),
          createTransaction(tx, { currency: "NDP", createdAt: before }),
          createTransaction(tx, { currency: "TEST_NDP", createdAt: before })
        ]);
        await Promise.all([
          tx.walletLedger.create({
            data: {
              walletId: formalWallet.id,
              transactionId: formalBeforeTx.id,
              direction: "AVAILABLE_CREDIT",
              amount: 120,
              availableDelta: 100,
              frozenDelta: 20,
              availableBalanceAfter: 100,
              frozenBalanceAfter: 20,
              reason: marker,
              createdAt: before
            }
          }),
          tx.walletLedger.create({
            data: {
              walletId: formalWallet.id,
              transactionId: formalAfterTx.id,
              direction: "AVAILABLE_CREDIT",
              amount: 380,
              availableDelta: 380,
              frozenDelta: 0,
              availableBalanceAfter: 500,
              frozenBalanceAfter: 0,
              reason: marker,
              createdAt: after
            }
          }),
          tx.walletLedger.create({
            data: {
              walletId: nonPositiveWallet.id,
              transactionId: negativeTx.id,
              direction: "AVAILABLE_DEBIT",
              amount: 25,
              availableDelta: -25,
              frozenDelta: 0,
              availableBalanceAfter: -25,
              frozenBalanceAfter: 0,
              reason: marker,
              createdAt: before
            }
          }),
          tx.walletLedger.create({
            data: {
              walletId: testWallet.id,
              transactionId: testTx.id,
              direction: "AVAILABLE_CREDIT",
              amount: 70,
              availableDelta: 70,
              frozenDelta: 0,
              availableBalanceAfter: 70,
              frozenBalanceAfter: 0,
              reason: marker,
              createdAt: before
            }
          })
        ]);

        const [formalWithdrawalTx, testWithdrawalTx, outsideWithdrawalTx, pendingWithdrawalTx] =
          await Promise.all([
            createTransaction(tx, { currency: "NDP", createdAt: inside, amount: 35 }),
            createTransaction(tx, { currency: "TEST_NDP", createdAt: inside, amount: 90 }),
            createTransaction(tx, { currency: "NDP", createdAt: before, amount: 45 }),
            createTransaction(tx, { currency: "NDP", createdAt: inside, amount: 500 })
          ]);
        await Promise.all([
          tx.walletAdjustmentRequest.create({
            data: {
              type: "WITHDRAWAL",
              status: "APPROVED",
              ownerType: "PLATFORM",
              ownerId: customer.id,
              walletId: formalWallet.id,
              amountNdp: 35,
              idempotencyKey: `${marker}-withdraw-1`,
              requestedById: customer.id,
              ledgerTransactionId: formalWithdrawalTx.id,
              createdAt: before
            }
          }),
          tx.walletAdjustmentRequest.create({
            data: {
              type: "WITHDRAWAL",
              status: "APPROVED",
              ownerType: "PLATFORM",
              ownerId: customer.id,
              walletId: testWallet.id,
              amountNdp: 90,
              idempotencyKey: `${marker}-withdraw-2`,
              requestedById: customer.id,
              ledgerTransactionId: testWithdrawalTx.id,
              createdAt: inside
            }
          }),
          tx.walletAdjustmentRequest.create({
            data: {
              type: "WITHDRAWAL",
              status: "APPROVED",
              ownerType: "PLATFORM",
              ownerId: customer.id,
              walletId: formalWallet.id,
              amountNdp: 45,
              idempotencyKey: `${marker}-withdraw-3`,
              requestedById: customer.id,
              ledgerTransactionId: outsideWithdrawalTx.id,
              createdAt: inside
            }
          }),
          tx.walletAdjustmentRequest.create({
            data: {
              type: "WITHDRAWAL",
              status: "PENDING",
              ownerType: "PLATFORM",
              ownerId: customer.id,
              walletId: formalWallet.id,
              amountNdp: 500,
              idempotencyKey: `${marker}-withdraw-4`,
              requestedById: customer.id,
              ledgerTransactionId: pendingWithdrawalTx.id,
              createdAt: inside
            }
          }),
          tx.walletAdjustmentRequest.create({
            data: {
              type: "WITHDRAWAL",
              status: "APPROVED",
              ownerType: "PLATFORM",
              ownerId: customer.id,
              walletId: formalWallet.id,
              amountNdp: 700,
              idempotencyKey: `${marker}-withdraw-5`,
              requestedById: customer.id,
              createdAt: inside
            }
          })
        ]);

        const merchantRepository = new merchantModule.DashboardMerchantRepository(tx);
        const platform = await financeRepository.getFinanceFacts({
          scope: { kind: "platform" },
          city: marker,
          window
        });
        const merchant = await financeRepository.getFinanceFacts({
          scope: { kind: "shop", shopId: shopA.id },
          city: null,
          window
        });
        const snapshot = await merchantRepository.getMerchantFacts({
          scope: { kind: "shop", shopId: shopA.id },
          city: null,
          window
        });

        expect(platform.platformNetRevenue).toEqual({ ndp: 133, testNdp: 52 });
        expect(platform.userReward).toEqual({ ndp: 17, testNdp: 3 });
        expect(platform.frozen).toEqual({ ndp: 140, testNdp: 30 });
        expect(platform.walletStock).toEqual({
          ndp: (baseline.walletStock?.ndp ?? 0) + 120,
          testNdp: (baseline.walletStock?.testNdp ?? 0) + 70
        });
        expect(platform.withdrawn).toEqual({
          ndp: (baseline.withdrawn?.ndp ?? 0) + 35,
          testNdp: 0
        });
        expect(merchant.platformNetRevenue).toEqual({ ndp: 133, testNdp: 52 });
        expect(merchant.frozen).toEqual({ ndp: 120, testNdp: 30 });
        expect(merchant.walletStock).toBeNull();
        expect(merchant.withdrawn).toBeNull();
        expect(merchant.bucketShopEstimatedGrossProfitJpy).toEqual(
          new Map([["2026-08-20", 700]])
        );
        expect(snapshot).toMatchObject({
          name: `${marker}-a`,
          activeTechnicianCount: 0,
          billing: {
            cadence: "monthly",
            trialStatus: "active",
            trialEndsAt: after
          },
          wallet: { currency: "NDP", availableBalance: 250, frozenBalance: 25 }
        });

        throw rollback;
      }, { timeout: 30_000 });
      throw new Error("Dashboard integration transaction committed unexpectedly");
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await expect(
        client.user.count({ where: { email: `${marker}@needo.local` } })
      ).resolves.toBe(0);
      await client.$disconnect();
    }
  }, 45_000);
});
