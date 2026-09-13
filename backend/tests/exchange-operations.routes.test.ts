import request from "supertest";
import type { ExchangeOperationsService } from "../src/services/exchange-operations.service";
import { createStep06Fixture } from "./helpers/step06-fixture";

const page = { list: [], total: 0, page: 2, page_size: 10 };

describe("Exchange operations read API", () => {
  it("requires JWT and the dedicated operations permission", async () => {
    const service = {
      list: jest.fn(async () => page),
      detail: jest.fn()
    } as unknown as jest.Mocked<ExchangeOperationsService>;
    const fixture = await createStep06Fixture({ exchangeOperationsService: service } as never);

    await request(fixture.app).get("/api/v1/backoffice/exchange/posts?type=demand").expect(401);
    fixture.replaceAdminPermissions(["auth:me", "auth:refresh", "auth:logout"]);
    const token = await fixture.loginAsAdmin();
    await request(fixture.app)
      .get("/api/v1/backoffice/exchange/posts?type=demand")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
    expect(service.list).not.toHaveBeenCalled();
  });

  it("validates and forwards pagination and formal filters", async () => {
    const service = {
      list: jest.fn(async () => page),
      detail: jest.fn()
    } as unknown as jest.Mocked<ExchangeOperationsService>;
    const fixture = await createStep06Fixture({ exchangeOperationsService: service } as never);
    fixture.replaceAdminPermissions([
      "auth:me",
      "auth:refresh",
      "auth:logout",
      "backoffice:exchange:read"
    ]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .get(
        "/api/v1/backoffice/exchange/posts?type=demand&status=published&match_mode=quick&publisher_identity_type=customer&keyword=%E3%83%9C%E3%83%87%E3%82%A3&page=2&page_size=10"
      )
      .set("Authorization", `Bearer ${token}`)
      .expect(200, { code: 0, message: "success", data: page });
    expect(service.list).toHaveBeenCalledWith({
      type: "demand",
      status: "published",
      matchMode: "quick",
      publisherIdentityType: "customer",
      keyword: "ボディ",
      page: 2,
      page_size: 10
    });
  });

  it("rejects invented states, unknown fields, and unbounded pages", async () => {
    const service = {
      list: jest.fn(async () => page),
      detail: jest.fn()
    } as unknown as jest.Mocked<ExchangeOperationsService>;
    const fixture = await createStep06Fixture({ exchangeOperationsService: service } as never);
    fixture.replaceAdminPermissions([
      "auth:me",
      "auth:refresh",
      "auth:logout",
      "backoffice:exchange:read"
    ]);
    const token = await fixture.loginAsAdmin();
    const auth = { Authorization: `Bearer ${token}` };

    await request(fixture.app)
      .get("/api/v1/backoffice/exchange/posts?status=rejected")
      .set(auth)
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/backoffice/exchange/posts?page_size=101")
      .set(auth)
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/backoffice/exchange/posts?unknown=1")
      .set(auth)
      .expect(400);
    expect(service.list).not.toHaveBeenCalled();
  });

  it.each(["customer", "merchant_owner", "technician"])(
    "accepts the persisted %s publisher identity filter",
    async (identityType) => {
      const service = { list: jest.fn(async () => page), detail: jest.fn() } as unknown as jest.Mocked<ExchangeOperationsService>;
      const fixture = await createStep06Fixture({ exchangeOperationsService: service } as never);
      fixture.replaceAdminPermissions(["auth:me", "auth:refresh", "auth:logout", "backoffice:exchange:read"]);
      const token = await fixture.loginAsAdmin();

      await request(fixture.app)
        .get(`/api/v1/backoffice/exchange/posts?publisher_identity_type=${identityType}&page=2&page_size=10`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ publisherIdentityType: identityType }));
    }
  );

  it("returns the persisted detail through the same permission", async () => {
    const detail = { id: 6, title: "正式需求" } as never;
    const service = {
      list: jest.fn(),
      detail: jest.fn(async () => detail)
    } as unknown as jest.Mocked<ExchangeOperationsService>;
    const fixture = await createStep06Fixture({ exchangeOperationsService: service } as never);
    fixture.replaceAdminPermissions([
      "auth:me",
      "auth:refresh",
      "auth:logout",
      "backoffice:exchange:read"
    ]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .get("/api/v1/backoffice/exchange/posts/6")
      .set("Authorization", `Bearer ${token}`)
      .expect(200, { code: 0, message: "success", data: detail });
    expect(service.detail).toHaveBeenCalledWith(6);
  });
});
