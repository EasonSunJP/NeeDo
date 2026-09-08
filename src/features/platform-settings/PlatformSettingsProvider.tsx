import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { platformSettingsApi } from "./api";
import { safePublicPlatformSettings, type PublicPlatformSettings } from "./types";

type PlatformSettingsContextValue = {
  settings: PublicPlatformSettings;
  status: "loading" | "ready" | "error";
  reload: () => void;
};

const PlatformSettingsContext = createContext<PlatformSettingsContextValue>({
  settings: safePublicPlatformSettings,
  status: "error",
  reload: () => undefined
});

export function PlatformSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(safePublicPlatformSettings);
  const [status, setStatus] = useState<PlatformSettingsContextValue["status"]>("loading");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    void platformSettingsApi.getPublic().then(
      (next) => {
        if (!active) return;
        setSettings(next);
        setStatus("ready");
      },
      () => {
        if (!active) return;
        setSettings(safePublicPlatformSettings);
        setStatus("error");
      }
    );
    return () => {
      active = false;
    };
  }, [revision]);

  const value = useMemo(
    () => ({ settings, status, reload: () => setRevision((current) => current + 1) }),
    [settings, status]
  );
  return <PlatformSettingsContext.Provider value={value}>{children}</PlatformSettingsContext.Provider>;
}

export function usePlatformSettings() {
  return useContext(PlatformSettingsContext);
}
