import type { MouseEvent, ReactNode } from "react";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { cn } from "../../lib/utils";
import { useClientTheme, type ClientTheme } from "../../theme/ClientThemeProvider";

export type OfferInfoField = {
  label: ReactNode;
  value: ReactNode;
};

type OfferToneClasses = {
  card: string;
  chip: string;
  fieldValue: string;
  noteSurface: string;
  noteLabel: string;
  noteValue: string;
  noteTag: string;
  expirySurface: string;
  expiryLabel: string;
  expiryCountdown: string;
  title: string;
  titlePrefix: string;
  imageLabel: string;
  eyebrow: string;
};

const defaultToneClasses: OfferToneClasses = {
  card:
    "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] shadow-[0_14px_30px_rgba(0,0,0,0.06)]",
  chip: "bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] text-[color:var(--client-text)]",
  fieldValue: "text-[color:var(--client-muted)]",
  noteSurface: "bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]",
  noteLabel: "text-[color:var(--client-muted)]",
  noteValue: "text-[color:var(--client-text)]",
  noteTag: "text-[color:var(--client-primary)]",
  expirySurface: "bg-[color:color-mix(in_srgb,var(--client-surface)_68%,transparent)]",
  expiryLabel: "text-[color:var(--client-muted)]",
  expiryCountdown: "text-[color:color-mix(in_srgb,var(--client-muted)_78%,transparent)]",
  title: "text-[color:var(--client-text)]",
  titlePrefix: "text-[color:var(--client-primary)]",
  imageLabel: "bg-black/58 text-white",
  eyebrow: "text-[color:var(--client-primary)]"
};

