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
  STAGING_TEST_SCHEDULE_START_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  STAGING_TEST_SCHEDULE_END_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
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
  retiredScheduleModeAvailabilityCount: number;
  createdTechnicianServiceCount: number;
  scheduleSlotCount: number;
  createdScheduleSlotCount: number;
  automationSettingCount: number;
  scheduleCycleId: number;
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

export const planAvailabilityReconciliation = (
  rows: StagingAvailabilityRow[],
  desiredRanges?: Array<{
    technicianProfileId: number;
    startsAt: Date | string;
    endsAt: Date | string;
  }>
): {
  existingKeys: Set<string>;
  inactiveIds: number[];
  duplicateIds: number[];
  obsoleteIds: number[];
} => {
  const existingKeys = new Set<string>();
  const inactiveIds: number[] = [];
  const duplicateIds: number[] = [];
  const obsoleteIds: number[] = [];
  const desiredKeys = desiredRanges
    ? new Set(desiredRanges.map((range) => availabilityKey(range)))
    : null;
  const orderedRows = [...rows].sort(
    (left, right) => Number(right.isActive) - Number(left.isActive) || left.id - right.id
  );

  for (const row of orderedRows) {
    const key = availabilityKey(row);
    if (desiredKeys && !desiredKeys.has(key)) {
      obsoleteIds.push(row.id);
      continue;
    }
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
    duplicateIds: duplicateIds.sort((left, right) => left - right),
    obsoleteIds: obsoleteIds.sort((left, right) => left - right)
  };
};

const addCalendarMonths = (date: string, months: number): string => {
  const [year, month, day] = date.split("-").map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const candidate = new Date(Date.UTC(targetYear, targetMonth, day));
  if (candidate.getUTCMonth() !== targetMonth) {
    candidate.setUTCDate(0);
  }
  return candidate.toISOString().slice(0, 10);
};

export const buildContinuousAvailabilityRanges = (input: {
  startsAt: Date;
  endsAt: Date;
  technicianProfileIds: number[];
}): Array<{ technicianProfileId: number; startsAt: Date; endsAt: Date }> =>
  input.technicianProfileIds.map((technicianProfileId) => ({
    technicianProfileId,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt)
  }));

const STAGING_TEST_TECHNICIAN_COUNT = 6;

export const selectStagingTestTechnicianProfileIds = (ids: number[]): number[] => {
  const selected = [...new Set(ids)].sort((left, right) => left - right);
  if (selected.length < STAGING_TEST_TECHNICIAN_COUNT) {
    throw new Error(`STAGING_TEST_TECHNICIAN_COUNT_TOO_LOW:${selected.length}`);
  }
  return selected.slice(0, STAGING_TEST_TECHNICIAN_COUNT);
};

