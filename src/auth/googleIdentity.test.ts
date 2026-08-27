// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type GoogleCallback = (response: { credential?: string }) => void;

function installGoogleApi() {
  let callback: GoogleCallback | undefined;
  const initialize = vi.fn((configuration: { callback: GoogleCallback }) => {
    callback = configuration.callback;
  });
  const renderButton = vi.fn();
  const google = {
    accounts: {
      id: {
        initialize,
        renderButton,
      },
    },
  };
  vi.stubGlobal("google", google);

  return {
    callback: () => callback,
    initialize,
    renderButton,
  };
}

async function loadAdapter() {
  return import("./googleIdentity");
}

describe("Google Identity Services adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reuses an existing GIS global without adding a script and forwards client ID and nonce", async () => {
    const api = installGoogleApi();
    const { requestGoogleCredential } = await loadAdapter();
    const container = document.createElement("div");
    const result = requestGoogleCredential({
      clientId: "client.apps.googleusercontent.com",
      nonce: "backend-nonce",
      container,
    });

    expect(
      document.querySelectorAll(
        'script[src="https://accounts.google.com/gsi/client"]',
      ),
    ).toHaveLength(0);
    await vi.waitFor(() => {
      expect(api.initialize).toHaveBeenCalledWith({
        callback: expect.any(Function),
        client_id: "client.apps.googleusercontent.com",
        nonce: "backend-nonce",
      });
    });
    expect(api.renderButton).toHaveBeenCalledWith(
      container,
      expect.objectContaining({ type: "standard" }),
    );

    api.callback()?.({ credential: "opaque.jwt.value" });
    await expect(result).resolves.toBe("opaque.jwt.value");
  });

  it("loads the official script only once for concurrent requests", async () => {
    const { requestGoogleCredential } = await loadAdapter();
    const firstContainer = document.createElement("div");
    const secondContainer = document.createElement("div");

    const first = requestGoogleCredential({
      clientId: "client",
      nonce: "nonce-1",
      container: firstContainer,
    });
    const second = requestGoogleCredential({
      clientId: "client",
      nonce: "nonce-2",
      container: secondContainer,
    });
    const secondRejection = expect(second).rejects.toThrow(
      "error.auth.google_request_in_progress",
    );
    const scripts = document.querySelectorAll(
      'script[src="https://accounts.google.com/gsi/client"]',
    );

    expect(scripts).toHaveLength(1);
    const api = installGoogleApi();
    scripts[0]?.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(api.initialize).toHaveBeenCalledTimes(1));
    api.callback()?.({ credential: "credential" });

    await expect(first).resolves.toBe("credential");
    await secondRejection;
  });

  it("reuses an existing compatible script element without duplicate listeners", async () => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    document.head.append(script);
    const loadSpy = vi.spyOn(script, "addEventListener");
    const { requestGoogleCredential } = await loadAdapter();

    const request = requestGoogleCredential({
      clientId: "client",
      nonce: "nonce",
      container: document.createElement("div"),
    });
    void requestGoogleCredential({
      clientId: "client",
      nonce: "nonce",
      container: document.createElement("div"),
    }).catch(() => undefined);

    expect(
      document.querySelectorAll(
        'script[src="https://accounts.google.com/gsi/client"]',
      ),
    ).toHaveLength(1);
    expect(
      loadSpy.mock.calls.filter(([event]) => event === "load"),
    ).toHaveLength(1);

    const api = installGoogleApi();
    script.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(api.initialize).toHaveBeenCalledTimes(1));
    api.callback()?.({ credential: "credential" });
    await expect(request).resolves.toBe("credential");
  });

  it("rejects an empty credential callback as cancellation", async () => {
    const api = installGoogleApi();
    const { requestGoogleCredential } = await loadAdapter();
    const request = requestGoogleCredential({
      clientId: "client",
      nonce: "nonce",
      container: document.createElement("div"),
    });

    await vi.waitFor(() => expect(api.initialize).toHaveBeenCalledTimes(1));
    api.callback()?.({ credential: "   " });

    await expect(request).rejects.toThrow(
      "error.auth.google_credential_cancelled",
    );
  });

  it("rejects script load failure and allows a later load retry", async () => {
    const { requestGoogleCredential } = await loadAdapter();
    const first = requestGoogleCredential({
      clientId: "client",
      nonce: "nonce",
      container: document.createElement("div"),
    });
    document.querySelector("script")?.dispatchEvent(new Event("error"));

    await expect(first).rejects.toThrow("error.auth.google_script_load_failed");

    const second = requestGoogleCredential({
      clientId: "client",
      nonce: "nonce",
      container: document.createElement("div"),
    });
    expect(
      document.querySelectorAll(
        'script[src="https://accounts.google.com/gsi/client"]',
      ),
    ).toHaveLength(1);
    const api = installGoogleApi();
    document.querySelector("script")?.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(api.initialize).toHaveBeenCalledTimes(1));
    api.callback()?.({ credential: "retry-credential" });
    await expect(second).resolves.toBe("retry-credential");
  });

  it("rejects a loaded script that does not expose the GIS API", async () => {
    const { requestGoogleCredential } = await loadAdapter();
    const request = requestGoogleCredential({
      clientId: "client",
      nonce: "nonce",
      container: document.createElement("div"),
    });
    document.querySelector("script")?.dispatchEvent(new Event("load"));

    await expect(request).rejects.toThrow("error.auth.google_api_unavailable");
  });

  it("times out an inert existing script, cleans its listeners, and remains retryable", async () => {
    vi.useFakeTimers();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    document.head.append(script);
    const removeListenerSpy = vi.spyOn(script, "removeEventListener");
    const { requestGoogleCredential } = await loadAdapter();
    const first = requestGoogleCredential({
      clientId: "client",
      nonce: "nonce",
      container: document.createElement("div"),
      timeoutMs: 1_000,
    });
    const firstRejection = expect(first).rejects.toThrow(
      "error.auth.google_credential_timeout",
    );

    await vi.advanceTimersByTimeAsync(1_000);

    await firstRejection;
    expect(removeListenerSpy).toHaveBeenCalledWith(
      "load",
      expect.any(Function),
    );
    expect(removeListenerSpy).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );
    expect(script.isConnected).toBe(false);

    const second = requestGoogleCredential({
      clientId: "client",
      nonce: "nonce",
      container: document.createElement("div"),
      timeoutMs: 1_000,
    });
    const retryScript = document.querySelector("script");
    const api = installGoogleApi();
    retryScript?.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(api.initialize).toHaveBeenCalledTimes(1));
    api.callback()?.({ credential: "retry-credential" });

    await expect(second).resolves.toBe("retry-credential");
  });

  it("rejects a cancelled popup by timeout and clears its timer", async () => {
    vi.useFakeTimers();
    installGoogleApi();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const { requestGoogleCredential } = await loadAdapter();
    const request = requestGoogleCredential({
      clientId: "client",
      nonce: "nonce",
      container: document.createElement("div"),
      timeoutMs: 1_000,
    });
    const rejection = expect(request).rejects.toThrow(
      "error.auth.google_credential_timeout",
    );

    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("aborts an abandoned credential request and immediately allows a new request", async () => {
    vi.useFakeTimers();
    const api = installGoogleApi();
    const controller = new AbortController();
    const { requestGoogleCredential } = await loadAdapter();
    const first = requestGoogleCredential({
      clientId: "client",
      nonce: "nonce-1",
      container: document.createElement("div"),
      signal: controller.signal,
      timeoutMs: 1_000,
    });
    const firstRejection = expect(first).rejects.toThrow(
      "error.auth.google_credential_cancelled",
    );

    await vi.waitFor(() => expect(api.initialize).toHaveBeenCalledTimes(1));
    controller.abort();
    await vi.advanceTimersByTimeAsync(1_000);
    await firstRejection;

    const second = requestGoogleCredential({
      clientId: "client",
      nonce: "nonce-2",
      container: document.createElement("div"),
      timeoutMs: 1_000,
    });
    await vi.waitFor(() => expect(api.initialize).toHaveBeenCalledTimes(2));
    api.callback()?.({ credential: "second-credential" });

    await expect(second).resolves.toBe("second-credential");
  });

  it("treats the credential as opaque and never decodes or persists it", async () => {
    const api = installGoogleApi();
    const atobSpy = vi.spyOn(globalThis, "atob");
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const consoleSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    const { requestGoogleCredential } = await loadAdapter();
    const request = requestGoogleCredential({
      clientId: "client",
      nonce: "nonce",
      container: document.createElement("div"),
    });

    await vi.waitFor(() => expect(api.initialize).toHaveBeenCalledTimes(1));
    api.callback()?.({ credential: "header.payload.signature" });

    await expect(request).resolves.toBe("header.payload.signature");
    expect(atobSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
