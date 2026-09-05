import { describe, expect, it, vi } from "vitest";
import type { ConversationMessage } from "../model";
import type {
  ImCachedMediaRecord,
  ImOpenedMediaCacheDatabasePort,
} from "./database";
import {
  createImOpenedMediaCacheService,
  transitionImOpenedMediaCacheAccount,
} from "./service";

const message: ConversationMessage = {
  id: "9",
  localId: "9",
  conversationId: "2",
  senderId: "7",
  type: "image",
  content: "",
  status: "sent",
  sentAt: "2026-09-05T00:00:00.000Z",
  clientSeq: 9,
  serverState: "active",
  ext: {
    fileName: "private.jpg",
    mediaState: "available",
    thumbnailUrl: "/media/im/thumbnail.jpg",
    url: "/media/im/original.jpg",
  },
};

function createMemoryDatabase() {
  const keys = new Map<string, CryptoKey>();
  const media = new Map<string, ImCachedMediaRecord>();
  const terminalMedia = new Set<string>();
  const keyFor = (accountId: string, conversationId: string, messageId: string) =>
    `${accountId}:${conversationId}:${messageId}`;
  const database: ImOpenedMediaCacheDatabasePort = {
    clearAccount: vi.fn(async (accountId) => {
      keys.delete(accountId);
      [...media.keys()]
        .filter((key) => key.startsWith(`${accountId}:`))
        .forEach((key) => media.delete(key));
      [...terminalMedia]
        .filter((key) => key.startsWith(`${accountId}:`))
        .forEach((key) => terminalMedia.delete(key));
    }),
    deleteMedia: vi.fn(async (accountId, conversationId, messageId) => {
      media.delete(keyFor(accountId, conversationId, messageId));
    }),
    getKey: vi.fn(async (accountId) => keys.get(accountId) ?? null),
    getMedia: vi.fn(async (accountId, conversationId, messageId) =>
      media.get(keyFor(accountId, conversationId, messageId)) ?? null),
    getMediaTerminal: vi.fn(async (accountId, conversationId, messageId) =>
      terminalMedia.has(keyFor(accountId, conversationId, messageId))),
    getUsage: vi.fn(async (accountId) => ({
      mediaBytes: [...media.values()]
        .filter((record) => record.accountId === accountId)
        .reduce(
          (total, record) =>
            total + record.envelope.ciphertext.byteLength + record.envelope.iv.byteLength,
          0,
        ),
    })),
    putKey: vi.fn(async (accountId, key) => {
      keys.set(accountId, key);
    }),
    putMediaUnlessTerminal: vi.fn(async (record) => {
      const key = keyFor(record.accountId, record.conversationId, record.messageId);
      if (terminalMedia.has(key)) return false;
      media.set(keyFor(record.accountId, record.conversationId, record.messageId), record);
      return true;
    }),
    terminalizeMedia: vi.fn(async (accountId, conversationId, messageId) => {
      const key = keyFor(accountId, conversationId, messageId);
      terminalMedia.add(key);
      media.delete(key);
    }),
  };
  return { database, media, terminalMedia };
}

