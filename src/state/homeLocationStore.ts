import { useSyncExternalStore } from "react";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import { getNearestLocationOptionId, type Coordinates, type LocationAreaOption } from "../lib/location";
import { setSelectedHomeLocation } from "./homeLayoutStore";

export type HomeLocationPromptStatus = "unrequested" | "granted" | "denied" | "unavailable" | "error";
export type HomeLocationSelectionSource = "default" | "device" | "manual";

export type HomeLocationPreferenceState = {
  promptStatus: HomeLocationPromptStatus;
  source: HomeLocationSelectionSource;
  selectedLocationId?: string;
  coordinates?: Coordinates;
  accuracy?: number;
  updatedAt?: number;
  errorMessage?: string;
};

type HomeLocationSnapshot = {
  state: HomeLocationPreferenceState;
  revision: number;
};

const storageKey = "needo.home.location.preference.v1";
const listeners = new Set<() => void>();
let revision = 0;
let cachedSnapshot: HomeLocationSnapshot | null = null;
let deviceLocationRequestInFlight: Promise<HomeLocationPreferenceState> | null = null;
let deviceLocationSyncedForRuntime = false;

const defaultState: HomeLocationPreferenceState = {
  promptStatus: "unrequested",
  source: "default"
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPromptStatus(value: unknown): value is HomeLocationPromptStatus {
  return value === "unrequested" || value === "granted" || value === "denied" || value === "unavailable" || value === "error";
}

function isSelectionSource(value: unknown): value is HomeLocationSelectionSource {
  return value === "default" || value === "device" || value === "manual";
}

function normalizeCoordinates(value: unknown): Coordinates | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const lat = Number((value as { lat?: unknown }).lat);
  const lng = Number((value as { lng?: unknown }).lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return undefined;
  }

  return { lat, lng };
}

function normalizeState(raw?: Partial<HomeLocationPreferenceState> | null): HomeLocationPreferenceState {
  if (!raw) {
    return clone(defaultState);
  }

  const coordinates = normalizeCoordinates(raw.coordinates);
  const source = isSelectionSource(raw.source) ? raw.source : defaultState.source;

  return {
    promptStatus: isPromptStatus(raw.promptStatus) ? raw.promptStatus : defaultState.promptStatus,
    source: source === "device" && !coordinates ? "default" : source,
    selectedLocationId: typeof raw.selectedLocationId === "string" && raw.selectedLocationId ? raw.selectedLocationId : undefined,
    coordinates: source === "device" ? coordinates : undefined,
    accuracy: typeof raw.accuracy === "number" && Number.isFinite(raw.accuracy) ? Math.max(0, raw.accuracy) : undefined,
    updatedAt: typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : undefined,
    errorMessage: typeof raw.errorMessage === "string" && raw.errorMessage ? raw.errorMessage : undefined
  };
}

function getStoredState() {
  if (typeof window === "undefined") {
    return clone(defaultState);
  }

  const raw = readBrowserStorage(storageKey, { silent: true });

  if (!raw) {
    return clone(defaultState);
  }

  try {
    return normalizeState(JSON.parse(raw) as Partial<HomeLocationPreferenceState>);
  } catch {
    return clone(defaultState);
  }
}

function persist(state: HomeLocationPreferenceState) {
  if (typeof window === "undefined") {
    return;
  }

  writeBrowserStorage(storageKey, JSON.stringify(normalizeState(state)), { silent: true });
}

function notify() {
  revision += 1;
  cachedSnapshot = null;
  listeners.forEach((listener) => listener());
}

function saveState(state: HomeLocationPreferenceState) {
  const next = normalizeState(state);
  persist(next);
  notify();
  return next;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): HomeLocationSnapshot {
  if (cachedSnapshot && cachedSnapshot.revision === revision) {
    return cachedSnapshot;
  }

  cachedSnapshot = {
    state: getStoredState(),
    revision
  };

  return cachedSnapshot;
}

