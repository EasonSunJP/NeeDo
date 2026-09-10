import { useCallback, useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import {
  automationApi,
  type TechnicianAutomationKind,
  type TechnicianAutomationSetting,
} from "./automation-api";

const kinds: readonly TechnicianAutomationKind[] = ["booking", "request"];

const labels: Record<TechnicianAutomationKind, string> = {
  booking: "自动接单",
  request: "自动抢单",
};

type Settings = Partial<Record<TechnicianAutomationKind, TechnicianAutomationSetting>>;

export function TechnicianAutomationQuickSwitches() {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [savingKind, setSavingKind] = useState<TechnicianAutomationKind | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [booking, request] = await Promise.all(
        kinds.map((kind) => automationApi.getSetting(kind)),
      );
      setSettings({ booking, request });
    } catch {
      setError("自动化设置读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (kind: TechnicianAutomationKind) => {
    const current = settings[kind];
    if (!current || !current.entitled || savingKind) return;
    setSavingKind(kind);
    setError("");
    try {
      const saved = await automationApi.updateSetting(kind, {
        enabled: !current.enabled,
        expectedVersion: current.version,
        rules: current.rules,
      });
      setSettings((value) => ({ ...value, [kind]: saved }));
    } catch {
      setError(`${labels[kind]}设置保存失败`);
    } finally {
      setSavingKind(null);
    }
  };

  if (loading) {
    return (
      <span className="text-[10px] font-black text-[color:var(--client-muted)]" aria-live="polite">
        正在读取自动化设置
      </span>
    );
  }

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-2 gap-2">
        {kinds.map((kind) => {
          const setting = settings[kind];
          const checked = setting?.enabled ?? false;
          const disabled = !setting || !setting.entitled || savingKind !== null;
          return (
            <div className="flex min-w-[62px] flex-col items-center gap-1" key={kind}>
              <span className="whitespace-nowrap text-[10px] font-black text-[color:var(--client-muted)]">
                {labels[kind]}
              </span>
              <button
                aria-checked={checked}
                aria-label={labels[kind]}
                className={cn(
                  "focus-ring relative h-6 w-11 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-45",
                  checked
                    ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)]"
                    : "border-[color:var(--client-line)] bg-[color:var(--client-surface)]",
                )}
                disabled={disabled}
                onClick={() => void toggle(kind)}
                role="switch"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform",
                    checked && "translate-x-5",
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>
      {error ? (
        <p className="mt-1 text-right text-[9px] font-black text-red-500" role="alert">
          {error}{" "}
          <button className="underline" data-action="retry-load" onClick={() => void load()} type="button">
            重试
          </button>
        </p>
      ) : null}
    </div>
  );
}

