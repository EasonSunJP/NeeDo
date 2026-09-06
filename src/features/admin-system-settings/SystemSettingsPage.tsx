import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useI18n } from "../../i18n/I18nProvider";
import { cn } from "../../lib/utils";
import { adminSystemSettingsApi } from "./api";
import { BasicSettingsTab } from "./BasicSettingsTab";
import { adminSystemSettingsCopy } from "./i18n";
import { LegalDocumentsTab } from "./LegalDocumentsTab";
import { PaymentSettingsTab } from "./PaymentSettingsTab";
import { RetentionSettingsTab } from "./RetentionSettingsTab";
import type { ImRetentionSettings, OperationsPlatformSettings } from "./types";

const tabs = [
  { id: "basic", labelIndex: 0 },
  { id: "legal", labelIndex: 1 },
  { id: "storage", labelIndex: 2 },
  { id: "payment", labelIndex: 3 }
] as const;
type TabId = (typeof tabs)[number]["id"];

function normalizeTab(value: string | null): TabId {
  return tabs.some((tab) => tab.id === value) ? (value as TabId) : "basic";
}

export function SystemSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { language } = useI18n();
  const { hasPermission } = useAuth();
  const labels = adminSystemSettingsCopy[language];
  const activeTab = normalizeTab(searchParams.get("tab"));
  const [settings, setSettings] = useState<OperationsPlatformSettings | null>(null);
  const [retention, setRetention] = useState<ImRetentionSettings | null>(null);
  const [settingsState, setSettingsState] = useState<"loading" | "ready" | "error">("loading");
  const [retentionState, setRetentionState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [dirtyTabs, setDirtyTabs] = useState<Partial<Record<TabId, boolean>>>({});
  const settingsRequest = useRef(0);
  const retentionRequest = useRef(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const loadSettings = useCallback(async () => {
    const request = ++settingsRequest.current;
    setSettingsState("loading");
    try {
      const next = await adminSystemSettingsApi.getSettings();
      if (request !== settingsRequest.current) return;
      setSettings(next);
      setSettingsState("ready");
    } catch {
      if (request !== settingsRequest.current) return;
      setSettingsState("error");
    }
  }, []);

  const loadRetention = useCallback(async () => {
    const request = ++retentionRequest.current;
    setRetentionState("loading");
    try {
      const next = await adminSystemSettingsApi.getRetention();
      if (request !== retentionRequest.current) return;
      setRetention(next);
      setRetentionState("ready");
    } catch {
      if (request !== retentionRequest.current) return;
      setRetentionState("error");
    }
  }, []);

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => {
    if (activeTab === "storage" && retentionState === "idle") void loadRetention();
  }, [activeTab, loadRetention, retentionState]);

  const selectTab = (tab: TabId) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const nextIndex = (index + direction + tabs.length) % tabs.length;
    selectTab(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  const tabLabels = useMemo(() => tabs.map((tab) => ({ ...tab, label: labels.tabs[tab.labelIndex] })), [labels.tabs]);
  const dirtyChanged = (tab: TabId) => (dirty: boolean) => setDirtyTabs((current) => current[tab] === dirty ? current : { ...current, [tab]: dirty });

  let content;
  if (activeTab === "legal") {
    content = <LegalDocumentsTab onDirtyChange={dirtyChanged("legal")} />;
  } else if (activeTab === "storage") {
    content = retentionState === "ready" && retention ? (
      <RetentionSettingsTab canWrite={hasPermission("backoffice:im-retention:write")} labels={labels} onDirtyChange={dirtyChanged("storage")} onSaved={(next) => setRetention(next)} settings={retention} />
    ) : retentionState === "error" ? (
      <LoadFailure labels={labels} onRetry={() => void loadRetention()} />
    ) : <Loading label={labels.loading} />;
  } else {
    content = settingsState === "ready" && settings ? (
      activeTab === "basic" ? (
        <BasicSettingsTab canActivateMedia={hasPermission("backoffice:system-brand-media:activate")} canUpload={hasPermission("button:backoffice-content-media-upload")} canWrite={hasPermission("backoffice:system-settings:write")} labels={labels} onDirtyChange={dirtyChanged("basic")} onSaved={loadSettings} settings={settings} />
      ) : (
        <PaymentSettingsTab canWrite={hasPermission("backoffice:payment-settings:write")} labels={labels} onDirtyChange={dirtyChanged("payment")} onSaved={loadSettings} settings={settings} />
      )
    ) : settingsState === "error" ? (
      <LoadFailure labels={labels} onRetry={() => void loadSettings()} />
    ) : <Loading label={labels.loading} />;
  }

  return (
    <AdminLayout>
    <ModuleShell description={labels.description} title={labels.title} actions={settings ? <Badge tone="blue">{labels.version} {settings.version}</Badge> : undefined}>
      <div className="rounded-2xl border border-line bg-white p-2 shadow-sm">
        <div aria-label={labels.title} className="grid gap-2 md:grid-cols-4" role="tablist">
          {tabLabels.map((tab, index) => (
            <button aria-controls={`system-settings-panel-${tab.id}`} aria-selected={activeTab === tab.id} className={cn("admin-section-tab focus-ring relative rounded-xl px-4 py-3 text-sm font-black transition", activeTab === tab.id ? "is-active shadow-sm" : "bg-paper")} id={`system-settings-tab-${tab.id}`} key={tab.id} onClick={() => selectTab(tab.id)} onKeyDown={(event) => handleTabKeyDown(event, index)} ref={(node) => { tabRefs.current[index] = node; }} role="tab" tabIndex={activeTab === tab.id ? 0 : -1} type="button">
              {tab.label}
              {dirtyTabs[tab.id] ? <span aria-label={labels.dirty} className="absolute right-2 top-2 h-2 w-2 rounded-full bg-coral" /> : null}
            </button>
          ))}
        </div>
      </div>
      <section aria-labelledby={`system-settings-tab-${activeTab}`} className="rounded-2xl border border-line bg-white p-5 shadow-sm" id={`system-settings-panel-${activeTab}`} role="tabpanel">
        {content}
      </section>
    </ModuleShell>
    </AdminLayout>
  );
}

function Loading({ label }: { label: string }) {
  return <div className="rounded-xl bg-paper p-6 text-sm font-bold text-ink/50">{label}</div>;
}

function LoadFailure({ labels, onRetry }: { labels: { loadError: string; retry: string }; onRetry: () => void }) {
  return <div className="rounded-xl border border-coral/30 bg-coral/10 p-5"><p className="font-black text-coral">{labels.loadError}</p><Button className="mt-4" onClick={onRetry} variant="secondary">{labels.retry}</Button></div>;
}
