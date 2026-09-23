import type { AuthMePayload } from "../auth/rbac";
import {
  requireFormalAuthMePayload,
  requireFormalRefreshPayload,
  requireFormalTokenPair,
  requireFormalSwitchIdentityPayload,
  requireFormalSwitchMerchantShopPayload,
  type AuthTransitionValidationContext
} from "../auth/authContract";
import { getDeviceFingerprint } from "../lib/deviceFingerprint";
import { httpClient } from "./httpClient";

export type TokenPairPayload = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type AuthLoginPayload = TokenPairPayload;

export type RefreshPayload = {
  accessToken: string;
  expiresIn: number;
};

export type VerificationChallengePayload = {
  challengeId: string;
  maskedEmail: string;
  expiresIn: number;
  cooldownSeconds: number;
};

export type VerificationChallengeInput = {
  challengeId: string;
  otp: string;
};

export type PasswordLoginResult =
  | ({ status: "authenticated" } & TokenPairPayload)
  | ({ status: "verification_required" } & VerificationChallengePayload);

export type RegistrationStartInput = {
  email: string;
  password: string;
};

export type VerifiedRegistrationPayload = TokenPairPayload & {
  needoId: string;
};

export type VerifiedGoogleRegistrationPayload = TokenPairPayload & {
  needoId?: string;
};

export type GoogleAuthInitialization = {
  clientId: string;
  nonce: string;
  nonceChallengeId: string;
  expiresIn: number;
};

export type GoogleCredentialInput = {
  credential: string;
  nonceChallengeId: string;
};

export type GoogleCredentialResult =
  | ({ status: "authenticated" } & AuthLoginPayload)
  | ({ status: "verification_required" } & VerificationChallengePayload);

export type GoogleLinkStatus = {
  linked: boolean;
  maskedEmail: string | null;
  hasPassword: boolean;
  canUnlink: boolean;
  googleEnabled: boolean;
};

export type GoogleLinkVerifiedPayload = {
  linked: true;
};

export type GoogleUnlinkVerifiedPayload = {
  signedOut: true;
};

export type PasswordSetupVerifiedPayload = {
  hasPassword: true;
};

export type PasswordSetupInput = {
  password: string;
};

type SwitchIdentityPayload = TokenPairPayload & {
  me: AuthMePayload;
};

export type SwitchMerchantShopPayload = SwitchIdentityPayload & {
  shopPublicId: string;
};

export type AuthTransitionCredentials = {
  accessToken: string | null;
  refreshToken: string;
};

export class AuthRotatedResponseError extends Error {
  public readonly rotatedCredentials: AuthTransitionCredentials | null;

  public constructor(error: unknown, rotatedCredentials: AuthTransitionCredentials | null) {
    super(error instanceof Error ? error.message : "error.api");
    this.name = "AuthRotatedResponseError";
    this.rotatedCredentials = rotatedCredentials;
  }
}

function readRotatedCredentials(value: unknown): AuthTransitionCredentials | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as { accessToken?: unknown; refreshToken?: unknown };
  return typeof payload.refreshToken === "string" && payload.refreshToken.length > 0
    ? {
        accessToken:
          typeof payload.accessToken === "string" && payload.accessToken.length > 0
            ? payload.accessToken
            : null,
        refreshToken: payload.refreshToken
      }
    : null;
}

function validateRotatedResponse<TPayload>(
  value: unknown,
  validate: (payload: unknown) => TPayload
) {
  try {
    return validate(value);
  } catch (error) {
    throw new AuthRotatedResponseError(error, readRotatedCredentials(value));
  }
}

// Transitional types used only by the untouched pre-verification registration page.
// Tasks 10 and 11 remove these consumers; the compatibility calls below fail closed.
export type RegistrationAccountType = "customer" | "technician";

type LegacyRegisterAccountBaseInput = {
  email: string;
  password: string;
  username: string;
};

export type RegisterAccountInput =
  | (LegacyRegisterAccountBaseInput & { accountType: "customer" })
  | (LegacyRegisterAccountBaseInput & {
      accountType: "technician";
      city: string;
    });

export type RegisteredAccountPayload = {
  id: number;
  email: string;
  username: string;
  accountType: RegistrationAccountType;
  approvalStatus: "approved" | "pending_review";
  isActive: boolean;
};

