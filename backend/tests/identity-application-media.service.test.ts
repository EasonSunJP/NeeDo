import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  IdentityApplicationMediaService,
  type IdentityApplicationMediaRepositoryPort
} from "../src/services/identity-application-media.service";
import type { IdentityApplicationMediaStoragePort } from "../src/services/identity-application-media.storage";

const now = new Date("2026-08-26T05:00:00.000Z");
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const actor = (
  userId: number,
  overrides: Partial<AuthenticatedAccessContext> = {}
): AuthenticatedAccessContext => ({
  userId,
  email: `${userId}@example.test`,
  accessTokenJti: `jti-${userId}`,
  accessTokenExpiresAt: 2_000_000_000,
  roles: ["customer"],
  permissions: ["identity-application:own"],
  currentIdentityId: userId,
  currentIdentityType: "customer",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  ...overrides
});

const createRepository = (): jest.Mocked<IdentityApplicationMediaRepositoryPort> => ({
  findEditableContext: jest.fn(async (applicationId) => {
    void applicationId;
    return {
      applicationId: 41,
      userId: 7,
      type: "technician" as const,
      status: "draft",
      version: 2,
      activeMediaCount: 1
    };
  }),
  attachInTransaction: jest.fn(async (input) => ({
    id: 101,
    applicationId: input.applicationId,
    purpose: input.purpose,
    mimeType: input.mimeType,
    applicationVersion: input.expectedVersion + 1,
    createdAt: input.createdAt
  })),
  findMediaAccess: jest.fn(async (applicationId, mediaAssetId) => {
    void applicationId;
    void mediaAssetId;
    return {
      mediaAssetId: 101,
      applicationId: 41,
      applicantUserId: 7,
      targetShopId: 21,
      fileKey: "a".repeat(64) + ".png",
      mimeType: "image/png"
    };
  })
});

const createStorage = (): jest.Mocked<IdentityApplicationMediaStoragePort> => ({
  save: jest.fn(async (input) => {
    void input;
    return {
      absolutePath: "/tmp/media.png",
      fileKey: "a".repeat(64) + ".png",
      mimeType: "image/png" as const,
      checksumSha256: "b".repeat(64)
    };
  }),
  read: jest.fn(async (fileKey) => {
    void fileKey;
    return png;
  }),
  delete: jest.fn(async (fileKey) => {
    void fileKey;
  })
});

describe("IdentityApplicationMediaService", () => {
  it("uploads an optional technician photo and increments the editable application version", async () => {
    const repository = createRepository();
    const storage = createStorage();
    const service = new IdentityApplicationMediaService(repository, storage);
    await expect(
      service.upload({
        userId: 7,
        applicationId: 41,
        expectedVersion: 2,
        purpose: "portrait",
        bytes: png,
        mimeType: "image/png",
        now
      })
    ).resolves.toMatchObject({ id: 101, applicationVersion: 3, purpose: "portrait" });
    expect(repository.attachInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 41,
        userId: 7,
        expectedVersion: 2,
        fileKey: "a".repeat(64) + ".png",
        checksumSha256: "b".repeat(64)
      })
    );
  });

  it("rejects invalid purposes, submitted snapshots, stale versions, and excessive files", async () => {
    const repository = createRepository();
    const storage = createStorage();
    const service = new IdentityApplicationMediaService(repository, storage);
    await expect(
      service.upload({
        userId: 7,
        applicationId: 41,
        expectedVersion: 2,
        purpose: "corporate_registration",
        bytes: png,
        mimeType: "image/png",
        now
      })
    ).rejects.toMatchObject({ message: "error.identity_application.media_purpose_invalid" });

    repository.findEditableContext.mockResolvedValueOnce({
      applicationId: 41,
      userId: 7,
      type: "technician",
      status: "submitted",
      version: 2,
      activeMediaCount: 1
    });
    await expect(
      service.upload({
        userId: 7,
        applicationId: 41,
        expectedVersion: 2,
        purpose: "portrait",
        bytes: png,
        mimeType: "image/png",
        now
      })
    ).rejects.toMatchObject({ message: "error.identity_application.submitted_snapshot_locked" });
    expect(storage.save).not.toHaveBeenCalled();
  });

  it("reads media only for the applicant, target shop reviewer, or authorized operations", async () => {
    const repository = createRepository();
    const storage = createStorage();
    const service = new IdentityApplicationMediaService(repository, storage);
    await expect(service.read(actor(7), 41, 101)).resolves.toMatchObject({ buffer: png });
    await expect(
      service.read(
        actor(30, {
          roles: ["merchant_owner"],
          permissions: ["identity-application-media:sensitive-read"],
          currentIdentityType: "merchant_owner",
          currentIdentityScopeType: "shop",
          currentIdentityScopeId: 21
        }),
        41,
        101
      )
    ).resolves.toMatchObject({ mimeType: "image/png" });
    await expect(
      service.read(
        actor(9, {
          roles: ["operator"],
          permissions: ["identity-application-media:sensitive-read"],
          currentIdentityType: "admin"
        }),
        41,
        101
      )
    ).resolves.toMatchObject({ buffer: png });
    await expect(service.read(actor(99), 41, 101)).rejects.toMatchObject({ statusCode: 404 });
  });
});
