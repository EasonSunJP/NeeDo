import {
  assertShopServiceQuota,
  SHOP_SERVICE_LIMIT
} from "../src/services/shop-service-policy";

describe("shop service quota", () => {
  it("allows at most twenty non-deleted services", () => {
    expect(SHOP_SERVICE_LIMIT).toBe(20);
    expect(() => assertShopServiceQuota(20)).not.toThrow();
    expect(() => assertShopServiceQuota(21)).toThrow(
      expect.objectContaining({ message: "error.service.limit_reached", statusCode: 409 })
    );
  });
});
