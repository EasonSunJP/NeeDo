import { RedisAuthSessionStore } from "../src/services/auth-session.store";
import { ERROR_CODES } from "../src/constants/error-codes";

class FakeRedis {
  public isOpen = true;
  public readonly values = new Map<string, string>();
  public readonly sets = new Map<string, Set<string>>();
  public readonly expiries = new Map<string, number>();
  public readonly streams = new Map<
    string,
    Array<{ id: string; message: Record<string, string> }>
  >();
  public readonly evalCalls: string[] = [];
  public failNextEval = false;
  public delayNextMerchantSwitchEvalMs = 0;
  public neverResolveMerchantSwitchEvals = false;

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
    let merchantSwitchResponseDelayMs = 0;
    if (this.failNextEval) {
      this.failNextEval = false;
      throw new Error("simulated Redis transaction failure");
    }
    if (
      script.includes("auth-merchant-shop-switch-complete") &&
      this.delayNextMerchantSwitchEvalMs > 0
    ) {
      merchantSwitchResponseDelayMs = this.delayNextMerchantSwitchEvalMs;
      this.delayNextMerchantSwitchEvalMs = 0;
    }
    if (
      script.includes("auth-merchant-shop-switch-complete") &&
      this.neverResolveMerchantSwitchEvals
    ) {
      return new Promise<string[]>(() => undefined);
    }
    if (script.includes("auth-refresh-store")) {
      const [refreshKey, userIndexKey, generationKey] = options.keys;
      const [jti, ttl, requestedGeneration] = options.arguments;
      const currentGeneration = await this.get(generationKey);
      if (currentGeneration === null) {
        await this.set(generationKey, requestedGeneration);
      } else if (currentGeneration !== requestedGeneration) {
        return ["generation_mismatch"];
      }
      await this.set(refreshKey, "1", { EX: Number(ttl) });
      await this.sAdd(userIndexKey, jti);
      if ((await this.ttl(userIndexKey)) < Number(ttl)) {
        await this.expire(userIndexKey, Number(ttl));
      }
      return ["ok"];
    }
    if (script.includes("auth-merchant-shop-switch-complete")) {
      if (options.keys.length >= 7) {
        const [
          oldRefreshKey,
          newRefreshKey,
          userIndexKey,
          generationKey,
          blacklistKey,
          receiptKey,
          outboxKey
        ] = options.keys;
        const [
          oldJti,
          newJti,
          refreshTtl,
          requestedGeneration,
          oldAccessExpiresAt,
          ,
          operationId,
          operationHash,
          auditId,
          receiptTtl
        ] = options.arguments;
        const receiptValue = `${auditId}:${operationHash}:completed`;
        if (this.sets.has(receiptKey)) return ["rejected", "invalid_state"];
        const existingReceipt = this.values.get(receiptKey);
        if (existingReceipt !== undefined) {
          return existingReceipt === receiptValue ? ["already_committed"] : ["collision"];
        }
        if (
          this.sets.has(generationKey) ||
          this.sets.has(oldRefreshKey) ||
          this.sets.has(newRefreshKey) ||
          this.values.has(userIndexKey) ||
          this.sets.has(blacklistKey) ||
          this.values.has(outboxKey)
        ) {
          return ["rejected", "invalid_state"];
        }
        if (this.values.get(generationKey) !== requestedGeneration) {
          return ["rejected", "generation_mismatch"];
        }
        if (this.values.get(oldRefreshKey) !== "1") return ["rejected", "missing"];
        if (!this.sets.get(userIndexKey)?.has(oldJti)) {
          return ["rejected", "invalid_state"];
        }
        if (this.values.has(newRefreshKey)) return ["rejected", "new_refresh_exists"];

        this.values.delete(oldRefreshKey);
        this.sets.get(userIndexKey)!.delete(oldJti);
        this.values.set(newRefreshKey, "1");
        this.expiries.set(newRefreshKey, Number(refreshTtl));
        this.sets.get(userIndexKey)!.add(newJti);
        if ((this.expiries.get(userIndexKey) ?? -2) < Number(refreshTtl)) {
          this.expiries.set(userIndexKey, Number(refreshTtl));
        }
        const accessTtl = Number(oldAccessExpiresAt) - Math.floor(Date.now() / 1000);
        if (accessTtl > 0) {
          this.values.set(blacklistKey, "1");
          this.expiries.set(blacklistKey, accessTtl);
        }
        this.values.set(receiptKey, receiptValue);
        this.expiries.set(receiptKey, Number(receiptTtl));
        const stream = this.streams.get(outboxKey) ?? [];
        stream.push({
          id: `${stream.length + 1}-0`,
          message: { auditId, operationId, status: "completed" }
        });
        this.streams.set(outboxKey, stream);
        if (merchantSwitchResponseDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, merchantSwitchResponseDelayMs));
        }
        return ["committed"];
      }
      const [oldRefreshKey, newRefreshKey, userIndexKey, generationKey, blacklistKey] =
        options.keys;
      const [oldJti, newJti, refreshTtl, requestedGeneration, accessTtl] = options.arguments;
      const generation = this.values.get(generationKey);
      if (generation === undefined || generation !== requestedGeneration) {
        return ["generation_mismatch"];
      }
      if (!this.values.has(oldRefreshKey)) return ["missing"];
      this.values.delete(oldRefreshKey);
      this.sets.get(userIndexKey)?.delete(oldJti);
      this.values.set(newRefreshKey, "1");
      this.expiries.set(newRefreshKey, Number(refreshTtl));
      const userIndex = this.sets.get(userIndexKey) ?? new Set<string>();
      userIndex.add(newJti);
      this.sets.set(userIndexKey, userIndex);
      if ((this.expiries.get(userIndexKey) ?? -2) < Number(refreshTtl)) {
        this.expiries.set(userIndexKey, Number(refreshTtl));
      }
      if (Number(accessTtl) > 0) {
        this.values.set(blacklistKey, "1");
        this.expiries.set(blacklistKey, Number(accessTtl));
      }
      return ["ok"];
    }
    if (script.includes("auth-account-login-failure")) {
      const [failureKey, lockKey] = options.keys;
      const [limit, windowSeconds, lockSeconds] = options.arguments;
      const count = Number((await this.get(failureKey)) ?? "0") + 1;
      await this.set(failureKey, String(count), { EX: Number(windowSeconds) });
      if (count >= Number(limit)) {
        await this.set(lockKey, "1", { EX: Number(lockSeconds) });
        return ["locked", String(count)];
      }
      return ["ok", String(count)];
    }
    if (script.includes("auth-account-login-clear")) {
      await this.del(...options.keys);
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
      const [userIndexKey, generationKey] = options.keys;
      const [userId, synchronizedGeneration] = options.arguments;
      const jtis = await this.sMembers(userIndexKey);
      await this.del(userIndexKey, ...jtis.map((jti) => `auth:v2:refresh:${userId}:${jti}`));
      if (synchronizedGeneration !== undefined) {
        await this.set(generationKey, synchronizedGeneration);
      }
      return ["ok"];
    }
    throw new Error("unexpected Redis Lua script");
  }
}

