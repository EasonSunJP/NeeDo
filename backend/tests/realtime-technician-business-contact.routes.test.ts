import request from "supertest";
import type { RealtimeService } from "../src/services/realtime.service";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("technician booking contact conversation route", () => {
  it("requires conversation:create and returns the formal temporary conversation", async () => {
    const result = {
      conversationId: 92,
      expiresAt: "2026-09-22T03:00:00.000Z"
    };
    const service = {
      ensureTechnicianBusinessConversation: jest.fn(async () => result)
    } as unknown as jest.Mocked<RealtimeService>;
    const fixture = await createStep06Fixture({ realtimeService: service });

    await request(fixture.app)
      .post("/api/v1/im/business-conversations/technicians/s0000000052")
      .expect(401);
    const token = await fixture.loginAsAdmin();
    fixture.replaceAdminPermissions([]);
    await request(fixture.app)
      .post("/api/v1/im/business-conversations/technicians/s0000000052")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
    fixture.replaceAdminPermissions(["conversation:create"]);
    await request(fixture.app)
      .post("/api/v1/im/business-conversations/technicians/not-a-technician")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    const response = await request(fixture.app)
      .post("/api/v1/im/business-conversations/technicians/s0000000052")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(response.body).toEqual({ code: 0, message: "success", data: result });
    expect(service.ensureTechnicianBusinessConversation).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(Number) }),
      "s0000000052"
    );
  });
});

describe("shop booking contact conversation route", () => {
  it("uses the same conversation permission and validates the shop and optional technician", async () => {
    const result = { conversationId: 94, expiresAt: null };
    const service = { ensureShopBookingContactConversation: jest.fn(async () => result) } as unknown as jest.Mocked<RealtimeService>;
    const fixture = await createStep06Fixture({ realtimeService: service });
    const token = await fixture.loginAsAdmin();
    fixture.replaceAdminPermissions(["conversation:create"]);
    await request(fixture.app).post("/api/v1/im/business-conversations/shops/invalid").set("Authorization", `Bearer ${token}`).send({}).expect(400);
    await request(fixture.app).post("/api/v1/im/business-conversations/shops/36").set("Authorization", `Bearer ${token}`).send({ nominatedTechnicianProfileId: -1 }).expect(400);
    const response = await request(fixture.app).post("/api/v1/im/business-conversations/shops/36").set("Authorization", `Bearer ${token}`).send({ nominatedTechnicianProfileId: 19 }).expect(200);
    expect(response.body.data).toEqual(result);
    expect(service.ensureShopBookingContactConversation).toHaveBeenCalledWith(expect.objectContaining({ userId: expect.any(Number) }), 36, 19);
  });
});
