import fs from "node:fs";
import path from "node:path";

const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");

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
