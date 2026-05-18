import { useSyncExternalStore } from "react";
import { imageBank, stores, technicians } from "../data/mock";
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

const storageKey = "needo.carousel-scenes.v1";
const legacyStorageKey = "needo.home-carousel.v1";
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
  { label: "家庭保洁", value: imageBank.cleaning },
  { label: "家政现场", value: imageBank.cleaningAlt },
  { label: "家政团队", value: imageBank.cleaningPortrait },
  { label: "上门按摩", value: imageBank.massage },
  { label: "按摩护理", value: imageBank.massageAlt },
  { label: "宠物相关", value: imageBank.pet },
  { label: "搬家回收", value: imageBank.moving },
  { label: "门店预约", value: imageBank.restaurant },
  { label: "美容门店", value: imageBank.salon },
  { label: "家居空间", value: imageBank.home },
  { label: "家电清洗", value: imageBank.appliance },
  { label: "空调检修", value: imageBank.repairAlt },
  { label: "上门维修", value: imageBank.repair },
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
    target: sceneId === "timeline" ? { type: "timeline-search" } : { type: "store", id: stores[0]?.id ?? "store-1" },
    ...overrides
  };
}

const defaultScenes: Record<CarouselSceneId, CarouselSlideDraft[]> = {
  home: [
    createSlide("home", 1, {
      badge: "即时上门",
      title: "最短 45 分钟到达",
      caption: "保洁、按摩、回收、宠物服务已覆盖东京主要区域。",
      cta: "查看详情并预约",
      image: imageBank.cleaning,
      target: { type: "store", id: stores[3]?.id ?? stores[0]?.id ?? "store-1" }
    }),
    createSlide("home", 2, {
      badge: "深夜放松",
      title: "上门肩颈舒缓",
      caption: "专业理疗师携带一次性用品到家服务，下班后也能快速预约。",
      cta: "查看详情并预约",
      image: imageBank.massage,
      target: { type: "technician", id: technicians[0]?.id ?? "tech-1" }
    }),
    createSlide("home", 3, {
      badge: "上门回收",
      title: "搬家前一键清空",
      caption: "旧家电、家具、纸箱和杂物可拍照预估，支持当日预约。",
      cta: "查看详情并预约",
      image: imageBank.moving,
      target: { type: "store", id: stores[3]?.id ?? stores[0]?.id ?? "store-1" }
    }),
    createSlide("home", 4, {
      badge: "家电清洗",
      title: "空调拆洗可拍照验收",
      caption: "壁挂机拆盖清洗、防霉处理和完工记录，夏季前安排更省心。",
      cta: "查看详情并预约",
      image: imageBank.appliance,
      target: { type: "store", id: stores[3]?.id ?? stores[0]?.id ?? "store-1" }
    })
  ],
  timeline: [
    createSlide("timeline", 1, {
      badge: "附近灵感",
      title: "看看附近正在发生什么",
      caption: "把周边店铺、技师和好友的新鲜动态放在一条轮播里，切进动态前先快速浏览。",
      cta: "浏览附近",
      image: "/images/timeline-nearby-bg.png",
      target: { type: "timeline-search" }
    }),
    createSlide("timeline", 2, {
      badge: "公开发布",
      title: "分享今天的动态",
      caption: "适合发营业提醒、预约更新、体验记录，内容和首页轮播区完全分开。",
      cta: "去发动态",
      image: "/images/timeline-compose-bg.png",
      target: { type: "timeline-compose" }
    }),
    createSlide("timeline", 3, {
      badge: "互动提醒",
      title: "继续跟进你的关注和提醒",
      caption: "从轮播直接跳去通知或互动列表，比首页那组推荐更偏社交内容。",
      cta: "查看提醒",
      image: "/images/timeline-notify-bg.png",
      target: { type: "timeline-notifications" }
    })
  ]
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

function getLegacyHomeScene() {
  try {
    const raw = readBrowserStorage(legacyStorageKey, { silent: true });

    if (!raw) {
      return clone(defaultScenes.home);
    }

    const parsed = JSON.parse(raw) as {
      overrides?: Array<
        Partial<CarouselSlideDraft> & {
          slotId?: string;
        }
      >;
    };
    const overrides = Array.isArray(parsed.overrides) ? parsed.overrides : [];

    return defaultScenes.home.map((slide, index) => {
      const matched = overrides.find((item) => item.slotId === `slot-${index + 1}`);
      const source = matched?.enabled ? matched : slide;

      return normalizeSlide("home", { ...source, enabled: true }, index, slide);
    });
  } catch {
    removeBrowserStorage(legacyStorageKey, { silent: true });
    return clone(defaultScenes.home);
  }
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

  try {
    const raw = readBrowserStorage(storageKey, { silent: true });

    if (!raw) {
      const scenes = {
        home: getLegacyHomeScene(),
        timeline: clone(defaultScenes.timeline)
      };
      persist(scenes);
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
    removeBrowserStorage(legacyStorageKey, { silent: true });
    persist(getDefaultScenes());
  }
}

function bindStorageListener() {
  if (storageListenerBound || typeof window === "undefined") {
    return;
  }

  storageListenerBound = true;
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== window.localStorage || (event.key !== storageKey && event.key !== legacyStorageKey)) {
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
    target: sceneId === "timeline" ? { type: "timeline-search" } : { type: "store", id: stores[0]?.id ?? "store-1" }
  });
}