export const authEndpointPaths = {
  captcha: "/captcha",
  login: "/auth/login",
  loginVerify: "/auth/login/verify",
  register: "/auth/register",
  registerVerify: "/auth/register/verify",
  googleInit: "/auth/google/init",
  googleCredential: "/auth/google",
  googleVerify: "/auth/google/verify",
  googleLinkStatus: "/auth/google/link",
  googleLinkInit: "/auth/google/link/init",
  googleLinkCredential: "/auth/google/link",
  googleLinkVerify: "/auth/google/link/verify",
  googleUnlinkStart: "/auth/google/unlink",
  googleUnlinkVerify: "/auth/google/unlink/verify",
  passwordSetupStart: "/auth/password/setup",
  passwordSetupVerify: "/auth/password/setup/verify",
  refresh: "/auth/refresh",
  switchIdentity: "/auth/switch-identity",
  switchMerchantShop: "/auth/merchant-shop/switch",
  logout: "/auth/logout",
  me: "/auth/me"
} as const;

function createCaptchaRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getLegacyAuthBaseUrl() {
  return import.meta.env.VITE_LEGACY_AUTH_BASE_URL?.trim() || undefined;
}

function getLegacyAuthAuthorization() {
  return import.meta.env.VITE_LEGACY_AUTHORIZATION?.trim() || undefined;
}

function createLegacyAuthRequestOptions() {
  const baseUrl = getLegacyAuthBaseUrl();

  return baseUrl ? { baseUrl } : {};
}

function createLegacyAuthHeaders(headers?: Record<string, string>) {
  const authorization = getLegacyAuthAuthorization();

  return {
    ...(authorization ? { Authorization: authorization } : {}),
    ...(headers ?? {})
  };
}

function rejectLegacyOtp(): Promise<never> {
  return Promise.reject(new Error("error.auth.legacy_otp_unavailable"));
}

function assertGoogleInitialization(payload: GoogleAuthInitialization) {
  if (
    !payload ||
    typeof payload.clientId !== "string" ||
    !payload.clientId.trim() ||
    typeof payload.nonce !== "string" ||
    !payload.nonce.trim() ||
    typeof payload.nonceChallengeId !== "string" ||
    !payload.nonceChallengeId.trim() ||
    !Number.isFinite(payload.expiresIn) ||
    payload.expiresIn <= 0
  ) {
    throw new Error("error.auth.google_api_unavailable");
  }

  return payload;
}

