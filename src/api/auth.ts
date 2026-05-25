import { clearAuthTokens, getStoredRefreshToken, httpClient, setAccessToken, setAuthTokens } from "./httpClient";
import type { AuthMePayload } from "../auth/rbac";
import { getDeviceFingerprint } from "../lib/deviceFingerprint";

export type TokenPairPayload = {
  accessToken: string;
  refreshToken: string;
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

export const authEndpointPaths = {
  captcha: "/captcha",
  login: "/auth/login",
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

function createLegacyAuthRequestOptions() {
  const baseUrl = getLegacyAuthBaseUrl();

  return baseUrl ? { baseUrl } : {};
}

export const authApi = {
  async fetchCaptcha() {
    const deviceToken = await getDeviceFingerprint();

    return httpClient.requestDataUrl(authEndpointPaths.captcha, {
      auth: false,
      ...createLegacyAuthRequestOptions(),
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
    const body = {
      username: email,
      password,
      type: "username",
      ...(normalizedCaptchaCode ? { numcode: normalizedCaptchaCode } : {})
    };

    const tokens = await httpClient.request<TokenPairPayload>(authEndpointPaths.login, {
      auth: false,
      body,
      headers: deviceToken ? { token: deviceToken } : undefined,
      method: "POST",
      retryOnUnauthorized: false
    });
    setAuthTokens(tokens);

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
