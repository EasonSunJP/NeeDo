import { useSyncExternalStore } from "react";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";

export type CarouselSceneId = "home" | "timeline";

export type CarouselTarget =
  | {
      type: "store" | "technician";
      id: string;
    }
  | {
      type: "timeline-search" | "timeline-compose" | "timeline-notifications";
    };

export type CarouselSlideDraft = {
  id: string;
  enabled: boolean;
  badge: string;
  title: string;
  caption: string;
  cta: string;
  image: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  target: CarouselTarget;
};

export type CarouselSlideStatus = "active" | "upcoming" | "expired" | "disabled";

export type ResolvedCarouselSlide = CarouselSlideDraft & {
  status: CarouselSlideStatus;
};

type CarouselSnapshot = {
  scenes: Record<CarouselSceneId, CarouselSlideDraft[]>;
  revision: number;
};

type StoredSnapshot = {
  scenes?: Partial<Record<CarouselSceneId, CarouselSlideDraft[]>>;
};

const storageKey = "needo.carousel-scenes.formal-state.v1";
const retiredStorageKeys = ["needo.carousel-scenes.v1", "needo.home-carousel.v1"];
const listeners = new Set<() => void>();
let revision = 0;
let hydrated = false;
let storageListenerBound = false;
let cachedSnapshot: CarouselSnapshot | null = null;

export const carouselSceneLimits: Record<CarouselSceneId, number> = {
  home: 10,
  timeline: 10
};

export const carouselSceneLabels: Record<CarouselSceneId, string> = {
  home: "首页轮播",
  timeline: "动态轮播"
};

export const carouselImageOptions = [
  { label: "动态附近灵感", value: "/images/timeline-nearby-bg.png" },
  { label: "动态发布提醒", value: "/images/timeline-compose-bg.png" },
  { label: "动态互动提醒", value: "/images/timeline-notify-bg.png" }
];

export const homeCarouselImageOptions = carouselImageOptions;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getDateToken(now: Date) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

const legacyCarouselImageMarkers = [
  "images.unsplash.com",
  "pngtree-relaxing-back-massage",
  "/images/original.webp",
  "/images/ac-cleaning.svg",
  "/images/家政",
  "/images/上门维修"
];

function normalizeCarouselImage(value: unknown, fallback: string) {
  const next = normalizeString(value, fallback);

  return legacyCarouselImageMarkers.some((marker) => next.includes(marker)) ? fallback : next;
}

function getMomentsBasePath(scope: "user" | "merchant" | "technician") {
  return scope === "user" ? "/moments" : `/${scope}/moments`;
}

function createSlide(sceneId: CarouselSceneId, index: number, overrides: Partial<CarouselSlideDraft>): CarouselSlideDraft {
  return {
    id: `${sceneId}-${index}`,
    enabled: true,
    badge: "",
    title: "",
    caption: "",
    cta: "",
    image: carouselImageOptions[0]?.value ?? "",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    startTime: "00:00",
    endTime: "23:59",
    target: sceneId === "timeline" ? { type: "timeline-search" } : { type: "store", id: "" },
    ...overrides
  };
}

const defaultScenes: Record<CarouselSceneId, CarouselSlideDraft[]> = {
  home: [],
  timeline: []
};

function normalizeTarget(sceneId: CarouselSceneId, value: unknown, fallback: CarouselTarget): CarouselTarget {
  if (typeof value !== "object" || value === null) {
    return clone(fallback);
  }

  const raw = value as Partial<CarouselTarget> & { id?: unknown };

  if (sceneId === "timeline") {
    if (raw.type === "timeline-compose" || raw.type === "timeline-notifications" || raw.type === "timeline-search") {
      return { type: raw.type };
    }

    return clone(fallback);
  }

  if ((raw.type === "store" || raw.type === "technician") && typeof raw.id === "string" && raw.id.trim()) {
    return { type: raw.type, id: raw.id };
  }

  return clone(fallback);
}

