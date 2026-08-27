import { BookingOrderStatus, TechnicianEmploymentType } from "@prisma/client";
import { compare } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  LIFEDANCE_ADMIN_EMAIL,
  LIFEDANCE_LEGACY_OWNER_EMAIL,
  LIFEDANCE_SHOP_NAME,
  SIMULATION_END_AT,
  SIMULATION_NAMESPACE,
  SIMULATION_ORDER_PREFIX,
  SIMULATION_START_AT,
  buildThreeMonthSimulationPlan
} from "../src/simulation/three-month-simulation-plan";
import { getSimulationSeedConfig } from "../src/simulation/simulation-seed-config";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const readJsonRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const seedConfig = getSimulationSeedConfig(process.env);
  const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD?.trim();
  assert(adminPassword, "ADMIN_DEFAULT_PASSWORD is required to verify the LifeDance administrator.");
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
          technicianProfile: { select: { id: true, shopId: true, status: true } },
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
    assert(
      [...plannedAvatarByEmail.values()].every((avatarUrl) =>
        existsSync(resolve(__dirname, "../..", `public${avatarUrl}`))
      ),
      "every simulation avatar URL must resolve to a project asset"
    );

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
        adminIdentities.some(
          (identity) => identity.type === "platform" && identity.isDefault
        ),
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
    assert(!activeLegacyAdministrator, "legacy administrator email must not resolve to an active user");
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
    assert(
      customerWallets.length === 100,
      `expected 100 customer wallets, found ${customerWallets.length}`
    );
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

    const candidateMessages = await prisma.message.findMany({
      where: {
        createdAt: { gte: new Date(SIMULATION_START_AT), lte: new Date(SIMULATION_END_AT) },
        deletedAt: null
      },
      select: { id: true, conversationId: true, metadata: true }
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
        participants: {
          where: { deletedAt: null },
          select: { userId: true }
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
      type: "customer" | "technician" | "shop_owner",
      key: string
    ): number => {
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
      select: { ownerUserId: true, contactUserId: true }
    });
    const simulationContacts = candidateContacts.filter((contact) =>
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
          account.email === LIFEDANCE_ADMIN_EMAIL
            ? adminPassword
            : seedConfig.defaultPassword,
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
          accounts: {
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
          simulationConversations: simulationConversations.length,
          simulationMessages: simulationMessages.length,
          simulationContacts: simulationContacts.length,
          focusedCustomerConversations: focusedCustomerConversations.length,
          focusedCustomerMessages: focusedCustomerMessages.length,
          focusedCustomerContacts: focusedCustomerContacts.length,
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
