import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  ActiveSuspensionRecord,
  BillingReconciliationTransition,
  BillingSubjectType,
  CreateMerchantAccountRepositoryInput,
  GeneratedInvoiceRecord,
  ManualPaymentRepositoryInput,
  MerchantAccountAggregateRecord,
  MerchantAccountListRecord,
  MerchantSaasBillingRepositoryPort,
  SaasBillingProfileRecord,
  SaasFreePeriodRecord,
  SaasInvoicePayload,
  SaasPaymentPayload,
  ShopAccountRecord,
  ShopDissolutionRecord,
  MerchantDissolutionRecord,
  SuspensionReleaseRecord,
  SuspensionResultRecord,
  TrialExtensionRepositoryInput,
  UpdateBillingProfileRepositoryInput
} from "../services/merchant-saas-billing.service";
import { SaasBillingPolicyService } from "../services/saas-billing-policy.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type {
  FreePeriodListQuery,
  LinkMerchantShopBody,
  MerchantAccountListQuery,
  SaasInvoiceListQuery,
  UpdatePaymentResponsibilityBody
} from "../validators/merchant-saas-billing.validator";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const billingProfileInclude = {
  freePeriods: {
    where: { deletedAt: null },
    orderBy: [{ startsAt: "asc" as const }, { id: "asc" as const }]
  }
} satisfies Prisma.SaasBillingProfileInclude;

type BillingProfileRow = Prisma.SaasBillingProfileGetPayload<{
  include: typeof billingProfileInclude;
}>;

const invoiceInclude = {
  lines: {
    where: { deletedAt: null },
    orderBy: { id: "asc" as const }
  },
  payments: {
    where: { deletedAt: null },
    orderBy: [{ receivedAt: "asc" as const }, { id: "asc" as const }]
  }
} satisfies Prisma.SaasInvoiceInclude;

type InvoiceRow = Prisma.SaasInvoiceGetPayload<{ include: typeof invoiceInclude }>;

const shopInclude = {
  owner: { select: { email: true } },
  mediaAssets: {
    where: { deletedAt: null, isActive: true, usageType: "cover" },
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
    take: 1
  },
  reviewSummary: true
} satisfies Prisma.ShopInclude;

type ShopRow = Prisma.ShopGetPayload<{ include: typeof shopInclude }>;

interface MerchantBaseRow {
  id: number;
  code: string;
  name: string;
  status: string;
  paymentResponsibility: string;
  createdAt: Date;
}

interface InvoiceLinePlan {
  payerType: BillingSubjectType;
  payerId: number;
  subjectType: BillingSubjectType;
  subjectId: number;
  description: string;
  billingCadence: "monthly" | "annual";
  monthlyFeeJpy: number;
  amountJpy: number;
  periodStartsAt: Date;
  periodEndsAt: Date;
  paymentProvider: "manual" | "stripe";
}

