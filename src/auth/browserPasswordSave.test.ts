// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readBrowserPasswordSavePreference,
  requestBrowserPasswordSave,
  writeBrowserPasswordSavePreference
} from "./browserPasswordSave";

function localStorageValues() {
  return Array.from({ length: window.localStorage.length }, (_, index) => {
    const key = window.localStorage.key(index);
    return key ? window.localStorage.getItem(key) : null;
  });
}

describe("browser password save", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "PasswordCredential");
    Reflect.deleteProperty(navigator, "credentials");
  });

  it("defaults off and isolates frontend and backend portal preferences", () => {
    expect(readBrowserPasswordSavePreference("backend:admin")).toBe(false);
    expect(readBrowserPasswordSavePreference("frontend:user")).toBe(false);

    writeBrowserPasswordSavePreference("backend:admin", true);
    writeBrowserPasswordSavePreference("frontend:user", false);

    expect(readBrowserPasswordSavePreference("backend:admin")).toBe(true);
    expect(readBrowserPasswordSavePreference("frontend:user")).toBe(false);
    expect(window.localStorage.getItem("needo.auth.browser-password-save.backend:admin")).toBe("true");
    expect(window.localStorage.getItem("needo.auth.browser-password-save.frontend:user")).toBe("false");
  });

  it("submits credentials to the browser manager without persisting the password in app storage", async () => {
    const store = vi.fn(async () => undefined);
    class FakePasswordCredential {
      constructor(readonly data: { id: string; password: string; name?: string }) {}
    }

    Object.defineProperty(globalThis, "PasswordCredential", {
      configurable: true,
      value: FakePasswordCredential
    });
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { store }
    });

    await expect(
      requestBrowserPasswordSave({
        id: "user@example.com",
        name: "NeeDo",
        password: "password-value"
      })
    ).resolves.toBeUndefined();

    expect(store).toHaveBeenCalledTimes(1);
    expect(store.mock.calls[0]?.[0]).toBeInstanceOf(FakePasswordCredential);
    expect(localStorageValues()).not.toContain("password-value");
  });

  it("silently degrades when browser credential storage is unavailable or rejected", async () => {
    await expect(
      requestBrowserPasswordSave({ id: "user@example.com", password: "secret" })
    ).resolves.toBeUndefined();

    class FakePasswordCredential {}
    Object.defineProperty(globalThis, "PasswordCredential", {
      configurable: true,
      value: FakePasswordCredential
    });
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        store: vi.fn(async () => {
          throw new DOMException("cancelled", "NotAllowedError");
        })
      }
    });

    await expect(
      requestBrowserPasswordSave({ id: "user@example.com", password: "secret" })
    ).resolves.toBeUndefined();
  });
});
