import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  IdentityApplicationMediaService,
  type IdentityApplicationMediaRepositoryPort
} from "../src/services/identity-application-media.service";
import type { IdentityApplicationMediaStoragePort } from "../src/services/identity-application-media.storage";
import sharp from "sharp";

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
  attachBundleInTransaction: jest.fn(async (input) => ({
    original: {
      id: 101,
      applicationId: input.applicationId,
      purpose: input.purpose,
      mimeType: input.original.mimeType,
      applicationVersion: input.expectedVersion + 1,
      createdAt: input.createdAt,
      variant: "original" as const
    },
    preview: {
      id: 102,
      applicationId: input.applicationId,
      purpose: input.purpose,
      mimeType: input.preview.mimeType,
      applicationVersion: input.expectedVersion + 1,
      createdAt: input.createdAt,
      variant: "preview" as const
    },
    applicationVersion: input.expectedVersion + 1
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
      checksumSha256: "b".repeat(64),
      width: 2,
      height: 2,
      created: true
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

  it("stores a related original and preview as one versioned bundle", async () => {
    const repository = createRepository();
    const storage = createStorage();
    storage.save
      .mockResolvedValueOnce({
        absolutePath: "/tmp/original.jpg",
        fileKey: "a".repeat(64) + ".jpg",
        mimeType: "image/jpeg",
        checksumSha256: "b".repeat(64),
        width: 900,
        height: 600,
        created: true
      })
      .mockResolvedValueOnce({
        absolutePath: "/tmp/preview.jpg",
        fileKey: "c".repeat(64) + ".jpg",
        mimeType: "image/jpeg",
        checksumSha256: "d".repeat(64),
        width: 700,
        height: 467,
        created: true
      });
    const original = await sharp({
      create: { width: 900, height: 600, channels: 3, background: "#38bdf8" }
    }).jpeg({ quality: 100 }).toBuffer();
    const preview = await sharp(original).resize({ width: 700 }).jpeg({ quality: 94 }).toBuffer();
    const service = new IdentityApplicationMediaService(repository, storage);

    await expect(service.uploadBundle({
      userId: 7,
      applicationId: 41,
      expectedVersion: 2,
      purpose: "identity_document",
      original: { bytes: original, mimeType: "image/jpeg" },
      preview: { bytes: preview, mimeType: "image/jpeg" },
      now
    })).resolves.toMatchObject({ applicationVersion: 3 });
    expect(repository.attachBundleInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 41,
        purpose: "identity_document",
        original: expect.objectContaining({ width: 900, height: 600 }),
        preview: expect.objectContaining({ width: 700, height: 467 })
      })
    );
  });

  it("removes both new files when bundle persistence fails", async () => {
    const repository = createRepository();
    repository.attachBundleInTransaction.mockRejectedValueOnce(new Error("database unavailable"));
    const storage = createStorage();
    const image = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "#38bdf8" }
    }).png().toBuffer();
    const service = new IdentityApplicationMediaService(repository, storage);

    await expect(service.uploadBundle({
      userId: 7,
      applicationId: 41,
      expectedVersion: 2,
      purpose: "identity_document",
      original: { bytes: image, mimeType: "image/png" },
      preview: { bytes: image, mimeType: "image/png" },
      now
    })).rejects.toThrow("database unavailable");
    expect(storage.delete).toHaveBeenCalledTimes(2);
  });
});