const infoToneClassesByTheme: Record<ClientTheme, OfferToneClasses> = {
  "vital-mono": {
    card:
      "border-[rgba(28,29,31,0.14)] bg-[linear-gradient(180deg,rgba(236,237,239,0.98)_0%,rgba(224,225,228,0.96)_100%)] shadow-[0_16px_32px_rgba(20,21,23,0.13)]",
    chip: "bg-[rgba(28,29,31,0.1)] text-[#202124]",
    fieldValue: "text-[#555a61]",
    noteSurface: "border border-[rgba(28,29,31,0.08)] bg-[rgba(28,29,31,0.065)]",
    noteLabel: "text-[#666b73]",
    noteValue: "text-[#202124]",
    noteTag: "text-[#087bb8]",
    expirySurface: "border border-[rgba(28,29,31,0.08)] bg-[rgba(28,29,31,0.065)]",
    expiryLabel: "text-[#666b73]",
    expiryCountdown: "text-[#555a61]",
    title: "text-[#202124]",
    titlePrefix: "text-[#087bb8]",
    imageLabel: "bg-black/60 text-white",
    eyebrow: "text-[#087bb8]"
  },
  "light-green": {
    card:
      "border-[rgba(60,136,126,0.2)] bg-[linear-gradient(180deg,rgba(230,241,237,0.98)_0%,rgba(218,234,228,0.96)_100%)] shadow-[0_16px_32px_rgba(41,68,55,0.14)]",
    chip: "bg-[rgba(60,136,126,0.12)] text-[#1f5b51]",
    fieldValue: "text-[#415f56]",
    noteSurface: "border border-[rgba(60,136,126,0.1)] bg-[rgba(60,136,126,0.075)]",
    noteLabel: "text-[#5d7168]",
    noteValue: "text-[#163630]",
    noteTag: "text-[#2f7d54]",
    expirySurface: "border border-[rgba(60,136,126,0.1)] bg-[rgba(60,136,126,0.075)]",
    expiryLabel: "text-[#5d7168]",
    expiryCountdown: "text-[#415f56]",
    title: "text-[#163630]",
    titlePrefix: "text-[#2f7d54]",
    imageLabel: "bg-[rgba(20,44,33,0.62)] text-white",
    eyebrow: "text-[#2f7d54]"
  },
  "dark-green": defaultToneClasses,
  "cool-black-gray": {
    card:
      "border-[rgba(183,204,214,0.18)] bg-[linear-gradient(180deg,rgba(31,38,44,0.94)_0%,rgba(18,23,28,0.96)_100%)] shadow-[0_20px_38px_rgba(0,0,0,0.38)]",
    chip: "bg-[rgba(24,210,240,0.1)] text-[#d8faff]",
    fieldValue: "text-[rgba(222,233,238,0.78)]",
    noteSurface: "border border-[rgba(183,204,214,0.1)] bg-[rgba(183,204,214,0.065)]",
    noteLabel: "text-[rgba(222,233,238,0.6)]",
    noteValue: "text-[#f3f8fb]",
    noteTag: "text-[#79f0ff]",
    expirySurface: "border border-[rgba(183,204,214,0.1)] bg-[rgba(183,204,214,0.06)]",
    expiryLabel: "text-[rgba(222,233,238,0.6)]",
    expiryCountdown: "text-[rgba(222,233,238,0.66)]",
    title: "text-[#f3f8fb]",
    titlePrefix: "text-[#79f0ff]",
    imageLabel: "bg-black/60 text-[#f3f8fb]",
    eyebrow: "text-[#79f0ff]"
  },
  "neon-pink": {
    card:
      "border-[rgba(143,124,255,0.24)] bg-[linear-gradient(180deg,rgba(32,35,78,0.92)_0%,rgba(25,29,66,0.94)_58%,rgba(43,20,61,0.92)_100%)] shadow-[0_18px_34px_rgba(4,5,18,0.28)]",
    chip: "bg-[rgba(255,111,174,0.11)] text-[#ffe1ef]",
    fieldValue: "text-[rgba(242,236,255,0.78)]",
    noteSurface: "border border-[rgba(119,94,220,0.16)] bg-[rgba(119,94,220,0.1)]",
    noteLabel: "text-[rgba(201,189,255,0.68)]",
    noteValue: "text-[#fff7fb]",
    noteTag: "text-[#ff9ec6]",
    expirySurface: "border border-[rgba(119,94,220,0.16)] bg-[rgba(119,94,220,0.095)]",
    expiryLabel: "text-[rgba(201,189,255,0.68)]",
    expiryCountdown: "text-[rgba(242,236,255,0.68)]",
    title: "text-white",
    titlePrefix: "text-[#c9bdff]",
    imageLabel: "bg-[rgba(58,48,118,0.7)] text-white",
    eyebrow: "text-[#c9bdff]"
  },
  "black-gold": {
    card:
      "border-[rgba(254,222,160,0.18)] bg-[linear-gradient(180deg,rgba(28,27,25,0.94)_0%,rgba(12,12,12,0.96)_100%)] shadow-[0_20px_38px_rgba(0,0,0,0.38)]",
    chip: "bg-[rgba(254,222,160,0.1)] text-[#ffe9b8]",
    fieldValue: "text-[rgba(223,211,189,0.78)]",
    noteSurface: "border border-[rgba(254,222,160,0.09)] bg-[rgba(254,222,160,0.065)]",
    noteLabel: "text-[rgba(254,223,160,0.6)]",
    noteValue: "text-[#fff7e5]",
    noteTag: "text-[#fedfa0]",
    expirySurface: "border border-[rgba(254,222,160,0.09)] bg-[rgba(254,222,160,0.06)]",
    expiryLabel: "text-[rgba(254,223,160,0.6)]",
    expiryCountdown: "text-[rgba(223,211,189,0.66)]",
    title: "text-[#fff7e5]",
    titlePrefix: "text-[#fedfa0]",
    imageLabel: "bg-black/60 text-[#fff7e5]",
    eyebrow: "text-[#fedfa0]"
  }
};