function normalizeSlide(
  sceneId: CarouselSceneId,
  raw: Partial<CarouselSlideDraft> | undefined,
  index: number,
  fallback: CarouselSlideDraft
): CarouselSlideDraft {
  return {
    id: typeof raw?.id === "string" && raw.id.trim() ? raw.id : `${sceneId}-${index + 1}`,
    enabled: typeof raw?.enabled === "boolean" ? raw.enabled : fallback.enabled,
    badge: normalizeString(raw?.badge, fallback.badge),
    title: normalizeString(raw?.title, fallback.title),
    caption: normalizeString(raw?.caption, fallback.caption),
    cta: normalizeString(raw?.cta, fallback.cta),
    image: normalizeCarouselImage(raw?.image, fallback.image),
    startDate: normalizeString(raw?.startDate, fallback.startDate),
    endDate: normalizeString(raw?.endDate, fallback.endDate),
    startTime: normalizeString(raw?.startTime, fallback.startTime),
    endTime: normalizeString(raw?.endTime, fallback.endTime),
    target: normalizeTarget(sceneId, raw?.target, fallback.target)
  };
}

function normalizeSceneSlides(sceneId: CarouselSceneId, rawSlides: unknown, fallbackSlides: CarouselSlideDraft[]) {
  if (!Array.isArray(rawSlides)) {
    return clone(fallbackSlides);
  }

  const limited = rawSlides
    .filter((item): item is Partial<CarouselSlideDraft> => typeof item === "object" && item !== null)
    .slice(0, carouselSceneLimits[sceneId]);

  if (limited.length === 0) {
    return [];
  }

  return limited.map((item, index) => {
    const fallback =
      fallbackSlides[index] ??
      createSlide(sceneId, index + 1, {
        badge: sceneId === "timeline" ? "动态卡片" : "首页卡片",
        title: sceneId === "timeline" ? "请补充动态轮播文案" : "请补充首页轮播文案",
        caption: "保存后会立即同步到前台轮播。",
        cta: sceneId === "timeline" ? "查看详情" : "立即查看"
      });

    return normalizeSlide(sceneId, item, index, fallback);
  });
}

function getDefaultScenes(): Record<CarouselSceneId, CarouselSlideDraft[]> {
  return {
    home: clone(defaultScenes.home),
    timeline: clone(defaultScenes.timeline)
  };
}

function hydrate() {
  if (hydrated || typeof window === "undefined") {
    return;
  }

  hydrated = true;
  bindStorageListener();
  retiredStorageKeys.forEach((key) => removeBrowserStorage(key, { silent: true }));

  try {
    const raw = readBrowserStorage(storageKey, { silent: true });

    if (!raw) {
      persist(getDefaultScenes());
      return;
    }

    const parsed = JSON.parse(raw) as StoredSnapshot;
    const defaults = getDefaultScenes();
    const scenes: Record<CarouselSceneId, CarouselSlideDraft[]> = {
      home: normalizeSceneSlides("home", parsed.scenes?.home, defaults.home),
      timeline: normalizeSceneSlides("timeline", parsed.scenes?.timeline, defaults.timeline)
    };

    persist(scenes);
  } catch {
    removeBrowserStorage(storageKey, { silent: true });
    retiredStorageKeys.forEach((key) => removeBrowserStorage(key, { silent: true }));
    persist(getDefaultScenes());
  }
}

function bindStorageListener() {
  if (storageListenerBound || typeof window === "undefined") {
    return;
  }

  storageListenerBound = true;
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== window.localStorage || event.key !== storageKey) {
      return;
    }

    revision += 1;
    cachedSnapshot = null;
    listeners.forEach((listener) => listener());
  });
}

function persist(scenes: Record<CarouselSceneId, CarouselSlideDraft[]>) {
  if (typeof window === "undefined") {
    return;
  }

  writeBrowserStorage(storageKey, JSON.stringify({ scenes }), { silent: true });
}

