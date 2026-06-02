import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { KycVerifiedBadge } from "../../components/ui/KycVerifiedBadge";
import {
  getServiceReviewStampVisual,
  serviceReviewSpecialTags,
  splitMaxReviewStampLabel
} from "../order-detail/serviceReviewTagCatalog";
import { cn } from "../../lib/utils";
import type { ServicePaymentMethod, Technician } from "../../types/domain";

const paymentMethodLabels: Record<ServicePaymentMethod, string> = {
  platform: "平台支付",
  offline: "线下支付",
  prepay: "需要预付",
  cash: "现金支付",
  paypay: "PayPay",
  paypal: "PayPal",
  wechatpay: "WeChat Pay",
  alipay: "Alipay"
};

export type TechnicianPublicInfoCardThemeScope = "user" | "merchant" | "technician";

const publicInfoCardSurface = {
  shell:
    "border-[color:color-mix(in_srgb,var(--profile-card-primary)_42%,var(--profile-card-line)_58%)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--profile-card-surface)_84%,var(--profile-card-primary)_16%),color-mix(in_srgb,var(--profile-card-bg)_92%,var(--profile-card-primary)_8%))] text-[color:var(--profile-card-text)] shadow-[var(--profile-card-shadow)]",
  panel:
    "border-[color:color-mix(in_srgb,var(--profile-card-primary)_30%,var(--profile-card-line)_70%)] bg-[color:color-mix(in_srgb,var(--profile-card-elevated)_86%,var(--profile-card-bg)_14%)]",
  metric:
    "border-[color:color-mix(in_srgb,var(--profile-card-primary)_34%,var(--profile-card-line)_66%)] bg-[color:color-mix(in_srgb,var(--profile-card-surface)_72%,transparent)]",
  chip:
    "border-[color:color-mix(in_srgb,var(--profile-card-primary)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--profile-card-primary)_16%,transparent)] text-[color:var(--profile-card-primary-strong)]",
  label: "text-[color:var(--profile-card-muted)]",
  muted: "text-[color:var(--profile-card-muted)]",
  accent: "text-[color:var(--profile-card-primary-strong)]",
  avatar:
    "border-[color:color-mix(in_srgb,var(--profile-card-primary)_48%,var(--profile-card-line))] ring-1 ring-[color:color-mix(in_srgb,var(--profile-card-primary)_24%,transparent)]",
  divider: "bg-[color:color-mix(in_srgb,var(--profile-card-primary)_30%,transparent)]"
};

function getTechnicianPublicInfoCardThemeStyle(themeScope: TechnicianPublicInfoCardThemeScope): CSSProperties {
  const primary =
    themeScope === "technician"
      ? "var(--technician-status-duty, var(--client-primary, var(--admin-accent, #367a71)))"
      : themeScope === "merchant"
        ? "var(--client-primary, var(--admin-accent, #367a71))"
        : "var(--client-primary, #367a71)";
  const primaryStrong =
    themeScope === "technician"
      ? "var(--technician-status-duty-strong, var(--client-primary-strong, var(--admin-accent-strong, #245a53)))"
      : themeScope === "merchant"
        ? "var(--client-primary-strong, var(--admin-accent-strong, #245a53))"
        : "var(--client-primary-strong, #245a53)";

  return {
    "--profile-card-bg": "var(--client-bg, var(--admin-bg, #ffffff))",
    "--profile-card-elevated": "var(--client-elevated, var(--admin-elevated, #ffffff))",
    "--profile-card-line": "var(--client-line, var(--admin-line, rgba(22, 54, 48, 0.14)))",
    "--profile-card-muted": "var(--client-muted, var(--admin-muted, rgba(22, 54, 48, 0.68)))",
    "--profile-card-primary": primary,
    "--profile-card-primary-strong": primaryStrong,
    "--profile-card-shadow": "var(--client-shadow, 0 24px 58px rgba(21, 57, 51, 0.18))",
    "--profile-card-surface": "var(--client-surface, var(--admin-surface, #ffffff))",
    "--profile-card-text": "var(--client-text, var(--admin-text, #163630))",
    "--profile-card-backdrop": "color-mix(in srgb, var(--profile-card-bg) 24%, rgba(0, 0, 0, 0.72))"
  } as CSSProperties;
}

function formatTechnicianHeightValue(value?: string) {
  return value?.trim().replace(/\s*(cm|厘米|センチ|㎝)$/i, "").trim() ?? "";
}

function formatTechnicianRating(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : "5.0";
}

