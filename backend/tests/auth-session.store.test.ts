import { RedisAuthSessionStore } from "../src/services/auth-session.store";

class FakeRedis {
  public isOpen = true;
  public readonly values = new Map<string, string>();
  public readonly sets = new Map<string, Set<string>>();
  public readonly expiries = new Map<string, number>();
  public readonly evalCalls: string[] = [];
  public failNextEval = false;

  public async connect(): Promise<void> {
    this.isOpen = true;
  }

  public async set(key: string, value: string, options?: { EX?: number }): Promise<string> {
    this.values.set(key, value);
    if (options?.EX) this.expiries.set(key, options.EX);
    return "OK";
  }

  public async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  public async del(...keys: Array<string | string[]>): Promise<number> {
    let removed = 0;
    keys.flat().forEach((key) => {
      if (this.values.delete(key) || this.sets.delete(key)) removed += 1;
      this.expiries.delete(key);
    });
    return removed;
  }

  public async sAdd(key: string, value: string): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    this.sets.set(key, set);
    const size = set.size;
    set.add(value);
    return set.size === size ? 0 : 1;
  }

  public async sRem(key: string, value: string): Promise<number> {
    return this.sets.get(key)?.delete(value) ? 1 : 0;
  }

  public async sMembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }

  public async expire(key: string, seconds: number): Promise<number> {
    this.expiries.set(key, seconds);
    return 1;
  }

  public async ttl(key: string): Promise<number> {
    return this.expiries.get(key) ?? -2;
  }

  public async eval(
    script: string,
    options: { keys: string[]; arguments: string[] }
  ): Promise<string[]> {
    this.evalCalls.push(script);
    if (this.failNextEval) {
      this.failNextEval = false;
      throw new Error("simulated Redis transaction failure");
    }
    if (script.includes("auth-refresh-store")) {
      const [refreshKey, userIndexKey] = options.keys;
      const [jti, ttl] = options.arguments;
      await this.set(refreshKey, "1", { EX: Number(ttl) });
      await this.sAdd(userIndexKey, jti);
      if ((await this.ttl(userIndexKey)) < Number(ttl)) {
        await this.expire(userIndexKey, Number(ttl));
      }
      return ["ok"];
    }
    if (script.includes("auth-refresh-revoke-one")) {
      const [refreshKey, userIndexKey] = options.keys;
      const [jti] = options.arguments;
      await this.del(refreshKey);
      await this.sRem(userIndexKey, jti);
      if ((await this.sMembers(userIndexKey)).length === 0) await this.del(userIndexKey);
      return ["ok"];
    }
    if (script.includes("auth-refresh-revoke-all")) {
      const [userIndexKey] = options.keys;
      const [userId] = options.arguments;
      const jtis = await this.sMembers(userIndexKey);
      await this.del(userIndexKey, ...jtis.map((jti) => `refresh:${userId}:${jti}`));
      return ["ok"];
    }
    throw new Error("unexpected Redis Lua script");
  }
}

describe("RedisAuthSessionStore refresh-session index", () => {
  it("indexes refresh sessions, removes single revocations, and revokes every session for one user", async () => {
    const client = new FakeRedis();
    const store = new RedisAuthSessionStore(() => client as never);

    await store.storeRefreshToken(7, "session-a", 600);
    await store.storeRefreshToken(7, "session-b", 600);
    await store.storeRefreshToken(8, "session-c", 600);
    expect(client.evalCalls).toHaveLength(3);
    expect(await client.sMembers("refresh:user:7")).toEqual(["session-a", "session-b"]);
    expect(client.expiries.get("refresh:user:7")).toBe(600);

    await store.revokeRefreshToken(7, "session-a");
    expect(client.evalCalls).toHaveLength(4);
    expect(await store.hasRefreshToken(7, "session-a")).toBe(false);
    expect(await client.sMembers("refresh:user:7")).toEqual(["session-b"]);

    await expect(store.revokeAllRefreshTokens(7)).resolves.toBeUndefined();
    expect(client.evalCalls).toHaveLength(5);
    expect(await store.hasRefreshToken(7, "session-b")).toBe(false);
    expect(await store.hasRefreshToken(8, "session-c")).toBe(true);
    await expect(store.revokeAllRefreshTokens(99)).resolves.toBeUndefined();
  });

  it("does not shorten the user index lifetime when a shorter refresh token is added", async () => {
    const client = new FakeRedis();
    const store = new RedisAuthSessionStore(() => client as never);

    await store.storeRefreshToken(7, "long-session", 600);
    await store.storeRefreshToken(7, "short-session", 60);

    expect(await client.ttl("refresh:user:7")).toBe(600);
  });

  it("fails without partial refresh/index writes when its single Redis transaction fails", async () => {
    const client = new FakeRedis();
    client.failNextEval = true;
    const store = new RedisAuthSessionStore(() => client as never);

    await expect(store.storeRefreshToken(7, "session-a", 600)).rejects.toMatchObject({
      code: 50301
    });
    expect(client.values.size).toBe(0);
    expect(client.sets.size).toBe(0);
  });
});
