import { compare } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const VERIFICATION_PURPOSES = [
  "email_registration",
  "google_registration_or_link",
  "google_authenticated_link",
  "google_unlink",
  "password_setup"
] as const;

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const assertSafeGoogleAuthFlowEnvironment = (runtimeEnv: NodeJS.ProcessEnv): void => {
  assert(
    runtimeEnv.NODE_ENV === "development" || runtimeEnv.NODE_ENV === "test",
    "Google auth integration check requires NODE_ENV=development or test"
  );
  assert(
    runtimeEnv.DEPLOY_ENV === "local" || runtimeEnv.DEPLOY_ENV === "test",
    "Google auth integration check requires DEPLOY_ENV=local or test"
  );

  const databaseUrl = parseRequiredUrl(runtimeEnv.DATABASE_URL, "DATABASE_URL");
  assert(databaseUrl.protocol === "mysql:", "Google auth integration check requires MySQL");
  assert(
    LOCAL_HOSTS.has(databaseUrl.hostname),
    "Google auth integration check only accepts a local MySQL host"
  );
  assert(
    databaseUrl.pathname.replace(/^\/+/, "") === "needo_test",
    "Google auth integration check only accepts the needo_test database"
  );

  const redisUrl = parseRequiredUrl(runtimeEnv.REDIS_URL, "REDIS_URL");
  assert(redisUrl.protocol === "redis:", "Google auth integration check requires local Redis");
  assert(
    LOCAL_HOSTS.has(redisUrl.hostname),
    "Google auth integration check only accepts a local Redis host"
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
  assertSafeGoogleAuthFlowEnvironment(process.env);

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

  const marker = `google-auth-flow-${Date.now()}-${process.pid}`;
  const existingEmail = `${marker}-existing@needo.test`;
  const googleOnlyEmail = `${marker}-google-only@needo.test`;
  const existingPassword = "Existing.2026!";
  const googleOnlyPassword = "GoogleOnly.2026!";
  const existingCredential = `${marker}-existing-credential`;
  const googleOnlyCredential = `${marker}-google-only-credential`;
  const existingSubject = `${marker}-existing-subject`;
  const googleOnlySubject = `${marker}-google-only-subject`;
  const context = { ip: "127.0.0.1", userAgent: "google-auth-flow-check" };

  const redis = createRedisClient();
  const repository = new AuthRepository(prisma);
  const sessions = new RedisAuthSessionStore(() => redis);
  const challenges = new RedisVerificationChallengeStore(() => redis);
  const tokenService = new AuthTokenService(env);
  const capturedOtps = new Map<string, string[]>();
  const expectedNonces = new Map<string, string>();
  const challengeIds: string[] = [];
  const nonceChallengeIds: string[] = [];
  const userIds: number[] = [];
  const tokenReceipts: Array<{ userId: number; accessJti: string; refreshJti: string }> = [];
  let otpDeliveryCount = 0;

  const captureOnlyOtpDelivery = {
    sendOtp: async (email: string, otp: string): Promise<void> => {
      const normalized = email.trim().toLowerCase();
      capturedOtps.set(normalized, [...(capturedOtps.get(normalized) ?? []), otp]);
      otpDeliveryCount += 1;
    }
  };
  const googleIdentities = new Map([
    [
      existingCredential,
      {
        subject: existingSubject,
        email: existingEmail,
        emailVerifiedAt: new Date(),
        name: null,
        pictureUrl: null
      }
    ],
    [
      googleOnlyCredential,
      {
        subject: googleOnlySubject,
        email: googleOnlyEmail,
        emailVerifiedAt: new Date(),
        name: null,
        pictureUrl: null
      }
    ]
  ]);
  const deterministicGoogleVerifier = {
    verify: async (input: { credential: string; expectedNonce: string }) => {
      const identity = googleIdentities.get(input.credential);
      assert(identity, "deterministic Google verifier received an unknown credential");
      assert(
        expectedNonces.get(input.credential) === input.expectedNonce,
        "deterministic Google verifier received the wrong nonce"
      );
      expectedNonces.delete(input.credential);
      return identity;
    }
  };
  const authService = new AuthService(
    env,
    repository,
    sessions,
    captureOnlyOtpDelivery,
    challenges,
    false,
    deterministicGoogleVerifier
  );

  const trackTokens = async (
    pair: { accessToken: string; refreshToken: string },
    label: string
  ) => {
    const access = tokenService.verifyAccessToken(pair.accessToken);
    const refresh = tokenService.verifyRefreshToken(pair.refreshToken);
    assert(access.sub === refresh.sub, `${label} token subjects did not match`);
    const userId = Number(access.sub);
    if (!userIds.includes(userId)) userIds.push(userId);
    tokenReceipts.push({ userId, accessJti: access.jti, refreshJti: refresh.jti });
    assert(
      await sessions.hasRefreshToken(userId, refresh.jti),
      `${label} refresh token was not stored in Redis`
    );
    return { userId, access, refresh };
  };

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

    const registration = await authService.startRegistration({
      email: existingEmail,
      password: existingPassword
    });
    challengeIds.push(registration.challengeId);
    assert(
      (await prisma.user.count({ where: { email: existingEmail } })) === 0,
      "email registration stored a User before OTP"
    );
    const registered = await authService.verifyRegistration(
      registration.challengeId,
      takeCapturedOtp(capturedOtps, existingEmail),
      context
    );
    const registeredTokens = await trackTokens(registered, "verified email registration");
    const existingUser = await prisma.user.findUniqueOrThrow({
      where: { id: registeredTokens.userId },
      include: {
        customerProfile: true,
        identities: { where: { deletedAt: null } },
        userRoles: { where: { deletedAt: null }, include: { role: true } }
      }
    });
    assert(existingUser.emailVerifiedAt, "verified registration did not verify the email");
    assert(existingUser.customerProfile, "verified registration did not create a customer profile");
    assert(
      /^u\d{10}$/.test(existingUser.needoId),
      "verified registration created an invalid U public ID"
    );
    assert(
      existingUser.username === existingUser.needoId &&
        existingUser.customerProfile.displayName === existingUser.needoId,
      "verified registration did not initialize display names from the NeeDo ID"
    );
    assert(
      existingUser.identities.length === 1 &&
        existingUser.userRoles.length === 1 &&
        existingUser.userRoles[0]?.role.code === "customer",
      "verified registration did not create the exact baseline customer"
    );

    const emailLogin = await authService.login(existingEmail, existingPassword, context);
    const emailLoginTokens = await trackTokens(emailLogin, "email password login");
    assert(
      emailLoginTokens.userId === existingUser.id,
      "email password login did not resolve the registered User"
    );
    const needoIdLogin = await authService.login(existingUser.needoId, existingPassword, context);
    const needoIdLoginTokens = await trackTokens(needoIdLogin, "NeeDo ID password login");
    assert(
      needoIdLoginTokens.userId === existingUser.id,
      "NeeDo ID password login did not resolve the registered User"
    );

    const existingGoogleInit = await authService.initializeGoogleLogin();
    nonceChallengeIds.push(existingGoogleInit.nonceChallengeId);
    expectedNonces.set(existingCredential, existingGoogleInit.nonce);
    const existingGoogleFirstUse = await authService.submitGoogleCredential(
      {
        credential: existingCredential,
        nonceChallengeId: existingGoogleInit.nonceChallengeId
      },
      context
    );
    assert(
      existingGoogleFirstUse.status === "verification_required",
      "first Google use did not require OTP"
    );
    challengeIds.push(existingGoogleFirstUse.challengeId);
    assert(
      (await prisma.externalAuthAccount.count({ where: { providerSubject: existingSubject } })) ===
        0,
      "first Google use linked the account before OTP"
    );
    const linkedGoogle = await authService.verifyGoogleRegistrationOrLink(
      existingGoogleFirstUse.challengeId,
      takeCapturedOtp(capturedOtps, existingEmail),
      context
    );
    const linkedTokens = await trackTokens(linkedGoogle, "first Google link verification");
    assert(
      linkedTokens.userId === existingUser.id &&
        (await prisma.user.count({ where: { email: existingEmail } })) === 1,
      "Google first use did not link the existing email account"
    );
    const existingBinding = await prisma.externalAuthAccount.findFirstOrThrow({
      where: { providerSubject: existingSubject, deletedAt: null }
    });
    assert(
      existingBinding.userId === existingUser.id,
      "Google first use linked the wrong existing email account"
    );

    const otpCountBeforeRepeat = otpDeliveryCount;
    const repeatGoogleInit = await authService.initializeGoogleLogin();
    nonceChallengeIds.push(repeatGoogleInit.nonceChallengeId);
    expectedNonces.set(existingCredential, repeatGoogleInit.nonce);
    const repeatGoogle = await authService.submitGoogleCredential(
      { credential: existingCredential, nonceChallengeId: repeatGoogleInit.nonceChallengeId },
      context
    );
    assert(repeatGoogle.status === "authenticated", "repeat Google login was not direct");
    assert(otpDeliveryCount === otpCountBeforeRepeat, "repeat Google login sent an OTP");
    const repeatTokens = await trackTokens(repeatGoogle, "repeat direct Google login");
    assert(repeatTokens.userId === existingUser.id, "repeat Google login resolved the wrong User");

    const googleOnlyInit = await authService.initializeGoogleLogin();
    nonceChallengeIds.push(googleOnlyInit.nonceChallengeId);
    expectedNonces.set(googleOnlyCredential, googleOnlyInit.nonce);
    const googleOnlyFirstUse = await authService.submitGoogleCredential(
      { credential: googleOnlyCredential, nonceChallengeId: googleOnlyInit.nonceChallengeId },
      context
    );
    assert(
      googleOnlyFirstUse.status === "verification_required",
      "distinct Google first use did not require OTP"
    );
    challengeIds.push(googleOnlyFirstUse.challengeId);
    assert(
      (await prisma.user.count({ where: { email: googleOnlyEmail } })) === 0,
      "distinct Google email created a User before OTP"
    );
    const googleOnlyRegistered = await authService.verifyGoogleRegistrationOrLink(
      googleOnlyFirstUse.challengeId,
      takeCapturedOtp(capturedOtps, googleOnlyEmail),
      context
    );
    assert(
      typeof googleOnlyRegistered.needoId === "string",
      "distinct Google email did not create a Google-only customer"
    );
    const googleOnlyTokens = await trackTokens(
      googleOnlyRegistered,
      "verified Google-only registration"
    );
    const googleOnlyUser = await prisma.user.findUniqueOrThrow({
      where: { id: googleOnlyTokens.userId },
      include: {
        customerProfile: true,
        identities: { where: { deletedAt: null } },
        userRoles: { where: { deletedAt: null }, include: { role: true } },
        externalAccounts: { where: { provider: "google", deletedAt: null } }
      }
    });
    assert(
      googleOnlyUser.email === googleOnlyEmail &&
        googleOnlyUser.customerProfile &&
        googleOnlyUser.externalAccounts.length === 1,
      "distinct Google email did not create a Google-only customer"
    );
    assert(googleOnlyUser.passwordHash === null, "Google-only account unexpectedly had a password");
    assert(
      googleOnlyUser.identities.length === 1 &&
        googleOnlyUser.userRoles.length === 1 &&
        googleOnlyUser.userRoles[0]?.role.code === "customer",
      "Google-only customer baseline was not exact"
    );

    const setupAuth = await authService.authenticateAccessToken(googleOnlyRegistered.accessToken);
    const passwordSetup = await authService.startPasswordSetup(
      googleOnlyPassword,
      setupAuth,
      context
    );
    challengeIds.push(passwordSetup.challengeId);
    await authService.verifyPasswordSetup(
      passwordSetup.challengeId,
      takeCapturedOtp(capturedOtps, googleOnlyEmail),
      setupAuth,
      context
    );
    const passwordEnabledUser = await prisma.user.findUniqueOrThrow({
      where: { id: googleOnlyUser.id }
    });
    assert(
      Boolean(passwordEnabledUser.passwordHash) &&
        (await compare(googleOnlyPassword, passwordEnabledUser.passwordHash as string)),
      "password setup did not persist a bcrypt password"
    );
    const passwordLogin = await authService.login(googleOnlyEmail, googleOnlyPassword, context);
    const passwordLoginTokens = await trackTokens(passwordLogin, "Google-only password login");
    assert(
      passwordLoginTokens.userId === googleOnlyUser.id,
      "password setup did not enable password login"
    );

    const refreshesBeforeUnlink = tokenReceipts.filter(
      (receipt) => receipt.userId === googleOnlyUser.id
    );
    assert(refreshesBeforeUnlink.length >= 2, "unlink check requires multiple active sessions");
    for (const receipt of refreshesBeforeUnlink) {
      assert(
        await sessions.hasRefreshToken(receipt.userId, receipt.refreshJti),
        "unlink precondition refresh token was missing"
      );
    }
    const unlinkAuth = await authService.authenticateAccessToken(passwordLogin.accessToken);
    const unlink = await authService.startGoogleUnlink(unlinkAuth, context);
    challengeIds.push(unlink.challengeId);
    const unlinkResult = await authService.verifyGoogleUnlink(
      unlink.challengeId,
      takeCapturedOtp(capturedOtps, googleOnlyEmail),
      unlinkAuth,
      context
    );
    assert(unlinkResult.signedOut, "Google unlink did not force sign-out");
    for (const receipt of refreshesBeforeUnlink) {
      assert(
        !(await sessions.hasRefreshToken(receipt.userId, receipt.refreshJti)),
        "unlink left a refresh token active"
      );
    }
    assert(
      await sessions.isAccessTokenBlacklisted(unlinkAuth.accessTokenJti),
      "unlink did not blacklist the current access token"
    );
    assert(
      (await prisma.externalAuthAccount.count({
        where: { userId: googleOnlyUser.id, provider: "google", deletedAt: null }
      })) === 0,
      "unlink left the Google binding active"
    );
    let currentAccessRejected = false;
    try {
      await authService.authenticateAccessToken(passwordLogin.accessToken);
    } catch {
      currentAccessRejected = true;
    }
    assert(currentAccessRejected, "unlink did not block the current access token");

    const [registrationAudits, googleLinkAudits, passwordSetupAudits, unlinkAudits, loginLogs] =
      await Promise.all([
        prisma.auditLog.count({
          where: { action: "auth.register", targetId: { in: userIds } }
        }),
        prisma.auditLog.count({
          where: { action: "auth.google.link", targetId: { in: userIds } }
        }),
        prisma.auditLog.count({
          where: { action: "auth.password.setup", targetId: googleOnlyUser.id }
        }),
        prisma.auditLog.count({
          where: { action: "auth.google.unlink", targetId: googleOnlyUser.id }
        }),
        prisma.loginLog.count({ where: { userId: { in: userIds }, deletedAt: null } })
      ]);
    assert(registrationAudits === 2, "registration audit evidence was not exact");
    assert(googleLinkAudits >= 1, "Google link audit evidence was missing");
    assert(passwordSetupAudits === 1, "password setup audit evidence was not exact");
    assert(unlinkAudits === 1, "Google unlink audit evidence was not exact");
    assert(loginLogs >= 6, "login log evidence was incomplete");

    result = {
      database: "needo_test",
      lifecycle: {
        emailRegistrationBeforeOtp: "no-user",
        verifiedBaselineCustomer: true,
        passwordLogin: ["email", "needoId"],
        firstGoogleUse: "otp-linked-existing",
        repeatGoogleLogin: "direct",
        googleOnlyRegistration: true,
        passwordSetup: true,
        unlink: "all-sessions-revoked"
      },
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
        await cleanupGoogleAuthRedis({
          redis,
          sessions,
          marker,
          emails: [existingEmail, googleOnlyEmail],
          challengeIds,
          nonceChallengeIds,
          userIds,
          tokenReceipts,
          verificationSecret: env.AUTH_VERIFICATION_SECRET
        });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await cleanupGoogleAuthDatabase(prisma, marker, userIds);
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
      "Google auth checker cleanup was not exact"
    );
  }
  if (operationFailed) throw operationError;
  assert(result, "Google auth checker did not produce a result");
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

const cleanupGoogleAuthDatabase = async (
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
    prisma.externalAuthAccount.count({
      where: {
        OR: [{ providerSubject: { startsWith: marker } }, { providerEmail: { startsWith: marker } }]
      }
    }),
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
    "Google auth cleanup left marked database rows behind"
  );
};

