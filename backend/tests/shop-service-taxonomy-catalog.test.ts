import {
  SHOP_SERVICE_TAXONOMY,
  TAXONOMY_LOCALES,
  type TaxonomyLocaleCode
} from "../prisma/catalogs/shop-service-taxonomy";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("approved shop service taxonomy catalog", () => {
  it("contains the approved stable category order", () => {
    expect(SHOP_SERVICE_TAXONOMY.map((category) => category.code)).toEqual([
      "massage",
      "wellness",
      "business",
      "pet",
      "cleaning",
      "dining",
      "repair",
      "medical_beauty",
      "photography",
      "secondhand_recycling",
      "luxury_goods",
      "moving_delivery",
      "beauty",
      "maternity_childcare",
      "care",
      "education_coaching",
      "legal_professional",
      "events_conferences"
    ]);
  });

  it("contains 18 categories, ten unique keywords per category, and 180 total", () => {
    expect(SHOP_SERVICE_TAXONOMY).toHaveLength(18);
    const categoryCodes = new Set<string>();
    const keywordCodes = new Set<string>();

    for (const category of SHOP_SERVICE_TAXONOMY) {
      expect(categoryCodes.has(category.code)).toBe(false);
      categoryCodes.add(category.code);
      expect(category.keywords).toHaveLength(10);
      expect(category.sortOrder).toBe(categoryCodes.size);

      category.keywords.forEach((keyword, index) => {
        expect(keywordCodes.has(keyword.code)).toBe(false);
        keywordCodes.add(keyword.code);
        expect(keyword.sortOrder).toBe(index + 1);
      });
    }

    expect(keywordCodes.size).toBe(180);
  });

  it("provides exactly five non-empty authoritative labels on every record", () => {
    const assertLabels = (labels: Record<TaxonomyLocaleCode, string>) => {
      expect(Object.keys(labels).sort()).toEqual([...TAXONOMY_LOCALES].sort());
      for (const locale of TAXONOMY_LOCALES) {
        expect(labels[locale].trim().length).toBeGreaterThan(0);
      }
    };

    for (const category of SHOP_SERVICE_TAXONOMY) {
      assertLabels(category.labels);
      for (const keyword of category.keywords) {
        assertLabels(keyword.labels);
        for (const locale of TAXONOMY_LOCALES) {
          expect(keyword.labels[locale]).not.toBe(category.labels[locale]);
        }
      }
    }
  });

  it("keeps the approved category qualification policies", () => {
    expect(
      Object.fromEntries(
        SHOP_SERVICE_TAXONOMY.map(({ code, qualificationPolicy }) => [code, qualificationPolicy])
      )
    ).toEqual({
      massage: "PLATFORM_REVIEW",
      wellness: "OPEN",
      business: "OPEN",
      pet: "OPEN",
      cleaning: "OPEN",
      dining: "CONDITIONAL",
      repair: "CONDITIONAL",
      medical_beauty: "QUALIFICATION_REVIEW",
      photography: "OPEN",
      secondhand_recycling: "CONDITIONAL",
      luxury_goods: "CONDITIONAL",
      moving_delivery: "CONDITIONAL",
      beauty: "CONDITIONAL",
      maternity_childcare: "QUALIFICATION_REVIEW",
      care: "QUALIFICATION_REVIEW",
      education_coaching: "CONDITIONAL",
      legal_professional: "QUALIFICATION_REVIEW",
      events_conferences: "CONDITIONAL"
    });
  });

  it("seeds the catalog idempotently without recreating categories or granting qualifications", () => {
    const seedSource = readFileSync(resolve(process.cwd(), "prisma/seed.ts"), "utf8");

    expect(seedSource).toContain("SHOP_SERVICE_TAXONOMY");
    expect(seedSource).toContain("tx.category.upsert");
    expect(seedSource).toContain("tx.categoryTranslation.upsert");
    expect(seedSource).toContain("tx.businessKeyword.upsert");
    expect(seedSource).toContain("tx.businessKeywordTranslation.upsert");
    expect(seedSource).not.toContain("tx.shopServiceQualification.create");
    expect(seedSource).not.toContain("tx.shopServiceCategory.create");
    expect(seedSource).not.toContain("tx.shopBusinessKeyword.create");
  });
});
