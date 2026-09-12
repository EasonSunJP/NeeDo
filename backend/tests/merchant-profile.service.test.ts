import type {
  MerchantProfilePayload,
  MerchantProfileRepositoryPort
} from "../src/repositories/merchant-profile.repository";
import { MerchantProfileService } from "../src/services/merchant-profile.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";

const profile: MerchantProfilePayload = {
  id: 61,
  publicId: "b0000000109",
  userId: 9,
  identityId: 109,
  displayName: "佐藤 美咲",
  avatarUrl: null,
  gender: "private",
  age: 29,
  heightCm: 163,
  languages: ["日本語"],
  bio: "商户负责人",
  visibility: "public",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

const merchantActor = (overrides: Partial<AuthenticatedAccessContext> = {}) => ({
  userId: 9,
  email: "merchant@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: 2_000_000_000,
  currentIdentityId: 109,
  currentPublicId: "b0000000109",
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 73,
  roles: ["merchant_owner"],
  permissions: ["merchant-profile:read", "merchant-profile:write"],
  ...overrides
});

describe("MerchantProfileService", () => {
  it.each(["merchant", "merchant_owner", "merchant_staff", "merchant_organization"])(
    "reads the independent %s identity card",
    async (identityType) => {
      const repository = {
        findMine: jest.fn(async () => profile),
        updateMine: jest.fn()
      } as unknown as jest.Mocked<MerchantProfileRepositoryPort>;
      const service = new MerchantProfileService(
        repository,
        { createInput: jest.fn() },
        {
          save: jest.fn()
        }
      );

      await expect(
        service.getMine(merchantActor({ currentIdentityType: identityType }))
      ).resolves.toEqual(profile);
      expect(repository.findMine).toHaveBeenCalledWith(9, 109);
    }
  );

  it("updates only the active merchant identity and audits exact changed fields", async () => {
    const repository = {
      findMine: jest.fn(async () => profile),
      updateMine: jest.fn(async () => ({ ...profile, displayName: "Misaki", languages: [] }))
    } as unknown as jest.Mocked<MerchantProfileRepositoryPort>;
    const createInput = jest.fn((input) => ({
      actorId: input.actor.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata
    }));
    const profileNotifier = { notifyProfileUpdated: jest.fn(async () => undefined) };
    const service = new MerchantProfileService(
      repository,
      { createInput },
      { save: jest.fn() },
      profileNotifier
    );

    await expect(
      service.updateMine(
        merchantActor(),
        { ip: "127.0.0.1", userAgent: "jest" },
        {
          displayName: "Misaki",
          languages: []
        }
      )
    ).resolves.toMatchObject({ displayName: "Misaki", languages: [] });

    expect(repository.updateMine).toHaveBeenCalledWith(
      9,
      109,
      { displayName: "Misaki", languages: [] },
      expect.objectContaining({
        action: "merchant_profile.self_update",
        targetType: "MerchantIdentityProfile",
        targetId: 61,
        metadata: { changedFields: ["displayName", "languages"] }
      })
    );
    expect(profileNotifier.notifyProfileUpdated).toHaveBeenCalledWith({
      identityId: 109,
      includePersonalIdentities: false,
      userId: 9
    });
  });

  it.each(["customer", "technician", "scout"])("rejects non-merchant identity %s", async (type) => {
    const repository = {
      findMine: jest.fn(),
      updateMine: jest.fn()
    } as unknown as jest.Mocked<MerchantProfileRepositoryPort>;
    const service = new MerchantProfileService(
      repository,
      { createInput: jest.fn() },
      {
        save: jest.fn()
      }
    );

    await expect(
      service.getMine(merchantActor({ currentIdentityType: type }))
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "error.identity.forbidden"
    });
  });
});
