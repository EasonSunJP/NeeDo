import { ContentLocale } from "@prisma/client";
import { ShopPresentationRepository } from "../src/repositories/shop-presentation.repository";

const now = new Date("2026-09-10T00:00:00.000Z");
const imageId = "a".repeat(64);
const content = {
  storeName: "日本語店名",
  description: "説明",
  address: "東京都港区",
  area: "港区",
  rankLabel: "おすすめ",
  businessHours: "11:00-23:00",
  subtitle: "すぐ予約可能",
  station: "麻布十番駅",
  distance: "徒歩3分",
  parking: "近隣駐車場",
  routeGuide: "A9出口",
  paymentMethods: ["Visa"],
  equipment: ["個室"],
  carousel: [{ mediaAssetPublicId: imageId, altText: "店舗" }],
  serviceMenus: [{ serviceId: 1514, name: "首肩ケア", description: "基本", audience: "全員", tags: ["肩"], highlights: ["予約可"], coverMediaAssetPublicId: imageId }]
};

describe("ShopPresentationRepository", () => {
  it("builds all five locale drafts from formal shop, service, and media records", async () => {
    const client = {
      shop: { findFirst: jest.fn(async () => ({
        id: 16,
        name: "Base shop",
        description: "Base description",
        city: "Tokyo",
        address: "Base address",
        presentationLocales: [],
        mediaAssets: [{ id: 1, checksumSha256: imageId, url: "/media/content/a.webp", altText: "Store", sortOrder: 0 }],
        services: [{ id: 1514, name: "Base service", description: "Base", priceAmount: "8800", currency: "JPY", durationMinutes: 60, mediaAssets: [] }]
      })) }
    };
    const result = await new ShopPresentationRepository(client as never).getWorkspace(16);
    expect(Object.keys(result.locales)).toEqual(["zh-CN", "zh-TW", "en", "ja", "ko"]);
    expect(result.locales.ja).toMatchObject({ lockVersion: 0, content: { storeName: "Base shop", carousel: [{ mediaAssetPublicId: imageId }] } });
    expect(result.services[0]).toMatchObject({ id: 1514, priceAmount: "8800", durationMinutes: 60 });
    expect(result.media[imageId]?.url).toBe("/media/content/a.webp");
  });

  it("updates one locale with a version check and transaction audit", async () => {
    const transaction = {
      service: { count: jest.fn(async () => 1) },
      mediaAsset: { count: jest.fn(async () => 1) },
      shopPresentationLocale: {
        findUnique: jest.fn(async () => ({ id: 9, lockVersion: 2, deletedAt: null })),
        update: jest.fn(async () => ({ id: 9, lockVersion: 3, updatedAt: now }))
      },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const client = { $transaction: jest.fn(async (operation: (value: typeof transaction) => unknown) => operation(transaction)) };
    const result = await new ShopPresentationRepository(client as never).updateLocale({
      shopId: 16,
      locale: "ja",
      expectedLockVersion: 2,
      content,
      actorUserId: 7,
      actorIdentityId: 70,
      context: { ip: "127.0.0.1", userAgent: "jest" },
      updatedAt: now
    });
    expect(transaction.shopPresentationLocale.findUnique).toHaveBeenCalledWith({ where: { shopId_locale: { shopId: 16, locale: ContentLocale.JA } } });
    expect(transaction.shopPresentationLocale.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lockVersion: { increment: 1 } }) }));
    expect(transaction.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "merchant_admin.shop_presentation.locale_updated" }) }));
    expect(result.lockVersion).toBe(3);
  });

  it("synchronizes the current content to all five independent locale rows in one transaction", async () => {
    const locales = [ContentLocale.ZH_CN, ContentLocale.ZH_TW, ContentLocale.EN, ContentLocale.JA, ContentLocale.KO];
    const existingRows = locales.map((locale, index) => ({ id: index + 1, locale, lockVersion: index + 1, deletedAt: null }));
    const transaction = {
      service: { count: jest.fn(async () => 1) },
      mediaAsset: { count: jest.fn(async () => 1) },
      shopPresentationLocale: {
        findMany: jest.fn(async () => existingRows),
        update: jest.fn(async ({ where }: { where: { id: number } }) => ({
          id: where.id,
          lockVersion: (existingRows.find((row) => row.id === where.id)?.lockVersion ?? 0) + 1,
          updatedAt: now
        })),
        create: jest.fn()
      },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const client = { $transaction: jest.fn(async (operation: (value: typeof transaction) => unknown) => operation(transaction)) };
    const result = await new ShopPresentationRepository(client as never).syncLocale({
      shopId: 16,
      sourceLocale: "ja",
      expectedLockVersions: { "zh-CN": 1, "zh-TW": 2, en: 3, ja: 4, ko: 5 },
      content,
      actorUserId: 7,
      actorIdentityId: 70,
      context: { ip: "127.0.0.1", userAgent: "jest" },
      updatedAt: now
    });

    expect(transaction.shopPresentationLocale.update).toHaveBeenCalledTimes(5);
    expect(Object.keys(result)).toEqual(["zh-CN", "zh-TW", "en", "ja", "ko"]);
    expect(result.en.content).toEqual(content);
    expect(result.en.content).not.toBe(result.ja.content);
    expect(transaction.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "merchant_admin.shop_presentation.locales_synchronized",
        metadata: expect.objectContaining({ sourceLocale: "ja", targetLocales: ["zh-CN", "zh-TW", "en", "ko"] })
      })
    }));
  });

  it("checks every locale version before writing any synchronized row", async () => {
    const transaction = {
      service: { count: jest.fn(async () => 1) },
      mediaAsset: { count: jest.fn(async () => 1) },
      shopPresentationLocale: {
        findMany: jest.fn(async () => [
          { id: 1, locale: ContentLocale.ZH_CN, lockVersion: 7, deletedAt: null }
        ]),
        update: jest.fn(),
        create: jest.fn()
      },
      auditLog: { create: jest.fn() }
    };
    const client = { $transaction: jest.fn(async (operation: (value: typeof transaction) => unknown) => operation(transaction)) };

    await expect(new ShopPresentationRepository(client as never).syncLocale({
      shopId: 16,
      sourceLocale: "ja",
      expectedLockVersions: { "zh-CN": 6, "zh-TW": 0, en: 0, ja: 0, ko: 0 },
      content,
      actorUserId: 7,
      actorIdentityId: 70,
      context: { ip: "127.0.0.1", userAgent: "jest" },
      updatedAt: now
    })).rejects.toMatchObject({ statusCode: 409, message: "error.shop_presentation.version_conflict" });

    expect(transaction.shopPresentationLocale.update).not.toHaveBeenCalled();
    expect(transaction.shopPresentationLocale.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });
});
