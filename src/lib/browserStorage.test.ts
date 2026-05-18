import { afterEach, describe, expect, it, vi } from "vitest";
import { clearBrowserStorageByPrefix, parseBrowserStorageJson, readBrowserStorage, writeBrowserStorage } from "./browserStorage";

function createStorage(seed: Record<string, string> = {}, overrides?: Partial<Storage>) {
  const entries = new Map(Object.entries(seed));

  const storage = {
    get length() {
      return entries.size;
    },
    clear: vi.fn(() => {
      entries.clear();
    }),
    getItem: vi.fn((key: string) => (entries.has(key) ? entries.get(key)! : null)),
    key: vi.fn((index: number) => Array.from(entries.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      entries.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      entries.set(key, value);
    })
  } satisfies Storage;

  return Object.assign(storage, overrides);
}

function stubWindow(localStorage: Storage, sessionStorage = localStorage) {
  vi.stubGlobal("window", {
    localStorage,
    sessionStorage
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browserStorage", () => {
  it("falls back to null when storage reads throw", () => {
    const storage = createStorage({}, {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      })
    });

    stubWindow(storage);

    expect(readBrowserStorage("needo.auth.session")).toBeNull();
  });

  it("removes invalid JSON when parsing with removeOnError enabled", () => {
    const storage = createStorage({
      "needo.auth.session": "{bad-json"
    });

    stubWindow(storage);

    expect(parseBrowserStorageJson("needo.auth.session", { ok: false }, { removeOnError: true, silent: true })).toEqual({ ok: false });
    expect(storage.removeItem).toHaveBeenCalledWith("needo.auth.session");
  });

  it("returns false instead of throwing when writes fail", () => {
    const storage = createStorage({}, {
      setItem: vi.fn(() => {
        throw new Error("quota exceeded");
      })
    });

    stubWindow(storage);

    expect(writeBrowserStorage("needo.client.theme", "dark-green", { silent: true })).toBe(false);
  });

  it("clears only matching keys for a prefix", () => {
    const storage = createStorage({
      "needo.one": "1",
      "needo.two": "2",
      "other.key": "3"
    });

    stubWindow(storage);

    expect(clearBrowserStorageByPrefix("needo.", { silent: true })).toBe(2);
    expect(storage.removeItem).toHaveBeenCalledWith("needo.one");
    expect(storage.removeItem).toHaveBeenCalledWith("needo.two");
    expect(storage.removeItem).not.toHaveBeenCalledWith("other.key");
  });
});
