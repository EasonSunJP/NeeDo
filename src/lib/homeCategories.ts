import { useSyncExternalStore } from "react";
import { imageBank, serviceCategories, services } from "../data/mock";
import type { ServiceCategory } from "../types/domain";
import { readBrowserStorage, writeBrowserStorage } from "./browserStorage";

export type HomeCategoryId = ServiceCategory["id"];

export interface HomeCategoryOption {
  id: HomeCategoryId;
  label: string;
  iconId: string;
  to: string;
  caption: string;
  mode: ServiceCategory["mode"];
  hot: boolean;
}

const storageKey = "needo.home.categories";
const listeners = new Set<() => void>();
let storageListenerBound = false;
let cachedStoredValue: string | null | undefined;

export const homeCategorySelectionLimit = 5;

const categoryCaptionMap: Record<HomeCategoryId, string> = {
  cleaning: "日常保洁、厨卫、退房清扫",
  massage: "肩颈、腰背、全身舒缓",
  recycle: "旧家电、家具、搬家杂物",
  pet: "喂养、遛狗、清洁陪伴",
  business: "办公室、商旅、团队预约",
  dining: "包间、聚餐、门店预约",
  repair: "水电、门锁、家具小修",
  laundry: "洗衣、熨烫、取送护理",
  moving: "同城搬运、行李搬家",
  appliance: "空调、洗衣机、油烟机",
  install: "家具、家电、灯具安装",
  beauty: "美甲、美睫、上门护理",
  nanny: "保姆、月嫂、家庭照护",
  care: "陪护、康养、日常照料",
  deep: "深度保洁、重点污渍处理",
  storage: "收纳规划、空间整理",
  homecare: "家居保养、维护护理",
  guide: "景点讲解、陪同接待",
  property: "看房陪同、租住咨询",
  tutor: "语言、数学、一对一辅导",
  sports: "健身陪练、拉伸放松",
  legal: "合同说明、法务咨询",
  renovation: "局部翻新、小型改造",
  other: "生活协助、临时代办"
};

const categoryImageFallbackMap: Record<HomeCategoryId, string> = {
  cleaning: imageBank.cleaning,
  massage: imageBank.massage,
  recycle: imageBank.moving,
  pet: imageBank.pet,
  business: imageBank.home,
  dining: imageBank.restaurant,
  repair: imageBank.repair,
  laundry: imageBank.home,
  moving: imageBank.moving,
  appliance: imageBank.appliance,
  install: imageBank.repair,
  beauty: imageBank.nail,
  nanny: imageBank.home,
  care: imageBank.care,
  deep: imageBank.cleaning,
  storage: imageBank.home,
  homecare: imageBank.home,
  guide: imageBank.restaurant,
  property: imageBank.home,
  tutor: imageBank.cafe,
  sports: imageBank.care,
  legal: imageBank.repair,
  renovation: imageBank.repair,
  other: imageBank.home
};

const otherCategory = serviceCategories.find((category) => category.id === "other");

export const orderedServiceCategories: ServiceCategory[] = [
  ...serviceCategories.filter((category) => category.id !== "other"),
  ...(otherCategory ? [otherCategory] : [])
];

export const homeCategoryOptions: HomeCategoryOption[] = orderedServiceCategories.map((category) => ({
  id: category.id,
  label: category.name,
  iconId: category.id,
  to: `/categories?category=${category.id}`,
  caption: categoryCaptionMap[category.id] ?? category.name,
  mode: category.mode,
  hot: category.hot
}));

export const defaultHomeCategoryIds: HomeCategoryId[] = ["cleaning", "massage", "recycle", "pet", "business"];
let cachedHomeCategoryIds: HomeCategoryId[] = defaultHomeCategoryIds;

function emitExternalUpdate() {
  listeners.forEach((listener) => listener());
}

function normalizeHomeCategoryIds(value: unknown): HomeCategoryId[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const validIds = new Set(homeCategoryOptions.map((item) => item.id));
  const migrated = value.map((item) => {
    if (item === "store") {
      return "dining";
    }

    return item;
  });
  const next = migrated.filter((item): item is HomeCategoryId => typeof item === "string" && validIds.has(item as HomeCategoryId));

  return Array.from(new Set(next)).slice(0, homeCategorySelectionLimit);
}

function getHomeCategoryOptionMap() {
  return new Map(homeCategoryOptions.map((item) => [item.id, item] as const));
}

function readHomeCategoryIdsFromStorage(stored: string | null) {
  if (stored === cachedStoredValue) {
    return cachedHomeCategoryIds;
  }

  cachedStoredValue = stored;

  if (!stored) {
    cachedHomeCategoryIds = defaultHomeCategoryIds;
    return cachedHomeCategoryIds;
  }

  try {
    cachedHomeCategoryIds = normalizeHomeCategoryIds(JSON.parse(stored)) ?? defaultHomeCategoryIds;
    return cachedHomeCategoryIds;
  } catch {
    cachedHomeCategoryIds = defaultHomeCategoryIds;
    return cachedHomeCategoryIds;
  }
}

function bindStorageListener() {
  if (storageListenerBound || typeof window === "undefined") {
    return;
  }

  storageListenerBound = true;
  window.addEventListener("storage", (event) => {
    if (event.storageArea === window.localStorage && event.key === storageKey) {
      emitExternalUpdate();
    }
  });
}

export function getStoredHomeCategoryIds() {
  if (typeof window === "undefined") {
    return defaultHomeCategoryIds;
  }

  bindStorageListener();
  return readHomeCategoryIdsFromStorage(readBrowserStorage(storageKey, { silent: true }));
}

export function saveHomeCategoryIds(ids: HomeCategoryId[]) {
  if (typeof window === "undefined") {
    return;
  }

  bindStorageListener();
  const nextStoredValue = JSON.stringify(normalizeHomeCategoryIds(ids) ?? []);
  const currentStoredValue = readBrowserStorage(storageKey, { silent: true });

  if (currentStoredValue === nextStoredValue) {
    return;
  }

  cachedStoredValue = nextStoredValue;
  cachedHomeCategoryIds = normalizeHomeCategoryIds(JSON.parse(nextStoredValue)) ?? defaultHomeCategoryIds;
  writeBrowserStorage(storageKey, nextStoredValue, { silent: true });
  emitExternalUpdate();
}

export function subscribeHomeCategoryIds(listener: () => void) {
  bindStorageListener();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function useHomeCategoryIds() {
  return useSyncExternalStore(subscribeHomeCategoryIds, getStoredHomeCategoryIds, () => defaultHomeCategoryIds);
}

export function getEffectiveHomeCategoryIds(ids: HomeCategoryId[], limit = homeCategorySelectionLimit) {
  return (normalizeHomeCategoryIds(ids) ?? []).slice(0, limit);
}

export function getEffectiveHomeCategoryOptions(ids: HomeCategoryId[], limit = homeCategorySelectionLimit) {
  const optionMap = getHomeCategoryOptionMap();

  return getEffectiveHomeCategoryIds(ids, limit)
    .map((id) => optionMap.get(id))
    .filter((item): item is HomeCategoryOption => Boolean(item));
}

export function getCategoryHeroImage(categoryId: HomeCategoryId) {
  return services.find((service) => service.categoryId === categoryId)?.cover ?? categoryImageFallbackMap[categoryId] ?? imageBank.home;
}
