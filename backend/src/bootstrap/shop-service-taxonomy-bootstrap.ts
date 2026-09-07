import type { Prisma } from "@prisma/client";
import {
  SHOP_SERVICE_TAXONOMY,
  type TaxonomyLocaleCode
} from "../catalogs/shop-service-taxonomy";

const TAXONOMY_LOCALE_ENUM = {
  "zh-CN": "ZH_CN",
  "zh-TW": "ZH_TW",
  ja: "JA",
  en: "EN",
  ko: "KO"
} as const;

export const seedShopServiceTaxonomyCatalog = async (
  tx: Prisma.TransactionClient
): Promise<void> => {
  for (const categorySeed of SHOP_SERVICE_TAXONOMY) {
    const category = await tx.category.upsert({
      where: { code: categorySeed.code },
      create: {
        code: categorySeed.code,
        name: categorySeed.labels["zh-CN"],
        nameJa: categorySeed.labels.ja,
        nameEn: categorySeed.labels.en,
        qualificationPolicy: categorySeed.qualificationPolicy,
        sortOrder: categorySeed.sortOrder,
        isActive: true
      },
      update: {
        name: categorySeed.labels["zh-CN"],
        nameJa: categorySeed.labels.ja,
        nameEn: categorySeed.labels.en,
        qualificationPolicy: categorySeed.qualificationPolicy,
        sortOrder: categorySeed.sortOrder,
        isActive: true,
        deletedAt: null
      }
    });

    for (const locale of Object.keys(TAXONOMY_LOCALE_ENUM) as TaxonomyLocaleCode[]) {
      const localeEnum = TAXONOMY_LOCALE_ENUM[locale];
      await tx.categoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: category.id, locale: localeEnum } },
        create: { categoryId: category.id, locale: localeEnum, name: categorySeed.labels[locale] },
        update: { name: categorySeed.labels[locale], deletedAt: null }
      });
    }

    for (const keywordSeed of categorySeed.keywords) {
      const keyword = await tx.businessKeyword.upsert({
        where: { code: keywordSeed.code },
        create: {
          code: keywordSeed.code,
          categoryId: category.id,
          qualificationPolicy: keywordSeed.qualificationPolicy,
          sortOrder: keywordSeed.sortOrder,
          isActive: true
        },
        update: {
          categoryId: category.id,
          qualificationPolicy: keywordSeed.qualificationPolicy,
          sortOrder: keywordSeed.sortOrder,
          isActive: true,
          deletedAt: null
        }
      });

      for (const locale of Object.keys(TAXONOMY_LOCALE_ENUM) as TaxonomyLocaleCode[]) {
        const localeEnum = TAXONOMY_LOCALE_ENUM[locale];
        await tx.businessKeywordTranslation.upsert({
          where: {
            businessKeywordId_locale: { businessKeywordId: keyword.id, locale: localeEnum }
          },
          create: {
            businessKeywordId: keyword.id,
            locale: localeEnum,
            label: keywordSeed.labels[locale]
          },
          update: { label: keywordSeed.labels[locale], deletedAt: null }
        });
      }
    }
  }
};
