import { compare } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const REGISTRATION_PURPOSE = "email_registration";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const assertSafeRegistrationFlowEnvironment = (runtimeEnv: NodeJS.ProcessEnv): void => {
  assert(
    runtimeEnv.NODE_ENV === "development" || runtimeEnv.NODE_ENV === "test",
    "registration integration check requires NODE_ENV=development or test"
  );
  assert(
    runtimeEnv.DEPLOY_ENV === "local" || runtimeEnv.DEPLOY_ENV === "test",
    "registration integration check requires DEPLOY_ENV=local or test"
  );

  const databaseUrl = parseRequiredUrl(runtimeEnv.DATABASE_URL, "DATABASE_URL");
  assert(databaseUrl.protocol === "mysql:", "registration integration check requires MySQL");
  assert(
    LOCAL_HOSTS.has(databaseUrl.hostname),
    "registration integration check only accepts a local MySQL host"
  );
  assert(
    databaseUrl.pathname.replace(/^\/+/, "") === "needo_test",
    "registration integration check only accepts the needo_test database"
  );

  const redisUrl = parseRequiredUrl(runtimeEnv.REDIS_URL, "REDIS_URL");
  assert(redisUrl.protocol === "redis:", "registration integration check requires local Redis");
  assert(
    LOCAL_HOSTS.has(redisUrl.hostname),
    "registration integration check only accepts a local Redis host"
  );
};

