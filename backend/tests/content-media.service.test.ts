import { mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "../src/config/logger";
import {
  ContentMediaFileStorage,
  type PreparedContentMedia
} from "../src/services/content-media.storage";
import {
  ContentMediaService,
  type ContentMediaLockedRepositoryPort,
  type ContentMediaRepositoryPort
} from "../src/services/content-media.service";
import {
  emptyImageDataPng,
  excessivePixelPng,
  headerOnlyJpeg,
  headerOnlyWebp,
  validJpeg,
  validPng,
  validWebp
} from "./fixtures/content-images";

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
const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const repositoryWithCreate = (
  create: ContentMediaLockedRepositoryPort["create"]
): ContentMediaRepositoryPort => ({
  async withChecksumLock<T>(
    _checksumSha256: string,
    operation: (locked: ContentMediaLockedRepositoryPort) => Promise<T>
  ): Promise<T> {
    return operation({ create });
  }
});

const preparedFrom = (stored: PreparedContentMedia): PreparedContentMedia => ({
  fileKey: stored.fileKey,
  checksumSha256: stored.checksumSha256,
  mimeType: stored.mimeType
});

const serialChecksumLock = () => {
  let tail = Promise.resolve();

  return async <T>(operation: () => Promise<T>): Promise<T> => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  };
};

const serializedRepository = (
  create: ContentMediaLockedRepositoryPort["create"],
  serialize: <T>(operation: () => Promise<T>) => Promise<T>
): ContentMediaRepositoryPort => ({
  async withChecksumLock<T>(
    _checksumSha256: string,
    operation: (locked: ContentMediaLockedRepositoryPort) => Promise<T>
  ): Promise<T> {
    return serialize(() => operation({ create }));
  }
});

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

  it.each([
    ["truncated JPEG", "image/jpeg" as const, validJpeg.subarray(0, validJpeg.length - 2)],
    [
      "malformed PNG",
      "image/png" as const,
      Buffer.concat([validPng.subarray(0, 62), Buffer.from([0xff]), validPng.subarray(63)])
    ],
    ["truncated WebP", "image/webp" as const, validWebp.subarray(0, validWebp.length - 1)]
  ])(
    "rejects a %s body even when its leading magic bytes match",
    async (_name, mimeType, bytes) => {
      const storage = new ContentMediaFileStorage("/unused");

      await expect(
        Promise.resolve().then(() => storage.prepare({ bytes, mimeType }))
      ).rejects.toEqual(expect.objectContaining({ message: "error.content.media_invalid" }));
    }
  );

  it.each([
    ["JPEG", "image/jpeg" as const, headerOnlyJpeg],
    ["PNG", "image/png" as const, emptyImageDataPng],
    ["WebP", "image/webp" as const, headerOnlyWebp]
  ])(
    "rejects a structurally complete %s header with no decodable pixels",
    async (_name, mimeType, bytes) => {
      const storage = new ContentMediaFileStorage("/unused");

      await expect(
        Promise.resolve().then(() => storage.prepare({ bytes, mimeType }))
      ).rejects.toEqual(expect.objectContaining({ message: "error.content.media_invalid" }));
    }
  );

  it("rejects a decoded image above the 25,000,000-pixel cover bound", async () => {
    const storage = new ContentMediaFileStorage("/unused");

    await expect(
      Promise.resolve().then(() =>
        storage.prepare({ bytes: excessivePixelPng, mimeType: "image/png" })
      )
    ).rejects.toEqual(expect.objectContaining({ message: "error.content.media_invalid" }));
  });

  it("prepares valid content asynchronously and rejects a decoded-format MIME mismatch", async () => {
    const storage = new ContentMediaFileStorage("/unused");

    expect(storage.prepare({ bytes: validPng, mimeType: "image/png" })).toBeInstanceOf(Promise);
    await expect(
      Promise.resolve().then(() => storage.prepare({ bytes: validPng, mimeType: "image/jpeg" }))
    ).rejects.toEqual(expect.objectContaining({ message: "error.content.media_invalid" }));
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

  it("fails closed when the content root canonically overlaps protected identity media", async () => {
    const parent = await mkdtemp(join(tmpdir(), "needo-content-media-isolation-"));
    const identityDirectory = join(parent, "identity");
    const contentAlias = join(parent, "content-alias");
    await new ContentMediaFileStorage(identityDirectory).save({
      bytes: validPng,
      mimeType: "image/png"
    });
    await symlink(identityDirectory, contentAlias);

    expect(
      () =>
        new ContentMediaFileStorage(contentAlias, {
          identityStorageDirectory: identityDirectory
        })
    ).toThrow(/must not overlap/u);
  });
});

