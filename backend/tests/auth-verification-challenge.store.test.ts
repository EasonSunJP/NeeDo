import {
  RedisVerificationChallengeStore,
  type VerificationPurpose
} from "../src/services/auth-verification-challenge.store";

interface StoredValue {
  value: string;
  expiresAt: number | null;
}

class FakeRedis {
  public isOpen = true;
  public readonly values = new Map<string, StoredValue>();
  private readonly sets = new Map<string, Set<string>>();

  public async connect(): Promise<void> {
    this.isOpen = true;
  }

  public async set(
    key: string,
    value: string,
    options?: { EX?: number; NX?: boolean }
  ): Promise<string | null> {
    if (options?.NX && (await this.get(key)) !== null) {
      return null;
    }
    this.values.set(key, {
      value,
      expiresAt: options?.EX ? Date.now() + options.EX * 1000 : null
    });
    return "OK";
  }

  public async get(key: string): Promise<string | null> {
    const stored = this.values.get(key);
    if (!stored) return null;
    if (stored.expiresAt !== null && stored.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return stored.value;
  }

  public async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.values.delete(key) || this.sets.delete(key)) deleted += 1;
    }
    return deleted;
  }

  public async ttl(key: string): Promise<number> {
    const stored = this.values.get(key);
    if (!stored) return -2;
    if (stored.expiresAt === null) return -1;
    if (stored.expiresAt <= Date.now()) {
      this.values.delete(key);
      return -2;
    }
    return Math.ceil((stored.expiresAt - Date.now()) / 1000);
  }

  public async eval(
    script: string,
    options: { keys: string[]; arguments: string[] }
  ): Promise<string[]> {
    const [key] = options.keys;
    const [first, second, third, fourth] = options.arguments;
    const stored = await this.get(key);
    if (!stored) return ["missing"];
    const parsed = JSON.parse(stored) as {
      purpose?: string;
      userId?: number | null;
      digest: string;
      attempts?: number;
      metadata?: Record<string, unknown>;
    };

    if (script.includes("challenge.purpose")) {
      if (parsed.purpose !== first) return ["purpose_mismatch"];
      const userId = second === "" ? undefined : Number(second);
      if (parsed.userId !== null && parsed.userId !== undefined && parsed.userId !== userId) {
        return ["user_mismatch"];
      }
      if ((parsed.userId === null || parsed.userId === undefined) && userId !== undefined) {
        return ["user_mismatch"];
      }
      if (parsed.digest !== third) {
        const attempts = (parsed.attempts ?? 0) + 1;
        if (attempts >= Number(fourth)) {
          await this.del(key);
          return ["attempts_exhausted"];
        }
        parsed.attempts = attempts;
        const ttl = await this.ttl(key);
        await this.set(key, JSON.stringify(parsed), { EX: ttl });
        return ["invalid_otp", String(attempts)];
      }
      await this.del(key);
      return ["ok", JSON.stringify(parsed.metadata ?? {})];
    }

    const userId = second === "" ? undefined : Number(second);
    if (parsed.userId !== null && parsed.userId !== undefined && parsed.userId !== userId) {
      return ["user_mismatch"];
    }
    if ((parsed.userId === null || parsed.userId === undefined) && userId !== undefined) {
      return ["user_mismatch"];
    }
    if (parsed.digest !== first) return ["invalid_nonce"];
    await this.del(key);
    return ["ok"];
  }
}

const allPurposes: VerificationPurpose[] = [
  "email_registration",
  "google_registration_or_link",
  "google_authenticated_link",
  "google_unlink",
  "password_setup"
];

