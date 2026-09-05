import request from "supertest";
import type { ExchangeIntelligenceServiceService } from "../src/services/exchange-intelligence-service.service";
import { createStep06Fixture } from "./helpers/step06-fixture";

const option = {
  serviceRef: "shop:501" as const,
  ownerType: "shop" as const,
  name: "訪問ヘアセット",
  durationMinutes: 60,
  catalogPriceJpy: 12000,
  currency: "JPY" as const,
  serviceMode: "home",
  available: true as const,
  shop: {
    publicId: "shop00000011",
    name: "青山ケア",
    city: "東京都",
    address: "港区青山1-1"
  },
  technician: null
};

describe("formal Exchange Intelligence service option route", () => {
  it("requires JWT, the exact permission, and strict pagination", async () => {
    const service = {
      listOptions: jest.fn(async () => ({ list: [option], total: 1, page: 1, page_size: 20 }))
    } as unknown as jest.Mocked<ExchangeIntelligenceServiceService>;
    const fixture = await createStep06Fixture({ exchangeIntelligenceServiceService: service });

    await request(fixture.app)
      .get("/api/v1/exchange/intelligence/service-options")
      .expect(401);

    const token = await fixture.loginAsAdmin();
    fixture.replaceAdminPermissions([]);
    await request(fixture.app)
      .get("/api/v1/exchange/intelligence/service-options")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);

    fixture.replaceAdminPermissions(["exchange:intelligence:service-options:list"]);
    await request(fixture.app)
      .get("/api/v1/exchange/intelligence/service-options?page=0")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    const response = await request(fixture.app)
      .get("/api/v1/exchange/intelligence/service-options?page=1&page_size=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      code: 0,
      message: "success",
      data: { list: [option], total: 1, page: 1, page_size: 20 }
    });
    expect(service.listOptions).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, currentIdentityType: "platform" }),
      { page: 1, page_size: 20 }
    );
  });
});
