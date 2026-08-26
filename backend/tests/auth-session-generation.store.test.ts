import { createHmac } from "node:crypto";
import { env } from "../src/config/env";
import { RedisAuthSessionStore } from "../src/services/auth-session.store";
import { AuthTokenService } from "../src/services/auth-token.service";

class FakeRedis {
  public isOpen = true;
  public readonly values = new Map<string, string>();
  public readonly sets = new Map<string, Set<string>>();
  public async connect() {}
  public async get(key: string) {
    return this.values.get(key) ?? null;
  }
  public async set(key: string, value: string) {
    this.values.set(key, value);
    return "OK";
  }
  public async del(...keys: Array<string | string[]>) {
    return keys
      .flat()
      .reduce((count, key) => count + Number(this.values.delete(key) || this.sets.delete(key)), 0);
  }
  public async eval(script: string, options: { keys: string[]; arguments: string[] }) {
    if (script.includes("auth-refresh-store")) {
      const generation = this.values.get(options.keys[2]) ?? "0";
      this.values.set(options.keys[2], generation);
      return [generation === options.arguments[2] ? "ok" : "generation_mismatch"];
    }
    if (script.includes("auth-refresh-rotate")) return ["generation_mismatch"];
    throw new Error("unexpected Lua");
  }
}

describe("session generation authority", () => {
  it("rejects a refresh rotation when unlink has advanced the user generation", async () => {
    const store = new RedisAuthSessionStore(() => new FakeRedis() as never);
    await expect(
      store.rotateRefreshToken({
        userId: 7,
        generation: 0,
        oldJti: "old",
        newJti: "new",
        ttlSeconds: 600
      })
    ).resolves.toBe(false);
  });

  it("rejects stale-generation refresh storage and treats legacy tokens as generation zero", async () => {
    const store = new RedisAuthSessionStore(() => new FakeRedis() as never);
    await expect(store.getSessionGeneration(7)).resolves.toBe(0);
    await expect(store.storeRefreshToken(7, "stale", 600, 1)).resolves.toBe(false);
  });

  it("accepts a signed legacy access token as generation zero", () => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "7",
        email: "needo@example.com",
        type: "access",
        jti: "legacy-access",
        iat: issuedAt,
        exp: issuedAt + 300
      })
    ).toString("base64url");
    const signingInput = `${header}.${payload}`;
    const signature = createHmac("sha256", env.AUTH_ACCESS_TOKEN_SECRET)
      .update(signingInput)
      .digest("base64url");

    expect(
      new AuthTokenService(env).verifyAccessToken(`${signingInput}.${signature}`)
    ).toMatchObject({
      sessionGeneration: 0
    });
  });
});
