import { useSyncExternalStore } from "react";
import type { Customer, InfoCardVisibilityMode, InfoCardVisibilitySettings, ServicePaymentMethod, Store, Technician } from "../types/domain";
import { customers, stores, technicians } from "../data/mock";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import { detectStorePresentationIndustry, normalizeStorePresentationConfig } from "../lib/storePresentation";
import { normalizeStoreUiDecoration } from "../lib/storeUiDecoration";

type EntityUpdater<T> = Partial<T> | ((current: T) => Partial<T>);

type EntitySnapshot = {
  customers: Customer[];
  stores: Store[];
  technicians: Technician[];
  revision: number;
};

const storageKey = "needo.entity-store.v4";
const legacyStorageKeys = ["needo.entity-store.v3", "needo.entity-store.v2"];
const listeners = new Set<() => void>();
let hydrated = false;
let storageListenerBound = false;
let revision = 0;
let cachedSnapshot: EntitySnapshot | null = null;
const defaultCustomers = cloneCollection(customers);
const defaultStores = cloneCollection(stores);
const defaultTechnicians = cloneCollection(technicians);

function cloneCollection<T>(collection: T[]) {
  return JSON.parse(JSON.stringify(collection)) as T[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

const legacyGeneratedImageMarkers = [
  "images.unsplash.com",
  "pngtree-relaxing-back-massage",
  "/images/original.webp",
  "/images/ac-cleaning.svg",
  "/images/家政",
  "/images/上门维修"
];

function isLegacyGeneratedImage(value: string) {
  return legacyGeneratedImageMarkers.some((marker) => value.includes(marker));
}

function getImageString(value: unknown, fallback: string) {
  const next = getString(value, fallback);

  return isLegacyGeneratedImage(next) ? fallback : next;
}

function isGeneratedPlaceholderAvatar(value: string) {
  return value.startsWith("data:image/svg+xml") || value.includes("/images/generated/profiles/profile-");
}

function getAccountAvatarString(value: unknown, fallback: string) {
  const next = getImageString(value, fallback);

  if (next !== fallback && isGeneratedPlaceholderAvatar(next)) {
    return fallback;
  }

  return next;
}

function getImageArray(value: unknown, fallback: string[], options?: { allowEmpty?: boolean; maxLength?: number }) {
  const next = getStringArray(value, fallback, options);
  const migrated = next.map((item, index) => (isLegacyGeneratedImage(item) ? fallback[index % fallback.length] ?? fallback[0] ?? item : item));

  return Array.from(new Set(migrated));
}

function getOptionalString(value: unknown, fallback?: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getStringArray(value: unknown, fallback: string[], options?: { allowEmpty?: boolean; maxLength?: number }) {
  if (!Array.isArray(value)) {
    return typeof options?.maxLength === "number" ? [...fallback].slice(0, options.maxLength) : [...fallback];
  }

  const next = Array.from(new Set(value.filter(isNonEmptyString)));
  const limited = typeof options?.maxLength === "number" ? next.slice(0, options.maxLength) : next;

  if (limited.length > 0) {
    return limited;
  }

  return options?.allowEmpty ? [] : typeof options?.maxLength === "number" ? [...fallback].slice(0, options.maxLength) : [...fallback];
}

const servicePaymentMethodSet = new Set<ServicePaymentMethod>([
  "platform",
  "offline",
  "prepay",
  "cash",
  "paypay",
  "paypal",
  "wechatpay",
  "alipay"
]);
const infoCardVisibilityModeSet = new Set<InfoCardVisibilityMode>(["public", "private", "tag_only", "person_only"]);
const defaultInfoCardVisibility: InfoCardVisibilitySettings = {
  mode: "public",
  tagIds: [],
  profileKeys: [],
  includeRelatedPeople: true
};

function getPaymentMethods(value: unknown, fallback: ServicePaymentMethod[]) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const validValues = value.filter(
    (item): item is ServicePaymentMethod => typeof item === "string" && servicePaymentMethodSet.has(item as ServicePaymentMethod)
  );

  return validValues.length > 0 ? Array.from(new Set(validValues)) : [...fallback];
}

function getBoolean(value: unknown, fallback: boolean | undefined) {
  return typeof value === "boolean" ? value : fallback;
}

function getInfoCardVisibility(value: unknown, fallback?: InfoCardVisibilitySettings) {
  const source = typeof value === "object" && value !== null ? value as Partial<InfoCardVisibilitySettings> : {};
  const fallbackVisibility = fallback ?? defaultInfoCardVisibility;
  const mode = typeof source.mode === "string" && infoCardVisibilityModeSet.has(source.mode as InfoCardVisibilityMode)
    ? source.mode as InfoCardVisibilityMode
    : fallbackVisibility.mode;

  return {
    mode,
    tagIds: getStringArray(source.tagIds, fallbackVisibility.tagIds, { allowEmpty: true }),
    profileKeys: getStringArray(source.profileKeys, fallbackVisibility.profileKeys, { allowEmpty: true }),
    includeRelatedPeople: typeof source.includeRelatedPeople === "boolean" ? source.includeRelatedPeople : fallbackVisibility.includeRelatedPeople
  } satisfies InfoCardVisibilitySettings;
}

function getTechnicianGender(value: unknown, fallback: Technician["gender"]) {
  return value === "male" || value === "female" || value === "private" ? value : fallback;
}

function getCustomerGender(value: unknown, fallback: Customer["gender"]) {
  return value === "male" || value === "female" || value === "private" ? value : fallback;
}

function normalizeCustomer(base: Customer, raw?: Partial<Customer>): Customer {
  if (!raw) {
    return { ...base, tags: [...base.tags], languages: base.languages ? [...base.languages] : undefined, infoCardVisibility: getInfoCardVisibility(base.infoCardVisibility) };
  }

  const useDemoCustomerDefaults = base.id === "cus-1" && base.accountUsername === "admin";

  return {
    ...base,
    ...raw,
    id: base.id,
    systemId: getString(raw.systemId, base.systemId),
    name: useDemoCustomerDefaults ? base.name : getString(raw.name, base.name),
    avatar: useDemoCustomerDefaults ? base.avatar : getAccountAvatarString(raw.avatar, base.avatar),
    phone: getString(raw.phone, base.phone),
    accountUsername: getOptionalString(raw.accountUsername, base.accountUsername),
    nickname: useDemoCustomerDefaults ? base.nickname : getOptionalString(raw.nickname, base.nickname),
    age: useDemoCustomerDefaults ? base.age : getOptionalString(raw.age, base.age),
    height: useDemoCustomerDefaults ? base.height : getOptionalString(raw.height, base.height),
    gender: useDemoCustomerDefaults ? base.gender : getCustomerGender(raw.gender, base.gender),
    languages: useDemoCustomerDefaults ? [...(base.languages ?? ["日本語"])] : getStringArray(raw.languages, base.languages ?? ["日本語"]),
    bio: useDemoCustomerDefaults ? base.bio : getOptionalString(raw.bio, base.bio),
    creditRating: getOptionalString(raw.creditRating, base.creditRating),
    points: getNumber(raw.points, base.points ?? 0),
    couponCount: getNumber(raw.couponCount, base.couponCount ?? 0),
    memberLevel: useDemoCustomerDefaults ? base.memberLevel : getString(raw.memberLevel, base.memberLevel),
    tags: useDemoCustomerDefaults ? [...base.tags] : getStringArray(raw.tags, base.tags),
    ltv: getNumber(raw.ltv, base.ltv),
    orderCount: getNumber(raw.orderCount, base.orderCount),
    lastOrderAt: getString(raw.lastOrderAt, base.lastOrderAt),
    nextBookingAt: getOptionalString(raw.nextBookingAt, base.nextBookingAt),
    activeScore: useDemoCustomerDefaults ? base.activeScore : getNumber(raw.activeScore, base.activeScore),
    churnRisk: raw.churnRisk === "low" || raw.churnRisk === "medium" || raw.churnRisk === "high" ? raw.churnRisk : base.churnRisk,
    infoCardVisibility: getInfoCardVisibility(raw.infoCardVisibility, base.infoCardVisibility)
  };
}

function normalizeStore(base: Store, raw?: Partial<Store>): Store {
  if (!raw) {
    return {
      ...base,
      tags: [...base.tags],
      gallery: [...base.gallery],
      uiDecoration: normalizeStoreUiDecoration(base.uiDecoration),
      presentation: normalizeStorePresentationConfig(base.presentation, detectStorePresentationIndustry(base)),
      infoCardVisibility: getInfoCardVisibility(base.infoCardVisibility)
    };
  }

  const normalizedTags = getStringArray(raw.tags, base.tags);
  const presentationIndustry = detectStorePresentationIndustry({ tags: normalizedTags });

  return {
    ...base,
    ...raw,
    id: base.id,
    systemId: getString(raw.systemId, base.systemId),
    merchantId: getString(raw.merchantId, base.merchantId),
    name: getString(raw.name, base.name),
    accountUsername: getOptionalString(raw.accountUsername, base.accountUsername),
    area: getString(raw.area, base.area),
    address: getString(raw.address, base.address),
    rating: getNumber(raw.rating, base.rating),
    reviewCount: getNumber(raw.reviewCount, base.reviewCount),
    priceLabel: getString(raw.priceLabel, base.priceLabel),
    tags: normalizedTags,
    openStatus: raw.openStatus === "open" || raw.openStatus === "resting" || raw.openStatus === "closed" ? raw.openStatus : base.openStatus,
    nextSlot: getString(raw.nextSlot, base.nextSlot),
    alwaysBookable: typeof raw.alwaysBookable === "boolean" ? raw.alwaysBookable : base.alwaysBookable,
    cover: getImageString(raw.cover, base.cover),
    gallery: getImageArray(raw.gallery, base.gallery, { allowEmpty: true, maxLength: 5 }),
    description: getString(raw.description, base.description),
    rankLabel: getString(raw.rankLabel, base.rankLabel),
    businessHours: getString(raw.businessHours, base.businessHours),
    mode: raw.mode === "home" || raw.mode === "store" ? raw.mode : base.mode,
    paymentMethods: getPaymentMethods(raw.paymentMethods, base.paymentMethods ?? ["platform", "offline"]),
    uiDecoration: normalizeStoreUiDecoration(raw.uiDecoration ?? base.uiDecoration),
    presentation: normalizeStorePresentationConfig(raw.presentation ?? base.presentation, presentationIndustry),
    infoCardVisibility: getInfoCardVisibility(raw.infoCardVisibility, base.infoCardVisibility)
  };
}

function normalizeTechnician(base: Technician, raw?: Partial<Technician>): Technician {
  if (!raw) {
    return {
      ...base,
      skills: [...base.skills],
      serviceAreas: [...base.serviceAreas],
      languages: [...base.languages],
      gallery: base.gallery ? [...base.gallery] : undefined,
      relatedStoreIds: base.relatedStoreIds ? [...base.relatedStoreIds] : undefined,
      profileTags: base.profileTags ? [...base.profileTags] : undefined,
      paymentMethods: base.paymentMethods ? [...base.paymentMethods] : undefined,
      infoCardVisibility: getInfoCardVisibility(base.infoCardVisibility)
    };
  }

  const useDemoTechnicianDefaults = base.id === "tech-1" && base.accountUsername === "admin";

  return {
    ...base,
    ...raw,
    id: base.id,
    systemId: getString(raw.systemId, base.systemId),
    name: getString(raw.name, base.name),
    storeId: getString(raw.storeId, base.storeId),
    role:
      raw.role === "storeManager" || raw.role === "staff" || raw.role === "therapist" || raw.role === "driver" || raw.role === "cleaner"
        ? raw.role
        : base.role,
    status: raw.status === "available" || raw.status === "busy" || raw.status === "off" ? raw.status : base.status,
    rating: getNumber(raw.rating, base.rating),
    orderCount: getNumber(raw.orderCount, base.orderCount),
    income: getNumber(raw.income, base.income),
    skills: getStringArray(raw.skills, base.skills),
    serviceAreas: getStringArray(raw.serviceAreas, base.serviceAreas),
    acceptRate: getNumber(raw.acceptRate, base.acceptRate),
    cancelRate: getNumber(raw.cancelRate, base.cancelRate),
    reviewCount: getNumber(raw.reviewCount, base.reviewCount),
    languages: getStringArray(raw.languages, base.languages),
    avatar: useDemoTechnicianDefaults ? base.avatar : getAccountAvatarString(raw.avatar, base.avatar),
    accountUsername: getOptionalString(raw.accountUsername, base.accountUsername),
    nickname: useDemoTechnicianDefaults ? base.nickname : getOptionalString(raw.nickname, base.nickname),
    bio: useDemoTechnicianDefaults ? base.bio : getOptionalString(raw.bio, base.bio),
    gender: getTechnicianGender(raw.gender, base.gender),
    age: getOptionalString(raw.age, base.age),
    height: getOptionalString(raw.height, base.height),
    identityLabel: raw.identityLabel === "店铺所属技师" || raw.identityLabel === "个人技师" ? raw.identityLabel : base.identityLabel,
    relatedStoreIds: getStringArray(raw.relatedStoreIds, base.relatedStoreIds ?? []),
    profileTags: useDemoTechnicianDefaults ? [...(base.profileTags ?? base.skills)] : getStringArray(raw.profileTags, base.profileTags ?? base.skills),
    canServeForeigners: getBoolean(raw.canServeForeigners, base.canServeForeigners),
    bidBudgetMin: getOptionalString(raw.bidBudgetMin, base.bidBudgetMin),
    bidBudgetMax: getOptionalString(raw.bidBudgetMax, base.bidBudgetMax),
    paymentMethods: getPaymentMethods(raw.paymentMethods, base.paymentMethods ?? ["platform", "offline"]),
    gallery: useDemoTechnicianDefaults ? [...(base.gallery ?? [])] : getImageArray(raw.gallery, base.gallery ?? [], { allowEmpty: true, maxLength: 5 }),
    infoCardVisibility: getInfoCardVisibility(raw.infoCardVisibility, base.infoCardVisibility)
  };
}

function normalizeCollection<T extends { id: string }>(
  defaults: T[],
  rawList: unknown,
  normalizeItem: (base: T, raw?: Partial<T>) => T
) {
  const rawMap = new Map(
    Array.isArray(rawList)
      ? rawList
          .filter((item): item is Partial<T> & { id: string } => typeof item === "object" && item !== null && isNonEmptyString((item as { id?: unknown }).id))
          .map((item) => [item.id, item])
      : []
  );

  return defaults.map((base) => normalizeItem(base, rawMap.get(base.id)));
}

function replaceCollection<T>(target: T[], next: T[]) {
  while (target.length > next.length) {
    target.pop();
  }

  next.forEach((item, index) => {
    if (target[index] && typeof target[index] === "object" && target[index] !== null) {
      Object.assign(target[index] as Record<string, unknown>, item as Record<string, unknown>);
      return;
    }

    target[index] = item;
  });
}

function persist() {
  if (typeof window === "undefined") {
    return true;
  }

  legacyStorageKeys.forEach((key) => removeBrowserStorage(key, { silent: true }));
  return writeBrowserStorage(
    storageKey,
    JSON.stringify({
      customers,
      stores,
      technicians
    }),
    { silent: true }
  );
}

function emitExternalUpdate() {
  revision += 1;
  cachedSnapshot = null;
  listeners.forEach((listener) => listener());
}

function applyHydratedSnapshot(parsed?: Partial<EntitySnapshot> | null) {
  if (!parsed) {
    replaceCollection(customers, cloneCollection(defaultCustomers));
    replaceCollection(stores, cloneCollection(defaultStores));
    replaceCollection(technicians, cloneCollection(defaultTechnicians));
    return;
  }

  replaceCollection(customers, normalizeCollection(defaultCustomers, parsed.customers, normalizeCustomer));
  replaceCollection(stores, normalizeCollection(defaultStores, parsed.stores, normalizeStore));
  replaceCollection(technicians, normalizeCollection(defaultTechnicians, parsed.technicians, normalizeTechnician));
}

function bindStorageListener() {
  if (storageListenerBound || typeof window === "undefined") {
    return;
  }

  storageListenerBound = true;
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== window.localStorage) {
      return;
    }

    const key = event.key;

    if (key !== storageKey && !(key && legacyStorageKeys.includes(key))) {
      return;
    }

    if (!event.newValue) {
      applyHydratedSnapshot(null);
      emitExternalUpdate();
      return;
    }

    try {
      applyHydratedSnapshot(JSON.parse(event.newValue) as Partial<EntitySnapshot>);
    } catch {
      applyHydratedSnapshot(null);
    }

    emitExternalUpdate();
  });
}

