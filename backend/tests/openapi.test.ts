import request from "supertest";
import { createApp } from "../src/app";

describe("GET /api/v1/openapi.json", () => {
  it("describes the health endpoint with the versioned API prefix", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);

    expect(response.body.openapi).toBe("3.1.0");
    expect(response.body.paths).toHaveProperty("/api/v1/health");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/login");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/otp/send");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/otp/verify");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/refresh");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/logout");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/me");
    expect(response.body.paths).toHaveProperty("/api/v1/permissions");
    expect(response.body.paths).toHaveProperty("/api/v1/permissions/tree");
    expect(response.body.paths).toHaveProperty("/api/v1/permissions/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/roles");
    expect(response.body.paths).toHaveProperty("/api/v1/roles/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/roles/{id}/permissions");
    expect(response.body.paths).toHaveProperty("/api/v1/users");
    expect(response.body.paths).toHaveProperty("/api/v1/users/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/users/{id}/enable");
    expect(response.body.paths).toHaveProperty("/api/v1/users/{id}/disable");
    expect(response.body.paths).toHaveProperty("/api/v1/users/{id}/roles");
    expect(response.body.paths).toHaveProperty("/api/v1/categories");
    expect(response.body.paths).toHaveProperty("/api/v1/services");
    expect(response.body.paths).toHaveProperty("/api/v1/services/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/home/recommendations");
    expect(response.body.paths).toHaveProperty("/api/v1/search");
    expect(response.body.paths).toHaveProperty("/api/v1/shops/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/technicians/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/profiles/customers/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/schedule/availability");
    expect(response.body.paths).toHaveProperty("/api/v1/bookings");
    expect(response.body.paths).toHaveProperty("/api/v1/orders");
    expect(response.body.paths).toHaveProperty("/api/v1/orders/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/orders/{id}/confirm");
    expect(response.body.paths).toHaveProperty("/api/v1/orders/{id}/cancel");
    expect(response.body.paths).toHaveProperty("/api/v1/orders/{id}/start");
    expect(response.body.paths).toHaveProperty("/api/v1/orders/{id}/complete");
    expect(response.body.components.schemas).toHaveProperty("ServiceCard");
    expect(response.body.components.schemas).toHaveProperty("ShopDetail");
    expect(response.body.components.schemas).toHaveProperty("CustomerProfile");
    expect(response.body.components.schemas).toHaveProperty("ScheduleSlot");
    expect(response.body.components.schemas).toHaveProperty("BookingOrder");
  });
});