const parseRequiredUrl = (value: string | undefined, name: string): URL => {
  assert(value, `${name} is required`);
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  assertSafeRegistrationFlowEnvironment(process.env);

  const [
    { env },
    { createRedisClient },
    { AuthRepository },
    { prisma, disconnectPrisma },
    { RedisAuthSessionStore },
    { AuthTokenService },
    { AuthService },
    { RedisVerificationChallengeStore }
  ] = await Promise.all([
    import("../src/config/env"),
    import("../src/config/redis"),
    import("../src/repositories/auth.repository"),
    import("../src/prisma/client"),
    import("../src/services/auth-session.store"),
    import("../src/services/auth-token.service"),
    import("../src/services/auth.service"),
    import("../src/services/auth-verification-challenge.store")
  ]);

  const marker = `registration-flow-${Date.now()}-${process.pid}`;
  const email = `${marker}@needo.test`;
  const password = "Registration.2026!";
  const context = { ip: "127.0.0.1", userAgent: "registration-flow-check" };
  const redis = createRedisClient();
  const repository = new AuthRepository(prisma);
  const sessions = new RedisAuthSessionStore(() => redis);
  const challenges = new RedisVerificationChallengeStore(() => redis);
  const tokenService = new AuthTokenService(env);
  const deliveredOtps = new Map<string, string[]>();
  const challengeIds: string[] = [];
  const userIds: number[] = [];
  const refreshJtis: Array<{ userId: number; jti: string }> = [];

  const captureOnlyOtpDelivery = {
    sendOtp: async (targetEmail: string, otp: string): Promise<void> => {
      const normalized = targetEmail.trim().toLowerCase();
      deliveredOtps.set(normalized, [...(deliveredOtps.get(normalized) ?? []), otp]);
    }
  };
  const authService = new AuthService(
    env,
    repository,
    sessions,
    captureOnlyOtpDelivery,
    challenges,
    false,
    {
      verify: async () => {
        throw new Error("Google verification is outside the registration-only checker");
      }
    }
  );

  let result: Record<string, unknown> | undefined;
  let operationError: unknown;
  let operationFailed = false;
  const cleanupErrors: unknown[] = [];
  try {
    await redis.connect();
    assert(
      (await prisma.role.count({ where: { code: "customer", deletedAt: null } })) === 1,
      "customer role must be seeded in needo_test"
    );

    const pending = await authService.startRegistration({ email, password });
    challengeIds.push(pending.challengeId);
    assert(
      (await prisma.user.count({ where: { email } })) === 0,
      "user was persisted before registration OTP verification"
    );
    const otp = takeCapturedOtp(deliveredOtps, email);
    const verified = await authService.verifyRegistration(pending.challengeId, otp, context);
    const accessPayload = tokenService.verifyAccessToken(verified.accessToken);
    const refreshPayload = tokenService.verifyRefreshToken(verified.refreshToken);
    const userId = Number(accessPayload.sub);
    userIds.push(userId);
    refreshJtis.push({ userId, jti: refreshPayload.jti });

    assert(accessPayload.sub === refreshPayload.sub, "registration token subjects did not match");
    assert(
      await sessions.hasRefreshToken(userId, refreshPayload.jti),
      "registration refresh token was not stored in Redis"
    );

    const storedCustomer = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        customerProfile: true,
        identities: { where: { deletedAt: null } },
        userRoles: { where: { deletedAt: null }, include: { role: true } }
      }
    });
    assert(storedCustomer?.customerProfile, "customer profile was not persisted");
    assert(storedCustomer.emailVerifiedAt, "customer email must be verified");
    assert(/^u\d{10}$/.test(storedCustomer.needoId), "customer must receive a valid U public ID");
    assert(
      verified.needoId === storedCustomer.needoId,
      "verified result returned the wrong NeeDo ID"
    );
    assert(
      storedCustomer.username === storedCustomer.needoId &&
        storedCustomer.customerProfile.displayName === storedCustomer.needoId,
      "initial display names must equal the immutable NeeDo ID"
    );
    assert(
      storedCustomer.identities.length === 1,
      "baseline customer identity count was not exact"
    );
    assert(storedCustomer.identities[0]?.isActive, "customer identity must be active");
    assert(
      storedCustomer.userRoles.length === 1 &&
        storedCustomer.userRoles[0]?.role.code === "customer",
      "baseline customer role assignment was not exact"
    );
    assert(Boolean(storedCustomer.passwordHash), "customer password hash was not persisted");
    assert(
      await compare(password, storedCustomer.passwordHash as string),
      "customer password hash did not verify with bcrypt"
    );
    assert(
      (await repository.findUserByEmail(email))?.id === userId &&
        (await repository.findUserByLoginIdentifier(storedCustomer.needoId))?.id === userId,
      "email or NeeDo ID lookup did not resolve the verified customer"
    );
    assert(
      (await prisma.auditLog.count({
        where: { action: "auth.register", targetType: "User", targetId: userId }
      })) === 1,
      "verified registration must create one audit log"
    );

    result = {
      database: "needo_test",
      customer: {
        active: true,
        needoId: storedCustomer.needoId,
        profile: true,
        role: "customer",
        verified: true
      },
      lifecycle: { noUserBeforeOtp: true, tokensStored: true },
      cleanup: "exact",
      status: "ok"
    };
  } catch (error) {
    operationFailed = true;
    operationError = error;
  } finally {
    try {
      for (const userId of await discoverMarkedUserIds(prisma, marker)) {
        if (!userIds.includes(userId)) userIds.push(userId);
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (redis.isOpen) {
      try {
        await cleanupRegistrationRedis({
          redis,
          sessions,
          marker,
          email,
          challengeIds,
          userIds,
          refreshJtis,
          verificationSecret: env.AUTH_VERIFICATION_SECRET
        });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await cleanupRegistrationDatabase(prisma, marker, userIds);
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (redis.isOpen) {
      try {
        await redis.quit();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await disconnectPrisma();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      operationFailed ? [operationError, ...cleanupErrors] : cleanupErrors,
      "registration checker cleanup was not exact"
    );
  }
  if (operationFailed) throw operationError;
  assert(result, "registration checker did not produce a result");
  console.log(JSON.stringify(result, null, 2));
};

const takeCapturedOtp = (captured: Map<string, string[]>, email: string): string => {
  const queue = captured.get(email.trim().toLowerCase());
  const otp = queue?.shift();
  assert(otp, "capture-only OTP delivery did not receive a code");
  return otp;
};

const discoverMarkedUserIds = async (
  prisma: Awaited<typeof import("../src/prisma/client")>["prisma"],
  marker: string
): Promise<number[]> =>
  (
    await prisma.user.findMany({
      where: { email: { startsWith: marker } },
      select: { id: true }
    })
  ).map(({ id }) => id);

const cleanupRegistrationDatabase = async (
  prisma: Awaited<typeof import("../src/prisma/client")>["prisma"],
  marker: string,
  trackedUserIds: number[]
): Promise<void> => {
  const userIds = [
    ...new Set([...trackedUserIds, ...(await discoverMarkedUserIds(prisma, marker))])
  ];
  if (userIds.length > 0) {
    await prisma.$transaction(async (transaction) => {
      await transaction.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: userIds } },
            { targetType: "User", targetId: { in: userIds } }
          ]
        }
      });
      await transaction.loginLog.deleteMany({
        where: { OR: [{ userId: { in: userIds } }, { email: { startsWith: marker } }] }
      });
      await transaction.externalAuthAccount.deleteMany({ where: { userId: { in: userIds } } });
      await transaction.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await transaction.userIdentity.deleteMany({ where: { userId: { in: userIds } } });
      await transaction.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
      await transaction.user.deleteMany({ where: { id: { in: userIds } } });
    });
  }

  const leftovers = await Promise.all([
    prisma.user.count({ where: { email: { startsWith: marker } } }),
    prisma.loginLog.count({ where: { email: { startsWith: marker } } }),
    prisma.externalAuthAccount.count({ where: { providerEmail: { startsWith: marker } } }),
    userIds.length
      ? prisma.customerProfile.count({ where: { userId: { in: userIds } } })
      : Promise.resolve(0),
    userIds.length
      ? prisma.userIdentity.count({ where: { userId: { in: userIds } } })
      : Promise.resolve(0),
    userIds.length
      ? prisma.userRole.count({ where: { userId: { in: userIds } } })
      : Promise.resolve(0),
    userIds.length
      ? prisma.auditLog.count({
          where: {
            OR: [
              { actorId: { in: userIds } },
              { targetType: "User", targetId: { in: userIds } }
            ]
          }
        })
      : Promise.resolve(0)
  ]);
  assert(
    leftovers.every((count) => count === 0),
    "registration cleanup left marked database rows behind"
  );
};

