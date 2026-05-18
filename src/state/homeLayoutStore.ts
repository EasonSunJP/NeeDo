import { useSyncExternalStore } from "react";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import type { Coordinates } from "../lib/location";

export type HomeRecommendationTabKey = "stores" | "technicians" | "services";
export type HomeMetricIcon = "clock" | "map" | "sparkles" | "shield" | "calendar" | "star";

export interface HomeLocationOption {
  id: string;
  label: string;
  city: string;
  area: string;
  district?: string;
  summary?: string;
  coordinates?: Coordinates;
}

export interface HomeNearbyTechnicianConfig {
  title: string;
  limit: number;
  sortBy: "reviewCount" | "rating" | "availability";
}

export interface HomeServiceModuleConfig {
  id: string;
  title: string;
  badge?: string;
  categoryIds: string[];
  targetTo: string;
  maxItems: number;
  enabled: boolean;
}

export interface HomeRecommendationTabConfig {
  label: string;
  sortBy: "rating" | "reviewCount" | "sales";
}

export interface HomeMetricConfig {
  id: string;
  icon: HomeMetricIcon;
  value: string;
  label: string;
  caption?: string;
  enabled: boolean;
}

export interface HomeReminderConfig {
  enabled: boolean;
  triggerWindowMinutes: number;
  dismissCooldownMinutes: number;
  jumpTarget: "orderDetail" | "orders";
}

export interface HomeLayoutConfig {
  selectedLocationId: string;
  locations: HomeLocationOption[];
  nearbyTechnician: HomeNearbyTechnicianConfig;
  serviceModules: HomeServiceModuleConfig[];
  recommendation: {
    defaultTab: HomeRecommendationTabKey;
    maxItems: number;
    tabs: Record<HomeRecommendationTabKey, HomeRecommendationTabConfig>;
    moreLinks: Record<HomeRecommendationTabKey, { label: string; to: string }>;
  };
  platformMetricsVisible: boolean;
  platformMetrics: HomeMetricConfig[];
  reminder: HomeReminderConfig;
}

type HomeLayoutSnapshot = {
  config: HomeLayoutConfig;
  revision: number;
};

const storageKey = "needo.home.layout.v1";
const listeners = new Set<() => void>();
let revision = 0;
let storageListenerBound = false;
let cachedSnapshot: HomeLayoutSnapshot | null = null;

