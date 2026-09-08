import { describe, expect, it } from "vitest";
import { mapBookingNavigationServiceToMenuCard } from "./bookingServiceCards";

describe("mapBookingNavigationServiceToMenuCard", () => {
  it("maps the formal booking source fields without shop identity or address", () => {
    const card = mapBookingNavigationServiceToMenuCard({
      id: 42,
      name: "深层护理",
      description: "安静环境中的 90 分钟护理",
      priceAmount: "12800.00",
      currency: "JPY",
      durationMinutes: 90,
      coverUrl: "/service.jpg",
      tags: ["护理", "热门"],
      usageCount: 37
    }, "/shop-fallback.jpg");

    expect(card).toEqual({
      id: "api-booking-service-42",
      sourceServiceId: "42",
      name: "深层护理",
      subtitle: "安静环境中的 90 分钟护理",
      duration: "90 分钟",
      priceLabel: "¥12,800",
      audience: "已使用 37 次",
      tags: ["护理", "热门"],
      cover: "/service.jpg",
      highlights: []
    });
    expect(Object.keys(card)).not.toContain("shopId");
    expect(Object.keys(card)).not.toContain("address");
  });

  it("uses an empty description and the shop cover only as a visual fallback", () => {
    const card = mapBookingNavigationServiceToMenuCard({
      id: 7,
      name: "基础服务",
      description: null,
      priceAmount: "3000",
      currency: "JPY",
      durationMinutes: 30,
      coverUrl: null,
      tags: [],
      usageCount: 0
    }, "/shop.jpg");

    expect(card.subtitle).toBe("");
    expect(card.cover).toBe("/shop.jpg");
    expect(card.audience).toBe("已使用 0 次");
  });
});
