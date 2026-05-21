import { useSyncExternalStore } from "react";
import { parseBrowserStorageJson, writeBrowserStorage } from "../lib/browserStorage";

export type OrderServiceSessionStatus = "waiting" | "inService" | "completed";
export type OrderExtensionRequestStatus = "pending" | "accepted" | "declined" | "dismissed";
export type OrderServiceReviewRewardStatus = "pending" | "issued" | "failed";

export interface OrderExtensionRequest {
  id: string;
  orderId: string;
  packageId: string;
  title: string;
  durationMinutes: number;
  price: number;
  requestedAt: number;
  status: OrderExtensionRequestStatus;
  respondedAt?: number;
}

export interface OrderServiceUserReview {
  submittedAt: number;
  rating: number;
  tags: string[];
  maxRewardNdp: number;
  rewardStatus: OrderServiceReviewRewardStatus;
  rewardSettledAt?: number;
  awardedNdp?: number;
}

export interface OrderServiceSession {
  orderId: string;
  status: OrderServiceSessionStatus;
  baseDurationMinutes: number;
  addedDurationMinutes: number;
  startedAt?: number;
  completedAt?: number;
  userReview?: OrderServiceUserReview;
  userReviewClosedAt?: number;
  technicianReviewClosedAt?: number;
  tenMinuteAlertDismissedAt?: number;
  endedAlertDismissedAt?: number;
  extensionRequests: OrderExtensionRequest[];
}

type SessionMap = Record<string, OrderServiceSession>;

const storageKey = "needo.order-service-sessions.v1";
const listeners = new Set<() => void>();
let hydrated = false;
let storageListenerBound = false;
let cachedSessions: SessionMap = {};
let cachedSnapshot: SessionMap | null = null;

function toPositiveMinutes(value: unknown, fallback = 60) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function cloneSession(session: OrderServiceSession): OrderServiceSession {
  return JSON.parse(JSON.stringify(session)) as OrderServiceSession;
}

function createDefaultSession(orderId: string, baseDurationMinutes: number): OrderServiceSession {
  return {
    orderId,
    status: "waiting",
    baseDurationMinutes: toPositiveMinutes(baseDurationMinutes),
    addedDurationMinutes: 0,
    extensionRequests: []
  };
}

function normalizeExtensionRequest(raw: Partial<OrderExtensionRequest>, orderId: string): OrderExtensionRequest | null {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string") {
    return null;
  }

  const status: OrderExtensionRequestStatus =
    raw.status === "accepted" || raw.status === "declined" || raw.status === "dismissed" ? raw.status : "pending";

  return {
    id: raw.id,
    orderId,
    packageId: typeof raw.packageId === "string" ? raw.packageId : "extension",
    title: typeof raw.title === "string" ? raw.title : "追加服务",
    durationMinutes: toPositiveMinutes(raw.durationMinutes, 30),
    price: typeof raw.price === "number" && Number.isFinite(raw.price) ? raw.price : 0,
    requestedAt: typeof raw.requestedAt === "number" && Number.isFinite(raw.requestedAt) ? raw.requestedAt : Date.now(),
    status,
    respondedAt: typeof raw.respondedAt === "number" && Number.isFinite(raw.respondedAt) ? raw.respondedAt : undefined
  };
}

function normalizeUserReview(raw: Partial<OrderServiceUserReview> | undefined): OrderServiceUserReview | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const rewardStatus: OrderServiceReviewRewardStatus =
    raw.rewardStatus === "issued" || raw.rewardStatus === "failed" ? raw.rewardStatus : "pending";

  return {
    submittedAt: typeof raw.submittedAt === "number" && Number.isFinite(raw.submittedAt) ? raw.submittedAt : Date.now(),
    rating: typeof raw.rating === "number" && Number.isFinite(raw.rating) ? Math.min(5, Math.max(0.5, raw.rating)) : 5,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
    maxRewardNdp: typeof raw.maxRewardNdp === "number" && Number.isFinite(raw.maxRewardNdp) ? Math.max(0, Math.round(raw.maxRewardNdp)) : 0,
    rewardStatus,
    rewardSettledAt:
      typeof raw.rewardSettledAt === "number" && Number.isFinite(raw.rewardSettledAt)
        ? raw.rewardSettledAt
        : undefined,
    awardedNdp:
      typeof raw.awardedNdp === "number" && Number.isFinite(raw.awardedNdp)
        ? Math.max(0, Math.round(raw.awardedNdp))
        : undefined
  };
}

