import { useEffect, useState } from "react";

export type UnifiedSettingsPortal = "user" | "technician" | "merchant" | "business";

type SharedPortalSettingsState = {
  message: boolean;
  system: boolean;
  booking: boolean;
  marketing: boolean;
  sound: boolean;
};

export type UserPortalSettingsState = SharedPortalSettingsState;

export type TechnicianPortalSettingsState = SharedPortalSettingsState & {
  autoAccept: boolean;
  shareLocation: boolean;
  breakReminder: boolean;
};

export type MerchantPortalSettingsState = SharedPortalSettingsState & {
  storeOnline: boolean;
  autoConfirm: boolean;
  instantBooking: boolean;
  reviewReminder: boolean;
};

export type BusinessPortalSettingsState = SharedPortalSettingsState & {
  campaign: boolean;
  material: boolean;
  settlement: boolean;
  risk: boolean;
};

export type PortalSettingsStateMap = {
  user: UserPortalSettingsState;
  technician: TechnicianPortalSettingsState;
  merchant: MerchantPortalSettingsState;
  business: BusinessPortalSettingsState;
};

export type PortalSettingsState<T extends UnifiedSettingsPortal = UnifiedSettingsPortal> = PortalSettingsStateMap[T];

const portalSettingsStoragePrefix = "needo.settings.portal";

const defaultPortalSettingsState: PortalSettingsStateMap = {
  user: {
    message: true,
    system: true,
    booking: true,
    marketing: false,
    sound: true
  },
  technician: {
    message: true,
    system: true,
    booking: true,
    marketing: false,
    sound: true,
    autoAccept: false,
    shareLocation: true,
    breakReminder: true
  },
  merchant: {
    message: true,
    system: true,
    booking: true,
    marketing: false,
    sound: true,
    storeOnline: true,
    autoConfirm: false,
    instantBooking: true,
    reviewReminder: true
  },
  business: {
    message: true,
    system: true,
    booking: true,
    marketing: false,
    sound: true,
    campaign: true,
    material: true,
    settlement: true,
    risk: true
  }
};

function getPortalSettingsStorageKey(portal: UnifiedSettingsPortal) {
  return `${portalSettingsStoragePrefix}.${portal}.v1`;
}

export function persistPortalSettingsState<T extends UnifiedSettingsPortal>(portal: T, value: PortalSettingsStateMap[T]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getPortalSettingsStorageKey(portal), JSON.stringify(value));
  } catch {
    // iPhone Safari can reject storage writes in private / restricted contexts.
  }
}

function cloneDefaultPortalSettings<T extends UnifiedSettingsPortal>(portal: T): PortalSettingsStateMap[T] {
  return { ...defaultPortalSettingsState[portal] };
}

function normalizePortalSettingsState<T extends UnifiedSettingsPortal>(portal: T, raw: unknown): PortalSettingsStateMap[T] {
  const defaults = defaultPortalSettingsState[portal];

  if (!raw || typeof raw !== "object") {
    return cloneDefaultPortalSettings(portal);
  }

  const rawRecord = raw as Record<string, unknown>;
  const nextState = { ...defaults } as PortalSettingsStateMap[T];

  (Object.keys(defaults) as Array<keyof PortalSettingsStateMap[T]>).forEach((key) => {
    if (typeof rawRecord[String(key)] === "boolean") {
      nextState[key] = rawRecord[String(key)] as PortalSettingsStateMap[T][typeof key];
    }
  });

  return nextState;
}

export function getStoredPortalSettingsState<T extends UnifiedSettingsPortal>(portal: T): PortalSettingsStateMap[T] {
  if (typeof window === "undefined") {
    return cloneDefaultPortalSettings(portal);
  }

  try {
    const raw = window.localStorage.getItem(getPortalSettingsStorageKey(portal));

    if (!raw) {
      return cloneDefaultPortalSettings(portal);
    }

    return normalizePortalSettingsState(portal, JSON.parse(raw));
  } catch {
    return cloneDefaultPortalSettings(portal);
  }
}

export function clearPortalSettingsState(portal: UnifiedSettingsPortal) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getPortalSettingsStorageKey(portal));
  } catch {
    // Ignore storage removal failures in restricted browser contexts.
  }
}

export function summarizePortalSettingsState(state: PortalSettingsState) {
  const values = Object.values(state).filter((value): value is boolean => typeof value === "boolean");
  const enabledCount = values.filter(Boolean).length;

  if (enabledCount === values.length) {
    return "全部开启";
  }

  if (enabledCount === 0) {
    return "已关闭";
  }

  return "部分开启";
}

export function usePortalSettingsState<T extends UnifiedSettingsPortal>(portal: T) {
  const [value, setValue] = useState<PortalSettingsStateMap[T]>(() => getStoredPortalSettingsState(portal));

  useEffect(() => {
    setValue(getStoredPortalSettingsState(portal));
  }, [portal]);

  useEffect(() => {
    persistPortalSettingsState(portal, value);
  }, [portal, value]);

  return [value, setValue] as const;
}
