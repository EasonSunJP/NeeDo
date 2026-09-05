import request from "supertest";
import type { ExchangeCancellationService } from "../src/services/exchange-cancellation.service";
import { createStep06Fixture } from "./helpers/step06-fixture";

const payload = {
  orderId: 501,
  orderStatus: "pending" as const,
  viewerParty: "customer" as const,
  allowedActions: ["request" as const],
  cancellation: null
};

const permissions = ["auth:me", "auth:refresh", "auth:logout"];

describe("formal Exchange bilateral cancellation routes", () => {
  it("requires JWT and the exact read permission", async () => {
    const service = {
      getCancellation: jest.fn(async () => payload),
      requestCancellation: jest.fn(async () => payload),
      decideCancellation: jest.fn(async () => payload)
    } as unknown as jest.Mocked<ExchangeCancellationService>;
    const fixture = await createStep06Fixture({ exchangeCancellationService: service } as never);

    await request(fixture.app).get("/api/v1/exchange/orders/501/cancellation").expect(401);
    fixture.replaceAdminPermissions(permissions);
    const token = await fixture.loginAsAdmin();
    await request(fixture.app)
      .get("/api/v1/exchange/orders/501/cancellation")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
    expect(service.getCancellation).not.toHaveBeenCalled();
  });

  it("reads cancellation state without requiring an idempotency key", async () => {
    const service = {
      getCancellation: jest.fn(async () => payload),
      requestCancellation: jest.fn(async () => payload),
      decideCancellation: jest.fn(async () => payload)
    } as unknown as jest.Mocked<ExchangeCancellationService>;
    const fixture = await createStep06Fixture({ exchangeCancellationService: service } as never);
    fixture.replaceAdminPermissions([...permissions, "exchange:cancellation:read-own"]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .get("/api/v1/exchange/orders/501/cancellation")
      .set("Authorization", `Bearer ${token}`)
      .expect(200, { code: 0, message: "success", data: payload });
    expect(service.getCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, currentIdentityId: expect.any(Number) }),
      501
    );
  });

  it("requires write permission and idempotency for every command", async () => {
    const service = {
      getCancellation: jest.fn(async () => payload),
      requestCancellation: jest.fn(async () => payload),
      decideCancellation: jest.fn(async () => payload)
    } as unknown as jest.Mocked<ExchangeCancellationService>;
    const fixture = await createStep06Fixture({ exchangeCancellationService: service } as never);
    fixture.replaceAdminPermissions([...permissions, "exchange:cancellation:read-own"]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .post("/api/v1/exchange/orders/501/cancellation/requests")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "idem-cancel-000001")
      .send({ expectedVersion: 0, reason: "time conflict" })
      .expect(403);

    fixture.replaceAdminPermissions([...permissions, "exchange:cancellation:write-own"]);
    const writeToken = await fixture.loginAsAdmin();
    await request(fixture.app)
      .post("/api/v1/exchange/orders/501/cancellation/accept")
      .set("Authorization", `Bearer ${writeToken}`)
      .send({ expectedVersion: 1 })
      .expect(400);
    expect(service.requestCancellation).not.toHaveBeenCalled();
    expect(service.decideCancellation).not.toHaveBeenCalled();
  });

  it("validates and forwards request, accept, reject, and withdraw commands", async () => {
    const service = {
      getCancellation: jest.fn(async () => payload),
      requestCancellation: jest.fn(async () => payload),
      decideCancellation: jest.fn(async () => payload)
    } as unknown as jest.Mocked<ExchangeCancellationService>;
    const fixture = await createStep06Fixture({ exchangeCancellationService: service } as never);
    fixture.replaceAdminPermissions([...permissions, "exchange:cancellation:write-own"]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .post("/api/v1/exchange/orders/501/cancellation/requests")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "idem-cancel-000001")
      .send({ expectedVersion: 0, reason: "  time conflict  " })
      .expect(200);
    expect(service.requestCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1 }),
      501,
      { expectedVersion: 0, reason: "time conflict" },
      "idem-cancel-000001",
      expect.objectContaining({ ip: expect.any(String) })
    );

    for (const action of ["accept", "reject", "withdraw"] as const) {
      await request(fixture.app)
        .post(`/api/v1/exchange/orders/501/cancellation/${action}`)
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", `idem-cancel-${action}`)
        .send({ expectedVersion: 1 })
        .expect(200, { code: 0, message: "success", data: payload });
      expect(service.decideCancellation).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1 }),
        501,
        action,
        { expectedVersion: 1 },
        `idem-cancel-${action}`,
        expect.objectContaining({ ip: expect.any(String) })
      );
    }
  });

  it.each([
    ["/api/v1/exchange/orders/0/cancellation/requests", { expectedVersion: 0, reason: "x" }],
    ["/api/v1/exchange/orders/501/cancellation/requests", { expectedVersion: 0, reason: "" }],
    ["/api/v1/exchange/orders/501/cancellation/requests", { expectedVersion: 0, reason: "x", party: "customer" }],
    ["/api/v1/exchange/orders/501/cancellation/accept", { expectedVersion: 0 }],
    ["/api/v1/exchange/orders/501/cancellation/reject", { expectedVersion: 1, actorUserId: 1 }]
  ])("rejects invalid params or body before the service: %s", async (url, body) => {
    const service = {
      getCancellation: jest.fn(async () => payload),
      requestCancellation: jest.fn(async () => payload),
      decideCancellation: jest.fn(async () => payload)
    } as unknown as jest.Mocked<ExchangeCancellationService>;
    const fixture = await createStep06Fixture({ exchangeCancellationService: service } as never);
    fixture.replaceAdminPermissions([...permissions, "exchange:cancellation:write-own"]);
    const token = await fixture.loginAsAdmin();
    await request(fixture.app)
      .post(url)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "idem-cancel-000099")
      .send(body)
      .expect(400);
    expect(service.requestCancellation).not.toHaveBeenCalled();
    expect(service.decideCancellation).not.toHaveBeenCalled();
  });
});
