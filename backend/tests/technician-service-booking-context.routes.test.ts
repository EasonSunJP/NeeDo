import request from "supertest";
import type { TechnicianServiceBookingContextService } from "../src/services/technician-service-booking-context.service";
import { createStep06Fixture } from "./helpers/step06-fixture";

const context = {
  target: { type: "technician_service" as const, id: 701 },
  serviceCard: {
    targetType: "technician_service" as const,
    publicId: "3a4dd96e-24d9-447e-a9c2-e230b5bdc32b",
    name: "着付け",
    description: null,
    coverUrl: null,
    imageUrls: [],
    tags: [],
    catalogPriceJpy: 18_000,
    currency: "JPY" as const,
    durationMinutes: 90,
    serviceMode: "store" as const,
    serviceAreas: ["港区"],
    shopPublicId: "shop0000000011",
    shopAddress: "港区青山1-1",
    detailPath: "/stores/shop0000000011/technicians/s0000000081/services"
  },
  shopCard: {
    type: "shop" as const,
    id: 11,
    publicId: "shop0000000011",
    name: "青山ケア",
    coverUrl: null,
    imageUrls: [],
    status: "published",
    isBookable: true,
    ratingAverage: null,
    reviewCount: 0,
    address: "港区青山1-1",
    serviceMode: "store" as const,
    detailPath: "/profiles/shop/shop0000000011"
  },
  technicianCard: {
    type: "technician" as const,
    publicId: "s0000000081",
    displayName: "山田 花子",
    avatarUrl: null,
    shop: { publicId: "shop0000000011", name: "青山ケア" },
    status: "published",
    isBookable: true,
    yearsExperience: 9,
    completedOrderCount: null,
    acceptanceRatePercent: null,
    ratingAverage: null,
    reviewCount: 0,
    serviceAreas: ["港区"],
    languages: ["ja"],
    detailPath: "/profiles/technician/s0000000081",
    servicesPath: "/stores/shop0000000011/technicians/s0000000081/services"
  }
};

describe("technician service booking context route", () => {
  it("requires JWT, the existing booking:create permission, and a positive id", async () => {
    const service = {
      getContext: jest.fn(async () => context)
    } as unknown as jest.Mocked<TechnicianServiceBookingContextService>;
    const fixture = await createStep06Fixture({
      technicianServiceBookingContextService: service
    });

    await request(fixture.app)
      .get("/api/v1/technician-services/701/booking-context")
      .expect(401);
    const token = await fixture.loginAsAdmin();
    fixture.replaceAdminPermissions([]);
    await request(fixture.app)
      .get("/api/v1/technician-services/701/booking-context")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
    fixture.replaceAdminPermissions(["booking:create"]);
    await request(fixture.app)
      .get("/api/v1/technician-services/0/booking-context")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    const response = await request(fixture.app)
      .get("/api/v1/technician-services/701/booking-context")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(response.body).toEqual({ code: 0, message: "success", data: context });
    expect(service.getContext).toHaveBeenCalledWith(701);
  });
});