describe("RedisAuthSessionStore refresh-session index", () => {
  const completeMerchantShopSwitch = async (
    store: RedisAuthSessionStore,
    input: {
      userId: number;
      generation: number;
      oldRefreshJti: string;
      newRefreshJti: string;
      refreshTtlSeconds: number;
      oldAccessJti: string;
      oldAccessExpiresAt: number;
    }
  ) => {
    const method = (
      store as unknown as {
        completeMerchantShopSwitch?: (
          value: typeof input & {
            operationId: string;
            operationHash: string;
            auditId: number;
            receiptTtlSeconds: number;
          }
        ) => Promise<{ status: string }>;
      }
    ).completeMerchantShopSwitch;
    expect(method).toEqual(expect.any(Function));
    const result = await method!.call(store, {
      ...input,
      operationId: `operation-${input.newRefreshJti}`,
      operationHash: "a".repeat(64),
      auditId: 91,
      receiptTtlSeconds: input.refreshTtlSeconds
    });
    return result.status === "committed" || result.status === "already_committed";
  };

  const completeMerchantShopSwitchWithReceipt = async (
    store: RedisAuthSessionStore,
    input: {
      userId: number;
      generation: number;
      oldRefreshJti: string;
      newRefreshJti: string;
      refreshTtlSeconds: number;
      oldAccessJti: string;
      oldAccessExpiresAt: number;
      operationId: string;
      operationHash: string;
      auditId: number;
      receiptTtlSeconds: number;
    }
  ): Promise<{ status: string; reason?: string }> => {
    const method = (
      store as unknown as {
        completeMerchantShopSwitch?: (
          value: typeof input
        ) => Promise<{ status: string; reason?: string }>;
      }
    ).completeMerchantShopSwitch;
    expect(method).toEqual(expect.any(Function));
    return method!.call(store, input);
  };

  it("reconciles the same operation receipt when the client timeout fires before Redis commits", async () => {
    const client = new FakeRedis();
    const store = new RedisAuthSessionStore(() => client as never, { operationTimeoutMs: 1 });
    await store.storeRefreshToken(7, "refresh-timeout-old", 600, 4);
    client.delayNextMerchantSwitchEvalMs = 20;

    const result = await completeMerchantShopSwitchWithReceipt(store, {
      userId: 7,
      generation: 4,
      oldRefreshJti: "refresh-timeout-old",
      newRefreshJti: "refresh-timeout-new",
      refreshTtlSeconds: 600,
      oldAccessJti: "access-timeout-old",
      oldAccessExpiresAt: Math.floor(Date.now() / 1000) + 300,
      operationId: "operation-timeout",
      operationHash: "d".repeat(64),
      auditId: 91,
      receiptTtlSeconds: 600
    });

    expect(result.status).toMatch(/committed/);
    expect(
      client.evalCalls.filter((script) => script.includes("auth-merchant-shop-switch"))
    ).toHaveLength(2);
    await expect(store.hasRefreshToken(7, "refresh-timeout-old")).resolves.toBe(false);
    await expect(store.hasRefreshToken(7, "refresh-timeout-new")).resolves.toBe(true);
    await expect(store.isAccessTokenBlacklisted("access-timeout-old")).resolves.toBe(true);
    expect(client.values.get("auth:v2:merchant-shop-switch:receipt:operation-timeout")).toBe(
      `91:${"d".repeat(64)}:completed`
    );
  });

  it("bounds repeated uncertain EVAL outcomes under one operation deadline", async () => {
    const client = new FakeRedis();
    const store = new RedisAuthSessionStore(() => client as never, {
      operationTimeoutMs: 5,
      merchantShopSwitchReconcileDeadlineMs: 30,
      merchantShopSwitchMaxAttempts: 4
    });
    await store.storeRefreshToken(7, "refresh-bounded-old", 600, 4);
    client.neverResolveMerchantSwitchEvals = true;
    const startedAt = Date.now();

    await expect(
      completeMerchantShopSwitchWithReceipt(store, {
        userId: 7,
        generation: 4,
        oldRefreshJti: "refresh-bounded-old",
        newRefreshJti: "refresh-bounded-new",
        refreshTtlSeconds: 600,
        oldAccessJti: "access-bounded-old",
        oldAccessExpiresAt: Math.floor(Date.now() / 1000) + 300,
        operationId: "operation-bounded",
        operationHash: "e".repeat(64),
        auditId: 92,
        receiptTtlSeconds: 600
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.DEPENDENCY_UNAVAILABLE, statusCode: 503 });

    expect(Date.now() - startedAt).toBeLessThan(250);
    expect(
      client.evalCalls.filter((script) => script.includes("auth-merchant-shop-switch-complete"))
    ).toHaveLength(4);
    await expect(store.hasRefreshToken(7, "refresh-bounded-old")).resolves.toBe(true);
    await expect(store.hasRefreshToken(7, "refresh-bounded-new")).resolves.toBe(false);
    await expect(store.isAccessTokenBlacklisted("access-bounded-old")).resolves.toBe(false);
  });

  it("atomically rotates the refresh token and blacklists the old access token", async () => {
    const client = new FakeRedis();
    const store = new RedisAuthSessionStore(() => client as never);
    await store.storeRefreshToken(7, "refresh-old", 600, 4);

    await expect(
      completeMerchantShopSwitch(store, {
        userId: 7,
        generation: 4,
        oldRefreshJti: "refresh-old",
        newRefreshJti: "refresh-new",
        refreshTtlSeconds: 600,
        oldAccessJti: "access-old",
        oldAccessExpiresAt: Math.floor(Date.now() / 1000) + 300
      })
    ).resolves.toBe(true);

    await expect(store.hasRefreshToken(7, "refresh-old")).resolves.toBe(false);
    await expect(store.hasRefreshToken(7, "refresh-new")).resolves.toBe(true);
    await expect(store.isAccessTokenBlacklisted("access-old")).resolves.toBe(true);
    expect(client.evalCalls.at(-1)).toContain("auth-merchant-shop-switch-complete");
  });

  it("leaves every credential unchanged when the atomic switch transaction fails", async () => {
    const client = new FakeRedis();
    const store = new RedisAuthSessionStore(() => client as never);
    await store.storeRefreshToken(7, "refresh-old", 600, 4);
    client.failNextEval = true;

    await expect(
      completeMerchantShopSwitch(store, {
        userId: 7,
        generation: 4,
        oldRefreshJti: "refresh-old",
        newRefreshJti: "refresh-new",
        refreshTtlSeconds: 600,
        oldAccessJti: "access-old",
        oldAccessExpiresAt: Math.floor(Date.now() / 1000) + 300
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.DEPENDENCY_UNAVAILABLE });

    await expect(store.hasRefreshToken(7, "refresh-old")).resolves.toBe(true);
    await expect(store.hasRefreshToken(7, "refresh-new")).resolves.toBe(false);
    await expect(store.isAccessTokenBlacklisted("access-old")).resolves.toBe(false);
  });

  it("allows at most one concurrent switch to consume the same refresh token", async () => {
    const client = new FakeRedis();
    const store = new RedisAuthSessionStore(() => client as never);
    await store.storeRefreshToken(7, "refresh-old", 600, 4);
    const common = {
      userId: 7,
      generation: 4,
      oldRefreshJti: "refresh-old",
      refreshTtlSeconds: 600,
      oldAccessJti: "access-old",
      oldAccessExpiresAt: Math.floor(Date.now() / 1000) + 300
    };

    const results = await Promise.all([
      completeMerchantShopSwitch(store, { ...common, newRefreshJti: "refresh-a" }),
      completeMerchantShopSwitch(store, { ...common, newRefreshJti: "refresh-b" })
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      [
        await store.hasRefreshToken(7, "refresh-a"),
        await store.hasRefreshToken(7, "refresh-b")
      ].filter(Boolean)
    ).toHaveLength(1);
    await expect(store.hasRefreshToken(7, "refresh-old")).resolves.toBe(false);
    await expect(store.isAccessTokenBlacklisted("access-old")).resolves.toBe(true);
  });

  it("rejects a stale generation without changing refresh or access state", async () => {
    const client = new FakeRedis();
    const store = new RedisAuthSessionStore(() => client as never);
    await store.storeRefreshToken(7, "refresh-old", 600, 4);

    await expect(
      completeMerchantShopSwitch(store, {
        userId: 7,
        generation: 5,
        oldRefreshJti: "refresh-old",
        newRefreshJti: "refresh-new",
        refreshTtlSeconds: 600,
        oldAccessJti: "access-old",
        oldAccessExpiresAt: Math.floor(Date.now() / 1000) + 300
      })
    ).resolves.toBe(false);

    await expect(store.hasRefreshToken(7, "refresh-old")).resolves.toBe(true);
    await expect(store.hasRefreshToken(7, "refresh-new")).resolves.toBe(false);
    await expect(store.isAccessTokenBlacklisted("access-old")).resolves.toBe(false);
  });

  it("indexes refresh sessions, removes single revocations, and revokes every session for one user", async () => {
    const client = new FakeRedis();
    const store = new RedisAuthSessionStore(() => client as never);

    await store.storeRefreshToken(7, "session-a", 600);
    await store.storeRefreshToken(7, "session-b", 600);
    await store.storeRefreshToken(8, "session-c", 600);
    expect(client.evalCalls).toHaveLength(3);
    expect(await client.sMembers("auth:v2:refresh:user:7")).toEqual(["session-a", "session-b"]);
    expect(client.expiries.get("auth:v2:refresh:user:7")).toBe(600);

    await store.revokeRefreshToken(7, "session-a");
    expect(client.evalCalls).toHaveLength(4);
    expect(await store.hasRefreshToken(7, "session-a")).toBe(false);
    expect(await client.sMembers("auth:v2:refresh:user:7")).toEqual(["session-b"]);

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

    expect(await client.ttl("auth:v2:refresh:user:7")).toBe(600);
  });

  it("synchronizes the Redis generation while revoking migrated administrator sessions", async () => {
    const client = new FakeRedis();
    const store = new RedisAuthSessionStore(() => client as never);

    await expect(store.storeRefreshToken(7, "old-session", 600, 0)).resolves.toBe(true);
    await expect(store.storeRefreshToken(7, "blocked-session", 600, 1)).resolves.toBe(false);

    await store.revokeAllRefreshTokens(7, 1);

    expect(await client.get("auth:v2:session:generation:7")).toBe("1");
    await expect(store.hasRefreshToken(7, "old-session")).resolves.toBe(false);
    await expect(store.storeRefreshToken(7, "new-session", 600, 1)).resolves.toBe(true);
  });

  it("ignores legacy unindexed refresh keys and uses the v2 session namespace", async () => {
    const client = new FakeRedis();
    client.values.set("refresh:7:legacy-session", "1");
    const store = new RedisAuthSessionStore(() => client as never);

    await expect(store.hasRefreshToken(7, "legacy-session")).resolves.toBe(false);
    await store.storeRefreshToken(7, "v2-session", 600);
    expect(client.values.has("auth:v2:refresh:7:v2-session")).toBe(true);
    expect(await client.sMembers("auth:v2:refresh:user:7")).toEqual(["v2-session"]);
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

  it("tracks locks by immutable account id and clears the exact account state atomically", async () => {
    const client = new FakeRedis();
    const store = new RedisAuthSessionStore(() => client as never);
    const options = { failureLimit: 2, windowSeconds: 60, lockSeconds: 120 };

    await expect(store.recordFailedLoginForAccount(7, options)).resolves.toEqual({
      count: 1,
      locked: false
    });
    await expect(store.recordFailedLoginForAccount(7, options)).resolves.toEqual({
      count: 2,
      locked: true
    });
    await expect(store.getAccountLoginLock(7)).resolves.toBe(true);
    await expect(store.getAccountLoginLock(8)).resolves.toBe(false);
    await expect(store.clearFailedLoginForAccount(7)).resolves.toBeUndefined();
    await expect(store.getAccountLoginLock(7)).resolves.toBe(false);
    expect(client.values.has("auth:v2:login:account:fail:7")).toBe(false);
    expect(client.values.has("auth:v2:login:account:lock:7")).toBe(false);
  });

  it("rejects non-exact audit ACK and DLQ script responses", async () => {
    let evalCount = 0;
    const client = {
      isOpen: true,
      withCommandOptions: jest.fn(function (this: unknown) {
        return this;
      }),
      eval: jest.fn(async () => {
        evalCount += 1;
        return evalCount === 1 ? ["rejected"] : ["ok", "unexpected"];
      })
    };
    const store = new RedisAuthSessionStore(() => client as never);

    await expect(
      store.acknowledgeMerchantShopSwitchAuditOutbox({
        kind: "completion",
        streamId: "1-0",
        auditId: 91,
        operationId: "operation-91",
        status: "completed",
        deliveryCount: 1
      })
    ).rejects.toMatchObject({ code: 50301 });
    await expect(
      store.deadLetterMerchantShopSwitchAuditOutbox({
        kind: "poison",
        streamId: "2-0",
        reason: "invalid_completion_event",
        deliveryCount: 1
      })
    ).rejects.toMatchObject({ code: 50301 });
  });
});