const cleanupGoogleAuthRedis = async (input: {
  redis: ReturnType<(typeof import("../src/config/redis"))["createRedisClient"]>;
  sessions: InstanceType<
    (typeof import("../src/services/auth-session.store"))["RedisAuthSessionStore"]
  >;
  marker: string;
  emails: string[];
  challengeIds: string[];
  nonceChallengeIds: string[];
  userIds: number[];
  tokenReceipts: Array<{ userId: number; accessJti: string; refreshJti: string }>;
  verificationSecret: string;
}): Promise<void> => {
  for (const userId of input.userIds) await input.sessions.revokeAllRefreshTokens(userId);
  const keys = [
    ...input.challengeIds.flatMap((id) => [
      `auth:verification:email:${id}`,
      `auth:verification:unlink-complete:${id}`
    ]),
    ...input.nonceChallengeIds.map((id) => `auth:verification:google-nonce:${id}`),
    ...input.emails.flatMap((email) => [
      ...VERIFICATION_PURPOSES.map((purpose) =>
        verificationCooldownKey(email, purpose, input.verificationSecret)
      ),
      `otp:${email}`,
      `otp:cooldown:${email}`,
      `login:fail:127.0.0.1:${email}`,
      `login:lock:${email}`
    ]),
    ...input.userIds.flatMap((id) => [
      `auth:v2:refresh:user:${id}`,
      `auth:v2:session:generation:${id}`,
      `auth:v2:login:account:fail:${id}`,
      `auth:v2:login:account:lock:${id}`
    ]),
    ...input.tokenReceipts.flatMap(({ userId, accessJti, refreshJti }) => [
      `auth:v2:refresh:${userId}:${refreshJti}`,
      `token:blacklist:${accessJti}`
    ])
  ];
  if (keys.length > 0) await input.redis.del(keys);
  assert(
    keys.length === 0 || (await input.redis.exists(keys)) === 0,
    "Google auth cleanup left marked Redis keys behind"
  );
  const markerKeys: string[] = [];
  for await (const batch of input.redis.scanIterator({ MATCH: `*${input.marker}*` })) {
    markerKeys.push(...batch);
  }
  assert(markerKeys.length === 0, "Google auth cleanup left marked Redis keys behind");
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
