import { ContentLocale, type Prisma, type PrismaClient } from "@prisma/client";
import { CONTENT_LOCALES, type ContentLocaleCode } from "../constants/content-locales";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  ShopPresentationLocalePayload,
  ShopPresentationRepositoryPort,
  ShopPresentationWorkspacePayload
} from "../services/shop-presentation.service";
import { shopPresentationContentSchema, type ShopPresentationContent } from "../validators/shop-presentation.validator";
import { AppError } from "../utils/app-error";

const localeToDb: Record<ContentLocaleCode, ContentLocale> = {
  "zh-CN": ContentLocale.ZH_CN,
  "zh-TW": ContentLocale.ZH_TW,
  en: ContentLocale.EN,
  ja: ContentLocale.JA,
  ko: ContentLocale.KO
};

const localeFromDb: Record<ContentLocale, ContentLocaleCode> = {
  [ContentLocale.ZH_CN]: "zh-CN",
  [ContentLocale.ZH_TW]: "zh-TW",
  [ContentLocale.EN]: "en",
  [ContentLocale.JA]: "ja",
  [ContentLocale.KO]: "ko"
};

export class ShopPresentationRepository implements ShopPresentationRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async getWorkspace(shopId: number): Promise<ShopPresentationWorkspacePayload> {
    const shop = await this.client.shop.findFirst({
      where: { id: shopId, deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        city: true,
        address: true,
        presentationLocales: { where: { deletedAt: null } },
        mediaAssets: {
          where: { deletedAt: null, isActive: true, checksumSha256: { not: null } },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
        },
        services: {
          where: { deletedAt: null, status: "published" },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          take: 5,
          include: {
            mediaAssets: {
              where: { deletedAt: null, isActive: true, checksumSha256: { not: null } },
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              take: 1
            }
          }
        }
      }
    });
    if (!shop) {
      throw new AppError({ code: ERROR_CODES.NOT_FOUND, message: "error.shop.not_found", statusCode: 404 });
    }

    const fallback: ShopPresentationContent = {
      storeName: shop.name,
      description: shop.description ?? "",
      address: shop.address,
      area: shop.city,
      rankLabel: "",
      businessHours: "",
      subtitle: shop.description ?? "",
      station: "",
      distance: "",
      parking: "",
      routeGuide: "",
      paymentMethods: [],
      equipment: [],
      carousel: shop.mediaAssets.slice(0, 5).flatMap((asset) => asset.checksumSha256 ? [{ mediaAssetPublicId: asset.checksumSha256, altText: asset.altText ?? shop.name }] : []),
      serviceMenus: shop.services.map((service) => ({
        serviceId: service.id,
        name: service.name,
        description: service.description ?? "",
        audience: "",
        tags: [],
        highlights: [],
        coverMediaAssetPublicId: service.mediaAssets[0]?.checksumSha256 ?? null
      }))
    };

    const saved = new Map(shop.presentationLocales.map((row) => [localeFromDb[row.locale], row]));
    const locales = Object.fromEntries(CONTENT_LOCALES.map((locale) => {
      const row = saved.get(locale);
      return [locale, row ? {
        locale,
        lockVersion: row.lockVersion,
        content: shopPresentationContentSchema.parse(row.content),
        updatedAt: row.updatedAt.toISOString()
      } : {
        locale,
        lockVersion: 0,
        content: structuredClone(fallback),
        updatedAt: null
      }];
    })) as ShopPresentationWorkspacePayload["locales"];

