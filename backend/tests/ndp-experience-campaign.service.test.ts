import type { NdpExperienceCampaignRepositoryPort } from "../src/domain/ndp-experience-campaign";
import { NdpExperienceCampaignService } from "../src/services/ndp-experience-campaign.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";

const actor: AuthenticatedAccessContext = {
  userId: 7,
  email: "operator@needo.local",
  accessTokenJti: "jti",
  accessTokenExpiresAt: 1,
  currentIdentityScopeType: "platform",
  roles: ["operator"],
  permissions: []
};

const context = { ip: "127.0.0.1", userAgent: "jest" };

const makeRepository = () => ({
  resolveCampaignAt: jest.fn(async () => null),
  listCampaigns: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
  saveDraftWithAudit: jest.fn(async () => ({ kind: "version_conflict" as const })),
  publishDraftWithAudit: jest.fn(async () => ({ kind: "version_conflict" as const })),
  archiveCampaignWithAudit: jest.fn(async () => ({ kind: "version_conflict" as const }))
}) as unknown as jest.Mocked<NdpExperienceCampaignRepositoryPort>;

describe("NdpExperienceCampaignService", () => {
  it("uses factor 1x when no published campaign covers the event", async () => {
    const service = new NdpExperienceCampaignService(makeRepository());
    await expect(service.resolveCampaignAt(new Date("2026-09-01T00:00:00Z"))).resolves.toEqual({
      factorBps: 10_000,
      versionPublicId: null
    });
  });

  it("returns the published 10x factor at the inclusive start boundary", async () => {
    const repository = makeRepository();
    repository.resolveCampaignAt.mockResolvedValueOnce({
      versionPublicId: "campaign-10x",
      version: 2,
      status: "published",
      name: "十倍活动",
      description: null,
      factorBps: 100_000,
      effectiveFrom: new Date("2026-11-30T15:00:00Z"),
      effectiveTo: new Date("2026-12-31T15:00:00Z"),
      publishedAt: new Date("2026-11-01T00:00:00Z"),
      lockVersion: 2
    });
    const service = new NdpExperienceCampaignService(repository);

    await expect(
      service.resolveCampaignAt(new Date("2026-12-01T00:00:00+09:00"))
    ).resolves.toEqual({ factorBps: 100_000, versionPublicId: "campaign-10x" });
  });

  it("rejects zero-length windows before persistence", async () => {
    const service = new NdpExperienceCampaignService(makeRepository(), {
      createInput: jest.fn((input) => input)
    } as never);
    await expect(
      service.saveDraft(actor, context, {
        expectedPublishedVersion: 1,
        expectedDraftLockVersion: null,
        name: "invalid",
        description: null,
        factorBps: 20_000,
        effectiveFrom: new Date("2026-12-01T00:00:00Z"),
        effectiveTo: new Date("2026-12-01T00:00:00Z")
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("maps overlapping or stale publication attempts to HTTP 409", async () => {
    const service = new NdpExperienceCampaignService(
      makeRepository(),
      { createInput: jest.fn((input) => input) } as never,
      () => new Date("2026-09-01T00:00:00Z")
    );
    await expect(
      service.publishDraft(actor, context, {
        versionPublicId: "campaign-v2",
        expectedVersion: 2,
        expectedLockVersion: 1
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
