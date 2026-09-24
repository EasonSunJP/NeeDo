import {
  Prisma,
  TechnicianAutomationKind as DatabaseTechnicianAutomationKind,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";
import { toAuditLogCreateData } from "./audit-log.repository";
import type {
  TechnicianAutomationContactPage,
  TechnicianAutomationRepositoryPort,
  TechnicianAutomationSettingRecord,
  TechnicianAutomationSettingSaveInput,
  TechnicianAutomationSettingSaveResult
} from "../services/technician-automation.service";
import type { TechnicianAutomationKindValue } from "../validators/technician-automation.validator";
import { technicianAutomationRulesSchema } from "../validators/technician-automation.validator";
import { evaluateTechnicianAutomationRules, hasRequestBookingAutomationLead } from "../domain/technician-automation-rules";
import { ExchangeClaimRepository, exchangeClaimOptionBusinessKey } from "./exchange-claim.repository";
import type { ExchangeClaimOptionPayload, ExchangeClaimServiceRef } from "../types/exchange-claim.types";
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

interface RequestCandidateSlot {
  id: number;
  shopId: number;
  technicianProfileId: number;
  startsAt: Date;
  endsAt: Date;
  serviceId: number | null;
  technicianServiceId: number | null;
  serviceRef?: ExchangeClaimServiceRef;
  technicianProfile: {
    userId: number;
    workStates: Array<{ shopId: number | null; status: string }>;
    automationSettings: Array<{ id: number; version: number; rules: Prisma.JsonValue }>;
  };
}

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
    const now = new Date();
    const order = await this.client.bookingOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        id: true,
        status: true,
        shopId: true,
        customerUserId: true,
        technicianProfileId: true,
        serviceId: true,
        technicianServiceId: true,
        startsAt: true,
        endsAt: true,
        priceAmount: true,
        fulfillmentMode: true,
        paymentMethod: true,
        servicePrepayment: {
          select: { baseAmountJpy: true, confirmedAmountJpy: true, status: true, deletedAt: true }
        },
        serviceLocation: { select: { admin1RegionCode: true, admin2RegionCode: true } },
        scheduleSlot: {
          select: {
            availabilityId: true,
            startsAt: true,
            endsAt: true,
            deletedAt: true,
            availability: { select: { startsAt: true, endsAt: true, isActive: true, deletedAt: true } }
          }
        },
        technicianProfile: {
          select: {
            id: true,
            userId: true,
            status: true,
            verifiedAt: true,
            deletedAt: true,
            workStates: { where: { deletedAt: null } },
            user: { select: { isActive: true, deletedAt: true } },
            automationSettings: {
              where: { kind: DatabaseTechnicianAutomationKind.BOOKING, enabled: true, deletedAt: null },
              take: 1
            },
            technicianShopAffiliations: {
              where: {
                workStatus: "ACTIVE",
                startsAt: { lte: now },
                endsAt: null,
                deletedAt: null,
                shop: { is: { deletedAt: null } }
              },
              select: { shopId: true }
            }
          }
        }
      }
    });
    const profile = order?.technicianProfile;
    const setting = profile?.automationSettings[0];
    if (
      !order ||
      !profile ||
      !setting ||
      order.status !== "PENDING" ||
      !profile.technicianShopAffiliations.some((affiliation) => affiliation.shopId === order.shopId)
    ) return null;
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
    const [customer, availabilityCount] = await Promise.all([
      this.loadCustomerEvidence(
        order.customerUserId,
        profile.id,
        identity.id,
        order.startsAt,
        order.endsAt,
        rules.bufferMinutes,
        order.id
      ),
      this.client.availability.count({
        where: {
          technicianProfileId: profile.id,
          isActive: true,
          deletedAt: null,
          startsAt: { lte: order.startsAt },
          endsAt: { gte: order.endsAt },
          OR: [
            { isScheduleControlWindow: true },
            ...(order.scheduleSlot.availabilityId ? [{ id: order.scheduleSlot.availabilityId }] : [])
          ]
        }
      })
    ]);
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
        actualScheduleAvailable: !order.scheduleSlot.deletedAt && availabilityCount > 0,
        hasBufferedConflict: customer.hasBufferedConflict,
        hardBlockReasons: [
          ...(profile.user.isActive && !profile.user.deletedAt ? [] : ["account_disabled"]),
          ...(profile.status === "published" && !profile.deletedAt ? [] : ["technician_unavailable"]),
          ...(profile.verifiedAt ? [] : ["technician_qualification_required"]),
          ...(this.isOnlineAtShop(profile.workStates, order.shopId)
            ? []
            : ["technician_not_on_duty"])
        ],
        areaCode: order.serviceLocation
          ? `${order.serviceLocation.admin1RegionCode ?? ""}/${order.serviceLocation.admin2RegionCode ?? ""}`
          : null,
        distanceKm: null,
        grossAmountJpy: Math.round(Number(order.priceAmount.toString())),
        netAmountJpy: null,
        prepaidServiceAmountJpy:
          order.servicePrepayment && !order.servicePrepayment.deletedAt
          && (order.servicePrepayment.status === "CONFIRMED" || order.servicePrepayment.status === "CAPTURED")
            ? order.servicePrepayment.confirmedAmountJpy
            : 0,
        prepaymentBaseAmountJpy: Math.round(Number(order.priceAmount.toString())),
        prepaymentConfirmed: Boolean(
          order.servicePrepayment && !order.servicePrepayment.deletedAt
          && order.servicePrepayment.baseAmountJpy === Math.round(Number(order.priceAmount.toString()))
          && (order.servicePrepayment.status === "CONFIRMED" || order.servicePrepayment.status === "CAPTURED")
        ),
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
        technicianOnline: this.isOnlineAtShop(profile.workStates, order.shopId),
        tagsMatch: true
      }
    };
  }

  public async loadRequestCandidates(
    postId: number,
    selection?: { technicianProfileId: number; scheduleSlotId: number; serviceRef?: ExchangeClaimServiceRef }
  ): Promise<TechnicianRequestAutomationCandidate[]> {
    const now = new Date();
    const post = await this.client.exchangePost.findFirst({
      where: { id: postId, type: "DEMAND", status: "PUBLISHED", expiresAt: { gt: now }, deletedAt: null },
      include: { demand: true, servicePrepayment: true }
    });
    if (!post?.demand || post.serviceEndAt <= now) return [];
    const requestCategoryId = post.demand.categoryId ?? null;
    const requestKeywordIds = Array.isArray(post.demand.businessKeywordIdsJson)
      ? post.demand.businessKeywordIdsJson.filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0)
      : [];
    if (requestCategoryId !== null && requestKeywordIds.length === 0) return [];
    const taxonomyShop = requestCategoryId === null ? {} : {
      businessKeywordSelections: {
        some: { businessKeywordId: { in: requestKeywordIds }, activeKey: { not: null }, deletedAt: null,
          businessKeyword: { is: { categoryId: requestCategoryId, isActive: true, deletedAt: null } } }
      }
    };
    const prepaymentBaseAmountJpy = post.demand.budgetMode === "PER_PROVIDER"
      ? post.demand.budgetMaxJpy * post.demand.targetProviderCount
      : post.demand.budgetMaxJpy;
    const confirmedPrepayment = Boolean(
      post.servicePrepayment && !post.servicePrepayment.deletedAt
      && post.servicePrepayment.baseAmountJpy === prepaymentBaseAmountJpy
      && (post.servicePrepayment.status === "CONFIRMED" || post.servicePrepayment.status === "CAPTURED")
    );
    const slotQuery = {
      where: {
        ...(selection ? { id: selection.scheduleSlotId } : {}),
        technicianProfileId: selection?.technicianProfileId ?? { not: null },
        startsAt: { gte: post.serviceStartAt, gt: now },
        endsAt: { lte: post.serviceEndAt },
        status: "AVAILABLE",
        deletedAt: null,
        OR: [
          { serviceId: { not: null }, technicianServiceId: null, shop: { is: { pricingMode: "MERCHANT" } }, service: { is: { status: "published", deletedAt: null, ...(requestCategoryId === null ? {} : { categoryId: requestCategoryId, category: { is: { isActive: true, deletedAt: null } } }) } } },
          { serviceId: null, technicianServiceId: { not: null }, shop: { is: { pricingMode: "TECHNICIAN" } }, technicianService: { is: { isActive: true, isBookable: true, reviewStatus: "APPROVED", deletedAt: null, ...(requestCategoryId === null ? {} : { categoryId: requestCategoryId, category: { is: { isActive: true, deletedAt: null } } }) } } }
        ],
        shop: { is: { status: "published", deletedAt: null, ...taxonomyShop, entitySuspensions: { none: { status: "ACTIVE", activeKey: { not: null }, deletedAt: null } } } },
        technicianProfile: {
          is: {
            status: "published",
            ...(post.demand.preferredTechnicianGender === "male" || post.demand.preferredTechnicianGender === "female"
              ? { gender: post.demand.preferredTechnicianGender } : {}),
            verifiedAt: { not: null },
            deletedAt: null,
            user: { is: { isActive: true, deletedAt: null } },
            technicianShopAffiliations: {
              some: {
                workStatus: "ACTIVE",
                activeKey: { not: null },
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
                deletedAt: null,
                shop: { is: { deletedAt: null } }
              }
            },
            automationSettings: { some: { kind: DatabaseTechnicianAutomationKind.REQUEST, enabled: true, deletedAt: null } }
          }
        }
      },
      include: {
        availability: true,
        service: { select: { id: true, shopId: true } },
        technicianService: { select: { id: true, shopId: true, technicianId: true } },
        technicianProfile: {
          include: {
            user: { select: { id: true } },
            workStates: { where: { deletedAt: null } },
            technicianShopAffiliations: {
              where: {
                workStatus: "ACTIVE",
                activeKey: { not: null },
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
                deletedAt: null,
                shop: { is: { deletedAt: null } }
              },
              select: { shopId: true }
            },
            automationSettings: { where: { kind: DatabaseTechnicianAutomationKind.REQUEST, enabled: true, deletedAt: null }, take: 1 }
          }
        }
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 200
    } satisfies Prisma.ScheduleSlotFindManyArgs;
    const slots = await this.client.scheduleSlot.findMany(slotQuery);
    let page = slots;
    while (page.length === slotQuery.take) {
      page = await this.client.scheduleSlot.findMany({
        ...slotQuery,
        cursor: { id: page[page.length - 1].id },
        skip: 1
      });
      slots.push(...page);
    }
    const candidateAvailability = slots.length === 0 ? [] : await this.client.availability.findMany({
      where: {
        technicianProfileId: { in: slots.flatMap((slot) => slot.technicianProfileId ? [slot.technicianProfileId] : []) },
        isActive: true,
        deletedAt: null,
        OR: [
          { isScheduleControlWindow: true },
          { id: { in: slots.flatMap((slot) => slot.availabilityId ? [slot.availabilityId] : []) } }
        ]
      },
      select: { id: true, technicianProfileId: true, startsAt: true, endsAt: true }
    });
    const eligibleSlots: RequestCandidateSlot[] = [];
    for (const slot of slots) {
      const hasActiveShopAffiliation = slot.technicianProfile?.technicianShopAffiliations.some(
        (affiliation) => affiliation.shopId === slot.shopId
      );
      const hasAvailability = candidateAvailability.some((window) =>
        window.technicianProfileId === slot.technicianProfileId &&
        window.startsAt <= slot.startsAt &&
        window.endsAt >= slot.endsAt
      );
      const serviceBelongsToSlot = slot.service
        ? slot.service.shopId === slot.shopId
        : slot.technicianService?.shopId === slot.shopId && slot.technicianService?.technicianId === slot.technicianProfileId;
      if (slot.technicianProfileId && hasActiveShopAffiliation && hasAvailability && serviceBelongsToSlot && slot.bookedCount < slot.capacity) {
        eligibleSlots.push({
          id: slot.id,
          shopId: slot.shopId,
          technicianProfileId: slot.technicianProfileId,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          serviceId: slot.service?.id ?? null,
          technicianServiceId: slot.technicianService?.id ?? null,
          technicianProfile: {
            userId: slot.technicianProfile!.userId,
            workStates: slot.technicianProfile!.workStates,
            automationSettings: slot.technicianProfile!.automationSettings
          }
        });
      }
    }
    if (!selection || selection.scheduleSlotId < 0) {
      eligibleSlots.push(...await this.loadDynamicRequestSlots(
        postId, post.authorUserId, post.serviceStartAt, post.serviceEndAt, now, eligibleSlots,
        post.demand.preferredTechnicianGender, selection
      ));
    }
    const bookingSettings = eligibleSlots.length === 0 ? [] : await this.client.technicianAutomationSetting.findMany({
      where: {
        technicianProfileId: { in: [...new Set(eligibleSlots.map((slot) => slot.technicianProfileId))] },
        kind: DatabaseTechnicianAutomationKind.BOOKING,
        enabled: true,
        deletedAt: null
      },
      select: { technicianProfileId: true, rules: true }
    });
    const bookingLeadByTechnician = new Map(bookingSettings.map((setting) => [
      setting.technicianProfileId,
      technicianAutomationRulesSchema.parse(setting.rules).minLeadMinutes
    ]));
    const candidateSlots = eligibleSlots.filter((slot) => {
      const requiredMinutes = bookingLeadByTechnician.get(slot.technicianProfileId);
      return requiredMinutes === undefined || hasRequestBookingAutomationLead(slot.startsAt, now, requiredMinutes);
    });
    candidateSlots.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime() || left.id - right.id);
    const shopServiceIds = [...new Set(candidateSlots.flatMap((slot) => slot.serviceId ? [slot.serviceId] : []))];
    const technicianServiceIds = [...new Set(candidateSlots.flatMap((slot) => slot.technicianServiceId ? [slot.technicianServiceId] : []))];
    const [shopServicePrices, technicianServicePrices] = await Promise.all([
      shopServiceIds.length ? this.client.service.findMany({
        where: { id: { in: shopServiceIds }, status: "published", currency: "JPY", deletedAt: null },
        select: { id: true, priceAmount: true }
      }) : [],
      technicianServiceIds.length ? this.client.technicianService.findMany({
        where: { id: { in: technicianServiceIds }, isActive: true, isBookable: true, reviewStatus: "APPROVED", currency: "JPY", deletedAt: null },
        select: { id: true, priceAmount: true }
      }) : []
    ]);
    const priceByRef = new Map<string, number>([
      ...shopServicePrices.map((service) => [`shop:${service.id}`, Number(service.priceAmount)] as const),
      ...technicianServicePrices.map((service) => [`technician:${service.id}`, service.priceAmount] as const)
    ]);
    const technicianIds = [...new Set(candidateSlots.map((slot) => slot.technicianProfileId))];
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
    const resultByTechnician = new Map<number, TechnicianRequestAutomationCandidate>();
    const matchedTechnicians = new Set<number>();
    const completedByTechnician = new Map<number, Promise<number>>();
    const conflictsByWindow = new Map<string, Promise<boolean>>();
    const claimRepository = new ExchangeClaimRepository(this.client);
    for (const slot of candidateSlots) {
      const technicianProfileId = slot.technicianProfileId;
      if (matchedTechnicians.has(technicianProfileId)) continue;
      const identity = identityByTechnician.get(technicianProfileId);
      const setting = slot.technicianProfile.automationSettings[0];
      if (!identity?.publicIdentifier || !setting) continue;
      const serviceRef = slot.serviceId ? `shop:${slot.serviceId}` : `technician:${slot.technicianServiceId}`;
      const quoteAmountJpy = priceByRef.get(serviceRef);
      if (!Number.isSafeInteger(quoteAmountJpy) || !quoteAmountJpy || quoteAmountJpy <= 0 ||
        quoteAmountJpy > post.demand.budgetMaxJpy ||
        (post.demand.budgetMinJpy !== null && quoteAmountJpy < post.demand.budgetMinJpy)) continue;
      const rules = technicianAutomationRulesSchema.parse(setting.rules);
      const bufferStart = new Date(slot.startsAt.getTime() - rules.bufferMinutes * 60_000);
      const bufferEnd = new Date(slot.endsAt.getTime() + rules.bufferMinutes * 60_000);
      if (!completedByTechnician.has(technicianProfileId)) {
        completedByTechnician.set(technicianProfileId, this.client.bookingOrder.count({
          where: { technicianProfileId, customerUserId: post.authorUserId, status: "COMPLETED", deletedAt: null }
        }));
      }
      const windowKey = `${technicianProfileId}:${bufferStart.getTime()}:${bufferEnd.getTime()}`;
      if (!conflictsByWindow.has(windowKey)) {
        conflictsByWindow.set(windowKey, Promise.all([
          claimRepository.hasConflictingBooking(technicianProfileId, bufferStart, bufferEnd),
          claimRepository.hasOverlappingActiveClaim(technicianProfileId, bufferStart, bufferEnd),
          claimRepository.hasOverlappingMatchParticipant(technicianProfileId, bufferStart, bufferEnd)
        ]).then((conflicts) => conflicts.some(Boolean)));
      }
      const [hasBufferedConflict, completedWithTechnician] = await Promise.all([
        conflictsByWindow.get(windowKey)!,
        completedByTechnician.get(technicianProfileId)!
      ]);
      const contactIdentityId = contactByOwner.get(identity.id) ?? null;
      const serviceId = slot.technicianServiceId ?? slot.serviceId ?? 0;
      const candidate: TechnicianRequestAutomationCandidate = {
        settingId: setting.id,
        technicianProfileId,
        technicianUserId: slot.technicianProfile.userId,
        technicianIdentityId: identity.id,
        technicianPublicId: identity.publicIdentifier.publicId,
        ruleVersion: setting.version,
        rules,
        scheduleSlotId: slot.id,
        ...(slot.serviceRef ? { serviceRef: slot.serviceRef } : {}),
        quoteAmountJpy,
        message: "NeeDo 自动应募",
        context: {
          now,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          actualScheduleAvailable: true,
          hasBufferedConflict,
          hardBlockReasons: [],
          areaCode: post.areaLabel,
          distanceKm: null,
          grossAmountJpy: quoteAmountJpy,
          netAmountJpy: null,
          prepaidServiceAmountJpy: confirmedPrepayment ? post.servicePrepayment!.confirmedAmountJpy : 0,
          prepaymentBaseAmountJpy,
          prepaymentConfirmed: confirmedPrepayment,
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
          technicianOnline: this.isOnlineAtShop(
            slot.technicianProfile.workStates,
            slot.shopId
          ),
          tagsMatch: requestCategoryId === null ? null : true
        }
      };
      // Select only after evaluation; an earlier unrelated service must not consume
      // the one decision key for this Request and technician.
      const matched = evaluateTechnicianAutomationRules("request", rules, candidate.context).matched;
      if (matched || !resultByTechnician.has(technicianProfileId)) resultByTechnician.set(technicianProfileId, candidate);
      if (matched) matchedTechnicians.add(technicianProfileId);
    }
    return [...resultByTechnician.values()];
  }

  private async loadDynamicRequestSlots(
    postId: number,
    authorUserId: number,
    serviceStartAt: Date,
    serviceEndAt: Date,
    now: Date,
    persistedSlots: RequestCandidateSlot[],
    preferredTechnicianGender?: string,
    selection?: { technicianProfileId: number; scheduleSlotId: number; serviceRef?: ExchangeClaimServiceRef }
  ): Promise<RequestCandidateSlot[]> {
    if (serviceEndAt <= now) return [];
    const persistedKeys = new Set(persistedSlots.map((slot) => exchangeClaimOptionBusinessKey(
      slot.shopId, slot.technicianProfileId,
      slot.serviceId ? `shop:${slot.serviceId}` : `technician:${slot.technicianServiceId!}`,
      slot.startsAt.toISOString(), slot.endsAt.toISOString()
    )));
    const windows = await this.client.availability.findMany({
      where: {
        isScheduleControlWindow: true,
        isActive: true,
        deletedAt: null,
        technicianProfileId: selection?.technicianProfileId ?? { not: null },
        startsAt: { lt: serviceEndAt },
        endsAt: { gt: new Date(Math.max(now.getTime(), serviceStartAt.getTime())) }
      },
      select: { technicianProfileId: true, shopId: true },
      distinct: ["technicianProfileId", "shopId"]
    });
    const technicianIds = [...new Set(windows.flatMap((window) =>
      window.technicianProfileId ? [window.technicianProfileId] : []))];
    if (technicianIds.length === 0) return [];
    const profiles = await this.client.technicianProfile.findMany({
      where: {
        id: selection?.technicianProfileId ?? { in: technicianIds },
        ...(preferredTechnicianGender === "male" || preferredTechnicianGender === "female"
          ? { gender: preferredTechnicianGender } : {}),
        status: "published",
        verifiedAt: { not: null },
        deletedAt: null,
        user: { is: { isActive: true, deletedAt: null } },
        automationSettings: { some: { kind: DatabaseTechnicianAutomationKind.REQUEST, enabled: true, deletedAt: null } },
        technicianShopAffiliations: {
          some: {
            workStatus: "ACTIVE", activeKey: { not: null },
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            deletedAt: null,
            shop: { is: { deletedAt: null } }
          }
        }
      },
      select: {
        id: true, userId: true,
        workStates: { where: { deletedAt: null }, select: { shopId: true, status: true } },
        technicianShopAffiliations: {
          where: {
            workStatus: "ACTIVE", activeKey: { not: null },
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            deletedAt: null,
            shop: { is: { deletedAt: null } }
          },
          select: { shopId: true }
        },
        automationSettings: {
          where: { kind: DatabaseTechnicianAutomationKind.REQUEST, enabled: true, deletedAt: null },
          select: { id: true, version: true, rules: true },
          take: 1
        }
      }
    });
    const eligibleProfiles = new Map(profiles
      .filter((profile) => profile.userId !== authorUserId && profile.automationSettings.length > 0)
      .map((profile) => [profile.id, profile]));
    const eligibleShopIds = [...new Set(windows.flatMap((window) => {
      const profile = window.technicianProfileId
        ? eligibleProfiles.get(window.technicianProfileId) : undefined;
      return profile?.technicianShopAffiliations.some((affiliation) => affiliation.shopId === window.shopId)
        ? [window.shopId] : [];
    }))];
    const claimRepository = new ExchangeClaimRepository(this.client);
    const candidatesByWindow = new Map<string, RequestCandidateSlot>();
    const fallbackByTechnician = new Map<number, RequestCandidateSlot>();
    const candidateOrder = (left: RequestCandidateSlot, right: RequestCandidateSlot) =>
      left.startsAt.getTime() - right.startsAt.getTime() || left.id - right.id ||
      (left.serviceRef ?? "").localeCompare(right.serviceRef ?? "");
    for (const shopId of eligibleShopIds) {
      const shopProfiles = [...eligibleProfiles.values()]
        .filter((profile) => profile.technicianShopAffiliations.some((affiliation) => affiliation.shopId === shopId));
      const shopTechnicianIds = shopProfiles.map((profile) => profile.id);
      const rulesByTechnician = new Map(shopProfiles.map((profile) => [profile.id,
        technicianAutomationRulesSchema.parse(profile.automationSettings[0].rules)]));
      const startWindows = [...rulesByTechnician.values()].map((rules) => rules.requestStartWindow);
      const maximumStartMinutes = Math.max(...startWindows.map((window) => ({
        immediate: 16, within_1_hour: 61, within_3_hours: 181,
        today: 24 * 60, any: Number.POSITIVE_INFINITY
      })[window]));
      const latestStartAt = Number.isFinite(maximumStartMinutes)
        ? new Date(now.getTime() + maximumStartMinutes * 60_000)
        : undefined;
      const input = {
        postId,
        shopId,
        scope: selection
          ? { kind: "technician" as const, technicianProfileId: selection.technicianProfileId }
          : { kind: "merchant" as const, shopId },
        page: 1,
        pageSize: 200,
        now,
        ...(latestStartAt ? { latestStartAt } : {}),
        ...(selection?.serviceRef ? { serviceRef: selection.serviceRef } : {})
      };
      const acceptOption = (option: ExchangeClaimOptionPayload) => {
        if (selection && (option.scheduleSlotId !== selection.scheduleSlotId
          || option.service.ref !== selection.serviceRef)) return;
        const profile = eligibleProfiles.get(option.technician.profileId);
        if (!profile ||
          !profile.technicianShopAffiliations.some((affiliation) => affiliation.shopId === option.shop.id)) {
          return;
        }
        const startsAt = new Date(option.startsAt);
        const endsAt = new Date(option.endsAt);
        if (startsAt <= now || startsAt < serviceStartAt || endsAt > serviceEndAt) return;
        if (persistedKeys.has(exchangeClaimOptionBusinessKey(
          option.shop.id, option.technician.profileId, option.service.ref,
          option.startsAt, option.endsAt
        ))) return;
        const [kind, rawId] = option.service.ref.split(":") as ["shop" | "technician", string];
        const serviceId = Number(rawId);
        const candidate: RequestCandidateSlot = {
          id: option.scheduleSlotId,
          shopId: option.shop.id,
          technicianProfileId: profile.id,
          startsAt,
          endsAt,
          serviceId: kind === "shop" ? serviceId : null,
          technicianServiceId: kind === "technician" ? serviceId : null,
          serviceRef: option.service.ref,
          technicianProfile: {
            userId: profile.userId,
            workStates: profile.workStates,
            automationSettings: profile.automationSettings
          }
        };
        const rules = rulesByTechnician.get(profile.id);
        if (!rules) return;
        const fallback = fallbackByTechnician.get(profile.id);
        if (!fallback || candidateOrder(candidate, fallback) < 0) {
          fallbackByTechnician.set(profile.id, candidate);
        }
        const key = `${profile.id}:${shopId}:${startsAt.getTime()}:${endsAt.getTime()}`;
        const previous = candidatesByWindow.get(key);
        const matchesService = rules.serviceIds.length === 0 || rules.serviceIds.includes(serviceId);
        const previousMatchesService = previous && (rules.serviceIds.length === 0 ||
          rules.serviceIds.includes(previous.technicianServiceId ?? previous.serviceId ?? 0));
        if (!previous || (matchesService && !previousMatchesService) ||
          (matchesService === previousMatchesService && candidateOrder(candidate, previous) < 0)) {
          candidatesByWindow.set(key, candidate);
          if (candidatesByWindow.size > 10_000) {
            throw new Error("dynamic Request automation exceeds distinct candidate window limit");
          }
        }
      };
      await claimRepository.listDynamicOptions(input, 0, shopTechnicianIds, acceptOption);
    }
    const result = [...candidatesByWindow.values()];
    for (const fallback of fallbackByTechnician.values()) {
      if (!result.some((candidate) => candidate === fallback)) result.push(fallback);
    }
    return result;
  }

  public async reserveDecision(input: Parameters<TechnicianAutomationProcessorRepositoryPort["reserveDecision"]>[0]): Promise<boolean> {
    const existing = await this.client.technicianAutomationDecisionLog.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, outcome: true }
    });
    if (existing) {
      if (existing.outcome !== "ACTION_FAILED" && existing.outcome !== "NOT_MATCHED") return false;
      const retry = await this.client.technicianAutomationDecisionLog.updateMany({
        where: { id: existing.id, outcome: existing.outcome },
        data: { outcome: "MATCHED", ruleVersion: input.ruleVersion, matchedConditions: [], failedReasons: [], executedAt: null }
      });
      return retry.count === 1;
    }
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

  private isOnlineAtShop(
    states: Array<{ shopId: number | null; status: string }>,
    shopId: number
  ): boolean | null {
    const status = states.find((state) => state.shopId === shopId)?.status;
    if (!status || status === "unsynced") return null;
    return status === "on_duty";
  }
}
