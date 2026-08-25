import {
  BookingOrderStatus,
  ConversationType,
  LedgerTransactionStatus,
  LedgerTransactionType,
  MessageType,
  NotificationType,
  OrderType,
  ScheduleSlotStatus,
  ServicePaymentMethod,
  ServicePaymentStatus,
  ServiceOwnerType,
  ShopPricingMode,
  SocialPostVisibility,
  TechnicianServiceReviewStatus,
  WalletLedgerDirection,
  WalletOwnerType,
  type Prisma
} from "@prisma/client";
import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  SIMULATION_END_AT,
  SIMULATION_AS_OF_AT,
  SIMULATION_NAMESPACE,
  SIMULATION_ORDER_PREFIX,
  SIMULATION_START_AT,
  buildThreeMonthSimulationPlan,
  type SimulationOrderStatus
} from "../src/simulation/three-month-simulation-plan";
import {
  buildFormalTestAccountExportRow,
  orderFormalTestAccountExports,
  resolveFormalNeeDoSequence
} from "../src/simulation/formal-test-account-export";
import { syncFormalSocialAccountProfile } from "../src/simulation/formal-social-account-profile";
import { buildSocialSimulationPlan } from "../src/simulation/social-simulation-plan";
import {
  buildSimulationIdentityGrants,
  simulationIdentityActiveKey
} from "../src/simulation/simulation-identity-matrix";
import {
  getSimulationSeedConfig
} from "../src/simulation/simulation-seed-config";

const BCRYPT_ROUNDS = 12;
const DEFAULT_ACCOUNT_EXPORT_PATH = "../outputs/NeeDo_正式测试账号_2026-08-25.csv";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const getRequiredId = <Key, Value>(
  ids: ReadonlyMap<Key, Value>,
  key: Key,
  entity: string
): Value => {
  const value = ids.get(key);
  if (value === undefined) {
    throw new Error(`${entity} id is missing for ${String(key)}.`);
  }
  return value;
};

const toBookingStatus = (status: SimulationOrderStatus): BookingOrderStatus => {
  const statuses: Record<SimulationOrderStatus, BookingOrderStatus> = {
    PENDING: BookingOrderStatus.PENDING,
    CONFIRMED: BookingOrderStatus.CONFIRMED,
    IN_SERVICE: BookingOrderStatus.IN_SERVICE,
    COMPLETED: BookingOrderStatus.COMPLETED,
    CANCELLED: BookingOrderStatus.CANCELLED
  };
  return statuses[status];
};

