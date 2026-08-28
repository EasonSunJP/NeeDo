import { logger } from "../src/config/logger";
import { ContentMediaRepository } from "../src/repositories/content-media.repository";

const checksum = "d".repeat(64);
const now = new Date("2026-08-29T05:00:00.000Z");
const context = { ip: "127.0.0.1", userAgent: "content-media-lock-test" };

const sqlText = (query: { strings?: readonly string[] }): string => query.strings?.join(" ") ?? "";

const createInput = {
  entityType: "content_publication_upload" as const,
  entityId: 7,
  ownerUserId: 7,
  url: `/media/content/${checksum}.png`,
  mimeType: "image/png" as const,
  altText: "Announcement",
  checksumSha256: checksum,
  createdAt: now,
  context
};

describe("ContentMediaRepository MySQL advisory lock", () => {
  it("acquires the checksum lock, runs MediaAsset and Audit writes on the pinned transaction, then releases", async () => {
    const events: string[] = [];
    const queryRaw = jest.fn(
      async (query: { strings?: readonly string[]; values?: readonly unknown[] }) => {
        const sql = sqlText(query);
        if (sql.includes("GET_LOCK")) {
          events.push("acquire");
          return [{ acquired: 1 }];
        }
        events.push("release");
        return [{ released: 1 }];
      }
    );
    const mediaAssetCreate = jest.fn(async ({ data }) => {
      events.push("media");
      return { id: 201, ...data };
    });
    const auditLogCreate = jest.fn(async () => {
      events.push("audit");
      return { id: 301 };
    });
    const transaction = {
      $queryRaw: queryRaw,
      mediaAsset: { create: mediaAssetCreate },
      auditLog: { create: auditLogCreate }
    };
    const client = {
      $transaction: jest.fn(async (operation) => operation(transaction))
    };
    const repository = new ContentMediaRepository(client as never, 3);

    const result = await repository.withChecksumLock(checksum, async (locked) => {
      events.push("callback");
      return locked.create(createInput);
    });

    expect(result.mediaAssetId).toBe(201);
    expect(events).toEqual(["acquire", "callback", "media", "audit", "release"]);
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(sqlText(queryRaw.mock.calls[0][0])).toContain("GET_LOCK");
    expect(queryRaw.mock.calls[0][0].values).toEqual([checksum, 3]);
    expect(sqlText(queryRaw.mock.calls[1][0])).toContain("RELEASE_LOCK");
    expect(queryRaw.mock.calls[1][0].values).toEqual([checksum]);
  });

  it("maps advisory lock timeout to the stable content conflict without running the callback", async () => {
    const callback = jest.fn();
    const queryRaw = jest.fn(async () => [{ acquired: 0 }]);
    const client = {
      $transaction: jest.fn(async (operation) =>
        operation({
          $queryRaw: queryRaw,
          mediaAsset: { create: jest.fn() },
          auditLog: { create: jest.fn() }
        })
      )
    };
    const repository = new ContentMediaRepository(client as never, 1);

    await expect(repository.withChecksumLock(checksum, callback)).rejects.toMatchObject({
      message: "error.content.lock_conflict",
      statusCode: 409
    });
    expect(callback).not.toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("sanitizes release failure and preserves callback success or the primary callback error", async () => {
    const releaseError = new Error("private connection details");
    const warning = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    const createRepository = () => {
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([{ acquired: 1 }])
        .mockRejectedValueOnce(releaseError);
      return new ContentMediaRepository(
        {
          $transaction: jest.fn(async (operation) =>
            operation({
              $queryRaw: queryRaw,
              mediaAsset: { create: jest.fn() },
              auditLog: { create: jest.fn() }
            })
          )
        } as never,
        1
      );
    };

    await expect(
      createRepository().withChecksumLock(checksum, async () => "committed")
    ).resolves.toBe("committed");

    const primaryError = new Error("primary operation failed");
    await expect(
      createRepository().withChecksumLock(checksum, async () => {
        throw primaryError;
      })
    ).rejects.toBe(primaryError);

    expect(warning).toHaveBeenCalledWith(
      { releaseErrorName: "Error", publicId: checksum },
      "Content media advisory lock release failed"
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain("private connection details");
    warning.mockRestore();
  });
});
