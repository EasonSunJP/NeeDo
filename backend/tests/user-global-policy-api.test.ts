import request from "supertest";
import { AppError } from "../src/utils/app-error";
import { ERROR_CODES } from "../src/constants/error-codes";
import { createStep06Fixture } from "./helpers/step06-fixture";

const grant = (fixture: Awaited<ReturnType<typeof createStep06Fixture>>, codes: string[]) => {
  fixture.roles[0].rolePermissions.push(
    ...codes.map((code, index) => ({
      id: 9_400 + index,
      roleId: fixture.roles[0].id,
      permissionId: 9_400 + index,
      deletedAt: null,
      permission: {
        id: 9_400 + index,
        name: code,
        code,
        type: "api" as const,
        module: "backoffice",
        description: code,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      }
    }))
  );
};

describe("user global policy and NDP campaign API", () => {
  it("accepts Japan-offset policy publication input and converts it to UTC", async () => {
    const policyService = {
      getCurrentAndDraft: jest.fn(async () => ({ current: null, draft: null })),
      saveDraft: jest.fn(
        async (_actor: unknown, _context: unknown, input: { effectiveFrom: Date }) => input
      ),
      publishDraft: jest.fn(async () => ({ version: 2 }))
    };
    const fixture = await createStep06Fixture({ userGlobalPolicyService: policyService } as never);
    grant(fixture, ["backoffice:user-policy:read", "backoffice:user-policy:publish"]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .put("/api/v1/backoffice/user-global-settings/draft")
      .set("Authorization", `Bearer ${token}`)
      .send({
        expectedCurrentVersion: 1,
        expectedDraftLockVersion: null,
        requirePhone: true,
        requireEmail: false,
        requireHomeServiceEkyc: true,
        requireStoreServiceEkyc: false,
        requireMerchantApplicationEkyc: false,
        requireTechnicianApplicationEkyc: false,
        ndpPerBaseExp: 100,
        baseExpUnitsPerThreshold: 10000,
        effectiveFrom: "2026-12-01T00:00:00+09:00"
      })
      .expect(200);

    expect(policyService.saveDraft.mock.calls[0]?.[2].effectiveFrom.toISOString()).toBe(
      "2026-11-30T15:00:00.000Z"
    );

    await request(fixture.app)
      .put("/api/v1/backoffice/user-global-settings/draft")
      .set("Authorization", `Bearer ${token}`)
      .send({
        expectedCurrentVersion: 1,
        expectedDraftLockVersion: null,
        requirePhone: true,
        requireEmail: false,
        requireHomeServiceEkyc: true,
        requireStoreServiceEkyc: false,
        requireMerchantApplicationEkyc: false,
        requireTechnicianApplicationEkyc: false,
        ndpPerBaseExp: 100,
        baseExpUnitsPerThreshold: 10000,
        effectiveFrom: "2026-12-01T00:00:00Z"
      })
      .expect(400);
  });

  it("validates campaign ranges and exposes overlap as 409", async () => {
    const campaignService = {
      listCampaigns: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
      saveDraft: jest.fn(async () => ({ version: 2 })),
      publishDraft: jest.fn(async () => {
        throw new AppError({
          code: ERROR_CODES.NDP_EXPERIENCE_CAMPAIGN_CONFLICT,
          message: "error.ndp_experience_campaign.overlap",
          statusCode: 409
        });
      }),
      archiveCampaign: jest.fn()
    };
    const fixture = await createStep06Fixture({
      ndpExperienceCampaignService: campaignService
    } as never);
    grant(fixture, [
      "backoffice:ndp-experience-campaign:read",
      "backoffice:ndp-experience-campaign:publish"
    ]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .put("/api/v1/backoffice/ndp-experience-campaigns/draft")
      .set("Authorization", `Bearer ${token}`)
      .send({
        expectedPublishedVersion: 0,
        expectedDraftLockVersion: null,
        name: "invalid",
        description: null,
        factorBps: 100000,
        effectiveFrom: "2026-12-02T00:00:00+09:00",
        effectiveTo: "2026-12-01T00:00:00+09:00"
      })
      .expect(400);

    await request(fixture.app)
      .post("/api/v1/backoffice/ndp-experience-campaigns/campaign-v2/publish")
      .set("Authorization", `Bearer ${token}`)
      .send({ expectedVersion: 2, expectedLockVersion: 1 })
      .expect(409);
  });
});
