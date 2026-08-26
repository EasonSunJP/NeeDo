import { randomInt, timingSafeEqual } from "crypto";
import { compare, hash } from "bcryptjs";
import { NeedoIdAllocationExhaustedError } from "./needo-id.service";
import type { AppConfig } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuthRepositoryPort, AuthUserRecord } from "../repositories/auth.repository";
import { AppError } from "../utils/app-error";
import type { OtpDeliveryClient } from "./auth-otp-delivery.service";
import type { AuthSessionStore } from "./auth-session.store";
import {
  type VerificationChallengeStore,
  VerificationChallengeCooldownError
} from "./auth-verification-challenge.store";
import {
  AuthTokenService,
  type AuthTokenPayload,
  type AuthTokenSubject
} from "./auth-token.service";

export interface AuthRequestContext {
  ip: string;
  userAgent?: string;
}

export interface TokenPairPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshPayload {
  accessToken: string;
  expiresIn: number;
}

export interface SwitchIdentityPayload extends TokenPairPayload {
  me: AuthMePayload;
}

export interface OtpSendPayload {
  expiresIn: number;
  cooldownSeconds: number;
}

export interface AuthenticatedAccessContext {
  userId: number;
  email: string;
  accessTokenJti: string;
  accessTokenExpiresAt: number;
  currentIdentityId?: number;
  currentIdentityType?: string;
  currentIdentityScopeType?: string | null;
  currentIdentityScopeId?: number | null;
  roles: string[];
  permissions: string[];
  isReadOnlyMerchantPreview?: boolean;
  merchantPreviewShopId?: number;
}

export interface AuthIdentityPayload {
  id: number;
  type: string;
  scopeType: string | null;
  scopeId: number | null;
}

export type AuthIdentityAvailabilityKind = "customer" | "technician" | "merchant" | "affiliate";
export type AuthIdentityAvailabilityState =
  | "active"
  | "available_to_apply"
  | "draft"
  | "pending"
  | "rejected";

export interface AuthIdentityAvailabilityPayload {
  kind: AuthIdentityAvailabilityKind;
  state: AuthIdentityAvailabilityState;
  identityId: number | null;
  applicationId: number | null;
  rejectionReason: string | null;
}

export interface AuthMePayload {
  id: number;
  email: string;
  username: string;
  avatarUrl: string | null;
  isActive: boolean;
  currentIdentity: AuthIdentityPayload;
  identities: AuthIdentityPayload[];
  identityAvailability: AuthIdentityAvailabilityPayload[];
  roles: string[];
  permissions: string[];
  menus: string[];
}

interface LoginFailureInput {
  userId?: number | null;
  email: string;
  reason: string;
  context: AuthRequestContext;
}

interface RegistrationInput {
  email: string;
  password: string;
}

export interface RegistrationChallengePayload {
  challengeId: string;
  maskedEmail: string;
  expiresIn: number;
  cooldownSeconds: number;
}

export interface VerifiedRegistrationPayload extends TokenPairPayload {
  needoId: string;
}

const BCRYPT_ROUNDS = 12;
const DUMMY_PASSWORD_HASH = "$2b$12$yeZHxRVngWt4QQuvHslkk.koIBff/rgsnD5/NITKu8U9cL.3.XfUS";

export class AuthService {
  private readonly tokenService: AuthTokenService;

  public constructor(
    private readonly config: AppConfig,
    private readonly repository: AuthRepositoryPort,
    private readonly sessionStore: AuthSessionStore,
    private readonly otpDeliveryClient: OtpDeliveryClient,
    private readonly verificationChallengeStore: VerificationChallengeStore,
    private readonly allowLegacyAuthAdaptersForTest = false
  ) {
    this.tokenService = new AuthTokenService(config);
  }

  public async login(
    loginIdentifierInput: string,
    password: string,
    context: AuthRequestContext
  ): Promise<TokenPairPayload> {
    const loginIdentifier = this.normalizeLoginIdentifier(loginIdentifierInput);

    const user = await this.repository.findUserByLoginIdentifier(loginIdentifier);
    if (user) {
      await this.assertNotAccountLoginLocked(user, context);
    } else {
      await this.assertNotLoginLocked(loginIdentifier, context);
    }
    const passwordMatches = await compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!user || !user.passwordHash || !passwordMatches) {
      return this.rejectFailedLogin({
        userId: user?.id,
        email: loginIdentifier,
        reason: "invalid_credentials",
        context
      });
    }

