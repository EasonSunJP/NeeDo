type CacheEnvelope = {
  ciphertext: ArrayBuffer;
  iv: ArrayBuffer;
};

type PersistentCacheEntry = {
  scope: string;
  key: string;
  envelope: CacheEnvelope;
  fingerprint: string;
  updatedAt: string;
};

type PersistentCacheKey = {
  scope: string;
  key: CryptoKey;
};

export interface PersistentCacheDatabasePort {
  deleteEntry(scope: string, key: string): Promise<void>;
  deleteEntriesByPrefix(scope: string, keyPrefix: string): Promise<void>;
  deleteScope(scope: string): Promise<void>;
  deleteScopesByPrefix(scopePrefix: string): Promise<void>;
  getEntry(scope: string, key: string): Promise<PersistentCacheEntry | null>;
  getKey(scope: string): Promise<CryptoKey | null>;
  putEntry(entry: PersistentCacheEntry): Promise<void>;
  putKey(scope: string, key: CryptoKey): Promise<void>;
}

type MemoryValue = {
  fingerprint: string;
  value: unknown;
};

type PersistentResourceLoad<T> = {
  deduplicate?: boolean;
  force?: boolean;
  key: string;
  load: () => Promise<T>;
  onRefresh?: (value: T) => void;
  scope: string;
};

