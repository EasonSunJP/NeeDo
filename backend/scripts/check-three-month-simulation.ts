import { BookingOrderStatus, TechnicianEmploymentType } from "@prisma/client";
import { compare } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  LIFEDANCE_ADMIN_EMAIL,
  LIFEDANCE_LEGACY_OWNER_EMAIL,
  LIFEDANCE_SHOP_KEY,
  LIFEDANCE_SHOP_NAME,
  SIMULATION_AS_OF_AT,
  SIMULATION_END_AT,
  SIMULATION_NAMESPACE,
  SIMULATION_ORDER_PREFIX,
  SIMULATION_START_AT,
  buildThreeMonthSimulationPlan
} from "../src/simulation/three-month-simulation-plan";
import { getSimulationSeedConfig } from "../src/simulation/simulation-seed-config";
import { BackofficeRepository } from "../src/repositories/backoffice.repository";
import { LIFEDANCE_PAYROLL_PERIODS } from "../src/simulation/lifedance-payroll-seed";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const readJsonRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const loadEnvironmentFile = (): void => {
  const requestedEnvFile = process.env.ENV_FILE?.trim();
  if (process.env.ALLOW_STAGING_SIMULATION_SYNC === "true" && !requestedEnvFile) {
    return;
  }
  const envFile = requestedEnvFile || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
};

