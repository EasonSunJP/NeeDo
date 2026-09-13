import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("shop visibility route contract", () => {
  const route = readFileSync(
    join(process.cwd(), "src/routes/shop-visibility.routes.ts"),
    "utf8"
  );

  it("protects read and update with existing merchant shop permissions", () => {
    expect(route).toContain('read: "merchant-admin:shop:read"');
    expect(route).toContain('write: "merchant-admin:shop:write"');
    expect(route).toMatch(/router\.get\([\s\S]*?"\/merchant-admin\/shops\/:shopId\/visibility"[\s\S]*?authenticate\(\)[\s\S]*?permissions\.read/);
    expect(route).toMatch(/router\.put\([\s\S]*?"\/merchant-admin\/shops\/:shopId\/visibility"[\s\S]*?authenticate\(\)[\s\S]*?permissions\.write/);
  });

  it("validates the route parameter and closed visibility enum before the controller", () => {
    expect(route).toContain("shopVisibilityParamsSchema");
    expect(route).toContain("shopVisibilityBodySchema");
    expect(route).toContain("validateRequest");
  });
});