function isPermissionDenied(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && Number((error as { code?: unknown }).code) === 1;
}

function shouldRequestDeviceLocation(state: HomeLocationPreferenceState, force = false) {
  if (state.promptStatus === "denied" || state.promptStatus === "unavailable") {
    return false;
  }

  return force || state.promptStatus === "unrequested";
}

export function useHomeLocationPreference() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    ...snapshot,
    state: snapshot.state
  };
}

export function selectHomeLocationManually(locationId: string) {
  const current = getStoredState();

  setSelectedHomeLocation(locationId);

  return saveState({
    ...current,
    source: "manual",
    selectedLocationId: locationId,
    coordinates: undefined,
    accuracy: undefined,
    updatedAt: Date.now(),
    errorMessage: undefined
  });
}

export function requestHomeDeviceLocation(locations: LocationAreaOption[], fallbackLocationId?: string, options?: { force?: boolean }) {
  const current = getStoredState();

  if (!shouldRequestDeviceLocation(current, options?.force)) {
    return Promise.resolve(current);
  }

  if (deviceLocationRequestInFlight) {
    return deviceLocationRequestInFlight;
  }

  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return Promise.resolve(
      saveState({
        ...current,
        promptStatus: "unavailable",
        selectedLocationId: fallbackLocationId ?? current.selectedLocationId,
        updatedAt: Date.now(),
        errorMessage: "当前设备未提供定位能力。"
      })
    );
  }

  const requestStartedAt = Date.now();

  deviceLocationRequestInFlight = new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 4500,
      maximumAge: 300000
    });
  })
    .then((position) => {
      const coordinates = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      const latest = getStoredState();
      const manualSelectionChangedDuringRequest = latest.source === "manual" && (latest.updatedAt ?? 0) >= requestStartedAt;
      const selectedLocationId = manualSelectionChangedDuringRequest
        ? latest.selectedLocationId ?? fallbackLocationId ?? current.selectedLocationId
        : getNearestLocationOptionId(locations, coordinates) ?? fallbackLocationId ?? current.selectedLocationId;

      if (selectedLocationId && !manualSelectionChangedDuringRequest) {
        setSelectedHomeLocation(selectedLocationId);
      }

      return saveState({
        promptStatus: "granted",
        source: manualSelectionChangedDuringRequest ? "manual" : "device",
        selectedLocationId,
        coordinates: manualSelectionChangedDuringRequest ? undefined : coordinates,
        accuracy: manualSelectionChangedDuringRequest ? undefined : position.coords.accuracy,
        updatedAt: Date.now(),
        errorMessage: undefined
      });
    })
    .catch((error: unknown) => {
      const latest = getStoredState();
      const manualSelectionChangedDuringRequest = latest.source === "manual" && (latest.updatedAt ?? 0) >= requestStartedAt;

      return saveState({
        ...(manualSelectionChangedDuringRequest ? latest : current),
        promptStatus: isPermissionDenied(error) ? "denied" : "error",
        selectedLocationId: latest.selectedLocationId ?? fallbackLocationId ?? current.selectedLocationId,
        coordinates: undefined,
        accuracy: undefined,
        updatedAt: Date.now(),
        errorMessage: isPermissionDenied(error) ? "用户未授权定位。" : "暂时无法获取当前位置。"
      });
    })
    .finally(() => {
      deviceLocationRequestInFlight = null;
    });

  return deviceLocationRequestInFlight;
}

export function syncHomeDeviceLocationForAppOpen(locations: LocationAreaOption[], fallbackLocationId?: string) {
  const current = getStoredState();

  if (deviceLocationSyncedForRuntime) {
    return Promise.resolve(current);
  }

  deviceLocationSyncedForRuntime = true;

  if (!shouldRequestDeviceLocation(current, current.promptStatus !== "unrequested")) {
    return Promise.resolve(current);
  }

  return requestHomeDeviceLocation(locations, fallbackLocationId, { force: current.promptStatus !== "unrequested" });
}