const demandToneClassesByTheme: Record<ClientTheme, OfferToneClasses> = {
  "vital-mono": {
    card:
      "border-[rgba(28,29,31,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(241,242,244,0.96)_100%)] shadow-[0_18px_34px_rgba(20,21,23,0.12)]",
    chip: "bg-[rgba(28,29,31,0.07)] text-[#202124]",
    fieldValue: "text-[#62666d]",
    noteSurface: "border border-[rgba(28,29,31,0.08)] bg-[rgba(28,29,31,0.045)]",
    noteLabel: "text-[#71757d]",
    noteValue: "text-[#202124]",
    noteTag: "text-[#087bb8]",
    expirySurface: "border border-[rgba(28,29,31,0.08)] bg-[rgba(28,29,31,0.045)]",
    expiryLabel: "text-[#71757d]",
    expiryCountdown: "text-[#62666d]",
    title: "text-[#202124]",
    titlePrefix: "text-[#087bb8]",
    imageLabel: "bg-black/58 text-white",
    eyebrow: "text-[#087bb8]"
  },
  "light-green": {
    card:
      "border-[rgba(60,136,126,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(239,248,245,0.95)_100%)] shadow-[0_18px_34px_rgba(41,68,55,0.12)]",
    chip: "bg-[rgba(60,136,126,0.1)] text-[#1f5b51]",
    fieldValue: "text-[#49685f]",
    noteSurface: "border border-[rgba(60,136,126,0.1)] bg-[rgba(255,255,255,0.58)]",
    noteLabel: "text-[#657b70]",
    noteValue: "text-[#163630]",
    noteTag: "text-[#2f7d54]",
    expirySurface: "border border-[rgba(60,136,126,0.1)] bg-[rgba(252,253,252,0.62)]",
    expiryLabel: "text-[#657b70]",
    expiryCountdown: "text-[#4f665a]",
    title: "text-[#163630]",
    titlePrefix: "text-[#2f7d54]",
    imageLabel: "bg-[rgba(20,44,33,0.6)] text-white",
    eyebrow: "text-[#2f7d54]"
  },
  "dark-green": {
    card:
      "border-[#365247] bg-[linear-gradient(180deg,rgba(28,46,41,0.98)_0%,rgba(18,30,27,0.98)_100%)] shadow-[0_18px_34px_rgba(11,22,18,0.28)]",
    chip: "bg-[rgba(255,255,255,0.08)] text-white",
    fieldValue: "text-white/76",
    noteSurface: "bg-[rgba(255,255,255,0.08)]",
    noteLabel: "text-white/52",
    noteValue: "text-white",
    noteTag: "text-[color:var(--client-primary)]",
    expirySurface: "bg-[rgba(255,255,255,0.08)]",
    expiryLabel: "text-white/52",
    expiryCountdown: "text-white/62",
    title: "text-white",
    titlePrefix: "text-[color:var(--client-primary)]",
    imageLabel: "bg-black/48 text-white",
    eyebrow: "text-[color:var(--client-primary)]"
  },
  "cool-black-gray": {
    card:
      "border-[rgba(121,240,255,0.34)] bg-[linear-gradient(180deg,rgba(42,54,63,0.98)_0%,rgba(28,39,47,0.98)_56%,rgba(18,28,35,0.98)_100%)] shadow-[0_20px_38px_rgba(24,210,240,0.14)]",
    chip: "bg-[rgba(24,210,240,0.14)] text-[#d8faff]",
    fieldValue: "text-[rgba(238,249,252,0.84)]",
    noteSurface: "border border-[rgba(121,240,255,0.14)] bg-[rgba(24,210,240,0.1)]",
    noteLabel: "text-[rgba(216,250,255,0.68)]",
    noteValue: "text-[#f3f8fb]",
    noteTag: "text-[#79f0ff]",
    expirySurface: "border border-[rgba(121,240,255,0.14)] bg-[rgba(24,210,240,0.085)]",
    expiryLabel: "text-[rgba(216,250,255,0.68)]",
    expiryCountdown: "text-[rgba(238,249,252,0.68)]",
    title: "text-[#f3f8fb]",
    titlePrefix: "text-[#79f0ff]",
    imageLabel: "bg-black/58 text-[#f3f8fb]",
    eyebrow: "text-[#79f0ff]"
  },
  "neon-pink": {
    card:
      "border-[rgba(255,143,190,0.33)] bg-[linear-gradient(180deg,rgba(40,42,96,0.96)_0%,rgba(33,36,81,0.96)_58%,rgba(54,27,76,0.95)_100%)] shadow-[0_18px_34px_rgba(4,5,18,0.22),0_0_24px_rgba(255,111,174,0.1)]",
    chip: "bg-[rgba(255,143,190,0.15)] text-[#ffe1ef]",
    fieldValue: "text-[rgba(248,242,255,0.84)]",
    noteSurface: "border border-[rgba(255,143,190,0.18)] bg-[rgba(255,143,190,0.095)]",
    noteLabel: "text-[rgba(211,201,255,0.73)]",
    noteValue: "text-[#fff7fb]",
    noteTag: "text-[#ff9ec6]",
    expirySurface: "border border-[rgba(177,164,255,0.18)] bg-[rgba(119,94,220,0.115)]",
    expiryLabel: "text-[rgba(211,201,255,0.71)]",
    expiryCountdown: "text-[rgba(248,242,255,0.71)]",
    title: "text-white",
    titlePrefix: "text-[#ffd5e8]",
    imageLabel: "bg-[rgba(58,48,118,0.7)] text-white",
    eyebrow: "text-[#ffd5e8]"
  },
  "black-gold": {
    card:
      "border-[rgba(254,222,160,0.2)] bg-[linear-gradient(180deg,rgba(32,31,29,0.98)_0%,rgba(14,14,14,0.98)_100%)] shadow-[0_20px_38px_rgba(0,0,0,0.36)]",
    chip: "bg-[rgba(254,222,160,0.12)] text-[#ffe9b8]",
    fieldValue: "text-[rgba(223,211,189,0.82)]",
    noteSurface: "border border-[rgba(254,222,160,0.1)] bg-[rgba(254,222,160,0.08)]",
    noteLabel: "text-[rgba(254,223,160,0.64)]",
    noteValue: "text-[#fff7e5]",
    noteTag: "text-[#fedfa0]",
    expirySurface: "border border-[rgba(254,222,160,0.1)] bg-[rgba(254,222,160,0.075)]",
    expiryLabel: "text-[rgba(254,223,160,0.64)]",
    expiryCountdown: "text-[rgba(223,211,189,0.68)]",
    title: "text-[#fff7e5]",
    titlePrefix: "text-[#fedfa0]",
    imageLabel: "bg-black/58 text-[#fff7e5]",
    eyebrow: "text-[#fedfa0]"
  }
};

