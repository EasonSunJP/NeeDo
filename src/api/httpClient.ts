import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";

export type ApiSuccessResponse<TData> = {
  code: 0;
  message: "success" | string;
  data: TData;
};

export type ApiErrorResponse = {
  code: number;
  message: string;
  data: null;
};

type ApiEnvelope<TData> = ApiSuccessResponse<TData> | ApiErrorResponse;

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type HttpClientRequestOptions = {
  auth?: boolean;
  body?: unknown;
  headers?: Record<string, string>;
  method?: HttpMethod;
  query?: Record<string, boolean | number | string | null | undefined>;
  retryOnUnauthorized?: boolean;
};

export class ApiClientError extends Error {
  public readonly code: number;
  public readonly status: number;

  public constructor(message: string, code: number, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

const defaultApiPrefix = "/api/v1";
const fallbackApiRequestTimeoutMs = 10_000;
const configuredApiRequestTimeoutMs = Number.parseInt(import.meta.env.VITE_API_REQUEST_TIMEOUT_MS ?? "", 10);
export const apiRequestTimeoutMs = Number.isFinite(configuredApiRequestTimeoutMs) && configuredApiRequestTimeoutMs > 0
  ? configuredApiRequestTimeoutMs
  : fallbackApiRequestTimeoutMs;
const refreshTokenStorageKey = "needo.auth.refresh-token";
const legacyAccessTokenStorageKey = "needo.auth.access-token";
let accessToken: string | null = null;
let refreshRequest: Promise<string> | null = null;
let authExpiredHandler: (() => void) | null = null;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();

  return configured ? trimTrailingSlash(configured) : defaultApiPrefix;
}

function appendQuery(url: string, query?: HttpClientRequestOptions["query"]) {
  if (!query) {
    return url;
  }

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    params.set(key, String(value));
  });
  const queryString = params.toString();

  return queryString ? `${url}?${queryString}` : url;
}

function buildApiUrl(path: string, query?: HttpClientRequestOptions["query"]) {
  return appendQuery(`${getApiBaseUrl()}${normalizePath(path)}`, query);
}

async function parseEnvelope<TData>(response: Response): Promise<ApiEnvelope<TData>> {
  const text = await response.text();

  if (!text) {
    return response.ok
      ? ({ code: 0, message: "success", data: undefined as TData } satisfies ApiSuccessResponse<TData>)
      : ({ code: response.status, message: response.statusText || "error.network", data: null } satisfies ApiErrorResponse);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const looksLikeHtml = /^\s*<!doctype html|^\s*<html[\s>]/i.test(text);
  if (looksLikeHtml || (contentType && !contentType.includes("application/json"))) {
    throw new ApiClientError("error.resource_not_found", 404, 404);
  }

  try {
    return JSON.parse(text) as ApiEnvelope<TData>;
  } catch {
    throw new ApiClientError("error.response.invalid_json", response.status || 502, response.status || 502);
  }
}

function assertSuccess<TData>(envelope: ApiEnvelope<TData>, status: number): TData {
  if (envelope.code !== 0 || envelope.data === null) {
    throw new ApiClientError(envelope.message || "error.api", envelope.code, status);
  }

  return envelope.data;
}

function createRequestBody(body: unknown) {
  if (body === undefined) {
    return undefined;
  }

  if (body instanceof FormData) {
    return body;
  }

  return JSON.stringify(body);
}

function createRequestHeaders(options: HttpClientRequestOptions) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ?? {})
  };
  const hasJsonBody = options.body !== undefined && !(options.body instanceof FormData);

  if (hasJsonBody && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (options.auth !== false && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, apiRequestTimeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new ApiClientError("error.network.timeout", 408, 408);
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function refreshAccessToken(): Promise<string> {
  if (refreshRequest) {
    return refreshRequest;
  }

  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    throw new ApiClientError("error.auth.refresh_missing", 401, 401);
  }

  refreshRequest = (async () => {
    const response = await fetchWithTimeout(buildApiUrl("/auth/refresh"), {
      body: JSON.stringify({ refreshToken }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const envelope = await parseEnvelope<{ accessToken: string; expiresIn: number }>(response);
    const data = assertSuccess(envelope, response.status);

    accessToken = data.accessToken;
    return data.accessToken;
  })();

  try {
    return await refreshRequest;
  } finally {
    refreshRequest = null;
  }
}

async function sendRequest<TData>(
  path: string,
  options: HttpClientRequestOptions,
  canRetry: boolean
): Promise<TData> {
  const response = await fetchWithTimeout(buildApiUrl(path, options.query), {
    body: createRequestBody(options.body),
    headers: createRequestHeaders(options),
    method: options.method ?? (options.body === undefined ? "GET" : "POST")
  });
  const envelope = await parseEnvelope<TData>(response);

  if (
    response.status === 401 &&
    canRetry &&
    options.auth !== false &&
    options.retryOnUnauthorized !== false &&
    getStoredRefreshToken()
  ) {
    try {
      await refreshAccessToken();
      return sendRequest(path, options, false);
    } catch (error) {
      clearAuthTokens();
      authExpiredHandler?.();
      throw error;
    }
  }

  return assertSuccess(envelope, response.status);
}

export function getAccessToken() {
  return accessToken;
}

export function getStoredRefreshToken() {
  return readBrowserStorage(refreshTokenStorageKey, { silent: true });
}

export function setAccessToken(nextAccessToken: string | null) {
  accessToken = nextAccessToken;
  removeBrowserStorage(legacyAccessTokenStorageKey, { silent: true });
}

export function setAuthTokens(tokens: { accessToken: string; refreshToken?: string | null }) {
  setAccessToken(tokens.accessToken);

  if (tokens.refreshToken) {
    writeBrowserStorage(refreshTokenStorageKey, tokens.refreshToken, { silent: true });
  }
}

export function clearAuthTokens() {
  accessToken = null;
  removeBrowserStorage(refreshTokenStorageKey, { silent: true });
  removeBrowserStorage(legacyAccessTokenStorageKey, { silent: true });
}

export function setAuthExpiredHandler(handler: (() => void) | null) {
  authExpiredHandler = handler;
}

export const httpClient = {
  request<TData>(path: string, options: HttpClientRequestOptions = {}) {
    return sendRequest<TData>(path, options, true);
  }
};
