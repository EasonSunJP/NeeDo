import {
  BookingOrderStatus,
  LedgerTransactionStatus,
  LedgerTransactionType,
  NotificationType,
  OrderType,
  ScheduleSlotStatus,
  ServicePaymentMethod,
  ServicePaymentStatus,
  ServiceOwnerType,
  ShopPricingMode,
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
  SIMULATION_NAMESPACE,
  SIMULATION_ORDER_PREFIX,
  SIMULATION_START_AT,
  buildThreeMonthSimulationPlan,
  type SimulationOrderStatus
} from "../src/simulation/three-month-simulation-plan";
import {
  deriveSimulationAccountPassword,
  getSimulationSeedConfig
} from "../src/simulation/simulation-seed-config";

const BCRYPT_ROUNDS = 12;
const DEFAULT_ACCOUNT_EXPORT_PATH = "../outputs/NeeDo_模拟账号_2026-06至08.csv";

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

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });

  const seedConfig = getSimulationSeedConfig(process.env);
  const [{ prisma, disconnectPrisma }] = await Promise.all([import("../src/prisma/client")]);
  const plan = buildThreeMonthSimulationPlan();
  const accountEmails = [
    ...plan.shops.map((shop) => shop.ownerEmail),
    ...plan.technicians.map((technician) => technician.email),
    ...plan.customers.map((customer) => customer.email)
  ];
  const accountPasswords = new Map(
    accountEmails.map((email) => [
      email,
      deriveSimulationAccountPassword(seedConfig.passwordSeed, email)
    ])
  );
  assert(
    new Set(accountPasswords.values()).size === accountEmails.length,
    "Simulation account passwords must be unique."
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
            code: { in: ["merchant_owner", "technician", "customer"] },
            deletedAt: null
          },
          select: { id: true, code: true }
        });
        const roleIds = new Map(roles.map((role) => [role.code, role.id]));
        assert(roleIds.size === 3, "Run the formal User Management seed before simulation data.");
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
              isActive: true,
              createdAt: new Date("2026-05-15T00:00:00.000Z")
            },
            update: {
              passwordHash: getRequiredId(passwordHashes, shop.ownerEmail, "password hash"),
              username: shop.ownerUsername,
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
              isActive: true,
              createdAt: new Date("2026-05-20T00:00:00.000Z")
            },
            update: {
              passwordHash: getRequiredId(passwordHashes, technician.email, "password hash"),
              username: technician.username,
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
              isActive: true,
              createdAt: new Date("2026-05-25T00:00:00.000Z")
            },
            update: {
              passwordHash: getRequiredId(passwordHashes, customer.email, "password hash"),
              username: customer.username,
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
        }

        const ensureRole = async (
          userId: number,
          roleCode: "merchant_owner" | "technician" | "customer",
          scopeType: string,
          scopeId: number
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
          scopeId: number,
          displayName: string
        ): Promise<void> => {
          const existing = await tx.userIdentity.findFirst({
            where: { userId, type, scopeType, scopeId }
          });
          if (existing) {
            await tx.userIdentity.update({
              where: { id: existing.id },
              data: { displayName, isDefault: true, isActive: true, deletedAt: null }
            });
          } else {
            await tx.userIdentity.create({
              data: {
                userId,
                type,
                scopeType,
                scopeId,
                displayName,
                isDefault: true,
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

        const existingOrders = await tx.bookingOrder.findMany({
          where: { orderNo: { startsWith: SIMULATION_ORDER_PREFIX } },
          select: { id: true }
        });
        const existingOrderIds = existingOrders.map((order) => order.id);
        if (existingOrderIds.length > 0) {
          await tx.orderFinancial.deleteMany({ where: { bookingOrderId: { in: existingOrderIds } } });
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
              createdBy: getRequiredId(
                ownerUserIds,
                service.shopKey,
                "shop owner"
              ),
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
                slot.status === "BOOKED"
                  ? ScheduleSlotStatus.BOOKED
                  : ScheduleSlotStatus.AVAILABLE,
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
            const booking = plan.bookings.find((candidate) => candidate.orderNo === history.orderNo);
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
          data: plan.bookings.map((booking): Prisma.NotificationCreateManyInput => ({
            recipientUserId: getRequiredId(
              customerUserIds,
              booking.customerKey,
              "customer user"
            ),
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
          }))
        });

        const completedBookings = plan.bookings.filter(
          (booking) => booking.status === "COMPLETED"
        );
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
          scheduleSlots: slotIds.size,
          bookings: orderIds.size,
          notifications: plan.bookings.length,
          completedBookings: completedBookings.length
        };
      },
      { maxWait: 20_000, timeout: 180_000 }
    );

    const shopNameByKey = new Map(plan.shops.map((shop) => [shop.key, shop.name]));
    const accountRows = [
      ...plan.shops.map((shop) => [
        "merchant_owner",
        shop.name,
        shop.ownerUsername,
        shop.ownerEmail,
        getRequiredId(accountPasswords, shop.ownerEmail, "account password"),
        "active",
        "Local/test simulation merchant owner"
      ]),
      ...plan.technicians.map((technician) => [
        "technician",
        shopNameByKey.get(technician.shopKey) ?? "",
        technician.displayName,
        technician.email,
        getRequiredId(accountPasswords, technician.email, "account password"),
        "active",
        "Local/test simulation technician"
      ]),
      ...plan.customers.map((customer) => [
        "customer",
        "",
        customer.displayName,
        customer.email,
        getRequiredId(accountPasswords, customer.email, "account password"),
        "active",
        "Local/test simulation customer"
      ])
    ];
    const csv = [
      ["account_type", "shop_name", "display_name", "email", "password", "status", "notes"],
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
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