const escapeCsv = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const readJsonRecord = (value: Prisma.JsonValue | null): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const chunkRows = <T>(rows: T[], size = 500): T[][] =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size)
  );

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });

  const seedConfig = getSimulationSeedConfig(process.env);
  const [{ prisma, disconnectPrisma }] = await Promise.all([import("../src/prisma/client")]);
  const plan = buildThreeMonthSimulationPlan();
  const socialPlan = buildSocialSimulationPlan();
  const accountEmails = socialPlan.accounts.map((account) => account.email);
  const accountPasswords = new Map(
    accountEmails.map((email) => [email, seedConfig.defaultPassword])
  );
  const passwordHashes = new Map(
    await Promise.all(
      accountEmails.map(async (email) => {
        const password = accountPasswords.get(email);
        assert(password, `Derived simulation password is missing for ${email}.`);
        return [email, await hash(password, BCRYPT_ROUNDS)] as const;
      })
    )
  );

  try {
    const summary = await prisma.$transaction(
      async (tx) => {
        const roles = await tx.role.findMany({
          where: {
            code: { in: ["merchant_owner", "technician", "customer", "scout"] },
            deletedAt: null
          },
          select: { id: true, code: true }
        });
        const roleIds = new Map(roles.map((role) => [role.code, role.id]));
        assert(roleIds.size === 4, "Run the formal User Management seed before simulation data.");
        const category = await tx.category.upsert({
          where: { code: "sim3m-wellness" },
          create: {
            code: "sim3m-wellness",
            name: "Simulation Wellness",
            nameJa: "シミュレーション・ウェルネス",
            nameEn: "Simulation Wellness",
            sortOrder: 900,
            isActive: true
          },
          update: {
            name: "Simulation Wellness",
            nameJa: "シミュレーション・ウェルネス",
            nameEn: "Simulation Wellness",
            sortOrder: 900,
            isActive: true,
            deletedAt: null
          }
        });

        const ownerUserIds = new Map<string, number>();
        const technicianUserIds = new Map<string, number>();
        const customerUserIds = new Map<string, number>();

        for (const shop of plan.shops) {
          const user = await tx.user.upsert({
            where: { email: shop.ownerEmail },
            create: {
              email: shop.ownerEmail,
              passwordHash: getRequiredId(passwordHashes, shop.ownerEmail, "password hash"),
              username: shop.ownerUsername,
              avatarUrl: shop.avatarUrl,
              isActive: true,
              createdAt: new Date("2026-05-15T00:00:00.000Z")
            },
            update: {
              passwordHash: getRequiredId(passwordHashes, shop.ownerEmail, "password hash"),
              username: shop.ownerUsername,
              avatarUrl: shop.avatarUrl,
              isActive: true,
              deletedAt: null
            }
          });
          ownerUserIds.set(shop.key, user.id);
        }

        for (const technician of plan.technicians) {
          const user = await tx.user.upsert({
            where: { email: technician.email },
            create: {
              email: technician.email,
              passwordHash: getRequiredId(passwordHashes, technician.email, "password hash"),
              username: technician.username,
              avatarUrl: technician.avatarUrl,
              isActive: true,
              createdAt: new Date("2026-05-20T00:00:00.000Z")
            },
            update: {
              passwordHash: getRequiredId(passwordHashes, technician.email, "password hash"),
              username: technician.username,
              avatarUrl: technician.avatarUrl,
              isActive: true,
              deletedAt: null
            }
          });
          technicianUserIds.set(technician.key, user.id);
        }

        for (const customer of plan.customers) {
          const user = await tx.user.upsert({
            where: { email: customer.email },
            create: {
              email: customer.email,
              passwordHash: getRequiredId(passwordHashes, customer.email, "password hash"),
              username: customer.username,
              avatarUrl: customer.avatarUrl,
              isActive: true,
              createdAt: new Date("2026-05-25T00:00:00.000Z")
            },
            update: {
              passwordHash: getRequiredId(passwordHashes, customer.email, "password hash"),
              username: customer.username,
              avatarUrl: customer.avatarUrl,
              isActive: true,
              deletedAt: null
            }
          });
          customerUserIds.set(customer.key, user.id);
        }

        const shopIds = new Map<string, number>();
        for (const shop of plan.shops) {
          const ownerUserId = getRequiredId(ownerUserIds, shop.key, "shop owner");
          const existing = await tx.shop.findFirst({ where: { ownerUserId } });
          const record = existing
            ? await tx.shop.update({
                where: { id: existing.id },
                data: {
                  name: shop.name,
                  description: shop.description,
                  city: shop.city,
                  address: shop.address,
                  phone: shop.phone,
                  status: "published",
                  pricingMode: ShopPricingMode.MERCHANT,
                  pricingModeUpdatedBy: ownerUserId,
                  pricingModeUpdatedAt: new Date("2026-05-15T00:00:00.000Z"),
                  deletedAt: null
                }
              })
            : await tx.shop.create({
                data: {
                  ownerUserId,
                  name: shop.name,
                  description: shop.description,
                  city: shop.city,
                  address: shop.address,
                  phone: shop.phone,
                  status: "published",
                  pricingMode: ShopPricingMode.MERCHANT,
                  pricingModeUpdatedBy: ownerUserId,
                  pricingModeUpdatedAt: new Date("2026-05-15T00:00:00.000Z"),
                  createdAt: new Date("2026-05-15T00:00:00.000Z")
                }
              });
          shopIds.set(shop.key, record.id);
        }

        const technicianProfileIds = new Map<string, number>();
        for (const technician of plan.technicians) {
          const userId = getRequiredId(technicianUserIds, technician.key, "technician user");
          const record = await tx.technicianProfile.upsert({
            where: { userId },
            create: {
              userId,
              shopId: getRequiredId(shopIds, technician.shopKey, "shop"),
              displayName: technician.displayName,
              bio: `${SIMULATION_NAMESPACE} の検証用技師プロフィールです。`,
              city: technician.city,
              serviceArea: technician.serviceArea,
              yearsExperience: technician.yearsExperience,
              status: "published",
              verifiedAt: new Date("2026-05-25T00:00:00.000Z"),
              createdAt: new Date("2026-05-20T00:00:00.000Z")
            },
            update: {
              shopId: getRequiredId(shopIds, technician.shopKey, "shop"),
              displayName: technician.displayName,
              bio: `${SIMULATION_NAMESPACE} の検証用技師プロフィールです。`,
              city: technician.city,
              serviceArea: technician.serviceArea,
              yearsExperience: technician.yearsExperience,
              status: "published",
              verifiedAt: new Date("2026-05-25T00:00:00.000Z"),
              deletedAt: null
            }
          });
          technicianProfileIds.set(technician.key, record.id);
        }

        const customerProfileIds = new Map<string, number>();
        const switchingCustomerProfileIds = new Map<number, number>();
        for (const customer of plan.customers) {
          const userId = getRequiredId(customerUserIds, customer.key, "customer user");
          const record = await tx.customerProfile.upsert({
            where: { userId },
            create: {
              userId,
              displayName: customer.displayName,
              bio: `${SIMULATION_NAMESPACE} の検証用顧客プロフィールです。`,
              city: customer.city,
              membershipLevel: customer.membershipLevel,
              isPublic: true,
              createdAt: new Date("2026-05-25T00:00:00.000Z")
            },
            update: {
              displayName: customer.displayName,
              bio: `${SIMULATION_NAMESPACE} の検証用顧客プロフィールです。`,
              city: customer.city,
              membershipLevel: customer.membershipLevel,
              isPublic: true,
              deletedAt: null
            }
          });
          customerProfileIds.set(customer.key, record.id);
          switchingCustomerProfileIds.set(userId, record.id);
        }

        for (const technician of plan.technicians) {
          const userId = getRequiredId(technicianUserIds, technician.key, "technician user");
          const profile = await tx.customerProfile.upsert({
            where: { userId },
            create: {
              userId,
              displayName: technician.displayName,
              bio: `${SIMULATION_NAMESPACE} の技師兼顧客プロフィールです。`,
              city: technician.city,
              membershipLevel: "standard",
              isPublic: true
            },
            update: {
              displayName: technician.displayName,
              bio: `${SIMULATION_NAMESPACE} の技師兼顧客プロフィールです。`,
              city: technician.city,
              membershipLevel: "standard",
              isPublic: true,
              deletedAt: null
            }
          });
          switchingCustomerProfileIds.set(userId, profile.id);
        }

        const ownerTechnicianProfileIds = new Map<string, number>();
        for (const shop of plan.shops) {
          const userId = getRequiredId(ownerUserIds, shop.key, "shop owner");
          const customerProfile = await tx.customerProfile.upsert({
            where: { userId },
            create: {
              userId,
              displayName: shop.ownerUsername,
              bio: `${SIMULATION_NAMESPACE} の店舗運営者兼顧客プロフィールです。`,
              city: shop.city,
              membershipLevel: "standard",
              isPublic: true
            },
            update: {
              displayName: shop.ownerUsername,
              bio: `${SIMULATION_NAMESPACE} の店舗運営者兼顧客プロフィールです。`,
              city: shop.city,
              membershipLevel: "standard",
              isPublic: true,
              deletedAt: null
            }
          });
          switchingCustomerProfileIds.set(userId, customerProfile.id);
          const technicianProfile = await tx.technicianProfile.upsert({
            where: { userId },
            create: {
              userId,
              shopId: getRequiredId(shopIds, shop.key, "shop"),
              displayName: shop.ownerUsername,
              bio: `${SIMULATION_NAMESPACE} の店舗運営者用技師プロフィールです。`,
              city: shop.city,
              serviceArea: shop.city,
              yearsExperience: 0,
              status: "private",
              verifiedAt: new Date("2026-05-25T00:00:00.000Z")
            },
            update: {
              shopId: getRequiredId(shopIds, shop.key, "shop"),
              displayName: shop.ownerUsername,
              bio: `${SIMULATION_NAMESPACE} の店舗運営者用技師プロフィールです。`,
              city: shop.city,
              serviceArea: shop.city,
              yearsExperience: 0,
              status: "private",
              verifiedAt: new Date("2026-05-25T00:00:00.000Z"),
              deletedAt: null
            }
          });
          ownerTechnicianProfileIds.set(shop.key, technicianProfile.id);
        }

        const ensureRole = async (
          userId: number,
          roleCode: "merchant_owner" | "technician" | "customer" | "scout",
          scopeType: string,
          scopeId: number | null
        ): Promise<void> => {
          const roleId = getRequiredId(roleIds, roleCode, "role");
          const existing = await tx.userRole.findFirst({
            where: { userId, roleId, scopeType, scopeId }
          });
          if (existing) {
            await tx.userRole.update({ where: { id: existing.id }, data: { deletedAt: null } });
          } else {
            await tx.userRole.create({ data: { userId, roleId, scopeType, scopeId } });
          }
        };

        const ensureIdentity = async (
          userId: number,
          type: string,
          scopeType: string,
          scopeId: number | null,
          displayName: string,
          isDefault = true,
          activeKey?: string
        ): Promise<void> => {
          const existing = await tx.userIdentity.findFirst({
            where: { userId, type, scopeType, scopeId }
          });
          if (existing) {
            await tx.userIdentity.update({
              where: { id: existing.id },
              data: {
                displayName,
                isDefault,
                isActive: true,
                deletedAt: null,
                ...(activeKey ? { activeKey } : {})
              }
            });
          } else {
            await tx.userIdentity.create({
              data: {
                userId,
                type,
                activeKey,
                scopeType,
                scopeId,
                displayName,
                isDefault,
                isActive: true
              }
            });
          }
        };

        for (const shop of plan.shops) {
          const userId = getRequiredId(ownerUserIds, shop.key, "shop owner");
          const shopId = getRequiredId(shopIds, shop.key, "shop");
          await ensureRole(userId, "merchant_owner", "shop", shopId);
          await ensureIdentity(userId, "merchant_owner", "shop", shopId, shop.name);
        }
        for (const technician of plan.technicians) {
          const userId = getRequiredId(technicianUserIds, technician.key, "technician user");
          const technicianProfileId = getRequiredId(
            technicianProfileIds,
            technician.key,
            "technician profile"
          );
          await ensureRole(userId, "technician", "technician_profile", technicianProfileId);
          await ensureIdentity(
            userId,
            "technician",
            "technician_profile",
            technicianProfileId,
            technician.displayName
          );
        }

        const applyIdentityMatrix = async (input: {
          userId: number;
          accountKind: "customer" | "technician" | "merchant";
          displayName: string;
          customerProfileId: number;
          technicianProfileId?: number;
          shopId?: number;
        }): Promise<void> => {
          const grants = buildSimulationIdentityGrants(input);
          for (const grant of grants) {
            await ensureRole(
              input.userId,
              grant.roleCode,
              grant.scopeType,
              grant.scopeId
            );
            await ensureIdentity(
              input.userId,
              grant.identityType,
              grant.scopeType,
              grant.scopeId,
              grant.displayName,
              grant.isDefault,
              simulationIdentityActiveKey(input.userId, grant)
            );
          }
        };

        for (const technician of plan.technicians) {
          const userId = getRequiredId(technicianUserIds, technician.key, "technician user");
          await applyIdentityMatrix({
            userId,
            accountKind: "technician",
            displayName: technician.displayName,
            customerProfileId: getRequiredId(
              switchingCustomerProfileIds,
              userId,
              "technician customer profile"
            ),
            technicianProfileId: getRequiredId(
              technicianProfileIds,
              technician.key,
              "technician profile"
            )
          });
        }
        for (const shop of plan.shops) {
          const userId = getRequiredId(ownerUserIds, shop.key, "shop owner");
          await applyIdentityMatrix({
            userId,
            accountKind: "merchant",
            displayName: shop.ownerUsername,
            customerProfileId: getRequiredId(
              switchingCustomerProfileIds,
              userId,
              "merchant customer profile"
            ),
            technicianProfileId: getRequiredId(
              ownerTechnicianProfileIds,
              shop.key,
              "merchant technician profile"
            ),
            shopId: getRequiredId(shopIds, shop.key, "shop")
          });
        }

        const ordinaryCustomerUserIds = [...customerUserIds.values()];
        const nonCustomerRoleIds = ["merchant_owner", "technician", "scout"].map((roleCode) =>
          getRequiredId(roleIds, roleCode, "role")
        );
        await tx.userIdentity.updateMany({
          where: {
            userId: { in: ordinaryCustomerUserIds },
            type: { in: ["merchant_owner", "technician", "scout"] }
          },
          data: { activeKey: null, isActive: false, deletedAt: new Date(SIMULATION_AS_OF_AT) }
        });
        await tx.userRole.updateMany({
          where: {
            userId: { in: ordinaryCustomerUserIds },
            roleId: { in: nonCustomerRoleIds }
          },
          data: { deletedAt: new Date(SIMULATION_AS_OF_AT) }
        });
        for (const customer of plan.customers) {
          const userId = getRequiredId(customerUserIds, customer.key, "customer user");
          await applyIdentityMatrix({
            userId,
            accountKind: "customer",
            displayName: customer.displayName,
            customerProfileId: getRequiredId(
              switchingCustomerProfileIds,
              userId,
              "customer profile"
            )
          });
        }

        const customerWalletIds = new Map<string, number>();
        for (const [index, customer] of plan.customers.entries()) {
          const userId = getRequiredId(customerUserIds, customer.key, "customer user");
          const wallet = await tx.wallet.upsert({
            where: {
              ownerType_ownerId_currency: {
                ownerType: WalletOwnerType.USER,
                ownerId: userId,
                currency: "NDP"
              }
            },
            create: {
              ownerType: WalletOwnerType.USER,
              ownerId: userId,
              currency: "NDP",
              createdAt: new Date("2026-05-25T00:00:00.000Z")
            },
            update: { deletedAt: null }
          });
          const transactionNo = `SIM3M-WAL-${(index + 1).toString().padStart(3, "0")}`;
          const transaction = await tx.ledgerTransaction.upsert({
            where: { transactionNo },
            create: {
              transactionNo,
              idempotencyKey: `simulation:wallet:user:${userId}:seed-credit`,
              type: LedgerTransactionType.SEED_CREDIT,
              status: LedgerTransactionStatus.APPLIED,
              referenceType: "simulation_dataset",
              referenceId: userId,
              actorUserId: userId,
              amount: 5_000,
              currency: "NDP",
              metadata: { namespace: SIMULATION_NAMESPACE, customerKey: customer.key },
              createdAt: new Date("2026-05-25T00:00:00.000Z")
            },
            update: {
              idempotencyKey: `simulation:wallet:user:${userId}:seed-credit`,
              type: LedgerTransactionType.SEED_CREDIT,
              status: LedgerTransactionStatus.APPLIED,
              referenceType: "simulation_dataset",
              referenceId: userId,
              actorUserId: userId,
              amount: 5_000,
              currency: "NDP",
              metadata: { namespace: SIMULATION_NAMESPACE, customerKey: customer.key },
              deletedAt: null
            }
          });
          const existingLedger = await tx.walletLedger.findFirst({
            where: { walletId: wallet.id, transactionId: transaction.id, deletedAt: null }
          });
          if (!existingLedger) {
            const creditedWallet = await tx.wallet.update({
              where: { id: wallet.id },
              data: { availableBalance: { increment: 5_000 } }
            });
            await tx.walletLedger.create({
              data: {
                walletId: wallet.id,
                transactionId: transaction.id,
                direction: WalletLedgerDirection.AVAILABLE_CREDIT,
                amount: 5_000,
                availableDelta: 5_000,
                frozenDelta: 0,
                availableBalanceAfter: creditedWallet.availableBalance,
                frozenBalanceAfter: creditedWallet.frozenBalance,
                reason: "three_month_simulation_seed_credit",
                createdAt: new Date("2026-05-25T00:00:00.000Z")
              }
            });
          }
          await tx.financeReconciliation.upsert({
            where: { transactionId: transaction.id },
            create: {
              transactionId: transaction.id,
              referenceType: "simulation_dataset",
              referenceId: userId,
              currency: "NDP",
              expectedAmount: 5_000,
              actualAmount: 5_000,
              differenceAmount: 0,
              createdAt: new Date("2026-05-25T00:00:00.000Z")
            },
            update: {
              referenceType: "simulation_dataset",
              referenceId: userId,
              currency: "NDP",
              expectedAmount: 5_000,
              actualAmount: 5_000,
              differenceAmount: 0,
              deletedAt: null
            }
          });
          customerWalletIds.set(customer.key, wallet.id);
        }
        for (const customer of plan.customers) {
          const userId = getRequiredId(customerUserIds, customer.key, "customer user");
          const customerProfileId = getRequiredId(
            customerProfileIds,
            customer.key,
            "customer profile"
          );
          await ensureRole(userId, "customer", "customer_profile", customerProfileId);
          await ensureIdentity(
            userId,
            "customer",
            "customer_profile",
            customerProfileId,
            customer.displayName
          );
        }

        const previewCustomerKey = "formal-preview-customer";
        const previewCustomerAccount = socialPlan.accounts.find(
          (account) => account.email === "customer@example.com"
        );
        assert(previewCustomerAccount, "Formal preview customer account definition is missing.");
        const previewCustomerDisplayName = previewCustomerAccount.displayName;
        const previewCustomer = await tx.user.findUnique({
          where: { email: "customer@example.com" },
          select: { id: true, isActive: true, deletedAt: true }
        });
        const hasPreviewCustomer = Boolean(previewCustomer?.isActive && !previewCustomer.deletedAt);
        const previewCustomerProfile =
          hasPreviewCustomer && previewCustomer
            ? await tx.customerProfile.upsert({
                where: { userId: previewCustomer.id },
                create: {
                  userId: previewCustomer.id,
                  displayName: previewCustomerDisplayName,
                  bio: "正式 API とローカル検証データを確認する共有顧客アカウントです。",
                  city: "東京都",
                  membershipLevel: "gold",
                  isPublic: true,
                  createdAt: new Date("2026-05-25T00:00:00.000Z")
                },
                update: {
                  displayName: previewCustomerDisplayName,
                  bio: "正式 API とローカル検証データを確認する共有顧客アカウントです。",
                  city: "東京都",
                  membershipLevel: "gold",
                  isPublic: true,
                  deletedAt: null
                }
              })
            : null;
        const previewCustomerWallet =
          hasPreviewCustomer && previewCustomer
            ? await tx.wallet.upsert({
                where: {
                  ownerType_ownerId_currency: {
                    ownerType: WalletOwnerType.USER,
                    ownerId: previewCustomer.id,
                    currency: "NDP"
                  }
                },
                create: {
                  ownerType: WalletOwnerType.USER,
                  ownerId: previewCustomer.id,
                  currency: "NDP",
                  createdAt: new Date("2026-05-25T00:00:00.000Z")
                },
                update: { deletedAt: null }
              })
            : null;
        if (hasPreviewCustomer && previewCustomer) {
          customerUserIds.set(previewCustomerKey, previewCustomer.id);
          assert(previewCustomerProfile, "Formal preview customer profile was not created.");
          assert(previewCustomerWallet, "Formal preview customer wallet was not created.");
          await ensureRole(
            previewCustomer.id,
            "customer",
            "customer_profile",
            previewCustomerProfile.id
          );
          await ensureIdentity(
            previewCustomer.id,
            "customer",
            "customer_profile",
            previewCustomerProfile.id,
            previewCustomerDisplayName
          );
        }

        const formalSocialUsers = await tx.user.findMany({
          where: { email: { in: socialPlan.accounts.map((account) => account.email) } },
          select: { id: true, email: true }
        });
        const formalSocialUserByEmail = new Map(
          formalSocialUsers.map((user) => [user.email, user])
        );
        for (const account of socialPlan.accounts) {
          const user = getRequiredId(
            formalSocialUserByEmail,
            account.email,
            "formal social user"
          );
          await syncFormalSocialAccountProfile(tx, user.id, account);
        }

        const previewSourceConversations = hasPreviewCustomer
          ? plan.conversations.filter((conversation) => conversation.customerKey === "customer-001")
          : [];
        const previewConversations = previewSourceConversations.map((conversation) => ({
          ...conversation,
          key: `conversation-${previewCustomerKey}-${conversation.participantKey}`,
          customerKey: previewCustomerKey
        }));
        const previewConversationKeyBySource = new Map(
          previewSourceConversations.map((conversation, index) => [
            conversation.key,
            previewConversations[index]?.key
          ])
        );
        const previewMessages = plan.messages.flatMap((message) => {
          const previewConversationKey = previewConversationKeyBySource.get(
            message.conversationKey
          );
          if (!previewConversationKey) {
            return [];
          }
          return [
            {
              ...message,
              key: `${previewConversationKey}-${message.key.split("-").at(-1)}`,
              conversationKey: previewConversationKey,
              senderKey: message.senderType === "customer" ? previewCustomerKey : message.senderKey
            }
          ];
        });
        const previewContacts = previewConversations.flatMap((conversation) => [
          {
            ownerType: "customer" as const,
            ownerKey: previewCustomerKey,
            contactType: conversation.participantType,
            contactKey: conversation.participantKey
          },
          {
            ownerType: conversation.participantType,
            ownerKey: conversation.participantKey,
            contactType: "customer" as const,
            contactKey: previewCustomerKey
          }
        ]);
        const conversationsToSeed = [...plan.conversations, ...previewConversations];
        const contactsToSeed = [...plan.contacts, ...previewContacts];
        const messagesToSeed = [...plan.messages, ...previewMessages];
        const getParticipantUserId = (
          type: "customer" | "technician" | "shop_owner",
          key: string
        ): number => {
          if (type === "customer") {
            return getRequiredId(customerUserIds, key, "IM customer user");
          }
          if (type === "technician") {
            return getRequiredId(technicianUserIds, key, "IM technician user");
          }
          return getRequiredId(ownerUserIds, key, "IM shop owner user");
        };

        const existingSimulationMessages = await tx.message.findMany({
          where: { deletedAt: null },
          select: { conversationId: true, metadata: true }
        });
        const existingSimulationConversationIds = [
          ...new Set(
            existingSimulationMessages.flatMap((message) => {
              const metadata = readJsonRecord(message.metadata);
              return metadata?.namespace === SIMULATION_NAMESPACE && metadata.dataset === "im"
                ? [message.conversationId]
                : [];
            })
          )
        ];
        if (existingSimulationConversationIds.length > 0) {
          await tx.conversationParticipant.updateMany({
            where: { conversationId: { in: existingSimulationConversationIds } },
            data: { lastReadMessageId: null, lastReadAt: null }
          });
          await tx.messageReaction.deleteMany({
            where: {
              message: { conversationId: { in: existingSimulationConversationIds } }
            }
          });
          await tx.message.deleteMany({
            where: { conversationId: { in: existingSimulationConversationIds } }
          });
          await tx.conversationParticipant.deleteMany({
            where: { conversationId: { in: existingSimulationConversationIds } }
          });
          await tx.conversation.deleteMany({
            where: { id: { in: existingSimulationConversationIds } }
          });
        }

        const simulationParticipantUserIds = [
          ...new Set([
            ...ownerUserIds.values(),
            ...technicianUserIds.values(),
            ...customerUserIds.values()
          ])
        ];
        await tx.contact.deleteMany({
          where: {
            source: "simulation_seed",
            OR: [
              { ownerUserId: { in: simulationParticipantUserIds } },
              { contactUserId: { in: simulationParticipantUserIds } }
            ]
          }
        });
        const contactRows = contactsToSeed.map(
          (contact): Prisma.ContactCreateManyInput => ({
            ownerUserId: getParticipantUserId(contact.ownerType, contact.ownerKey),
            contactUserId: getParticipantUserId(contact.contactType, contact.contactKey),
            source: "simulation_seed",
            createdAt: new Date("2026-06-01T00:00:00.000Z")
          })
        );
        const existingContacts = await tx.contact.findMany({
          where: {
            OR: contactRows.map((contact) => ({
              ownerUserId: contact.ownerUserId,
              contactUserId: contact.contactUserId
            }))
          },
          select: { id: true, ownerUserId: true, contactUserId: true, deletedAt: true }
        });
        const existingContactKeys = new Set(
          existingContacts.map((contact) => `${contact.ownerUserId}:${contact.contactUserId}`)
        );
        const deletedExistingContactIds = existingContacts
          .filter((contact) => contact.deletedAt)
          .map((contact) => contact.id);
        if (deletedExistingContactIds.length > 0) {
          await tx.contact.updateMany({
            where: { id: { in: deletedExistingContactIds } },
            data: { deletedAt: null }
          });
        }
        const missingContactRows = contactRows.filter(
          (contact) => !existingContactKeys.has(`${contact.ownerUserId}:${contact.contactUserId}`)
        );
        if (missingContactRows.length > 0) {
          await tx.contact.createMany({ data: missingContactRows, skipDuplicates: true });
        }

        const messagePlansByConversation = new Map<string, typeof messagesToSeed>();
        for (const message of messagesToSeed) {
          messagePlansByConversation.set(message.conversationKey, [
            ...(messagePlansByConversation.get(message.conversationKey) ?? []),
            message
          ]);
        }
        for (const conversation of conversationsToSeed) {
          const customerUserId = getParticipantUserId("customer", conversation.customerKey);
          const counterpartUserId = getParticipantUserId(
            conversation.participantType,
            conversation.participantKey
          );
          const conversationMessages = messagePlansByConversation.get(conversation.key) ?? [];
          assert(
            conversationMessages.length >= 4,
            `Expected at least four IM messages for ${conversation.key}.`
          );
          const updatedAt = new Date(
            conversationMessages.at(-1)?.createdAt ?? conversation.createdAt
          );
          await tx.conversation.create({
            data: {
              type: ConversationType.DIRECT,
              createdByUserId: customerUserId,
              createdAt: new Date(conversation.createdAt),
              updatedAt,
              participants: {
                create: [
                  {
                    userId: customerUserId,
                    role: "member",
                    unreadCount: 1,
                    createdAt: new Date(conversation.createdAt)
                  },
                  {
                    userId: counterpartUserId,
                    role: "member",
                    unreadCount: 0,
                    createdAt: new Date(conversation.createdAt)
                  }
                ]
              },
              messages: {
                create: conversationMessages.map((message) => ({
                  senderUserId: getParticipantUserId(message.senderType, message.senderKey),
                  type: MessageType.TEXT,
                  content: message.content,
                  metadata: {
                    namespace: SIMULATION_NAMESPACE,
                    dataset: "im",
                    messageKey: message.key,
                    focusedCustomer: conversation.customerKey === "customer-100",
                    previewCustomer: conversation.customerKey === previewCustomerKey
                  },
                  createdAt: new Date(message.createdAt)
                }))
              }
            }
          });
        }

        const socialUsers = await tx.user.findMany({
          where: { email: { in: socialPlan.accounts.map((account) => account.email) } },
          select: { id: true, email: true }
        });
        const socialUserIdByEmail = new Map(socialUsers.map((user) => [user.email, user.id]));
        const socialUserIdByKey = new Map(
          socialPlan.accounts.map((account) => [
            account.key,
            getRequiredId(socialUserIdByEmail, account.email, "formal social test user")
          ])
        );
        const socialUserIds = [...socialUserIdByKey.values()];

        const existingSocialPosts = await tx.socialPost.findMany({
          where: { authorUserId: { in: socialUserIds }, deletedAt: null },
          select: { id: true, media: true }
        });
        const simulationSocialPostIds = existingSocialPosts.flatMap((post) => {
          const media = readJsonRecord(post.media);
          return media?.namespace === SIMULATION_NAMESPACE && media.dataset === "social"
            ? [post.id]
            : [];
        });
        if (simulationSocialPostIds.length > 0) {
          await tx.socialPost.updateMany({
            where: { id: { in: simulationSocialPostIds } },
            data: { deletedAt: new Date() }
          });
        }

        const nonQuotePosts = socialPlan.posts.filter((post) => post.kind !== "quote");
        for (const rows of chunkRows(nonQuotePosts)) {
          await tx.socialPost.createMany({
            data: rows.map((post): Prisma.SocialPostCreateManyInput => ({
              authorUserId: getRequiredId(socialUserIdByKey, post.authorKey, "social post author"),
              content: post.content,
              media: post.media as unknown as Prisma.InputJsonValue,
              visibility:
                post.visibility === "followers"
                  ? SocialPostVisibility.FOLLOWERS
                  : SocialPostVisibility.PUBLIC,
              createdAt: new Date(post.createdAt)
            }))
          });
        }

        const insertedBasePosts = await tx.socialPost.findMany({
          where: { authorUserId: { in: socialUserIds }, deletedAt: null },
          select: { id: true, media: true }
        });
        const socialPostIdByKey = new Map<string, number>();
        insertedBasePosts.forEach((post) => {
          const media = readJsonRecord(post.media);
          if (
            media?.namespace === SIMULATION_NAMESPACE &&
            media.dataset === "social" &&
            typeof media.postKey === "string"
          ) {
            socialPostIdByKey.set(media.postKey, post.id);
          }
        });
        const quotePosts = socialPlan.posts.filter((post) => post.kind === "quote");
        for (const rows of chunkRows(quotePosts)) {
          await tx.socialPost.createMany({
            data: rows.map((post): Prisma.SocialPostCreateManyInput => {
              assert(post.quotePostKey, `Quote source key is missing for ${post.key}.`);
              const quotePostId = getRequiredId(
                socialPostIdByKey,
                post.quotePostKey,
                "quoted social post"
              );
              return {
                authorUserId: getRequiredId(
                  socialUserIdByKey,
                  post.authorKey,
                  "social quote author"
                ),
                content: post.content,
                media: {
                  ...post.media,
                  quotePostId
                } as unknown as Prisma.InputJsonValue,
                visibility:
                  post.visibility === "followers"
                    ? SocialPostVisibility.FOLLOWERS
                    : SocialPostVisibility.PUBLIC,
                createdAt: new Date(post.createdAt)
              };
            })
          });
        }

        const directedFriendPairs = socialPlan.friendships.flatMap((friendship) => [
          {
            followerUserId: getRequiredId(socialUserIdByKey, friendship.leftKey, "friend"),
            followingUserId: getRequiredId(socialUserIdByKey, friendship.rightKey, "friend")
          },
          {
            followerUserId: getRequiredId(socialUserIdByKey, friendship.rightKey, "friend"),
            followingUserId: getRequiredId(socialUserIdByKey, friendship.leftKey, "friend")
          }
        ]);
        const plannedFollowKeys = new Set(
          directedFriendPairs.map((pair) => `${pair.followerUserId}:${pair.followingUserId}`)
        );
        const existingFollows = await tx.follow.findMany({
          where: {
            OR: [
              { followerUserId: { in: socialUserIds } },
              { followingUserId: { in: socialUserIds } }
            ]
          },
          select: {
            id: true,
            followerUserId: true,
            followingUserId: true,
            deletedAt: true
          }
        });
        const existingFollowIdByKey = new Map(
          existingFollows.map((follow) => [
            `${follow.followerUserId}:${follow.followingUserId}`,
            follow.id
          ])
        );
        const obsoleteFollowIds = existingFollows
          .filter(
            (follow) =>
              !plannedFollowKeys.has(`${follow.followerUserId}:${follow.followingUserId}`) &&
              !follow.deletedAt
          )
          .map((follow) => follow.id);
        if (obsoleteFollowIds.length > 0) {
          await tx.follow.updateMany({
            where: { id: { in: obsoleteFollowIds } },
            data: { deletedAt: new Date() }
          });
        }
        const plannedExistingFollowIds = directedFriendPairs.flatMap((pair) => {
          const id = existingFollowIdByKey.get(`${pair.followerUserId}:${pair.followingUserId}`);
          return id ? [id] : [];
        });
        if (plannedExistingFollowIds.length > 0) {
          await tx.follow.updateMany({
            where: { id: { in: plannedExistingFollowIds } },
            data: { deletedAt: null }
          });
        }
        const missingFollowRows = directedFriendPairs.filter(
          (pair) => !existingFollowIdByKey.has(`${pair.followerUserId}:${pair.followingUserId}`)
        );
        for (const rows of chunkRows(missingFollowRows)) {
          await tx.follow.createMany({
            data: rows.map((pair) => ({
              ...pair,
              createdAt: new Date("2026-08-01T00:00:00.000Z")
            })),
            skipDuplicates: true
          });
        }

        const existingOrders = await tx.bookingOrder.findMany({
          where: { orderNo: { startsWith: SIMULATION_ORDER_PREFIX } },
          select: { id: true }
        });
        const existingOrderIds = existingOrders.map((order) => order.id);
        if (existingOrderIds.length > 0) {
          await tx.orderFinancial.deleteMany({
            where: { bookingOrderId: { in: existingOrderIds } }
          });
          await tx.feeCalculationLog.deleteMany({
            where: { bookingOrderId: { in: existingOrderIds } }
          });
          await tx.walletHold.deleteMany({ where: { bookingOrderId: { in: existingOrderIds } } });
          await tx.orderStatusHistory.deleteMany({
            where: { bookingOrderId: { in: existingOrderIds } }
          });
          await tx.bookingOrder.deleteMany({ where: { id: { in: existingOrderIds } } });
        }

        const technicianIds = [...technicianProfileIds.values()];
        await tx.scheduleSlot.deleteMany({
          where: {
            technicianProfileId: { in: technicianIds },
            startsAt: { gte: new Date(SIMULATION_START_AT), lte: new Date(SIMULATION_END_AT) }
          }
        });
        await tx.availability.deleteMany({
          where: {
            technicianProfileId: { in: technicianIds },
            startsAt: { gte: new Date(SIMULATION_START_AT), lte: new Date(SIMULATION_END_AT) }
          }
        });
        await tx.technicianService.deleteMany({ where: { technicianId: { in: technicianIds } } });
        await tx.service.deleteMany({ where: { shopId: { in: [...shopIds.values()] } } });

        const serviceIds = new Map<string, number>();
        for (const service of plan.services) {
          const shop = plan.shops.find((candidate) => candidate.key === service.shopKey);
          assert(shop, `Shop plan is missing for service ${service.key}.`);
          const record = await tx.service.create({
            data: {
              categoryId: category.id,
              shopId: getRequiredId(shopIds, service.shopKey, "shop"),
              name: service.name,
              description: service.description,
              city: shop.city,
              serviceMode: service.serviceMode,
              priceAmount: service.priceAmountJpy,
              currency: "JPY",
              durationMinutes: service.durationMinutes,
              status: "published",
              isRecommended: service.key.endsWith("store"),
              createdAt: new Date("2026-05-25T00:00:00.000Z")
            }
          });
          serviceIds.set(service.key, record.id);
        }

        await tx.technicianService.createMany({
          data: plan.technicianServices.map(
            (service): Prisma.TechnicianServiceCreateManyInput => ({
              shopId: getRequiredId(shopIds, service.shopKey, "shop"),
              technicianId: getRequiredId(
                technicianProfileIds,
                service.technicianKey,
                "technician profile"
              ),
              sourceShopServiceId: getRequiredId(serviceIds, service.serviceKey, "service"),
              name: service.name,
              description: `${SIMULATION_NAMESPACE} の技師別予約メニューです。`,
              categoryId: category.id,
              priceAmount: service.priceAmountJpy,
              currency: "JPY",
              durationMinutes: service.durationMinutes,
              isActive: true,
              isBookable: true,
              reviewStatus: TechnicianServiceReviewStatus.APPROVED,
              createdBy: getRequiredId(ownerUserIds, service.shopKey, "shop owner"),
              createdAt: new Date("2026-05-25T00:00:00.000Z")
            })
          )
        });
        const technicianServiceRows = await tx.technicianService.findMany({
          where: { technicianId: { in: technicianIds }, deletedAt: null },
          select: { id: true, technicianId: true }
        });
        const technicianServiceIds = new Map<number, number>(
          technicianServiceRows.map((service) => [service.technicianId, service.id])
        );

        await tx.availability.createMany({
          data: plan.availabilities.map(
            (availability): Prisma.AvailabilityCreateManyInput => ({
              shopId: getRequiredId(shopIds, availability.shopKey, "shop"),
              technicianProfileId: getRequiredId(
                technicianProfileIds,
                availability.technicianKey,
                "technician profile"
              ),
              startsAt: new Date(availability.startsAt),
              endsAt: new Date(availability.endsAt),
              capacity: 1,
              isActive: true,
              createdAt: new Date(availability.startsAt)
            })
          )
        });
        const availabilityRows = await tx.availability.findMany({
          where: {
            technicianProfileId: { in: technicianIds },
            startsAt: { gte: new Date(SIMULATION_START_AT), lte: new Date(SIMULATION_END_AT) },
            deletedAt: null
          },
          select: { id: true, technicianProfileId: true, startsAt: true }
        });
        const availabilityIds = new Map(
          availabilityRows.map((availability) => [
            `${availability.technicianProfileId}:${availability.startsAt.toISOString()}`,
            availability.id
          ])
        );

        await tx.scheduleSlot.createMany({
          data: plan.scheduleSlots.map((slot): Prisma.ScheduleSlotCreateManyInput => {
            const technicianProfileId = getRequiredId(
              technicianProfileIds,
              slot.technicianKey,
              "technician profile"
            );
            const technicianServiceId = getRequiredId(
              technicianServiceIds,
              technicianProfileId,
              "technician service"
            );
            return {
              availabilityId: getRequiredId(
                availabilityIds,
                `${technicianProfileId}:${slot.startsAt}`,
                "availability"
              ),
              serviceId: getRequiredId(serviceIds, slot.serviceKey, "service"),
              technicianServiceId,
              shopId: getRequiredId(shopIds, slot.shopKey, "shop"),
              technicianProfileId,
              startsAt: new Date(slot.startsAt),
              endsAt: new Date(slot.endsAt),
              capacity: 1,
              bookedCount: slot.bookedCount,
              status:
                slot.status === "BOOKED" ? ScheduleSlotStatus.BOOKED : ScheduleSlotStatus.AVAILABLE,
              createdAt: new Date(slot.startsAt)
            };
          })
        });
        const slotRows = await tx.scheduleSlot.findMany({
          where: {
            technicianProfileId: { in: technicianIds },
            startsAt: { gte: new Date(SIMULATION_START_AT), lte: new Date(SIMULATION_END_AT) },
            deletedAt: null
          },
          select: { id: true, technicianProfileId: true, startsAt: true }
        });
        const slotIds = new Map(
          slotRows.map((slot) => [
            `${slot.technicianProfileId}:${slot.startsAt.toISOString()}`,
            slot.id
          ])
        );

        await tx.bookingOrder.createMany({
          data: plan.bookings.map((booking): Prisma.BookingOrderCreateManyInput => {
            const technicianProfileId = getRequiredId(
              technicianProfileIds,
              booking.technicianKey,
              "technician profile"
            );
            const shopId = getRequiredId(shopIds, booking.shopKey, "shop");
            const completed = booking.status === "COMPLETED";
            return {
              orderNo: booking.orderNo,
              orderType: OrderType.BOOKING,
              customerUserId: getRequiredId(customerUserIds, booking.customerKey, "customer user"),
              serviceId: getRequiredId(serviceIds, booking.serviceKey, "service"),
              technicianServiceId: getRequiredId(
                technicianServiceIds,
                technicianProfileId,
                "technician service"
              ),
              shopId,
              technicianProfileId,
              scheduleSlotId: getRequiredId(
                slotIds,
                `${technicianProfileId}:${booking.startsAt}`,
                "schedule slot"
              ),
              status: toBookingStatus(booking.status),
              fulfillmentMode: booking.fulfillmentMode,
              priceAmount: booking.priceAmountJpy,
              currency: "JPY",
              pricingModeSnapshot: ShopPricingMode.MERCHANT,
              serviceOwnerType: ServiceOwnerType.SHOP,
              serviceOwnerId: shopId,
              serviceNameSnapshot: plan.services.find(
                (service) => service.key === booking.serviceKey
              )?.name,
              servicePriceSnapshot: booking.priceAmountJpy,
              serviceDurationSnapshot: booking.durationMinutes,
              serviceSnapshotJson: {
                namespace: SIMULATION_NAMESPACE,
                serviceKey: booking.serviceKey,
                slotKey: booking.slotKey
              },
              startsAt: new Date(booking.startsAt),
              endsAt: new Date(booking.endsAt),
              note: `${SIMULATION_NAMESPACE} deterministic booking`,
              cancelReason: booking.cancelReason,
              paymentMethod: ServicePaymentMethod.ONSITE,
              paymentStatus: completed
                ? ServicePaymentStatus.CONFIRMED
                : ServicePaymentStatus.PENDING,
              paymentAmountJpy: completed ? booking.priceAmountJpy : 0,
              paymentConfirmedById: completed
                ? getRequiredId(ownerUserIds, booking.shopKey, "shop owner")
                : null,
              paymentConfirmedAt: completed ? new Date(booking.endsAt) : null,
              paymentReference: completed ? `SIM-CASH-${booking.orderNo}` : null,
              paymentNote: completed ? "Simulation onsite payment confirmed." : null,
              createdAt: new Date(booking.createdAt)
            };
          })
        });
        const orderRows = await tx.bookingOrder.findMany({
          where: { orderNo: { startsWith: SIMULATION_ORDER_PREFIX } },
          select: { id: true, orderNo: true }
        });
        const orderIds = new Map(orderRows.map((order) => [order.orderNo, order.id]));

        await tx.orderStatusHistory.createMany({
          data: plan.histories.map((history): Prisma.OrderStatusHistoryCreateManyInput => {
            const booking = plan.bookings.find(
              (candidate) => candidate.orderNo === history.orderNo
            );
            assert(booking, `Booking plan is missing for history ${history.orderNo}.`);
            return {
              bookingOrderId: getRequiredId(orderIds, history.orderNo, "booking order"),
              fromStatus: history.fromStatus ? toBookingStatus(history.fromStatus) : null,
              toStatus: toBookingStatus(history.toStatus),
              actorUserId:
                history.actorType === "customer"
                  ? getRequiredId(customerUserIds, booking.customerKey, "customer user")
                  : getRequiredId(ownerUserIds, booking.shopKey, "shop owner"),
              reason: history.reason,
              metadata: { namespace: SIMULATION_NAMESPACE },
              createdAt: new Date(history.createdAt)
            };
          })
        });

        await tx.notification.deleteMany({
          where: {
            recipientUserId: { in: [...customerUserIds.values()] },
            title: "Simulation booking update"
          }
        });
        const latestHistoryAt = new Map<string, string>();
        for (const history of plan.histories) {
          latestHistoryAt.set(history.orderNo, history.createdAt);
        }
        await tx.notification.createMany({
          data: plan.bookings.map(
            (booking): Prisma.NotificationCreateManyInput => ({
              recipientUserId: getRequiredId(customerUserIds, booking.customerKey, "customer user"),
              actorUserId: getRequiredId(ownerUserIds, booking.shopKey, "shop owner"),
              type: NotificationType.ORDER_STATUS,
              title: "Simulation booking update",
              body: `${booking.orderNo} status changed to ${booking.status}.`,
              payload: {
                namespace: SIMULATION_NAMESPACE,
                orderNo: booking.orderNo,
                status: booking.status
              },
              readAt:
                booking.status === "COMPLETED" || booking.status === "CANCELLED"
                  ? new Date(booking.endsAt)
                  : null,
              createdAt: new Date(latestHistoryAt.get(booking.orderNo) ?? booking.createdAt)
            })
          )
        });

        const completedBookings = plan.bookings.filter((booking) => booking.status === "COMPLETED");
        const completedOrdinalByShop = new Map<string, number>();
        await tx.orderFinancial.createMany({
          data: completedBookings.map((booking): Prisma.OrderFinancialCreateManyInput => {
            const ordinal = (completedOrdinalByShop.get(booking.shopKey) ?? 0) + 1;
            completedOrdinalByShop.set(booking.shopKey, ordinal);
            const ownerUserId = getRequiredId(ownerUserIds, booking.shopKey, "shop owner");
            return {
              bookingOrderId: getRequiredId(orderIds, booking.orderNo, "booking order"),
              orderType: "booking",
              customerUserId: getRequiredId(customerUserIds, booking.customerKey, "customer user"),
              shopId: getRequiredId(shopIds, booking.shopKey, "shop"),
              technicianProfileId: getRequiredId(
                technicianProfileIds,
                booking.technicianKey,
                "technician profile"
              ),
              serviceAmountJpy: booking.priceAmountJpy,
              offlineReportedServiceAmountJpy: booking.priceAmountJpy,
              paymentChannel: ordinal % 3 === 0 ? "offline_card" : "onsite_cash",
              serviceIncomeStatus: "confirmed",
              bPlatformFeeActualNdp: 500,
              userRewardNdp: ordinal % 5 === 0 ? 100 : 0,
              platformFeePayerType: "shop",
              platformFeePayerId: getRequiredId(shopIds, booking.shopKey, "shop"),
              platformFeeBearerForPayroll: "shop",
              completedOrderOrdinalInPeriod: ordinal,
              appliedFeeRuleIdsJson: ["simulation:b_platform_fee"],
              moneyTimelineJson: [
                { type: "service_income_confirmed", amountJpy: booking.priceAmountJpy },
                { type: "b_platform_fee_recorded", amountNdp: 500 }
              ],
              serviceIncomeReportedById: ownerUserId,
              serviceIncomeReportedAt: new Date(booking.endsAt),
              serviceIncomeConfirmedById: ownerUserId,
              serviceIncomeConfirmedAt: new Date(booking.endsAt),
              serviceIncomeNote: "Three-month local simulation income record.",
              settlementStatus: "ready_for_payroll",
              createdAt: new Date(booking.endsAt)
            };
          })
        });

        await tx.auditLog.create({
          data: {
            action: "simulation.seed.completed",
            targetType: "SimulationDataset",
            metadata: {
              namespace: SIMULATION_NAMESPACE,
              shops: plan.shops.length,
              technicians: plan.technicians.length,
              customers: plan.customers.length,
              conversations: plan.conversations.length,
              messages: plan.messages.length,
              contacts: plan.contacts.length,
              previewConversations: previewConversations.length,
              socialPosts: socialPlan.posts.length,
              socialFriendships: socialPlan.friendships.length,
              scheduleSlots: plan.scheduleSlots.length,
              bookings: plan.bookings.length,
              completedBookings: completedBookings.length,
              periodStart: SIMULATION_START_AT,
              periodEnd: SIMULATION_END_AT
            }
          }
        });

        return {
          shops: shopIds.size,
          technicians: technicianProfileIds.size,
          customers: customerProfileIds.size,
          services: serviceIds.size,
          customerWallets: customerWalletIds.size,
          conversations: plan.conversations.length,
          messages: plan.messages.length,
          contacts: plan.contacts.length,
          previewConversations: previewConversations.length,
          socialPosts: socialPlan.posts.length,
          socialFriendships: socialPlan.friendships.length,
          scheduleSlots: slotIds.size,
          bookings: orderIds.size,
          notifications: plan.bookings.length,
          completedBookings: completedBookings.length
        };
      },
      { maxWait: 20_000, timeout: 180_000 }
    );

    const exportedUsers = await prisma.user.findMany({
      where: { email: { in: socialPlan.accounts.map((account) => account.email) } },
      select: {
        id: true,
        email: true,
        identities: {
          where: { isActive: true, deletedAt: null },
          select: { scopeId: true, scopeType: true }
        }
      }
    });
    const exportedUserByEmail = new Map(exportedUsers.map((user) => [user.email, user]));
    const accountRows = orderFormalTestAccountExports(
      socialPlan.accounts.map((account) => {
        const user = getRequiredId(exportedUserByEmail, account.email, "exported NeeDo user");
        return buildFormalTestAccountExportRow(
          {
            ...account,
            identityScopeId: resolveFormalNeeDoSequence(
              account.accountType,
              account.socialType,
              user.id,
              user.identities
            ),
            userId: user.id
          },
          getRequiredId(accountPasswords, account.email, "account password")
        );
      })
    ).map((row) => [
      row.accountType,
      row.needoId,
      row.nickname,
      row.email,
      row.password
    ]);
    const csv = [
      ["account_type", "needo_id", "nickname", "email", "password"],
      ...accountRows
    ]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");
    const accountExportPath = resolve(
      process.cwd(),
      process.env.SIMULATION_ACCOUNT_EXPORT || DEFAULT_ACCOUNT_EXPORT_PATH
    );
    await mkdir(dirname(accountExportPath), { recursive: true });
    await writeFile(accountExportPath, `\uFEFF${csv}\n`, "utf8");

    console.log(
      JSON.stringify(
        {
          database: seedConfig.databaseName,
          namespace: SIMULATION_NAMESPACE,
          period: { start: SIMULATION_START_AT, end: SIMULATION_END_AT },
          accounts: {
            merchantOwners: plan.shops.length,
            technicians: plan.technicians.length,
            customers: plan.customers.length,
            exportPath: accountExportPath
          },
          ...summary,
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
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
