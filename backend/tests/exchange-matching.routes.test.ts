import request from "supertest";
import type { ExchangeMatchingService } from "../src/services/exchange-matching.service";
import type { ExchangeMatchingPayload } from "../src/types/exchange-matching.types";
import { createStep06Fixture } from "./helpers/step06-fixture";

const matching: ExchangeMatchingPayload = {
  exchangePostId: 41,
  status: "open",
  version: 3,
  effectiveTargetProviderCount: 1,
  effectiveBudgetMaxJpy: 30_000,
  selectedQuoteTotalJpy: 0,
  matchedAt: null,
  participants: [],
  viewer: { canSelect: true }
};

describe("formal Exchange matching routes", () => {
  it("requires JWT and the exact read permission", async () => {
    const service = {
      getMatching: jest.fn(async () => matching),
      selectMatching: jest.fn(async () => matching)
    } as unknown as jest.Mocked<ExchangeMatchingService>;
    const fixture = await createStep06Fixture({ exchangeMatchingService: service } as never);

    await request(fixture.app).get("/api/v1/exchange/posts/41/matching").expect(401);
    fixture.replaceAdminPermissions(["auth:me", "auth:refresh", "auth:logout"]);
    const token = await fixture.loginAsAdmin();
    await request(fixture.app)
      .get("/api/v1/exchange/posts/41/matching")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("validates and forwards exact read and select commands", async () => {
    const matched = {
      ...matching,
      status: "matched" as const,
      version: 4,
      selectedQuoteTotalJpy: 15_000,
      matchedAt: "2026-09-01T01:00:00.000Z"
    };
    const service = {
      getMatching: jest.fn(async () => matching),
      selectMatching: jest.fn(async () => matched)
    } as unknown as jest.Mocked<ExchangeMatchingService>;
    const fixture = await createStep06Fixture({ exchangeMatchingService: service } as never);
    fixture.replaceAdminPermissions([
      "auth:me",
      "auth:refresh",
      "auth:logout",
      "exchange:matching:read-own",
      "exchange:matching:select-own"
    ]);
    const token = await fixture.loginAsAdmin();
    const auth = { Authorization: `Bearer ${token}` };

    await request(fixture.app)
      .get("/api/v1/exchange/posts/41/matching")
      .set(auth)
      .expect(200, { code: 0, message: "success", data: matching });
    await request(fixture.app)
      .post("/api/v1/exchange/posts/41/matching/select")
      .set(auth)
      .set("Idempotency-Key", "matching-select-route-0001")
      .send({ selectedClaimIds: [301], expectedVersion: 3 })
      .expect(200, { code: 0, message: "success", data: matched });

    expect(service.selectMatching).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, currentIdentityId: expect.any(Number) }),
      41,
      { selectedClaimIds: [301], expectedVersion: 3 },
      "matching-select-route-0001",
      expect.objectContaining({ ip: expect.any(String) })
    );
  });

  it("rejects duplicate claim ids and missing idempotency before the service", async () => {
    const service = {
      getMatching: jest.fn(async () => matching),
      selectMatching: jest.fn(async () => matching)
    } as unknown as jest.Mocked<ExchangeMatchingService>;
    const fixture = await createStep06Fixture({ exchangeMatchingService: service } as never);
    fixture.replaceAdminPermissions([
      "auth:me",
      "auth:refresh",
      "auth:logout",
      "exchange:matching:select-own"
    ]);
    const token = await fixture.loginAsAdmin();
    const auth = { Authorization: `Bearer ${token}` };

    await request(fixture.app)
      .post("/api/v1/exchange/posts/41/matching/select")
      .set(auth)
      .send({ selectedClaimIds: [301], expectedVersion: 3 })
      .expect(400);
    await request(fixture.app)
      .post("/api/v1/exchange/posts/41/matching/select")
      .set(auth)
      .set("Idempotency-Key", "matching-select-route-0001")
      .send({ selectedClaimIds: [301, 301], expectedVersion: 3 })
      .expect(400);
    expect(service.selectMatching).not.toHaveBeenCalled();
  });
});
