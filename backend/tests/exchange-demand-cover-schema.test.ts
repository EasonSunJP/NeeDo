import { readFileSync } from "node:fs";

describe("Exchange demand cover schema", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const migration = readFileSync(
    "prisma/migrations/20260923120000_exchange_demand_cover_image/migration.sql",
    "utf8"
  );

  it("adds one optional restrictive cover relation without changing historical rows", () => {
    expect(schema).toMatch(/coverMediaAssetId\s+Int\?\s+@unique/);
    expect(schema).toMatch(/coverMediaAsset\s+MediaAsset\?[^\n]*onDelete: Restrict/);
    expect(schema).toMatch(/exchangeDemandCover\s+ExchangeDemand\?/);
    expect(migration).toContain("ADD COLUMN `cover_media_asset_id` INTEGER NULL");
    expect(migration).toContain("ON DELETE RESTRICT ON UPDATE CASCADE");
  });
});