describe("RedisVerificationChallengeStore", () => {
  const originalSecret = process.env.AUTH_VERIFICATION_SECRET;

  beforeEach(() => {
    process.env.AUTH_VERIFICATION_SECRET = "test-verification-secret-with-at-least-32-chars";
  });

  afterAll(() => {
    process.env.AUTH_VERIFICATION_SECRET = originalSecret;
  });

  it.each(allPurposes)(
    "stores a digest-only 600-second email challenge for %s",
    async (purpose) => {
      const client = new FakeRedis();
      const store = new RedisVerificationChallengeStore(() => client as never);

      const created = await store.createEmailChallenge({
        email: "customer@example.com",
        otp: "123456",
        purpose,
        userId: 7,
        metadata: { passwordHash: "$2b$12$prepared-hash" }
      });

      expect(created).toMatchObject({ expiresInSeconds: 600, maskedEmail: "c******r@example.com" });
      const stored = [...client.values.entries()].find(([key]) =>
        key.startsWith("auth:verification:email:")
      )?.[1];
      expect(stored).toBeDefined();
      expect(stored?.value).not.toContain("123456");
      expect(stored?.value).toContain("passwordHash");
      expect(stored?.value).toContain("digest");
      expect(
        await client.ttl(
          [...client.values.keys()].find((key) => key.startsWith("auth:verification:email:"))!
        )
      ).toBeLessThanOrEqual(600);
    }
  );

  it("uses cooldown, purpose/user checks, atomically consumes valid OTPs, and rejects replay", async () => {
    const client = new FakeRedis();
    const store = new RedisVerificationChallengeStore(() => client as never);
    const { challengeId } = await store.createEmailChallenge({
      email: "customer@example.com",
      otp: "123456",
      purpose: "password_setup",
      userId: 7
    });

    await expect(
      store.createEmailChallenge({
        email: "customer@example.com",
        otp: "654321",
        purpose: "password_setup",
        userId: 7
      })
    ).rejects.toMatchObject({ reason: "cooldown" });
    await expect(
      store.consumeEmailChallenge({
        challengeId,
        otp: "000000",
        purpose: "google_unlink",
        userId: 7
      })
    ).resolves.toEqual({ ok: false, reason: "purpose_mismatch" });
    await expect(
      store.consumeEmailChallenge({
        challengeId,
        otp: "000000",
        purpose: "password_setup",
        userId: 8
      })
    ).resolves.toEqual({ ok: false, reason: "user_mismatch" });
    await expect(
      store.consumeEmailChallenge({
        challengeId,
        otp: "123456",
        purpose: "password_setup",
        userId: 7
      })
    ).resolves.toMatchObject({ ok: true });
    await expect(
      store.consumeEmailChallenge({
        challengeId,
        otp: "123456",
        purpose: "password_setup",
        userId: 7
      })
    ).resolves.toEqual({ ok: false, reason: "missing" });
  });

  it("expires challenges and deletes one after five invalid attempts", async () => {
    jest.useFakeTimers();
    const client = new FakeRedis();
    const store = new RedisVerificationChallengeStore(() => client as never);
    const expires = await store.createEmailChallenge({
      email: "expires@example.com",
      otp: "123456",
      purpose: "email_registration"
    });
    jest.advanceTimersByTime(600_001);
    await expect(
      store.consumeEmailChallenge({
        challengeId: expires.challengeId,
        otp: "123456",
        purpose: "email_registration"
      })
    ).resolves.toEqual({ ok: false, reason: "missing" });
    jest.useRealTimers();

    const attempts = await store.createEmailChallenge({
      email: "attempts@example.com",
      otp: "123456",
      purpose: "email_registration"
    });
    for (let index = 1; index <= 4; index += 1) {
      await expect(
        store.consumeEmailChallenge({
          challengeId: attempts.challengeId,
          otp: "000000",
          purpose: "email_registration"
        })
      ).resolves.toEqual({ ok: false, reason: "invalid_otp", attempts: index });
    }
    await expect(
      store.consumeEmailChallenge({
        challengeId: attempts.challengeId,
        otp: "000000",
        purpose: "email_registration"
      })
    ).resolves.toEqual({ ok: false, reason: "attempts_exhausted" });
  });

  it("creates a one-time, user-bound Google nonce without persisting the raw nonce", async () => {
    const client = new FakeRedis();
    const store = new RedisVerificationChallengeStore(() => client as never);
    const nonce = await store.createGoogleNonce({ userId: 7 });

    expect(nonce.expiresInSeconds).toBeLessThanOrEqual(600);
    expect([...client.values.values()][0].value).not.toContain(nonce.nonce);
    await expect(
      store.consumeGoogleNonce({
        challengeId: nonce.challengeId,
        expectedNonce: nonce.nonce,
        userId: 8
      })
    ).resolves.toBe(false);
    await expect(
      store.consumeGoogleNonce({
        challengeId: nonce.challengeId,
        expectedNonce: nonce.nonce,
        userId: 7
      })
    ).resolves.toBe(true);
    await expect(
      store.consumeGoogleNonce({
        challengeId: nonce.challengeId,
        expectedNonce: nonce.nonce,
        userId: 7
      })
    ).resolves.toBe(false);
  });

  it("refuses metadata that could persist a raw password or OTP", async () => {
    const store = new RedisVerificationChallengeStore(() => new FakeRedis() as never);

    await expect(
      store.createEmailChallenge({
        email: "customer@example.com",
        otp: "123456",
        purpose: "password_setup",
        metadata: { newPassword: "Abcd@1234" }
      })
    ).rejects.toThrow("must not contain raw password or OTP values");
  });
});
