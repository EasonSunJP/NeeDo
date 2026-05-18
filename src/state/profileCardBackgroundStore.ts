import { useSyncExternalStore } from "react";
import { parseBrowserStorageJson, writeBrowserStorage } from "../lib/browserStorage";

export interface ProfileCardBackgroundSettings {
  editEntryEnabled: boolean;
}

type ProfileCardBackgroundSnapshot = {
  settings: ProfileCardBackgroundSettings;
  revision: number;
};

const storageKey = "needo.profile-card-background.v1";
const defaultSettings: ProfileCardBackgroundSettings = {
  editEntryEnabled: false
};
const listeners = new Set<() => void>();
let revision = 0;
let cachedSnapshot: ProfileCardBackgroundSnapshot | null = null;

function normalizeSettings(raw?: Partial<ProfileCardBackgroundSettings>): ProfileCardBackgroundSettings {
  return {
    editEntryEnabled: typeof raw?.editEntryEnabled === "boolean" ? raw.editEntryEnabled : defaultSettings.editEntryEnabled
  };
}

function getStoredSettings() {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  return normalizeSettings(parseBrowserStorageJson<Partial<ProfileCardBackgroundSettings>>(storageKey, defaultSettings, { silent: true }));
}

function persist(settings: ProfileCardBackgroundSettings) {
  if (typeof window === "undefined") {
    return;
  }

  writeBrowserStorage(storageKey, JSON.stringify(normalizeSettings(settings)), { silent: true });
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

function getSnapshot(): ProfileCardBackgroundSnapshot {
  if (cachedSnapshot && cachedSnapshot.revision === revision) {
    return cachedSnapshot;
  }

  cachedSnapshot = {
    settings: getStoredSettings(),
    revision
  };

  return cachedSnapshot;
}

export function useProfileCardBackgroundSettings() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).settings;
}

export function updateProfileCardBackgroundSettings(patch: Partial<ProfileCardBackgroundSettings>) {
  persist(
    normalizeSettings({
      ...getStoredSettings(),
      ...patch
    })
  );
  notify();
}

export function setProfileCardBackgroundEditEntryEnabled(enabled: boolean) {
  updateProfileCardBackgroundSettings({ editEntryEnabled: enabled });
}