export class MerchantSaasBillingRepository implements MerchantSaasBillingRepositoryPort {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly policy: SaasBillingPolicyService = new SaasBillingPolicyService()
  ) {}

  public async listAccounts(
    input: MerchantAccountListQuery
  ): Promise<ReturnType<typeof buildPaginatedResponse<MerchantAccountListRecord>>> {
    const pagination = toPrismaPagination(input);
    const merchantWhere = this.merchantWhere(input);
    const standaloneShopWhere = this.standaloneShopWhere(input);
    const [merchantTotal, standaloneShopTotal] = await Promise.all([
      this.client.merchantAccount.count({ where: merchantWhere }),
      this.client.shop.count({ where: standaloneShopWhere })
    ]);
    const groupSkip = Math.min(pagination.skip, merchantTotal);
    const groupTake = Math.min(pagination.take, Math.max(merchantTotal - groupSkip, 0));
    const shopSkip = Math.max(pagination.skip - merchantTotal, 0);
    const shopTake = pagination.take - groupTake;
    const [merchants, standaloneShops] = await Promise.all([
      groupTake > 0
        ? this.client.merchantAccount.findMany({
            where: merchantWhere,
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              paymentResponsibility: true,
              createdAt: true
            },
            skip: groupSkip,
            take: groupTake,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }]
          })
        : Promise.resolve([]),
      shopTake > 0
        ? this.client.shop.findMany({
            where: standaloneShopWhere,
            select: { id: true },
            skip: shopSkip,
            take: shopTake,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }]
          })
        : Promise.resolve([])
    ]);
    const list = await this.hydrateAccounts(
      merchants,
      standaloneShops.map((shop) => shop.id),
      this.client
    );

    return buildPaginatedResponse(list, merchantTotal + standaloneShopTotal, input);
  }

  public async getMerchantAccount(id: number): Promise<MerchantAccountAggregateRecord | null> {
    const merchant = await this.client.merchantAccount.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        paymentResponsibility: true,
        createdAt: true
      }
    });

    if (!merchant) {
      return null;
    }

    const [hydrated] = await this.hydrateAccounts([merchant], [], this.client);
    return hydrated?.kind === "merchant_group" ? hydrated : null;
  }

  public async createMerchantAccount(
    input: CreateMerchantAccountRepositoryInput
  ): Promise<MerchantAccountAggregateRecord> {
    const merchantId = await this.client.$transaction(async (tx) => {
      const merchant = await tx.merchantAccount.create({
        data: {
          code: input.code,
          ownerUserId: input.ownerUserId ?? null,
          name: input.name,
          status: "active",
          paymentResponsibility: input.paymentResponsibility
        }
      });
      const profile = await tx.saasBillingProfile.create({
        data: {
          subjectType: "merchant_account",
          subjectId: merchant.id,
          merchantAccountId: merchant.id,
          activeKey: `merchant:${merchant.id}`,
          billingCadence: "monthly",
          monthlyFeeJpy: 9800,
          trialStatus: "active",
          trialStartedAt: input.trialStartsAt,
          trialEndsAt: input.trialEndsAt,
          trialUsedAt: input.trialStartsAt,
          paymentProvider: "manual"
        }
      });

      await tx.saasFreePeriod.create({
        data: {
          billingProfileId: profile.id,
          periodType: "initial_trial",
          startsAt: input.trialStartsAt,
          endsAt: input.baseTrialEndsAt,
          reason: "First three natural-month free trial",
          idempotencyKey: `merchant:${merchant.id}:initial-trial`,
          createdById: input.actorUserId
        }
      });
      if (input.automaticBonusDays === 15) {
        await tx.saasFreePeriod.create({
          data: {
            billingProfileId: profile.id,
            periodType: "late_month_bonus",
            startsAt: input.baseTrialEndsAt,
            endsAt: input.trialEndsAt,
            reason: "Automatic late-month trial allowance",
            idempotencyKey: `merchant:${merchant.id}:late-month-bonus`,
            createdById: input.actorUserId
          }
        });
      }

      return merchant.id;
    });
    const record = await this.getMerchantAccount(merchantId);

    if (!record) {
      throw new Error("error.merchant_account.create_failed");
    }

    return record;
  }

  public async findBillingProfile(
    subjectType: BillingSubjectType,
    subjectId: number
  ): Promise<SaasBillingProfileRecord | null> {
    return this.loadBillingProfile(subjectType, subjectId, this.client);
  }

  public async reconcileShopBillingProfiles(input: {
    shopIds: number[];
    merchantAccountIds?: number[];
    now: Date;
    actorUserId: number;
  }): Promise<BillingReconciliationTransition[]> {
    const shopIds = Array.from(new Set(input.shopIds));

    const merchantAccountIds = Array.from(new Set(input.merchantAccountIds ?? []));

    if (shopIds.length === 0 && merchantAccountIds.length === 0) {
      return [];
    }

    return this.client.$transaction(async (tx) => {
      const [shops, technicianCounts, profiles, expiredMerchantProfiles] = await Promise.all([
        tx.shop.findMany({
          where: { id: { in: shopIds }, deletedAt: null },
          select: { id: true }
        }),
        tx.technicianProfile.groupBy({
          by: ["shopId"],
          where: {
            shopId: { in: shopIds },
            status: "published",
            deletedAt: null
          },
          _count: { _all: true }
        }),
        tx.saasBillingProfile.findMany({
          where: {
            subjectType: "shop",
            shopId: { in: shopIds },
            activeKey: { not: null },
            deletedAt: null
          },
          include: billingProfileInclude
        }),
        tx.saasBillingProfile.findMany({
          where: {
            subjectType: "merchant_account",
            merchantAccountId: { in: merchantAccountIds },
            trialStatus: "active",
            trialEndsAt: { lte: input.now },
            activeKey: { not: null },
            deletedAt: null
          },
          select: { id: true, subjectId: true, version: true, trialEndsAt: true }
        })
      ]);
      const countByShopId = new Map(technicianCounts.map((row) => [row.shopId, row._count._all]));
      const profileByShopId = new Map(
        profiles.flatMap((profile) => (profile.shopId ? [[profile.shopId, profile] as const] : []))
      );
      const transitions: BillingReconciliationTransition[] = [];

      for (const shop of shops) {
        const activeTechnicians = countByShopId.get(shop.id) ?? 0;
        const existing = profileByShopId.get(shop.id);
        const transition = this.policy.planShopTrialTransition(
          {
            activeTechnicians,
            trialStatus: existing ? this.mapTrialStatus(existing.trialStatus) : "not_started",
            trialUsedAt: existing?.trialUsedAt ?? null,
            trialEndsAt: existing?.trialEndsAt ?? null
          },
          input.now
        );

        if (transition.action === "none") {
          continue;
        }
        if (transition.action === "start") {
          const trialPeriods = this.policy.buildInitialTrialFreePeriods(transition.trial);
          const profile = existing
            ? await this.activateShopTrial(tx, existing, transition.trial)
            : await tx.saasBillingProfile.create({
                data: {
                  subjectType: "shop",
                  subjectId: shop.id,
                  shopId: shop.id,
                  activeKey: `shop:${shop.id}`,
                  billingCadence: "monthly",
                  monthlyFeeJpy: 9800,
                  trialStatus: "active",
                  trialStartedAt: transition.trial.startsAt,
                  trialEndsAt: transition.trial.endsAt,
                  trialUsedAt: transition.trial.startsAt,
                  paymentProvider: "manual"
                }
              });

          if (!profile) {
            continue;
          }
          for (const period of trialPeriods) {
            const idempotencyKey = `shop:${shop.id}:${period.periodType}`;
            await tx.saasFreePeriod.upsert({
              where: { idempotencyKey },
              create: {
                billingProfileId: profile.id,
                periodType: period.periodType,
                startsAt: period.startsAt,
                endsAt: period.endsAt,
                reason:
                  period.periodType === "late_month_bonus"
                    ? "Automatic late-month trial allowance"
                    : "First three natural-month free trial",
                idempotencyKey,
                createdById: input.actorUserId
              },
              update: {
                billingProfileId: profile.id,
                startsAt: period.startsAt,
                endsAt: period.endsAt,
                deletedAt: null
              }
            });
          }
          transitions.push({
            subjectType: "shop",
            subjectId: shop.id,
            action: "trial_started",
            occurredAt: transition.trial.startsAt
          });
          continue;
        }

        if (!existing) {
          continue;
        }
        const status = transition.action === "interrupt" ? "interrupted" : "completed";
        const updated = await tx.saasBillingProfile.updateMany({
          where: {
            id: existing.id,
            version: existing.version,
            trialStatus: "active",
            deletedAt: null
          },
          data: {
            trialStatus: status,
            ...(transition.action === "interrupt" ? { trialEndsAt: transition.at } : {}),
            version: { increment: 1 }
          }
        });

        if (updated.count !== 1) {
          continue;
        }
        if (transition.action === "interrupt") {
          await this.truncateFreePeriods(
            tx,
            existing.id,
            transition.at,
            "Technician count fell below two"
          );
        }
        transitions.push({
          subjectType: "shop",
          subjectId: shop.id,
          action: transition.action === "interrupt" ? "trial_interrupted" : "trial_completed",
          occurredAt: transition.at
        });
      }

      for (const profile of expiredMerchantProfiles) {
        const updated = await tx.saasBillingProfile.updateMany({
          where: {
            id: profile.id,
            version: profile.version,
            trialStatus: "active",
            deletedAt: null
          },
          data: { trialStatus: "completed", version: { increment: 1 } }
        });
        if (updated.count === 1 && profile.trialEndsAt) {
          transitions.push({
            subjectType: "merchant_account",
            subjectId: profile.subjectId,
            action: "trial_completed",
            occurredAt: profile.trialEndsAt
          });
        }
      }

      return transitions;
    });
  }

  public async updateBillingProfile(
    input: UpdateBillingProfileRepositoryInput
  ): Promise<{ before: SaasBillingProfileRecord; after: SaasBillingProfileRecord } | null> {
    return this.client.$transaction(async (tx) => {
      const before = await this.loadBillingProfile(input.subjectType, input.subjectId, tx);

      if (!before || before.version !== input.version) {
        return null;
      }

      if (
        input.subjectType === "shop" &&
        (before.activeTechnicians ?? 0) <= 1 &&
        (input.cadenceLocked || input.amountLocked)
      ) {
        return null;
      }

      const interruptActiveTrial =
        before.trialStatus === "active" &&
        (before.trialEndsAt === null || before.trialEndsAt.getTime() > input.changedAt.getTime()) &&
        (input.billingCadence === "free" || input.billingCadence !== before.billingCadence);
      const completeExpiredTrial =
        before.trialStatus === "active" &&
        before.trialEndsAt !== null &&
        before.trialEndsAt.getTime() <= input.changedAt.getTime();

      const updated = await tx.saasBillingProfile.updateMany({
        where: {
          id: before.id,
          version: input.version,
          activeKey: { not: null },
          deletedAt: null
        },
        data: {
          billingCadence: input.billingCadence,
          monthlyFeeJpy: input.monthlyFeeJpy,
          cadenceLocked: input.cadenceLocked,
          amountLocked: input.amountLocked,
          paymentProvider: input.paymentProvider,
          ...(interruptActiveTrial
            ? { trialStatus: "interrupted", trialEndsAt: input.changedAt }
            : completeExpiredTrial
              ? { trialStatus: "completed" }
              : {}),
          version: { increment: 1 }
        }
      });

      if (updated.count !== 1) {
        return null;
      }

      if (interruptActiveTrial) {
        await this.truncateFreePeriods(
          tx,
          before.id,
          input.changedAt,
          "Trial interrupted by billing-mode change"
        );
      }
      if (before.billingCadence !== "free" && input.billingCadence === "free") {
        await tx.saasFreePeriod.create({
          data: {
            billingProfileId: before.id,
            periodType: "manual_free",
            startsAt: input.changedAt,
            endsAt: null,
            reason: "Administrative free billing lock",
            idempotencyKey: `profile:${before.id}:manual-free:v${input.version}`,
            createdById: input.actorUserId
          }
        });
      } else if (before.billingCadence === "free" && input.billingCadence !== "free") {
        await tx.saasFreePeriod.updateMany({
          where: {
            billingProfileId: before.id,
            periodType: "manual_free",
            endsAt: null,
            deletedAt: null
          },
          data: { endsAt: input.changedAt }
        });
      }

      const after = await this.loadBillingProfile(input.subjectType, input.subjectId, tx);
      return after ? { before, after } : null;
    });
  }

  public async updatePaymentResponsibility(
    merchantAccountId: number,
    input: UpdatePaymentResponsibilityBody
  ): Promise<MerchantAccountAggregateRecord | null> {
    const updated = await this.client.merchantAccount.updateMany({
      where: { id: merchantAccountId, deletedAt: null },
      data: { paymentResponsibility: input.paymentResponsibility }
    });

    return updated.count === 1 ? this.getMerchantAccount(merchantAccountId) : null;
  }

  public async linkShop(
    merchantAccountId: number,
    input: LinkMerchantShopBody,
    actorUserId: number
  ): Promise<MerchantAccountAggregateRecord | null> {
    const linked = await this.client.$transaction(async (tx) => {
      const [merchant, shop, existing] = await Promise.all([
        tx.merchantAccount.findFirst({
          where: { id: merchantAccountId, deletedAt: null },
          select: { id: true }
        }),
        tx.shop.findFirst({ where: { id: input.shopId, deletedAt: null }, select: { id: true } }),
        tx.merchantShopMembership.findFirst({
          where: {
            shopId: input.shopId,
            activeKey: { not: null },
            endsAt: null,
            deletedAt: null
          },
          select: { id: true }
        })
      ]);

      if (!merchant || !shop || existing) {
        return false;
      }

      await tx.merchantShopMembership.create({
        data: {
          merchantAccountId,
          shopId: input.shopId,
          activeKey: `merchant:${merchantAccountId}:shop:${input.shopId}`,
          startsAt: input.startsAt ?? new Date(),
          createdById: actorUserId
        }
      });
      return true;
    });

    return linked ? this.getMerchantAccount(merchantAccountId) : null;
  }

  public async unlinkShop(
    merchantAccountId: number,
    shopId: number,
    actorUserId: number
  ): Promise<MerchantAccountAggregateRecord | null> {
    const endedAt = new Date();
    const updated = await this.client.merchantShopMembership.updateMany({
      where: {
        merchantAccountId,
        shopId,
        activeKey: { not: null },
        endsAt: null,
        deletedAt: null
      },
      data: {
        activeKey: null,
        endsAt: endedAt,
        removedReason: "backoffice_unlink",
        removedById: actorUserId
      }
    });

    return updated.count === 1 ? this.getMerchantAccount(merchantAccountId) : null;
  }

  public async addTrialExtension(
    input: TrialExtensionRepositoryInput
  ): Promise<SaasBillingProfileRecord | null> {
    return this.client.$transaction(async (tx) => {
      const profile = await this.loadBillingProfile(input.subjectType, input.subjectId, tx);
      const extensionCount =
        profile?.freePeriods.filter((period) => period.periodType === "admin_extension").length ??
        0;

      if (
        !profile ||
        profile.version !== input.expectedVersion ||
        profile.trialStatus !== "active" ||
        !profile.trialEndsAt ||
        extensionCount !== input.expectedExtensionCount ||
        extensionCount >= 3
      ) {
        return null;
      }

      const updated = await tx.saasBillingProfile.updateMany({
        where: {
          id: profile.id,
          version: input.expectedVersion,
          trialStatus: "active",
          deletedAt: null
        },
        data: {
          trialEndsAt: input.endsAt,
          version: { increment: 1 }
        }
      });

      if (updated.count !== 1) {
        return null;
      }

      await tx.saasFreePeriod.create({
        data: {
          billingProfileId: profile.id,
          periodType: "admin_extension",
          startsAt: profile.trialEndsAt,
          endsAt: input.endsAt,
          extensionSequence: extensionCount + 1,
          reason: input.reason,
          idempotencyKey: `profile:${profile.id}:extension:${extensionCount + 1}:v${input.expectedVersion}`,
          createdById: input.actorUserId
        }
      });

      return this.loadBillingProfile(input.subjectType, input.subjectId, tx);
    });
  }

  public async interruptTrial(input: {
    subjectType: BillingSubjectType;
    subjectId: number;
    expectedVersion: number;
    reason: string;
    actorUserId: number;
    interruptedAt: Date;
  }): Promise<SaasBillingProfileRecord | null> {
    return this.client.$transaction(async (tx) => {
      const profile = await this.loadBillingProfile(input.subjectType, input.subjectId, tx);

      if (
        !profile ||
        profile.version !== input.expectedVersion ||
        profile.trialStatus !== "active"
      ) {
        return null;
      }

      const updated = await tx.saasBillingProfile.updateMany({
        where: {
          id: profile.id,
          version: input.expectedVersion,
          trialStatus: "active",
          deletedAt: null
        },
        data: {
          trialStatus: "interrupted",
          trialEndsAt: input.interruptedAt,
          version: { increment: 1 }
        }
      });

      if (updated.count !== 1) {
        return null;
      }

      await this.truncateFreePeriods(tx, profile.id, input.interruptedAt, input.reason);

      return this.loadBillingProfile(input.subjectType, input.subjectId, tx);
    });
  }

  public async listFreePeriods(
    subjectType: BillingSubjectType,
    subjectId: number,
    input: FreePeriodListQuery
  ): Promise<ReturnType<typeof buildPaginatedResponse<SaasFreePeriodRecord>>> {
    const profile = await this.client.saasBillingProfile.findFirst({
      where: {
        subjectType,
        subjectId,
        activeKey: { not: null },
        deletedAt: null
      },
      select: { id: true }
    });

    if (!profile) {
      return buildPaginatedResponse([], 0, input);
    }

    const pagination = toPrismaPagination(input);
    const where: Prisma.SaasFreePeriodWhereInput = {
      billingProfileId: profile.id,
      deletedAt: null
    };
    const [rows, total] = await Promise.all([
      this.client.saasFreePeriod.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }]
      }),
      this.client.saasFreePeriod.count({ where })
    ]);

    return buildPaginatedResponse(
      rows.map((row) => this.mapFreePeriod(row)),
      total,
      input
    );
  }

  public async listInvoices(
    input: SaasInvoiceListQuery
  ): Promise<ReturnType<typeof buildPaginatedResponse<SaasInvoicePayload>>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.SaasInvoiceWhereInput = {
      deletedAt: null,
      ...(input.status ? { status: input.status } : {}),
      ...(input.payerType ? { payerType: input.payerType } : {}),
      ...(input.from || input.to
        ? {
            dueAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {})
            }
          }
        : {})
    };
    const [rows, total] = await Promise.all([
      this.client.saasInvoice.findMany({
        where,
        include: invoiceInclude,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ dueAt: "desc" }, { id: "desc" }]
      }),
      this.client.saasInvoice.count({ where })
    ]);

    return buildPaginatedResponse(
      rows.map((row) => this.mapInvoice(row)),
      total,
      input
    );
  }

  public async materializeDueInvoices(input: { now: Date }): Promise<GeneratedInvoiceRecord[]> {
    const horizon = this.policy.calculateInvoiceGenerationHorizon(input.now);

    return this.client.$transaction(async (tx) => {
      await tx.saasInvoice.updateMany({
        where: { status: "pending", dueAt: { lte: input.now }, deletedAt: null },
        data: { status: "overdue" }
      });
      const profiles = await tx.saasBillingProfile.findMany({
        where: {
          activeKey: { not: null },
          billingCadence: { in: ["monthly", "annual"] },
          deletedAt: null
        },
        select: {
          subjectType: true,
          subjectId: true,
          merchantAccountId: true,
          shopId: true,
          billingCadence: true,
          monthlyFeeJpy: true,
          trialStatus: true,
          trialEndsAt: true,
          paidThrough: true,
          paymentProvider: true
        }
      });
      const shopIds = profiles.flatMap((profile) => (profile.shopId ? [profile.shopId] : []));
      const profileMerchantIds = profiles.flatMap((profile) =>
        profile.merchantAccountId ? [profile.merchantAccountId] : []
      );
      const [shops, technicianCounts, memberships] = await Promise.all([
        tx.shop.findMany({
          where: { id: { in: shopIds }, deletedAt: null },
          select: { id: true, name: true }
        }),
        tx.technicianProfile.groupBy({
          by: ["shopId"],
          where: { shopId: { in: shopIds }, status: "published", deletedAt: null },
          _count: { _all: true }
        }),
        tx.merchantShopMembership.findMany({
          where: {
            shopId: { in: shopIds },
            activeKey: { not: null },
            endsAt: null,
            deletedAt: null,
            merchantAccount: { deletedAt: null }
          },
          select: {
            shopId: true,
            merchantAccountId: true,
            merchantAccount: { select: { name: true, paymentResponsibility: true } }
          }
        })
      ]);
      const merchantIds = Array.from(
        new Set([
          ...profileMerchantIds,
          ...memberships.map((membership) => membership.merchantAccountId)
        ])
      );
      const merchants = await tx.merchantAccount.findMany({
        where: { id: { in: merchantIds }, deletedAt: null },
        select: { id: true, name: true, paymentResponsibility: true }
      });
      const shopById = new Map(shops.map((shop) => [shop.id, shop]));
      const merchantById = new Map(merchants.map((merchant) => [merchant.id, merchant]));
      const membershipByShopId = new Map(
        memberships.map((membership) => [membership.shopId, membership])
      );
      const technicianCountByShopId = new Map(
        technicianCounts.map((row) => [row.shopId, row._count._all])
      );
      const plans: InvoiceLinePlan[] = [];

      for (const profile of profiles) {
        const cadence = profile.billingCadence === "annual" ? "annual" : "monthly";
        const subjectType: BillingSubjectType =
          profile.subjectType === "shop" ? "shop" : "merchant_account";
        const boundary = profile.paidThrough ?? profile.trialEndsAt;

        if (
          !boundary ||
          boundary.getTime() > horizon.getTime() ||
          profile.trialStatus === "not_started" ||
          (profile.trialStatus === "active" &&
            profile.trialEndsAt !== null &&
            profile.trialEndsAt.getTime() > horizon.getTime())
        ) {
          continue;
        }

        let payerType: BillingSubjectType;
        let payerId: number;
        let description: string;

        if (subjectType === "merchant_account") {
          const merchant = profile.merchantAccountId
            ? merchantById.get(profile.merchantAccountId)
            : undefined;
          if (!merchant) {
            continue;
          }
          payerType = "merchant_account";
          payerId = merchant.id;
          description = merchant.name;
        } else {
          const shop = profile.shopId ? shopById.get(profile.shopId) : undefined;
          if (!shop || (technicianCountByShopId.get(shop.id) ?? 0) < 2) {
            continue;
          }
          const membership = membershipByShopId.get(shop.id);
          const consolidated =
            membership?.merchantAccount.paymentResponsibility === "group_consolidated";
          payerType = consolidated ? "merchant_account" : "shop";
          payerId = consolidated ? membership!.merchantAccountId : shop.id;
          description = shop.name;
        }

        let periodStartsAt = boundary;
        for (
          let index = 0;
          index < 24 && periodStartsAt.getTime() <= horizon.getTime();
          index += 1
        ) {
          const coverage = this.policy.calculateBillingCoverage(
            cadence,
            periodStartsAt,
            profile.monthlyFeeJpy
          );
          plans.push({
            payerType,
            payerId,
            subjectType,
            subjectId: profile.subjectId,
            description,
            billingCadence: cadence,
            monthlyFeeJpy: profile.monthlyFeeJpy,
            amountJpy: coverage.amountJpy,
            periodStartsAt: coverage.startsAt,
            periodEndsAt: coverage.endsAt,
            paymentProvider: profile.paymentProvider === "stripe" ? "stripe" : "manual"
          });
          periodStartsAt = coverage.endsAt;
        }
      }

      const planGroups = new Map<string, InvoiceLinePlan[]>();
      for (const plan of plans) {
        const key = [
          plan.payerType,
          plan.payerId,
          plan.billingCadence,
          plan.periodStartsAt.toISOString(),
          plan.periodEndsAt.toISOString()
        ].join(":");
        planGroups.set(key, [...(planGroups.get(key) ?? []), plan]);
      }

      const generated: GeneratedInvoiceRecord[] = [];
      for (const [key, lines] of planGroups) {
        const first = lines[0];
        if (!first) {
          continue;
        }
        const existing = await tx.saasInvoice.findFirst({
          where: {
            payerType: first.payerType,
            ...(first.payerType === "merchant_account"
              ? { merchantAccountId: first.payerId }
              : { shopId: first.payerId }),
            billingCadence: first.billingCadence,
            periodStartsAt: first.periodStartsAt,
            periodEndsAt: first.periodEndsAt,
            deletedAt: null
          },
          select: { id: true }
        });
        if (existing) {
          continue;
        }
        const amountJpy = lines.reduce((total, line) => total + line.amountJpy, 0);
        const idempotencyKey = `auto:invoice:${key}`;
        const invoice = await tx.saasInvoice.upsert({
          where: { idempotencyKey },
          create: {
            invoiceNo: `SAAS-${first.payerType === "merchant_account" ? "M" : "S"}${first.payerId}-${first.periodStartsAt.getTime()}-${first.billingCadence === "annual" ? "A" : "M"}`,
            payerType: first.payerType,
            ...(first.payerType === "merchant_account"
              ? { merchantAccountId: first.payerId }
              : { shopId: first.payerId }),
            billingCadence: first.billingCadence,
            periodStartsAt: first.periodStartsAt,
            periodEndsAt: first.periodEndsAt,
            dueAt: first.periodStartsAt,
            amountJpy,
            status: first.periodStartsAt.getTime() <= input.now.getTime() ? "overdue" : "pending",
            paymentProvider: first.paymentProvider,
            idempotencyKey
          },
          update: {}
        });
        for (const line of lines) {
          await tx.saasInvoiceLine.upsert({
            where: {
              idempotencyKey: `auto:invoice-line:${invoice.id}:${line.subjectType}:${line.subjectId}`
            },
            create: {
              invoiceId: invoice.id,
              subjectType: line.subjectType,
              ...(line.subjectType === "merchant_account"
                ? { merchantAccountId: line.subjectId }
                : { shopId: line.subjectId }),
              description: line.description,
              monthlyFeeJpy: line.monthlyFeeJpy,
              amountJpy: line.amountJpy,
              periodStartsAt: line.periodStartsAt,
              periodEndsAt: line.periodEndsAt,
              idempotencyKey: `auto:invoice-line:${invoice.id}:${line.subjectType}:${line.subjectId}`
            },
            update: {}
          });
        }
        generated.push({
          id: invoice.id,
          payerType: first.payerType,
          payerId: first.payerId,
          billingCadence: first.billingCadence,
          periodStartsAt: first.periodStartsAt,
          periodEndsAt: first.periodEndsAt,
          amountJpy,
          lineCount: lines.length
        });
      }

      return generated;
    });
  }

  public async getInvoice(id: number): Promise<SaasInvoicePayload | null> {
    const row = await this.client.saasInvoice.findFirst({
      where: { id, deletedAt: null },
      include: invoiceInclude
    });

    return row ? this.mapInvoice(row) : null;
  }

  public async recordManualPayment(
    input: ManualPaymentRepositoryInput
  ): Promise<SaasInvoicePayload | null> {
    const invoiceId = await this.client.$transaction(async (tx) => {
      const invoice = await tx.saasInvoice.findFirst({
        where: { id: input.invoiceId, deletedAt: null },
        include: invoiceInclude
      });

      if (!invoice) {
        return null;
      }

      const existingPayment = await tx.saasPayment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { invoiceId: true }
      });

      if (existingPayment) {
        return existingPayment.invoiceId === invoice.id ? invoice.id : null;
      }
      if (invoice.status === "paid" || input.amountJpy !== invoice.amountJpy) {
        return null;
      }

      await tx.saasPayment.create({
        data: {
          invoiceId: invoice.id,
          provider: input.provider,
          externalReference: input.reference,
          amountJpy: input.amountJpy,
          receivedAt: input.receivedAt,
          status: "confirmed",
          reviewedById: input.actorUserId,
          reviewedAt: new Date(),
          idempotencyKey: input.idempotencyKey
        }
      });
      await tx.saasInvoice.update({
        where: { id: invoice.id },
        data: { status: "paid", paymentProvider: input.provider }
      });

      const coverageEndsAt = input.coverageEndsAt ?? invoice.periodEndsAt;
      for (const line of invoice.lines) {
        const activeKey =
          line.subjectType === "merchant_account" && line.merchantAccountId
            ? `merchant:${line.merchantAccountId}`
            : line.shopId
              ? `shop:${line.shopId}`
              : null;

        if (!activeKey) {
          continue;
        }

        const profile = await tx.saasBillingProfile.findUnique({
          where: { activeKey },
          select: { id: true, paidThrough: true }
        });

        if (profile && (!profile.paidThrough || profile.paidThrough < coverageEndsAt)) {
          await tx.saasBillingProfile.update({
            where: { id: profile.id },
            data: { paidThrough: coverageEndsAt, version: { increment: 1 } }
          });
        }
      }

      return invoice.id;
    });

    return invoiceId ? this.getInvoice(invoiceId) : null;
  }

  public async createSuspension(input: {
    subjectType: BillingSubjectType;
    subjectId: number;
    reasonCodes: string[];
    note: string;
    scope: "subject_only" | "merchant_and_shops" | "merchant_detach_shops";
    actorUserId: number;
  }): Promise<SuspensionResultRecord | null> {
    return this.client.$transaction(async (tx) => {
      const startsAt = new Date();
      const batchKey = `suspension:${input.subjectType}:${input.subjectId}:${startsAt.getTime()}:${input.actorUserId}`;

      if (input.subjectType === "shop") {
        const [shop, activeSuspension] = await Promise.all([
          tx.shop.findFirst({
            where: { id: input.subjectId, deletedAt: null },
            select: { id: true }
          }),
          tx.entitySuspension.findFirst({
            where: {
              subjectType: "shop",
              shopId: input.subjectId,
              activeKey: { not: null },
              status: "active",
              deletedAt: null
            },
            select: { id: true }
          })
        ]);

        if (!shop || activeSuspension || input.scope !== "subject_only") {
          return null;
        }

        const suspension = await tx.entitySuspension.create({
          data: {
            subjectType: "shop",
            shopId: input.subjectId,
            activeKey: `suspension:shop:${input.subjectId}`,
            batchKey,
            status: "active",
            scope: input.scope,
            reasonCodes: input.reasonCodes,
            note: input.note,
            createdById: input.actorUserId,
            startsAt
          }
        });
        await this.blockFutureUnbookedSlots(tx, [input.subjectId], startsAt);
        return {
          id: suspension.id,
          subjectType: "shop",
          subjectId: input.subjectId,
          scope: input.scope,
          reasonCodes: input.reasonCodes,
          note: input.note,
          startsAt,
          affectedShopIds: [input.subjectId],
          detachedShopIds: [],
          promotedAdminUserIds: []
        };
      }

      const merchant = await tx.merchantAccount.findFirst({
        where: { id: input.subjectId, deletedAt: null },
        select: { id: true }
      });

      if (!merchant || input.scope === "subject_only") {
        return null;
      }

      const memberships = await tx.merchantShopMembership.findMany({
        where: {
          merchantAccountId: input.subjectId,
          activeKey: { not: null },
          endsAt: null,
          deletedAt: null
        },
        select: {
          id: true,
          shopId: true,
          shop: { select: { ownerUserId: true } }
        },
        orderBy: { id: "asc" }
      });
      const shopIds = memberships.map((membership) => membership.shopId);
      const activeSuspensions = await tx.entitySuspension.count({
        where: {
          activeKey: { not: null },
          status: "active",
          deletedAt: null,
          OR: [
            { subjectType: "merchant_account", merchantAccountId: input.subjectId },
            ...(shopIds.length > 0 ? [{ subjectType: "shop", shopId: { in: shopIds } }] : [])
          ]
        }
      });

      if (activeSuspensions > 0) {
        return null;
      }

      const promotions =
        input.scope === "merchant_detach_shops"
          ? await this.resolveShopAdminPromotions(tx, memberships)
          : [];

      if (input.scope === "merchant_detach_shops" && promotions.length !== memberships.length) {
        return null;
      }

      const groupSuspension = await tx.entitySuspension.create({
        data: {
          subjectType: "merchant_account",
          merchantAccountId: input.subjectId,
          activeKey: `suspension:merchant:${input.subjectId}`,
          batchKey,
          status: "active",
          scope: input.scope,
          reasonCodes: input.reasonCodes,
          note: input.note,
          createdById: input.actorUserId,
          startsAt
        }
      });
      const detachedShopIds: number[] = [];
      const promotedAdminUserIds: number[] = [];

      if (input.scope === "merchant_and_shops") {
        for (const shopId of shopIds) {
          await tx.entitySuspension.create({
            data: {
              subjectType: "shop",
              shopId,
              activeKey: `suspension:shop:${shopId}`,
              batchKey,
              status: "active",
              scope: "merchant_and_shops",
              reasonCodes: input.reasonCodes,
              note: input.note,
              createdById: input.actorUserId,
              startsAt
            }
          });
        }
        await this.blockFutureUnbookedSlots(tx, shopIds, startsAt);
      } else {
        for (const promotion of promotions) {
          await this.endMembership(
            tx,
            promotion.membershipId,
            input.actorUserId,
            startsAt,
            "group_suspension_detach"
          );
          await this.applyShopAdminPromotion(
            tx,
            promotion.shopId,
            promotion.userId,
            promotion.roleId
          );
          detachedShopIds.push(promotion.shopId);
          promotedAdminUserIds.push(promotion.userId);
        }
      }

      return {
        id: groupSuspension.id,
        subjectType: "merchant_account",
        subjectId: input.subjectId,
        scope: input.scope,
        reasonCodes: input.reasonCodes,
        note: input.note,
        startsAt,
        affectedShopIds: shopIds,
        detachedShopIds,
        promotedAdminUserIds
      };
    });
  }

  public async releaseSuspension(input: {
    subjectType: BillingSubjectType;
    subjectId: number;
    suspensionId: number;
    reason: string;
    actorUserId: number;
  }): Promise<SuspensionReleaseRecord | null> {
    return this.client.$transaction(async (tx) => {
      const suspension = await tx.entitySuspension.findFirst({
        where: {
          id: input.suspensionId,
          subjectType: input.subjectType,
          ...(input.subjectType === "shop"
            ? { shopId: input.subjectId }
            : { merchantAccountId: input.subjectId }),
          activeKey: { not: null },
          status: "active",
          deletedAt: null
        }
      });

      if (!suspension) {
        return null;
      }

      const releasedAt = new Date();
      await tx.entitySuspension.updateMany({
        where:
          suspension.subjectType === "merchant_account" &&
          suspension.scope === "merchant_and_shops" &&
          suspension.batchKey
            ? { batchKey: suspension.batchKey, status: "active", deletedAt: null }
            : { id: suspension.id, status: "active", deletedAt: null },
        data: {
          activeKey: null,
          status: "released",
          releasedAt,
          releasedById: input.actorUserId,
          releaseReason: input.reason
        }
      });

      return {
        id: suspension.id,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        releasedAt
      };
    });
  }

  public async softDeleteMerchant(
    merchantAccountId: number,
    strategy: "detach_shops" | "delete_eligible_shops",
    actorUserId: number
  ): Promise<MerchantDissolutionRecord | null> {
    return this.client.$transaction(async (tx) => {
      const merchant = await tx.merchantAccount.findFirst({
        where: { id: merchantAccountId, deletedAt: null },
        select: { id: true }
      });

      if (!merchant) {
        return null;
      }

      const memberships = await tx.merchantShopMembership.findMany({
        where: {
          merchantAccountId,
          activeKey: { not: null },
          endsAt: null,
          deletedAt: null
        },
        select: {
          id: true,
          shopId: true,
          shop: { select: { ownerUserId: true } }
        },
        orderBy: { id: "asc" }
      });
      const shopIds = memberships.map((membership) => membership.shopId);

      if (strategy === "delete_eligible_shops" && shopIds.length > 0) {
        const blocked = await tx.bookingOrder.groupBy({
          by: ["shopId"],
          where: {
            shopId: { in: shopIds },
            status: { in: ["PENDING", "CONFIRMED", "IN_SERVICE"] },
            deletedAt: null
          },
          _count: { _all: true }
        });

        if (blocked.length > 0) {
          return { deleted: false, blockedShopIds: blocked.map((row) => row.shopId) };
        }
      }

      const promotions =
        strategy === "detach_shops" ? await this.resolveShopAdminPromotions(tx, memberships) : [];

      if (strategy === "detach_shops" && promotions.length !== memberships.length) {
        return { deleted: false, blockedShopIds: shopIds };
      }

      const deletedAt = new Date();
      if (strategy === "detach_shops") {
        for (const promotion of promotions) {
          await this.endMembership(
            tx,
            promotion.membershipId,
            actorUserId,
            deletedAt,
            "merchant_dissolution_detach"
          );
          await this.applyShopAdminPromotion(
            tx,
            promotion.shopId,
            promotion.userId,
            promotion.roleId
          );
        }
      } else {
        for (const membership of memberships) {
          await this.archiveShop(tx, membership.shopId, actorUserId, deletedAt);
        }
      }

      await tx.saasBillingProfile.updateMany({
        where: { merchantAccountId, activeKey: { not: null }, deletedAt: null },
        data: { activeKey: null, deletedAt }
      });
      await tx.entitySuspension.updateMany({
        where: { merchantAccountId, activeKey: { not: null }, deletedAt: null },
        data: {
          activeKey: null,
          status: "released",
          releasedAt: deletedAt,
          releasedById: actorUserId,
          releaseReason: "merchant_dissolved"
        }
      });
      await tx.merchantAccount.update({
        where: { id: merchantAccountId },
        data: { status: "dissolved", deletedAt }
      });
      return { deleted: true, blockedShopIds: [] };
    });
  }

  public async softDeleteShop(
    shopId: number,
    actorUserId: number
  ): Promise<ShopDissolutionRecord | null> {
    return this.client.$transaction(async (tx) => {
      const shop = await tx.shop.findFirst({
        where: { id: shopId, deletedAt: null },
        select: { id: true }
      });

      if (!shop) {
        return null;
      }

      const activeOrderCount = await tx.bookingOrder.count({
        where: {
          shopId,
          status: { in: ["PENDING", "CONFIRMED", "IN_SERVICE"] },
          deletedAt: null
        }
      });

      if (activeOrderCount > 0) {
        return { deleted: false, activeOrderCount };
      }

      await this.archiveShop(tx, shopId, actorUserId, new Date());
      return { deleted: true, activeOrderCount: 0 };
    });
  }

  private async blockFutureUnbookedSlots(
    tx: Prisma.TransactionClient,
    shopIds: number[],
    startsAt: Date
  ): Promise<void> {
    if (shopIds.length === 0) {
      return;
    }

    await tx.scheduleSlot.updateMany({
      where: {
        shopId: { in: shopIds },
        startsAt: { gte: startsAt },
        status: "AVAILABLE",
        bookedCount: 0,
        deletedAt: null
      },
      data: { status: "BLOCKED" }
    });
  }

  private async resolveShopAdminPromotions(
    tx: Prisma.TransactionClient,
    memberships: Array<{
      id: number;
      shopId: number;
      shop: { ownerUserId: number | null };
    }>
  ): Promise<Array<{ membershipId: number; shopId: number; userId: number; roleId: number }>> {
    const merchantOwnerRole = await tx.role.findFirst({
      where: { code: "merchant_owner", deletedAt: null },
      select: { id: true }
    });

    if (!merchantOwnerRole) {
      return [];
    }

    const promotions: Array<{
      membershipId: number;
      shopId: number;
      userId: number;
      roleId: number;
    }> = [];
    const rolePriority = new Map([
      ["merchant_owner", 4],
      ["merchant_staff", 3],
      ["technician", 2],
      ["customer", 1]
    ]);

    for (const membership of memberships) {
      let userId = membership.shop.ownerUserId;

      if (userId) {
        const owner = await tx.user.findFirst({
          where: { id: userId, isActive: true, deletedAt: null },
          select: { id: true }
        });
        userId = owner?.id ?? null;
      }

      if (!userId) {
        const identities = await tx.userIdentity.findMany({
          where: {
            scopeType: "shop",
            scopeId: membership.shopId,
            isActive: true,
            deletedAt: null,
            user: { isActive: true, deletedAt: null }
          },
          select: {
            userId: true,
            user: {
              select: {
                userRoles: {
                  where: { deletedAt: null },
                  select: { role: { select: { code: true } } }
                }
              }
            }
          },
          orderBy: { id: "asc" }
        });
        identities.sort((left, right) => {
          const score = (entry: (typeof identities)[number]) =>
            Math.max(
              0,
              ...entry.user.userRoles.map((role) => rolePriority.get(role.role.code) ?? 0)
            );
          return score(right) - score(left) || left.userId - right.userId;
        });
        userId = identities[0]?.userId ?? null;
      }

      if (!userId) {
        return [];
      }

      promotions.push({
        membershipId: membership.id,
        shopId: membership.shopId,
        userId,
        roleId: merchantOwnerRole.id
      });
    }

    return promotions;
  }

  private async applyShopAdminPromotion(
    tx: Prisma.TransactionClient,
    shopId: number,
    userId: number,
    roleId: number
  ): Promise<void> {
    const identity = await tx.userIdentity.findFirst({
      where: {
        userId,
        type: "merchant_owner",
        scopeType: "shop",
        scopeId: shopId
      },
      select: { id: true }
    });

    if (identity) {
      await tx.userIdentity.update({
        where: { id: identity.id },
        data: { isActive: true, deletedAt: null }
      });
    } else {
      await tx.userIdentity.create({
        data: {
          userId,
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: shopId,
          displayName: "Shop Account Administrator",
          isDefault: false,
          isActive: true
        }
      });
    }

    const userRole = await tx.userRole.findFirst({
      where: { userId, roleId, scopeType: "shop", scopeId: shopId },
      select: { id: true }
    });

    if (userRole) {
      await tx.userRole.update({ where: { id: userRole.id }, data: { deletedAt: null } });
    } else {
      await tx.userRole.create({ data: { userId, roleId, scopeType: "shop", scopeId: shopId } });
    }

    await tx.shop.update({ where: { id: shopId }, data: { ownerUserId: userId } });
  }

  private async endMembership(
    tx: Prisma.TransactionClient,
    membershipId: number,
    actorUserId: number,
    endedAt: Date,
    reason: string
  ): Promise<void> {
    await tx.merchantShopMembership.update({
      where: { id: membershipId },
      data: {
        activeKey: null,
        endsAt: endedAt,
        removedReason: reason,
        removedById: actorUserId
      }
    });
  }

  private async archiveShop(
    tx: Prisma.TransactionClient,
    shopId: number,
    actorUserId: number,
    deletedAt: Date
  ): Promise<void> {
    const memberships = await tx.merchantShopMembership.findMany({
      where: { shopId, activeKey: { not: null }, endsAt: null, deletedAt: null },
      select: { id: true }
    });

    for (const membership of memberships) {
      await this.endMembership(tx, membership.id, actorUserId, deletedAt, "shop_dissolved");
    }

    await this.blockFutureUnbookedSlots(tx, [shopId], deletedAt);
    await tx.saasBillingProfile.updateMany({
      where: { shopId, activeKey: { not: null }, deletedAt: null },
      data: { activeKey: null, deletedAt }
    });
    await tx.entitySuspension.updateMany({
      where: { shopId, activeKey: { not: null }, deletedAt: null },
      data: {
        activeKey: null,
        status: "released",
        releasedAt: deletedAt,
        releasedById: actorUserId,
        releaseReason: "shop_dissolved"
      }
    });
    await tx.shop.update({
      where: { id: shopId },
      data: { status: "dissolved", deletedAt }
    });
  }

  private async hydrateAccounts(
    merchants: MerchantBaseRow[],
    standaloneShopIds: number[],
    db: DatabaseClient
  ): Promise<MerchantAccountListRecord[]> {
    const merchantIds = merchants.map((merchant) => merchant.id);
    const memberships =
      merchantIds.length > 0
        ? await db.merchantShopMembership.findMany({
            where: {
              merchantAccountId: { in: merchantIds },
              activeKey: { not: null },
              endsAt: null,
              deletedAt: null
            },
            select: { merchantAccountId: true, shopId: true },
            orderBy: [{ startsAt: "asc" }, { id: "asc" }]
          })
        : [];
    const shopIds = Array.from(
      new Set([...standaloneShopIds, ...memberships.map((membership) => membership.shopId)])
    );
    const [shopRows, technicianCounts, profiles, suspensions] = await Promise.all([
      shopIds.length > 0
        ? db.shop.findMany({
            where: { id: { in: shopIds }, deletedAt: null },
            include: shopInclude
          })
        : Promise.resolve([]),
      shopIds.length > 0
        ? db.technicianProfile.groupBy({
            by: ["shopId"],
            where: {
              shopId: { in: shopIds },
              status: "published",
              deletedAt: null
            },
            _count: { _all: true }
          })
        : Promise.resolve([]),
      merchantIds.length > 0 || shopIds.length > 0
        ? db.saasBillingProfile.findMany({
            where: {
              activeKey: { not: null },
              deletedAt: null,
              OR: [
                ...(merchantIds.length > 0
                  ? [{ subjectType: "merchant_account", subjectId: { in: merchantIds } }]
                  : []),
                ...(shopIds.length > 0 ? [{ subjectType: "shop", subjectId: { in: shopIds } }] : [])
              ]
            },
            include: billingProfileInclude
          })
        : Promise.resolve([]),
      merchantIds.length > 0 || shopIds.length > 0
        ? db.entitySuspension.findMany({
            where: {
              activeKey: { not: null },
              status: "active",
              deletedAt: null,
              OR: [
                ...(merchantIds.length > 0
                  ? [{ subjectType: "merchant_account", merchantAccountId: { in: merchantIds } }]
                  : []),
                ...(shopIds.length > 0 ? [{ subjectType: "shop", shopId: { in: shopIds } }] : [])
              ]
            }
          })
        : Promise.resolve([])
    ]);
    const countByShopId = new Map(
      technicianCounts
        .filter((count) => count.shopId !== null)
        .map((count) => [count.shopId!, count._count._all])
    );
    const profileBySubject = new Map(
      profiles.map((profile) => [
        `${profile.subjectType}:${profile.subjectId}`,
        this.mapBillingProfile(
          profile,
          profile.subjectType === "shop" ? (countByShopId.get(profile.subjectId) ?? 0) : undefined
        )
      ])
    );
    const suspensionBySubject = new Map(
      suspensions.map((suspension) => [
        `${suspension.subjectType}:${suspension.subjectType === "shop" ? suspension.shopId : suspension.merchantAccountId}`,
        this.mapSuspension(suspension)
      ])
    );
    const shopById = new Map(
      shopRows.map((shop) => [
        shop.id,
        this.mapShop(
          shop,
          countByShopId.get(shop.id) ?? 0,
          profileBySubject.get(`shop:${shop.id}`) ?? null,
          suspensionBySubject.get(`shop:${shop.id}`) ?? null
        )
      ])
    );
    const membershipShops = new Map<number, ShopAccountRecord[]>();

    for (const membership of memberships) {
      const shop = shopById.get(membership.shopId);

      if (shop) {
        const current = membershipShops.get(membership.merchantAccountId) ?? [];
        current.push(shop);
        membershipShops.set(membership.merchantAccountId, current);
      }
    }

    return [
      ...merchants.map(
        (merchant): MerchantAccountAggregateRecord => ({
          kind: "merchant_group",
          id: merchant.id,
          code: merchant.code,
          name: merchant.name,
          status: merchant.status,
          paymentResponsibility:
            merchant.paymentResponsibility === "shops_individual"
              ? "shops_individual"
              : "group_consolidated",
          createdAt: merchant.createdAt,
          billingProfile: profileBySubject.get(`merchant_account:${merchant.id}`) ?? null,
          activeSuspension: suspensionBySubject.get(`merchant_account:${merchant.id}`) ?? null,
          shops: membershipShops.get(merchant.id) ?? []
        })
      ),
      ...standaloneShopIds.flatMap((id) => {
        const shop = shopById.get(id);
        return shop ? [shop] : [];
      })
    ];
  }

  private async loadBillingProfile(
    subjectType: BillingSubjectType,
    subjectId: number,
    db: DatabaseClient
  ): Promise<SaasBillingProfileRecord | null> {
    const profile = await db.saasBillingProfile.findFirst({
      where: {
        subjectType,
        subjectId,
        activeKey: { not: null },
        deletedAt: null
      },
      include: billingProfileInclude
    });

    if (!profile) {
      return null;
    }

    const activeTechnicians =
      subjectType === "shop"
        ? await db.technicianProfile.count({
            where: { shopId: subjectId, status: "published", deletedAt: null }
          })
        : undefined;
    return this.mapBillingProfile(profile, activeTechnicians);
  }

  private async activateShopTrial(
    tx: Prisma.TransactionClient,
    profile: BillingProfileRow,
    trial: { startsAt: Date; endsAt: Date }
  ): Promise<{ id: number } | null> {
    const updated = await tx.saasBillingProfile.updateMany({
      where: {
        id: profile.id,
        version: profile.version,
        trialStatus: "not_started",
        trialUsedAt: null,
        deletedAt: null
      },
      data: {
        trialStatus: "active",
        trialStartedAt: trial.startsAt,
        trialEndsAt: trial.endsAt,
        trialUsedAt: trial.startsAt,
        version: { increment: 1 }
      }
    });
    return updated.count === 1 ? { id: profile.id } : null;
  }

  private async truncateFreePeriods(
    tx: Prisma.TransactionClient,
    billingProfileId: number,
    at: Date,
    reason: string
  ): Promise<void> {
    await tx.saasFreePeriod.updateMany({
      where: {
        billingProfileId,
        startsAt: { lt: at },
        endsAt: { gt: at },
        deletedAt: null
      },
      data: { endsAt: at, reason }
    });
    await tx.saasFreePeriod.updateMany({
      where: {
        billingProfileId,
        startsAt: { gte: at },
        deletedAt: null
      },
      data: { deletedAt: at, reason }
    });
  }

  private merchantWhere(input: MerchantAccountListQuery): Prisma.MerchantAccountWhereInput {
    return {
      deletedAt: null,
      ...(input.status ? { status: input.status } : {}),
      ...(input.query
        ? {
            OR: [{ name: { contains: input.query } }, { code: { contains: input.query } }]
          }
        : {})
    };
  }

  private standaloneShopWhere(input: MerchantAccountListQuery): Prisma.ShopWhereInput {
    return {
      deletedAt: null,
      ...(input.status ? { status: input.status } : {}),
      ...(input.query ? { name: { contains: input.query } } : {}),
      merchantMemberships: {
        none: {
          activeKey: { not: null },
          endsAt: null,
          deletedAt: null,
          merchantAccount: { deletedAt: null }
        }
      }
    };
  }

  private mapShop(
    shop: ShopRow,
    technicianCount: number,
    billingProfile: SaasBillingProfileRecord | null,
    activeSuspension: ActiveSuspensionRecord | null
  ): ShopAccountRecord {
    return {
      kind: "shop",
      id: shop.id,
      name: shop.name,
      city: shop.city,
      address: shop.address,
      phone: shop.phone,
      status: shop.status,
      ownerEmail: shop.owner?.email ?? null,
      coverUrl: shop.mediaAssets[0]?.url ?? null,
      ratingAverage: Number(shop.reviewSummary?.ratingAverage?.toString() ?? 0),
      reviewCount: shop.reviewSummary?.reviewCount ?? 0,
      technicianCount,
      createdAt: shop.createdAt,
      billingProfile,
      activeSuspension
    };
  }

  private mapBillingProfile(
    profile: BillingProfileRow,
    activeTechnicians?: number
  ): SaasBillingProfileRecord {
    return {
      id: profile.id,
      subjectType: profile.subjectType === "shop" ? "shop" : "merchant_account",
      subjectId: profile.subjectId,
      billingCadence:
        profile.billingCadence === "annual" || profile.billingCadence === "free"
          ? profile.billingCadence
          : "monthly",
      monthlyFeeJpy: profile.monthlyFeeJpy,
      cadenceLocked: profile.cadenceLocked,
      amountLocked: profile.amountLocked,
      trialStatus: this.mapTrialStatus(profile.trialStatus),
      trialStartedAt: profile.trialStartedAt,
      trialEndsAt: profile.trialEndsAt,
      trialUsedAt: profile.trialUsedAt,
      paidThrough: profile.paidThrough,
      paymentProvider: profile.paymentProvider === "stripe" ? "stripe" : "manual",
      version: profile.version,
      freePeriods: profile.freePeriods.map((period) => this.mapFreePeriod(period)),
      activeTechnicians
    };
  }

  private mapFreePeriod(period: {
    id: number;
    periodType: string;
    startsAt: Date;
    endsAt: Date | null;
    extensionSequence: number | null;
    reason: string | null;
  }): SaasFreePeriodRecord {
    return {
      id: period.id,
      periodType: period.periodType,
      startsAt: period.startsAt,
      endsAt: period.endsAt,
      extensionSequence: period.extensionSequence,
      reason: period.reason
    };
  }

  private mapSuspension(suspension: {
    id: number;
    scope: string;
    reasonCodes: unknown;
    startsAt: Date;
  }): ActiveSuspensionRecord {
    return {
      id: suspension.id,
      scope: suspension.scope,
      reasonCodes: Array.isArray(suspension.reasonCodes)
        ? suspension.reasonCodes.filter((value): value is string => typeof value === "string")
        : [],
      startsAt: suspension.startsAt
    };
  }

  private mapInvoice(invoice: InvoiceRow): SaasInvoicePayload {
    const payerType: BillingSubjectType =
      invoice.payerType === "shop" ? "shop" : "merchant_account";
    return {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      payerType,
      payerId: payerType === "shop" ? (invoice.shopId ?? 0) : (invoice.merchantAccountId ?? 0),
      billingCadence:
        invoice.billingCadence === "annual" || invoice.billingCadence === "free"
          ? invoice.billingCadence
          : "monthly",
      periodStartsAt: invoice.periodStartsAt.toISOString(),
      periodEndsAt: invoice.periodEndsAt.toISOString(),
      dueAt: invoice.dueAt.toISOString(),
      amountJpy: invoice.amountJpy,
      status: invoice.status,
      paymentProvider: invoice.paymentProvider === "stripe" ? "stripe" : "manual",
      lines: invoice.lines.map((line) => ({
        id: line.id,
        subjectType: line.subjectType === "shop" ? "shop" : "merchant_account",
        subjectId: line.subjectType === "shop" ? (line.shopId ?? 0) : (line.merchantAccountId ?? 0),
        description: line.description,
        monthlyFeeJpy: line.monthlyFeeJpy,
        amountJpy: line.amountJpy,
        periodStartsAt: line.periodStartsAt.toISOString(),
        periodEndsAt: line.periodEndsAt.toISOString()
      })),
      payments: invoice.payments.map(
        (payment): SaasPaymentPayload => ({
          id: payment.id,
          provider: payment.provider === "stripe" ? "stripe" : "manual",
          externalReference: payment.externalReference,
          amountJpy: payment.amountJpy,
          receivedAt: payment.receivedAt.toISOString(),
          status: payment.status,
          reviewedById: payment.reviewedById,
          reviewedAt: payment.reviewedAt?.toISOString() ?? null
        })
      )
    };
  }

  private mapTrialStatus(value: string): SaasBillingProfileRecord["trialStatus"] {
    return ["not_started", "active", "completed", "interrupted", "not_applicable"].includes(value)
      ? (value as SaasBillingProfileRecord["trialStatus"])
      : "not_started";
  }
}
