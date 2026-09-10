import type { AuditLogCreateInput } from "../src/repositories/audit-log.repository";
import type {
  TechnicianProfilePayload,
  TechnicianProfileRepositoryPort
} from "../src/repositories/technician-profile.repository";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import type { CustomerAvatarStoragePort } from "../src/services/customer-avatar.storage";
import { TechnicianProfileService } from "../src/services/technician-profile.service";

const profile: TechnicianProfilePayload = {
  id: 31,
  publicId: "s1234567890",
  userId: 9,
  shopId: 3,
  shopAccessStatus: "active",
  shopAffiliations: [
    {
      id: 41,
      shopId: 3,
      publicId: "shop0000000003",
      name: "GINZA Calm Body Lab",
      city: "Tokyo",
      address: "Ginza",
      relationshipType: "partner",
      workStatus: "active",
      startsAt: "2026-04-01T00:00:00.000Z"
    }
  ],
  displayName: "田中 彩",
  avatarUrl: null,
  bio: "肩颈护理",
  city: "Tokyo",
  gender: "female",
  age: 28,
  heightCm: 164,
  languages: ["日本語"],
  serviceAreas: ["銀座"],
  serviceBase: null,
  specialTags: [],
  profileTags: [],
  reviewTagSummary: {
    special: [
      { code: "appeal_max", label: "魅力max", count: 0 },
      { code: "service_max", label: "服务max", count: 0 },
      { code: "emotion_max", label: "情绪max", count: 0 },
      { code: "energy_max", label: "元气max", count: 0 }
    ],
    custom: []
  },
  canServeForeigners: true,
  bidBudgetMinJpy: 12_000,
  bidBudgetMaxJpy: 28_000,
  paymentMethods: ["platform", "offline"],
  visibility: "public",
  employmentType: "full_time",
  yearsExperience: 4,
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z"
};

const actor = {
  userId: 9,
  currentIdentityId: 19,
  currentIdentityType: "technician",
  currentIdentityScopeType: "technician_profile",
  currentIdentityScopeId: 31
} as AuthenticatedAccessContext;

const repository = (): jest.Mocked<TechnicianProfileRepositoryPort> => ({
  findMine: jest.fn(),
  updateMine: jest.fn()
});

const audit = {
  createInput: jest.fn(
    (input): AuditLogCreateInput => ({
      actorId: input.actor.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata
    })
  )
};

const storage = (): jest.Mocked<CustomerAvatarStoragePort> => ({ save: jest.fn() });

describe("TechnicianProfileService", () => {
  it("reads and updates only the active technician profile scope with an audit", async () => {
    const repo = repository();
    repo.findMine.mockResolvedValue(profile);
    repo.updateMine.mockResolvedValue({ ...profile, displayName: "彩" });
    const profileNotifier = { notifyProfileUpdated: jest.fn(async () => undefined) };
    const service = new TechnicianProfileService(repo, audit, storage(), profileNotifier);

    await expect(service.getMine(actor)).resolves.toBe(profile);
    await service.updateMine(
      actor,
      { ip: "127.0.0.1", userAgent: "jest" },
      {
        displayName: "彩",
        gender: "female"
      }
    );

    expect(repo.findMine).toHaveBeenCalledWith(9, 31);
    expect(repo.updateMine).toHaveBeenCalledWith(
      9,
      31,
      19,
      { displayName: "彩", gender: "female" },
      expect.objectContaining({
        action: "technician_profile.self_update",
        metadata: { changedFields: ["displayName", "gender"] }
      })
    );
    expect(profileNotifier.notifyProfileUpdated).toHaveBeenCalledWith({
      identityId: 19,
      userId: 9
    });
  });

  it.each(["customer", "scout", "merchant_owner"])(
    "rejects the %s identity before repository access",
    async (identityType) => {
      const repo = repository();
      const service = new TechnicianProfileService(repo, audit, storage());
      await expect(
        service.getMine({ ...actor, currentIdentityType: identityType })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(repo.findMine).not.toHaveBeenCalled();
    }
  );
});
