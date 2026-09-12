import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("customer address persistence schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

  it("stores checkout-compatible Japanese addresses under a customer profile", () => {
    expect(schema).toMatch(/model CustomerAddress \{/u);
    for (const field of [
      "publicId",
      "customerProfileId",
      "label",
      "countryCode",
      "postalCode",
      "admin1Code",
      "prefecture",
      "admin2Code",
      "city",
      "addressLine1",
      "addressLine2",
      "building",
      "isDefault",
      "createdAt",
      "updatedAt",
      "deletedAt"
    ]) {
      expect(schema).toMatch(new RegExp(`\\b${field}\\b`, "u"));
    }
    expect(schema).toContain('@@map("customer_addresses")');
  });
});