describe("opened IM media encrypted cache", () => {
  it("encrypts media metadata and bytes and isolates records by account", async () => {
    const fixture = createMemoryDatabase();
    const createObjectUrl = vi.fn(() => "blob:decrypted-copy");
    const service = createImOpenedMediaCacheService({
      database: fixture.database,
      objectUrls: { create: createObjectUrl, revoke: vi.fn() },
    });

    await service.cacheOpenedMedia(
      "account-a",
      message,
      new Blob(["private-image-bytes"], { type: "image/jpeg" }),
    );

    const stored = [...fixture.media.values()][0]!;
    expect(stored).not.toHaveProperty("kind");
    expect(stored).not.toHaveProperty("mimeType");
    expect(stored).not.toHaveProperty("url");
    expect(JSON.stringify(stored)).not.toContain("image/jpeg");
    expect(JSON.stringify(stored)).not.toContain("private-image-bytes");
    await expect(service.getCachedMediaObjectUrl("account-b", "2", "9"))
      .resolves.toBeUndefined();
    await expect(service.getCachedMediaObjectUrl("account-a", "2", "9"))
      .resolves.toBe("blob:decrypted-copy");
    expect(createObjectUrl).toHaveBeenCalledOnce();
  });

  it("revokes decrypted URLs and blocks late writes after logout lock", async () => {
    const fixture = createMemoryDatabase();
    const revoke = vi.fn();
    const service = createImOpenedMediaCacheService({
      database: fixture.database,
      objectUrls: { create: vi.fn(() => "blob:opened"), revoke },
    });

    await service.cacheOpenedMedia(
      "account-a",
      message,
      new Blob(["private-image-bytes"], { type: "image/jpeg" }),
    );
    await service.getCachedMediaObjectUrl("account-a", "2", "9");
    service.lock("account-a");
    service.lock("account-a");

    expect(revoke).toHaveBeenCalledTimes(1);
    await expect(
      service.cacheOpenedMedia(
        "account-a",
        message,
        new Blob(["late"], { type: "image/jpeg" }),
      ),
    ).rejects.toThrow("error.im.local_cache_locked");
  });

  it("purges the encrypted media record for recall, privacy deletion, or delete-for-me", async () => {
    const fixture = createMemoryDatabase();
    const revoke = vi.fn();
    const service = createImOpenedMediaCacheService({
      database: fixture.database,
      objectUrls: { create: vi.fn(() => "blob:opened"), revoke },
    });
    await service.cacheOpenedMedia(
      "account-a",
      message,
      new Blob(["private-image-bytes"], { type: "image/jpeg" }),
    );
    await service.getCachedMediaObjectUrl("account-a", "2", "9");

    await service.purgeMedia("account-a", "2", "9");

    expect(fixture.database.terminalizeMedia).toHaveBeenCalledWith("account-a", "2", "9");
    expect(revoke).toHaveBeenCalledWith("blob:opened");
    await expect(service.getCachedMediaObjectUrl("account-a", "2", "9"))
      .resolves.toBeUndefined();
  });

  it("does not let an in-flight opened-media fetch restore a terminally purged record", async () => {
    const fixture = createMemoryDatabase();
    const service = createImOpenedMediaCacheService({ database: fixture.database });
    const intent = await service.beginCacheOpenedMedia("account-a", "2", "9");

    await service.purgeMedia("account-a", "2", "9");

    await expect(service.cacheOpenedMedia(
      "account-a",
      message,
      new Blob(["late-private-image"], { type: "image/jpeg" }),
      intent,
    )).rejects.toThrow("error.im.local_cache_media_terminal");
    expect(fixture.database.putMediaUnlessTerminal).not.toHaveBeenCalled();
    await expect(service.getCachedMediaObjectUrl("account-a", "2", "9"))
      .resolves.toBeUndefined();
  });

  it("fails the whole terminal transaction without a partial tombstone or delete", async () => {
    const fixture = createMemoryDatabase();
    const firstService = createImOpenedMediaCacheService({ database: fixture.database });
    await firstService.cacheOpenedMedia(
      "account-a",
      message,
      new Blob(["private-image-bytes"], { type: "image/jpeg" }),
    );
    vi.mocked(fixture.database.terminalizeMedia).mockRejectedValueOnce(
      new Error("simulated IndexedDB terminal transaction failure"),
    );

    await expect(firstService.purgeMedia("account-a", "2", "9"))
      .rejects.toThrow("simulated IndexedDB terminal transaction failure");
    expect(fixture.database.terminalizeMedia).toHaveBeenCalledWith(
      "account-a",
      "2",
      "9",
    );
    expect(fixture.media.size).toBe(1);

    const refreshedService = createImOpenedMediaCacheService({
      database: fixture.database,
    });
    await expect(refreshedService.getCachedMediaObjectUrl("account-a", "2", "9"))
      .resolves.toBeDefined();
  });

  it("atomically prevents one service instance from writing after another terminalizes", async () => {
    const fixture = createMemoryDatabase();
    const oldTab = createImOpenedMediaCacheService({ database: fixture.database });
    const deletingTab = createImOpenedMediaCacheService({ database: fixture.database });
    const intent = await oldTab.beginCacheOpenedMedia("account-a", "2", "9");

    await deletingTab.purgeMedia("account-a", "2", "9");

    await expect(oldTab.cacheOpenedMedia(
      "account-a",
      message,
      new Blob(["late-private-image"], { type: "image/jpeg" }),
      intent,
    )).rejects.toThrow("error.im.local_cache_media_terminal");
    expect(fixture.media.size).toBe(0);
  });

  it("locks the previous account before unlocking a different authenticated account", async () => {
    const lifecycle = {
      lock: vi.fn(),
      unlock: vi.fn(async () => undefined),
    };

    await transitionImOpenedMediaCacheAccount("account-a", "account-b", lifecycle);

    expect(lifecycle.lock).toHaveBeenCalledWith("account-a");
    expect(lifecycle.unlock).toHaveBeenCalledWith("account-b");
    expect(lifecycle.lock.mock.invocationCallOrder[0])
      .toBeLessThan(lifecycle.unlock.mock.invocationCallOrder[0]!);
  });
});
