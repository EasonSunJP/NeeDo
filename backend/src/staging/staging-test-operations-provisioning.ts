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
  automationSettingCount: number;
}

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
      const availabilityKey = (item: {
        technicianProfileId?: number | null;
        startsAt: Date | string;
        endsAt: Date | string;
      }): string =>
        `${item.technicianProfileId}:${new Date(item.startsAt).toISOString()}:${new Date(item.endsAt).toISOString()}`;
      const existingKeys = new Set(existingAvailabilities.map(availabilityKey));
      const inactiveIds = existingAvailabilities.filter((item) => !item.isActive).map((item) => item.id);
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
        automationSettingCount
      };
    }, { timeout: 120_000 });
  }
}
