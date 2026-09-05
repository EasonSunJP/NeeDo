import type { ConversationMessage } from "../model";
import {
  createImOpenedMediaCacheDatabase,
  createUnavailableImOpenedMediaCacheDatabase,
  type ImOpenedMediaCacheDatabasePort,
} from "./database";
import {
  createImCacheKey,
  decryptImCacheValue,
  encryptImCacheValue,
} from "./crypto";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const maxCachedMediaBytes = 64 * 1024 * 1024;
const maxCachedMediaMimeBytes = 1_024;

type ObjectUrlPort = {
  create(blob: Blob): string;
  revoke(url: string): void;
};

export type ImOpenedMediaCacheIntent = {
  generation: number;
  key: string;
};

function mediaAad(accountId: string, conversationId: string, messageId: string) {
  return `account:${accountId}:media:${conversationId}:${messageId}`;
}

function encodeMediaPayload(
  kind: "image" | "video",
  mimeType: string,
  bytes: Uint8Array<ArrayBuffer>,
) {
  const mimeBytes = encoder.encode(mimeType || "application/octet-stream");
  if (mimeBytes.byteLength < 1 || mimeBytes.byteLength > maxCachedMediaMimeBytes) {
    throw new Error("error.im.local_cache_media_mime_invalid");
  }

  const payload = new Uint8Array(4 + mimeBytes.byteLength + bytes.byteLength);
  payload[0] = 1;
  payload[1] = kind === "image" ? 1 : 2;
  new DataView(payload.buffer).setUint16(2, mimeBytes.byteLength);
  payload.set(mimeBytes, 4);
  payload.set(bytes, 4 + mimeBytes.byteLength);
  return payload;
}

function decodeMediaPayload(payload: Uint8Array<ArrayBuffer>) {
  if (payload.byteLength < 5 || payload[0] !== 1 || ![1, 2].includes(payload[1]!)) {
    throw new Error("error.im.local_cache_media_payload_invalid");
  }

  const mimeLength = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  ).getUint16(2);
  const mediaStart = 4 + mimeLength;
  if (
    mimeLength < 1 ||
    mimeLength > maxCachedMediaMimeBytes ||
    mediaStart >= payload.byteLength
  ) {
    throw new Error("error.im.local_cache_media_payload_invalid");
  }

  return {
    bytes: payload.slice(mediaStart),
    mimeType: decoder.decode(payload.slice(4, mediaStart)),
  };
}

function isCacheableOpenedMedia(message: ConversationMessage, blob: Blob) {
  const hasExpectedMime = message.type === "image"
    ? blob.type.startsWith("image/")
    : message.type === "video" && blob.type.startsWith("video/");
  return (
    (message.type === "image" || message.type === "video") &&
    !message.id.startsWith("local-") &&
    message.status !== "sending" &&
    message.status !== "failed" &&
    message.status !== "recalled" &&
    message.serverState !== "recalled" &&
    message.ext?.mediaState !== "expired" &&
    message.privacyPolicyVersionAtSend === undefined &&
    message.ext?.disappearing === undefined &&
    hasExpectedMime &&
    blob.size > 0 &&
    blob.size <= maxCachedMediaBytes
  );
}