    const assets = [...shop.mediaAssets, ...shop.services.flatMap((service) => service.mediaAssets)];
    const media = Object.fromEntries(assets.flatMap((asset) => asset.checksumSha256 ? [[asset.checksumSha256, { url: asset.url, altText: asset.altText }]] : []));
    const services = shop.services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description ?? "",
      priceAmount: String(service.priceAmount),
      currency: service.currency,
      durationMinutes: service.durationMinutes,
      coverMediaAssetPublicId: service.mediaAssets[0]?.checksumSha256 ?? null
    }));
    return { shopId: shop.id, locales, media, services };
  }

  public updateLocale(input: Parameters<ShopPresentationRepositoryPort["updateLocale"]>[0]): Promise<ShopPresentationLocalePayload> {
    return this.client.$transaction(async (transaction) => {
      await this.validateReferences(transaction, input.shopId, input.content);
      const dbLocale = localeToDb[input.locale];
      const existing = await transaction.shopPresentationLocale.findUnique({
        where: { shopId_locale: { shopId: input.shopId, locale: dbLocale } }
      });
      if ((existing?.deletedAt ? 0 : existing?.lockVersion ?? 0) !== input.expectedLockVersion) {
        throw new AppError({ code: ERROR_CODES.SAAS_BILLING_CONFLICT, message: "error.shop_presentation.version_conflict", statusCode: 409 });
      }
      const row = existing
        ? await transaction.shopPresentationLocale.update({
            where: { id: existing.id },
            data: {
              content: input.content as Prisma.InputJsonValue,
              lockVersion: existing.deletedAt ? 1 : { increment: 1 },
              updatedById: input.actorUserId,
              updatedAt: input.updatedAt,
              deletedAt: null
            }
          })
        : await transaction.shopPresentationLocale.create({
            data: {
              shopId: input.shopId,
              locale: dbLocale,
              content: input.content as Prisma.InputJsonValue,
              lockVersion: 1,
              updatedById: input.actorUserId,
              createdAt: input.updatedAt,
              updatedAt: input.updatedAt
            }
          });
      await transaction.auditLog.create({
        data: {
          actorId: input.actorUserId,
          action: "merchant_admin.shop_presentation.locale_updated",
          targetType: "ShopPresentationLocale",
          targetId: row.id,
          ip: input.context.ip,
          userAgent: input.context.userAgent ?? null,
          metadata: { shopId: input.shopId, locale: input.locale, lockVersion: row.lockVersion, actorIdentityId: input.actorIdentityId },
          createdAt: input.updatedAt
        }
      });
      return { locale: input.locale, lockVersion: row.lockVersion, content: input.content, updatedAt: row.updatedAt.toISOString() };
    });
  }

  public syncLocale(input: Parameters<ShopPresentationRepositoryPort["syncLocale"]>[0]): Promise<Record<ContentLocaleCode, ShopPresentationLocalePayload>> {
    return this.client.$transaction(async (transaction) => {
      await this.validateReferences(transaction, input.shopId, input.content);
      const existingRows = await transaction.shopPresentationLocale.findMany({
        where: { shopId: input.shopId, locale: { in: Object.values(localeToDb) } }
      });
      const existingByLocale = new Map(existingRows.map((row) => [row.locale, row]));

      for (const locale of CONTENT_LOCALES) {
        const existing = existingByLocale.get(localeToDb[locale]);
        const currentLockVersion = existing?.deletedAt ? 0 : existing?.lockVersion ?? 0;
        if (currentLockVersion !== input.expectedLockVersions[locale]) {
          throw new AppError({ code: ERROR_CODES.SAAS_BILLING_CONFLICT, message: "error.shop_presentation.version_conflict", statusCode: 409 });
        }
      }

      const synchronized = {} as Record<ContentLocaleCode, ShopPresentationLocalePayload>;
      for (const locale of CONTENT_LOCALES) {
        const dbLocale = localeToDb[locale];
        const existing = existingByLocale.get(dbLocale);
        const row = existing
          ? await transaction.shopPresentationLocale.update({
              where: { id: existing.id },
              data: {
                content: input.content as Prisma.InputJsonValue,
                lockVersion: existing.deletedAt ? 1 : { increment: 1 },
                updatedById: input.actorUserId,
                updatedAt: input.updatedAt,
                deletedAt: null
              }
            })
          : await transaction.shopPresentationLocale.create({
              data: {
                shopId: input.shopId,
                locale: dbLocale,
                content: input.content as Prisma.InputJsonValue,
                lockVersion: 1,
                updatedById: input.actorUserId,
                createdAt: input.updatedAt,
                updatedAt: input.updatedAt
              }
            });
        synchronized[locale] = {
          locale,
          lockVersion: row.lockVersion,
          content: structuredClone(input.content),
          updatedAt: row.updatedAt.toISOString()
        };
      }

      await transaction.auditLog.create({
        data: {
          actorId: input.actorUserId,
          action: "merchant_admin.shop_presentation.locales_synchronized",
          targetType: "Shop",
          targetId: input.shopId,
          ip: input.context.ip,
          userAgent: input.context.userAgent ?? null,
          metadata: {
            shopId: input.shopId,
            sourceLocale: input.sourceLocale,
            targetLocales: CONTENT_LOCALES.filter((locale) => locale !== input.sourceLocale),
            lockVersions: Object.fromEntries(CONTENT_LOCALES.map((locale) => [locale, synchronized[locale].lockVersion])),
            actorIdentityId: input.actorIdentityId
          },
          createdAt: input.updatedAt
        }
      });
      return synchronized;
    });
  }

  private async validateReferences(transaction: Prisma.TransactionClient, shopId: number, content: ShopPresentationContent): Promise<void> {
    const serviceIds = [...new Set(content.serviceMenus.map((item) => item.serviceId))];
    if (serviceIds.length) {
      const count = await transaction.service.count({ where: { id: { in: serviceIds }, shopId, status: "published", deletedAt: null } });
      if (count !== serviceIds.length) {
        throw new AppError({ code: ERROR_CODES.VALIDATION, message: "error.shop_presentation.service_invalid", statusCode: 400 });
      }
    }
    const mediaIds = [...new Set([
      ...content.carousel.map((item) => item.mediaAssetPublicId),
      ...content.serviceMenus.flatMap((item) => item.coverMediaAssetPublicId ? [item.coverMediaAssetPublicId] : [])
    ])];
    const media = await transaction.mediaAsset.findMany({
      where: { checksumSha256: { in: mediaIds }, shopId, isActive: true, deletedAt: null },
      select: { checksumSha256: true }
    });
    const validMediaIds = new Set(media.flatMap((item) => item.checksumSha256 ? [item.checksumSha256] : []));
    if (validMediaIds.size !== mediaIds.length) {
      throw new AppError({ code: ERROR_CODES.VALIDATION, message: "error.shop_presentation.media_invalid", statusCode: 400 });
    }
  }
}