function normalizeOfferInfoTags(tags: string[]) {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.replace(/^#+/u, "").trim())
        .filter((tag) => tag.length > 0)
    )
  );
}

export function OfferInfoCard({
  image,
  imageAlt,
  imageLabel,
  eyebrow,
  tone = "default",
  titlePrefix,
  title,
  titleBadge,
  tags = [],
  fields,
  noteLabel = "备注",
  noteValue,
  expiryLabel = "有效期限",
  expiryValue,
  expiryCountdown,
  cornerBadge,
  cornerBadgeAriaLabel,
  cornerBadgeClassName,
  onCornerBadgeClick,
  topRightAction,
  footer,
  className
}: {
  image: string;
  imageAlt: string;
  imageLabel?: ReactNode;
  eyebrow?: ReactNode;
  tone?: "default" | "demand";
  titlePrefix?: ReactNode;
  title: ReactNode;
  titleBadge?: ReactNode;
  tags?: string[];
  fields: OfferInfoField[];
  noteLabel?: ReactNode;
  noteValue?: ReactNode;
  expiryLabel?: ReactNode;
  expiryValue?: ReactNode;
  expiryCountdown?: ReactNode;
  cornerBadge?: ReactNode;
  cornerBadgeAriaLabel?: string;
  cornerBadgeClassName?: string;
  onCornerBadgeClick?: () => void;
  topRightAction?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const { theme } = useClientTheme();
  const resolvedTitleBadge = typeof titleBadge === "string" ? titleBadge.trim() : titleBadge;
  const titleBadgeText = typeof resolvedTitleBadge === "string" ? resolvedTitleBadge.toUpperCase() : null;
  const useCornerTitleBadge = titleBadgeText === "NEW";
  const hasTopRightBadges = useCornerTitleBadge || Boolean(cornerBadge);
  const hasTopRightMeta = hasTopRightBadges || Boolean(topRightAction);
  const toneClasses = tone === "demand" ? demandToneClassesByTheme[theme] : infoToneClassesByTheme[theme];
  const normalizedTags = normalizeOfferInfoTags(tags);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[26px] border p-3.5",
        toneClasses.card,
        className
      )}
    >
      {hasTopRightMeta ? (
        <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
          {useCornerTitleBadge ? (
            <span
              aria-label="新内容"
              className="pointer-events-none h-3 w-3 rounded-full bg-[#ff5a5a] shadow-[0_0_0_3px_rgba(255,90,90,0.16),0_6px_16px_rgba(255,90,90,0.34)]"
            />
          ) : null}

          {topRightAction ? <div className="pointer-events-auto">{topRightAction}</div> : null}

          {cornerBadge
            ? onCornerBadgeClick
              ? (
                <button
                  aria-label={cornerBadgeAriaLabel}
                  className={cn(
                    "focus-ring inline-flex items-center rounded-full border border-[color:var(--client-needo-border)] bg-[color:var(--client-primary)] px-3 py-1 text-[11px] font-black leading-none text-[color:var(--client-needo-text)] shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_18%,transparent)] transition hover:-translate-y-0.5",
                    cornerBadgeClassName
                  )}
                  onClick={(event: MouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation();
                    onCornerBadgeClick();
                  }}
                  type="button"
                >
                  {cornerBadge}
                </button>
                )
              : (
                <div
                  className={cn(
                    "pointer-events-none inline-flex items-center rounded-full border border-[color:var(--client-needo-border)] bg-[color:var(--client-primary)] px-3 py-1 text-[11px] font-black leading-none text-[color:var(--client-needo-text)] shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_18%,transparent)]",
                    cornerBadgeClassName
                  )}
                >
                  {cornerBadge}
                </div>
                )
            : null}
        </div>
      ) : null}

      <div className="grid grid-cols-[90px,1fr] gap-3">
        <div className="relative h-[90px] w-[90px] overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]">
          <img alt={imageAlt} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(image)} />
          {imageLabel ? (
            <div className={cn("absolute left-2 top-2 rounded-full px-2 py-1 text-[10px] font-black backdrop-blur-sm", toneClasses.imageLabel)}>
              {imageLabel}
            </div>
          ) : null}
        </div>

        <div className={cn("min-w-0 pt-0.5", hasTopRightMeta ? (hasTopRightBadges ? "pr-16" : "pr-10") : undefined)}>
          {eyebrow ? <p className={cn("text-[11px] font-black", toneClasses.eyebrow)}>{eyebrow}</p> : null}
          <div className="mt-1">
            <h3
              className={cn(
                "max-w-full overflow-hidden text-[20px] font-black leading-[1.24] tracking-[-0.03em] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]",
                toneClasses.title
              )}
              style={{ textWrap: "pretty" }}
            >
              {titlePrefix ? (
                <span className={cn("mr-2 inline text-[15px] font-black", toneClasses.titlePrefix)}>
                  {titlePrefix}
                </span>
              ) : null}
              <span>{title}</span>
            </h3>
            {resolvedTitleBadge && !useCornerTitleBadge ? (
              <span className="mt-2 inline-flex min-h-6 shrink-0 items-center rounded-full bg-[#ff5a32] px-2.5 py-0.5 text-[10px] font-black leading-none tracking-[0.02em] text-white">
                {resolvedTitleBadge}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {fields.length > 0 ? (
        <div className="mt-3 space-y-2">
          {fields.map((field, index) => (
            <div className="flex items-start gap-2.5" key={index}>
              <span className={cn("inline-flex shrink-0 rounded-[11px] px-3 py-1.5 text-[11px] font-black", toneClasses.chip)}>
                {field.label}
              </span>
              <div className={cn("min-w-0 flex-1 pt-1 text-[13px] font-semibold leading-5", toneClasses.fieldValue)}>{field.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {noteValue || normalizedTags.length > 0 ? (
        <div className={cn("mt-3 rounded-[18px] px-3.5 py-3", toneClasses.noteSurface)}>
          <div className={cn("text-[11px] font-black", toneClasses.noteLabel)}>{noteLabel}</div>
          {noteValue ? (
            typeof noteValue === "string" ? (
              <p className={cn("mt-2 whitespace-pre-wrap break-words text-[13px] font-semibold leading-6", toneClasses.noteValue)}>{noteValue}</p>
            ) : (
              <div className={cn("mt-2 text-[13px] font-semibold leading-6", toneClasses.noteValue)}>{noteValue}</div>
            )
          ) : null}
          {normalizedTags.length > 0 ? (
            <div aria-label="标签" className="mt-2 flex flex-wrap gap-1.5">
              {normalizedTags.map((tag) => (
                <span
                  className={cn(
                    "ui-badge inline-flex max-w-full items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] px-2.5 py-1 text-[11px] font-black leading-none shadow-[0_4px_12px_rgba(0,0,0,0.04)]",
                    toneClasses.chip
                  )}
                  key={tag}
                  title={tag}
                >
                  <span className="min-w-0 truncate">{tag}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {(expiryValue || expiryCountdown) ? (
        <div className={cn("mt-3 rounded-[18px] px-3.5 py-3", toneClasses.expirySurface)}>
          <div className="flex items-center justify-between gap-3">
            <span className={cn("text-[11px] font-black", toneClasses.expiryLabel)}>{expiryLabel}</span>
            {expiryCountdown ? (
              <span className={cn("text-[11px] font-semibold", toneClasses.expiryCountdown)}>{expiryCountdown}</span>
            ) : null}
          </div>
          {expiryValue ? <div className={cn("mt-1.5 text-[13px] font-semibold", toneClasses.noteValue)}>{expiryValue}</div> : null}
        </div>
      ) : null}

      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}