export const authApi = {
  async login(loginIdentifier: string, password: string, _legacyCaptchaCode?: string) {
    void _legacyCaptchaCode;
    const result = await httpClient.request<PasswordLoginResult>(authEndpointPaths.login, {
      auth: false,
      body: { loginIdentifier, password },
      method: "POST",
      retryOnUnauthorized: false
    });
    return validateRotatedResponse(result, (payload) => {
      if (!payload || typeof payload !== "object" || !("status" in payload)) throw new Error("error.api");
      if (payload.status === "authenticated") {
        return requireFormalTokenPair<Extract<PasswordLoginResult, { status: "authenticated" }>>(
          payload,
          ["status", "accessToken", "refreshToken", "expiresIn"]
        );
      }
      if (payload.status !== "verification_required") throw new Error("error.api");
      const challenge = payload as Record<string, unknown>;
      if (
        Object.keys(challenge).length !== 5 ||
        typeof challenge.challengeId !== "string" ||
        !challenge.challengeId ||
        typeof challenge.maskedEmail !== "string" ||
        !challenge.maskedEmail ||
        !Number.isInteger(challenge.expiresIn) ||
        Number(challenge.expiresIn) < 1 ||
        !Number.isInteger(challenge.cooldownSeconds) ||
        Number(challenge.cooldownSeconds) < 0
      ) throw new Error("error.api");
      return payload as Extract<PasswordLoginResult, { status: "verification_required" }>;
    });
  },

  async verifyPasswordLogin(input: VerificationChallengeInput) {
    const tokens = await httpClient.request<TokenPairPayload>(authEndpointPaths.loginVerify, {
      auth: false,
      body: input,
      method: "POST",
      retryOnUnauthorized: false
    });
    return validateRotatedResponse(tokens, (payload) => requireFormalTokenPair(payload));
  },

  // Kept until Task 10 removes the duplicate consumer name. It is the same formal flow.
  async loginFormal(loginIdentifier: string, password: string) {
    return authApi.login(loginIdentifier, password);
  },

  async startRegistration(input: RegistrationStartInput) {
    return httpClient.request<VerificationChallengePayload>(authEndpointPaths.register, {
      auth: false,
      body: { email: input.email, password: input.password },
      method: "POST",
      retryOnUnauthorized: false
    });
  },

  async verifyRegistration(input: VerificationChallengeInput) {
    const tokens = await httpClient.request<VerifiedRegistrationPayload>(
      authEndpointPaths.registerVerify,
      {
        auth: false,
        body: input,
        method: "POST",
        retryOnUnauthorized: false
      }
    );
    return validateRotatedResponse(tokens, (payload) => {
      const validated = requireFormalTokenPair<VerifiedRegistrationPayload>(payload, [
        "accessToken",
        "refreshToken",
        "expiresIn",
        "needoId"
      ]);
      if (!/^u\d{10}$/.test(validated.needoId)) {
        throw new Error("error.api");
      }
      return validated;
    });
  },

  async initializeGoogleLogin() {
    const initialization = await httpClient.request<GoogleAuthInitialization>(
      authEndpointPaths.googleInit,
      {
        auth: false,
        body: {},
        method: "POST",
        retryOnUnauthorized: false
      }
    );

    return assertGoogleInitialization(initialization);
  },

  async submitGoogleCredential(input: GoogleCredentialInput) {
    const result = await httpClient.request<GoogleCredentialResult>(
      authEndpointPaths.googleCredential,
      {
        auth: false,
        body: input,
        method: "POST",
        retryOnUnauthorized: false
      }
    );

    return validateRotatedResponse(result, (payload) => {
      if (!payload || typeof payload !== "object" || !("status" in payload)) {
        throw new Error("error.api");
      }
      if (payload.status === "authenticated") {
        return requireFormalTokenPair<Extract<GoogleCredentialResult, { status: "authenticated" }>>(
          payload,
          ["status", "accessToken", "refreshToken", "expiresIn"]
        );
      }
      if (payload.status !== "verification_required") throw new Error("error.api");
      const challenge = payload as Record<string, unknown>;
      const exactKeys = ["status", "challengeId", "maskedEmail", "expiresIn", "cooldownSeconds"];
      if (
        Object.keys(challenge).length !== exactKeys.length ||
        !exactKeys.every((key) => Object.hasOwn(challenge, key)) ||
        typeof challenge.challengeId !== "string" ||
        challenge.challengeId.length === 0 ||
        typeof challenge.maskedEmail !== "string" ||
        challenge.maskedEmail.length === 0 ||
        !Number.isSafeInteger(challenge.expiresIn) ||
        Number(challenge.expiresIn) <= 0 ||
        !Number.isSafeInteger(challenge.cooldownSeconds) ||
        Number(challenge.cooldownSeconds) < 0
      ) {
        throw new Error("error.api");
      }
      return {
        status: "verification_required",
        challengeId: challenge.challengeId,
        maskedEmail: challenge.maskedEmail,
        expiresIn: challenge.expiresIn,
        cooldownSeconds: challenge.cooldownSeconds
      } as Extract<GoogleCredentialResult, { status: "verification_required" }>;
    });
  },

  async verifyGoogleRegistrationOrLink(input: VerificationChallengeInput) {
    const tokens = await httpClient.request<VerifiedGoogleRegistrationPayload>(
      authEndpointPaths.googleVerify,
      {
        auth: false,
        body: input,
        method: "POST",
        retryOnUnauthorized: false
      }
    );
    return validateRotatedResponse(tokens, (payload) => {
      const exactKeys =
        payload && typeof payload === "object" && "needoId" in payload
          ? ["accessToken", "refreshToken", "expiresIn", "needoId"]
          : ["accessToken", "refreshToken", "expiresIn"];
      const validated = requireFormalTokenPair<VerifiedGoogleRegistrationPayload>(
        payload,
        exactKeys
      );
      if (validated.needoId !== undefined && !/^u\d{10}$/.test(validated.needoId)) {
        throw new Error("error.api");
      }
      return validated;
    });
  },

  async getGoogleLinkStatus() {
    return httpClient.request<GoogleLinkStatus>(authEndpointPaths.googleLinkStatus, {
      auth: true,
      method: "GET",
      retryOnUnauthorized: true
    });
  },

  async initializeGoogleLink() {
    const initialization = await httpClient.request<GoogleAuthInitialization>(
      authEndpointPaths.googleLinkInit,
      {
        auth: true,
        body: {},
        method: "POST",
        retryOnUnauthorized: false
      }
    );

    return assertGoogleInitialization(initialization);
  },

  async submitGoogleLinkCredential(input: GoogleCredentialInput) {
    return httpClient.request<VerificationChallengePayload>(
      authEndpointPaths.googleLinkCredential,
      {
        auth: true,
        body: input,
        method: "POST",
        retryOnUnauthorized: false
      }
    );
  },

  async verifyGoogleLink(input: VerificationChallengeInput) {
    return httpClient.request<GoogleLinkVerifiedPayload>(authEndpointPaths.googleLinkVerify, {
      auth: true,
      body: input,
      method: "POST",
      retryOnUnauthorized: false
    });
  },

  async startGoogleUnlink() {
    return httpClient.request<VerificationChallengePayload>(authEndpointPaths.googleUnlinkStart, {
      auth: true,
      body: {},
      method: "POST",
      retryOnUnauthorized: false
    });
  },

  async verifyGoogleUnlink(input: VerificationChallengeInput) {
    const result = await httpClient.request<GoogleUnlinkVerifiedPayload>(
      authEndpointPaths.googleUnlinkVerify,
      {
        auth: true,
        body: input,
        method: "POST",
        retryOnUnauthorized: false
      }
    );
    if (!result || result.signedOut !== true) {
      throw new Error("error.api");
    }
    return result;
  },

  async startPasswordSetup(input: PasswordSetupInput) {
    return httpClient.request<VerificationChallengePayload>(authEndpointPaths.passwordSetupStart, {
      auth: true,
      body: { password: input.password },
      method: "POST",
      retryOnUnauthorized: false
    });
  },

  async verifyPasswordSetup(input: VerificationChallengeInput) {
    return httpClient.request<PasswordSetupVerifiedPayload>(authEndpointPaths.passwordSetupVerify, {
      auth: true,
      body: input,
      method: "POST",
      retryOnUnauthorized: false
    });
  },

  async fetchCaptcha() {
    const deviceToken = await getDeviceFingerprint();

    return httpClient.requestDataUrl(authEndpointPaths.captcha, {
      auth: false,
      ...createLegacyAuthRequestOptions(),
      headers: createLegacyAuthHeaders(),
      method: "GET",
      query: {
        token: deviceToken,
        r: createCaptchaRequestId()
      },
      retryOnUnauthorized: false
    });
  },

  /** @deprecated Task 11 replaces the pre-verification registration page. */
  async register(_input: RegisterAccountInput): Promise<RegisteredAccountPayload> {
    void _input;
    throw new Error("error.auth.registration_verification_required");
  },

  /** @deprecated Task 10 removes the obsolete generic OTP consumer. */
  async sendOtp(_email: string) {
    void _email;
    return rejectLegacyOtp();
  },

  /** @deprecated Task 10 removes the obsolete generic OTP consumer. */
  async verifyOtp(_email: string, _otp: string) {
    void _email;
    void _otp;
    return rejectLegacyOtp();
  },

  async refreshWithCredentials(refreshToken: string) {
    const refreshed = await httpClient.request<RefreshPayload>(authEndpointPaths.refresh, {
      auth: false,
      body: { refreshToken },
      method: "POST",
      retryOnUnauthorized: false,
      unauthorizedPolicy: "caller"
    });

    return requireFormalRefreshPayload(refreshed);
  },

  async switchIdentity(
    identityId: number,
    credentials: AuthTransitionCredentials,
    validation: AuthTransitionValidationContext
  ) {
    if (!credentials.refreshToken) {
      throw new Error("error.auth.refresh_missing");
    }

    const switched = await httpClient.request<SwitchIdentityPayload>(
      authEndpointPaths.switchIdentity,
      {
        auth: true,
        body: { refreshToken: credentials.refreshToken, identityId },
        ...(credentials.accessToken
          ? { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
          : {}),
        method: "POST",
        retryOnUnauthorized: false,
        unauthorizedPolicy: "caller"
      }
    );

    return validateRotatedResponse(switched, (payload) =>
      requireFormalSwitchIdentityPayload<SwitchIdentityPayload>(payload, {
        ...validation,
        expectedIdentityId: identityId
      })
    );
  },

  async switchMerchantShop(
    shopPublicId: string,
    credentials: AuthTransitionCredentials,
    validation: AuthTransitionValidationContext
  ) {
    if (!credentials.refreshToken) {
      throw new Error("error.auth.refresh_missing");
    }

    const switched = await httpClient.request<SwitchMerchantShopPayload>(
      authEndpointPaths.switchMerchantShop,
      {
        auth: true,
        body: { refreshToken: credentials.refreshToken, shopPublicId },
        ...(credentials.accessToken
          ? { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
          : {}),
        method: "POST",
        retryOnUnauthorized: false,
        unauthorizedPolicy: "caller"
      }
    );

    return validateRotatedResponse(switched, (payload) =>
      requireFormalSwitchMerchantShopPayload<SwitchMerchantShopPayload>(
        payload,
        shopPublicId,
        validation
      )
    );
  },

  async logout(credentials: AuthTransitionCredentials) {
    if (!credentials.refreshToken) {
      return {};
    }

    return httpClient.request<Record<string, never>>(authEndpointPaths.logout, {
      auth: true,
      body: { refreshToken: credentials.refreshToken },
      ...(credentials.accessToken
        ? { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
        : {}),
      method: "POST",
      retryOnUnauthorized: false,
      unauthorizedPolicy: "caller"
    });
  },

  async me(credentials: AuthTransitionCredentials) {
    const me = await httpClient.request<AuthMePayload>(authEndpointPaths.me, {
      auth: true,
      ...(credentials.accessToken
        ? { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
        : {}),
      method: "GET",
      retryOnUnauthorized: false,
      unauthorizedPolicy: "caller"
    });

    return requireFormalAuthMePayload(me);
  }
};
