import fs from "node:fs";
import path from "node:path";

const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260906120000_live_dashboard_administrative_regions/migration.sql",
  ),
  "utf8",
);

it("defines indexed region, shop assignment, and immutable booking location tables", () => {
  expect(schema).toContain("model AdministrativeRegion {");
  expect(schema).toContain("@@unique([countryCode, officialCode]");
  expect(schema).toContain("model AdministrativeRegionLocale {");
  expect(schema).toContain("@@unique([regionId, locale]");
  expect(schema).toContain("model ShopServiceLocation {");
  expect(schema).toContain("shopId             Int      @unique");
  expect(schema).toContain("model BookingServiceLocation {");
  expect(schema).toContain("bookingOrderId      Int      @unique");
  expect(schema).toContain("@@index([countryCode, admin1RegionCode, admin2RegionCode");
});

it("defines three explicitly case-sensitive country-code checks", () => {
  expect(
    migration.match(/REGEXP_LIKE\(`country_code`, '\^\[A-Z\]\{2\}\$', 'c'\)/g) ?? [],
  ).toHaveLength(3);
});

it("keeps the booking snapshot resolution checks in the executable migration", () => {
  expect(migration).toContain("booking_service_locations_verified_regions_chk");
  expect(migration).toContain("booking_service_locations_admin2_requires_admin1_chk");
});
