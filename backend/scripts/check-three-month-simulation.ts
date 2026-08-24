import { BookingOrderStatus } from "@prisma/client";
import { compare } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

import {
  SIMULATION_END_AT,
  SIMULATION_ORDER_PREFIX,
  SIMULATION_START_AT,
  buildThreeMonthSimulationPlan
} from "../src/simulation/three-month-simulation-plan";
import {
  deriveSimulationAccountPassword,
  getSimulationSeedConfig
} from "../src/simulation/simulation-seed-config";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const seedConfig = getSimulationSeedConfig(process.env);
  const [{ prisma, disconnectPrisma }] = await Promise.all([import("../src/prisma/client")]);
  const plan = buildThreeMonthSimulationPlan();

  try {
    const ownerEmails = plan.shops.map((shop) => shop.ownerEmail);
    const technicianEmails = plan.technicians.map((technician) => technician.email);
    const customerEmails = plan.customers.map((customer) => customer.email);
    const [owners, technicianUsers, customerUsers] = await Promise.all([
      prisma.user.findMany({
        where: { email: { in: ownerEmails }, isActive: true, deletedAt: null },
        select: { id: true, email: true, passwordHash: true }
      }),
      prisma.user.findMany({
        where: { email: { in: technicianEmails }, isActive: true, deletedAt: null },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          technicianProfile: { select: { id: true, shopId: true, status: true } }
        }
      }),
      prisma.user.findMany({
        where: { email: { in: customerEmails }, isActive: true, deletedAt: null },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          customerProfile: { select: { id: true } }
        }
      })
    ]);
    assert(owners.length === 10, `expected 10 simulation owners, found ${owners.length}`);
    assert(
      technicianUsers.length === 100,
      `expected 100 simulation technicians, found ${technicianUsers.length}`
    );
    assert(
      customerUsers.length === 100,
      `expected 100 simulation customers, found ${customerUsers.length}`
    );
    assert(
      technicianUsers.every(
        (user) => user.technicianProfile?.shopId && user.technicianProfile.status === "published"
      ),
      "every simulation technician must be published and assigned to a shop"
    );
    assert(
      customerUsers.every((user) => user.customerProfile),
      "every simulation customer must have a customer profile"
    );

    const shops = await prisma.shop.findMany({
      where: { ownerUserId: { in: owners.map((owner) => owner.id) }, deletedAt: null },
      select: { id: true, ownerUserId: true, status: true }
    });
    assert(shops.length === 10, `expected 10 simulation shops, found ${shops.length}`);
    assert(shops.every((shop) => shop.status === "published"), "all simulation shops must publish");

    const shopIds = shops.map((shop) => shop.id);
    const technicianProfileIds = technicianUsers.flatMap((user) =>
      user.technicianProfile ? [user.technicianProfile.id] : []
    );
    const [
      services,
      technicianServices,
      scheduleSlots,
      bookings,
      financials,
      customerWallets,
      seedLedgerTransactions,
      seedWalletLedgers,
      notifications
    ] = await Promise.all([
      prisma.service.count({ where: { shopId: { in: shopIds }, deletedAt: null } }),
      prisma.technicianService.count({
        where: { technicianId: { in: technicianProfileIds }, deletedAt: null }
      }),
      prisma.scheduleSlot.findMany({
        where: {
          technicianProfileId: { in: technicianProfileIds },
          startsAt: { gte: new Date(SIMULATION_START_AT), lte: new Date(SIMULATION_END_AT) },
          deletedAt: null
        },
        select: { id: true, startsAt: true, endsAt: true }
      }),
      prisma.bookingOrder.findMany({
        where: { orderNo: { startsWith: SIMULATION_ORDER_PREFIX }, deletedAt: null },
        select: { id: true, orderNo: true, status: true, startsAt: true, endsAt: true }
      }),
      prisma.orderFinancial.count({
        where: {
          bookingOrder: {
            orderNo: { startsWith: SIMULATION_ORDER_PREFIX },
            status: BookingOrderStatus.COMPLETED,
            deletedAt: null
          },
          deletedAt: null
        }
      }),
      prisma.wallet.findMany({
        where: {
          ownerType: "USER",
          ownerId: { in: customerUsers.map((user) => user.id) },
          currency: "NDP",
          deletedAt: null
        },
        select: { id: true, availableBalance: true }
      }),
      prisma.ledgerTransaction.count({
        where: { transactionNo: { startsWith: "SIM3M-WAL-" }, deletedAt: null }
      }),
      prisma.walletLedger.count({
        where: {
          transaction: { transactionNo: { startsWith: "SIM3M-WAL-" }, deletedAt: null },
          deletedAt: null
        }
      }),
      prisma.notification.count({
        where: {
          recipientUserId: { in: customerUsers.map((user) => user.id) },
          title: "Simulation booking update",
          deletedAt: null
        }
      })
    ]);
    assert(services === 30, `expected 30 simulation services, found ${services}`);
    assert(
      technicianServices === 100,
      `expected 100 simulation technician services, found ${technicianServices}`
    );
    assert(
      scheduleSlots.length === plan.scheduleSlots.length,
      `expected ${plan.scheduleSlots.length} schedule slots, found ${scheduleSlots.length}`
    );
    assert(
      bookings.length === plan.bookings.length,
      `expected ${plan.bookings.length} bookings, found ${bookings.length}`
    );
    assert(customerWallets.length === 100, `expected 100 customer wallets, found ${customerWallets.length}`);
    assert(
      customerWallets.every((wallet) => wallet.availableBalance >= 5_000),
      "every simulation customer wallet must retain at least its 5000 NDP seed credit"
    );
    assert(
      seedLedgerTransactions === 100,
      `expected 100 simulation seed transactions, found ${seedLedgerTransactions}`
    );
    assert(
      seedWalletLedgers === 100,
      `expected 100 simulation wallet ledgers, found ${seedWalletLedgers}`
    );
    assert(
      notifications === plan.bookings.length,
      `expected ${plan.bookings.length} booking notifications, found ${notifications}`
    );
    assert(
      new Set(bookings.map((booking) => booking.orderNo)).size === bookings.length,
      "simulation order numbers must be unique"
    );

    const expectedStatusCounts = new Map<string, number>();
    for (const booking of plan.bookings) {
      expectedStatusCounts.set(booking.status, (expectedStatusCounts.get(booking.status) ?? 0) + 1);
    }
    const actualStatusCounts = new Map<string, number>();
    for (const booking of bookings) {
      actualStatusCounts.set(booking.status, (actualStatusCounts.get(booking.status) ?? 0) + 1);
    }
    for (const [status, expectedCount] of expectedStatusCounts) {
      assert(
        actualStatusCounts.get(status) === expectedCount,
        `expected ${expectedCount} ${status} orders, found ${actualStatusCounts.get(status) ?? 0}`
      );
    }

    const completedBookings = expectedStatusCounts.get("COMPLETED") ?? 0;
    assert(
      financials === completedBookings,
      `expected ${completedBookings} completed-order financials, found ${financials}`
    );
    const historyCount = await prisma.orderStatusHistory.count({
      where: {
        bookingOrder: { orderNo: { startsWith: SIMULATION_ORDER_PREFIX }, deletedAt: null },
        deletedAt: null
      }
    });
    assert(
      historyCount === plan.histories.length,
      `expected ${plan.histories.length} status-history rows, found ${historyCount}`
    );

    const techniciansPerShop = new Map<number, number>();
    for (const user of technicianUsers) {
      const shopId = user.technicianProfile?.shopId;
      assert(shopId, `technician ${user.email} has no shop`);
      techniciansPerShop.set(shopId, (techniciansPerShop.get(shopId) ?? 0) + 1);
    }
    assert(
      shops.every((shop) => techniciansPerShop.get(shop.id) === 10),
      "every simulation shop must have exactly 10 technicians"
    );

    const representativeAccounts = [owners[0], technicianUsers[0], customerUsers[0]];
    assert(representativeAccounts.every(Boolean), "representative login accounts are missing");
    const passwordChecks = await Promise.all(
      representativeAccounts.map((account) =>
        compare(
          deriveSimulationAccountPassword(seedConfig.passwordSeed, account.email),
          account.passwordHash
        )
      )
    );
    assert(passwordChecks.every(Boolean), "representative simulation passwords do not match export");

    const firstSlot = scheduleSlots.reduce((earliest, slot) =>
      slot.startsAt < earliest.startsAt ? slot : earliest
    );
    const lastSlot = scheduleSlots.reduce((latest, slot) =>
      slot.endsAt > latest.endsAt ? slot : latest
    );
    const customerWalletBalances = customerWallets.map((wallet) => wallet.availableBalance);

    console.log(
      JSON.stringify(
        {
          database: seedConfig.databaseName,
          accounts: {
            merchantOwners: owners.length,
            technicians: technicianUsers.length,
            customers: customerUsers.length,
            passwordSamplesVerified: passwordChecks.length
          },
          shops: shops.length,
          techniciansPerShop: Object.fromEntries(
            shops.map((shop) => [shop.id, techniciansPerShop.get(shop.id) ?? 0])
          ),
          services,
          technicianServices,
          customerWallets: customerWallets.length,
          customerWalletBalanceSummary: {
            minimum: Math.min(...customerWalletBalances),
            maximum: Math.max(...customerWalletBalances),
            total: customerWalletBalances.reduce((sum, balance) => sum + balance, 0)
          },
          seedLedgerTransactions,
          seedWalletLedgers,
          scheduleSlots: scheduleSlots.length,
          scheduleRange: {
            first: firstSlot.startsAt.toISOString(),
            last: lastSlot.endsAt.toISOString()
          },
          bookings: bookings.length,
          bookingStatuses: Object.fromEntries(actualStatusCounts),
          statusHistories: historyCount,
          completedOrderFinancials: financials,
          notifications,
          status: "ok"
        },
        null,
        2
      )
    );
  } finally {
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