function hydrate() {
  if (hydrated || typeof window === "undefined") {
    return;
  }

  hydrated = true;
  bindStorageListener();

  try {
    const raw = readBrowserStorage(storageKey, { silent: true }) ?? legacyStorageKeys.map((key) => readBrowserStorage(key, { silent: true })).find(Boolean);

    if (typeof raw !== "string" || !raw) {
      return;
    }

    applyHydratedSnapshot(JSON.parse(raw) as Partial<EntitySnapshot>);
    persist();
  } catch {
    legacyStorageKeys.forEach((key) => removeBrowserStorage(key, { silent: true }));
    removeBrowserStorage(storageKey, { silent: true });
    applyHydratedSnapshot(null);
  }
}

function notify() {
  revision += 1;
  cachedSnapshot = null;
  const persisted = persist();
  listeners.forEach((listener) => listener());

  return persisted;
}

function getSnapshot(): EntitySnapshot {
  hydrate();

  if (cachedSnapshot && cachedSnapshot.revision === revision) {
    return cachedSnapshot;
  }

  cachedSnapshot = {
    customers,
    stores,
    technicians,
    revision
  };

  return cachedSnapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function resolvePatch<T>(current: T, updater: EntityUpdater<T>) {
  return typeof updater === "function" ? updater(current) : updater;
}

function updateCollectionItem<T extends { id: string }>(collection: T[], id: string, updater: EntityUpdater<T>) {
  hydrate();
  const index = collection.findIndex((item) => item.id === id);

  if (index === -1) {
    return false;
  }

  const current = collection[index];
  Object.assign(current as Record<string, unknown>, resolvePatch(current, updater) as Record<string, unknown>);
  return notify();
}

export function useEntityStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getEntityStoreSnapshot() {
  return getSnapshot();
}

export function updateCustomerEntity(id: string, updater: EntityUpdater<Customer>) {
  return updateCollectionItem(customers, id, updater);
}

export function updateStoreEntity(id: string, updater: EntityUpdater<Store>) {
  return updateCollectionItem(stores, id, updater);
}

export function updateTechnicianEntity(id: string, updater: EntityUpdater<Technician>) {
  return updateCollectionItem(technicians, id, updater);
}

export function findCustomerById(id: string) {
  hydrate();
  return customers.find((customer) => customer.id === id);
}

export function findCustomerByName(name?: string | null) {
  if (!name) {
    return undefined;
  }

  hydrate();
  return customers.find((customer) => customer.name === name || customer.nickname === name);
}

export function findStoreById(id: string) {
  hydrate();
  return stores.find((store) => store.id === id);
}

export function findStoreByName(name?: string | null) {
  if (!name) {
    return undefined;
  }

  hydrate();
  return stores.find((store) => store.name === name);
}

export function findTechnicianById(id: string) {
  hydrate();
  return technicians.find((technician) => technician.id === id);
}

export function findTechnicianByName(name?: string | null) {
  if (!name) {
    return undefined;
  }

  hydrate();
  return technicians.find((technician) => technician.name === name || technician.nickname === name);
}

export function getLinkedIdentityBundle(username: string) {
  hydrate();

  return {
    customer: customers.find((customer) => customer.accountUsername === username),
    technician: technicians.find((technician) => technician.accountUsername === username),
    store: stores.find((store) => store.accountUsername === username)
  };
}