const defaultConfig: HomeLayoutConfig = {
  selectedLocationId: "tokyo-minato-azabu",
  locations: [
    {
      id: "tokyo-minato-azabu",
      label: "东京 / 港区 / 麻布十番",
      city: "东京",
      area: "港区",
      district: "麻布十番",
      summary: "酒店、住宅和夜间上门服务较多",
      coordinates: { lat: 35.6555, lng: 139.7367 }
    },
    {
      id: "tokyo-shibuya-ebisu",
      label: "东京 / 涩谷区 / 惠比寿",
      city: "东京",
      area: "涩谷区",
      district: "惠比寿",
      summary: "美业、餐饮和预约类服务较多",
      coordinates: { lat: 35.6467, lng: 139.7101 }
    },
    {
      id: "tokyo-shinjuku",
      label: "东京 / 新宿区 / 西新宿",
      city: "东京",
      area: "新宿区",
      district: "西新宿",
      summary: "酒店上门和商务服务活跃",
      coordinates: { lat: 35.6896, lng: 139.6917 }
    },
    {
      id: "tokyo-meguro",
      label: "东京 / 目黑区 / 中目黑",
      city: "东京",
      area: "目黑区",
      district: "中目黑",
      summary: "保洁、家居和高频家庭服务较多",
      coordinates: { lat: 35.6443, lng: 139.699 }
    },
    {
      id: "yokohama-naka",
      label: "横滨 / 中区 / 山下町",
      city: "横滨",
      area: "中区",
      district: "山下町",
      summary: "到店和导览类服务较多",
      coordinates: { lat: 35.4431, lng: 139.6501 }
    }
  ],
  nearbyTechnician: {
    title: "附近的技师",
    limit: 4,
    sortBy: "reviewCount"
  },
  serviceModules: [
    {
      id: "home-module-massage",
      title: "上门按摩",
      badge: "热门可约",
      categoryIds: ["massage"],
      targetTo: "/categories?type=service&category=massage&tag=tag-massage-door",
      maxItems: 4,
      enabled: true
    },
    {
      id: "home-module-cleaning",
      title: "上门保洁",
      badge: "多商户可选",
      categoryIds: ["cleaning", "deep", "appliance"],
      targetTo: "/categories?type=service&category=cleaning",
      maxItems: 4,
      enabled: true
    }
  ],
  recommendation: {
    defaultTab: "stores",
    maxItems: 10,
    tabs: {
      stores: { label: "店铺", sortBy: "rating" },
      technicians: { label: "技师", sortBy: "reviewCount" },
      services: { label: "服务", sortBy: "sales" }
    },
    moreLinks: {
      stores: { label: "查看更多", to: "/categories?type=store" },
      technicians: { label: "查看更多", to: "/categories?type=technician" },
      services: { label: "查看更多", to: "/categories?type=service" }
    }
  },
  platformMetricsVisible: true,
  platformMetrics: [
    { id: "metric-1", icon: "calendar", value: "10年+", label: "稳定运营", caption: "城市服务持续在线", enabled: true },
    { id: "metric-2", icon: "map", value: "300+", label: "城市覆盖", caption: "热门区域持续扩容", enabled: true },
    { id: "metric-3", icon: "sparkles", value: "100万+", label: "服务家庭", caption: "高频用户长期复购", enabled: true },
    { id: "metric-4", icon: "clock", value: "24小时", label: "随叫随到", caption: "高峰时段也可预约", enabled: true }
  ],
  reminder: {
    enabled: true,
    triggerWindowMinutes: 60,
    dismissCooldownMinutes: 120,
    jumpTarget: "orderDetail"
  }
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeInternalSearchPath(value: unknown, fallback: string) {
  const next = normalizeString(value, fallback);

  if (next === "/search?tab=store") {
    return "/categories?type=store";
  }

  if (next === "/search?tab=technician") {
    return "/categories?type=technician";
  }

  if (next === "/search?tab=service") {
    return "/categories?type=service";
  }

  if (next === "/search") {
    return "/categories";
  }

  if (next === "/stores") {
    return "/categories?type=store";
  }

  if (next === "/services") {
    return "/categories?type=service";
  }

  if (next.startsWith("/services?")) {
    const params = new URLSearchParams(next.slice(next.indexOf("?") + 1));
    const category = params.get("category");
    const nextParams = new URLSearchParams({ type: "service" });

    if (category) {
      nextParams.set("category", category);
    }

    return `/categories?${nextParams.toString()}`;
  }

  return next;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeNumber(value: unknown, fallback: number, min = 1, max = 99) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const next = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return next.length ? next : [...fallback];
}

function normalizeLocation(base: HomeLocationOption, raw?: Partial<HomeLocationOption>): HomeLocationOption {
  if (!raw) {
    return clone(base);
  }

  return {
    id: base.id,
    label: normalizeString(raw.label, base.label),
    city: normalizeString(raw.city, base.city),
    area: normalizeString(raw.area, base.area),
    district: normalizeString(raw.district, base.district ?? ""),
    summary: normalizeString(raw.summary, base.summary ?? ""),
    coordinates: base.coordinates ? { ...base.coordinates } : undefined
  };
}

function normalizeServiceModule(base: HomeServiceModuleConfig, raw?: Partial<HomeServiceModuleConfig>): HomeServiceModuleConfig {
  if (!raw) {
    return clone(base);
  }

  return {
    id: base.id,
    title: normalizeString(raw.title, base.title),
    badge: normalizeString(raw.badge, base.badge ?? ""),
    categoryIds: normalizeStringArray(raw.categoryIds, base.categoryIds),
    targetTo: normalizeInternalSearchPath(raw.targetTo, base.targetTo),
    maxItems: normalizeNumber(raw.maxItems, base.maxItems, 2, 4),
    enabled: normalizeBoolean(raw.enabled, base.enabled)
  };
}

function normalizeMetric(base: HomeMetricConfig, raw?: Partial<HomeMetricConfig>): HomeMetricConfig {
  const validIcons = new Set<HomeMetricIcon>(["clock", "map", "sparkles", "shield", "calendar", "star"]);

  if (!raw) {
    return clone(base);
  }

  return {
    id: base.id,
    icon: raw.icon && validIcons.has(raw.icon) ? raw.icon : base.icon,
    value: normalizeString(raw.value, base.value),
    label: normalizeString(raw.label, base.label),
    caption: normalizeString(raw.caption, base.caption ?? ""),
    enabled: normalizeBoolean(raw.enabled, base.enabled)
  };
}

function normalizeStoreSort(value: unknown, fallback: HomeRecommendationTabConfig["sortBy"]) {
  return value === "reviewCount" ? "reviewCount" : fallback;
}

function normalizeTechnicianSort(value: unknown, fallback: HomeRecommendationTabConfig["sortBy"]) {
  if (value === "rating" || value === "reviewCount") {
    return value;
  }

  return fallback;
}

function normalizeServiceSort(value: unknown, fallback: HomeRecommendationTabConfig["sortBy"]) {
  if (value === "rating" || value === "sales") {
    return value;
  }

  return fallback;
}

function normalizeConfig(raw?: Partial<HomeLayoutConfig> | null): HomeLayoutConfig {
  const defaults = clone(defaultConfig);
  const rawLocations = Array.isArray(raw?.locations) ? raw.locations : [];
  const locations = defaults.locations.map((base) => {
    const matched = rawLocations.find((item) => item && typeof item === "object" && item.id === base.id);
    return normalizeLocation(base, matched);
  });
  const selectedLocationId = locations.some((item) => item.id === raw?.selectedLocationId) ? raw!.selectedLocationId! : defaults.selectedLocationId;
  const rawServiceModules = Array.isArray(raw?.serviceModules) ? raw.serviceModules : [];
  const rawMetrics = Array.isArray(raw?.platformMetrics) ? raw.platformMetrics : [];

  return {
    selectedLocationId,
    locations,
    nearbyTechnician: {
      title: normalizeString(raw?.nearbyTechnician?.title, defaults.nearbyTechnician.title),
      limit: normalizeNumber(raw?.nearbyTechnician?.limit, defaults.nearbyTechnician.limit, 2, 5),
      sortBy:
        raw?.nearbyTechnician?.sortBy === "rating" || raw?.nearbyTechnician?.sortBy === "availability" || raw?.nearbyTechnician?.sortBy === "reviewCount"
          ? raw.nearbyTechnician.sortBy
          : defaults.nearbyTechnician.sortBy
    },
    serviceModules: defaults.serviceModules.map((base) => {
      const matched = rawServiceModules.find((item) => item && typeof item === "object" && item.id === base.id);
      return normalizeServiceModule(base, matched);
    }),
    recommendation: {
      defaultTab:
        raw?.recommendation?.defaultTab === "technicians" || raw?.recommendation?.defaultTab === "services" || raw?.recommendation?.defaultTab === "stores"
          ? raw.recommendation.defaultTab
          : defaults.recommendation.defaultTab,
      maxItems: normalizeNumber(raw?.recommendation?.maxItems, defaults.recommendation.maxItems, 1, 10),
      tabs: {
        stores: {
          label: normalizeString(raw?.recommendation?.tabs?.stores?.label, defaults.recommendation.tabs.stores.label),
          sortBy: normalizeStoreSort(raw?.recommendation?.tabs?.stores?.sortBy, defaults.recommendation.tabs.stores.sortBy)
        },
        technicians: {
          label: normalizeString(raw?.recommendation?.tabs?.technicians?.label, defaults.recommendation.tabs.technicians.label),
          sortBy: normalizeTechnicianSort(raw?.recommendation?.tabs?.technicians?.sortBy, defaults.recommendation.tabs.technicians.sortBy)
        },
        services: {
          label: normalizeString(raw?.recommendation?.tabs?.services?.label, defaults.recommendation.tabs.services.label),
          sortBy: normalizeServiceSort(raw?.recommendation?.tabs?.services?.sortBy, defaults.recommendation.tabs.services.sortBy)
        }
      },
      moreLinks: {
        stores: {
          label: normalizeString(raw?.recommendation?.moreLinks?.stores?.label, defaults.recommendation.moreLinks.stores.label),
          to: normalizeInternalSearchPath(raw?.recommendation?.moreLinks?.stores?.to, defaults.recommendation.moreLinks.stores.to)
        },
        technicians: {
          label: normalizeString(raw?.recommendation?.moreLinks?.technicians?.label, defaults.recommendation.moreLinks.technicians.label),
          to: normalizeInternalSearchPath(raw?.recommendation?.moreLinks?.technicians?.to, defaults.recommendation.moreLinks.technicians.to)
        },
        services: {
          label: normalizeString(raw?.recommendation?.moreLinks?.services?.label, defaults.recommendation.moreLinks.services.label),
          to: normalizeInternalSearchPath(raw?.recommendation?.moreLinks?.services?.to, defaults.recommendation.moreLinks.services.to)
        }
      }
    },
    platformMetricsVisible: normalizeBoolean(raw?.platformMetricsVisible, defaults.platformMetricsVisible),
    platformMetrics: defaults.platformMetrics.map((base) => {
      const matched = rawMetrics.find((item) => item && typeof item === "object" && item.id === base.id);
      return normalizeMetric(base, matched);
    }),
    reminder: {
      enabled: normalizeBoolean(raw?.reminder?.enabled, defaults.reminder.enabled),
      triggerWindowMinutes: normalizeNumber(raw?.reminder?.triggerWindowMinutes, defaults.reminder.triggerWindowMinutes, 5, 180),
      dismissCooldownMinutes: normalizeNumber(raw?.reminder?.dismissCooldownMinutes, defaults.reminder.dismissCooldownMinutes, 10, 720),
      jumpTarget: raw?.reminder?.jumpTarget === "orders" ? "orders" : defaults.reminder.jumpTarget
    }
  };
}

function getStoredConfig() {
  if (typeof window === "undefined") {
    return clone(defaultConfig);
  }

  bindStorageListener();

  const raw = readBrowserStorage(storageKey, { silent: true });

  if (!raw) {
    return clone(defaultConfig);
  }

  try {
    return normalizeConfig(JSON.parse(raw) as Partial<HomeLayoutConfig>);
  } catch {
    return clone(defaultConfig);
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

    notify();
  });
}