    const accessState = this.getAccessState(user);
    if (!user.isActive || accessState.disabled) {
      await this.repository.createLoginLog({
        userId: user.id,
        email: user.email,
        ip: context.ip,
        userAgent: context.userAgent,
        status: "failed",
        failReason: "account_disabled"
      });
      throw new AppError({
        code: ERROR_CODES.ACCOUNT_DISABLED,
        message: "error.auth.account_disabled",
        statusCode: 403
      });
    }

    if (accessState.restricted) {
      await this.repository.createLoginLog({
        userId: user.id,
        email: user.email,
        ip: context.ip,
        userAgent: context.userAgent,
        status: "failed",
        failReason: "account_restricted"
      });
      throw new AppError({
        code: ERROR_CODES.ACCOUNT_RESTRICTED,
        message: "error.auth.account_restricted",
        statusCode: 403
      });
    }

    this.assertActiveUser(user);
    const accountStore = this.sessionStore as Partial<AuthSessionStore>;
    if (accountStore.clearFailedLoginForAccount) {
      await accountStore.clearFailedLoginForAccount(user.id);
    } else if (this.allowLegacyAuthAdaptersForTest) {
      await this.sessionStore.clearFailedLogin(context.ip, loginIdentifier);
    } else {
      throw new AppError({
        code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        message: "error.dependency.redis_unavailable",
        statusCode: 503
      });
    }