export function createImOpenedMediaCacheService(input: {
  database: ImOpenedMediaCacheDatabasePort;
  objectUrls?: ObjectUrlPort;
}) {
  const keys = new Map<string, CryptoKey>();
  const lockGenerations = new Map<string, number>();
  const lockedAccounts = new Set<string>();
  const accountQueues = new Map<string, Promise<void>>();
  const activeObjectUrls = new Map<string, { accountId: string; url: string }>();
  const objectUrlGenerations = new Map<string, number>();
  const mediaIntentGenerations = new Map<string, number>();
  const terminalMedia = new Set<string>();
  const objectUrls = input.objectUrls ?? {
    create: (blob: Blob) => URL.createObjectURL(blob),
    revoke: (url: string) => URL.revokeObjectURL(url),
  };
  const objectKey = (accountId: string, conversationId: string, messageId: string) =>
    `${accountId}:${conversationId}:${messageId}`;

  function assertUnlocked(accountId: string, generation: number) {
    if (
      lockedAccounts.has(accountId) ||
      (lockGenerations.get(accountId) ?? 0) !== generation
    ) {
      throw new Error("error.im.local_cache_locked");
    }
  }

  function runAccountOperation<T>(
    accountId: string,
    operation: (generation: number) => Promise<T>,
  ) {
    const previous = accountQueues.get(accountId) ?? Promise.resolve();
    const generation = lockGenerations.get(accountId) ?? 0;
    const result = previous.catch(() => undefined).then(() => operation(generation));
    const settled = result.then(() => undefined, () => undefined);
    accountQueues.set(accountId, settled);
    return result.finally(() => {
      if (accountQueues.get(accountId) === settled) accountQueues.delete(accountId);
    });
  }

  async function unlock(accountId: string) {
    if (keys.has(accountId)) return;
    lockedAccounts.delete(accountId);
    const generation = lockGenerations.get(accountId) ?? 0;
    const existing = await input.database.getKey(accountId);
    assertUnlocked(accountId, generation);
    const key = existing ?? await createImCacheKey();
    assertUnlocked(accountId, generation);
    if (!existing) {
      await input.database.putKey(accountId, key);
      assertUnlocked(accountId, generation);
    }
    keys.set(accountId, key);
  }

  async function requireKey(accountId: string, generation: number) {
    assertUnlocked(accountId, generation);
    await unlock(accountId);
    assertUnlocked(accountId, generation);
    const key = keys.get(accountId);
    if (!key) throw new Error("error.im.local_cache_locked");
    return key;
  }

  function releaseObjectUrl(accountId: string, conversationId: string, messageId: string) {
    const key = objectKey(accountId, conversationId, messageId);
    objectUrlGenerations.set(key, (objectUrlGenerations.get(key) ?? 0) + 1);
    const active = activeObjectUrls.get(key);
    if (!active) return;
    activeObjectUrls.delete(key);
    objectUrls.revoke(active.url);
  }

  async function beginCacheOpenedMedia(
    accountId: string,
    conversationId: string,
    messageId: string,
  ): Promise<ImOpenedMediaCacheIntent> {
    const key = objectKey(accountId, conversationId, messageId);
    if (terminalMedia.has(key)) {
      throw new Error("error.im.local_cache_media_terminal");
    }
    if (await input.database.getMediaTerminal(accountId, conversationId, messageId)) {
      terminalMedia.add(key);
      throw new Error("error.im.local_cache_media_terminal");
    }
    if (terminalMedia.has(key)) {
      throw new Error("error.im.local_cache_media_terminal");
    }
    return { generation: mediaIntentGenerations.get(key) ?? 0, key };
  }

  function assertCurrentMediaIntent(intent: ImOpenedMediaCacheIntent) {
    if (
      terminalMedia.has(intent.key) ||
      (mediaIntentGenerations.get(intent.key) ?? 0) !== intent.generation
    ) {
      throw new Error("error.im.local_cache_media_terminal");
    }
  }

  function lock(accountId: string) {
    lockedAccounts.add(accountId);
    lockGenerations.set(accountId, (lockGenerations.get(accountId) ?? 0) + 1);
    keys.delete(accountId);
    for (const [key, active] of activeObjectUrls) {
      if (active.accountId !== accountId) continue;
      activeObjectUrls.delete(key);
      objectUrls.revoke(active.url);
    }
  }

  return {
    beginCacheOpenedMedia,
    async unlock(accountId: string) {
      await unlock(accountId);
    },
    lock,
    async cacheOpenedMedia(
      accountId: string,
      message: ConversationMessage,
      blob: Blob,
      suppliedIntent?: ImOpenedMediaCacheIntent,
    ) {
      if (!isCacheableOpenedMedia(message, blob)) {
        throw new Error("error.im.local_cache_media_invalid");
      }
      const intent = suppliedIntent ?? await beginCacheOpenedMedia(
        accountId,
        message.conversationId,
        message.id,
      );
      if (intent.key !== objectKey(accountId, message.conversationId, message.id)) {
        throw new Error("error.im.local_cache_media_intent_invalid");
      }
      assertCurrentMediaIntent(intent);

      await runAccountOperation(accountId, async (generation) => {
        assertCurrentMediaIntent(intent);
        if (await input.database.getMediaTerminal(
          accountId,
          message.conversationId,
          message.id,
        )) {
          terminalMedia.add(intent.key);
          throw new Error("error.im.local_cache_media_terminal");
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        assertUnlocked(accountId, generation);
        assertCurrentMediaIntent(intent);
        const envelope = await encryptImCacheValue(
          await requireKey(accountId, generation),
          mediaAad(accountId, message.conversationId, message.id),
          encodeMediaPayload(message.type as "image" | "video", blob.type, bytes),
        );
        assertUnlocked(accountId, generation);
        assertCurrentMediaIntent(intent);
        const stored = await input.database.putMediaUnlessTerminal({
          accountId,
          conversationId: message.conversationId,
          messageId: message.id,
          envelope,
          updatedAt: new Date().toISOString(),
        });
        if (!stored) {
          terminalMedia.add(intent.key);
          throw new Error("error.im.local_cache_media_terminal");
        }
        assertUnlocked(accountId, generation);
        assertCurrentMediaIntent(intent);
      });
    },
    async getCachedMediaObjectUrl(
      accountId: string,
      conversationId: string,
      messageId: string,
    ) {
      const key = objectKey(accountId, conversationId, messageId);
      if (terminalMedia.has(key)) return undefined;
      const requestedGeneration = objectUrlGenerations.get(key) ?? 0;
      return runAccountOperation(accountId, async (generation) => {
        if (terminalMedia.has(key)) return undefined;
        if (await input.database.getMediaTerminal(accountId, conversationId, messageId)) {
          terminalMedia.add(key);
          return undefined;
        }
        const active = activeObjectUrls.get(key);
        if (active) return active.url;
        const record = await input.database.getMedia(accountId, conversationId, messageId);
        if (!record) return undefined;

        try {
          const decrypted = await decryptImCacheValue(
            await requireKey(accountId, generation),
            mediaAad(accountId, conversationId, messageId),
            record.envelope,
          );
          assertUnlocked(accountId, generation);
          if (terminalMedia.has(key)) return undefined;
          if ((objectUrlGenerations.get(key) ?? 0) !== requestedGeneration) {
            return undefined;
          }
          const payload = decodeMediaPayload(decrypted);
          const url = objectUrls.create(
            new Blob([payload.bytes], { type: payload.mimeType }),
          );
          activeObjectUrls.set(key, { accountId, url });
          return url;
        } catch (error) {
          if (lockedAccounts.has(accountId)) throw error;
          await input.database.deleteMedia(accountId, conversationId, messageId);
          return undefined;
        }
      });
    },
    releaseCachedMediaObjectUrl(
      accountId: string,
      conversationId: string,
      messageId: string,
    ) {
      releaseObjectUrl(accountId, conversationId, messageId);
    },
    async purgeMedia(accountId: string, conversationId: string, messageId: string) {
      const key = objectKey(accountId, conversationId, messageId);
      terminalMedia.add(key);
      mediaIntentGenerations.set(key, (mediaIntentGenerations.get(key) ?? 0) + 1);
      await runAccountOperation(accountId, async () => {
        releaseObjectUrl(accountId, conversationId, messageId);
        await input.database.terminalizeMedia(accountId, conversationId, messageId);
      });
    },
    getUsage(accountId: string) {
      return input.database.getUsage(accountId);
    },
    async clearAccount(accountId: string) {
      lock(accountId);
      const generation = lockGenerations.get(accountId) ?? 0;
      await runAccountOperation(accountId, async () => {
        await input.database.clearAccount(accountId);
      });
      for (const key of terminalMedia) {
        if (key.startsWith(`${accountId}:`)) terminalMedia.delete(key);
      }
      if ((lockGenerations.get(accountId) ?? 0) === generation) {
        await unlock(accountId);
      }
    },
  };
}

export type ImOpenedMediaCacheService = ReturnType<typeof createImOpenedMediaCacheService>;

export async function transitionImOpenedMediaCacheAccount(
  previousAccountId: string | null,
  nextAccountId: string | null,
  service: Pick<ImOpenedMediaCacheService, "lock" | "unlock"> = getImOpenedMediaCacheService(),
) {
  if (previousAccountId === nextAccountId) return;
  if (previousAccountId) service.lock(previousAccountId);
  if (nextAccountId) await service.unlock(nextAccountId);
}

let singleton: ImOpenedMediaCacheService | null = null;

export function getImOpenedMediaCacheService(): ImOpenedMediaCacheService {
  if (!singleton) {
    const database = typeof indexedDB === "undefined"
      ? createUnavailableImOpenedMediaCacheDatabase()
      : createImOpenedMediaCacheDatabase(indexedDB);
    singleton = createImOpenedMediaCacheService({ database });
  }

  return singleton;
}
