import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../ui/Badge";
import { useI18n } from "../../i18n/I18nProvider";
import { languages, type Language } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import { clientThemes, useClientTheme } from "../../theme/ClientThemeProvider";
import { SectionTitle } from "./SectionTitle";

type MobilePortal = "user" | "merchant" | "technician";

const portalEntries: Array<{ key: MobilePortal; label: string; caption: string; to: string }> = [
  { key: "user", label: "用户端", caption: "预约、动态、聊天", to: "/" },
  { key: "merchant", label: "商户端", caption: "门店、日程、经营", to: "/merchant" },
  { key: "technician", label: "技师端", caption: "任务、日程、收入", to: "/technician" }
];

export function MobilePreferencePanel({
  id,
  caption = "用户端白天/黑夜与三语切换集中在这里",
  currentPortal = "user",
  extraPanel
}: {
  id?: string;
  caption?: string;
  currentPortal?: MobilePortal;
  extraPanel?: ReactNode;
}) {
  const { language, setLanguage } = useI18n();
  const { theme, setTheme, isNight } = useClientTheme();
  const currentThemeIndex = clientThemes.findIndex((item) => item.id === theme);
  const currentTheme = clientThemes[currentThemeIndex] ?? clientThemes[0];
  const nextTheme = clientThemes[(currentThemeIndex + 1) % clientThemes.length] ?? clientThemes[0];

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-panel" id={id}>
      <SectionTitle caption={caption} title="显示与语言">
        <Badge tone="green">{currentTheme.shortLabel}</Badge>
      </SectionTitle>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-paper p-3">
        <div>
          <p className="text-xs font-bold text-ink/50">视觉主题</p>
          <strong className="mt-1 block">{currentTheme.label}</strong>
          <p className="mt-1 text-xs leading-5 text-ink/55">{currentTheme.description}</p>
        </div>
        <button
          className={cn(
            "focus-ring grid h-16 w-44 shrink-0 gap-1 overflow-hidden rounded-lg border border-line bg-[color:var(--client-surface)] p-1 shadow-panel transition",
            isNight && "is-night"
          )}
          onClick={() => setTheme(nextTheme.id)}
          aria-label={`切换到${nextTheme.label}`}
          style={{ gridTemplateColumns: `repeat(${clientThemes.length}, minmax(0, 1fr))` }}
          type="button"
        >
          {clientThemes.map((item) => (
            <span
              aria-hidden="true"
              className={cn(
                "grid min-w-0 place-items-center rounded-md px-1 text-[11px] font-black transition",
                item.id === theme
                  ? "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-[0_10px_22px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                  : "text-[color:var(--client-muted)]"
              )}
              key={item.id}
            >
              {item.shortLabel}
            </span>
          ))}
        </button>
      </div>

      <div className="mt-4">
        <p className="text-xs font-bold text-ink/50">语言</p>
        <div className="mt-2 grid grid-cols-3 gap-2" data-no-i18n>
          {languages.map((item) => (
            <button
              className={cn(
                "focus-ring rounded-lg border px-2 py-3 text-center text-xs font-black transition",
                language === item.code ? "border-moss bg-moss text-white" : "border-line bg-paper text-ink/60"
              )}
              key={item.code}
              onClick={() => setLanguage(item.code as Language)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-paper p-3">
        <div>
          <p className="text-xs font-bold text-ink/50">端口切换</p>
          <strong className="mt-1 block">用户端 / 商户端 / 技师端</strong>
          <p className="mt-1 text-xs leading-5 text-ink/55">已开通资格的账号可以在这里切换，不再分散到其他入口。</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {portalEntries.map((entry) => {
            const active = currentPortal === entry.key;

            return (
              <Link
                className={cn(
                  "focus-ring rounded-lg border px-2 py-3 text-center transition",
                  active ? "border-moss bg-moss text-white shadow-soft" : "border-line bg-white text-ink"
                )}
                key={entry.key}
                to={entry.to}
              >
                <strong className="block text-sm">{entry.label}</strong>
                <span className={cn("mt-1 block text-[11px] leading-4", active ? "text-white/70" : "text-ink/50")}>{entry.caption}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {extraPanel ? (
        <div className="mt-4">
          {extraPanel}
        </div>
      ) : null}
    </section>
  );
}
