import request from "supertest";
import { createStep06Fixture } from "./helpers/step06-fixture";
import type { SosService } from "../src/services/sos.service";
describe("SOS authenticated API contract", () => {
  async function fixture(permissions = ["sos:create", "sos:list", "sos:resolve"]) {
    const service = {
      availability: jest.fn(async () => ({
        canSend: true,
        serverNow: "2026-09-06T00:00:00.000Z",
        expiresAt: null,
        activeAlertId: null
      })),
      send: jest.fn(async () => ({ alert: { id: 1, status: "pending" }, replayed: false })),
      list: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
      count: jest.fn(async () => ({ pending: 2 })),
      resolve: jest.fn(async () => ({ alert: { id: 1, status: "resolved" }, replayed: false }))
    };
    const f = await createStep06Fixture({ sosService: service as unknown as SosService });
    f.replaceAdminPermissions(permissions);
    return { ...f, service, token: await f.loginAsAdmin() };
  }
  test("rejects unauthenticated and missing permission", async () => {
    const f = await fixture([]);
    await request(f.app).get("/api/v1/sos-alerts/count").expect(401);
    await request(f.app)
      .get("/api/v1/sos-alerts/count")
      .set("Authorization", `Bearer ${f.token}`)
      .expect(403);
    expect(f.service.count).not.toHaveBeenCalled();
  });
  test("validates positive order id, idempotency key, unknown body, bounded pagination", async () => {
    const f = await fixture();
    for (const [url, body] of [
      ["/api/v1/bookings/0/sos", { idempotencyKey: "abcdefghi" }],
      ["/api/v1/bookings/1/sos", {}],
      ["/api/v1/bookings/1/sos", { idempotencyKey: "abcdefghi", senderUserId: 2 }]
    ] as const)
      await request(f.app)
        .post(url)
        .set("Authorization", `Bearer ${f.token}`)
        .send(body)
        .expect(400);
    await request(f.app)
      .get("/api/v1/sos-alerts?page_size=101")
      .set("Authorization", `Bearer ${f.token}`)
      .expect(400);
    expect(f.service.send).not.toHaveBeenCalled();
  });
  test("returns envelope, normalized page_size and explicit commands", async () => {
    const f = await fixture();
    const auth = { Authorization: `Bearer ${f.token}` };
    const availability = await request(f.app)
      .get("/api/v1/bookings/12/sos-availability")
      .set(auth)
      .expect(200);
    expect(availability.body.data.canSend).toBe(true);
    await request(f.app)
      .post("/api/v1/bookings/12/sos")
      .set(auth)
      .send({ idempotencyKey: "sos-key-123" })
      .expect(200);
    expect(f.service.send).toHaveBeenCalledWith(
      12,
      "sos-key-123",
      expect.any(Object),
      expect.any(Object)
    );
    await request(f.app)
      .get("/api/v1/sos-alerts?status=pending&page=2&page_size=10")
      .set(auth)
      .expect(200);
    expect(f.service.list).toHaveBeenCalledWith(
      { status: "pending", page: 2, page_size: 10 },
      expect.any(Object)
    );
    expect(f.service.resolve).not.toHaveBeenCalled();
    await request(f.app).post("/api/v1/sos-alerts/1/resolve").set(auth).send({}).expect(200);
  });
});