function persist(config: HomeLayoutConfig) {
  if (typeof window === "undefined") {
    return;
  }

  writeBrowserStorage(storageKey, JSON.stringify(config), { silent: true });
}

function notify() {
  revision += 1;
  cachedSnapshot = null;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): HomeLayoutSnapshot {
  if (cachedSnapshot && cachedSnapshot.revision === revision) {
    return cachedSnapshot;
  }

  cachedSnapshot = {
    config: getStoredConfig(),
    revision
  };

  return cachedSnapshot;
}

export function useHomeLayoutStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    ...snapshot,
    config: snapshot.config
  };
}

export function saveHomeLayoutConfig(config: HomeLayoutConfig) {
  persist(normalizeConfig(config));
  notify();
}

export function updateHomeLayoutConfig(patch: Partial<HomeLayoutConfig>) {
  const current = getStoredConfig();
  const next = normalizeConfig({
    ...current,
    ...patch,
    nearbyTechnician: {
      ...current.nearbyTechnician,
      ...patch.nearbyTechnician
    },
    recommendation: {
      ...current.recommendation,
      ...patch.recommendation,
      tabs: {
        ...current.recommendation.tabs,
        ...patch.recommendation?.tabs
      },
      moreLinks: {
        ...current.recommendation.moreLinks,
        ...patch.recommendation?.moreLinks
      }
    },
    reminder: {
      ...current.reminder,
      ...patch.reminder
    }
  });

  persist(next);
  notify();
}

export function setSelectedHomeLocation(locationId: string) {
  updateHomeLayoutConfig({ selectedLocationId: locationId });
}

export function getDefaultHomeLayoutConfig() {
  return clone(defaultConfig);
}