function getTechnicianIdentityDisplayLabel(label?: Technician["identityLabel"]) {
  if (label === "店铺所属技师") {
    return "店铺所属";
  }

  return label ?? "个人技师";
}

function formatPaymentMethodLabels(paymentMethods?: ServicePaymentMethod[]) {
  const labels = paymentMethods?.map((method) => paymentMethodLabels[method]).filter(Boolean) ?? [];
  return labels.length > 0 ? labels.join("、") : "未设置";
}

function renderTechnicianReviewStampLabel(label: string) {
  const labelParts = splitMaxReviewStampLabel(label);

  if (!labelParts.marker) {
    return <span>{label}</span>;
  }

  return (
    <>
      <span className="block text-[11px] leading-[1.05] tracking-normal sm:text-[12px]">{labelParts.title}</span>
      <span className="mt-0.5 block text-[17px] leading-[0.92] tracking-normal sm:text-[18px]">{labelParts.marker}</span>
    </>
  );
}

export function TechnicianReviewStampList({ className }: { className?: string }) {
  return (
    <div aria-label="评价特殊标签" className={cn("social-profile-review-stamps grid grid-cols-4 gap-2 px-0.5 pt-2", className)} role="list">
      {serviceReviewSpecialTags.map((tag, index) => {
        const stampVisual = getServiceReviewStampVisual(tag, index);

        return (
          <div
            aria-label={`${tag.label} ×${tag.count}`}
            className={cn("service-review-stamp min-w-0", `service-review-stamp--${stampVisual.tone}`)}
            key={tag.label}
            role="listitem"
          >
            <span className="service-review-stamp__icon">
              <img alt="" aria-hidden="true" draggable={false} src={stampVisual.iconSrc} />
            </span>
            <span className="service-review-stamp__label">{renderTechnicianReviewStampLabel(tag.label)}</span>
            <span className="service-review-stamp__count">×{tag.count}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TechnicianPublicInfoCard({
  className,
  dynamicTo,
  onClose,
  technician,
  themeScope = "user"
}: {
  className?: string;
  dynamicTo: string;
  onClose?: () => void;
  technician: Technician;
  themeScope?: TechnicianPublicInfoCardThemeScope;
}) {
  const surface = publicInfoCardSurface;
  const themeStyle = getTechnicianPublicInfoCardThemeStyle(themeScope);
  const technicianInfoTags = (technician.profileTags?.length ? technician.profileTags : technician.skills).filter(Boolean);
  const displayName = technician.nickname?.trim() || technician.name;
  const rating = formatTechnicianRating(technician.rating);
  const reviewCount = Math.max(0, technician.reviewCount);
  const actionButtonClassName = cn("focus-ring grid h-11 w-11 place-items-center rounded-full border text-[color:var(--profile-card-primary-strong)] shadow-[0_14px_30px_color-mix(in_srgb,var(--profile-card-primary)_18%,rgba(0,0,0,0.26))]", surface.metric);

  return (
    <section
      className={cn("relative overflow-visible rounded-[28px] border p-4", surface.shell, className)}
      data-theme-scope={themeScope}
      data-testid="technician-public-info-card"
      style={themeStyle}
    >
      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
        {onClose ? (
          <button aria-label="关闭技师信息卡" className={actionButtonClassName} onClick={onClose} type="button">
            <AppIcon className="h-5 w-5" name="close" />
          </button>
        ) : null}
        <Link aria-label={`查看${displayName}动态页`} className={actionButtonClassName} to={dynamicTo}>
          <AppIcon className="h-5 w-5" name="moments" />
        </Link>
      </div>

      <div className="flex min-w-0 items-start gap-3">
        <AvatarImage
          alt={displayName}
          className={cn("h-36 w-36 shrink-0 rounded-[28px] border-[3px] shadow-[0_18px_36px_rgba(0,0,0,0.28)]", surface.avatar)}
          src={technician.avatar}
        />
        <div className="flex h-36 min-w-0 flex-1 flex-col">
          <h2 className="max-w-[calc(100%-44px)] overflow-hidden break-all text-[21px] font-black leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [overflow-wrap:anywhere]">
            {displayName}
            <KycVerifiedBadge className="ml-1 inline-flex align-middle" size="label" />
          </h2>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
            <span className={cn("inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-black", surface.chip)}>
              {getTechnicianIdentityDisplayLabel(technician.identityLabel)}
            </span>
          </div>
          <p className={cn("truncate text-xs font-bold", surface.muted)}>ID：{technician.systemId}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className={cn("rounded-[18px] border p-2.5", surface.metric)}>
          <p className={cn("text-xs font-bold", surface.label)}>完成订单</p>
          <strong className="mt-1 block truncate text-[20px] leading-none">{technician.orderCount.toLocaleString("ja-JP")}</strong>
        </div>
        <div className={cn("rounded-[18px] border p-2.5", surface.metric)}>
          <p className={cn("text-xs font-bold", surface.label)}>服务评分</p>
          <div className="mt-1 flex min-w-0 items-end gap-1">
            <strong className={cn("block truncate text-[20px] leading-none", surface.accent)}>{rating}</strong>
            <span className={cn("pb-0.5 text-xs font-black leading-none", surface.muted)}>/5</span>
          </div>
          <p className={cn("mt-2 truncate text-[10px] font-black leading-none", surface.muted)}>{reviewCount.toLocaleString("ja-JP")} 人评价</p>
        </div>
      </div>

      <div className={cn("my-4 h-px", surface.divider)} />

      <div>
        <h2 className="text-lg font-black">基础信息</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            ["身份", getTechnicianIdentityDisplayLabel(technician.identityLabel)],
            ["年龄", technician.age || "未设置"],
            ["身高（cm）", formatTechnicianHeightValue(technician.height) || "未设置"]
          ].map(([label, value]) => (
            <div className={cn("rounded-[18px] border p-3", surface.panel)} key={label}>
              <p className={cn("text-xs font-bold", surface.label)}>{label}</p>
              <strong className="mt-1 block truncate text-sm">{value}</strong>
            </div>
          ))}
        </div>

        <div className={cn("mt-3 rounded-[18px] border p-3", surface.panel)}>
          <p className={cn("text-xs font-bold", surface.label)}>语言能力</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {technician.languages.length > 0 ? (
              technician.languages.map((language) => (
                <span className={cn("rounded-full border px-2.5 py-1 text-xs font-black", surface.chip)} key={language}>
                  {language}
                </span>
              ))
            ) : (
              <span className={cn("text-sm font-bold", surface.muted)}>未设置</span>
            )}
          </div>
        </div>

        <div className={cn("mt-3 rounded-[18px] border p-3", surface.panel)}>
          <p className={cn("text-xs font-bold", surface.label)}>支持支付方式</p>
          <p className={cn("mt-2 text-sm font-bold leading-6", surface.muted)}>
            {formatPaymentMethodLabels(technician.paymentMethods)}
          </p>
        </div>

        {technician.bio ? (
          <div className={cn("mt-3 overflow-hidden rounded-[24px] border px-5 py-4", surface.panel)}>
            <p className={cn("text-xs font-bold", surface.label)}>自我介绍</p>
            <p className={cn("mt-2 text-sm leading-6", surface.muted)}>{technician.bio}</p>
          </div>
        ) : null}

        <div className={cn("mt-3 rounded-[18px] border p-3", surface.panel)} data-testid="technician-info-special-tags">
          <p className={cn("text-xs font-bold", surface.label)}>特殊标签</p>
          <TechnicianReviewStampList className="mt-2" />
        </div>

        <div className={cn("mt-3 rounded-[18px] border p-3", surface.panel)} data-testid="technician-info-tags">
          <p className={cn("text-xs font-bold", surface.label)}>标签</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {technicianInfoTags.length > 0 ? (
              technicianInfoTags.map((tag) => (
                <span className={cn("rounded-full border px-2.5 py-1 text-xs font-black", surface.chip)} key={tag}>
                  {tag}
                </span>
              ))
            ) : (
              <span className={cn("text-sm font-bold", surface.muted)}>未设置</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function TechnicianPublicInfoCardModal({
  dynamicTo,
  onClose,
  open,
  technician,
  themeScope = "user"
}: {
  dynamicTo: string;
  onClose: () => void;
  open: boolean;
  technician?: Technician | null;
  themeScope?: TechnicianPublicInfoCardThemeScope;
}) {
  if (!open || !technician) {
    return null;
  }

  const themeStyle = getTechnicianPublicInfoCardThemeStyle(themeScope);

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[130] flex items-center justify-center bg-[color:var(--profile-card-backdrop)] px-4 py-[max(18px,env(safe-area-inset-top))] pb-[max(18px,env(safe-area-inset-bottom))] text-[color:var(--profile-card-text)] backdrop-blur-md"
      data-theme-scope={themeScope}
      onClick={onClose}
      role="dialog"
      style={themeStyle}
    >
      <div className="relative max-h-full w-full max-w-[430px] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
        <TechnicianPublicInfoCard dynamicTo={dynamicTo} onClose={onClose} technician={technician} themeScope={themeScope} />
      </div>
    </div>
  );
}