function getStoredScenes() {
  hydrate();

  if (typeof window === "undefined") {
    return getDefaultScenes();
  }

  try {
    const raw = readBrowserStorage(storageKey, { silent: true });

    if (!raw) {
      return getDefaultScenes();
    }

    const parsed = JSON.parse(raw) as StoredSnapshot;
    const defaults = getDefaultScenes();

    return {
      home: normalizeSceneSlides("home", parsed.scenes?.home, defaults.home),
      timeline: normalizeSceneSlides("timeline", parsed.scenes?.timeline, defaults.timeline)
    } satisfies Record<CarouselSceneId, CarouselSlideDraft[]>;
  } catch {
    return getDefaultScenes();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  revision += 1;
  cachedSnapshot = null;
  listeners.forEach((listener) => listener());
}

function getSnapshot(): CarouselSnapshot {
  const scenes = getStoredScenes();

  if (cachedSnapshot && cachedSnapshot.revision === revision) {
    return cachedSnapshot;
  }

  cachedSnapshot = {
    scenes,
    revision
  };

  return cachedSnapshot;
}

function getTimeToken(now: Date) {
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");

  return `${hour}:${minute}`;
}

function getSlideStatus(slide: CarouselSlideDraft, now: Date): CarouselSlideStatus {
  if (!slide.enabled) {
    return "disabled";
  }

  const dateToken = getDateToken(now);
  const timeToken = getTimeToken(now);

  if (dateToken < slide.startDate || (dateToken === slide.startDate && timeToken < slide.startTime)) {
    return "upcoming";
  }

  if (dateToken > slide.endDate || (dateToken === slide.endDate && timeToken > slide.endTime)) {
    return "expired";
  }

  return "active";
}

export function getResolvedCarouselSlides(sceneId: CarouselSceneId, now = new Date(), sourceSlides?: CarouselSlideDraft[]) {
  const slides = sourceSlides ?? getStoredScenes()[sceneId];

  return slides.map((slide) => ({
    ...slide,
    status: getSlideStatus(slide, now)
  }));
}

export function resolveCarouselTargetPath(target: CarouselTarget, scope: "user" | "merchant" | "technician" = "user") {
  if (target.type === "store") {
    return scope === "user" ? `/stores/${target.id}` : `/${scope}/profiles/shop/${target.id}`;
  }

  if (target.type === "technician") {
    return scope === "user" ? `/profiles/technician/${target.id}` : `/${scope}/profiles/technician/${target.id}`;
  }

  if (target.type === "timeline-compose") {
    return `${getMomentsBasePath(scope)}/compose`;
  }

  if (target.type === "timeline-notifications") {
    return `${getMomentsBasePath(scope)}/notifications`;
  }

  return `${getMomentsBasePath(scope)}/search`;
}

export function useCarouselStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    ...snapshot,
    resolvedScenes: {
      home: getResolvedCarouselSlides("home", new Date(), snapshot.scenes.home),
      timeline: getResolvedCarouselSlides("timeline", new Date(), snapshot.scenes.timeline)
    }
  };
}

export function saveCarouselScene(sceneId: CarouselSceneId, slides: CarouselSlideDraft[]) {
  const current = getStoredScenes();
  const nextScene = normalizeSceneSlides(sceneId, slides, []);
  const scenes = {
    ...current,
    [sceneId]: nextScene
  };

  persist(scenes);
  notify();
}

export function resetCarouselScene(sceneId: CarouselSceneId) {
  const current = getStoredScenes();
  const scenes = {
    ...current,
    [sceneId]: clone(defaultScenes[sceneId])
  };

  persist(scenes);
  notify();
}

export function createCarouselSlide(sceneId: CarouselSceneId, index: number): CarouselSlideDraft {
  const baseOption = sceneId === "timeline" ? "/images/timeline-nearby-bg.png" : carouselImageOptions[0]?.value ?? "";

  return createSlide(sceneId, index, {
    badge: sceneId === "timeline" ? "动态卡片" : "首页卡片",
    title: sceneId === "timeline" ? `动态轮播 ${index}` : `首页轮播 ${index}`,
    caption: "保存后会立即同步到前台。",
    cta: sceneId === "timeline" ? "查看详情" : "立即查看",
    image: baseOption,
    target: sceneId === "timeline" ? { type: "timeline-search" } : { type: "store", id: "" }
  });
}
