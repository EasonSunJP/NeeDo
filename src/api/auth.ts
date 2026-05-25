import { clearAuthTokens, getStoredRefreshToken, httpClient, setAccessToken, setAuthTokens } from "./httpClient";
import type { AuthMePayload } from "../auth/rbac";
import { getDeviceFingerprint } from "../lib/deviceFingerprint";

export type TokenPairPayload = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
};

export type RefreshPayload = {
  accessToken: string;
  expiresIn: number;
};

export type OtpSendPayload = {
  expiresIn: number;
  cooldownSeconds: number;
};

type LegacyLoginPayload = {
  expire_time?: string;
  face?: string;
  mobile?: string;
  nickname?: string;
  token?: string;
  uid?: number | string;
};

type AuthLoginPayload = TokenPairPayload & {
  me?: AuthMePayload;
};

export const authEndpointPaths = {
  captcha: "/captcha",
  login: "/login",
  register: "/reg",
  refresh: "/auth/refresh",
  logout: "/auth/logout",
  me: "/auth/me",
  otpSend: "/auth/otp/send",
  otpVerify: "/auth/otp/verify"
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

function stripBearerPrefix(token: string) {
  return token.replace(/^Bearer\s+/i, "").trim();
}

function isFormalTokenPair(payload: TokenPairPayload | LegacyLoginPayload): payload is TokenPairPayload {
  return typeof (payload as TokenPairPayload).accessToken === "string";
}

function parseLegacyUserId(uid: LegacyLoginPayload["uid"]) {
  const numericUid = Number(uid);

  return Number.isFinite(numericUid) && numericUid > 0 ? numericUid : 0;
}

function createLegacyAuthMe(payload: LegacyLoginPayload, fallbackUsername: string): AuthMePayload {
  const userId = parseLegacyUserId(payload.uid);
  const username = payload.nickname?.trim() || fallbackUsername.trim() || (userId ? `user-${userId}` : "legacy-user");
  const currentIdentity = {
    id: userId,
    scopeId: userId,
    scopeType: "customer_profile",
    type: "customer"
  };
  const merchantIdentity = {
    id: userId,
    scopeId: userId,
    scopeType: "store",
    type: "merchant_owner"
  };
  const technicianIdentity = {
    id: userId,
    scopeId: userId,
    scopeType: "technician_profile",
    type: "technician"
  };
  const businessIdentity = {
    id: userId,
    scopeId: null,
    scopeType: "global",
    type: "scout"
  };

  return {
    id: userId,
    email: fallbackUsername.includes("@") ? fallbackUsername : username,
    username,
    avatarUrl: payload.face?.trim() || null,
    isActive: true,
    currentIdentity,
    identities: [currentIdentity, merchantIdentity, technicianIdentity, businessIdentity],
    roles: ["customer", "merchant_owner", "technician", "scout"],
    permissions: ["page:client-app", "page:merchant-app", "page:technician-app", "page:business-app"],
    menus: ["menu:client-app", "menu:merchant-app", "menu:technician-app", "menu:business-app"]
  };
}

function normalizeLoginPayload(payload: TokenPairPayload | LegacyLoginPayload, fallbackUsername: string): AuthLoginPayload {
  if (isFormalTokenPair(payload)) {
    return payload;
  }

  const accessToken = payload.token ? stripBearerPrefix(payload.token) : "";
  if (!accessToken) {
    throw new Error("error.auth.token_missing");
  }

  return {
    accessToken,
    expiresIn: 900,
    refreshToken: null,
    me: createLegacyAuthMe(payload, fallbackUsername)
  };
}

export const authApi = {
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

  async login(email: string, password: string, captchaCode?: string) {
    const normalizedCaptchaCode = captchaCode?.trim();
    const deviceToken = await getDeviceFingerprint();
    const body = new FormData();
    body.set("username", email);
    body.set("password", password);
    body.set("type", "username");

    if (normalizedCaptchaCode) {
      body.set("numcode", normalizedCaptchaCode);
    }

    const payload = await httpClient.request<TokenPairPayload | LegacyLoginPayload>(authEndpointPaths.login, {
      auth: false,
      ...createLegacyAuthRequestOptions(),
      body,
      headers: createLegacyAuthHeaders(deviceToken ? { token: deviceToken } : undefined),
      method: "POST",
      retryOnUnauthorized: false
    });
    const tokens = normalizeLoginPayload(payload, email);
    setAuthTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });

    return tokens;
  },

  async sendOtp(email: string) {
    return httpClient.request<OtpSendPayload>(authEndpointPaths.otpSend, {
      auth: false,
      body: { email },
      method: "POST",
      retryOnUnauthorized: false
    });
  },

  async verifyOtp(email: string, otp: string) {
    const tokens = await httpClient.request<TokenPairPayload>(authEndpointPaths.otpVerify, {
      auth: false,
      body: { email, otp },
      method: "POST",
      retryOnUnauthorized: false
    });
    setAuthTokens(tokens);

    return tokens;
  },

  async refresh() {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) {
      throw new Error("error.auth.refresh_missing");
    }

    const tokens = await httpClient.request<RefreshPayload>(authEndpointPaths.refresh, {
      auth: false,
      body: { refreshToken },
      method: "POST",
      retryOnUnauthorized: false
    });
    setAccessToken(tokens.accessToken);

    return tokens;
  },

  async logout() {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) {
      clearAuthTokens();
      return {};
    }

    try {
      return await httpClient.request<Record<string, never>>(authEndpointPaths.logout, {
        body: { refreshToken },
        method: "POST",
        retryOnUnauthorized: false
      });
    } finally {
      clearAuthTokens();
    }
  },

  async me() {
    return httpClient.request<AuthMePayload>(authEndpointPaths.me);
  }
};
