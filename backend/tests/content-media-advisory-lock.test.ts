import { mkdtemp, readFile as readSourceFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "mariadb";
import { logger } from "../src/config/logger";
import {
  ContentMediaRepository,
  createContentMediaAdvisoryLockConnectionFactory,
  type ContentMediaAdvisoryLockConnection,
  type ContentMediaAdvisoryLockConnectionFactory
} from "../src/repositories/content-media.repository";
import { ContentMediaFileStorage } from "../src/services/content-media.storage";
import { ContentMediaService } from "../src/services/content-media.service";
import { validPng } from "./fixtures/content-images";

jest.mock("mariadb", () => ({ createConnection: jest.fn() }));

const checksum = "d".repeat(64);
const now = new Date("2026-08-29T05:00:00.000Z");
const context = { ip: "127.0.0.1", userAgent: "content-media-lock-test" };
const actor = {
  userId: 7,
  email: "operator@example.test",
  accessTokenJti: "content-media-lock-test",
  accessTokenExpiresAt: 2_000_000_000,
  roles: ["operator"],
  permissions: ["button:backoffice-content-media-upload"]
};
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

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const fakeConnection = (
  query: ContentMediaAdvisoryLockConnection["query"],
  end: ContentMediaAdvisoryLockConnection["end"] = jest.fn(async () => undefined),
  destroy: ContentMediaAdvisoryLockConnection["destroy"] = jest.fn()
): ContentMediaAdvisoryLockConnection => ({ query, end, destroy });

describe("ContentMediaRepository dedicated MariaDB advisory lock", () => {
  it("creates a dedicated driver connection from the validated database configuration", async () => {
    const connection = fakeConnection(jest.fn());
    jest.mocked(createConnection).mockResolvedValueOnce(connection as never);
    const factory = createContentMediaAdvisoryLockConnectionFactory({
      DATABASE_URL: "mysql://needo:p%40ss@db.internal:3307/needo_test",
      DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL: true,
      DATABASE_POOL_CONNECTION_LIMIT: 17,
      DATABASE_POOL_ACQUIRE_TIMEOUT_MS: 11_000,
      DATABASE_POOL_IDLE_TIMEOUT_MS: 22_000,
      DATABASE_POOL_CONNECT_TIMEOUT_MS: 3_000
    });

    await expect(factory()).resolves.toBe(connection);
    expect(createConnection).toHaveBeenCalledWith({
      host: "db.internal",
      port: 3307,
      user: "needo",
      password: "p@ss",
      database: "needo_test",
      charset: "utf8mb4",
      collation: "utf8mb4_unicode_ci",
      timezone: "Z",
      allowPublicKeyRetrieval: true,
      connectTimeout: 3_000
    });
  });

  it("holds the dedicated checksum lock until the normal Prisma transaction resolves", async () => {
    const events: string[] = [];
    const transactionReady = deferred();
    const allowCommit = deferred();
    const connection = fakeConnection(
      jest.fn(async (sql: string, values?: readonly unknown[]) => {
        if (sql.includes("GET_LOCK")) {
          events.push(`acquire:${String(values?.[0])}`);
          return [{ acquired: 1 }];
        }
        events.push("release");
        return [{ released: 1 }];
      }),
      jest.fn(async () => {
        events.push("end");
      })
    );
    const transaction = {
      mediaAsset: {
        create: jest.fn(async ({ data }) => {
          events.push("media");
          return { id: 201, ...data };
        })
      },
      auditLog: {
        create: jest.fn(async () => {
          events.push("audit");
          return { id: 301 };
        })
      }
    };
    const client = {
      $transaction: jest.fn(async (operation) => {
        events.push("transaction-start");
        const result = await operation(transaction);
        events.push("transaction-awaiting-commit");
        transactionReady.resolve();
        await allowCommit.promise;
        events.push("transaction-committed");
        return result;
      })
    };
    const factory: ContentMediaAdvisoryLockConnectionFactory = async () => connection;
    const repository = new ContentMediaRepository(client as never, factory, 3);

    const resultPromise = repository.withChecksumLock(checksum, async (locked) =>
      locked.create(createInput)
    );
    await transactionReady.promise;

    expect(events).toEqual([
      `acquire:${checksum}`,
      "transaction-start",
      "media",
      "audit",
      "transaction-awaiting-commit"
    ]);

    allowCommit.resolve();
    await expect(resultPromise).resolves.toMatchObject({ mediaAssetId: 201 });
    expect(events).toEqual([
      `acquire:${checksum}`,
      "transaction-start",
      "media",
      "audit",
      "transaction-awaiting-commit",
      "transaction-committed",
      "release",
      "end"
    ]);
    expect(connection.query).toHaveBeenNthCalledWith(1, "SELECT GET_LOCK(?, ?) AS acquired", [
      checksum,
      3
    ]);
    expect(connection.query).toHaveBeenNthCalledWith(2, "SELECT RELEASE_LOCK(?) AS released", [
      checksum
    ]);
  });

  it("compensates a canonical blob after commit rejection before releasing the lock", async () => {
    const directory = await mkdtemp(join(tmpdir(), "needo-content-commit-failure-"));
    const events: string[] = [];
    const persistenceError = new Error("commit rejected");
    const connection = fakeConnection(
      jest.fn(async (sql: string) => {
        if (sql.includes("GET_LOCK")) {
          events.push("acquire");
          return [{ acquired: 1 }];
        }
        events.push("release");
        return [{ released: 1 }];
      }),
      jest.fn(async () => {
        events.push("end");
      })
    );
    const client = {
      $transaction: jest.fn(async (operation) => {
        await operation({
          mediaAsset: { create: jest.fn(async ({ data }) => ({ id: 201, ...data })) },
          auditLog: { create: jest.fn(async () => ({ id: 301 })) }
        });
        events.push("commit-rejected");
        throw persistenceError;
      })
    };
    const storage = new ContentMediaFileStorage(directory);
    const prepared = await storage.prepare({ bytes: validPng, mimeType: "image/png" });
    const originalDelete = storage.delete.bind(storage);
    jest.spyOn(storage, "delete").mockImplementation(async (fileKey) => {
      events.push("compensate");
      await originalDelete(fileKey);
    });
    const repository = new ContentMediaRepository(client as never, async () => connection, 3);
    const service = new ContentMediaService(repository, storage);

    await expect(
      service.upload(actor, context, {
        bytes: validPng,
        mimeType: "image/png",
        altText: null,
        now
      })
    ).rejects.toBe(persistenceError);

    expect(events).toEqual(["acquire", "commit-rejected", "compensate", "release", "end"]);
    await expect(storage.read(prepared.fileKey)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("maps acquisition timeout to stable conflict and gracefully closes the connection", async () => {
    const end = jest.fn(async () => undefined);
    const destroy = jest.fn();
    const connection = fakeConnection(
      jest.fn(async () => [{ acquired: 0 }]),
      end,
      destroy
    );
    const repository = new ContentMediaRepository(
      { $transaction: jest.fn() } as never,
      async () => connection,
      1
    );
    const operation = jest.fn();

    await expect(repository.withChecksumLock(checksum, operation)).rejects.toMatchObject({
      message: "error.content.lock_conflict",
      statusCode: 409
    });
    expect(operation).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("force-destroys on release failure without masking callback success or its primary error", async () => {
    const releaseError = new Error("private release details");
    const warning = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    const createRepository = () => {
      const end = jest.fn(async () => undefined);
      const destroy = jest.fn(() => {
        throw new Error("private destroy details");
      });
      const connection = fakeConnection(
        jest
          .fn()
          .mockResolvedValueOnce([{ acquired: 1 }])
          .mockRejectedValueOnce(releaseError),
        end,
        destroy
      );
      return {
        repository: new ContentMediaRepository(
          { $transaction: jest.fn() } as never,
          async () => connection,
          1
        ),
        end,
        destroy
      };
    };

    const success = createRepository();
    await expect(
      success.repository.withChecksumLock(checksum, async () => "committed")
    ).resolves.toBe("committed");
    expect(success.destroy).toHaveBeenCalledTimes(1);
    expect(success.end).not.toHaveBeenCalled();

    const primaryError = new Error("primary operation failed");
    const failure = createRepository();
    await expect(
      failure.repository.withChecksumLock(checksum, async () => {
        throw primaryError;
      })
    ).rejects.toBe(primaryError);
    expect(failure.destroy).toHaveBeenCalledTimes(1);
    expect(failure.end).not.toHaveBeenCalled();

    expect(JSON.stringify(warning.mock.calls)).not.toContain("private release details");
    expect(JSON.stringify(warning.mock.calls)).not.toContain("private destroy details");
    warning.mockRestore();
  });

  it("does not mask success when graceful connection close fails", async () => {
    const warning = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    const destroy = jest.fn();
    const connection = fakeConnection(
      jest
        .fn()
        .mockResolvedValueOnce([{ acquired: 1 }])
        .mockResolvedValueOnce([{ released: 1 }]),
      jest.fn(async () => {
        throw new Error("private close details");
      }),
      destroy
    );
    const repository = new ContentMediaRepository(
      { $transaction: jest.fn() } as never,
      async () => connection,
      1
    );

    await expect(repository.withChecksumLock(checksum, async () => "committed")).resolves.toBe(
      "committed"
    );
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warning.mock.calls)).not.toContain("private close details");
    warning.mockRestore();
  });

  it("contains no Prisma-pooled or recursive advisory-lock query", async () => {
    const source = await readSourceFile(
      join(__dirname, "../src/repositories/content-media.repository.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/transaction\.\$queryRaw[\s\S]*GET_LOCK/u);
    expect(source).not.toContain("lockTimeoutSeconds * 1_000");
  });
});
