import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import { getDeviceFingerprint } from "../lib/deviceFingerprint";
import { resolveStaticDemoDataUrl, resolveStaticDemoRequest } from "./staticDemo";

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
  baseUrl?: string;
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

function getRequestBaseUrl(baseUrl?: string) {
  const configured = baseUrl?.trim();

  return configured ? trimTrailingSlash(configured) : getApiBaseUrl();
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

function buildApiUrl(path: string, query?: HttpClientRequestOptions["query"], baseUrl?: string) {
  return appendQuery(`${getRequestBaseUrl(baseUrl)}${normalizePath(path)}`, query);
}

function isJsonContentType(contentType: string) {
  return contentType.includes("application/json") || contentType.includes("+json");
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
  if (looksLikeHtml || (contentType && !isJsonContentType(contentType))) {
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
    const upstreamMessage = (envelope as { msg?: unknown }).msg;
    const message = envelope.message || (typeof upstreamMessage === "string" ? upstreamMessage : "error.api");

    throw new ApiClientError(message, envelope.code, status);
  }

  return envelope.data;
}

function createRequestBody(body: unknown) {
  if (body === undefined) {
    return undefined;
  }

  if (body instanceof FormData || body instanceof URLSearchParams) {
    return body;
  }

  return JSON.stringify(body);
}

async function createRequestHeaders(options: HttpClientRequestOptions) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ?? {})
  };
  const hasJsonBody =
    options.body !== undefined &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof URLSearchParams);

  if (hasJsonBody && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (options.auth !== false && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (import.meta.env.VITE_ENABLE_DEVICE_TOKEN_HEADER === "true" && !headers.token) {
    const deviceFingerprint = await getDeviceFingerprint();

    if (deviceFingerprint) {
      headers.token = deviceFingerprint;
    }
  }

  if (import.meta.env.VITE_ENABLE_DEVICE_FINGERPRINT_HEADER === "true" && !headers["X-Needo-Device-Fingerprint"]) {
    const deviceFingerprint = await getDeviceFingerprint();

    if (deviceFingerprint) {
      headers["X-Needo-Device-Fingerprint"] = deviceFingerprint;
    }
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
    const body = { refreshToken };
    const response = await fetchWithTimeout(buildApiUrl("/auth/refresh"), {
      body: JSON.stringify(body),
      headers: await createRequestHeaders({ auth: false, body }),
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
  const staticResult = await resolveStaticDemoRequest<TData>(path, options);

  if (staticResult.handled) {
    return staticResult.data;
  }

  const response = await fetchWithTimeout(buildApiUrl(path, options.query, options.baseUrl), {
    body: createRequestBody(options.body),
    headers: await createRequestHeaders(options),
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

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return globalThis.btoa(binary);
}

async function sendDataUrlRequest(path: string, options: HttpClientRequestOptions): Promise<string> {
  const staticResult = resolveStaticDemoDataUrl(path);

  if (staticResult.handled) {
    return staticResult.data;
  }

  const response = await fetchWithTimeout(buildApiUrl(path, options.query, options.baseUrl), {
    body: createRequestBody(options.body),
    headers: await createRequestHeaders(options),
    method: options.method ?? (options.body === undefined ? "GET" : "POST")
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok || isJsonContentType(contentType)) {
    const envelope = await parseEnvelope<string>(response);
    return assertSuccess(envelope, response.status);
  }

  if (contentType.includes("text/html")) {
    throw new ApiClientError("error.resource_not_found", 404, 404);
  }

  const buffer = await response.arrayBuffer();

  return `data:${contentType || "application/octet-stream"};base64,${arrayBufferToBase64(buffer)}`;
}

export function getAccessToken() {
  return accessToken;
}

export function getStoredRefreshToken() {
  return readBrowserStorage(refreshTokenStorageKey, { silent: true });
}

export function setStoredRefreshToken(nextRefreshToken: string | null) {
  if (nextRefreshToken) {
    writeBrowserStorage(refreshTokenStorageKey, nextRefreshToken, { silent: true });
    return;
  }

  removeBrowserStorage(refreshTokenStorageKey, { silent: true });
}

export function setAccessToken(nextAccessToken: string | null) {
  accessToken = nextAccessToken;
  removeBrowserStorage(legacyAccessTokenStorageKey, { silent: true });
}

export function setAuthTokens(tokens: { accessToken: string; refreshToken?: string | null }) {
  setAccessToken(tokens.accessToken);

  if (tokens.refreshToken) {
    setStoredRefreshToken(tokens.refreshToken);
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
  },
  requestDataUrl(path: string, options: HttpClientRequestOptions = {}) {
    return sendDataUrlRequest(path, options);
  }
};
