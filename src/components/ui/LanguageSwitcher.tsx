import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n/I18nProvider";
import { languages, type Language } from "../../i18n/translations";

export function TranslationIcon({ className }: { className?: string }) {
  const cardGradientId = useId().replace(/:/g, "");
  const shineGradientId = useId().replace(/:/g, "");
  const shadowId = useId().replace(/:/g, "");

  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 48 48">
      <defs>
        <linearGradient id={cardGradientId} x1="8" x2="40" y1="6" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#161723" />
          <stop offset="1" stopColor="#05050A" />
        </linearGradient>
        <linearGradient id={shineGradientId} x1="10" x2="36" y1="8" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.18" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <filter id={shadowId} colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="48" width="48" x="0" y="0">
          <feDropShadow dx="0" dy="2.2" floodColor="#000000" floodOpacity="0.28" stdDeviation="2.2" />
        </filter>
      </defs>
      <g filter={`url(#${shadowId})`}>
        <rect fill={`url(#${cardGradientId})`} height="28" rx="3.2" stroke="#5F6685" strokeOpacity="0.64" strokeWidth="1.1" width="28" x="5" y="5" />
        <rect fill={`url(#${shineGradientId})`} height="28" rx="3.2" width="28" x="5" y="5" />
        <rect fill={`url(#${cardGradientId})`} height="26" rx="3.4" stroke="#737A9D" strokeOpacity="0.72" strokeWidth="1.1" width="26" x="17" y="17" />
      </g>
      <path d="M12 14.2h15.2M19.8 9.4v5.1M14.5 18.2c2.4 6 7.5 9.4 12.9 10.9" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="3.2" />
      <path d="M25.2 14.5c-1.7 6.5-5.7 11.5-11.7 15.2" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="3.2" />
      <path d="m24.5 37.2 6.3-15.3h3.3l6.4 15.3h-3.7l-1.2-3.1h-6.4L28 37.2h-3.5Zm5.7-5.9h4.3l-2.1-5.6-2.2 5.6Z" fill="#FFFFFF" />
    </svg>
  );
}

export function LanguageSwitcher({
  compact = false,
  dark = false,
  iconOnly = false,
  className
}: {
  compact?: boolean;
  dark?: boolean;
  iconOnly?: boolean;
  className?: string;
}) {
  const { language, setLanguage } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const ariaLabel = {
    zh: "语言切换",
    "zh-Hant": "語言切換",
    ja: "言語切替",
    en: "Language selector",
    ko: "언어 선택"
  }[language];

  useEffect(() => {
    if (!iconOnly || !open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [iconOnly, open]);

  if (iconOnly) {
    return (
      <div className={cn("relative inline-flex", className)} data-no-i18n ref={rootRef}>
        <button
          aria-controls={menuId}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={ariaLabel}
          className={cn(
            "focus-ring grid h-10 w-10 place-items-center rounded-lg border transition",
            dark ? "border-white/15 bg-white/10 text-white hover:bg-white/15" : "border-line bg-white text-ink/70 hover:text-ink"
          )}
          onClick={() => setOpen((current) => !current)}
          title={ariaLabel}
          type="button"
        >
          <TranslationIcon className="h-7 w-7" />
        </button>

        {open ? (
          <div
            className={cn(
              "absolute right-0 top-full z-[90] mt-2 min-w-[152px] overflow-hidden rounded-xl border shadow-panel",
              dark ? "border-white/15 bg-[#172126] text-white" : "border-line bg-white text-ink"
            )}
            id={menuId}
            role="menu"
          >
            <div className="p-1">
              {languages.map((item) => {
                const active = language === item.code;

                return (
                  <button
                    aria-pressed={active}
                    className={cn(
                      "focus-ring flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition",
                      active
                        ? dark
                          ? "bg-white text-ink"
                          : "bg-ink text-white"
                        : dark
                          ? "text-white/80 hover:bg-white/10 hover:text-white"
                          : "text-ink/70 hover:bg-paper hover:text-ink"
                    )}
                    key={item.code}
                    onClick={() => {
                      setLanguage(item.code as Language);
                      setOpen(false);
                    }}
                    role="menuitemradio"
                    type="button"
                  >
                    <span>{item.label}</span>
                    <span className={cn("text-[11px] font-black uppercase", active ? "" : "opacity-55")}>{item.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border p-1 shadow-panel",
        compact && "rounded-full",
        dark ? "border-white/15 bg-white/10 text-white" : "border-line bg-white text-ink",
        className
      )}
      data-no-i18n
    >
      {languages.map((item) => (
        <button
          aria-pressed={language === item.code}
          className={cn(
            "focus-ring h-8 px-2 text-xs font-black transition",
            compact ? "min-w-8 rounded-full" : "min-w-14 rounded-md",
            language === item.code
              ? dark
                ? "bg-white text-ink"
                : "bg-ink text-white"
              : dark
                ? "text-white/70 hover:bg-white/10 hover:text-white"
                : "text-ink/55 hover:bg-paper hover:text-ink"
          )}
          key={item.code}
          onClick={() => setLanguage(item.code as Language)}
          title={item.label}
          type="button"
        >
          {compact ? item.shortLabel : item.label}
        </button>
      ))}
    </div>
  );
}
