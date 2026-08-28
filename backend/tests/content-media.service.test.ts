import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContentMediaRepository } from "../src/repositories/content-media.repository";
import { ContentMediaFileStorage } from "../src/services/content-media.storage";
import { ContentMediaService } from "../src/services/content-media.service";

const validPng = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("needo-content-media")
]);
const validJpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from("needo-content-media")
]);
const validWebp = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x10, 0x00, 0x00, 0x00]),
  Buffer.from("WEBPVP8 "),
  Buffer.from("needo")
]);

const actor = {
  userId: 7,
  email: "operator@example.test",
  accessTokenJti: "content-media-test",
  accessTokenExpiresAt: 2_000_000_000,
  roles: ["operator"],
  permissions: ["button:backoffice-content-media-upload"]
};
const context = { ip: "127.0.0.1", userAgent: "content-media-test" };
const now = new Date("2026-08-29T05:00:00.000Z");

describe("ContentMediaFileStorage", () => {
  it.each([
    ["image/jpeg" as const, validJpeg, "jpg"],
    ["image/png" as const, validPng, "png"],
    ["image/webp" as const, validWebp, "webp"]
  ])("validates %s magic bytes and stores a hash-only path", async (mimeType, bytes, extension) => {
    const directory = await mkdtemp(join(tmpdir(), "needo-content-media-"));
    const storage = new ContentMediaFileStorage(directory);

    const stored = await storage.save({ bytes, mimeType });

    expect(stored.fileKey).toMatch(new RegExp(`^[a-f0-9]{64}\\.${extension}$`, "u"));
    expect(stored.checksumSha256).toMatch(/^[a-f0-9]{64}$/u);
    await expect(storage.read(stored.fileKey)).resolves.toEqual(bytes);
  });

  it("validates content independently of the claimed MIME type", async () => {
    const directory = await mkdtemp(join(tmpdir(), "needo-content-media-"));
    const storage = new ContentMediaFileStorage(directory);

    await expect(storage.save({ bytes: validJpeg, mimeType: "image/png" })).rejects.toMatchObject({
      message: "error.content.media_invalid"
    });
  });

  it("rejects empty and oversized files with stable content errors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "needo-content-media-"));
    const storage = new ContentMediaFileStorage(directory, validPng.length - 1);

    await expect(
      storage.save({ bytes: Buffer.alloc(0), mimeType: "image/png" })
    ).rejects.toMatchObject({ message: "error.content.media_invalid" });
    await expect(storage.save({ bytes: validPng, mimeType: "image/png" })).rejects.toMatchObject({
      message: "error.content.media_too_large"
    });
  });

  it("rejects traversal and non-hash file keys", async () => {
    const directory = await mkdtemp(join(tmpdir(), "needo-content-media-"));
    const storage = new ContentMediaFileStorage(directory);

    await expect(storage.read("../secret.png")).rejects.toMatchObject({
      message: "error.content.media_invalid"
    });
    await expect(storage.delete("not-a-checksum.png")).rejects.toMatchObject({
      message: "error.content.media_invalid"
    });
  });

  it("deduplicates identical immutable bytes by checksum", async () => {
    const directory = await mkdtemp(join(tmpdir(), "needo-content-media-"));
    const storage = new ContentMediaFileStorage(directory);

    const first = await storage.save({ bytes: validPng, mimeType: "image/png" });
    const second = await storage.save({ bytes: validPng, mimeType: "image/png" });

    expect(second).toMatchObject({
      fileKey: first.fileKey,
      checksumSha256: first.checksumSha256,
      created: false
    });
    expect(first.created).toBe(true);
  });
});