export const parseStagingTestOperationsConfig = (
  environment: NodeJS.ProcessEnv
): StagingTestOperationsConfig => {
  const parsed = configSchema.parse(environment);
  const start = new Date(`${parsed.STAGING_TEST_SCHEDULE_START_DATE}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) === "Invalid") {
    throw new Error("STAGING_TEST_SCHEDULE_START_DATE_INVALID");
  }
  const endDate = parsed.STAGING_TEST_SCHEDULE_END_DATE
    ?? addCalendarMonths(parsed.STAGING_TEST_SCHEDULE_START_DATE, 3);
  if (endDate <= parsed.STAGING_TEST_SCHEDULE_START_DATE) {
    throw new Error("STAGING_TEST_SCHEDULE_PERIOD_INVALID");
  }
  return { startDate: parsed.STAGING_TEST_SCHEDULE_START_DATE, endDate };
};

const atTokyoMidnight = (date: string): Date => new Date(`${date}T00:00:00+09:00`);

const toDateString = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);

export const permissiveRules = (kind: "booking" | "request") => ({
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
    const periodEnd = atTokyoMidnight(config.endDate);

    return this.client.$transaction(async (transaction) => {
      const shops = await transaction.shop.findMany({
        where: { name: "StagingTest", deletedAt: null },
        select: { id: true, ownerUserId: true }
      });
      if (shops.length !== 1 || !shops[0].ownerUserId) {
        throw new Error("STAGING_TEST_SHOP_NOT_UNIQUE_OR_OWNER_MISSING");
      }
      const shop = shops[0];
      const ownerUserId = shop.ownerUserId!;
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
      const allTechnicianProfileIds = [
        ...new Set(affiliations.map((item) => item.technicianProfileId))
      ];
      const technicianProfileIds = selectStagingTestTechnicianProfileIds(
        allTechnicianProfileIds
      );

      const cyclePeriodStart = new Date(`${config.startDate}T00:00:00.000Z`);
      const cyclePeriodEnd = new Date(`${config.endDate}T00:00:00.000Z`);
      await transaction.scheduleCycle.updateMany({
        where: {
          shopId: shop.id,
          mode: "STORE_ASSIGN_FINAL",
          status: {
            in: [
              "DRAFT",
              "RULE_SETTING",
              "FINAL_CONFIRMING",
              "COLLECTING_FEEDBACK",
              "FEEDBACK_CLOSED",
              "CONFIRMED",
              "ACTIVE"
            ]
          },
          periodStart: { lte: cyclePeriodEnd },
          periodEnd: { gte: cyclePeriodStart },
          deletedAt: null
        },
        data: { status: "CANCELLED", cancelledAt: new Date(), updatedById: ownerUserId }
      });
      const existingSelfCycle = await transaction.scheduleCycle.findFirst({
        where: {
          shopId: shop.id,
          mode: "TECH_SELF_FINAL",
          periodStart: cyclePeriodStart,
          periodEnd: cyclePeriodEnd,
          deletedAt: null
        },
        select: { id: true }
      });
      const scheduleCycle = existingSelfCycle
        ? await transaction.scheduleCycle.update({
            where: { id: existingSelfCycle.id },
              data: {
                name: `StagingTest 技师自主排班 ${config.startDate}–${config.endDate}`,
                status: "ACTIVE",
                currentStep: 3,
                ruleSet: {
                  continuousCoverage: true,
                  timeZone: "Asia/Tokyo",
                  dynamicAvailability: true,
                  startIntervalMinutes: 5,
                  preBufferMinutes: 0,
                  postBufferMinutes: 30
                },
              finalizedAt: new Date(),
              activeAt: new Date(),
              cancelledAt: null,
              updatedById: ownerUserId
            },
            select: { id: true }
          })
        : await transaction.scheduleCycle.create({
            data: {
              shopId: shop.id,
              name: `StagingTest 技师自主排班 ${config.startDate}–${config.endDate}`,
              creationMethod: "new",
              mode: "TECH_SELF_FINAL",
              status: "ACTIVE",
              currentStep: 3,
              templateType: "MONTH",
              periodStart: cyclePeriodStart,
              periodEnd: cyclePeriodEnd,
              feedbackDeadline: null,
              templateMatrix: {},
              regularHolidayWeekdays: [],
              ruleSet: {
                continuousCoverage: true,
                timeZone: "Asia/Tokyo",
                dynamicAvailability: true,
                startIntervalMinutes: 5,
                preBufferMinutes: 0,
                postBufferMinutes: 30
              },
              finalizedAt: new Date(),
              activeAt: new Date(),
              createdById: ownerUserId,
              updatedById: ownerUserId
            },
            select: { id: true }
          });
      await transaction.scheduleCycleTarget.updateMany({
        where: {
          cycleId: scheduleCycle.id,
          technicianProfileId: { notIn: technicianProfileIds },
          deletedAt: null
        },
        data: { deletedAt: new Date() }
      });
      for (const technicianProfileId of technicianProfileIds) {
        await transaction.scheduleCycleTarget.upsert({
          where: {
            cycleId_technicianProfileId: { cycleId: scheduleCycle.id, technicianProfileId }
          },
          create: { cycleId: scheduleCycle.id, technicianProfileId },
          update: { deletedAt: null }
        });
      }

      const conflicting = await transaction.availability.findMany({
        where: {
          shopId: shop.id,
          technicianProfileId: { in: allTechnicianProfileIds },
          isScheduleControlWindow: true,
          isActive: true,
          deletedAt: null,
          startsAt: { lt: periodEnd },
          endsAt: { gt: periodStart },
          OR: [
            { sourceType: { not: AvailabilitySourceType.TECHNICIAN } },
            { visibility: { not: AvailabilityVisibility.TECHNICIAN_SHOPS } }
          ]
        },
        select: { id: true }
      });
      if (conflicting.length > 0) {
        const conflictingAvailabilityIds = conflicting.map((item) => item.id);
        await transaction.scheduleSlot.updateMany({
          where: {
            availabilityId: { in: conflictingAvailabilityIds },
            bookedCount: 0,
            deletedAt: null
          },
          data: { status: "BLOCKED", deletedAt: new Date() }
        });
        await transaction.availability.updateMany({
          where: { id: { in: conflictingAvailabilityIds } },
          data: { isActive: false, deletedAt: new Date() }
        });
      }

      const desiredAvailabilityRanges = buildContinuousAvailabilityRanges({
        startsAt: periodStart,
        endsAt: periodEnd,
        technicianProfileIds
      });
      const desiredAvailabilities: Prisma.AvailabilityCreateManyInput[] =
        desiredAvailabilityRanges.map((range) => ({
          shopId: shop.id,
          ...range,
          sourceType: AvailabilitySourceType.TECHNICIAN,
          visibility: AvailabilityVisibility.TECHNICIAN_SHOPS,
          capacity: 1,
          isActive: true,
          isScheduleControlWindow: true
        }));

      const existingAvailabilities = await transaction.availability.findMany({
        where: {
          shopId: shop.id,
          technicianProfileId: { in: allTechnicianProfileIds },
          sourceType: AvailabilitySourceType.TECHNICIAN,
          visibility: AvailabilityVisibility.TECHNICIAN_SHOPS,
          startsAt: { lt: periodEnd },
          endsAt: { gt: periodStart },
          isScheduleControlWindow: true,
          deletedAt: null
        },
        select: { id: true, technicianProfileId: true, startsAt: true, endsAt: true, isActive: true }
      });
      const { existingKeys, inactiveIds, duplicateIds, obsoleteIds } =
        planAvailabilityReconciliation(existingAvailabilities, desiredAvailabilityRanges);
      const retiredAvailabilityIds = [...duplicateIds, ...obsoleteIds];
      if (retiredAvailabilityIds.length > 0) {
        await transaction.availability.updateMany({
          where: { id: { in: retiredAvailabilityIds } },
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
      const servicesByTechnician = new Map<
        number,
        Array<{ id: number; durationMinutes: number }>
      >();
      for (const service of technicianServices) {
        const services = servicesByTechnician.get(service.technicianId) ?? [];
        services.push({ id: service.id, durationMinutes: service.durationMinutes });
        servicesByTechnician.set(service.technicianId, services);
      }
      if (servicesByTechnician.size !== technicianProfileIds.length) {
        throw new Error(
          `STAGING_TEST_TECHNICIAN_SERVICE_COUNT_MISMATCH:${servicesByTechnician.size}`
        );
      }

      const canonicalAvailabilities = await transaction.availability.findMany({
        where: {
          shopId: shop.id,
          technicianProfileId: { in: technicianProfileIds },
          sourceType: AvailabilitySourceType.TECHNICIAN,
          visibility: AvailabilityVisibility.TECHNICIAN_SHOPS,
          startsAt: { gte: periodStart, lt: periodEnd },
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
      const retiredAvailabilityRows = existingAvailabilities.filter((item) =>
        retiredAvailabilityIds.includes(item.id)
      );
      for (const technicianProfileId of technicianProfileIds) {
        const retiredIds = retiredAvailabilityRows
          .filter((item) => item.technicianProfileId === technicianProfileId)
          .map((item) => item.id);
        if (retiredIds.length === 0) continue;
        const desiredRange = desiredAvailabilityRanges.find(
          (range) => range.technicianProfileId === technicianProfileId
        );
        const canonicalAvailabilityId = desiredRange
          ? availabilityIdByKey.get(availabilityKey(desiredRange))
          : undefined;
        if (canonicalAvailabilityId === undefined) {
          throw new Error(
            `STAGING_TEST_CONTINUOUS_AVAILABILITY_MISSING:${technicianProfileId}`
          );
        }
        await transaction.scheduleSlot.updateMany({
          where: { availabilityId: { in: retiredIds } },
          data: { availabilityId: canonicalAvailabilityId }
        });
      }
      await transaction.scheduleSlot.updateMany({
        where: {
          shopId: shop.id,
          bookedCount: 0,
          deletedAt: null,
          bookingOrders: { none: {} }
        },
        data: { status: "BLOCKED", deletedAt: new Date() }
      });
      const scheduleSlotCount = 0;
      const createdScheduleSlotCount = 0;

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
            retiredScheduleModeAvailabilityCount: conflicting.length,
            createdTechnicianServiceCount: missingTechnicianServiceIds.length,
            scheduleSlotCount,
            createdScheduleSlotCount,
            serviceStartIntervalStrategy: "dynamic_five_minute_projection",
            continuousDailyCoverage: true,
            automationSettingCount,
            scheduleCycleId: scheduleCycle.id
          }
        }
      });

      return {
        shopId: shop.id,
        technicianCount: technicianProfileIds.length,
        startDate: toDateString(periodStart),
        endDate: toDateString(periodEnd),
        availabilityCount,
        deduplicatedAvailabilityCount: duplicateIds.length,
        retiredScheduleModeAvailabilityCount: conflicting.length,
        createdTechnicianServiceCount: missingTechnicianServiceIds.length,
        scheduleSlotCount,
        createdScheduleSlotCount,
        automationSettingCount,
        scheduleCycleId: scheduleCycle.id
      };
    }, { timeout: 300_000 });
  }
}
