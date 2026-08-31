import { getDeviceFingerprint } from "../lib/deviceFingerprint";
import {
  getMerchantAdminPreview,
  merchantAdminPreviewShopHeader
} from "../auth/merchantAdminPreview";
import {
  commitAutoRefreshedAccessToken,
  getAuthCredentialSnapshot as getCoordinatorSnapshot,
  installServerAuthCredentials,
  setCoordinatorAccessToken,
  setCoordinatorExpectedUserId,
  setCoordinatorRefreshToken,
  terminateAuthImmediately,
  type AuthCredentialSnapshot
} from "../auth/authCredentialCoordinator";
import { formalAccessTokenTtlSeconds } from "../auth/authContract";

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
  signal?: AbortSignal;
  unauthorizedPolicy?: "caller" | "global";
};

export type HttpClientCsvExportPayload = {
  filename: string;
  contentType: "text/csv; charset=utf-8";
  csv: string;
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
const configuredApiRequestTimeoutMs = Number.parseInt(
  import.meta.env.VITE_API_REQUEST_TIMEOUT_MS ?? "",
  10
);
export const apiRequestTimeoutMs =
  Number.isFinite(configuredApiRequestTimeoutMs) && configuredApiRequestTimeoutMs > 0
    ? configuredApiRequestTimeoutMs
    : fallbackApiRequestTimeoutMs;
type RefreshedAccessToken = {
  accessToken: string;
  expiresIn: number;
};
let refreshRequest: {
  credentialVersion: number;
  generation: number;
  promise: Promise<RefreshedAccessToken>;
} | null = null;

function throwIfCredentialTransitionIsActive(snapshot: AuthCredentialSnapshot) {
  if (snapshot.phase !== "client_committed") {
    throw new ApiClientError("error.auth.operation_superseded", 409, 409);
  }
}

function isSameCredentialState(left: AuthCredentialSnapshot, right: AuthCredentialSnapshot) {
  return left.credentialVersion === right.credentialVersion && left.generation === right.generation;
}
let authExpiredHandler: (() => void) | null = null;

function readAccessTokenSubject(token: string | null) {
  if (!token) {
    return null;
  }

  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) {
    return null;
  }

  try {
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(globalThis.atob(padded)) as { sub?: unknown };
    const subject =
      typeof payload.sub === "number" || typeof payload.sub === "string"
        ? Number(payload.sub)
        : Number.NaN;

    return Number.isInteger(subject) && subject > 0 ? subject : null;
  } catch {
    return null;
  }
}

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

export function buildApiUrl(
  path: string,
  query?: HttpClientRequestOptions["query"],
  baseUrl?: string
) {
  return appendQuery(`${getRequestBaseUrl(baseUrl)}${normalizePath(path)}`, query);
}

function isJsonContentType(contentType: string) {
  return contentType.includes("application/json") || contentType.includes("+json");
}

