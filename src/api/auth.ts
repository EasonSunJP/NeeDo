import { clearAuthTokens, getStoredRefreshToken, httpClient, setAccessToken, setAuthTokens } from "./httpClient";
import type { AuthMePayload } from "../auth/rbac";

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

export const authApi = {
  async login(email: string, password: string) {
    const tokens = await httpClient.request<TokenPairPayload>("/auth/login", {
      auth: false,
      body: { email, password },
      method: "POST",
      retryOnUnauthorized: false
    });
    setAuthTokens(tokens);

    return tokens;
  },

  async testLogin(portal: "user" | "merchant" | "technician" | "business" | "admin") {
    const tokens = await httpClient.request<TokenPairPayload>("/auth/test-login", {
      auth: false,
      body: { portal },
      method: "POST",
      retryOnUnauthorized: false
    });
    setAuthTokens(tokens);

    return tokens;
  },

  async sendOtp(email: string) {
    return httpClient.request<OtpSendPayload>("/auth/otp/send", {
      auth: false,
      body: { email },
      method: "POST",
      retryOnUnauthorized: false
    });
  },

  async verifyOtp(email: string, otp: string) {
    const tokens = await httpClient.request<TokenPairPayload>("/auth/otp/verify", {
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

    const tokens = await httpClient.request<RefreshPayload>("/auth/refresh", {
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
      return await httpClient.request<Record<string, never>>("/auth/logout", {
        body: { refreshToken },
        method: "POST",
        retryOnUnauthorized: false
      });
    } finally {
      clearAuthTokens();
    }
  },

  async me() {
    return httpClient.request<AuthMePayload>("/auth/me");
  }
};
