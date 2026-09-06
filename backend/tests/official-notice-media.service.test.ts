import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  OfficialNoticeMediaFileStorage,
  type OfficialNoticeMediaStoragePort
} from "../src/services/official-notice-media.storage";
import {
  OfficialNoticeMediaService,
  type OfficialNoticeMediaLockedRepositoryPort,
  type OfficialNoticeMediaRepositoryPort
} from "../src/services/official-notice-media.service";

const context = { ip: "127.0.0.1", userAgent: "jest" };
const now = new Date("2026-09-07T05:00:00.000Z");

const repository = () => {
  const create = jest.fn(async (input: Parameters<OfficialNoticeMediaLockedRepositoryPort["create"]>[0]) => ({
    publicId: input.checksumSha256,
    mediaAssetId: 81,
    url: input.url,
    mimeType: input.mimeType,
    width: null,
    height: null,
    checksumSha256: input.checksumSha256
  }));
  return {
    create,
    port: {
      withChecksumLock: async <T>(
        _checksum: string,
        operation: (locked: OfficialNoticeMediaLockedRepositoryPort) => Promise<T>
      ) => operation({ create })
    } satisfies OfficialNoticeMediaRepositoryPort
  };
};

describe("OfficialNoticeMediaFileStorage", () => {
  it.each([
    ["video/mp4", Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom"), Buffer.alloc(12)]), "mp4"],
    ["video/webm", Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]), "webm"],
    ["application/pdf", Buffer.from("%PDF-1.7\nformal notice"), "pdf"],
    ["text/plain", Buffer.from("formal notice attachment", "utf8"), "txt"]
  ] as const)("stores signature-verified %s attachments", async (mimeType, bytes, extension) => {
    const directory = await mkdtemp(join(tmpdir(), "notice-media-"));
    const storage = new OfficialNoticeMediaFileStorage(directory);
    const stored = await storage.save({ bytes, mimeType });

    expect(stored.fileKey).toMatch(new RegExp(`^[a-f0-9]{64}\\.${extension}$`));
    await expect(readFile(join(directory, stored.fileKey))).resolves.toEqual(bytes);
  });

  it("rejects a spoofed MIME type before writing", async () => {
    const storage = new OfficialNoticeMediaFileStorage("/unused");
    await expect(storage.prepare({
      bytes: Buffer.from("not a PDF"),
      mimeType: "application/pdf"
    })).rejects.toMatchObject({ statusCode: 400, message: "error.official_notice.media_invalid" });
  });
});

describe("OfficialNoticeMediaService", () => {
  const storage = {
    prepare: jest.fn(async (_input: Parameters<OfficialNoticeMediaStoragePort["prepare"]>[0]) => ({
      fileKey: `${"a".repeat(64)}.pdf`,
      checksumSha256: "a".repeat(64),
      mimeType: "application/pdf" as const
    })),
    save: jest.fn(async (_input: Parameters<OfficialNoticeMediaStoragePort["save"]>[0]) => ({
      fileKey: `${"a".repeat(64)}.pdf`,
      checksumSha256: "a".repeat(64),
      mimeType: "application/pdf" as const,
      created: true
    })),
    read: jest.fn(async (_fileKey: string) => Buffer.alloc(0)),
    delete: jest.fn(async (_fileKey: string) => undefined)
  } satisfies jest.Mocked<OfficialNoticeMediaStoragePort>;

  beforeEach(() => jest.clearAllMocks());

  it("records a platform upload against the authenticated platform user", async () => {
    const repo = repository();
    const service = new OfficialNoticeMediaService(repo.port, storage);
    const actor = {
      userId: 7,
      currentIdentityId: 17,
      currentIdentityType: "platform",
      currentIdentityScopeType: "global",
      currentIdentityScopeId: null
    } as AuthenticatedAccessContext;

    await service.uploadPlatform(actor, context, {
      bytes: Buffer.from("%PDF-1.7"),
      mimeType: "application/pdf",
      fileName: "guide.pdf",
      caption: "Guide",
      now
    });

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "official_notice_upload",
      ownerUserId: 7,
      ownerIdentityId: 17,
      shopId: null,
      url: `/media/content/${"a".repeat(64)}.pdf`,
      fileName: "guide.pdf"
    }));
  });

  it("records a merchant upload against its selected shop and identity", async () => {
    const repo = repository();
    const service = new OfficialNoticeMediaService(repo.port, storage);
    const actor = {
      userId: 9,
      currentIdentityId: 29,
      currentIdentityType: "merchant_staff",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 301
    } as AuthenticatedAccessContext;

    await service.uploadMerchant(actor, context, {
      bytes: Buffer.from("%PDF-1.7"),
      mimeType: "application/pdf",
      fileName: "staff-guide.pdf",
      caption: null,
      now
    });

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: 9,
      ownerIdentityId: 29,
      shopId: 301,
      usageType: "official_notice_attachment"
    }));
  });
});
