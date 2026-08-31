import type { AuthMePayload } from "../auth/rbac";
import { getDeviceFingerprint } from "../lib/deviceFingerprint";
import {
  clearAuthTokens,
  getStoredRefreshToken,
  httpClient,
  refreshStoredAccessToken,
  setAuthTokens,
} from "./httpClient";

export type TokenPairPayload = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type AuthLoginPayload = TokenPairPayload & {
  me?: AuthMePayload;
};

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
  me: "/auth/me",
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
    ...(headers ?? {}),
  };
}

function persistTokenPair(tokens: TokenPairPayload) {
  setAuthTokens({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
}

function isAuthIdentityPayload(value: unknown): value is AuthMePayload["currentIdentity"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const identity = value as Partial<AuthMePayload["currentIdentity"]>;

  return (
    typeof identity.id === "number" &&
    Number.isInteger(identity.id) &&
    (identity.publicId === null || typeof identity.publicId === "string") &&
    typeof identity.type === "string" &&
    identity.type.length > 0 &&
    (identity.scopeId === null ||
      (typeof identity.scopeId === "number" && Number.isInteger(identity.scopeId))) &&
    (identity.scopeType === null || typeof identity.scopeType === "string")
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAuthMePayload(value: unknown): value is AuthMePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const me = value as Partial<AuthMePayload>;

  return (
    typeof me.id === "number" &&
    typeof me.needoId === "string" &&
    me.needoId.length > 0 &&
    typeof me.primaryPublicId === "string" &&
    me.primaryPublicId.length > 0 &&
    typeof me.activeIdentityId === "number" &&
    (me.activePublicId === null || typeof me.activePublicId === "string") &&
    typeof me.email === "string" &&
    (me.emailVerifiedAt === null || typeof me.emailVerifiedAt === "string") &&
    typeof me.hasPassword === "boolean" &&
    typeof me.username === "string" &&
    (me.avatarUrl === null || typeof me.avatarUrl === "string") &&
    typeof me.isActive === "boolean" &&
    isAuthIdentityPayload(me.currentIdentity) &&
    Array.isArray(me.identities) &&
    me.identities.length > 0 &&
    me.identities.every(isAuthIdentityPayload) &&
    me.identities.some((identity) => identity.id === me.currentIdentity?.id) &&
    me.activeIdentityId === me.currentIdentity?.id &&
    me.activePublicId === me.currentIdentity?.publicId &&
    isStringArray(me.roles) &&
    isStringArray(me.permissions) &&
    isStringArray(me.menus) &&
    (me.identityAvailability === undefined || Array.isArray(me.identityAvailability))
  );
}

function isSwitchMerchantShopPayload(
  value: unknown,
  requestedShopPublicId: string,
): value is SwitchMerchantShopPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<SwitchMerchantShopPayload>;

  return (
    typeof payload.accessToken === "string" &&
    payload.accessToken.length > 0 &&
    typeof payload.refreshToken === "string" &&
    payload.refreshToken.length > 0 &&
    typeof payload.expiresIn === "number" &&
    payload.expiresIn > 0 &&
    typeof payload.shopPublicId === "string" &&
    /^shop\d{10}$/.test(payload.shopPublicId) &&
    payload.shopPublicId === requestedShopPublicId &&
    isAuthMePayload(payload.me)
  );
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
  async login(
    loginIdentifier: string,
    password: string,
    _legacyCaptchaCode?: string,
  ) {
    const tokens = await httpClient.request<AuthLoginPayload>(
      authEndpointPaths.login,
      {
        auth: false,
        body: { loginIdentifier, password },
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
    persistTokenPair(tokens);

    return tokens;
  },

  // Kept until Task 10 removes the duplicate consumer name. It is the same formal flow.
  async loginFormal(loginIdentifier: string, password: string) {
    return authApi.login(loginIdentifier, password);
  },

  async startRegistration(input: RegistrationStartInput) {
    return httpClient.request<VerificationChallengePayload>(
      authEndpointPaths.register,
      {
        auth: false,
        body: { email: input.email, password: input.password },
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
  },

  async verifyRegistration(input: VerificationChallengeInput) {
    const tokens = await httpClient.request<VerifiedRegistrationPayload>(
      authEndpointPaths.registerVerify,
      {
        auth: false,
        body: input,
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
    persistTokenPair(tokens);

    return tokens;
  },

  async initializeGoogleLogin() {
    const initialization = await httpClient.request<GoogleAuthInitialization>(
      authEndpointPaths.googleInit,
      {
        auth: false,
        body: {},
        method: "POST",
        retryOnUnauthorized: false,
      },
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
        retryOnUnauthorized: false,
      },
    );

    if (result.status === "authenticated") {
      persistTokenPair(result);
    }

    return result;
  },

  async verifyGoogleRegistrationOrLink(input: VerificationChallengeInput) {
    const tokens = await httpClient.request<VerifiedGoogleRegistrationPayload>(
      authEndpointPaths.googleVerify,
      {
        auth: false,
        body: input,
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
    persistTokenPair(tokens);

    return tokens;
  },

  async getGoogleLinkStatus() {
    return httpClient.request<GoogleLinkStatus>(
      authEndpointPaths.googleLinkStatus,
      {
        auth: true,
        method: "GET",
        retryOnUnauthorized: true,
      },
    );
  },

  async initializeGoogleLink() {
    const initialization = await httpClient.request<GoogleAuthInitialization>(
      authEndpointPaths.googleLinkInit,
      {
        auth: true,
        body: {},
        method: "POST",
        retryOnUnauthorized: false,
      },
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
        retryOnUnauthorized: false,
      },
    );
  },

  async verifyGoogleLink(input: VerificationChallengeInput) {
    return httpClient.request<GoogleLinkVerifiedPayload>(
      authEndpointPaths.googleLinkVerify,
      {
        auth: true,
        body: input,
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
  },

  async startGoogleUnlink() {
    return httpClient.request<VerificationChallengePayload>(
      authEndpointPaths.googleUnlinkStart,
      {
        auth: true,
        body: {},
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
  },

  async verifyGoogleUnlink(input: VerificationChallengeInput) {
    const result = await httpClient.request<GoogleUnlinkVerifiedPayload>(
      authEndpointPaths.googleUnlinkVerify,
      {
        auth: true,
        body: input,
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
    if (!result || result.signedOut !== true) {
      throw new Error("error.api");
    }
    clearAuthTokens();

    return result;
  },

  async startPasswordSetup(input: PasswordSetupInput) {
    return httpClient.request<VerificationChallengePayload>(
      authEndpointPaths.passwordSetupStart,
      {
        auth: true,
        body: { password: input.password },
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
  },

  async verifyPasswordSetup(input: VerificationChallengeInput) {
    return httpClient.request<PasswordSetupVerifiedPayload>(
      authEndpointPaths.passwordSetupVerify,
      {
        auth: true,
        body: input,
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
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
        r: createCaptchaRequestId(),
      },
      retryOnUnauthorized: false,
    });
  },

  /** @deprecated Task 11 replaces the pre-verification registration page. */
  async register(
    _input: RegisterAccountInput,
  ): Promise<RegisteredAccountPayload> {
    throw new Error("error.auth.registration_verification_required");
  },

  /** @deprecated Task 10 removes the obsolete generic OTP consumer. */
  async sendOtp(_email: string) {
    return rejectLegacyOtp();
  },

  /** @deprecated Task 10 removes the obsolete generic OTP consumer. */
  async verifyOtp(_email: string, _otp: string) {
    return rejectLegacyOtp();
  },

  async refresh() {
    return refreshStoredAccessToken();
  },

  async switchIdentity(identityId: number) {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) {
      throw new Error("error.auth.refresh_missing");
    }

    const tokens = await httpClient.request<SwitchIdentityPayload>(
      authEndpointPaths.switchIdentity,
      {
        auth: true,
        body: { refreshToken, identityId },
        method: "POST",
        retryOnUnauthorized: false,
      },
    );
    persistTokenPair(tokens);

    return tokens;
  },

  async switchMerchantShop(shopPublicId: string) {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) {
      throw new Error("error.auth.refresh_missing");
    }

    const switched = await httpClient.request<SwitchMerchantShopPayload>(
      authEndpointPaths.switchMerchantShop,
      {
        auth: true,
        body: { refreshToken, shopPublicId },
        method: "POST",
        retryOnUnauthorized: false,
      },
    );

    if (!isSwitchMerchantShopPayload(switched, shopPublicId)) {
      throw new Error("error.api");
    }

    persistTokenPair(switched);

    return switched;
  },

  async logout() {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) {
      clearAuthTokens();
      return {};
    }

    try {
      return await httpClient.request<Record<string, never>>(
        authEndpointPaths.logout,
        {
          auth: true,
          body: { refreshToken },
          method: "POST",
          retryOnUnauthorized: false,
        },
      );
    } finally {
      clearAuthTokens();
    }
  },

  async me() {
    return httpClient.request<AuthMePayload>(authEndpointPaths.me, {
      auth: true,
      method: "GET",
      retryOnUnauthorized: true,
    });
  },
};
