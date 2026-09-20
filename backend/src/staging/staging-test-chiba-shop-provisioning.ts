import {
  AvailabilitySourceType,
  AvailabilityVisibility,
  TechnicianAutomationKind,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { z } from "zod";
import { PublicIdentifierRepository } from "../repositories/public-identifier.repository";
import { IdentifierAllocator } from "../services/public-identifier.service";
import { permissiveRules } from "./staging-test-operations-provisioning";

const configSchema = z.object({
  NODE_ENV: z.literal("production"),
  DEPLOY_ENV: z.literal("staging"),
  ALLOW_STAGING_TEST_CHIBA_PROVISIONING: z.literal("true"),
  STAGING_TEST_CHIBA_SCHEDULE_START_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  STAGING_TEST_CHIBA_SCHEDULE_END_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const OWNER_EMAIL = "akiratest@lifedance.com";
const SHOP_NAME = "StagingTest千葉店";

export const STAGING_TEST_CHIBA_SERVICES = [
  {
    kind: "massage",
    name: "全身もみほぐし 60分",
    description: "首・肩・背中・腰・脚をバランスよく整える、定番の全身もみほぐしコースです。表示価格は税込です。",
    priceAmountJpy: 6_600,
    currency: "JPY",
    durationMinutes: 60
  },
  {
    kind: "massage",
    name: "アロマリンパトリートメント 90分",
    description: "香りを選べるオイルを使用し、全身をゆっくり流すリラクゼーションコースです。表示価格は税込です。",
    priceAmountJpy: 11_000,
    currency: "JPY",
    durationMinutes: 90
  },
  {
    kind: "massage",
    name: "ドライヘッドスパ 45分",
    description: "水やオイルを使わず、頭・目まわり・首肩を丁寧にほぐすコースです。表示価格は税込です。",
    priceAmountJpy: 5_500,
    currency: "JPY",
    durationMinutes: 45
  },
  {
    kind: "option",
    name: "オプション｜足つぼ・リフレクソロジー 20分",
    description: "通常コースに追加できる、足裏からふくらはぎまでの集中ケアです。表示価格は税込です。",
    priceAmountJpy: 2_200,
    currency: "JPY",
    durationMinutes: 20
  },
  {
    kind: "option",
    name: "オプション｜ホットアイマスク＆首肩温熱ケア 15分",
    description: "通常コースに追加できる、目元と首肩を温めながら緩めるケアです。表示価格は税込です。",
    priceAmountJpy: 1_650,
    currency: "JPY",
    durationMinutes: 15
  },
  {
    kind: "extension",
    name: "延長 10分",
    description: "当日の施術を10分延長する追加メニューです。表示価格は税込です。",
    priceAmountJpy: 1_100,
    currency: "JPY",
    durationMinutes: 10
  }
] as const;

export interface StagingTestChibaShopConfig {
  ownerEmail: typeof OWNER_EMAIL;
  startDate: string;
  endDate: string;
}

export interface StagingTestChibaShopResult {
  shopId: number;
  shopNo: string;
  ownerEmail: string;
  merchantAccountId: number;
  scheduleCycleId: number;
  scheduleMode: "STORE_ASSIGN_FINAL";
  pricingMode: "MERCHANT";
  startDate: string;
  endDate: string;
  technicianCount: number;
  serviceCount: number;
  massageServiceCount: number;
  optionServiceCount: number;
  extensionServiceCount: number;
  availabilityCount: number;
  automationSettingCount: number;
  scheduleSlotCount: number;
  createdScheduleSlotCount: number;
  serviceStartIntervalMinutes: number;
}

const addCalendarMonths = (date: string, months: number): string => {
  const [year, month, day] = date.split("-").map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const candidate = new Date(Date.UTC(targetYear, targetMonth, day));
  if (candidate.getUTCMonth() !== targetMonth) candidate.setUTCDate(0);
  return candidate.toISOString().slice(0, 10);
};

const addCalendarDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export const parseStagingTestChibaShopConfig = (
  environment: NodeJS.ProcessEnv
): StagingTestChibaShopConfig => {
  const parsed = configSchema.parse(environment);
  const start = new Date(`${parsed.STAGING_TEST_CHIBA_SCHEDULE_START_DATE}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) {
    throw new Error("STAGING_TEST_CHIBA_SCHEDULE_START_DATE_INVALID");
  }
  const endDate = parsed.STAGING_TEST_CHIBA_SCHEDULE_END_DATE
    ?? addCalendarMonths(parsed.STAGING_TEST_CHIBA_SCHEDULE_START_DATE, 3);
  if (endDate <= parsed.STAGING_TEST_CHIBA_SCHEDULE_START_DATE) {
    throw new Error("STAGING_TEST_CHIBA_SCHEDULE_PERIOD_INVALID");
  }
  return {
    ownerEmail: OWNER_EMAIL,
    startDate: parsed.STAGING_TEST_CHIBA_SCHEDULE_START_DATE,
    endDate
  };
};

export const buildNightlyShiftRanges = (input: {
  startDate: string;
  endDate: string;
  technicianProfileIds: number[];
}): Array<{ technicianProfileId: number; startsAt: Date; endsAt: Date }> => {
  const ranges: Array<{ technicianProfileId: number; startsAt: Date; endsAt: Date }> = [];
  for (const technicianProfileId of input.technicianProfileIds) {
    for (let date = input.startDate; date < input.endDate; date = addCalendarDays(date, 1)) {
      const startsAt = new Date(`${date}T17:00:00+09:00`);
      ranges.push({
        technicianProfileId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 8 * 60 * 60_000)
      });
    }
  }
  return ranges;
};

const availabilityKey = (input: {
  technicianProfileId: number | null;
  startsAt: Date | string;
  endsAt: Date | string;
}) => `${input.technicianProfileId}:${new Date(input.startsAt).toISOString()}:${new Date(input.endsAt).toISOString()}`;

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message
) => {
  if (!condition) throw new Error(message);
};

export class StagingTestChibaShopProvisioner {
  public constructor(private readonly client: PrismaClient) {}

  public async provision(config: StagingTestChibaShopConfig): Promise<StagingTestChibaShopResult> {
    const tx = this.client;
    const owner = await tx.user.findFirst({
      where: {
        email: config.ownerEmail,
        isActive: true,
        isTestAccount: true,
        deletedAt: null
      },
      select: { id: true, username: true }
    });
    assert(owner, "STAGING_TEST_CHIBA_OWNER_NOT_FOUND");

    const existingShops = await tx.shop.findMany({
      where: { name: SHOP_NAME, deletedAt: null },
      select: { id: true, status: true, visibility: true }
    });
    assert(existingShops.length <= 1, "STAGING_TEST_CHIBA_SHOP_NOT_UNIQUE");
    const wasPublished =
      existingShops[0]?.status === "published" && existingShops[0]?.visibility === "public";
    const shop = existingShops[0]
      ? await tx.shop.update({
          where: { id: existingShops[0].id },
          data: {
            ownerUserId: owner.id,
            createdById: owner.id,
            description: "千葉駅近くの完全予約制リラクゼーションサロン。仕事帰りにも利用しやすい深夜1時まで営業しています。",
            city: "千葉市",
            address: "千葉県千葉市中央区富士見2-7-9",
            latitude: "35.6110000",
            longitude: "140.1180000",
            phone: "043-000-8800",
            status: wasPublished ? "published" : "draft",
            visibility: wasPublished ? "public" : "privateAll",
            pricingMode: "MERCHANT",
            technicianPricingRatePercent: 100,
            pricingModeUpdatedAt: new Date(),
            pricingModeUpdatedBy: owner.id,
            deletedAt: null
          }
        })
      : await tx.shop.create({
          data: {
            ownerUserId: owner.id,
            createdById: owner.id,
            name: SHOP_NAME,
            description: "千葉駅近くの完全予約制リラクゼーションサロン。仕事帰りにも利用しやすい深夜1時まで営業しています。",
            city: "千葉市",
            address: "千葉県千葉市中央区富士見2-7-9",
            latitude: "35.6110000",
            longitude: "140.1180000",
            phone: "043-000-8800",
            status: wasPublished ? "published" : "draft",
            visibility: wasPublished ? "public" : "privateAll",
            pricingMode: "MERCHANT",
            technicianPricingRatePercent: 100,
            pricingModeUpdatedAt: new Date(),
            pricingModeUpdatedBy: owner.id
          }
        });

    const supportAccount = await tx.customerSupportAccount.upsert({
      where: { shopId: shop.id },
      create: { shopId: shop.id, type: "SHOP", displayName: `${SHOP_NAME} カスタマーサポート` },
      update: { displayName: `${SHOP_NAME} カスタマーサポート`, isActive: true, deletedAt: null },
      include: { publicIdentifier: true }
    });
    const persistedShop = await tx.shop.findUniqueOrThrow({
      where: { id: shop.id },
      include: { publicIdentifier: true }
    });
    if (!persistedShop.publicIdentifier && !supportAccount.publicIdentifier) {
      const pair = await new IdentifierAllocator(
        new PublicIdentifierRepository(tx)
      ).allocateShopSupportPair({ shopId: shop.id, customerSupportAccountId: supportAccount.id });
      await tx.shop.update({
        where: { id: shop.id },
        data: { shopNo: pair.shopIdentifier.numberPart }
      });
    } else {
      assert(
        persistedShop.publicIdentifier?.kind === "SHOP" &&
          supportAccount.publicIdentifier?.kind === "CUSTOMER_SUPPORT" &&
          persistedShop.publicIdentifier.numberPart === supportAccount.publicIdentifier.numberPart,
        "STAGING_TEST_CHIBA_PUBLIC_IDENTIFIER_PAIR_INVALID"
      );
      await tx.shop.update({
        where: { id: shop.id },
        data: { shopNo: persistedShop.publicIdentifier.numberPart }
      });
    }

    const merchantAccount = await tx.merchantAccount.upsert({
      where: { code: "staging-test-chiba-akira" },
      create: {
        code: "staging-test-chiba-akira",
        ownerUserId: owner.id,
        name: "StagingTest 千葉運営",
        status: "active",
        paymentResponsibility: "group_consolidated"
      },
      update: {
        ownerUserId: owner.id,
        name: "StagingTest 千葉運営",
        status: "active",
        paymentResponsibility: "group_consolidated",
        deletedAt: null
      },
      include: { publicIdentifier: true }
    });
    if (!merchantAccount.publicIdentifier) {
      await new IdentifierAllocator(new PublicIdentifierRepository(tx)).allocate({
        kind: "OWNER",
        merchantAccountId: merchantAccount.id
      });
    }
    await tx.merchantShopMembership.upsert({
      where: { activeKey: `staging-test-chiba:${merchantAccount.id}:${shop.id}` },
      create: {
        merchantAccountId: merchantAccount.id,
        shopId: shop.id,
        activeKey: `staging-test-chiba:${merchantAccount.id}:${shop.id}`,
        startsAt: new Date(`${config.startDate}T00:00:00+09:00`),
        createdById: owner.id
      },
      update: { endsAt: null, removedReason: null, removedById: null, deletedAt: null }
    });

    const merchantStaffIdentity = await tx.userIdentity.upsert({
      where: { activeKey: `staging-test-chiba:${owner.id}:merchant_staff:${shop.id}` },
      create: {
        userId: owner.id,
        type: "merchant_staff",
        scopeType: "shop",
        scopeId: shop.id,
        displayName: owner.username,
        isDefault: false,
        isActive: true,
        activeKey: `staging-test-chiba:${owner.id}:merchant_staff:${shop.id}`
      },
      update: {
        displayName: owner.username,
        isActive: true,
        deletedAt: null
      }
    });
    await tx.merchantIdentityProfile.upsert({
      where: { identityId: merchantStaffIdentity.id },
      create: {
        userId: owner.id,
        identityId: merchantStaffIdentity.id,
        displayName: owner.username,
        languages: ["ja"]
      },
      update: { displayName: owner.username, languages: ["ja"], deletedAt: null }
    });
    const merchantStaffRole = await tx.role.findFirst({
      where: { code: "merchant_staff", deletedAt: null },
      select: { id: true }
    });
    assert(merchantStaffRole, "STAGING_TEST_CHIBA_MERCHANT_STAFF_ROLE_MISSING");
    const existingRole = await tx.userRole.findFirst({
      where: {
        userId: owner.id,
        roleId: merchantStaffRole.id,
        scopeType: "shop",
        scopeId: shop.id
      }
    });
    if (existingRole) {
      await tx.userRole.update({ where: { id: existingRole.id }, data: { deletedAt: null } });
    } else {
      await tx.userRole.create({
        data: {
          userId: owner.id,
          roleId: merchantStaffRole.id,
          scopeType: "shop",
          scopeId: shop.id
        }
      });
    }

    const sourceShop = await tx.shop.findFirst({
      where: { name: "StagingTest", deletedAt: null },
      select: { id: true }
    });
    assert(sourceShop, "STAGING_TEST_CHIBA_SOURCE_SHOP_MISSING");
    const sourceAffiliations = await tx.technicianShopAffiliation.findMany({
      where: {
        shopId: sourceShop.id,
        workStatus: "ACTIVE",
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
      select: {
        technicianProfileId: true,
        technicianProfile: { select: { userId: true } }
      },
      distinct: ["technicianProfileId"],
      orderBy: { technicianProfileId: "asc" },
      take: 10
    });
    assert(sourceAffiliations.length === 10, `STAGING_TEST_CHIBA_TECHNICIAN_COUNT:${sourceAffiliations.length}`);
    for (const source of sourceAffiliations) {
      const affiliation = await tx.technicianShopAffiliation.upsert({
        where: { activeKey: `staging-test-chiba:${shop.id}:technician:${source.technicianProfileId}` },
        create: {
          technicianProfileId: source.technicianProfileId,
          shopId: shop.id,
          relationshipType: "PARTNER",
          workStatus: "ACTIVE",
          startsAt: new Date(`${config.startDate}T00:00:00+09:00`),
          activeKey: `staging-test-chiba:${shop.id}:technician:${source.technicianProfileId}`,
          createdById: owner.id,
          updatedById: owner.id
        },
        update: {
          relationshipType: "PARTNER",
          workStatus: "ACTIVE",
          endsAt: null,
          updatedById: owner.id,
          deletedAt: null
        }
      });
      await tx.shopEmployee.upsert({
        where: { activeKey: `staging-test-chiba:${shop.id}:employee:${source.technicianProfile.userId}` },
        create: {
          shopId: shop.id,
          userId: source.technicianProfile.userId,
          status: "ACTIVE",
          startsAt: new Date(`${config.startDate}T00:00:00+09:00`),
          technicianShopAffiliationId: affiliation.id,
          activeKey: `staging-test-chiba:${shop.id}:employee:${source.technicianProfile.userId}`,
          createdById: owner.id,
          updatedById: owner.id
        },
        update: {
          status: "ACTIVE",
          endsAt: null,
          technicianShopAffiliationId: affiliation.id,
          updatedById: owner.id,
          deletedAt: null
        }
      });
    }
    const technicianProfileIds = sourceAffiliations.map((item) => item.technicianProfileId);

    let automationSettingCount = 0;
    for (const technicianProfileId of technicianProfileIds) {
      for (const [kind, rules] of [
        [TechnicianAutomationKind.BOOKING, permissiveRules("booking")],
        [TechnicianAutomationKind.REQUEST, permissiveRules("request")]
      ] as const) {
        await tx.technicianAutomationSetting.upsert({
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

    const massageCategory = await tx.category.findFirst({
      where: { code: "massage", isActive: true, deletedAt: null },
      select: { id: true }
    });
    assert(massageCategory, "STAGING_TEST_CHIBA_MASSAGE_CATEGORY_MISSING");
    const taxonomySelection = await tx.shopServiceCategory.findFirst({
      where: { shopId: shop.id, categoryId: massageCategory.id }
    });
    if (taxonomySelection) {
      await tx.shopServiceCategory.update({
        where: { id: taxonomySelection.id },
        data: { selectedByUserId: owner.id, deletedAt: null }
      });
    } else {
      await tx.shopServiceCategory.create({
        data: {
          shopId: shop.id,
          categoryId: massageCategory.id,
          selectedByUserId: owner.id
        }
      });
    }

    const services: Array<{ id: number; durationMinutes: number }> = [];
    for (const [index, definition] of STAGING_TEST_CHIBA_SERVICES.entries()) {
      const existing = await tx.service.findFirst({
        where: { shopId: shop.id, name: definition.name },
        select: { id: true }
      });
      const data = {
        categoryId: massageCategory.id,
        shopId: shop.id,
        technicianProfileId: null,
        name: definition.name,
        description: definition.description,
        city: "千葉市",
        serviceMode: "store",
        priceAmount: definition.priceAmountJpy,
        currency: definition.currency,
        durationMinutes: definition.durationMinutes,
        status: "published",
        isRecommended: definition.kind === "massage" && index === 0,
        sortOrder: index,
        deletedAt: null
      } satisfies Prisma.ServiceUncheckedUpdateInput;
      const service = existing
        ? await tx.service.update({ where: { id: existing.id }, data, select: { id: true, durationMinutes: true } })
        : await tx.service.create({ data, select: { id: true, durationMinutes: true } });
      services.push(service);
    }

    const periodStart = new Date(`${config.startDate}T00:00:00.000Z`);
    const periodEnd = new Date(`${config.endDate}T00:00:00.000Z`);
    await tx.scheduleCycle.updateMany({
      where: {
        shopId: shop.id,
        mode: "TECH_SELF_FINAL",
        status: { notIn: ["CANCELLED", "COMPLETED", "ARCHIVED"] },
        periodStart: { lt: periodEnd },
        periodEnd: { gt: periodStart },
        deletedAt: null
      },
      data: { status: "CANCELLED", cancelledAt: new Date(), updatedById: owner.id }
    });
    const existingCycle = await tx.scheduleCycle.findFirst({
      where: {
        shopId: shop.id,
        mode: "STORE_ASSIGN_FINAL",
        periodStart,
        periodEnd,
        deletedAt: null
      },
      select: { id: true }
    });
    const scheduleCycle = existingCycle
      ? await tx.scheduleCycle.update({
          where: { id: existingCycle.id },
          data: {
            name: `StagingTest千葉店 店铺排班 ${config.startDate}–${config.endDate}`,
            status: "ACTIVE",
            currentStep: 3,
            templateType: "MONTH",
            templateMatrix: { daily: { startsAt: "17:00", endsAt: "01:00", crossesMidnight: true } },
            regularHolidayWeekdays: [],
            ruleSet: {
              timeZone: "Asia/Tokyo",
              shopAssigned: true,
              dynamicAvailability: true,
              startIntervalMinutes: 5,
              preBufferMinutes: 0,
              postBufferMinutes: 30
            },
            finalizedAt: new Date(),
            activeAt: new Date(),
            cancelledAt: null,
            updatedById: owner.id
          },
          select: { id: true }
        })
      : await tx.scheduleCycle.create({
          data: {
            shopId: shop.id,
            name: `StagingTest千葉店 店铺排班 ${config.startDate}–${config.endDate}`,
            creationMethod: "new",
            mode: "STORE_ASSIGN_FINAL",
            status: "ACTIVE",
            currentStep: 3,
            templateType: "MONTH",
            periodStart,
            periodEnd,
            templateMatrix: { daily: { startsAt: "17:00", endsAt: "01:00", crossesMidnight: true } },
            regularHolidayWeekdays: [],
            ruleSet: {
              timeZone: "Asia/Tokyo",
              shopAssigned: true,
              dynamicAvailability: true,
              startIntervalMinutes: 5,
              preBufferMinutes: 0,
              postBufferMinutes: 30
            },
            finalizedAt: new Date(),
            activeAt: new Date(),
            createdById: owner.id,
            updatedById: owner.id
          },
          select: { id: true }
        });
    await tx.scheduleCycleTarget.createMany({
      data: technicianProfileIds.map((technicianProfileId) => ({
        cycleId: scheduleCycle.id,
        technicianProfileId
      })),
      skipDuplicates: true
    });

    const desiredShifts = buildNightlyShiftRanges({
      startDate: config.startDate,
      endDate: config.endDate,
      technicianProfileIds
    });
    const existingAvailabilities = await tx.availability.findMany({
      where: {
        shopId: shop.id,
        technicianProfileId: { in: technicianProfileIds },
        sourceType: AvailabilitySourceType.SHOP,
        visibility: AvailabilityVisibility.SHOP_ONLY,
        isScheduleControlWindow: true,
        startsAt: { lt: new Date(`${config.endDate}T17:00:00+09:00`) },
        endsAt: { gt: new Date(`${config.startDate}T17:00:00+09:00`) },
        deletedAt: null
      },
      select: { id: true, technicianProfileId: true, startsAt: true, endsAt: true, isActive: true }
    });
    const availabilityByKey = new Map(existingAvailabilities.map((row) => [availabilityKey(row), row]));
    for (const shift of desiredShifts) {
      const key = availabilityKey(shift);
      const existing = availabilityByKey.get(key);
      if (existing) {
        if (!existing.isActive) {
          await tx.availability.update({ where: { id: existing.id }, data: { isActive: true } });
        }
        continue;
      }
      const created = await tx.availability.create({
        data: {
          shopId: shop.id,
          technicianProfileId: shift.technicianProfileId,
          sourceType: AvailabilitySourceType.SHOP,
          visibility: AvailabilityVisibility.SHOP_ONLY,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          capacity: 1,
          isActive: true,
          isScheduleControlWindow: true
        },
        select: { id: true, technicianProfileId: true, startsAt: true, endsAt: true, isActive: true }
      });
      availabilityByKey.set(key, created);
    }

    const retiredAt = new Date();
    await tx.scheduleSlot.updateMany({
      where: {
        shopId: shop.id,
        bookedCount: 0,
        deletedAt: null,
        bookingOrders: { none: {} }
      },
      data: { status: "BLOCKED", deletedAt: retiredAt }
    });
    const scheduleSlotCount = 0;
    const createdScheduleSlotCount = 0;
    const serviceStartIntervalMinutes = 5;

    const admin1 = await tx.administrativeRegion.findFirst({
      where: { countryCode: "JP", officialCode: "12", level: "ADMIN1", deletedAt: null },
      select: { id: true, sourceVersion: true }
    });
    const admin2 = await tx.administrativeRegion.findFirst({
      where: { countryCode: "JP", officialCode: "12100", level: "ADMIN2", deletedAt: null },
      select: { id: true, sourceVersion: true }
    });
    assert(admin1 && admin2, "STAGING_TEST_CHIBA_ADMINISTRATIVE_REGION_MISSING");
    await tx.shopServiceLocation.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        countryCode: "JP",
        admin1RegionId: admin1.id,
        admin2RegionId: admin2.id,
        datasetVersion: admin2.sourceVersion,
        verifiedAt: new Date(),
        verifiedById: owner.id
      },
      update: {
        countryCode: "JP",
        admin1RegionId: admin1.id,
        admin2RegionId: admin2.id,
        datasetVersion: admin2.sourceVersion,
        verifiedAt: new Date(),
        verifiedById: owner.id,
        deletedAt: null
      }
    });

    const [finalShop] = await this.client.$transaction([
      tx.shop.update({
        where: { id: shop.id },
        data: { status: "published", visibility: "public" },
        select: { shopNo: true }
      }),
      tx.auditLog.create({
        data: {
          actorId: owner.id,
          action: "staging.test_chiba_shop.provision",
          targetType: "Shop",
          targetId: shop.id,
          metadata: {
            ownerEmail: config.ownerEmail,
            scheduleMode: "store_assign",
            pricingMode: "merchant",
            businessHours: "17:00-01:00",
            startDate: config.startDate,
            endDate: config.endDate,
            technicianProfileIds,
            serviceNames: STAGING_TEST_CHIBA_SERVICES.map((service) => service.name),
            serviceStartIntervalMinutes,
            availabilityCount: desiredShifts.length,
            automationSettingCount,
            scheduleSlotCount,
            createdScheduleSlotCount
          }
        }
      })
    ]);

    assert(finalShop.shopNo, "STAGING_TEST_CHIBA_SHOP_NO_MISSING");
    const shopNo = finalShop.shopNo;
    return {
      shopId: shop.id,
      shopNo,
      ownerEmail: config.ownerEmail,
      merchantAccountId: merchantAccount.id,
      scheduleCycleId: scheduleCycle.id,
      scheduleMode: "STORE_ASSIGN_FINAL",
      pricingMode: "MERCHANT",
      startDate: config.startDate,
      endDate: config.endDate,
      technicianCount: technicianProfileIds.length,
      serviceCount: services.length,
      massageServiceCount: STAGING_TEST_CHIBA_SERVICES.filter((service) => service.kind === "massage").length,
      optionServiceCount: STAGING_TEST_CHIBA_SERVICES.filter((service) => service.kind === "option").length,
      extensionServiceCount: STAGING_TEST_CHIBA_SERVICES.filter((service) => service.kind === "extension").length,
      availabilityCount: desiredShifts.length,
      automationSettingCount,
      scheduleSlotCount,
      createdScheduleSlotCount,
      serviceStartIntervalMinutes
    };
  }
}
