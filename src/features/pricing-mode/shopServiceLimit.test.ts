import { describe, expect, it } from "vitest";
import { canAddShopService, SHOP_SERVICE_LIMIT } from "./shopServiceLimit";

describe("shop service limit", () => {
  it("allows the twentieth service and blocks the twenty-first", () => {
    expect(SHOP_SERVICE_LIMIT).toBe(20);
    expect(canAddShopService(19)).toBe(true);
    expect(canAddShopService(20)).toBe(false);
  });
});