function normalizeSession(raw: Partial<OrderServiceSession>): OrderServiceSession | null {
  if (!raw || typeof raw !== "object" || typeof raw.orderId !== "string") {
    return null;
  }

  const status: OrderServiceSessionStatus =
    raw.status === "inService" || raw.status === "completed" ? raw.status : "waiting";
  const extensionRequests = Array.isArray(raw.extensionRequests)
    ? raw.extensionRequests
        .map((request) => normalizeExtensionRequest(request, raw.orderId!))
        .filter((request): request is OrderExtensionRequest => Boolean(request))
    : [];

  return {
    orderId: raw.orderId,
    status,
    baseDurationMinutes: toPositiveMinutes(raw.baseDurationMinutes),
    addedDurationMinutes: typeof raw.addedDurationMinutes === "number" && Number.isFinite(raw.addedDurationMinutes)
      ? Math.max(0, Math.round(raw.addedDurationMinutes))
      : extensionRequests
          .filter((request) => request.status === "accepted")
          .reduce((sum, request) => sum + request.durationMinutes, 0),
    startedAt: typeof raw.startedAt === "number" && Number.isFinite(raw.startedAt) ? raw.startedAt : undefined,
    completedAt: typeof raw.completedAt === "number" && Number.isFinite(raw.completedAt) ? raw.completedAt : undefined,
    userReview: normalizeUserReview(raw.userReview),
    userReviewClosedAt:
      typeof raw.userReviewClosedAt === "number" && Number.isFinite(raw.userReviewClosedAt)
        ? raw.userReviewClosedAt
        : undefined,
    technicianReviewClosedAt:
      typeof raw.technicianReviewClosedAt === "number" && Number.isFinite(raw.technicianReviewClosedAt)
        ? raw.technicianReviewClosedAt
        : undefined,
    tenMinuteAlertDismissedAt:
      typeof raw.tenMinuteAlertDismissedAt === "number" && Number.isFinite(raw.tenMinuteAlertDismissedAt)
        ? raw.tenMinuteAlertDismissedAt
        : undefined,
    endedAlertDismissedAt:
      typeof raw.endedAlertDismissedAt === "number" && Number.isFinite(raw.endedAlertDismissedAt)
        ? raw.endedAlertDismissedAt
        : undefined,
    extensionRequests
  };
}

function ensureStorageListener() {
  if (storageListenerBound || typeof window === "undefined") {
    return;
  }

  storageListenerBound = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey) {
      return;
    }

    hydrated = false;
    cachedSnapshot = null;
    hydrate();
    listeners.forEach((listener) => listener());
  });
}

function hydrate() {
  ensureStorageListener();

  if (hydrated || typeof window === "undefined") {
    return;
  }

  hydrated = true;
  const parsed = parseBrowserStorageJson<Partial<OrderServiceSession>[]>(storageKey, [], { silent: true, removeOnError: true });
  cachedSessions = Array.isArray(parsed)
    ? parsed.reduce<SessionMap>((map, item) => {
        const normalized = normalizeSession(item);

        if (normalized) {
          map[normalized.orderId] = normalized;
        }

        return map;
      }, {})
    : {};
}

function persist() {
  if (typeof window === "undefined") {
    return;
  }

  writeBrowserStorage(storageKey, JSON.stringify(Object.values(cachedSessions)), { silent: true });
}

function notify() {
  cachedSnapshot = null;
  listeners.forEach((listener) => listener());
}

function getSnapshot() {
  hydrate();

  if (!cachedSnapshot) {
    cachedSnapshot = Object.fromEntries(Object.entries(cachedSessions).map(([orderId, session]) => [orderId, cloneSession(session)]));
  }

  return cachedSnapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getMutableSession(orderId: string, baseDurationMinutes: number) {
  hydrate();

  return cachedSessions[orderId] ?? createDefaultSession(orderId, baseDurationMinutes);
}

function updateSession(orderId: string, baseDurationMinutes: number, updater: (session: OrderServiceSession) => OrderServiceSession) {
  if (!orderId) {
    return;
  }

  const current = getMutableSession(orderId, baseDurationMinutes);
  cachedSessions = {
    ...cachedSessions,
    [orderId]: updater(cloneSession(current))
  };
  persist();
  notify();
}

export function useOrderServiceSession(orderId: string | undefined, baseDurationMinutes: number) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (!orderId) {
    return createDefaultSession("", baseDurationMinutes);
  }

  return snapshot[orderId] ?? createDefaultSession(orderId, baseDurationMinutes);
}

export function useOrderServiceSessions() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getOrderServiceTotalMinutes(session: OrderServiceSession) {
  return session.baseDurationMinutes + session.addedDurationMinutes;
}

export function getOrderServiceRemainingMinutes(session: OrderServiceSession, now = Date.now()) {
  return Math.ceil(getOrderServiceRemainingSeconds(session, now) / 60);
}