const main = async (): Promise<void> => {
  loadEnvironmentFile();
  const seedConfig = getSimulationSeedConfig(process.env);
  const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD?.trim();
  assert(
    adminPassword,
    "ADMIN_DEFAULT_PASSWORD is required to verify the LifeDance administrator."
  );
  const [{ prisma, disconnectPrisma }] = await Promise.all([import("../src/prisma/client")]);
  const plan = buildThreeMonthSimulationPlan();

  try {
    const ownerEmails = plan.shops.map((shop) => shop.ownerEmail);
    const technicianEmails = plan.technicians.map((technician) => technician.email);
    const customerEmails = plan.customers.map((customer) => customer.email);
    const [owners, technicianUsers, customerUsers] = await Promise.all([
      prisma.user.findMany({
        where: { email: { in: ownerEmails }, isActive: true, deletedAt: null },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          avatarUrl: true,
          customerProfile: { select: { id: true } },
          technicianProfile: {
            select: { id: true, shopId: true, status: true, employmentType: true }
          }
        }
      }),
      prisma.user.findMany({
        where: { email: { in: technicianEmails }, isActive: true, deletedAt: null },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          avatarUrl: true,
          technicianProfile: {
            select: {
              id: true,
              shopId: true,
              status: true,
              employmentType: true,
              employmentStartedAt: true
            }
          },
          customerProfile: { select: { id: true } }
        }
      }),
      prisma.user.findMany({
        where: { email: { in: customerEmails }, isActive: true, deletedAt: null },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          avatarUrl: true,
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

    const plannedAvatarByEmail = new Map([
      ...plan.shops.map((shop) => [shop.ownerEmail, shop.avatarUrl] as const),
      ...plan.technicians.map((technician) => [technician.email, technician.avatarUrl] as const),
      ...plan.customers.map((customer) => [customer.email, customer.avatarUrl] as const)
    ]);
    const simulationUsers = [...owners, ...technicianUsers, ...customerUsers];
    const simulationUserIds = simulationUsers.map((user) => user.id);
    assert(
      simulationUsers.every(
        (user) =>
          user.email === LIFEDANCE_ADMIN_EMAIL ||
          user.avatarUrl === plannedAvatarByEmail.get(user.email)
      ),
      "every simulation account must use its deterministic generated avatar"
    );
    if (!seedConfig.preserveExistingPasswords) {
      assert(
        [...plannedAvatarByEmail.values()].every((avatarUrl) =>
          existsSync(resolve(__dirname, "../..", `public${avatarUrl}`))
        ),
        "every simulation avatar URL must resolve to a project asset"
      );
    }

    const shops = await prisma.shop.findMany({
      where: { ownerUserId: { in: owners.map((owner) => owner.id) }, deletedAt: null },
      select: { id: true, ownerUserId: true, name: true, status: true }
    });
    assert(shops.length === 10, `expected 10 simulation shops, found ${shops.length}`);
    assert(
      shops.every((shop) => shop.status === "published"),
      "all simulation shops must publish"
    );

    const [activeIdentities, activeRoles] = await Promise.all([
      prisma.userIdentity.findMany({
        where: {
          userId: { in: simulationUserIds },
          isActive: true,
          deletedAt: null
        },
        select: {
          userId: true,
          type: true,
          scopeType: true,
          scopeId: true,
          activeKey: true,
          isDefault: true
        }
      }),
      prisma.userRole.findMany({
        where: { userId: { in: simulationUserIds }, deletedAt: null },
        select: { userId: true, role: { select: { code: true } } }
      })
    ]);
    const identitiesByUser = new Map<number, typeof activeIdentities>();
    for (const identity of activeIdentities) {
      identitiesByUser.set(identity.userId, [
        ...(identitiesByUser.get(identity.userId) ?? []),
        identity
      ]);
    }
    const roleCodesByUser = new Map<number, Set<string>>();
    for (const role of activeRoles) {
      const codes = roleCodesByUser.get(role.userId) ?? new Set<string>();
      codes.add(role.role.code);
      roleCodesByUser.set(role.userId, codes);
    }
    const expectIdentity = (
      user: { id: number; email: string },
      type: string,
      scopeType: string,
      scopeId: number | null
    ): void => {
      const identities = identitiesByUser.get(user.id) ?? [];
      assert(
        identities.some(
          (identity) =>
            identity.type === type &&
            identity.scopeType === scopeType &&
            identity.scopeId === scopeId
        ),
        `${user.email} is missing ${type}/${scopeType}/${String(scopeId)} identity`
      );
    };
    const assertIdentityMatrix = (
      user: (typeof simulationUsers)[number],
      expectedTypes: string[],
      expectedRoleCodes: string[]
    ): void => {
      const identities = identitiesByUser.get(user.id) ?? [];
      const types = new Set(identities.map((identity) => identity.type));
      assert(
        expectedTypes.every((type) => types.has(type)),
        `${user.email} is missing identities: ${expectedTypes.filter((type) => !types.has(type)).join(", ")}`
      );
      assert(
        identities.every((identity) => identity.activeKey),
        `${user.email} has an active identity without an idempotency key`
      );
      const roleCodes = roleCodesByUser.get(user.id) ?? new Set<string>();
      assert(
        expectedRoleCodes.every((code) => roleCodes.has(code)),
        `${user.email} is missing roles: ${expectedRoleCodes.filter((code) => !roleCodes.has(code)).join(", ")}`
      );
    };
    const shopByOwnerUserId = new Map(shops.map((shop) => [shop.ownerUserId, shop]));
    for (const owner of owners) {
      assert(owner.customerProfile, `${owner.email} is missing a customer profile`);
      assert(owner.technicianProfile, `${owner.email} is missing a technician profile`);
      const ownerShop = shopByOwnerUserId.get(owner.id);
      assert(ownerShop, `${owner.email} is missing an owned shop`);
      assertIdentityMatrix(
        owner,
        ["customer", "technician", "merchant_owner", "scout"],
        ["customer", "technician", "merchant_owner", "scout"]
      );
      const identities = identitiesByUser.get(owner.id) ?? [];
      assert(
        identities.some(
          (identity) =>
            identity.type === "customer" && identity.scopeId === owner.customerProfile?.id
        ),
        `${owner.email} customer identity scope is invalid`
      );
      assert(
        identities.some(
          (identity) =>
            identity.type === "technician" && identity.scopeId === owner.technicianProfile?.id
        ),
        `${owner.email} technician identity scope is invalid`
      );
      assert(
        identities.some(
          (identity) => identity.type === "merchant_owner" && identity.scopeId === ownerShop.id
        ),
        `${owner.email} merchant identity scope is invalid`
      );
    }
    const admin = owners.find((owner) => owner.email === LIFEDANCE_ADMIN_EMAIL);
    assert(admin, "LifeDance administrator is missing from the owner cohort");
    assert(admin.customerProfile, "LifeDance administrator customer profile is missing");
    assert(admin.technicianProfile, "LifeDance administrator technician profile is missing");
    const lifeDanceShop = shops.find((shop) => shop.name === LIFEDANCE_SHOP_NAME);
    assert(lifeDanceShop, "LifeDance shop was not updated in place");
    expectIdentity(admin, "platform", "global", null);
    expectIdentity(admin, "customer", "customer_profile", admin.customerProfile.id);
    expectIdentity(admin, "merchant_owner", "shop", lifeDanceShop.id);
    expectIdentity(admin, "technician", "technician_profile", admin.technicianProfile.id);
    expectIdentity(admin, "scout", "global", null);
    const adminIdentities = identitiesByUser.get(admin.id) ?? [];
    assert(
      adminIdentities.filter((identity) => identity.isDefault).length === 1 &&
        adminIdentities.some((identity) => identity.type === "platform" && identity.isDefault),
      "only the LifeDance platform identity may be the default identity"
    );
    assert(
      admin.technicianProfile.shopId === null &&
        admin.technicianProfile.status === "private" &&
        admin.technicianProfile.employmentType === TechnicianEmploymentType.INDEPENDENT,
      "LifeDance administrator technician profile must remain private and independent"
    );
    assert(
      roleCodesByUser.get(admin.id)?.has("admin") &&
        ["customer", "merchant_owner", "technician", "scout"].every((roleCode) =>
          roleCodesByUser.get(admin.id)?.has(roleCode)
        ),
      "LifeDance administrator is missing a cross-portal role"
    );
    for (const technician of technicianUsers) {
      assert(technician.customerProfile, `${technician.email} is missing a customer profile`);
      assertIdentityMatrix(
        technician,
        ["customer", "technician", "scout"],
        ["customer", "technician", "scout"]
      );
    }
    for (const customer of customerUsers) {
      const identities = identitiesByUser.get(customer.id) ?? [];
      assert(
        identities.length === 1 && identities[0]?.type === "customer",
        `${customer.email} must keep the customer identity only`
      );
      assertIdentityMatrix(customer, ["customer"], ["customer"]);
    }

    const shopIds = shops.map((shop) => shop.id);
    const technicianProfileIds = technicianUsers.flatMap((user) =>
      user.technicianProfile ? [user.technicianProfile.id] : []
    );
    const [
      activeLegacyAdministrator,
      previousLifeDanceOwner,
      lifeDanceMerchantAccounts,
      adminTechnicianServices,
      adminAvailabilities,
      adminBookings
    ] = await Promise.all([
      prisma.user.findFirst({
        where: { email: "admin@example.com", isActive: true, deletedAt: null },
        select: { id: true }
      }),
      prisma.user.findUnique({
        where: { email: LIFEDANCE_LEGACY_OWNER_EMAIL },
        select: {
          id: true,
          technicianProfile: { select: { shopId: true, status: true, employmentType: true } }
        }
      }),
      prisma.merchantAccount.findMany({
        where: {
          code: "lifedance-real-ops",
          ownerUserId: admin.id,
          status: "active",
          deletedAt: null
        },
        select: {
          id: true,
          memberships: {
            where: {
              shopId: lifeDanceShop.id,
              endsAt: null,
              deletedAt: null
            },
            select: { id: true }
          }
        }
      }),
      prisma.technicianService.count({
        where: { technicianId: admin.technicianProfile.id, deletedAt: null }
      }),
      prisma.availability.count({
        where: { technicianProfileId: admin.technicianProfile.id, deletedAt: null }
      }),
      prisma.bookingOrder.count({
        where: { technicianProfileId: admin.technicianProfile.id, deletedAt: null }
      })
    ]);
    assert(
      !activeLegacyAdministrator,
      "legacy administrator email must not resolve to an active user"
    );
    assert(
      lifeDanceMerchantAccounts.length === 1 &&
        lifeDanceMerchantAccounts[0]?.memberships.length === 1,
      "LifeDance administrator must own one active merchant account and shop membership"
    );
    assert(
      adminTechnicianServices === 0 && adminAvailabilities === 0 && adminBookings === 0,
      "LifeDance administrator private technician profile must be non-bookable"
    );
    if (previousLifeDanceOwner) {
      const [previousMerchantIdentities, previousMerchantRoles] = await Promise.all([
        prisma.userIdentity.count({
          where: {
            userId: previousLifeDanceOwner.id,
            type: "merchant_owner",
            scopeType: "shop",
            scopeId: lifeDanceShop.id,
            isActive: true,
            deletedAt: null
          }
        }),
        prisma.userRole.count({
          where: {
            userId: previousLifeDanceOwner.id,
            role: { code: "merchant_owner" },
            scopeType: "shop",
            scopeId: lifeDanceShop.id,
            deletedAt: null
          }
        })
      ]);
      assert(
        previousMerchantIdentities === 0 && previousMerchantRoles === 0,
        "previous LifeDance owner merchant scope must be inactive"
      );
      assert(
        !previousLifeDanceOwner.technicianProfile ||
          (previousLifeDanceOwner.technicianProfile.shopId !== lifeDanceShop.id &&
            previousLifeDanceOwner.technicianProfile.status === "private" &&
            previousLifeDanceOwner.technicianProfile.employmentType ===
              TechnicianEmploymentType.INDEPENDENT),
        "previous LifeDance owner private technician profile must be detached"
      );
    }
    const [
      services,
      technicianServices,
      scheduleSlots,
      bookings,
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
        select: { id: true, technicianProfileId: true, startsAt: true, endsAt: true }
      }),
      prisma.bookingOrder.findMany({
        where: { orderNo: { startsWith: SIMULATION_ORDER_PREFIX }, deletedAt: null },
        select: {
          id: true,
          orderNo: true,
          shopId: true,
          technicianProfileId: true,
          status: true,
          priceAmount: true,
          paymentStatus: true,
          paymentAmountJpy: true,
          serviceSnapshotJson: true,
          startsAt: true,
          endsAt: true,
          statusHistory: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            select: { toStatus: true, createdAt: true }
          },
          financial: {
            select: {
              ndpCurrency: true,
              serviceAmountJpy: true,
              offlineReportedServiceAmountJpy: true,
              paymentChannel: true,
              serviceIncomeStatus: true,
              moneyTimelineJson: true,
              serviceIncomeConfirmedById: true,
              serviceIncomeConfirmedAt: true,
              settlementStatus: true,
              deletedAt: true
            }
          }
        }
      }),
      prisma.wallet.findMany({
        where: {
          ownerType: "USER",
          ownerId: { in: customerUsers.map((user) => user.id) },
          currency: "TEST_NDP",
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
          title: "ご予約状況のお知らせ",
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
    assert(
      customerWallets.length === 100,
      `expected 100 customer wallets, found ${customerWallets.length}`
    );
    assert(
      customerWallets.every((wallet) => wallet.availableBalance === 100_000),
      "every simulation customer wallet must have exactly 100000 Test NDP available"
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
    const orderFinancials = bookings.flatMap((booking) =>
      booking.financial && !booking.financial.deletedAt ? [booking.financial] : []
    );
    assert(
      orderFinancials.length === completedBookings,
      `expected ${completedBookings} completed-order financials, found ${orderFinancials.length}`
    );
    for (const booking of bookings) {
      const snapshot = readJsonRecord(booking.serviceSnapshotJson);
      assert(
        snapshot?.namespace === SIMULATION_NAMESPACE &&
          snapshot.dataset === "lifedance_real_operations",
        `${booking.orderNo} is missing the formal dataset marker`
      );
      const latestHistory = booking.statusHistory.at(-1);
      assert(latestHistory, `${booking.orderNo} has no status history`);
      assert(
        latestHistory.toStatus === booking.status,
        `${booking.orderNo} latest history does not match its order status`
      );
      if (booking.status === BookingOrderStatus.COMPLETED) {
        const financial = booking.financial;
        assert(financial && !financial.deletedAt, `${booking.orderNo} has no active financial`);
        const payrollPeriod = LIFEDANCE_PAYROLL_PERIODS.find(
          (period) =>
            booking.endsAt >= new Date(period.periodStart) &&
            booking.endsAt <= new Date(period.periodEnd)
        );
        assert(
          booking.shopId !== lifeDanceShop.id || payrollPeriod,
          `${booking.orderNo} completed outside the three approved payroll periods`
        );
        const expectedSettlementStatus =
          booking.shopId !== lifeDanceShop.id
            ? "ready_for_payroll"
            : payrollPeriod?.shouldPay
              ? "settled"
              : "payroll_approved";
        assert(
          booking.paymentStatus === "CONFIRMED" &&
            booking.paymentAmountJpy === Number(booking.priceAmount),
          `${booking.orderNo} payment is not confirmed or reconciled`
        );
        assert(
          financial.ndpCurrency === "TEST_NDP" &&
            financial.serviceAmountJpy === Number(booking.priceAmount) &&
            financial.offlineReportedServiceAmountJpy === Number(booking.priceAmount) &&
            financial.serviceIncomeStatus === "confirmed" &&
            ["offline_card", "onsite_cash"].includes(financial.paymentChannel) &&
            financial.serviceIncomeConfirmedById === admin.id &&
            financial.serviceIncomeConfirmedAt &&
            financial.settlementStatus === expectedSettlementStatus &&
            Array.isArray(financial.moneyTimelineJson) &&
            financial.moneyTimelineJson.length > 0,
          `${booking.orderNo} income or settlement fields do not reconcile`
        );
      } else {
        assert(!booking.financial, `${booking.orderNo} must not have confirmed income`);
      }
    }
    const historyCount = bookings.reduce(
      (total, booking) => total + booking.statusHistory.length,
      0
    );
    assert(
      historyCount === plan.histories.length,
      `expected ${plan.histories.length} status-history rows, found ${historyCount}`
    );
    const representativeLifeDanceOrder = bookings.find(
      (booking) => booking.shopId === lifeDanceShop.id
    );
    assert(representativeLifeDanceOrder, "LifeDance has no representative order");
    const backofficeRepository = new BackofficeRepository(prisma);
    const [platformOrderResult, merchantOrderResult] = await Promise.all([
      backofficeRepository.listOrders({
        scope: "platform",
        page: 1,
        pageSize: 1,
        keyword: representativeLifeDanceOrder.orderNo
      }),
      backofficeRepository.listOrders({
        scope: "merchant",
        shopId: lifeDanceShop.id,
        page: 1,
        pageSize: 1,
        keyword: representativeLifeDanceOrder.orderNo
      })
    ]);
    assert(
      platformOrderResult.list[0]?.id === representativeLifeDanceOrder.id &&
        merchantOrderResult.list[0]?.id === representativeLifeDanceOrder.id,
      "the same LifeDance order must be visible in platform and merchant repository scopes"
    );

    const candidateMessages = await prisma.message.findMany({
      where: {
        createdAt: { gte: new Date(SIMULATION_START_AT), lte: new Date(SIMULATION_END_AT) },
        deletedAt: null
      },
      select: {
        id: true,
        conversationId: true,
        senderUserId: true,
        createdAt: true,
        metadata: true
      }
    });
    const simulationMessages = candidateMessages.filter((message) => {
      const metadata = readJsonRecord(message.metadata);
      return (
        metadata?.namespace === SIMULATION_NAMESPACE &&
        metadata.dataset === "im" &&
        metadata.previewCustomer === false
      );
    });
    assert(
      simulationMessages.length === plan.messages.length,
      `expected ${plan.messages.length} simulation messages, found ${simulationMessages.length}`
    );
    const simulationConversationIds = [
      ...new Set(simulationMessages.map((message) => message.conversationId))
    ];
    const simulationConversations = await prisma.conversation.findMany({
      where: { id: { in: simulationConversationIds }, deletedAt: null },
      select: {
        id: true,
        type: true,
        participants: {
          where: { deletedAt: null },
          select: {
            userId: true,
            unreadCount: true,
            isPinned: true,
            isMuted: true,
            lastReadAt: true
          }
        }
      }
    });
    assert(
      simulationConversations.length === plan.conversations.length,
      `expected ${plan.conversations.length} simulation conversations, found ${simulationConversations.length}`
    );
    assert(
      simulationConversations.every((conversation) => conversation.participants.length === 2),
      "every simulation direct conversation must have exactly two active participants"
    );
    const focusedCustomer = customerUsers.find(
      (customer) => customer.email === "sim.customer.100@needo.local"
    );
    assert(focusedCustomer, "focused simulation customer account is missing");
    const focusedCustomerMessages = candidateMessages.filter((message) => {
      const metadata = readJsonRecord(message.metadata);
      return (
        metadata?.namespace === SIMULATION_NAMESPACE &&
        metadata.dataset === "im" &&
        metadata.focusedCustomer === true &&
        metadata.previewCustomer === false
      );
    });
    const focusedCustomerConversationIds = [
      ...new Set(focusedCustomerMessages.map((message) => message.conversationId))
    ];
    const focusedCustomerConversations = simulationConversations.filter((conversation) =>
      focusedCustomerConversationIds.includes(conversation.id)
    );
    assert(
      focusedCustomerConversations.length === 12,
      `expected 12 focused customer conversations, found ${focusedCustomerConversations.length}`
    );
    assert(
      focusedCustomerMessages.length === 68,
      `expected 68 focused customer messages, found ${focusedCustomerMessages.length}`
    );
    assert(
      focusedCustomerConversations.every((conversation) =>
        conversation.participants.some((participant) => participant.userId === focusedCustomer.id)
      ),
      "every focused conversation must include the customer-100 formal account"
    );

    const ownerIdByKey = new Map(
      plan.shops.flatMap((shop) => {
        const owner = owners.find((candidate) => candidate.email === shop.ownerEmail);
        return owner ? [[shop.key, owner.id] as const] : [];
      })
    );
    const technicianIdByKey = new Map(
      plan.technicians.flatMap((technician) => {
        const user = technicianUsers.find((candidate) => candidate.email === technician.email);
        return user ? [[technician.key, user.id] as const] : [];
      })
    );
    const customerIdByKey = new Map(
      plan.customers.flatMap((customer) => {
        const user = customerUsers.find((candidate) => candidate.email === customer.email);
        return user ? [[customer.key, user.id] as const] : [];
      })
    );
    const resolveParticipantId = (
      type: "admin" | "customer" | "technician" | "shop_owner",
      key: string
    ): number => {
      if (type === "admin") {
        return admin.id;
      }
      const source =
        type === "customer"
          ? customerIdByKey
          : type === "technician"
            ? technicianIdByKey
            : ownerIdByKey;
      const value = source.get(key);
      assert(value, `missing ${type} participant id for ${key}`);
      return value;
    };
    const expectedContactKeys = new Set(
      plan.contacts.map(
        (contact) =>
          `${resolveParticipantId(contact.ownerType, contact.ownerKey)}:${resolveParticipantId(
            contact.contactType,
            contact.contactKey
          )}`
      )
    );
    const candidateContacts = await prisma.contact.findMany({
      where: {
        ownerUserId: {
          in: [...ownerIdByKey.values(), ...technicianIdByKey.values(), ...customerIdByKey.values()]
        },
        deletedAt: null
      },
      select: { ownerUserId: true, contactUserId: true, source: true }
    });
    const simulationContactSources = new Set([
      "simulation_seed",
      "lifedance_customer_service_seed",
      "lifedance_staff_seed"
    ]);
    const simulationContacts = candidateContacts.filter(
      (contact) =>
        simulationContactSources.has(contact.source) &&
        expectedContactKeys.has(`${contact.ownerUserId}:${contact.contactUserId}`)
    );
    assert(
      simulationContacts.length === plan.contacts.length,
      `expected ${plan.contacts.length} simulation contacts, found ${simulationContacts.length}`
    );
    const focusedCustomerContacts = simulationContacts.filter(
      (contact) => contact.ownerUserId === focusedCustomer.id
    );
    assert(
      focusedCustomerContacts.length === 12,
      `expected 12 focused customer contacts, found ${focusedCustomerContacts.length}`
    );

    const fixedRealtimeAccounts = await prisma.user.findMany({
      where: {
        email: {
          in: ["customer@example.com", "technician@example.com", "merchant@example.com"]
        },
        isActive: true,
        deletedAt: null
      },
      select: { id: true, email: true }
    });
    assert(fixedRealtimeAccounts.length === 3, "fixed realtime test accounts are missing");
    const fixedRealtimeUserIdByEmail = new Map(
      fixedRealtimeAccounts.map((account) => [account.email, account.id])
    );
    const fixedCustomerUserId = getRequiredId(
      fixedRealtimeUserIdByEmail,
      "customer@example.com",
      "fixed customer user"
    );
    const fixedCounterpartUserIds = [
      getRequiredId(
        fixedRealtimeUserIdByEmail,
        "technician@example.com",
        "fixed technician user"
      ),
      getRequiredId(
        fixedRealtimeUserIdByEmail,
        "merchant@example.com",
        "fixed merchant user"
      )
    ];
    const fixedRealtimeContacts = await prisma.contact.count({
      where: {
        deletedAt: null,
        OR: fixedCounterpartUserIds.flatMap((counterpartUserId) => [
          { ownerUserId: fixedCustomerUserId, contactUserId: counterpartUserId },
          { ownerUserId: counterpartUserId, contactUserId: fixedCustomerUserId }
        ])
      }
    });
    assert(fixedRealtimeContacts === 4, `expected 4 fixed realtime contacts, found ${fixedRealtimeContacts}`);
    const fixedRealtimeConversations = await prisma.conversation.findMany({
      where: {
        deletedAt: null,
        AND: [
          { participants: { some: { userId: fixedCustomerUserId, deletedAt: null } } },
          { participants: { some: { userId: { in: fixedCounterpartUserIds }, deletedAt: null } } }
        ]
      },
      select: { id: true }
    });
    assert(
      fixedRealtimeConversations.length === 2,
      `expected 2 fixed realtime conversations, found ${fixedRealtimeConversations.length}`
    );
    const fixedRealtimeMessages = await prisma.message.count({
      where: {
        conversationId: { in: fixedRealtimeConversations.map((conversation) => conversation.id) },
        deletedAt: null
      }
    });
    assert(fixedRealtimeMessages >= 8, `expected at least 8 fixed realtime messages, found ${fixedRealtimeMessages}`);
    const experienceEligibleUsers = await prisma.user.count({
      where: {
        isTestAccount: true,
        isActive: true,
        deletedAt: null,
        customerProfile: { is: { deletedAt: null } }
      }
    });
    const activeExperienceAccounts = await prisma.userExperienceAccount.count({
      where: {
        deletedAt: null,
        user: {
          isTestAccount: true,
          isActive: true,
          deletedAt: null,
          customerProfile: { is: { deletedAt: null } }
        }
      }
    });
    assert(
      activeExperienceAccounts === experienceEligibleUsers,
      `expected ${experienceEligibleUsers} active test experience accounts, found ${activeExperienceAccounts}`
    );

    const lifeDanceStaffMessages = simulationMessages.filter((message) => {
      const metadata = readJsonRecord(message.metadata);
      return metadata?.purpose === "staff_operations";
    });
    const lifeDanceStaffConversationIds = [
      ...new Set(lifeDanceStaffMessages.map((message) => message.conversationId))
    ];
    const lifeDanceStaffConversations = simulationConversations.filter((conversation) =>
      lifeDanceStaffConversationIds.includes(conversation.id)
    );
    const lifeDanceStaffContacts = simulationContacts.filter(
      (contact) => contact.source === "lifedance_staff_seed"
    );
    const lifeDanceStaffUserIds = new Set(
      plan.technicians
        .filter((technician) => technician.shopKey === LIFEDANCE_SHOP_KEY)
        .map((technician) => resolveParticipantId("technician", technician.key))
    );
    assert(
      lifeDanceStaffConversations.length === 20,
      `expected 20 LifeDance staff conversations, found ${lifeDanceStaffConversations.length}`
    );
    assert(
      lifeDanceStaffMessages.length === 200,
      `expected 200 LifeDance staff messages, found ${lifeDanceStaffMessages.length}`
    );
    assert(
      lifeDanceStaffContacts.length === 40,
      `expected 40 LifeDance staff contacts, found ${lifeDanceStaffContacts.length}`
    );
    for (const conversation of lifeDanceStaffConversations) {
      assert(
        conversation.type === "DIRECT" && conversation.participants.length === 2,
        `staff conversation ${conversation.id} must be a two-person direct conversation`
      );
      const participantIds = new Set(
        conversation.participants.map((participant) => participant.userId)
      );
      assert(
        participantIds.has(admin.id) &&
          [...participantIds].filter((userId) => lifeDanceStaffUserIds.has(userId)).length === 1,
        `staff conversation ${conversation.id} must contain only the admin and one LifeDance employee`
      );
      assert(
        conversation.participants.every((participant) => participant.lastReadAt),
        `staff conversation ${conversation.id} must persist read state`
      );
      const conversationMessages = lifeDanceStaffMessages
        .filter((message) => message.conversationId === conversation.id)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
      assert(
        conversationMessages.length === 10,
        `staff conversation ${conversation.id} must contain 10 messages`
      );
      assert(
        new Set(conversationMessages.map((message) => message.senderUserId)).size === 2,
        `staff conversation ${conversation.id} must contain messages from both participants`
      );
      assert(
        conversationMessages.every(
          (message, index) =>
            index === 0 || conversationMessages[index - 1]!.createdAt < message.createdAt
        ),
        `staff conversation ${conversation.id} messages must be strictly ordered`
      );
    }
    const lifeDanceStaffParticipantStates = lifeDanceStaffConversations.flatMap(
      (conversation) => conversation.participants
    );
    assert(
      lifeDanceStaffParticipantStates.some((participant) => participant.isPinned) &&
        lifeDanceStaffParticipantStates.some((participant) => participant.isMuted) &&
        lifeDanceStaffParticipantStates.some((participant) => participant.unreadCount > 0),
      "LifeDance staff conversations must persist varied pin, mute and unread state"
    );
    assert(
      lifeDanceStaffContacts.every(
        (contact) =>
          (contact.ownerUserId === admin.id && lifeDanceStaffUserIds.has(contact.contactUserId)) ||
          (lifeDanceStaffUserIds.has(contact.ownerUserId) && contact.contactUserId === admin.id)
      ),
      "LifeDance staff contacts must not include technicians from other shops"
    );
    const staffOperations = {
      conversations: lifeDanceStaffConversations.length,
      messages: lifeDanceStaffMessages.length,
      contacts: lifeDanceStaffContacts.length
    };

    const techniciansPerShop = new Map<number, number>();
    for (const user of technicianUsers) {
      const shopId = user.technicianProfile?.shopId;
      assert(shopId, `technician ${user.email} has no shop`);
      techniciansPerShop.set(shopId, (techniciansPerShop.get(shopId) ?? 0) + 1);
    }
    const shopIdByKey = new Map(
      plan.shops.flatMap((shopPlan) => {
        const ownerId = ownerIdByKey.get(shopPlan.key);
        const shop = shops.find((candidate) => candidate.ownerUserId === ownerId);
        return shop ? [[shopPlan.key, shop.id] as const] : [];
      })
    );
    const expectedTechniciansPerShop = new Map<string, number>();
    for (const technician of plan.technicians) {
      expectedTechniciansPerShop.set(
        technician.shopKey,
        (expectedTechniciansPerShop.get(technician.shopKey) ?? 0) + 1
      );
    }
    for (const [shopKey, expectedCount] of expectedTechniciansPerShop) {
      const shopId = shopIdByKey.get(shopKey);
      assert(shopId, `shop id is missing for ${shopKey}`);
      assert(
        techniciansPerShop.get(shopId) === expectedCount,
        `${shopKey} expected ${expectedCount} technicians, found ${techniciansPerShop.get(shopId) ?? 0}`
      );
    }

    const lifeDanceTechnicianPlans = plan.technicians.filter(
      (technician) => technician.shopKey === LIFEDANCE_SHOP_KEY
    );
    const lifeDanceTechnicians = lifeDanceTechnicianPlans.map((technicianPlan) => {
      const user = technicianUsers.find((candidate) => candidate.email === technicianPlan.email);
      assert(user?.technicianProfile, `${technicianPlan.email} profile is missing`);
      const expectedEmploymentType =
        technicianPlan.employmentType === "FULL_TIME"
          ? TechnicianEmploymentType.FULL_TIME
          : TechnicianEmploymentType.TEMPORARY;
      assert(
        user.technicianProfile.shopId === lifeDanceShop.id &&
          user.technicianProfile.employmentType === expectedEmploymentType &&
          user.technicianProfile.employmentStartedAt?.toISOString() ===
            technicianPlan.employmentStartedAt,
        `${technicianPlan.email} employment does not match the LifeDance plan`
      );
      return { technicianPlan, user, profile: user.technicianProfile };
    });
    assert(lifeDanceTechnicians.length === 20, "LifeDance must have exactly 20 active employees");
    assert(
      lifeDanceTechnicians.filter(
        ({ profile }) => profile.employmentType === TechnicianEmploymentType.FULL_TIME
      ).length === 10 &&
        lifeDanceTechnicians.filter(
          ({ profile }) => profile.employmentType === TechnicianEmploymentType.TEMPORARY
        ).length === 10,
      "LifeDance employment must be 10 full-time and 10 temporary technicians"
    );
    const organizationDirectory = await backofficeRepository.listTechnicians({
      scope: "merchant",
      shopId: lifeDanceShop.id,
      page: 1,
      pageSize: 100,
      status: "published"
    });
    assert(
      organizationDirectory.total === 20 && organizationDirectory.list.length === 20,
      `LifeDance organization directory expected 20 employees, found ${organizationDirectory.total}`
    );
    assert(
      organizationDirectory.list.every(
        (technician) =>
          technician.shopId === lifeDanceShop.id &&
          ["full_time", "temporary"].includes(technician.employmentType)
      ),
      "LifeDance organization directory contains an outsider or invalid employment type"
    );

    const lifeDanceTechnicianProfileIds = lifeDanceTechnicians.map(({ profile }) => profile.id);
    const [compensationProfiles, payRuns] = await Promise.all([
      prisma.technicianCompensationProfile.findMany({
        where: {
          shopId: lifeDanceShop.id,
          technicianProfileId: { in: lifeDanceTechnicianProfileIds },
          status: { in: ["active", "archived"] },
          deletedAt: null
        },
        select: {
          id: true,
          shopId: true,
          technicianProfileId: true,
          name: true,
          status: true,
          wageMode: true,
          baseSalaryJpy: true,
          hourlyRateJpy: true,
          fixedOrderPayJpy: true,
          commissionRateBps: true,
          ndpFeeBearer: true,
          technicianNdpShareBps: true,
          effectiveFrom: true,
          effectiveTo: true
        }
      }),
      prisma.payRun.findMany({
        where: {
          shopId: lifeDanceShop.id,
          OR: LIFEDANCE_PAYROLL_PERIODS.map((period) => ({
            periodStart: new Date(period.periodStart),
            periodEnd: new Date(period.periodEnd)
          })),
          deletedAt: null
        },
        include: {
          payslips: {
            where: { deletedAt: null },
            include: {
              lines: { where: { deletedAt: null }, orderBy: [{ id: "asc" }] },
              payoutRecords: { where: { deletedAt: null }, orderBy: [{ id: "asc" }] }
            },
            orderBy: [{ technicianProfileId: "asc" }]
          }
        },
        orderBy: [{ periodStart: "asc" }]
      })
    ]);
    const activeCompensationProfiles = compensationProfiles.filter(
      (profile) => profile.status === "active"
    );
    assert(
      activeCompensationProfiles.length === 20,
      `expected 20 active compensation profiles, found ${activeCompensationProfiles.length}`
    );
    const employmentByTechnicianProfileId = new Map(
      lifeDanceTechnicians.map(({ profile }) => [profile.id, profile.employmentType])
    );
    const compensationProfileByTechnicianId = new Map(
      activeCompensationProfiles.map((profile) => [profile.technicianProfileId, profile])
    );
    const compensationProfileById = new Map(
      compensationProfiles.map((profile) => [profile.id, profile])
    );
    for (const technicianProfileId of lifeDanceTechnicianProfileIds) {
      const profile = compensationProfileByTechnicianId.get(technicianProfileId);
      assert(profile, `technician ${technicianProfileId} has no active compensation profile`);
      const employmentType = employmentByTechnicianProfileId.get(technicianProfileId);
      const fullTime = employmentType === TechnicianEmploymentType.FULL_TIME;
      assert(
        profile.name ===
          (fullTime ? "LifeDance 2026 正社員給与" : "LifeDance 2026 臨時スタッフ給与") &&
          profile.wageMode === (fullTime ? "base_plus_commission" : "hourly") &&
          profile.baseSalaryJpy === (fullTime ? 230_000 : 0) &&
          profile.hourlyRateJpy === (fullTime ? 0 : 1_500) &&
          profile.fixedOrderPayJpy === 0 &&
          profile.commissionRateBps === (fullTime ? 2_000 : 0) &&
          profile.ndpFeeBearer === "shop" &&
          profile.technicianNdpShareBps === 0 &&
          profile.effectiveFrom?.toISOString() === "2026-06-01T00:00:00.000Z" &&
          profile.effectiveTo === null,
        `technician ${technicianProfileId} compensation rule does not match employment type`
      );
    }
    assert(payRuns.length === 3, `expected 3 LifeDance pay runs, found ${payRuns.length}`);
    const payrollOrderIds = new Set<number>();
    let payslipOrderLines = 0;
    let payoutRecords = 0;
    let payslips = 0;
    for (const payRun of payRuns) {
      const period = LIFEDANCE_PAYROLL_PERIODS.find(
        (candidate) =>
          payRun.periodStart.toISOString() === candidate.periodStart &&
          payRun.periodEnd.toISOString() === candidate.periodEnd
      );
      assert(period, `pay run ${payRun.id} does not match an approved LifeDance period`);
      assert(
        payRun.generatedById === admin.id && payRun.approvedById === admin.id,
        `pay run ${payRun.id} must be generated and approved by the LifeDance administrator`
      );
      assert(
        payRun.status === (period.shouldPay ? "paid" : "approved"),
        `pay run ${payRun.id} has invalid status ${payRun.status}`
      );
      assert(
        payRun.payslips.length === 20,
        `pay run ${payRun.id} expected 20 payslips, found ${payRun.payslips.length}`
      );
      assert(
        new Set(payRun.payslips.map((payslip) => payslip.technicianProfileId)).size === 20 &&
          payRun.payslips.every((payslip) =>
            lifeDanceTechnicianProfileIds.includes(payslip.technicianProfileId)
          ),
        `pay run ${payRun.id} does not cover the exact LifeDance employee cohort`
      );
      const expectedPeriodOrders = bookings.filter(
        (booking) =>
          booking.shopId === lifeDanceShop.id &&
          booking.status === BookingOrderStatus.COMPLETED &&
          booking.endsAt >= new Date(period.periodStart) &&
          booking.endsAt <= new Date(period.periodEnd)
      );
      const orderLines = payRun.payslips.flatMap((payslip) =>
        payslip.lines.filter((line) => line.sourceType === "order" && line.orderId)
      );
      const orderLineIds = orderLines.flatMap((line) => (line.orderId ? [line.orderId] : []));
      assert(
        orderLineIds.length === expectedPeriodOrders.length &&
          new Set(orderLineIds).size === expectedPeriodOrders.length &&
          expectedPeriodOrders.every((booking) => orderLineIds.includes(booking.id)),
        `pay run ${payRun.id} order lines do not exactly match completed orders in ${period.month}`
      );
      orderLineIds.forEach((orderId) => payrollOrderIds.add(orderId));
      payslipOrderLines += orderLineIds.length;
      payslips += payRun.payslips.length;

      const totals = payRun.payslips.reduce(
        (summary, payslip) => {
          const employmentType = employmentByTechnicianProfileId.get(payslip.technicianProfileId);
          const fullTime = employmentType === TechnicianEmploymentType.FULL_TIME;
          const compensationProfile = payslip.compensationProfileId
            ? compensationProfileById.get(payslip.compensationProfileId)
            : undefined;
          assert(
            compensationProfile &&
              compensationProfile.shopId === lifeDanceShop.id &&
              compensationProfile.technicianProfileId === payslip.technicianProfileId,
            `payslip ${payslip.id} compensation profile is missing or cross-scoped`
          );
          const signedLineTotal = payslip.lines.reduce((total, line) => total + line.amountJpy, 0);
          const ruleBaseLines = payslip.lines.filter(
            (line) => line.sourceType === "rule" && line.lineType === "base_salary"
          );
          assert(
            signedLineTotal === payslip.netPayJpy,
            `payslip ${payslip.id} net pay does not reconcile to signed lines`
          );
          assert(
            fullTime
              ? payslip.baseSalaryJpy === 230_000 &&
                  ruleBaseLines.length === 1 &&
                  ruleBaseLines[0]?.amountJpy === 230_000
              : payslip.baseSalaryJpy > 0 && ruleBaseLines.length === 0,
            `payslip ${payslip.id} base or hourly wage is invalid`
          );
          if (period.shouldPay) {
            assert(
              payslip.status === "paid" &&
                payslip.paidAmountJpy === payslip.netPayJpy &&
                payslip.unpaidAmountJpy === 0 &&
                payslip.payoutRecords.length === 1 &&
                payslip.payoutRecords[0]?.amountJpy === payslip.netPayJpy &&
                payslip.payoutRecords[0]?.status === "completed" &&
                payslip.payoutRecords[0]?.confirmedByTechnician === true &&
                Boolean(payslip.payoutRecords[0]?.technicianConfirmedAt),
              `payslip ${payslip.id} paid-month evidence is incomplete`
            );
          } else {
            assert(
              payslip.status === "approved" &&
                payslip.paidAmountJpy === 0 &&
                payslip.unpaidAmountJpy === payslip.netPayJpy &&
                payslip.payoutRecords.length === 0,
              `payslip ${payslip.id} approved-month unpaid balance is invalid`
            );
          }
          payoutRecords += payslip.payoutRecords.length;
          return {
            base: summary.base + payslip.baseSalaryJpy,
            commission: summary.commission + payslip.commissionJpy,
            bonus: summary.bonus + payslip.bonusJpy,
            allowance: summary.allowance + payslip.allowanceJpy,
            deduction: summary.deduction + payslip.deductionJpy,
            net: summary.net + payslip.netPayJpy,
            paid: summary.paid + payslip.paidAmountJpy,
            unpaid: summary.unpaid + payslip.unpaidAmountJpy
          };
        },
        { base: 0, commission: 0, bonus: 0, allowance: 0, deduction: 0, net: 0, paid: 0, unpaid: 0 }
      );
      assert(
        payRun.totalBaseSalaryJpy === totals.base &&
          payRun.totalCommissionJpy === totals.commission &&
          payRun.totalBonusJpy === totals.bonus &&
          payRun.totalAllowanceJpy === totals.allowance &&
          payRun.totalDeductionJpy === totals.deduction &&
          payRun.totalNetPayJpy === totals.net &&
          payRun.paidAmountJpy === totals.paid &&
          payRun.unpaidAmountJpy === totals.unpaid,
        `pay run ${payRun.id} totals do not reconcile to payslips`
      );
    }
    const lifeDanceCompletedOrders = bookings.filter(
      (booking) =>
        booking.shopId === lifeDanceShop.id && booking.status === BookingOrderStatus.COMPLETED
    );
    assert(
      payrollOrderIds.size === lifeDanceCompletedOrders.length &&
        lifeDanceCompletedOrders.every((booking) => payrollOrderIds.has(booking.id)),
      "every completed LifeDance order must appear exactly once in payroll"
    );
    assert(payslips === 60, `expected 60 payslips, found ${payslips}`);
    assert(payoutRecords === 40, `expected 40 payout records, found ${payoutRecords}`);
    const settlementReconciliation = {
      settled: lifeDanceCompletedOrders.filter(
        (booking) => booking.financial?.settlementStatus === "settled"
      ).length,
      payrollApproved: lifeDanceCompletedOrders.filter(
        (booking) => booking.financial?.settlementStatus === "payroll_approved"
      ).length
    };

    for (const { technicianPlan, profile } of lifeDanceTechnicians) {
      const technicianSlots = scheduleSlots
        .filter((slot) => slot.technicianProfileId === profile.id)
        .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
      const technicianBookings = bookings.filter(
        (booking) => booking.technicianProfileId === profile.id
      );
      const completed = technicianBookings.filter(
        (booking) => booking.status === BookingOrderStatus.COMPLETED
      );
      const completedTokyoMonths = new Set(
        completed.map(
          (booking) => new Date(booking.startsAt.getTime() + 9 * 60 * 60 * 1_000).getUTCMonth() + 1
        )
      );
      assert(technicianSlots.length >= 26, `${technicianPlan.key} has fewer than 26 shifts`);
      assert(technicianBookings.length >= 12, `${technicianPlan.key} has fewer than 12 bookings`);
      assert(completed.length >= 6, `${technicianPlan.key} has fewer than 6 completed bookings`);
      assert(
        [6, 7, 8].every((month) => completedTokyoMonths.has(month)),
        `${technicianPlan.key} needs completed work in June, July and August`
      );
      assert(
        technicianBookings.some(
          (booking) =>
            booking.status === BookingOrderStatus.CONFIRMED &&
            booking.startsAt > new Date(SIMULATION_AS_OF_AT)
        ),
        `${technicianPlan.key} has no future confirmed booking`
      );
      assert(
        technicianSlots.every(
          (slot, index) => index === 0 || technicianSlots[index - 1]!.endsAt <= slot.startsAt
        ),
        `${technicianPlan.key} has overlapping shifts`
      );
    }

    const representativeAccounts = [owners[0], technicianUsers[0], customerUsers[0]];
    assert(representativeAccounts.every(Boolean), "representative login accounts are missing");
    const passwordChecks = await Promise.all(
      representativeAccounts.map((account) =>
        compare(
          account.email === LIFEDANCE_ADMIN_EMAIL ? adminPassword : seedConfig.defaultPassword,
          account.passwordHash
        )
      )
    );
    assert(
      passwordChecks.every(Boolean),
      "representative simulation passwords do not match export"
    );

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
          account: {
            merchantOwners: owners.length,
            technicians: technicianUsers.length,
            customers: customerUsers.length,
            passwordSamplesVerified: passwordChecks.length
          },
          avatars: {
            assigned: simulationUsers.length,
            unique: new Set(simulationUsers.map((user) => user.avatarUrl)).size,
            shopUnique: new Set(owners.map((owner) => owner.avatarUrl)).size
          },
          shop: {
            total: shops.length,
            lifeDanceShopId: lifeDanceShop.id,
            lifeDanceName: lifeDanceShop.name
          },
          employment: {
            lifeDanceEmployees: lifeDanceTechnicians.length,
            fullTime: lifeDanceTechnicians.filter(
              ({ profile }) => profile.employmentType === TechnicianEmploymentType.FULL_TIME
            ).length,
            temporary: lifeDanceTechnicians.filter(
              ({ profile }) => profile.employmentType === TechnicianEmploymentType.TEMPORARY
            ).length
          },
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
          schedule: {
            slots: scheduleSlots.length,
            range: {
              first: firstSlot.startsAt.toISOString(),
              last: lastSlot.endsAt.toISOString()
            }
          },
          bookings: bookings.length,
          bookingsByStatus: Object.fromEntries(actualStatusCounts),
          statusHistories: historyCount,
          orderFinancials: {
            count: orderFinancials.length,
            readyForPayroll: orderFinancials.filter(
              (financial) => financial.settlementStatus === "ready_for_payroll"
            ).length,
            serviceIncomeJpy: orderFinancials.reduce(
              (total, financial) => total + financial.serviceAmountJpy,
              0
            )
          },
          compensationProfiles: activeCompensationProfiles.length,
          payRuns: payRuns.length,
          payslips,
          payslipOrderLines,
          payoutRecords,
          settlementReconciliation,
          notifications,
          simulationConversations: simulationConversations.length,
          simulationMessages: simulationMessages.length,
          simulationContacts: simulationContacts.length,
          focusedCustomerConversations: focusedCustomerConversations.length,
          focusedCustomerMessages: focusedCustomerMessages.length,
          focusedCustomerContacts: focusedCustomerContacts.length,
          fixedRealtimeContacts,
          fixedRealtimeConversations: fixedRealtimeConversations.length,
          fixedRealtimeMessages,
          experienceEligibleUsers,
          activeExperienceAccounts,
          organizationDirectory: organizationDirectory.total,
          staffOperations,
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