    return this.completeSuccessfulLogin(user, context);
  }

  public async startRegistration(input: RegistrationInput): Promise<RegistrationChallengePayload> {
    const email = this.normalizeEmail(input.email);
    if (await this.repository.findUserByEmail(email)) {
      throw this.emailAlreadyExistsError();
    }

    try {
      const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const challenge = await this.verificationChallengeStore.createEmailChallenge({
        email,
        otp,
        purpose: "email_registration",
        metadata: { passwordHash: await hash(input.password, BCRYPT_ROUNDS) }
      });
      try {
        await this.otpDeliveryClient.sendOtp(email, otp);
      } catch (error) {
        await this.verificationChallengeStore.cancelEmailChallenge({
          challengeId: challenge.challengeId,
          email,
          purpose: "email_registration"
        });
        throw error;
      }
      return {
        challengeId: challenge.challengeId,
        maskedEmail: challenge.maskedEmail,
        expiresIn: challenge.expiresInSeconds,
        cooldownSeconds: 60
      };
    } catch (error) {
      if (error instanceof VerificationChallengeCooldownError) {
        throw new AppError({
          code: ERROR_CODES.OTP_COOLDOWN,
          message: "error.auth.otp_cooldown",
          statusCode: 429
        });
      }
      throw error;
    }
  }

  public async verifyRegistration(
    challengeId: string,
    otp: string,
    context: AuthRequestContext
  ): Promise<VerifiedRegistrationPayload> {
    const reserved = await this.verificationChallengeStore.reserveEmailChallenge({
      challengeId,
      otp,
      purpose: "email_registration"
    });
    if (!reserved.ok) {
      this.throwVerificationChallengeError(reserved.reason);
    }
    const passwordHash =
      "passwordHash" in reserved.metadata ? reserved.metadata.passwordHash : undefined;
    if (typeof passwordHash !== "string") {
      this.throwVerificationChallengeError("missing");
    }

    let loginReceipt: { payload: TokenPairPayload; refreshJti: string; userId: number } | undefined;
    try {
      let user = await this.repository.findVerifiedRegistrationByChallenge(
        challengeId,
        reserved.email
      );
      if (!user) {
        try {
          user = await this.repository.createVerifiedBaselineCustomer({
            email: reserved.email,
            passwordHash,
            emailVerifiedAt: new Date(),
            registrationChallengeId: challengeId,
            context: { ip: context.ip, userAgent: context.userAgent }
          });
        } catch (error) {
          if (!this.isUniqueConstraintError(error)) throw error;
          user = await this.repository.findVerifiedRegistrationByChallenge(
            challengeId,
            reserved.email
          );
          if (!user) throw this.emailAlreadyExistsError();
        }
      }
      this.assertActiveUser(user);
      loginReceipt = await this.completeSuccessfulLoginWithReceipt(user, context);
      const tokens = loginReceipt.payload;
      if (
        !(await this.verificationChallengeStore.finalizeEmailChallenge({
          challengeId,
          reservationToken: reserved.reservationToken
        }))
      ) {
        throw new AppError({
          code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
          message: "error.dependency.redis_unavailable",
          statusCode: 503
        });
      }
      return { ...tokens, needoId: user.needoId };
    } catch (error) {
      if (loginReceipt) {
        await this.revokeRefreshTokenAfterFailedLogin(loginReceipt.userId, loginReceipt.refreshJti);
      }
      await this.verificationChallengeStore.releaseEmailChallenge({
        challengeId,
        reservationToken: reserved.reservationToken
      });
      if (error instanceof NeedoIdAllocationExhaustedError) {
        throw this.needoIdAllocationUnavailableError();
      }
      if (this.isUniqueConstraintError(error)) {
        throw this.emailAlreadyExistsError();
      }
      throw error;
    }
  }

  public async sendOtp(emailInput: string): Promise<OtpSendPayload> {
    const email = this.normalizeEmail(emailInput);

    if (await this.sessionStore.hasOtpCooldown(email)) {
      throw new AppError({
        code: ERROR_CODES.OTP_COOLDOWN,
        message: "error.auth.otp_cooldown",
        statusCode: 429
      });
    }

    const user = await this.repository.findUserByEmail(email);
    this.assertActiveUser(user);

    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.sessionStore.storeOtp(email, otp, this.config.AUTH_OTP_TTL_SECONDS);
    await this.sessionStore.storeOtpCooldown(email, this.config.AUTH_OTP_COOLDOWN_SECONDS);

    try {
      await this.otpDeliveryClient.sendOtp(email, otp);
    } catch (error) {
      await this.sessionStore.deleteOtp(email);
      await this.sessionStore.clearOtpCooldown(email);
      throw error;
    }

    return {
      expiresIn: this.config.AUTH_OTP_TTL_SECONDS,
      cooldownSeconds: this.config.AUTH_OTP_COOLDOWN_SECONDS
    };
  }

  public async verifyOtp(
    emailInput: string,
    otp: string,
    context: AuthRequestContext
  ): Promise<TokenPairPayload> {
    const email = this.normalizeEmail(emailInput);
    const storedOtp = await this.sessionStore.getOtp(email);

    if (!storedOtp) {
      await this.repository.createLoginLog({
        email,
        ip: context.ip,
        userAgent: context.userAgent,
        status: "failed",
        failReason: "otp_expired"
      });
      throw new AppError({
        code: ERROR_CODES.OTP_EXPIRED,
        message: "error.auth.otp_expired",
        statusCode: 401
      });
    }

    if (!this.secureEquals(storedOtp, otp)) {
      await this.repository.createLoginLog({
        email,
        ip: context.ip,
        userAgent: context.userAgent,
        status: "failed",
        failReason: "invalid_otp"
      });
      throw new AppError({
        code: ERROR_CODES.INVALID_OTP,
        message: "error.auth.invalid_otp",
        statusCode: 401
      });
    }

    const user = await this.repository.findUserByEmail(email);
    this.assertActiveUser(user);
    await this.sessionStore.deleteOtp(email);
    await this.sessionStore.clearFailedLogin(context.ip, email);

    return this.completeSuccessfulLogin(user, context);
  }

  public async refresh(refreshToken: string): Promise<RefreshPayload> {
    const payload = this.tokenService.verifyRefreshToken(refreshToken);
    const userId = this.getUserIdFromToken(payload);

    if (!(await this.sessionStore.hasRefreshToken(userId, payload.jti))) {
      throw new AppError({
        code: ERROR_CODES.TOKEN_INVALID,
        message: "error.auth.token_invalid",
        statusCode: 401
      });
    }

    const user = await this.repository.findUserById(userId);
    this.assertActiveUser(user);

    const accessToken = this.tokenService.issueAccessToken({
      id: user.id,
      email: user.email,
      currentIdentityId: payload.currentIdentityId
    });

    return {
      accessToken: accessToken.token,
      expiresIn: accessToken.expiresIn
    };
  }

  public async switchIdentity(
    auth: AuthenticatedAccessContext,
    refreshToken: string,
    identityId: number,
    context: AuthRequestContext
  ): Promise<SwitchIdentityPayload> {
    const refreshPayload = this.tokenService.verifyRefreshToken(refreshToken);
    const refreshUserId = this.getUserIdFromToken(refreshPayload);

    if (refreshUserId !== auth.userId) {
      throw new AppError({
        code: ERROR_CODES.TOKEN_INVALID,
        message: "error.auth.token_invalid",
        statusCode: 401
      });
    }

    if (!(await this.sessionStore.hasRefreshToken(refreshUserId, refreshPayload.jti))) {
      throw new AppError({
        code: ERROR_CODES.TOKEN_INVALID,
        message: "error.auth.token_invalid",
        statusCode: 401
      });
    }

    const user = await this.repository.findUserById(refreshUserId);
    this.assertActiveUser(user);
    const me = this.buildMePayloadForIdentity(user, identityId);
    const subject: AuthTokenSubject = {
      id: user.id,
      email: user.email,
      currentIdentityId: me.currentIdentity.id
    };
    const nextAccessToken = this.tokenService.issueAccessToken(subject);
    const nextRefreshToken = this.tokenService.issueRefreshToken(subject);

    await this.sessionStore.revokeRefreshToken(refreshUserId, refreshPayload.jti);
    await this.sessionStore.storeRefreshToken(
      user.id,
      nextRefreshToken.jti,
      this.config.AUTH_REFRESH_TOKEN_TTL_SECONDS
    );
    await this.sessionStore.blacklistAccessToken(
      auth.accessTokenJti,
      auth.accessTokenExpiresAt - Math.floor(Date.now() / 1000)
    );
    await this.repository.createAuditLog({
      actorId: auth.userId,
      action: "auth.identity.switch",
      targetType: "UserIdentity",
      targetId: identityId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: {
        previousIdentityId: auth.currentIdentityId ?? null,
        nextIdentityId: identityId
      }
    });

    return {
      accessToken: nextAccessToken.token,
      refreshToken: nextRefreshToken.token,
      expiresIn: nextAccessToken.expiresIn,
      me
    };
  }

  public async logout(
    auth: AuthenticatedAccessContext,
    refreshToken: string,
    context: AuthRequestContext
  ): Promise<Record<string, never>> {
    const refreshPayload = this.tokenService.verifyRefreshToken(refreshToken);
    const refreshUserId = this.getUserIdFromToken(refreshPayload);

    if (refreshUserId !== auth.userId) {
      throw new AppError({
        code: ERROR_CODES.TOKEN_INVALID,
        message: "error.auth.token_invalid",
        statusCode: 401
      });
    }

    await this.sessionStore.revokeRefreshToken(refreshUserId, refreshPayload.jti);
    await this.sessionStore.blacklistAccessToken(
      auth.accessTokenJti,
      auth.accessTokenExpiresAt - Math.floor(Date.now() / 1000)
    );
    await this.repository.createAuditLog({
      actorId: auth.userId,
      action: "auth.logout",
      targetType: "User",
      targetId: auth.userId,
      ip: context.ip,
      userAgent: context.userAgent
    });

    return {};
  }

  public async getMe(auth: AuthenticatedAccessContext): Promise<AuthMePayload> {
    const user = await this.repository.findUserById(auth.userId);
    this.assertActiveUser(user);

    return this.buildMePayload(user, auth.currentIdentityId);
  }

  public async authenticateAccessToken(
    token: string,
    requiredPermission?: string
  ): Promise<AuthenticatedAccessContext> {
    const payload = this.tokenService.verifyAccessToken(token);

    if (await this.sessionStore.isAccessTokenBlacklisted(payload.jti)) {
      throw new AppError({
        code: ERROR_CODES.TOKEN_BLACKLISTED,
        message: "error.auth.token_blacklisted",
        statusCode: 401
      });
    }

    const userId = this.getUserIdFromToken(payload);
    const user = await this.repository.findUserById(userId);
    this.assertActiveUser(user);
    const me = this.buildMePayload(user, payload.currentIdentityId);

    if (requiredPermission && !me.permissions.includes(requiredPermission)) {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.forbidden",
        statusCode: 403
      });
    }

    return {
      userId,
      email: payload.email,
      accessTokenJti: payload.jti,
      accessTokenExpiresAt: payload.exp,
      currentIdentityId: me.currentIdentity.id,
      currentIdentityType: me.currentIdentity.type,
      currentIdentityScopeType: me.currentIdentity.scopeType,
      currentIdentityScopeId: me.currentIdentity.scopeId,
      roles: me.roles,
      permissions: me.permissions
    };
  }

  private async completeSuccessfulLogin(
    user: AuthUserRecord,
    context: AuthRequestContext,
    currentIdentityId?: number
  ): Promise<TokenPairPayload> {
    return (await this.completeSuccessfulLoginWithReceipt(user, context, currentIdentityId))
      .payload;
  }

  private async completeSuccessfulLoginWithReceipt(
    user: AuthUserRecord,
    context: AuthRequestContext,
    currentIdentityId?: number
  ): Promise<{ payload: TokenPairPayload; refreshJti: string; userId: number }> {
    const loggedInAt = new Date();
    const me = this.buildMePayload(user, currentIdentityId);
    const subject: AuthTokenSubject = {
      id: user.id,
      email: user.email,
      currentIdentityId: me.currentIdentity.id
    };
    const accessToken = this.tokenService.issueAccessToken(subject);
    const refreshToken = this.tokenService.issueRefreshToken(subject);

    let refreshStored = false;
    try {
      await this.sessionStore.storeRefreshToken(
        user.id,
        refreshToken.jti,
        this.config.AUTH_REFRESH_TOKEN_TTL_SECONDS
      );
      refreshStored = true;
      await this.repository.updateLastLoginAt(user.id, loggedInAt);
      await this.repository.createLoginLog({
        userId: user.id,
        email: user.email,
        ip: context.ip,
        userAgent: context.userAgent,
        status: "success"
      });
    } catch (error) {
      if (refreshStored) await this.revokeRefreshTokenAfterFailedLogin(user.id, refreshToken.jti);
      throw error;
    }

    return {
      payload: {
        accessToken: accessToken.token,
        refreshToken: refreshToken.token,
        expiresIn: accessToken.expiresIn
      },
      refreshJti: refreshToken.jti,
      userId: user.id
    };
  }

  private async revokeRefreshTokenAfterFailedLogin(
    userId: number | undefined,
    jti: string
  ): Promise<void> {
    if (!userId) return;
    try {
      await this.sessionStore.revokeRefreshToken(userId, jti);
    } catch {
      // The original failure remains authoritative; no credential is logged here.
    }
  }

  private async assertNotLoginLocked(email: string, context: AuthRequestContext): Promise<void> {
    if (!(await this.sessionStore.getLoginLock(email))) {
      return;
    }

    await this.repository.createLoginLog({
      email,
      ip: context.ip,
      userAgent: context.userAgent,
      status: "locked",
      failReason: "too_many_attempts"
    });
    throw new AppError({
      code: ERROR_CODES.ACCOUNT_LOCKED,
      message: "error.auth.account_locked",
      statusCode: 429
    });
  }

  private async assertNotAccountLoginLocked(
    user: AuthUserRecord,
    context: AuthRequestContext
  ): Promise<void> {
    const accountStore = this.sessionStore as Partial<AuthSessionStore>;
    const locked = accountStore.getAccountLoginLock
      ? await accountStore.getAccountLoginLock(user.id)
      : this.allowLegacyAuthAdaptersForTest
        ? false
        : true;
    if (!locked) {
      return;
    }

    await this.repository.createLoginLog({
      userId: user.id,
      email: user.email,
      ip: context.ip,
      userAgent: context.userAgent,
      status: "locked",
      failReason: "too_many_attempts"
    });
    throw new AppError({
      code: ERROR_CODES.ACCOUNT_LOCKED,
      message: "error.auth.account_locked",
      statusCode: 429
    });
  }

  private async rejectFailedLogin(input: LoginFailureInput): Promise<never> {
    const options = {
      failureLimit: this.config.AUTH_LOGIN_FAILURE_LIMIT,
      windowSeconds: this.config.AUTH_LOGIN_FAILURE_WINDOW_SECONDS,
      lockSeconds: this.config.AUTH_LOGIN_LOCK_SECONDS
    };
    const accountStore = this.sessionStore as Partial<AuthSessionStore>;
    const failure = input.userId
      ? accountStore.recordFailedLoginForAccount
        ? await accountStore.recordFailedLoginForAccount(input.userId, options)
        : await this.sessionStore.recordFailedLogin(input.context.ip, input.email, options)
      : await this.sessionStore.recordFailedLogin(input.context.ip, input.email, options);

    await this.repository.createLoginLog({
      userId: input.userId,
      email: input.email,
      ip: input.context.ip,
      userAgent: input.context.userAgent,
      status: failure.locked ? "locked" : "failed",
      failReason: failure.locked ? "too_many_attempts" : input.reason
    });

    if (failure.locked) {
      throw new AppError({
        code: ERROR_CODES.ACCOUNT_LOCKED,
        message: "error.auth.account_locked",
        statusCode: 429
      });
    }

    throw new AppError({
      code: ERROR_CODES.INVALID_CREDENTIALS,
      message: "error.auth.invalid_credentials",
      statusCode: 401
    });
  }

  private buildMePayloadForIdentity(user: AuthUserRecord, identityId: number): AuthMePayload {
    const identity = user.identities.find(
      (item) => item.id === identityId && item.deletedAt === null && item.isActive
    );

    if (!identity) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_NOT_FOUND,
        message: "error.auth.identity_not_found",
        statusCode: 404
      });
    }

    return this.buildMePayload(user, identityId);
  }

  private buildMePayload(user: AuthUserRecord, currentIdentityId?: number): AuthMePayload {
    const identities = user.identities
      .filter((identity) => identity.deletedAt === null && identity.isActive)
      .map<AuthIdentityPayload>((identity) => ({
        id: identity.id,
        type: identity.type,
        scopeType: identity.scopeType,
        scopeId: identity.scopeId
      }));
    const currentIdentity =
      identities.find((identity) => identity.id === currentIdentityId) ??
      identities.find((identity) =>
        user.identities.some((source) => source.id === identity.id && source.isDefault)
      ) ??
      identities[0];

    if (!currentIdentity) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_NOT_FOUND,
        message: "error.auth.identity_not_found",
        statusCode: 404
      });
    }

    const roles = new Set<string>();
    const permissions = new Map<string, string>();

    for (const userRole of user.userRoles) {
      if (userRole.deletedAt !== null || userRole.role.deletedAt !== null) {
        continue;
      }

      roles.add(userRole.role.code);

      for (const rolePermission of userRole.role.rolePermissions) {
        if (rolePermission.deletedAt === null && rolePermission.permission.deletedAt === null) {
          permissions.set(rolePermission.permission.code, rolePermission.permission.type);
        }
      }
    }

    const permissionCodes = Array.from(permissions.keys());

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      currentIdentity,
      identities,
      identityAvailability: this.buildIdentityAvailability(user, identities),
      roles: Array.from(roles),
      permissions: permissionCodes,
      menus: permissionCodes.filter((code) => permissions.get(code) === "menu")
    };
  }

  private buildIdentityAvailability(
    user: AuthUserRecord,
    identities: AuthIdentityPayload[]
  ): AuthIdentityAvailabilityPayload[] {
    const identityTypes: Readonly<Record<AuthIdentityAvailabilityKind, readonly string[]>> = {
      customer: ["customer"],
      technician: ["technician"],
      merchant: ["merchant", "merchant_owner", "merchant_staff"],
      affiliate: ["affiliate", "scout"]
    };
    const customerIdentity = identities.find((identity) =>
      identityTypes.customer.includes(identity.type)
    );
    if (!customerIdentity) {
      return [];
    }

    const applications = user.identityApplications ?? [];
    return (["customer", "technician", "merchant", "affiliate"] as const).map((kind) => {
      const identity = identities.find((candidate) => identityTypes[kind].includes(candidate.type));
      if (identity) {
        return {
          kind,
          state: "active" as const,
          identityId: identity.id,
          applicationId: null,
          rejectionReason: null
        };
      }

      const application =
        kind === "technician" || kind === "merchant"
          ? applications.find(
              (candidate) => candidate.type === kind && candidate.deletedAt === null
            )
          : undefined;
      if (!application) {
        return {
          kind,
          state: "available_to_apply" as const,
          identityId: null,
          applicationId: null,
          rejectionReason: null
        };
      }

      const state: AuthIdentityAvailabilityState =
        application.status === "draft"
          ? "draft"
          : application.status === "rejected"
            ? "rejected"
            : "pending";
      return {
        kind,
        state,
        identityId: null,
        applicationId: application.id,
        rejectionReason: state === "rejected" ? application.rejectionReason : null
      };
    });
  }

  private assertActiveUser(user: AuthUserRecord | null): asserts user is AuthUserRecord {
    if (!user) {
      throw new AppError({
        code: ERROR_CODES.INVALID_CREDENTIALS,
        message: "error.auth.invalid_credentials",
        statusCode: 401
      });
    }

    const accessState = this.getAccessState(user);
    if (!user.isActive || accessState.disabled) {
      throw new AppError({
        code: ERROR_CODES.ACCOUNT_DISABLED,
        message: "error.auth.account_disabled",
        statusCode: 403
      });
    }

    if (accessState.restricted) {
      throw new AppError({
        code: ERROR_CODES.ACCOUNT_RESTRICTED,
        message: "error.auth.account_restricted",
        statusCode: 403
      });
    }
  }

  private getUserIdFromToken(payload: AuthTokenPayload): number {
    return Number.parseInt(payload.sub, 10);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private emailAlreadyExistsError(): AppError {
    return new AppError({
      code: ERROR_CODES.EMAIL_ALREADY_EXISTS,
      message: "error.user.email_exists",
      statusCode: 409
    });
  }

  private needoIdAllocationUnavailableError(): AppError {
    return new AppError({
      code: ERROR_CODES.NEEDO_ID_ALLOCATION_UNAVAILABLE,
      message: "error.auth.needo_id_allocation_unavailable",
      statusCode: 503
    });
  }

  private throwVerificationChallengeError(
    reason:
      | "missing"
      | "purpose_mismatch"
      | "user_mismatch"
      | "invalid_otp"
      | "attempts_exhausted"
      | "reserved"
  ): never {
    if (reason === "invalid_otp") {
      throw new AppError({
        code: ERROR_CODES.VERIFICATION_CODE_INVALID,
        message: "error.auth.verification_code_invalid",
        statusCode: 401
      });
    }
    if (reason === "attempts_exhausted") {
      throw new AppError({
        code: ERROR_CODES.VERIFICATION_ATTEMPTS_EXHAUSTED,
        message: "error.auth.verification_attempts_exhausted",
        statusCode: 429
      });
    }
    throw new AppError({
      code: ERROR_CODES.VERIFICATION_CHALLENGE_EXPIRED,
      message: "error.auth.verification_challenge_expired",
      statusCode: 401
    });
  }

  private getAccessState(user: AuthUserRecord): {
    disabled: boolean;
    restricted: boolean;
  } {
    if (user.accessState) return user.accessState;
    if (!this.allowLegacyAuthAdaptersForTest) return { disabled: true, restricted: true };
    return {
      disabled: !user.isActive,
      restricted: !user.identities.some(
        (identity) => identity.deletedAt === null && identity.isActive
      )
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
  }

  private normalizeLoginIdentifier(identifier: string): string {
    return identifier.trim().toLowerCase();
  }

  private secureEquals(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);

    return (
      expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }
}