describe("ContentMediaService", () => {
  it("creates a distinct owner-scoped MediaAsset row for an upload", async () => {
    const repository = {
      create: jest.fn(async (input) => ({
        publicId: input.checksumSha256,
        mediaAssetId: 101,
        url: input.url,
        mimeType: input.mimeType,
        width: null,
        height: null,
        checksumSha256: input.checksumSha256
      }))
    };
    const storage = {
      save: jest.fn(async () => ({
        fileKey: `${"a".repeat(64)}.png`,
        checksumSha256: "a".repeat(64),
        mimeType: "image/png" as const,
        created: true
      })),
      read: jest.fn(),
      delete: jest.fn()
    };
    const service = new ContentMediaService(repository, storage);

    const result = await service.upload(actor, context, {
      bytes: validPng,
      mimeType: "image/png",
      altText: "NeeDo announcement",
      now
    });

    expect(result).toMatchObject({
      publicId: "a".repeat(64),
      mediaAssetId: 101,
      url: `/media/content/${"a".repeat(64)}.png`,
      mimeType: "image/png",
      checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/u)
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "content_publication_upload",
        entityId: actor.userId,
        ownerUserId: actor.userId,
        altText: "NeeDo announcement",
        context
      })
    );
  });

  it("compensates a newly written file when the database transaction fails", async () => {
    const repository = {
      create: jest.fn(async () => {
        throw new Error("database unavailable");
      })
    };
    const storage = {
      save: jest.fn(async () => ({
        fileKey: `${"b".repeat(64)}.webp`,
        checksumSha256: "b".repeat(64),
        mimeType: "image/webp" as const,
        created: true
      })),
      read: jest.fn(),
      delete: jest.fn(async () => undefined)
    };
    const service = new ContentMediaService(repository, storage);

    await expect(
      service.upload(actor, context, {
        bytes: validWebp,
        mimeType: "image/webp",
        altText: null,
        now
      })
    ).rejects.toThrow("database unavailable");
    expect(storage.delete).toHaveBeenCalledWith(`${"b".repeat(64)}.webp`);
  });

  it("preserves existing deduplicated bytes when a later database transaction fails", async () => {
    const repository = {
      create: jest.fn(async () => {
        throw new Error("database unavailable");
      })
    };
    const storage = {
      save: jest.fn(async () => ({
        fileKey: `${"c".repeat(64)}.jpg`,
        checksumSha256: "c".repeat(64),
        mimeType: "image/jpeg" as const,
        created: false
      })),
      read: jest.fn(),
      delete: jest.fn()
    };
    const service = new ContentMediaService(repository, storage);

    await expect(
      service.upload(actor, context, {
        bytes: validJpeg,
        mimeType: "image/jpeg",
        altText: null,
        now
      })
    ).rejects.toThrow("database unavailable");
    expect(storage.delete).not.toHaveBeenCalled();
  });
});

describe("ContentMediaRepository", () => {
  it("creates the MediaAsset and its real AuditLog in one transaction", async () => {
    const mediaAssetCreate = jest.fn(async ({ data }) => ({ id: 201, ...data }));
    const auditLogCreate = jest.fn(async () => ({ id: 301 }));
    const transaction = {
      mediaAsset: { create: mediaAssetCreate },
      auditLog: { create: auditLogCreate }
    };
    const client = {
      $transaction: jest.fn(async (operation) => operation(transaction))
    };
    const repository = new ContentMediaRepository(client as never);

    const result = await repository.create({
      entityType: "content_publication_upload",
      entityId: 7,
      ownerUserId: 7,
      url: `/media/content/${"d".repeat(64)}.png`,
      mimeType: "image/png",
      altText: "Announcement",
      checksumSha256: "d".repeat(64),
      createdAt: now,
      context
    });

    expect(result.mediaAssetId).toBe(201);
    expect(mediaAssetCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "content_publication_upload",
        entityId: 7,
        ownerUserId: 7,
        width: null,
        height: null,
        checksumSha256: "d".repeat(64)
      })
    });
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 7,
        action: "content.media.uploaded",
        targetType: "MediaAsset",
        targetId: 201,
        ip: context.ip,
        userAgent: context.userAgent
      })
    });
  });
});