describe("ContentMediaService", () => {
  it("creates a distinct owner-scoped MediaAsset row for an upload", async () => {
    const create = jest.fn(async (input) => ({
      publicId: input.checksumSha256,
      mediaAssetId: 101,
      url: input.url,
      mimeType: input.mimeType,
      width: null,
      height: null,
      checksumSha256: input.checksumSha256
    }));
    const repository = repositoryWithCreate(create);
    const stored = {
      fileKey: `${"a".repeat(64)}.png`,
      checksumSha256: "a".repeat(64),
      mimeType: "image/png" as const,
      created: true
    };
    const storage = {
      prepare: jest.fn(async () => preparedFrom(stored)),
      save: jest.fn(async () => stored),
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
    expect(create).toHaveBeenCalledWith(
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
    const create = jest.fn(async () => {
      throw new Error("database unavailable");
    });
    const repository = repositoryWithCreate(create);
    const stored = {
      fileKey: `${"b".repeat(64)}.webp`,
      checksumSha256: "b".repeat(64),
      mimeType: "image/webp" as const,
      created: true
    };
    const storage = {
      prepare: jest.fn(async () => preparedFrom(stored)),
      save: jest.fn(async () => stored),
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
    const create = jest.fn(async () => {
      throw new Error("database unavailable");
    });
    const repository = repositoryWithCreate(create);
    const stored = {
      fileKey: `${"c".repeat(64)}.jpg`,
      checksumSha256: "c".repeat(64),
      mimeType: "image/jpeg" as const,
      created: false
    };
    const storage = {
      prepare: jest.fn(async () => preparedFrom(stored)),
      save: jest.fn(async () => stored),
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

  it("serializes same-checksum persistence across storage instances so a failure cannot delete a committed blob", async () => {
    const directory = await mkdtemp(join(tmpdir(), "needo-content-media-race-"));
    const firstStorage = new ContentMediaFileStorage(directory);
    const secondStorage = new ContentMediaFileStorage(directory);
    const persistenceError = new Error("first persistence failed");
    const firstCreate = jest.fn(async () => {
      await wait(250);
      throw persistenceError;
    });
    const secondCreate = jest.fn(async (input) => ({
      publicId: input.checksumSha256,
      mediaAssetId: 202,
      url: input.url,
      mimeType: input.mimeType,
      width: null,
      height: null,
      checksumSha256: input.checksumSha256
    }));
    const serialize = serialChecksumLock();
    const firstRepository = serializedRepository(firstCreate, serialize);
    const secondRepository = serializedRepository(secondCreate, serialize);
    const firstService = new ContentMediaService(firstRepository, firstStorage);
    const secondService = new ContentMediaService(secondRepository, secondStorage);

    const firstOutcome = firstService
      .upload(actor, context, {
        bytes: validPng,
        mimeType: "image/png",
        altText: null,
        now
      })
      .catch((error: unknown) => error);
    await wait(25);
    const secondResult = await secondService.upload({ ...actor, userId: 8 }, context, {
      bytes: validPng,
      mimeType: "image/png",
      altText: null,
      now
    });

    await expect(firstOutcome).resolves.toBe(persistenceError);
    await expect(secondStorage.read(secondResult.url.split("/").at(-1)!)).resolves.toEqual(
      validPng
    );
    expect(firstCreate).toHaveBeenCalledTimes(1);
    expect(secondCreate).toHaveBeenCalledTimes(1);
  });

  it("preserves the persistence error when compensating file cleanup also fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "needo-content-media-cleanup-"));
    const persistenceError = new Error("database transaction failed");
    const storage = new ContentMediaFileStorage(directory);
    jest.spyOn(storage, "delete").mockRejectedValueOnce(new Error("private path cleanup failed"));
    const repository = repositoryWithCreate(
      jest.fn(async () => {
        throw persistenceError;
      })
    );
    const service = new ContentMediaService(repository, storage);
    const warning = jest.spyOn(logger, "warn").mockImplementation(() => undefined);

    await expect(
      service.upload(actor, context, {
        bytes: validPng,
        mimeType: "image/png",
        altText: null,
        now
      })
    ).rejects.toBe(persistenceError);
    expect(warning).toHaveBeenCalledWith(
      {
        cleanupErrorName: "Error",
        publicId: expect.stringMatching(/^[a-f0-9]{64}$/u)
      },
      "Content media compensation cleanup failed"
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain("private path cleanup failed");
    warning.mockRestore();
  });
});
