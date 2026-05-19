import { useSyncExternalStore } from "react";

export type NeedoPetSettings = {
  enabled: boolean;
};

const settingsKey = "needo.digital-pet.settings.v1";
const defaultSettings: NeedoPetSettings = {
  enabled: false
};
const listeners = new Set<() => void>();
let cachedSettings = defaultSettings;

function readStoredSettings(): NeedoPetSettings {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(settingsKey) ?? "null") as Partial<NeedoPetSettings> | null;
    const nextSettings = {
      enabled: typeof parsed?.enabled === "boolean" ? parsed.enabled : defaultSettings.enabled
    };

    return nextSettings.enabled === cachedSettings.enabled ? cachedSettings : nextSettings;
  } catch {
    return cachedSettings.enabled === defaultSettings.enabled ? cachedSettings : defaultSettings;
  }
}

function readSettingsSnapshot(): NeedoPetSettings {
  return cachedSettings;
}

function writeSettingsSnapshot(settings: NeedoPetSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(settingsKey, JSON.stringify(settings));
}

function emitSettingsChange() {
  const nextSettings = readStoredSettings();

  if (nextSettings.enabled === cachedSettings.enabled) {
    return;
  }

  cachedSettings = nextSettings;
  listeners.forEach((listener) => listener());
}

export function setNeedoPetEnabled(enabled: boolean) {
  const nextSettings = {
    ...cachedSettings,
    enabled
  };

  cachedSettings = nextSettings;
  writeSettingsSnapshot(nextSettings);
  listeners.forEach((listener) => listener());
}

export function refreshNeedoPetSettings() {
  emitSettingsChange();
}

export function subscribeNeedoPetSettings(listener: () => void) {
  listeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key === settingsKey) {
      emitSettingsChange();
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    listeners.delete(listener);

    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

export function useNeedoPetSettings() {
  if (typeof window !== "undefined") {
    cachedSettings = readStoredSettings();
  }

  return useSyncExternalStore(subscribeNeedoPetSettings, readSettingsSnapshot, () => defaultSettings);
}
