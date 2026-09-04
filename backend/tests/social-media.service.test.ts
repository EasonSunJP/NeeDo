import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SocialMediaRepository } from "../src/repositories/social-media.repository";
import { ContentMediaFileStorage } from "../src/services/content-media.storage";
import {
  SocialMediaService,
  type SocialMediaRepositoryPort
} from "../src/services/social-media.service";
import { validPng } from "./fixtures/content-images";

const actor = {
  userId: 41,
  currentIdentityId: 71,
  currentIdentityType: "technician",
  email: "social@example.test",
  accessTokenJti: "social-media-test",
  accessTokenExpiresAt: 2_000_000_000,
  roles: ["customer"],
  permissions: ["social-post:create"]
};
const context = { ip: "127.0.0.1", userAgent: "social-media-test" };
const now = new Date("2026-08-30T02:00:00.000Z");

describe("SocialMediaService", () => {
  let directory = "";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "needo-social-media-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("stores a validated Social image and persists its owner and audit context", async () => {
    const repository: SocialMediaRepositoryPort = {
      createUpload: jest.fn(async (input) => ({
        publicId: input.checksumSha256,
        url: `/media/content/${input.fileKey}`,
        mimeType: input.mimeType,
        fileSize: input.fileSize
      }))
    };
    const service = new SocialMediaService(repository, new ContentMediaFileStorage(directory), {
      resolve: jest.fn(async () => ({
        identityId: 71,
        userId: 41,
        identityType: "technician",
        scopeType: "technician_profile",
        scopeId: 17
      }))
    });

    const result = await service.upload(actor, context, {
      bytes: validPng,
      fileName: "../moment.png",
      mimeType: "image/png",
      now
    });

    expect(result).toEqual({
      publicId: expect.stringMatching(/^[a-f0-9]{64}$/u),
      url: expect.stringMatching(/^\/media\/content\/[a-f0-9]{64}\.png$/u),
      mimeType: "image/png",
      fileSize: validPng.length
    });
    expect(repository.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 41,
        ownerIdentityId: 71,
        entityType: "social_post_upload",
        usageType: "social_post_public",
        fileName: "moment.png",
        fileSize: validPng.length,
        context,
        createdAt: now
      })
    );
    const fileKey = (repository.createUpload as jest.Mock).mock.calls[0][0].fileKey as string;
    await expect(readFile(join(directory, fileKey))).resolves.toEqual(validPng);
  });

  it("removes a newly created file when persistence fails", async () => {
    const repository: SocialMediaRepositoryPort = {
      createUpload: jest.fn(async () => {
        throw new Error("database unavailable");
      })
    };
    const storage = new ContentMediaFileStorage(directory);
    const service = new SocialMediaService(repository, storage);

    await expect(
      service.upload(actor, context, {
        bytes: validPng,
        fileName: "moment.png",
        mimeType: "image/png",
        now
      })
    ).rejects.toThrow("database unavailable");

    const fileKey = (repository.createUpload as jest.Mock).mock.calls[0][0].fileKey as string;
    await expect(readFile(join(directory, fileKey))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("normalizes spoofed image bytes to a stable Social media error", async () => {
    const repository: SocialMediaRepositoryPort = {
      createUpload: jest.fn()
    };
    const service = new SocialMediaService(repository, new ContentMediaFileStorage(directory));

    await expect(
      service.upload(actor, context, {
        bytes: Buffer.from("not-a-png"),
        fileName: "moment.png",
        mimeType: "image/png",
        now
      })
    ).rejects.toMatchObject({ message: "error.social.media_invalid", statusCode: 400 });
    expect(repository.createUpload).not.toHaveBeenCalled();
  });
});

describe("SocialMediaRepository", () => {
  it("creates the owner-scoped asset and upload audit in one transaction", async () => {
    const transaction = {
      mediaAsset: {
        create: jest.fn(async () => ({ id: 91 }))
      },
      auditLog: {
        create: jest.fn(async () => ({ id: 501 }))
      }
    };
    const client = {
      $transaction: jest.fn(async (operation) => operation(transaction))
    };
    const repository = new SocialMediaRepository(client as never);

    await expect(
      repository.createUpload({
        ownerUserId: 41,
        ownerIdentityId: 71,
        entityType: "social_post_upload",
        usageType: "social_post_public",
        fileKey: `${"a".repeat(64)}.png`,
        mimeType: "image/png",
        fileName: "moment.png",
        fileSize: validPng.length,
        checksumSha256: "a".repeat(64),
        createdAt: now,
        context
      })
    ).resolves.toEqual({
      publicId: "a".repeat(64),
      url: `/media/content/${"a".repeat(64)}.png`,
      mimeType: "image/png",
      fileSize: validPng.length
    });

    expect(transaction.mediaAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "social_post_upload",
        entityId: 41,
        ownerUserId: 41,
        ownerIdentityId: 71,
        usageType: "social_post_public",
        checksumSha256: "a".repeat(64)
      })
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 41,
        action: "social.media.uploaded",
        targetType: "MediaAsset",
        targetId: 91,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: expect.objectContaining({
          publicId: "a".repeat(64),
          mediaAssetId: 91,
          fileName: "moment.png",
          fileSize: validPng.length
        })
      })
    });
  });
});
