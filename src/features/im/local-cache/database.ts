import type { ImCacheEnvelope } from "./crypto";

export const imOpenedMediaCacheDatabaseName = "needo.im.cache.v1";

export type ImCachedMediaRecord = {
  accountId: string;
  conversationId: string;
  messageId: string;
  envelope: ImCacheEnvelope;
  updatedAt: string;
};

export type ImOpenedMediaCacheUsage = {
  mediaBytes: number;
};

export interface ImOpenedMediaCacheDatabasePort {
  clearAccount(accountId: string): Promise<void>;
  deleteMedia(accountId: string, conversationId: string, messageId: string): Promise<void>;
  getKey(accountId: string): Promise<CryptoKey | null>;
  getMedia(accountId: string, conversationId: string, messageId: string): Promise<ImCachedMediaRecord | null>;
  getMediaTerminal(accountId: string, conversationId: string, messageId: string): Promise<boolean>;
  getUsage(accountId: string): Promise<ImOpenedMediaCacheUsage>;
  putKey(accountId: string, key: CryptoKey): Promise<void>;
  putMediaUnlessTerminal(record: ImCachedMediaRecord): Promise<boolean>;
  terminalizeMedia(accountId: string, conversationId: string, messageId: string): Promise<void>;
}

type KeyRecord = { accountId: string; key: CryptoKey };
type StateRecord = { accountId: string; name: string; updatedAt: string };

function mediaTerminalStateName(conversationId: string, messageId: string) {
  return `media-terminal:${JSON.stringify([conversationId, messageId])}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      request.error ?? new Error("error.im.local_cache_database_request"),
    );
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(
      transaction.error ?? new Error("error.im.local_cache_database_abort"),
    );
    transaction.onerror = () => reject(
      transaction.error ?? new Error("error.im.local_cache_database_transaction"),
    );
  });
}

async function deleteAccountRecords(store: IDBObjectStore, accountId: string) {
  await new Promise<void>((resolve, reject) => {
    const request = store.openCursor();
    request.onerror = () => reject(
      request.error ?? new Error("error.im.local_cache_database_cursor"),
    );
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }

      const key = cursor.primaryKey;
      if ((Array.isArray(key) && key[0] === accountId) || key === accountId) {
        cursor.delete();
      }
      cursor.continue();
    };
  });
}

export function createImOpenedMediaCacheDatabase(
  factory: IDBFactory,
): ImOpenedMediaCacheDatabasePort {
  let opened: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (opened) return opened;

    opened = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(imOpenedMediaCacheDatabaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("keys")) {
          database.createObjectStore("keys", { keyPath: "accountId" });
        }
        if (!database.objectStoreNames.contains("messages")) {
          database.createObjectStore("messages", {
            keyPath: ["accountId", "conversationId", "messageId"],
          });
        }
        if (!database.objectStoreNames.contains("media")) {
          database.createObjectStore("media", {
            keyPath: ["accountId", "conversationId", "messageId"],
          });
        }
        if (!database.objectStoreNames.contains("state")) {
          database.createObjectStore("state", { keyPath: ["accountId", "name"] });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(
        request.error ?? new Error("error.im.local_cache_database_open"),
      );
      request.onblocked = () => reject(
        new Error("error.im.local_cache_database_blocked"),
      );
    });

    return opened;
  };
  const compositeKey = (accountId: string, conversationId: string, messageId: string) =>
    [accountId, conversationId, messageId];

  return {
    async clearAccount(accountId) {
      const database = await open();
      const transaction = database.transaction(
        ["keys", "messages", "media", "state"],
        "readwrite",
      );
      await Promise.all(
        ["keys", "messages", "media", "state"].map((storeName) =>
          deleteAccountRecords(transaction.objectStore(storeName), accountId),
        ),
      );
      await transactionDone(transaction);
    },
    async deleteMedia(accountId, conversationId, messageId) {
      const database = await open();
      const transaction = database.transaction("media", "readwrite");
      transaction.objectStore("media").delete(
        compositeKey(accountId, conversationId, messageId),
      );
      await transactionDone(transaction);
    },
    async getKey(accountId) {
      const database = await open();
      const transaction = database.transaction("keys", "readonly");
      const record = await requestResult(
        transaction.objectStore("keys").get(accountId),
      ) as KeyRecord | undefined;
      await transactionDone(transaction);
      return record?.key ?? null;
    },
    async getMedia(accountId, conversationId, messageId) {
      const database = await open();
      const transaction = database.transaction("media", "readonly");
      const record = await requestResult(
        transaction.objectStore("media").get(
          compositeKey(accountId, conversationId, messageId),
        ),
      ) as ImCachedMediaRecord | undefined;
      await transactionDone(transaction);
      return record ?? null;
    },
    async getMediaTerminal(accountId, conversationId, messageId) {
      const database = await open();
      const transaction = database.transaction("state", "readonly");
      const record = await requestResult(
        transaction.objectStore("state").get([
          accountId,
          mediaTerminalStateName(conversationId, messageId),
        ]),
      ) as StateRecord | undefined;
      await transactionDone(transaction);
      return Boolean(record);
    },
    async getUsage(accountId) {
      const database = await open();
      const transaction = database.transaction("media", "readonly");
      const records = await requestResult(
        transaction.objectStore("media").getAll(),
      ) as ImCachedMediaRecord[];
      await transactionDone(transaction);
      return {
        mediaBytes: records
          .filter((record) => record.accountId === accountId)
          .reduce(
            (total, record) =>
              total + record.envelope.ciphertext.byteLength + record.envelope.iv.byteLength,
            0,
          ),
      };
    },
    async putKey(accountId, key) {
      const database = await open();
      const transaction = database.transaction("keys", "readwrite");
      transaction.objectStore("keys").put({ accountId, key } satisfies KeyRecord);
      await transactionDone(transaction);
    },
    async putMediaUnlessTerminal(record) {
      const database = await open();
      const transaction = database.transaction(["media", "state"], "readwrite");
      const terminal = await requestResult(
        transaction.objectStore("state").get([
          record.accountId,
          mediaTerminalStateName(record.conversationId, record.messageId),
        ]),
      ) as StateRecord | undefined;
      if (terminal) {
        await transactionDone(transaction);
        return false;
      }
      transaction.objectStore("media").put(record);
      await transactionDone(transaction);
      return true;
    },
    async terminalizeMedia(accountId, conversationId, messageId) {
      const database = await open();
      const transaction = database.transaction(["media", "state"], "readwrite");
      transaction.objectStore("state").put({
        accountId,
        name: mediaTerminalStateName(conversationId, messageId),
        updatedAt: new Date().toISOString(),
      } satisfies StateRecord);
      transaction.objectStore("media").delete(
        compositeKey(accountId, conversationId, messageId),
      );
      await transactionDone(transaction);
    },
  };
}

export function createUnavailableImOpenedMediaCacheDatabase(): ImOpenedMediaCacheDatabasePort {
  return {
    clearAccount: async () => undefined,
    deleteMedia: async () => undefined,
    getKey: async () => null,
    getMedia: async () => null,
    getMediaTerminal: async () => false,
    getUsage: async () => ({ mediaBytes: 0 }),
    putKey: async () => undefined,
    putMediaUnlessTerminal: async () => {
      throw new Error("error.im.local_cache_database_unavailable");
    },
    terminalizeMedia: async () => undefined,
  };
}
