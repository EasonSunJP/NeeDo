// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readBrowserSavedPassword,
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
    const store = vi.fn(async (_credential: Credential) => undefined);
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

  it("creates a browser-managed password credential when the constructor is unavailable", async () => {
    const credential = { id: "user@example.com", type: "password" } as Credential;
    const create = vi.fn(async () => credential);
    const store = vi.fn(async (_credential: Credential) => undefined);
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { create, store }
    });

    await requestBrowserPasswordSave({
      id: "user@example.com",
      name: "NeeDo",
      password: "password-value"
    });

    expect(create).toHaveBeenCalledWith({
      password: {
        id: "user@example.com",
        name: "NeeDo",
        password: "password-value"
      }
    });
    expect(store).toHaveBeenCalledWith(credential);
    expect(localStorageValues()).not.toContain("password-value");
  });

  it("reads a saved password credential from the browser manager", async () => {
    const get = vi.fn(async () => ({
      id: "saved@example.com",
      password: "Saved.Password.2026",
      type: "password"
    }) as Credential);
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { get }
    });

    await expect(readBrowserSavedPassword()).resolves.toEqual({
      id: "saved@example.com",
      password: "Saved.Password.2026"
    });
    expect(get).toHaveBeenCalledWith({
      mediation: "optional",
      password: true
    });
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
