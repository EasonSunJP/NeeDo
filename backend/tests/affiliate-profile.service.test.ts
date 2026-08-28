import type { AuditLogCreateInput } from "../src/repositories/audit-log.repository";
import type {
  AffiliateProfilePayload,
  AffiliateProfileRepositoryPort
} from "../src/repositories/affiliate-profile.repository";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../src/services/auth.service";
import type { AuditLogRecordInput } from "../src/services/audit-log.service";
import { AffiliateChannelUrlService } from "../src/services/affiliate-channel-url.service";
import { AffiliateProfileService } from "../src/services/affiliate-profile.service";

const now = "2026-08-28T09:00:00.000Z";
const profile: AffiliateProfilePayload = {
  profileId: 51,
  needoId: "u0000000007",
  displayName: "山本太郎",
  avatarUrl: null,
  affiliateStatus: "active",
  cooperationStatus: "available",
  version: 3,
  bio: "美容サービスを紹介します",
  strengths: ["美容"],
  serviceAreas: ["東京都"],
  channels: [
    {
      channelId: 71,
      platform: "instagram",
      customLabel: null,
      homepageUrl: "https://instagram.com/needo",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now
    }
  ],
  updatedAt: now
};

const actor = {
  userId: 7,
  currentIdentityType: "scout",
  roles: ["scout"],
  permissions: ["page:affiliate-profile", "button:affiliate-profile-edit"]
} as AuthenticatedAccessContext;
const context: AuthRequestContext = { ip: "127.0.0.1", userAgent: "jest" };

const createRepository = (): jest.Mocked<AffiliateProfileRepositoryPort> => ({
  findMine: jest.fn(),
  updateMine: jest.fn(),
  createChannel: jest.fn(),
  updateChannel: jest.fn(),
  deleteChannel: jest.fn()
});

const createAudit = () => ({
  createInput: jest.fn(
    (input: AuditLogRecordInput): AuditLogCreateInput => ({
      actorId: input.actor.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      ip: input.context.ip,
      userAgent: input.context.userAgent,
      metadata: input.metadata
    })
  )
});

