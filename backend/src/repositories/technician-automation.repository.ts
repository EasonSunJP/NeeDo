import {
  Prisma,
  TechnicianAutomationKind as DatabaseTechnicianAutomationKind,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";
import type {
  TechnicianAutomationContactPage,
  TechnicianAutomationRepositoryPort,
  TechnicianAutomationSettingRecord,
  TechnicianAutomationSettingSaveInput,
  TechnicianAutomationSettingSaveResult
} from "../services/technician-automation.service";
import type { TechnicianAutomationKindValue } from "../validators/technician-automation.validator";
import { technicianAutomationRulesSchema } from "../validators/technician-automation.validator";
import type {
  TechnicianAutomationCandidate,
  TechnicianAutomationProcessorRepositoryPort,
  TechnicianRequestAutomationCandidate
} from "../services/technician-automation-processor";

const kindToDatabase: Record<TechnicianAutomationKindValue, DatabaseTechnicianAutomationKind> = {
  booking: DatabaseTechnicianAutomationKind.BOOKING,
  request: DatabaseTechnicianAutomationKind.REQUEST
};

const kindFromDatabase = (kind: DatabaseTechnicianAutomationKind): TechnicianAutomationKindValue =>
  kind === DatabaseTechnicianAutomationKind.BOOKING ? "booking" : "request";

export class TechnicianAutomationRepository implements TechnicianAutomationRepositoryPort, TechnicianAutomationProcessorRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findSetting(
    technicianProfileId: number,
    kind: TechnicianAutomationKindValue
  ): Promise<TechnicianAutomationSettingRecord | null> {
    const row = await this.client.technicianAutomationSetting.findUnique({
      where: { technicianProfileId_kind: { technicianProfileId, kind: kindToDatabase[kind] } }
    });
    return row && !row.deletedAt
      ? {
          id: row.id,
          technicianProfileId: row.technicianProfileId,
          kind: kindFromDatabase(row.kind),
          enabled: row.enabled,
          rules: row.rules,
          version: row.version,
          updatedAt: row.updatedAt
        }
      : null;
  }

  public async saveSetting(
    input: TechnicianAutomationSettingSaveInput
  ): Promise<TechnicianAutomationSettingSaveResult> {
    return this.client.$transaction(async (transaction) => {
      const selector = {
        technicianProfileId_kind: {
          technicianProfileId: input.technicianProfileId,
          kind: kindToDatabase[input.kind]
        }
      };
      const current = await transaction.technicianAutomationSetting.findUnique({ where: selector });
      if (current && current.version !== input.expectedVersion) {
        return { outcome: "version_conflict" as const, currentVersion: current.version };
      }
      if (!current && input.expectedVersion !== 1) {
        return { outcome: "version_conflict" as const, currentVersion: 1 };
      }
      const row = current
        ? await transaction.technicianAutomationSetting.update({
            where: selector,
            data: {
              enabled: input.enabled,
              rules: input.rules as Prisma.InputJsonValue,
              version: { increment: 1 },
              deletedAt: null
            }
          })
        : await transaction.technicianAutomationSetting.create({
            data: {
              technicianProfileId: input.technicianProfileId,
              kind: kindToDatabase[input.kind],
              enabled: input.enabled,
              rules: input.rules as Prisma.InputJsonValue,
              version: 1
            }
          });
      await transaction.auditLog.create({
        data: toAuditLogCreateData({
          ...input.audit,
          targetId: row.id,
          metadata: {
            ...(input.audit.metadata as Record<string, unknown>),
            kind: input.kind,
            enabled: input.enabled,
            versionBefore: current?.version ?? null,
            versionAfter: row.version
          }
        })
      });
      return {
        outcome: "ok" as const,
        setting: {
          id: row.id,
          technicianProfileId: row.technicianProfileId,
          kind: kindFromDatabase(row.kind),
          enabled: row.enabled,
          rules: row.rules,
          version: row.version,
          updatedAt: row.updatedAt
        }
      };
    });
  }

  public async listContacts(input: {
    ownerIdentityId: number;
    page: number;
    pageSize: number;
    search?: string;
  }): Promise<TechnicianAutomationContactPage> {
    const where: Prisma.ContactWhereInput = {
      ownerIdentityId: input.ownerIdentityId,
      blockedAt: null,
      deletedAt: null,
      contactIdentity: {
        isActive: true,
        deletedAt: null,
        ...(input.search
          ? {
              OR: [
                { displayName: { contains: input.search } },
                { publicIdentifier: { is: { publicId: { contains: input.search } } } }
              ]
            }
          : {})
      }
    };
    const [rows, total] = await Promise.all([
      this.client.contact.findMany({
        where,
        include: {
          contactIdentity: {
            include: { publicIdentifier: true, user: { select: { avatarUrl: true } } }
          }
        },
        orderBy: [{ contactIdentity: { displayName: "asc" } }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize
      }),
      this.client.contact.count({ where })
    ]);
    return {
      list: rows.map((row) => ({
        identityId: row.contactIdentityId,
        publicId: row.contactIdentity.publicIdentifier?.publicId ?? "",
        displayName: row.nickname ?? row.contactIdentity.displayName ?? row.contactIdentity.publicIdentifier?.publicId ?? "",
        avatarUrl: row.contactIdentity.user.avatarUrl
      })),
      total,
      page: input.page,
      page_size: input.pageSize
    };
  }

  public async loadBookingCandidate(orderId: number): Promise<TechnicianAutomationCandidate | null> {
    const order = await this.client.bookingOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        id: true,
        status: true,
        customerUserId: true,
        technicianProfileId: true,
        serviceId: true,
        technicianServiceId: true,
        startsAt: true,
        endsAt: true,
        priceAmount: true,
        fulfillmentMode: true,
        paymentMethod: true,
        serviceLocation: { select: { admin1RegionCode: true, admin2RegionCode: true } },
        scheduleSlot: { select: { startsAt: true, endsAt: true, deletedAt: true } },
        technicianProfile: {
          select: {
            id: true,
            userId: true,
            status: true,
            verifiedAt: true,
            deletedAt: true,
            user: { select: { isActive: true, deletedAt: true } },
            automationSettings: {
              where: { kind: DatabaseTechnicianAutomationKind.BOOKING, enabled: true, deletedAt: null },
              take: 1
            }
          }
        }
      }
    });
    const profile = order?.technicianProfile;
    const setting = profile?.automationSettings[0];
    if (!order || !profile || !setting || order.status !== "PENDING") return null;
    const identity = await this.client.userIdentity.findFirst({
      where: {
        userId: profile.userId,
        type: "technician",
        scopeType: "technician_profile",
        scopeId: profile.id,
        isActive: true,
        deletedAt: null
      },
      include: { publicIdentifier: true },
      orderBy: [{ isDefault: "desc" }, { id: "asc" }]
    });
    if (!identity?.publicIdentifier) return null;
    const rules = technicianAutomationRulesSchema.parse(setting.rules);
    const customer = await this.loadCustomerEvidence(
      order.customerUserId,
      profile.id,
      identity.id,
      order.startsAt,
      order.endsAt,
      rules.bufferMinutes,
      order.id
    );
    return {
      settingId: setting.id,
      technicianProfileId: profile.id,
      technicianUserId: profile.userId,
      technicianIdentityId: identity.id,
      technicianPublicId: identity.publicIdentifier.publicId,
      ruleVersion: setting.version,
      rules,
      context: {
        now: new Date(),
        startsAt: order.startsAt,
        endsAt: order.endsAt,
        actualScheduleAvailable:
          !order.scheduleSlot.deletedAt &&
          order.startsAt >= order.scheduleSlot.startsAt &&
          order.endsAt <= order.scheduleSlot.endsAt,
        hasBufferedConflict: customer.hasBufferedConflict,
        hardBlockReasons: [
          ...(profile.user.isActive && !profile.user.deletedAt ? [] : ["account_disabled"]),
          ...(profile.status === "published" && !profile.deletedAt ? [] : ["technician_unavailable"]),
          ...(profile.verifiedAt ? [] : ["technician_qualification_required"])
        ],
        areaCode: order.serviceLocation
          ? `${order.serviceLocation.admin1RegionCode ?? ""}/${order.serviceLocation.admin2RegionCode ?? ""}`
          : null,
        distanceKm: null,
        grossAmountJpy: Math.round(Number(order.priceAmount.toString())),
        netAmountJpy: null,
        customerRating: customer.rating,
        customerCompletedOrders: customer.completed,
        customerHistoricalOrders: customer.total,
        customerCancellationRatePercent: customer.cancellationRate,
        customerEkycVerified: customer.ekycVerified,
        customerIsContact: customer.contactIdentityId !== null,
        referralContactIdentityId: customer.contactIdentityId,
        completedOrdersWithTechnician: customer.completedWithTechnician,
        partyType: "single",
        serviceMode: order.fulfillmentMode === "home" ? "home" : "store",
        paymentMethod: this.mapPaymentMethod(order.paymentMethod),
        serviceId: order.technicianServiceId ?? order.serviceId ?? 0,
        technicianOnline: null,
        tagsMatch: true
      }
    };
  }

  public async loadRequestCandidates(postId: number): Promise<TechnicianRequestAutomationCandidate[]> {
    const now = new Date();
    const post = await this.client.exchangePost.findFirst({
      where: { id: postId, type: "DEMAND", status: "PUBLISHED", expiresAt: { gt: now }, deletedAt: null },
      include: { demand: true }
    });
    if (!post?.demand) return [];
    const slots = await this.client.scheduleSlot.findMany({
      where: {
        technicianProfileId: { not: null },
        startsAt: { gte: post.serviceStartAt },
        endsAt: { lte: post.serviceEndAt },
        status: "AVAILABLE",
        deletedAt: null,
        OR: [
          { service: { is: { status: "published", deletedAt: null } } },
          { technicianService: { is: { isActive: true, isBookable: true, reviewStatus: "APPROVED", deletedAt: null } } }
        ],
        technicianProfile: {
          is: {
            status: "published",
            verifiedAt: { not: null },
            deletedAt: null,
            user: { is: { isActive: true, deletedAt: null } },
            automationSettings: { some: { kind: DatabaseTechnicianAutomationKind.REQUEST, enabled: true, deletedAt: null } }
          }
        }
      },
      include: {
        service: { select: { id: true } },
        technicianService: { select: { id: true } },
        technicianProfile: {
          include: {
            user: { select: { id: true } },
            workState: true,
            automationSettings: { where: { kind: DatabaseTechnicianAutomationKind.REQUEST, enabled: true, deletedAt: null }, take: 1 }
          }
        }
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 200
    });
    const firstSlotByTechnician = new Map<number, (typeof slots)[number]>();
    for (const slot of slots) {
      if (slot.technicianProfileId && !firstSlotByTechnician.has(slot.technicianProfileId)) {
        firstSlotByTechnician.set(slot.technicianProfileId, slot);
      }
    }
    const technicianIds = [...firstSlotByTechnician.keys()];
    if (technicianIds.length === 0) return [];
    const identities = await this.client.userIdentity.findMany({
      where: { type: "technician", scopeType: "technician_profile", scopeId: { in: technicianIds }, isActive: true, deletedAt: null },
      include: { publicIdentifier: true },
      orderBy: [{ isDefault: "desc" }, { id: "asc" }]
    });
    const identityByTechnician = new Map<number, (typeof identities)[number]>();
    for (const identity of identities) {
      if (identity.scopeId && identity.publicIdentifier && !identityByTechnician.has(identity.scopeId)) identityByTechnician.set(identity.scopeId, identity);
    }
    const customerEvidence = await this.loadCustomerBaseEvidence(post.authorUserId);
    const contacts = await this.client.contact.findMany({
      where: { ownerIdentityId: { in: identities.map((identity) => identity.id) }, contactUserId: post.authorUserId, blockedAt: null, deletedAt: null },
      select: { ownerIdentityId: true, contactIdentityId: true }
    });
    const contactByOwner = new Map(contacts.map((contact) => [contact.ownerIdentityId, contact.contactIdentityId]));
    const results: TechnicianRequestAutomationCandidate[] = [];
    for (const [technicianProfileId, slot] of firstSlotByTechnician) {
      const identity = identityByTechnician.get(technicianProfileId);
      const setting = slot.technicianProfile?.automationSettings[0];
      if (!identity?.publicIdentifier || !setting || !slot.technicianProfile) continue;
      const rules = technicianAutomationRulesSchema.parse(setting.rules);
      const bufferStart = new Date(slot.startsAt.getTime() - rules.bufferMinutes * 60_000);
      const bufferEnd = new Date(slot.endsAt.getTime() + rules.bufferMinutes * 60_000);
      const [bufferedBooking, completedWithTechnician] = await Promise.all([
        this.client.bookingOrder.count({
          where: { technicianProfileId, status: { in: ["CONFIRMED", "IN_SERVICE"] }, startsAt: { lt: bufferEnd }, endsAt: { gt: bufferStart }, deletedAt: null }
        }),
        this.client.bookingOrder.count({
          where: { technicianProfileId, customerUserId: post.authorUserId, status: "COMPLETED", deletedAt: null }
        })
      ]);
      const contactIdentityId = contactByOwner.get(identity.id) ?? null;
      const serviceId = slot.technicianService?.id ?? slot.service?.id ?? 0;
      results.push({
        settingId: setting.id,
        technicianProfileId,
        technicianUserId: slot.technicianProfile.userId,
        technicianIdentityId: identity.id,
        technicianPublicId: identity.publicIdentifier.publicId,
        ruleVersion: setting.version,
        rules,
        scheduleSlotId: slot.id,
        quoteAmountJpy: post.demand.budgetMaxJpy,
        message: "NeeDo 自动应募",
        context: {
          now,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          actualScheduleAvailable: true,
          hasBufferedConflict: bufferedBooking > 0,
          hardBlockReasons: [],
          areaCode: post.areaLabel,
          distanceKm: null,
          grossAmountJpy: post.demand.budgetMaxJpy,
          netAmountJpy: null,
          customerRating: customerEvidence.rating,
          customerCompletedOrders: customerEvidence.completed,
          customerHistoricalOrders: customerEvidence.total,
          customerCancellationRatePercent: customerEvidence.cancellationRate,
          customerEkycVerified: customerEvidence.ekycVerified,
          customerIsContact: contactIdentityId !== null,
          referralContactIdentityId: contactIdentityId,
          completedOrdersWithTechnician: completedWithTechnician,
          partyType: "single",
          serviceMode: post.demand.serviceMode === "HOME" ? "home" : "store",
          paymentMethod: "other",
          serviceId,
          technicianOnline: this.isOnline(slot.technicianProfile.workState?.status ?? null),
          tagsMatch: null
        }
      });
    }
    return results;
  }

  public async reserveDecision(input: Parameters<TechnicianAutomationProcessorRepositoryPort["reserveDecision"]>[0]): Promise<boolean> {
    try {
      await this.client.technicianAutomationDecisionLog.create({
        data: {
          settingId: input.settingId,
          technicianProfileId: input.technicianProfileId,
          kind: kindToDatabase[input.kind],
          targetType: input.targetType,
          targetId: input.targetId,
          actionType: input.actionType,
          ruleVersion: input.ruleVersion,
          outcome: "MATCHED",
          matchedConditions: [],
          failedReasons: [],
          idempotencyKey: input.idempotencyKey
        }
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  public async completeDecision(input: Parameters<TechnicianAutomationProcessorRepositoryPort["completeDecision"]>[0]): Promise<void> {
    const outcome = {
      not_matched: "NOT_MATCHED",
      executed: "EXECUTED",
      action_failed: "ACTION_FAILED",
      already_handled: "ALREADY_HANDLED"
    }[input.outcome] as "NOT_MATCHED" | "EXECUTED" | "ACTION_FAILED" | "ALREADY_HANDLED";
    await this.client.technicianAutomationDecisionLog.update({
      where: { idempotencyKey: input.idempotencyKey },
      data: {
        outcome,
        matchedConditions: input.matchedConditions,
        failedReasons: input.failedReasons,
        executedAt: input.executedAt
      }
    });
  }

  public async notifyAutomaticAction(input: Parameters<TechnicianAutomationProcessorRepositoryPort["notifyAutomaticAction"]>[0]): Promise<void> {
    await this.client.notification.create({
      data: {
        recipientUserId: input.technicianUserId,
        recipientIdentityId: input.technicianIdentityId,
        type: "SYSTEM",
        title: input.kind === "booking" ? "已自动接受 Booking 预约" : "已自动应募 Request",
        body: input.kind === "booking" ? "系统已按你当前的接单规则接受预约。" : "系统已按你当前的抢单规则提交应募，最终仍由用户选择。",
        payload: { kind: input.kind, targetId: input.targetId, automatic: true }
      }
    });
  }

  private async loadCustomerBaseEvidence(customerUserId: number) {
    const now = new Date();
    const [profile, completed, cancelled, total, ekyc] = await Promise.all([
      this.client.customerProfile.findUnique({ where: { userId: customerUserId }, include: { reviewSummary: true } }),
      this.client.bookingOrder.count({ where: { customerUserId, status: "COMPLETED", deletedAt: null } }),
      this.client.bookingOrder.count({ where: { customerUserId, status: "CANCELLED", deletedAt: null } }),
      this.client.bookingOrder.count({ where: { customerUserId, deletedAt: null } }),
      this.client.ekycVerification.count({ where: { userId: customerUserId, status: "verified", verifiedAt: { not: null }, deletedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } })
    ]);
    return {
      rating: profile?.reviewSummary ? Number(profile.reviewSummary.ratingAverage.toString()) : null,
      completed,
      total,
      cancellationRate: total > 0 ? (cancelled / total) * 100 : null,
      ekycVerified: ekyc > 0
    };
  }

  private async loadCustomerEvidence(
    customerUserId: number,
    technicianProfileId: number,
    technicianIdentityId: number,
    startsAt: Date,
    endsAt: Date,
    bufferMinutes: number,
    excludedOrderId: number
  ) {
    const base = await this.loadCustomerBaseEvidence(customerUserId);
    const [contact, completedWithTechnician, bufferedConflict] = await Promise.all([
      this.client.contact.findFirst({ where: { ownerIdentityId: technicianIdentityId, contactUserId: customerUserId, blockedAt: null, deletedAt: null }, select: { contactIdentityId: true } }),
      this.client.bookingOrder.count({ where: { customerUserId, technicianProfileId, status: "COMPLETED", deletedAt: null } }),
      this.client.bookingOrder.count({
        where: {
          id: { not: excludedOrderId },
          technicianProfileId,
          status: { in: ["CONFIRMED", "IN_SERVICE"] },
          startsAt: { lt: new Date(endsAt.getTime() + bufferMinutes * 60_000) },
          endsAt: { gt: new Date(startsAt.getTime() - bufferMinutes * 60_000) },
          deletedAt: null
        }
      })
    ]);
    return { ...base, contactIdentityId: contact?.contactIdentityId ?? null, completedWithTechnician, hasBufferedConflict: bufferedConflict > 0 };
  }

  private mapPaymentMethod(value: string): "onsite" | "card" | "ndp" | "bank_transfer" | "other" {
    const normalized = value.toLowerCase();
    if (normalized === "onsite" || normalized === "card" || normalized === "ndp" || normalized === "bank_transfer") return normalized;
    return "other";
  }

  private isOnline(status: string | null): boolean | null {
    if (!status || status === "unsynced") return null;
    return ["available", "idle", "working", "online"].includes(status);
  }
}
