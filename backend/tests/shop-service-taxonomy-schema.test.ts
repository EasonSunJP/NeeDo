import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("shop service taxonomy persistence", () => {
  const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = resolve(
    process.cwd(),
    "prisma/migrations/20260901040000_shop_service_taxonomy/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  it("defines the localized catalog, shop selections, application selections, and command state", () => {
    for (const token of [
      "enum TaxonomyLocale",
      "enum BusinessQualificationPolicy",
      "enum ShopServiceQualificationStatus",
      "model CategoryTranslation",
      "model BusinessKeyword",
      "model BusinessKeywordTranslation",
      "model ShopServiceCategory",
      "model ShopBusinessKeyword",
      "model ShopServiceTaxonomyState",
      "model ShopServiceTaxonomyCommand",
      "model ShopServiceQualification",
      "model MerchantApplicationServiceCategory",
      "model MerchantApplicationBusinessKeyword"
    ]) {
      expect(schema).toContain(token);
    }
  });

  it("keeps localized labels and active selections unique", () => {
    for (const token of [
      "category_translations_category_id_locale_key",
      "business_keyword_translations_keyword_id_locale_key",
      "business_keywords_code_key",
      "shop_service_categories_active_key_key",
      "shop_business_keywords_active_key_key",
      "merchant_application_service_categories_active_key_key",
      "merchant_application_business_keywords_active_key_key",
      "shop_service_taxonomy_commands_shop_id_idempotency_key_key"
    ]) {
      expect(migration).toContain(token);
    }
  });

  it("adds qualification shape and positive version constraints plus read indexes", () => {
    for (const token of [
      "shop_service_qualifications_target_check",
      "shop_service_taxonomy_states_version_check",
      "business_keywords_category_active_sort_idx",
      "shop_service_categories_shop_deleted_idx",
      "shop_business_keywords_shop_deleted_idx",
      "merchant_application_service_categories_application_deleted_idx",
      "merchant_application_business_keywords_application_deleted_idx"
    ]) {
      expect(migration).toContain(token);
    }
  });

  it("creates all foreign keys and standard timestamps/soft delete columns", () => {
    const tableNames = [
      "category_translations",
      "business_keywords",
      "business_keyword_translations",
      "shop_service_categories",
      "shop_business_keywords",
      "shop_service_taxonomy_states",
      "shop_service_taxonomy_commands",
      "shop_service_qualifications",
      "merchant_application_service_categories",
      "merchant_application_business_keywords"
    ];

    for (const tableName of tableNames) {
      const tablePattern = new RegExp(
        "CREATE TABLE `" +
          tableName +
          "` \\([\\s\\S]*?`created_at`[\\s\\S]*?`updated_at`[\\s\\S]*?`deleted_at`[\\s\\S]*?\\) DEFAULT",
        "i"
      );
      expect(migration).toMatch(tablePattern);
    }

    expect((migration.match(/ADD CONSTRAINT .* FOREIGN KEY/g) ?? []).length).toBeGreaterThanOrEqual(22);
  });
});
