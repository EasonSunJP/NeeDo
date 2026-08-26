import { RedisAuthSessionStore } from "../src/services/auth-session.store";

class FakeRedis {
  public isOpen = true;
  public readonly values = new Map<string, string>();
  public readonly sets = new Map<string, Set<string>>();
  public readonly expiries = new Map<string, number>();

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
}

describe("RedisAuthSessionStore refresh-session index", () => {
  it("indexes refresh sessions, removes single revocations, and revokes every session for one user", async () => {
    const client = new FakeRedis();
    const store = new RedisAuthSessionStore(() => client as never);

    await store.storeRefreshToken(7, "session-a", 600);
    await store.storeRefreshToken(7, "session-b", 600);
    await store.storeRefreshToken(8, "session-c", 600);
    expect(await client.sMembers("refresh:user:7")).toEqual(["session-a", "session-b"]);
    expect(client.expiries.get("refresh:user:7")).toBe(600);

    await store.revokeRefreshToken(7, "session-a");
    expect(await store.hasRefreshToken(7, "session-a")).toBe(false);
    expect(await client.sMembers("refresh:user:7")).toEqual(["session-b"]);

    await expect(store.revokeAllRefreshTokens(7)).resolves.toBeUndefined();
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
});
