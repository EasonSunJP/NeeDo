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
    const count = await transaction.mediaAsset.count({ where: { checksumSha256: { in: mediaIds }, shopId, isActive: true, deletedAt: null } });
    if (count !== mediaIds.length) {
      throw new AppError({ code: ERROR_CODES.VALIDATION, message: "error.shop_presentation.media_invalid", statusCode: 400 });
    }
  }
}