async function parseEnvelope<TData>(response: Response): Promise<ApiEnvelope<TData>> {
  const text = await response.text();

  if (!text) {
    return response.ok
      ? ({
          code: 0,
          message: "success",
          data: undefined as TData
        } satisfies ApiSuccessResponse<TData>)
      : ({
          code: response.status,
          message: response.statusText || "error.network",
          data: null
        } satisfies ApiErrorResponse);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const looksLikeHtml = /^\s*<!doctype html|^\s*<html[\s>]/i.test(text);
  if (looksLikeHtml || (contentType && !isJsonContentType(contentType))) {
    throw new ApiClientError("error.resource_not_found", 404, 404);
  }

  try {
    return JSON.parse(text) as ApiEnvelope<TData>;
  } catch {
    throw new ApiClientError(
      "error.response.invalid_json",
      response.status || 502,
      response.status || 502
    );
  }
}

function assertSuccess<TData>(envelope: ApiEnvelope<TData>, status: number): TData {
  if (envelope.code !== 0 || envelope.data === null) {
    const upstreamMessage = (envelope as { msg?: unknown }).msg;
    const message =
      envelope.message || (typeof upstreamMessage === "string" ? upstreamMessage : "error.api");

    throw new ApiClientError(message, envelope.code, status);
  }

  return envelope.data;
}

function createRequestBody(body: unknown) {
  if (body === undefined) {
    return undefined;
  }

  if (
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer
  ) {
    return body;
  }

  return JSON.stringify(body);
}

async function createRequestHeaders(
  options: HttpClientRequestOptions,
  previewShopId?: number | null,
  requestAccessToken = getCoordinatorSnapshot().accessToken
) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ?? {})
  };
  const hasJsonBody =
    options.body !== undefined &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof URLSearchParams) &&
    !(options.body instanceof Blob) &&
    !(options.body instanceof ArrayBuffer);

  if (hasJsonBody && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (options.auth !== false && requestAccessToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${requestAccessToken}`;
  }

  if (options.auth !== false && previewShopId) {
    headers[merchantAdminPreviewShopHeader] = String(previewShopId);
  }

  if (import.meta.env.VITE_ENABLE_DEVICE_TOKEN_HEADER === "true" && !headers.token) {
    const deviceFingerprint = await getDeviceFingerprint();

    if (deviceFingerprint) {
      headers.token = deviceFingerprint;
    }
  }

  if (
    import.meta.env.VITE_ENABLE_DEVICE_FINGERPRINT_HEADER === "true" &&
    !headers["X-Needo-Device-Fingerprint"]
  ) {
    const deviceFingerprint = await getDeviceFingerprint();

    if (deviceFingerprint) {
      headers["X-Needo-Device-Fingerprint"] = deviceFingerprint;
    }
  }

  return headers;
}

function resolveRequestMethod(options: HttpClientRequestOptions): HttpMethod {
  return options.method ?? (options.body === undefined ? "GET" : "POST");
}

function getPreviewShopId(options: HttpClientRequestOptions) {
  return options.auth === false ? null : (getMerchantAdminPreview()?.selectedShopId ?? null);
}

function assertMerchantPreviewAllows(method: HttpMethod, previewShopId: number | null) {
  if (previewShopId && method !== "GET") {
    throw new ApiClientError("error.merchant_preview.read_only", 403, 403);
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;
  const abortFromExternalSignal = () => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });
  }
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, apiRequestTimeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (externalSignal?.aborted) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ApiClientError("error.network.timeout", 408, 408);
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

export async function refreshStoredAccessToken(): Promise<RefreshedAccessToken> {
  const captured = getCoordinatorSnapshot();
  throwIfCredentialTransitionIsActive(captured);
  if (
    refreshRequest?.credentialVersion === captured.credentialVersion &&
    refreshRequest.generation === captured.generation
  ) {
    return refreshRequest.promise;
  }
  const refreshToken = captured.refreshToken;
  if (!refreshToken) {
    throw new ApiClientError("error.auth.refresh_missing", 401, 401);
  }

  const request = (async () => {
    const body = { refreshToken };
    const response = await fetchWithTimeout(buildApiUrl("/auth/refresh"), {
      body: JSON.stringify(body),
      headers: await createRequestHeaders({ auth: false, body }),
      method: "POST"
    });
    const envelope = await parseEnvelope<RefreshedAccessToken>(response);
    const data = assertSuccess(envelope, response.status);
    if (
      typeof data.accessToken !== "string" ||
      data.accessToken.length === 0 ||
      !Number.isInteger(data.expiresIn) ||
      data.expiresIn !== formalAccessTokenTtlSeconds
    ) {
      throw new ApiClientError("error.api", 502, 502);
    }

    if (
      !commitAutoRefreshedAccessToken(
        captured.credentialVersion,
        captured.generation,
        data.accessToken
      )
    ) {
      throw new ApiClientError("error.auth.operation_superseded", 409, 409);
    }
    return data;
  })();
  const requestState = {
    credentialVersion: captured.credentialVersion,
    generation: captured.generation,
    promise: request
  };
  refreshRequest = requestState;

  try {
    return await request;
  } finally {
    if (refreshRequest === requestState) refreshRequest = null;
  }
}

async function alignAccessTokenWithExpectedUser(options: HttpClientRequestOptions) {
  const snapshot = getCoordinatorSnapshot();
  if (options.auth !== false && options.unauthorizedPolicy !== "caller") {
    throwIfCredentialTransitionIsActive(snapshot);
  }
  if (
    options.auth === false ||
    options.unauthorizedPolicy === "caller" ||
    !snapshot.accessToken ||
    snapshot.expectedAuthUserId === null
  ) {
    return;
  }

  const accessTokenSubject = readAccessTokenSubject(snapshot.accessToken);
  if (accessTokenSubject === null || accessTokenSubject === snapshot.expectedAuthUserId) {
    return;
  }

  setAccessToken(null);
  let alignmentSnapshot = getCoordinatorSnapshot();

  try {
    const refreshed = await refreshStoredAccessToken();
    alignmentSnapshot = getCoordinatorSnapshot();
    if (readAccessTokenSubject(refreshed.accessToken) !== snapshot.expectedAuthUserId) {
      throw new ApiClientError("error.auth.session_mismatch", 401, 401);
    }
  } catch (error) {
    if (isSameCredentialState(getCoordinatorSnapshot(), alignmentSnapshot)) {
      terminateAuthImmediately();
      authExpiredHandler?.();
    }
    throw error;
  }
}

async function sendRequest<TData>(
  path: string,
  options: HttpClientRequestOptions,
  canRetry: boolean
): Promise<TData> {
  await alignAccessTokenWithExpectedUser(options);
  const captured = getCoordinatorSnapshot();
  const method = resolveRequestMethod(options);
  const previewShopId = getPreviewShopId(options);
  assertMerchantPreviewAllows(method, previewShopId);

  const response = await fetchWithTimeout(buildApiUrl(path, options.query, options.baseUrl), {
    body: createRequestBody(options.body),
    headers: await createRequestHeaders(options, previewShopId, captured.accessToken),
    method,
    signal: options.signal
  });
  const envelope = await parseEnvelope<TData>(response);

  if (
    response.status === 401 &&
    options.auth !== false &&
    options.unauthorizedPolicy !== "caller"
  ) {
    const current = getCoordinatorSnapshot();
    throwIfCredentialTransitionIsActive(current);
    if (!isSameCredentialState(captured, current)) {
      if (canRetry && current.accessToken) {
        return sendRequest(path, options, false);
      }
      return assertSuccess(envelope, response.status);
    }
  }

  if (
    response.status === 401 &&
    canRetry &&
    options.auth !== false &&
    options.unauthorizedPolicy !== "caller" &&
    options.retryOnUnauthorized !== false &&
    captured.refreshToken
  ) {
    try {
      await refreshStoredAccessToken();
      return sendRequest(path, options, false);
    } catch (error) {
      if (isSameCredentialState(getCoordinatorSnapshot(), captured)) {
        terminateAuthImmediately();
        authExpiredHandler?.();
      }
      throw error;
    }
  }

  if (
    response.status === 401 &&
    options.auth !== false &&
    options.unauthorizedPolicy !== "caller" &&
    isSameCredentialState(getCoordinatorSnapshot(), captured)
  ) {
    terminateAuthImmediately();
    authExpiredHandler?.();
  }

  return assertSuccess(envelope, response.status);
}

function parseCsvFilename(contentDisposition: string | null) {
  if (!contentDisposition) {
    return "export.csv";
  }

  const encodedMatch = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }

  const quotedMatch = /filename="([^"]+)"/i.exec(contentDisposition);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = /filename=([^;]+)/i.exec(contentDisposition);
  return plainMatch?.[1]?.trim() || "export.csv";
}

async function sendCsvExportRequest(
  path: string,
  options: HttpClientRequestOptions,
  canRetry: boolean
): Promise<HttpClientCsvExportPayload> {
  await alignAccessTokenWithExpectedUser(options);
  const captured = getCoordinatorSnapshot();
  const method = resolveRequestMethod(options);
  const previewShopId = getPreviewShopId(options);
  assertMerchantPreviewAllows(method, previewShopId);

  const response = await fetchWithTimeout(buildApiUrl(path, options.query, options.baseUrl), {
    body: createRequestBody(options.body),
    headers: await createRequestHeaders(
      {
        ...options,
        headers: { ...(options.headers ?? {}), Accept: "text/csv" }
      },
      previewShopId,
      captured.accessToken
    ),
    method,
    signal: options.signal
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (
    response.status === 401 &&
    options.auth !== false &&
    options.unauthorizedPolicy !== "caller"
  ) {
    const current = getCoordinatorSnapshot();
    throwIfCredentialTransitionIsActive(current);
    if (!isSameCredentialState(captured, current) && canRetry && current.accessToken) {
      return sendCsvExportRequest(path, options, false);
    }
  }

  if (
    response.status === 401 &&
    canRetry &&
    options.auth !== false &&
    options.unauthorizedPolicy !== "caller" &&
    options.retryOnUnauthorized !== false &&
    captured.refreshToken
  ) {
    const current = getCoordinatorSnapshot();
    throwIfCredentialTransitionIsActive(current);
    if (!isSameCredentialState(captured, current)) {
      if (current.accessToken) return sendCsvExportRequest(path, options, false);
    } else {
      try {
        await refreshStoredAccessToken();
        return sendCsvExportRequest(path, options, false);
      } catch (error) {
        if (isSameCredentialState(getCoordinatorSnapshot(), captured)) {
          terminateAuthImmediately();
          authExpiredHandler?.();
        }
        throw error;
      }
    }
  }

  if (
    response.status === 401 &&
    options.auth !== false &&
    options.unauthorizedPolicy !== "caller" &&
    isSameCredentialState(getCoordinatorSnapshot(), captured)
  ) {
    terminateAuthImmediately();
    authExpiredHandler?.();
  }

  if (!response.ok || isJsonContentType(contentType)) {
    const envelope = await parseEnvelope<unknown>(response);
    assertSuccess(envelope, response.status);
  }

  if (!contentType.includes("text/csv")) {
    throw new ApiClientError(
      "error.response.invalid_csv",
      response.status || 502,
      response.status || 502
    );
  }

  return {
    filename: parseCsvFilename(response.headers.get("content-disposition")),
    contentType: "text/csv; charset=utf-8",
    csv: await response.text()
  };
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

async function sendDataUrlRequest(
  path: string,
  options: HttpClientRequestOptions,
  canRetry: boolean
): Promise<string> {
  await alignAccessTokenWithExpectedUser(options);
  const captured = getCoordinatorSnapshot();
  const method = resolveRequestMethod(options);
  const previewShopId = getPreviewShopId(options);
  assertMerchantPreviewAllows(method, previewShopId);

  const response = await fetchWithTimeout(buildApiUrl(path, options.query, options.baseUrl), {
    body: createRequestBody(options.body),
    headers: await createRequestHeaders(options, previewShopId, captured.accessToken),
    method,
    signal: options.signal
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (
    response.status === 401 &&
    options.auth !== false &&
    options.unauthorizedPolicy !== "caller"
  ) {
    const current = getCoordinatorSnapshot();
    throwIfCredentialTransitionIsActive(current);
    if (!isSameCredentialState(captured, current) && canRetry && current.accessToken) {
      return sendDataUrlRequest(path, options, false);
    }
  }

  if (
    response.status === 401 &&
    canRetry &&
    options.auth !== false &&
    options.unauthorizedPolicy !== "caller" &&
    options.retryOnUnauthorized !== false &&
    captured.refreshToken
  ) {
    const current = getCoordinatorSnapshot();
    throwIfCredentialTransitionIsActive(current);
    if (!isSameCredentialState(captured, current)) {
      if (current.accessToken) return sendDataUrlRequest(path, options, false);
    } else {
      try {
        await refreshStoredAccessToken();
        return sendDataUrlRequest(path, options, false);
      } catch (error) {
        if (isSameCredentialState(getCoordinatorSnapshot(), captured)) {
          terminateAuthImmediately();
          authExpiredHandler?.();
        }
        throw error;
      }
    }
  }

  if (
    response.status === 401 &&
    options.auth !== false &&
    options.unauthorizedPolicy !== "caller" &&
    isSameCredentialState(getCoordinatorSnapshot(), captured)
  ) {
    terminateAuthImmediately();
    authExpiredHandler?.();
  }

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
  return getCoordinatorSnapshot().accessToken;
}

export function getStoredRefreshToken() {
  return getCoordinatorSnapshot().refreshToken;
}

export function setStoredRefreshToken(nextRefreshToken: string | null) {
  return setCoordinatorRefreshToken(nextRefreshToken);
}

export function setAccessToken(nextAccessToken: string | null) {
  return setCoordinatorAccessToken(nextAccessToken);
}

export function setExpectedAuthUserId(userId: number | null) {
  setCoordinatorExpectedUserId(userId);
}

export function setAuthTokens(tokens: { accessToken: string; refreshToken?: string | null }) {
  if (!tokens.refreshToken) {
    return setAccessToken(tokens.accessToken);
  }
  return installServerAuthCredentials({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken
  });
}

export function clearAuthTokens() {
  terminateAuthImmediately();
  return getCoordinatorSnapshot().accessToken === null;
}

export function getAuthCredentialEpoch() {
  return getCoordinatorSnapshot().credentialVersion;
}

export function getAuthCredentialSnapshot(): AuthCredentialSnapshot {
  return getCoordinatorSnapshot();
}

export function restoreAuthCredentialSnapshot(snapshot: AuthCredentialSnapshot) {
  if (!snapshot.refreshToken) {
    terminateAuthImmediately();
    return true;
  }
  return installServerAuthCredentials(
    {
      accessToken: snapshot.accessToken,
      refreshToken: snapshot.refreshToken
    },
    snapshot.expectedAuthUserId
  );
}

export function setAuthExpiredHandler(handler: (() => void) | null) {
  authExpiredHandler = handler;
}

export const httpClient = {
  request<TData>(path: string, options: HttpClientRequestOptions = {}) {
    return sendRequest<TData>(path, options, true);
  },
  requestCsvExport(path: string, options: HttpClientRequestOptions = {}) {
    return sendCsvExportRequest(path, options, true);
  },
  requestDataUrl(path: string, options: HttpClientRequestOptions = {}) {
    return sendDataUrlRequest(path, options, true);
  }
};
