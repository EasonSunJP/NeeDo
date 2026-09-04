import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("order review shop summary backfill", () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      "../prisma/migrations/20260903170000_order_review_shop_summary/migration.sql"
    ),
    "utf8"
  );

  it("uses only live technician-target order reviews and live booking orders", () => {
    expect(sql).toContain("`review`.`target_type` = 'technician'");
    expect(sql).toContain("`review`.`deleted_at` IS NULL");
    expect(sql).toContain("`booking_order`.`deleted_at` IS NULL");
  });

  it("updates an existing shop summary and inserts only a missing one", () => {
    expect(sql).toContain("UPDATE `review_summaries` AS `summary`");
    expect(sql).toContain("`summary`.`target_type` = 'shop'");
    expect(sql).toContain("INSERT INTO `review_summaries`");
    expect(sql).toContain("WHERE NOT EXISTS");
    expect(sql).toContain("ROUND(AVG(`review`.`rating`), 2)");
    expect(sql).toContain("COUNT(*) AS `review_count`");
  });
});
