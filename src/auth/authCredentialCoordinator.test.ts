// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  abandonAuthOperation,
  beginLatestAuthOperation,
  commitRotatedAuthOperation,
  enqueueAuthRotation,
  getAuthCredentialSnapshot,
  installServerAuthCredentials,
  markAuthOperationServerRotated,
  rejectAuthOperationAfterServerRotation,
  setAuthCredentialRevoker,
  terminateAuthImmediately
} from "./authCredentialCoordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("AuthCredentialCoordinator", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setAuthCredentialRevoker(null);
    terminateAuthImmediately();
  });

  it("does not invent an expected user for credentials without a trusted subject", () => {
    expect(installServerAuthCredentials({ accessToken: "access", refreshToken: "refresh" })).toBe(
      true
    );

    expect(getAuthCredentialSnapshot().expectedAuthUserId).toBeNull();
  });

  it("serializes rotations and gives the next request the committed refresh token", async () => {
    expect(
      installServerAuthCredentials({ accessToken: "access-0", refreshToken: "refresh-0" }, 7)
    ).toBe(true);
    const firstResponse = deferred<void>();
    const seenRefreshTokens: string[] = [];

    const first = enqueueAuthRotation("shop-a", async (operation, credentials) => {
      seenRefreshTokens.push(credentials.refreshToken);
      await firstResponse.promise;
      markAuthOperationServerRotated(operation, {
        accessToken: "access-a",
        refreshToken: "refresh-a"
      });
      expect(
        commitRotatedAuthOperation(operation, { expectedUserId: 7, persistClient: () => true })
      ).toBe(true);
    });
    const second = enqueueAuthRotation("shop-b", async (operation, credentials) => {
      seenRefreshTokens.push(credentials.refreshToken);
      markAuthOperationServerRotated(operation, {
        accessToken: "access-b",
        refreshToken: "refresh-b"
      });
      expect(
        commitRotatedAuthOperation(operation, { expectedUserId: 7, persistClient: () => true })
      ).toBe(true);
    });

    await Promise.resolve();
    expect(seenRefreshTokens).toEqual(["refresh-0"]);
    firstResponse.resolve();
    await Promise.all([first, second]);

    expect(seenRefreshTokens).toEqual(["refresh-0", "refresh-a"]);
    expect(getAuthCredentialSnapshot()).toMatchObject({
      accessToken: "access-b",
      refreshToken: "refresh-b"
    });
  });

  it("rejects rotations requested while a latest authentication operation owns the generation", async () => {
    installServerAuthCredentials({ accessToken: "access-a", refreshToken: "refresh-a" }, 7);
    beginLatestAuthOperation("login-b");
    const request = vi.fn();

    await expect(enqueueAuthRotation("shop-a", request)).rejects.toThrow(
      "error.auth.operation_superseded"
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("terminates locally without waiting for a hung rotation queue", async () => {
    installServerAuthCredentials({ accessToken: "old-access", refreshToken: "old-refresh" }, 7);
    const hung = deferred<void>();
    void enqueueAuthRotation("hung", async () => hung.promise);
    await Promise.resolve();

    const captured = terminateAuthImmediately();
    expect(captured).toEqual({ accessToken: "old-access", refreshToken: "old-refresh" });
    expect(getAuthCredentialSnapshot()).toMatchObject({ accessToken: null, refreshToken: null });

    installServerAuthCredentials({ accessToken: "new-access", refreshToken: "new-refresh" }, 8);
    const fresh = enqueueAuthRotation(
      "fresh",
      async (_operation, credentials) => credentials.refreshToken
    );
    await expect(fresh).resolves.toBe("new-refresh");
    hung.resolve();
  });

  it("revokes late server credentials and never revives after logout", () => {
    const revoke = vi.fn();
    setAuthCredentialRevoker(revoke);
    const operation = beginLatestAuthOperation("login");
    terminateAuthImmediately();

    expect(
      markAuthOperationServerRotated(operation, {
        accessToken: "late-access",
        refreshToken: "late-refresh"
      })
    ).toBe(false);
    expect(revoke).toHaveBeenCalledWith({
      accessToken: "late-access",
      refreshToken: "late-refresh"
    });
    expect(getAuthCredentialSnapshot()).toMatchObject({ accessToken: null, refreshToken: null });
  });

  it("revokes current uncommitted server credentials when logout terminates the operation", () => {
    const revoke = vi.fn();
    setAuthCredentialRevoker(revoke);
    const operation = beginLatestAuthOperation("login");
    const issued = { accessToken: "issued-access", refreshToken: "issued-refresh" };
    expect(markAuthOperationServerRotated(operation, issued)).toBe(true);

    terminateAuthImmediately();

    expect(revoke).toHaveBeenCalledWith(issued);
    expect(getAuthCredentialSnapshot()).toMatchObject({ accessToken: null, refreshToken: null });
  });

  it("abandons a preflight failure so later rotations are not permanently blocked", async () => {
    installServerAuthCredentials({ accessToken: "access", refreshToken: "refresh" }, 7);
    const failed = beginLatestAuthOperation("remembered-restore");
    expect(abandonAuthOperation(failed)).toBe(true);

    await expect(
      enqueueAuthRotation("current-session-switch", async (_operation, credentials) =>
        Promise.resolve(credentials.refreshToken)
      )
    ).resolves.toBe("refresh");
  });

  it("fails closed after server rotation when any client persistence stage fails", () => {
    const revoke = vi.fn();
    setAuthCredentialRevoker(revoke);
    installServerAuthCredentials({ accessToken: "old-access", refreshToken: "old-refresh" }, 7);
    const operation = beginLatestAuthOperation("switch");
    const rotated = { accessToken: "new-access", refreshToken: "new-refresh" };
    expect(markAuthOperationServerRotated(operation, rotated)).toBe(true);

    expect(
      commitRotatedAuthOperation(operation, {
        expectedUserId: 7,
        persistClient: () => false
      })
    ).toBe(false);

    expect(revoke).toHaveBeenCalledWith(rotated);
    expect(getAuthCredentialSnapshot()).toMatchObject({
      accessToken: null,
      expectedAuthUserId: null,
      refreshToken: null
    });
  });

  it("rejects a current malformed rotated response without writing it to browser storage", () => {
    const revoke = vi.fn();
    setAuthCredentialRevoker(revoke);
    installServerAuthCredentials({ accessToken: "old-access", refreshToken: "old-refresh" }, 7);
    const operation = beginLatestAuthOperation("switch");
    const rotated = { accessToken: "invalid-access", refreshToken: "invalid-refresh" };
    expect(markAuthOperationServerRotated(operation, rotated)).toBe(true);

    expect(rejectAuthOperationAfterServerRotation(operation)).toBe(true);

    expect(revoke).toHaveBeenCalledWith(rotated);
    expect(window.sessionStorage.getItem("needo.auth.refresh-token")).toBeNull();
    expect(getAuthCredentialSnapshot()).toMatchObject({ accessToken: null, refreshToken: null });
  });
});