const databaseName = "needo.resource-cache.v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function compositeKey(scope: string, key: string) {
  return `${scope}\u0000${key}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("error.cache.database_request"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("error.cache.database_abort"));
    transaction.onerror = () => reject(transaction.error ?? new Error("error.cache.database_transaction"));
  });
}

async function deleteScopeRecords(store: IDBObjectStore, scope: string) {
  await new Promise<void>((resolve, reject) => {
    const request = store.openCursor();
    request.onerror = () => reject(request.error ?? new Error("error.cache.database_cursor"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const key = cursor.primaryKey;
      if ((Array.isArray(key) && key[0] === scope) || key === scope) cursor.delete();
      cursor.continue();
    };
  });
}

async function deleteScopePrefixRecords(store: IDBObjectStore, scopePrefix: string) {
  await new Promise<void>((resolve, reject) => {
    const request = store.openCursor();
    request.onerror = () => reject(request.error ?? new Error("error.cache.database_cursor"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const primaryKey = cursor.primaryKey;
      const scope = Array.isArray(primaryKey) ? primaryKey[0] : primaryKey;
      if (
        typeof scope === "string" &&
        (scope === scopePrefix || scope.startsWith(`${scopePrefix}:`))
      ) {
        cursor.delete();
      }
      cursor.continue();
    };
  });
}

async function deleteEntryPrefixRecords(store: IDBObjectStore, scope: string, keyPrefix: string) {
  await new Promise<void>((resolve, reject) => {
    const request = store.openCursor();
    request.onerror = () => reject(request.error ?? new Error("error.cache.database_cursor"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const primaryKey = cursor.primaryKey;
      if (
        Array.isArray(primaryKey) &&
        primaryKey[0] === scope &&
        typeof primaryKey[1] === "string" &&
        primaryKey[1].startsWith(keyPrefix)
      ) {
        cursor.delete();
      }
      cursor.continue();
    };
  });
}

export function createIndexedDbPersistentCacheDatabase(factory: IDBFactory): PersistentCacheDatabasePort {
  let opened: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (opened) return opened;
    opened = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("keys")) {
          database.createObjectStore("keys", { keyPath: "scope" });
        }
        if (!database.objectStoreNames.contains("entries")) {
          database.createObjectStore("entries", { keyPath: ["scope", "key"] });
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error("error.cache.database_open"));
      request.onblocked = () => reject(new Error("error.cache.database_blocked"));
    });
    return opened;
  };

  return {
    async deleteEntry(scope, key) {
      const database = await open();
      const transaction = database.transaction("entries", "readwrite");
      transaction.objectStore("entries").delete([scope, key]);
      await transactionDone(transaction);
    },
    async deleteEntriesByPrefix(scope, keyPrefix) {
      const database = await open();
      const transaction = database.transaction("entries", "readwrite");
      await deleteEntryPrefixRecords(transaction.objectStore("entries"), scope, keyPrefix);
      await transactionDone(transaction);
    },
    async deleteScope(scope) {
      const database = await open();
      const transaction = database.transaction(["entries", "keys"], "readwrite");
      await Promise.all([
        deleteScopeRecords(transaction.objectStore("entries"), scope),
        deleteScopeRecords(transaction.objectStore("keys"), scope)
      ]);
      await transactionDone(transaction);
    },
    async deleteScopesByPrefix(scopePrefix) {
      const database = await open();
      const transaction = database.transaction(["entries", "keys"], "readwrite");
      await Promise.all([
        deleteScopePrefixRecords(transaction.objectStore("entries"), scopePrefix),
        deleteScopePrefixRecords(transaction.objectStore("keys"), scopePrefix)
      ]);
      await transactionDone(transaction);
    },
    async getEntry(scope, key) {
      const database = await open();
      const transaction = database.transaction("entries", "readonly");
      const result = await requestResult(transaction.objectStore("entries").get([scope, key])) as PersistentCacheEntry | undefined;
      await transactionDone(transaction);
      return result ?? null;
    },
    async getKey(scope) {
      const database = await open();
      const transaction = database.transaction("keys", "readonly");
      const result = await requestResult(transaction.objectStore("keys").get(scope)) as PersistentCacheKey | undefined;
      await transactionDone(transaction);
      return result?.key ?? null;
    },
    async putEntry(entry) {
      const database = await open();
      const transaction = database.transaction("entries", "readwrite");
      transaction.objectStore("entries").put(entry);
      await transactionDone(transaction);
    },
    async putKey(scope, key) {
      const database = await open();
      const transaction = database.transaction("keys", "readwrite");
      transaction.objectStore("keys").put({ scope, key } satisfies PersistentCacheKey);
      await transactionDone(transaction);
    }
  };
}

export function createMemoryPersistentCacheDatabase() {
  const entries = new Map<string, PersistentCacheEntry>();
  const keys = new Map<string, CryptoKey>();
  const port: PersistentCacheDatabasePort & {
    inspectEntries(): PersistentCacheEntry[];
    seedCorruptEntry(scope: string, key: string): void;
  } = {
    async deleteEntry(scope, key) {
      entries.delete(compositeKey(scope, key));
    },
    async deleteEntriesByPrefix(scope, keyPrefix) {
      for (const [entryKey, entry] of entries) {
        if (entry.scope === scope && entry.key.startsWith(keyPrefix)) entries.delete(entryKey);
      }
    },
    async deleteScope(scope) {
      keys.delete(scope);
      for (const [entryKey, entry] of entries) {
        if (entry.scope === scope) entries.delete(entryKey);
      }
    },
    async deleteScopesByPrefix(scopePrefix) {
      for (const scope of [...keys.keys()]) {
        if (scope === scopePrefix || scope.startsWith(`${scopePrefix}:`)) keys.delete(scope);
      }
      for (const [entryKey, entry] of entries) {
        if (entry.scope === scopePrefix || entry.scope.startsWith(`${scopePrefix}:`)) {
          entries.delete(entryKey);
        }
      }
    },
    async getEntry(scope, key) {
      return entries.get(compositeKey(scope, key)) ?? null;
    },
    async getKey(scope) {
      return keys.get(scope) ?? null;
    },
    async putEntry(entry) {
      entries.set(compositeKey(entry.scope, entry.key), entry);
    },
    async putKey(scope, key) {
      keys.set(scope, key);
    },
    inspectEntries() {
      return [...entries.values()];
    },
    seedCorruptEntry(scope, key) {
      entries.set(compositeKey(scope, key), {
        scope,
        key,
        envelope: { ciphertext: new Uint8Array([1, 2, 3]).buffer, iv: new Uint8Array(12).buffer },
        fingerprint: "corrupt",
        updatedAt: new Date().toISOString()
      });
    }
  };
  return port;
}

function createUnavailableDatabase(): PersistentCacheDatabasePort {
  return createMemoryPersistentCacheDatabase();
}

async function createEncryptionKey() {
  return globalThis.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function fingerprint(serialized: string) {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(serialized));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function encrypt(key: CryptoKey, aad: string, serialized: string): Promise<CacheEnvelope> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { additionalData: encoder.encode(aad), iv, name: "AES-GCM" },
    key,
    encoder.encode(serialized)
  );
  return { ciphertext, iv: iv.buffer.slice(0) };
}

async function decrypt(key: CryptoKey, aad: string, envelope: CacheEnvelope) {
  const value = await globalThis.crypto.subtle.decrypt(
    { additionalData: encoder.encode(aad), iv: envelope.iv, name: "AES-GCM" },
    key,
    envelope.ciphertext
  );
  return decoder.decode(value);
}

export function createPersistentResourceCache(input: { database: PersistentCacheDatabasePort }) {
  const memory = new Map<string, MemoryValue>();
  const encryptionKeys = new Map<string, CryptoKey>();
  const checkedThisSession = new Set<string>();
  const refreshes = new Map<string, Promise<unknown>>();
  const refreshGenerations = new Map<string, number>();
  const writeQueues = new Map<string, Promise<unknown>>();
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  const lockGeneration = new Map<string, number>();

  async function getKey(scope: string, generation: number) {
    if ((lockGeneration.get(scope) ?? 0) !== generation) throw new Error("error.cache.locked");
    const cached = encryptionKeys.get(scope);
    if (cached) return cached;
    const existing = await input.database.getKey(scope);
    if ((lockGeneration.get(scope) ?? 0) !== generation) throw new Error("error.cache.locked");
    const key = existing ?? await createEncryptionKey();
    if (!existing) await input.database.putKey(scope, key);
    if ((lockGeneration.get(scope) ?? 0) !== generation) throw new Error("error.cache.locked");
    encryptionKeys.set(scope, key);
    return key;
  }

  async function read<T>(scope: string, key: string): Promise<MemoryValue | null> {
    const id = compositeKey(scope, key);
    const cached = memory.get(id);
    if (cached) return cached;
    const stored = await input.database.getEntry(scope, key);
    if (!stored) return null;
    const generation = lockGeneration.get(scope) ?? 0;
    try {
      const serialized = await decrypt(await getKey(scope, generation), id, stored.envelope);
      const value = JSON.parse(serialized) as T;
      const next = { fingerprint: stored.fingerprint, value } satisfies MemoryValue;
      if ((lockGeneration.get(scope) ?? 0) !== generation) return null;
      memory.set(id, next);
      return next;
    } catch {
      if ((lockGeneration.get(scope) ?? 0) === generation) {
        await input.database.deleteEntry(scope, key).catch(() => undefined);
      }
      return null;
    }
  }

  function notify<T>(scope: string, key: string, value: T) {
    listeners.get(compositeKey(scope, key))?.forEach((listener) => listener(value));
  }

  async function storeValue<T>(scope: string, key: string, value: T, generation: number) {
    const id = compositeKey(scope, key);
    const serialized = JSON.stringify(value);
    const nextFingerprint = await fingerprint(serialized);
    const current = memory.get(id) ?? await read<T>(scope, key);
    if ((lockGeneration.get(scope) ?? 0) !== generation) throw new Error("error.cache.locked");
    if (current?.fingerprint === nextFingerprint) {
      return { changed: false, value: current.value as T };
    }
    const envelope = await encrypt(await getKey(scope, generation), id, serialized);
    if ((lockGeneration.get(scope) ?? 0) !== generation) throw new Error("error.cache.locked");
    await input.database.putEntry({
      envelope,
      fingerprint: nextFingerprint,
      key,
      scope,
      updatedAt: new Date().toISOString()
    });
    memory.set(id, { fingerprint: nextFingerprint, value });
    notify(scope, key, value);
    return { changed: true, value };
  }

  async function refresh<T>(
    scope: string,
    key: string,
    load: () => Promise<T>,
    deduplicate = true,
    onRefresh?: (value: T) => void
  ) {
    const id = compositeKey(scope, key);
    const existingRefresh = refreshes.get(id) as Promise<T> | undefined;
    if (existingRefresh && deduplicate) return existingRefresh;
    const refreshGeneration = (refreshGenerations.get(id) ?? 0) + 1;
    refreshGenerations.set(id, refreshGeneration);
    const generation = lockGeneration.get(scope) ?? 0;
    const request = (async () => {
      const value = await load();
      if (refreshGenerations.get(id) !== refreshGeneration) return value;
      const stored = await storeValue(scope, key, value, generation);
      if (stored.changed) onRefresh?.(stored.value);
      return stored.value;
    })();
    refreshes.set(id, request);
    try {
      return await request;
    } finally {
      if (refreshes.get(id) === request) refreshes.delete(id);
    }
  }

  return {
    async clearScope(scope: string) {
      this.lock(scope);
      await input.database.deleteScope(scope);
    },
    async clearScopePrefix(scopePrefix: string) {
      this.lockScopePrefix(scopePrefix);
      await input.database.deleteScopesByPrefix(scopePrefix);
    },
    async invalidate(scope: string, keyPrefix = "") {
      checkedThisSession.forEach((id) => {
        if (id.startsWith(compositeKey(scope, keyPrefix))) checkedThisSession.delete(id);
      });
      for (const id of [...memory.keys()]) {
        if (!id.startsWith(compositeKey(scope, keyPrefix))) continue;
        memory.delete(id);
      }
      await input.database.deleteEntriesByPrefix(scope, keyPrefix);
    },
    async load<T>({
      deduplicate = true,
      force = false,
      key,
      load,
      onRefresh,
      scope
    }: PersistentResourceLoad<T>): Promise<T> {
      const id = compositeKey(scope, key);
      const cached = await read<T>(scope, key);
      if (force || !cached) {
        checkedThisSession.add(id);
        return refresh(scope, key, load, deduplicate);
      }
      if (!checkedThisSession.has(id)) {
        checkedThisSession.add(id);
        void refresh(scope, key, load, true, onRefresh).catch(() => undefined);
      }
      return cached.value as T;
    },
    lock(scope: string) {
      lockGeneration.set(scope, (lockGeneration.get(scope) ?? 0) + 1);
      encryptionKeys.delete(scope);
      checkedThisSession.forEach((id) => {
        if (id.startsWith(`${scope}\u0000`)) checkedThisSession.delete(id);
      });
      for (const id of [...memory.keys()]) {
        if (id.startsWith(`${scope}\u0000`)) memory.delete(id);
      }
      for (const id of [...refreshes.keys()]) {
        if (id.startsWith(`${scope}\u0000`)) refreshes.delete(id);
      }
      for (const id of [...refreshGenerations.keys()]) {
        if (id.startsWith(`${scope}\u0000`)) refreshGenerations.delete(id);
      }
      for (const id of [...writeQueues.keys()]) {
        if (id.startsWith(`${scope}\u0000`)) writeQueues.delete(id);
      }
    },
    lockScopePrefix(scopePrefix: string) {
      const scopes = new Set<string>();
      encryptionKeys.forEach((_, scope) => scopes.add(scope));
      for (const id of [...memory.keys(), ...checkedThisSession, ...refreshes.keys(), ...refreshGenerations.keys(), ...writeQueues.keys()]) {
        scopes.add(id.split("\u0000", 1)[0] ?? "");
      }
      scopes.forEach((scope) => {
        if (scope === scopePrefix || scope.startsWith(`${scopePrefix}:`)) this.lock(scope);
      });
    },
    peek<T>(scope: string, key: string) {
      return memory.get(compositeKey(scope, key))?.value as T | undefined;
    },
    async read<T>(scope: string, key: string): Promise<T | null> {
      const cached = await read<T>(scope, key);
      return cached ? cached.value as T : null;
    },
    subscribe<T>(scope: string, key: string, listener: (value: T) => void) {
      const id = compositeKey(scope, key);
      const current = listeners.get(id) ?? new Set();
      current.add(listener as (value: unknown) => void);
      listeners.set(id, current);
      return () => {
        current.delete(listener as (value: unknown) => void);
        if (current.size === 0) listeners.delete(id);
      };
    },
    write<T>(scope: string, key: string, value: T) {
      const id = compositeKey(scope, key);
      const generation = lockGeneration.get(scope) ?? 0;
      const previous = writeQueues.get(id) ?? Promise.resolve();
      const write = previous
        .catch(() => undefined)
        .then(() => storeValue(scope, key, value, generation))
        .then((stored) => stored.value);
      writeQueues.set(id, write);
      return write.finally(() => {
        if (writeQueues.get(id) === write) writeQueues.delete(id);
      });
    }
  };
}

export type PersistentResourceCache = ReturnType<typeof createPersistentResourceCache>;

export const persistentResourceCache = createPersistentResourceCache({
  database: typeof indexedDB === "undefined"
    ? createUnavailableDatabase()
    : createIndexedDbPersistentCacheDatabase(indexedDB)
});