const cleanupRegistrationRedis = async (input: {
  redis: ReturnType<(typeof import("../src/config/redis"))["createRedisClient"]>;
  sessions: InstanceType<
    (typeof import("../src/services/auth-session.store"))["RedisAuthSessionStore"]
  >;
  marker: string;
  email: string;
  challengeIds: string[];
  userIds: number[];
  refreshJtis: Array<{ userId: number; jti: string }>;
  verificationSecret: string;
}): Promise<void> => {
  for (const userId of input.userIds) await input.sessions.revokeAllRefreshTokens(userId);
  const keys = [
    ...input.challengeIds.map((id) => `auth:verification:email:${id}`),
    verificationCooldownKey(input.email, REGISTRATION_PURPOSE, input.verificationSecret),
    ...input.userIds.flatMap((id) => [
      `auth:v2:refresh:user:${id}`,
      `auth:v2:session:generation:${id}`,
      `auth:v2:login:account:fail:${id}`,
      `auth:v2:login:account:lock:${id}`
    ]),
    ...input.refreshJtis.map(({ userId, jti }) => `auth:v2:refresh:${userId}:${jti}`),
    `otp:${input.email}`,
    `otp:cooldown:${input.email}`,
    `login:fail:127.0.0.1:${input.email}`,
    `login:lock:${input.email}`
  ];
  if (keys.length > 0) await input.redis.del(keys);
  assert(
    keys.length === 0 || (await input.redis.exists(keys)) === 0,
    "registration cleanup left marked Redis keys behind"
  );
  const markerKeys: string[] = [];
  for await (const batch of input.redis.scanIterator({ MATCH: `*${input.marker}*` })) {
    markerKeys.push(...batch);
  }
  assert(markerKeys.length === 0, "registration cleanup left marked Redis keys behind");
};

const verificationCooldownKey = (email: string, purpose: string, secret: string): string =>
  `auth:verification:cooldown:${createHmac("sha256", secret)
    .update("email")
    .update("\u0000")
    .update(purpose)
    .update("\u0000")
    .update(email.trim().toLowerCase())
    .digest("base64url")}`;

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
