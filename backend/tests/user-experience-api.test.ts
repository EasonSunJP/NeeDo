import request from "supertest";
import { createStep06Fixture } from "./helpers/step06-fixture";

const summary = {
  level: 30,
  totalExp: "2194.5",
  currentLevelExp: "0.5",
  nextLevelExp: "138",
  progressBps: 36
};

const entry = {
  publicId: "experience-entry-1",
  eventType: "service_completed",
  sourceType: "booking_order",
  sourcePublicId: "ND202609010007",
  baseExp: "10",
  campaignFactorBps: 10_000,
  membershipMultiplierBps: 50_000,
  extraExp: "0",
  finalExp: "50",
  membershipTierCode: "gold",
  membershipTierVersionId: "tier-version-1",
  policyVersionId: null,
  campaignVersionId: null,
  occurredAt: "2026-09-01T09:30:00.000Z"
};

const createService = () => ({
  recordEvent: jest.fn(async () => ({ status: "ineligible" as const, account: null })),
  getSummary: jest.fn(async () => summary),
  listEntries: jest.fn(async () => ({
    list: [entry],
    total: 1,
    page: 1,
    page_size: 20
  }))
});

describe("user experience read APIs", () => {
  it("returns the authenticated customer's bounded level summary", async () => {
    const service = createService();
    const fixture = await createStep06Fixture({ userExperienceService: service } as never);
    const token = await fixture.loginAsAdmin();

    const response = await request(fixture.app)
      .get("/api/v1/me/experience")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toEqual(summary);
    expect(service.getSummary).toHaveBeenCalledWith(1);
  });

  it("paginates safe backoffice entries behind the formal permission", async () => {
    const service = createService();
    const fixture = await createStep06Fixture({ userExperienceService: service } as never);
    fixture.replaceAdminPermissions(["backoffice:user-experience:read"]);
    const token = await fixture.loginAsAdmin();

    const response = await request(fixture.app)
      .get("/api/v1/backoffice/users/2/experience-entries?page=1&pageSize=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toEqual({ list: [entry], total: 1, page: 1, page_size: 20 });
    expect(service.listEntries).toHaveBeenCalledWith(2, { page: 1, pageSize: 20 });
    expect(JSON.stringify(response.body.data)).not.toContain("idempotencyKey");
    expect(JSON.stringify(response.body.data)).not.toContain("reversalOfEntryId");
  });

  it("denies backoffice history without permission and validates pagination", async () => {
    const service = createService();
    const fixture = await createStep06Fixture({ userExperienceService: service } as never);
    fixture.replaceAdminPermissions(["permission:list"]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .get("/api/v1/backoffice/users/2/experience-entries")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);

    fixture.replaceAdminPermissions(["backoffice:user-experience:read"]);
    const permittedToken = await fixture.loginAsAdmin();
    await request(fixture.app)
      .get("/api/v1/backoffice/users/2/experience-entries?page=0&pageSize=101")
      .set("Authorization", `Bearer ${permittedToken}`)
      .expect(400);
  });
});