export function getOrderServiceRemainingSeconds(session: OrderServiceSession, now = Date.now()) {
  if (session.status !== "inService" || !session.startedAt) {
    return getOrderServiceTotalMinutes(session) * 60;
  }

  const endsAt = session.startedAt + getOrderServiceTotalMinutes(session) * 60_000;

  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function getPendingOrderExtensionRequest(session: OrderServiceSession) {
  return [...session.extensionRequests].reverse().find((request) => request.status === "pending") ?? null;
}

export function getLatestDeclinedOrderExtensionRequest(session: OrderServiceSession) {
  return [...session.extensionRequests].reverse().find((request) => request.status === "declined") ?? null;
}

export function startOrderService(orderId: string, baseDurationMinutes: number) {
  const now = Date.now();

  updateSession(orderId, baseDurationMinutes, (session) => ({
    ...session,
    status: "inService",
    baseDurationMinutes: session.baseDurationMinutes || toPositiveMinutes(baseDurationMinutes),
    startedAt: session.startedAt ?? now,
    completedAt: undefined,
    endedAlertDismissedAt: undefined,
    tenMinuteAlertDismissedAt: undefined
  }));
}

export function endOrderService(orderId: string, baseDurationMinutes: number) {
  updateSession(orderId, baseDurationMinutes, (session) => ({
    ...session,
    status: "completed",
    completedAt: Date.now()
  }));
}

export function dismissOrderServiceReview(orderId: string, baseDurationMinutes: number, reviewer: "user" | "technician") {
  updateSession(orderId, baseDurationMinutes, (session) => ({
    ...session,
    userReviewClosedAt: reviewer === "user" ? Date.now() : session.userReviewClosedAt,
    technicianReviewClosedAt: reviewer === "technician" ? Date.now() : session.technicianReviewClosedAt
  }));
}

export function submitOrderServiceUserReview(
  orderId: string,
  baseDurationMinutes: number,
  review: { rating: number; tags: string[]; maxRewardNdp: number }
) {
  const now = Date.now();

  updateSession(orderId, baseDurationMinutes, (session) => ({
    ...session,
    userReview: {
      submittedAt: now,
      rating: Math.min(5, Math.max(0.5, review.rating)),
      tags: [...review.tags],
      maxRewardNdp: Math.max(0, Math.round(review.maxRewardNdp)),
      rewardStatus: "pending"
    },
    userReviewClosedAt: now
  }));
}

export function settleOrderServiceUserReviewReward(
  orderId: string,
  baseDurationMinutes: number,
  result: { status: "issued"; awardedNdp: number } | { status: "failed" }
) {
  updateSession(orderId, baseDurationMinutes, (session) => {
    if (!session.userReview) {
      return session;
    }

    return {
      ...session,
      userReview: {
        ...session.userReview,
        rewardStatus: result.status,
        rewardSettledAt: Date.now(),
        awardedNdp: result.status === "issued" ? Math.max(0, Math.round(result.awardedNdp)) : session.userReview.awardedNdp
      }
    };
  });
}

export function requestOrderExtension(
  orderId: string,
  baseDurationMinutes: number,
  extension: { packageId: string; title: string; durationMinutes: number; price: number }
) {
  const now = Date.now();
  const request: OrderExtensionRequest = {
    id: `${orderId}-extension-${now}`,
    orderId,
    packageId: extension.packageId,
    title: extension.title,
    durationMinutes: toPositiveMinutes(extension.durationMinutes, 30),
    price: typeof extension.price === "number" && Number.isFinite(extension.price) ? extension.price : 0,
    requestedAt: now,
    status: "pending"
  };

  updateSession(orderId, baseDurationMinutes, (session) => ({
    ...session,
    extensionRequests: [...session.extensionRequests, request]
  }));

  return request;
}

export function respondOrderExtensionRequest(orderId: string, baseDurationMinutes: number, requestId: string, accepted: boolean) {
  updateSession(orderId, baseDurationMinutes, (session) => {
    const target = session.extensionRequests.find((request) => request.id === requestId);
    const shouldAddTime = Boolean(accepted && target && target.status === "pending");

    return {
      ...session,
      addedDurationMinutes: shouldAddTime ? session.addedDurationMinutes + target!.durationMinutes : session.addedDurationMinutes,
      extensionRequests: session.extensionRequests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              status: accepted ? "accepted" : "declined",
              respondedAt: Date.now()
            }
          : request
      )
    };
  });
}

export function dismissOrderServiceAlert(orderId: string, baseDurationMinutes: number, alert: "tenMinute" | "ended") {
  updateSession(orderId, baseDurationMinutes, (session) => ({
    ...session,
    tenMinuteAlertDismissedAt: alert === "tenMinute" ? Date.now() : session.tenMinuteAlertDismissedAt,
    endedAlertDismissedAt: alert === "ended" ? Date.now() : session.endedAlertDismissedAt
  }));
}

export function dismissOrderExtensionNotice(orderId: string, baseDurationMinutes: number, requestId: string) {
  updateSession(orderId, baseDurationMinutes, (session) => ({
    ...session,
    extensionRequests: session.extensionRequests.map((request) =>
      request.id === requestId && request.status === "declined"
        ? {
            ...request,
            status: "dismissed"
          }
        : request
    )
  }));
}
