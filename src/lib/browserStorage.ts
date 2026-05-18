export type BrowserStorageKind = "local" | "session";

type BrowserStorageOptions = {
  kind?: BrowserStorageKind;
  silent?: boolean;
};

type ParseBrowserStorageJsonOptions = BrowserStorageOptions & {
  removeOnError?: boolean;
};

function resolveStorage(kind: BrowserStorageKind) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function logStorageWarning(action: string, key: string, kind: BrowserStorageKind, error: unknown, silent?: boolean) {
  if (silent) {
    return;
  }

  console.warn(`NeeDo ${kind}Storage ${action} failed for "${key}".`, error);
}

export function readBrowserStorage(key: string, options?: BrowserStorageOptions) {
  const kind = options?.kind ?? "local";
  const storage = resolveStorage(kind);

  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch (error) {
    logStorageWarning("read", key, kind, error, options?.silent);
    return null;
  }
}

export function writeBrowserStorage(key: string, value: string, options?: BrowserStorageOptions) {
  const kind = options?.kind ?? "local";
  const storage = resolveStorage(kind);

  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    logStorageWarning("write", key, kind, error, options?.silent);
    return false;
  }
}

export function removeBrowserStorage(key: string, options?: BrowserStorageOptions) {
  const kind = options?.kind ?? "local";
  const storage = resolveStorage(kind);

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch (error) {
    logStorageWarning("remove", key, kind, error, options?.silent);
    return false;
  }
}

export function parseBrowserStorageJson<T>(key: string, fallback: T, options?: ParseBrowserStorageJsonOptions) {
  const raw = readBrowserStorage(key, options);

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    logStorageWarning("parse", key, options?.kind ?? "local", error, options?.silent);

    if (options?.removeOnError) {
      removeBrowserStorage(key, options);
    }

    return fallback;
  }
}

export function clearBrowserStorageByPrefix(prefix: string, options?: BrowserStorageOptions) {
  const kind = options?.kind ?? "local";
  const storage = resolveStorage(kind);

  if (!storage) {
    return 0;
  }

  const keysToRemove: string[] = [];

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);

      if (key?.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
  } catch (error) {
    logStorageWarning("scan", prefix, kind, error, options?.silent);
    return 0;
  }

  keysToRemove.forEach((key) => {
    removeBrowserStorage(key, {
      ...options,
      kind,
      silent: true
    });
  });

  return keysToRemove.length;
}

export function clearNeedoStorage(options?: BrowserStorageOptions) {
  return clearBrowserStorageByPrefix("needo.", options);
}
