import {
  AvailabilitySourceType,
  AvailabilityVisibility,
  TechnicianAutomationKind,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { z } from "zod";
import { defaultTechnicianAutomationRules } from "../validators/technician-automation.validator";

const configSchema = z.object({
  NODE_ENV: z.literal("production"),
  DEPLOY_ENV: z.literal("staging"),
  ALLOW_STAGING_TEST_OPERATIONS_PROVISIONING: z.literal("true"),
  STAGING_TEST_SCHEDULE_START_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export interface StagingTestOperationsConfig {
  startDate: string;
  endDate: string;
}

export interface StagingTestOperationsResult {
  shopId: number;
  technicianCount: number;
  startDate: string;
  endDate: string;
  availabilityCount: number;
  deduplicatedAvailabilityCount: number;
  createdTechnicianServiceCount: number;
  scheduleSlotCount: number;
  createdScheduleSlotCount: number;
  automationSettingCount: number;
}

interface StagingAvailabilityRow {
  id: number;
  technicianProfileId: number | null;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
}

const availabilityKey = (item: {
  technicianProfileId?: number | null;
  startsAt: Date | string;
  endsAt: Date | string;
}): string =>
  `${item.technicianProfileId}:${new Date(item.startsAt).toISOString()}:${new Date(item.endsAt).toISOString()}`;

export const planAvailabilityReconciliation = (rows: StagingAvailabilityRow[]): {
  existingKeys: Set<string>;
  inactiveIds: number[];
  duplicateIds: number[];
} => {
  const existingKeys = new Set<string>();
  const inactiveIds: number[] = [];
  const duplicateIds: number[] = [];
  const orderedRows = [...rows].sort(
    (left, right) => Number(right.isActive) - Number(left.isActive) || left.id - right.id
  );

  for (const row of orderedRows) {
    const key = availabilityKey(row);
    if (existingKeys.has(key)) {
      duplicateIds.push(row.id);
      continue;
    }
    existingKeys.add(key);
    if (!row.isActive) inactiveIds.push(row.id);
  }

  return {
    existingKeys,
    inactiveIds: inactiveIds.sort((left, right) => left - right),
    duplicateIds: duplicateIds.sort((left, right) => left - right)
  };
};

const addCalendarYear = (date: string): string => {
  const [year, month, day] = date.split("-").map(Number);
  const candidate = new Date(Date.UTC(year + 1, month - 1, day));
  if (candidate.getUTCMonth() !== month - 1) {
    candidate.setUTCDate(0);
  }
  return candidate.toISOString().slice(0, 10);
};

export const parseStagingTestOperationsConfig = (
  environment: NodeJS.ProcessEnv
): StagingTestOperationsConfig => {
  const parsed = configSchema.parse(environment);
  const start = new Date(`${parsed.STAGING_TEST_SCHEDULE_START_DATE}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) === "Invalid") {
    throw new Error("STAGING_TEST_SCHEDULE_START_DATE_INVALID");
  }
  return {
    startDate: parsed.STAGING_TEST_SCHEDULE_START_DATE,
    endDate: addCalendarYear(parsed.STAGING_TEST_SCHEDULE_START_DATE)
  };
};

const atTokyoMidnight = (date: string): Date => new Date(`${date}T00:00:00+09:00`);

const toDateString = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);

const permissiveRules = (kind: "booking" | "request") => ({
  ...defaultTechnicianAutomationRules(kind),
  minLeadMinutes: 0,
  bufferMinutes: 0 as const,
  maxDistanceKm: null,
  partyTypes: ["single", "multiple"] as const,
  minimumPrepaymentPercent: 0,
  onlyOnline: false,
  requestStartWindow: "any" as const,
  requireMatchingTags: false
});

export class StagingTestOperationsProvisioner {
  public constructor(private readonly client: PrismaClient) {}

  public async provision(config: StagingTestOperationsConfig): Promise<StagingTestOperationsResult> {
    const periodStart = atTokyoMidnight(config.startDate);
    const inclusiveEnd = atTokyoMidnight(config.endDate);
    const periodEnd = new Date(inclusiveEnd.getTime() + 24 * 60 * 60 * 1000);

    return this.client.$transaction(async (transaction) => {
      const shops = await transaction.shop.findMany({
        where: { name: "StagingTest", deletedAt: null },
        select: { id: true, ownerUserId: true }
      });
      if (shops.length !== 1 || !shops[0].ownerUserId) {
        throw new Error("STAGING_TEST_SHOP_NOT_UNIQUE_OR_OWNER_MISSING");
      }
      const shop = shops[0];
      const affiliations = await transaction.technicianShopAffiliation.findMany({
        where: {
          shopId: shop.id,
          workStatus: "ACTIVE",
          startsAt: { lte: periodStart },
          OR: [{ endsAt: null }, { endsAt: { gte: periodEnd } }],
          deletedAt: null,
          technicianProfile: {
            is: {
              status: "published",
              verifiedAt: { not: null },
              deletedAt: null,
              user: { is: { isActive: true, deletedAt: null } }
            }
          }
        },
        select: { technicianProfileId: true },
        orderBy: { technicianProfileId: "asc" }
      });
      const technicianProfileIds = [...new Set(affiliations.map((item) => item.technicianProfileId))];
      if (technicianProfileIds.length < 10) {
        throw new Error(`STAGING_TEST_TECHNICIAN_COUNT_TOO_LOW:${technicianProfileIds.length}`);
      }

      const conflicting = await transaction.availability.count({
        where: {
          shopId: shop.id,
          technicianProfileId: { in: technicianProfileIds },
          isScheduleControlWindow: true,
          isActive: true,
          deletedAt: null,
          startsAt: { lt: periodEnd },
          endsAt: { gt: periodStart },
          OR: [
            { sourceType: { not: AvailabilitySourceType.TECHNICIAN } },
            { visibility: { not: AvailabilityVisibility.AFFILIATED_SHOPS } }
          ]
        }
      });
      if (conflicting > 0) {
        throw new Error(`STAGING_TEST_SCHEDULE_MODE_CONFLICT:${conflicting}`);
      }

      const desiredAvailabilities: Prisma.AvailabilityCreateManyInput[] = [];
      for (const technicianProfileId of technicianProfileIds) {
        for (let cursor = new Date(periodStart); cursor <= inclusiveEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
          const startsAt = new Date(cursor);
          const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
          desiredAvailabilities.push({
            shopId: shop.id,
            technicianProfileId,
            sourceType: AvailabilitySourceType.TECHNICIAN,
            visibility: AvailabilityVisibility.AFFILIATED_SHOPS,
            startsAt,
            endsAt,
            capacity: 1,
            isActive: true,
            isScheduleControlWindow: true
          });
        }
      }

      const existingAvailabilities = await transaction.availability.findMany({
        where: {
          shopId: shop.id,
          technicianProfileId: { in: technicianProfileIds },
          sourceType: AvailabilitySourceType.TECHNICIAN,
          visibility: AvailabilityVisibility.AFFILIATED_SHOPS,
          startsAt: { gte: periodStart, lte: inclusiveEnd },
          endsAt: { gt: periodStart, lte: periodEnd },
          isScheduleControlWindow: true,
          deletedAt: null
        },
        select: { id: true, technicianProfileId: true, startsAt: true, endsAt: true, isActive: true }
      });
      const { existingKeys, inactiveIds, duplicateIds } =
        planAvailabilityReconciliation(existingAvailabilities);
      if (duplicateIds.length > 0) {
        await transaction.availability.updateMany({
          where: { id: { in: duplicateIds } },
          data: { isActive: false, deletedAt: new Date() }
        });
      }
      if (inactiveIds.length > 0) {
        await transaction.availability.updateMany({
          where: { id: { in: inactiveIds } },
          data: { isActive: true }
        });
      }
      const missingAvailabilities = desiredAvailabilities.filter((item) => !existingKeys.has(availabilityKey(item)));
      if (missingAvailabilities.length > 0) {
        await transaction.availability.createMany({ data: missingAvailabilities });
      }
      const availabilityCount = desiredAvailabilities.length;

      const sourceService = await transaction.service.findFirst({
        where: {
          shopId: shop.id,
          status: "published",
          deletedAt: null,
          category: { is: { isActive: true, deletedAt: null } }
        },
        orderBy: [{ isRecommended: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          categoryId: true,
          priceAmount: true,
          currency: true,
          durationMinutes: true
        }
      });
      if (!sourceService) {
        throw new Error("STAGING_TEST_PUBLISHED_SERVICE_MISSING");
      }

      const technicianServiceWhere: Prisma.TechnicianServiceWhereInput = {
        technicianId: { in: technicianProfileIds },
        isActive: true,
        isBookable: true,
        reviewStatus: "APPROVED",
        deletedAt: null,
        category: { is: { isActive: true, deletedAt: null } },
        OR: [
          { shopId: shop.id },
          { sourceShopService: { is: { shopId: shop.id, status: "published", deletedAt: null } } }
        ]
      };
      const existingTechnicianServices = await transaction.technicianService.findMany({
        where: technicianServiceWhere,
        orderBy: [{ isRecommended: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
        select: { id: true, technicianId: true, durationMinutes: true }
      });
      const techniciansWithService = new Set(
        existingTechnicianServices.map((item) => item.technicianId)
      );
      const missingTechnicianServiceIds = technicianProfileIds.filter(
        (technicianProfileId) => !techniciansWithService.has(technicianProfileId)
      );
      if (missingTechnicianServiceIds.length > 0) {
        await transaction.technicianService.createMany({
          data: missingTechnicianServiceIds.map((technicianId) => ({
            shopId: shop.id,
            technicianId,
            sourceShopServiceId: sourceService.id,
            name: sourceService.name,
            description: sourceService.description,
            categoryId: sourceService.categoryId,
            priceAmount: Math.round(Number(sourceService.priceAmount)),
            currency: sourceService.currency,
            durationMinutes: sourceService.durationMinutes,
            isActive: true,
            isBookable: true,
            isRecommended: false,
            sortOrder: 0,
            reviewStatus: "APPROVED",
            createdBy: shop.ownerUserId,
            updatedBy: shop.ownerUserId
          }))
        });
      }
      const technicianServices = await transaction.technicianService.findMany({
        where: technicianServiceWhere,
        orderBy: [{ isRecommended: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
        select: { id: true, technicianId: true, durationMinutes: true }
      });
      const serviceByTechnician = new Map<
        number,
        { id: number; durationMinutes: number }
      >();
      for (const service of technicianServices) {
        if (!serviceByTechnician.has(service.technicianId)) {
          serviceByTechnician.set(service.technicianId, {
            id: service.id,
            durationMinutes: service.durationMinutes
          });
        }
      }
      if (serviceByTechnician.size !== technicianProfileIds.length) {
        throw new Error(
          `STAGING_TEST_TECHNICIAN_SERVICE_COUNT_MISMATCH:${serviceByTechnician.size}`
        );
      }

      const canonicalAvailabilities = await transaction.availability.findMany({
        where: {
          shopId: shop.id,
          technicianProfileId: { in: technicianProfileIds },
          sourceType: AvailabilitySourceType.TECHNICIAN,
          visibility: AvailabilityVisibility.AFFILIATED_SHOPS,
          startsAt: { gte: periodStart, lte: inclusiveEnd },
          endsAt: { gt: periodStart, lte: periodEnd },
          isActive: true,
          isScheduleControlWindow: true,
          deletedAt: null
        },
        select: { id: true, technicianProfileId: true, startsAt: true, endsAt: true }
      });
      const availabilityIdByKey = new Map(
        canonicalAvailabilities.map((item) => [availabilityKey(item), item.id])
      );
      const existingScheduleSlots = await transaction.scheduleSlot.findMany({
        where: {
          shopId: shop.id,
          technicianProfileId: { in: technicianProfileIds },
          status: { in: ["AVAILABLE", "BOOKED"] },
          startsAt: { gte: periodStart, lt: periodEnd },
          deletedAt: null
        },
        select: { technicianProfileId: true, startsAt: true }
      });
      const scheduledTechnicianDays = new Set(
        existingScheduleSlots.flatMap((slot) =>
          slot.technicianProfileId === null
            ? []
            : [`${slot.technicianProfileId}:${toDateString(slot.startsAt)}`]
        )
      );
      const missingScheduleSlots: Prisma.ScheduleSlotCreateManyInput[] = [];
      for (const availability of desiredAvailabilities) {
        const technicianProfileId = availability.technicianProfileId;
        if (technicianProfileId === null || technicianProfileId === undefined) continue;
        const startsAt = new Date(availability.startsAt);
        const dayKey = `${technicianProfileId}:${toDateString(startsAt)}`;
        if (scheduledTechnicianDays.has(dayKey)) continue;
        const technicianService = serviceByTechnician.get(technicianProfileId);
        const availabilityId = availabilityIdByKey.get(availabilityKey(availability));
        if (!technicianService || availabilityId === undefined) {
          throw new Error(`STAGING_TEST_SCHEDULE_SLOT_SOURCE_MISSING:${dayKey}`);
        }
        const slotStartsAt = new Date(startsAt.getTime() + 10 * 60 * 60 * 1000);
        missingScheduleSlots.push({
          availabilityId,
          serviceId: null,
          technicianServiceId: technicianService.id,
          shopId: shop.id,
          technicianProfileId,
          startsAt: slotStartsAt,
          endsAt: new Date(
            slotStartsAt.getTime() + technicianService.durationMinutes * 60 * 1000
          ),
          capacity: 1,
          bookedCount: 0,
          status: "AVAILABLE"
        });
        scheduledTechnicianDays.add(dayKey);
      }
      if (missingScheduleSlots.length > 0) {
        await transaction.scheduleSlot.createMany({ data: missingScheduleSlots });
      }
      const scheduleSlotCount = availabilityCount;

      let automationSettingCount = 0;
      for (const technicianProfileId of technicianProfileIds) {
        for (const [kind, rules] of [
          [TechnicianAutomationKind.BOOKING, permissiveRules("booking")],
          [TechnicianAutomationKind.REQUEST, permissiveRules("request")]
        ] as const) {
          await transaction.technicianAutomationSetting.upsert({
            where: { technicianProfileId_kind: { technicianProfileId, kind } },
            create: {
              technicianProfileId,
              kind,
              enabled: true,
              rules: rules as unknown as Prisma.InputJsonValue
            },
            update: {
              enabled: true,
              rules: rules as unknown as Prisma.InputJsonValue,
              version: { increment: 1 },
              deletedAt: null
            }
          });
          automationSettingCount += 1;
        }
      }

      await transaction.auditLog.create({
        data: {
          actorId: shop.ownerUserId,
          action: "staging.test.operations.provision",
          targetType: "Shop",
          targetId: shop.id,
          metadata: {
            scheduleMode: "technician_self",
            startDate: config.startDate,
            endDate: config.endDate,
            technicianProfileIds,
            availabilityCount,
            deduplicatedAvailabilityCount: duplicateIds.length,
            createdTechnicianServiceCount: missingTechnicianServiceIds.length,
            scheduleSlotCount,
            createdScheduleSlotCount: missingScheduleSlots.length,
            automationSettingCount
          }
        }
      });

      return {
        shopId: shop.id,
        technicianCount: technicianProfileIds.length,
        startDate: toDateString(periodStart),
        endDate: toDateString(inclusiveEnd),
        availabilityCount,
        deduplicatedAvailabilityCount: duplicateIds.length,
        createdTechnicianServiceCount: missingTechnicianServiceIds.length,
        scheduleSlotCount,
        createdScheduleSlotCount: missingScheduleSlots.length,
        automationSettingCount
      };
    }, { timeout: 120_000 });
  }
}