describe("AffiliateProfileService", () => {
  it("requires the active affiliate identity before repository access", async () => {
    const repository = createRepository();
    const service = new AffiliateProfileService(
      repository,
      createAudit(),
      new AffiliateChannelUrlService()
    );

    await expect(
      service.getMine({ ...actor, currentIdentityType: "customer" })
    ).rejects.toMatchObject({
      message: "error.affiliate_profile.identity_required",
      statusCode: 403
    });
    expect(repository.findMine).not.toHaveBeenCalled();
  });

  it("returns the current user's public affiliate profile", async () => {
    const repository = createRepository();
    repository.findMine.mockResolvedValue(profile);
    const service = new AffiliateProfileService(
      repository,
      createAudit(),
      new AffiliateChannelUrlService()
    );

    await expect(service.getMine(actor)).resolves.toEqual(profile);
    expect(repository.findMine).toHaveBeenCalledWith(7);
    expect(JSON.stringify(await service.getMine(actor))).not.toContain('"userId"');
  });

  it("normalizes profile arrays and audits changed field names only", async () => {
    const repository = createRepository();
    const audit = createAudit();
    repository.findMine.mockResolvedValue(profile);
    repository.updateMine.mockResolvedValue({
      ...profile,
      version: 4,
      strengths: ["美容", "旅行"],
      serviceAreas: ["東京都", "大阪府"]
    });
    const service = new AffiliateProfileService(
      repository,
      audit,
      new AffiliateChannelUrlService()
    );

    await service.updateMine(actor, context, {
      expectedVersion: 3,
      strengths: [" 美容 ", "美容", "旅行"],
      serviceAreas: ["東京都", " 東京都 ", "大阪府"]
    });

    expect(repository.updateMine).toHaveBeenCalledWith(
      7,
      3,
      {
        strengths: ["美容", "旅行"],
        serviceAreas: ["東京都", "大阪府"]
      },
      expect.objectContaining({
        action: "affiliate_profile.updated",
        targetId: 51,
        metadata: { changedFields: ["serviceAreas", "strengths"] }
      })
    );
    expect(JSON.stringify(audit.createInput.mock.calls[0]?.[0].metadata)).not.toContain("東京都");
  });

  it("blocks mutations while the affiliate profile is suspended", async () => {
    const repository = createRepository();
    repository.findMine.mockResolvedValue({ ...profile, affiliateStatus: "suspended" });
    const service = new AffiliateProfileService(
      repository,
      createAudit(),
      new AffiliateChannelUrlService()
    );

    await expect(
      service.updateMine(actor, context, { expectedVersion: 3, bio: "更新" })
    ).rejects.toMatchObject({
      message: "error.affiliate_profile.not_found",
      statusCode: 404
    });
    expect(repository.updateMine).not.toHaveBeenCalled();
  });

  it("normalizes an external homepage before creating the channel", async () => {
    const repository = createRepository();
    repository.findMine.mockResolvedValue(profile);
    repository.createChannel.mockResolvedValue({ ...profile, version: 4 });
    const service = new AffiliateProfileService(
      repository,
      createAudit(),
      new AffiliateChannelUrlService()
    );

    await service.createChannel(actor, context, {
      expectedProfileVersion: 3,
      platform: "instagram",
      homepageUrl: "https://Instagram.com/needo/#bio",
      sortOrder: 2
    });

    expect(repository.createChannel).toHaveBeenCalledWith(
      7,
      3,
      {
        platform: "instagram",
        customLabel: null,
        homepageUrl: "https://instagram.com/needo/",
        sortOrder: 2
      },
      expect.objectContaining({
        action: "affiliate_profile.channel_created",
        metadata: { changedFields: ["customLabel", "homepageUrl", "platform", "sortOrder"] }
      })
    );
  });

  it("enforces the ten-channel limit before persistence", async () => {
    const repository = createRepository();
    repository.findMine.mockResolvedValue({
      ...profile,
      channels: Array.from({ length: 10 }, (_, index) => ({
        ...profile.channels[0],
        channelId: index + 1
      }))
    });
    const service = new AffiliateProfileService(
      repository,
      createAudit(),
      new AffiliateChannelUrlService()
    );

    await expect(
      service.createChannel(actor, context, {
        expectedProfileVersion: 3,
        platform: "x",
        homepageUrl: "https://x.com/needo",
        sortOrder: 0
      })
    ).rejects.toMatchObject({ message: "error.affiliate_profile.channel_limit" });
    expect(repository.createChannel).not.toHaveBeenCalled();
  });

  it("validates the merged channel when a partial update changes its platform", async () => {
    const repository = createRepository();
    repository.findMine.mockResolvedValue({
      ...profile,
      channels: [
        {
          ...profile.channels[0],
          platform: "custom",
          customLabel: "Blog",
          homepageUrl: "https://creator.example/profile"
        }
      ]
    });
    const service = new AffiliateProfileService(
      repository,
      createAudit(),
      new AffiliateChannelUrlService()
    );

    await expect(
      service.updateChannel(actor, context, 71, {
        expectedProfileVersion: 3,
        platform: "instagram"
      })
    ).rejects.toMatchObject({ message: "error.affiliate_profile.channel_label_invalid" });
    expect(repository.updateChannel).not.toHaveBeenCalled();
  });

  it("soft-deletes only an owned channel using the current profile version", async () => {
    const repository = createRepository();
    repository.findMine.mockResolvedValue(profile);
    repository.deleteChannel.mockResolvedValue({ ...profile, version: 4, channels: [] });
    const service = new AffiliateProfileService(
      repository,
      createAudit(),
      new AffiliateChannelUrlService()
    );

    await service.deleteChannel(actor, context, 71, 3);

    expect(repository.deleteChannel).toHaveBeenCalledWith(
      7,
      71,
      3,
      expect.objectContaining({
        action: "affiliate_profile.channel_deleted",
        targetId: 51,
        metadata: { changedFields: ["deletedAt"] }
      })
    );
  });
});
