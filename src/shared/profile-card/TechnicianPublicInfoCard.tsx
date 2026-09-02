import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { KycVerifiedBadge } from "../../components/ui/KycVerifiedBadge";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import {
  getServiceReviewStampVisual,
  serviceReviewSpecialTags,
  splitMaxReviewStampLabel
} from "../order-detail/serviceReviewTagCatalog";
import { cn } from "../../lib/utils";
import type { ServicePaymentMethod, Technician } from "../../types/domain";
import type { TechnicianFormalContactCardData } from "./types";

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

const formalContactCardTranslations = {
  "未设置接单预算": { "zh-Hant": "未設定接單預算", ja: "受付予算は未設定です", en: "Booking budget not set", ko: "접수 예산이 설정되지 않았습니다" },
  "未设置支付方式": { "zh-Hant": "未設定付款方式", ja: "支払い方法は未設定です", en: "Payment methods not set", ko: "결제 수단이 설정되지 않았습니다" },
  "暂无特殊标签": { "zh-Hant": "暫無特殊標籤", ja: "特別タグはありません", en: "No special tags", ko: "특수 태그가 없습니다" },
  "暂无标签": { "zh-Hant": "暫無標籤", ja: "タグがありません", en: "No tags", ko: "태그가 없습니다" },
  "暂无服务信息": { "zh-Hant": "暫無服務資訊", ja: "サービス情報はありません", en: "No service information", ko: "서비스 정보가 없습니다" },
  "分钟（含税）": { "zh-Hant": "分鐘（含稅）", ja: "分（税込）", en: "minutes (tax included)", ko: "분(세금 포함)" }
} as const;

export function translateTechnicianContactCardText(
  source: keyof typeof formalContactCardTranslations,
  language: Language,
) {
  return language === "zh"
    ? source
    : formalContactCardTranslations[source][language];
}

export type TechnicianPublicInfoCardThemeScope = "user" | "merchant" | "technician";

const publicInfoCardSurface = {
  shell:
    "border-[color:color-mix(in_srgb,var(--profile-card-primary)_30%,var(--profile-card-line))] bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--profile-card-primary)_22%,transparent),transparent_34%),linear-gradient(145deg,color-mix(in_srgb,var(--profile-card-surface)_90%,var(--profile-card-bg)),color-mix(in_srgb,var(--profile-card-bg)_94%,black))] text-[color:var(--profile-card-text)] shadow-[var(--profile-card-shadow)]",
  panel:
    "border-[color:color-mix(in_srgb,var(--profile-card-line)_72%,var(--profile-card-primary)_14%)] bg-[color:color-mix(in_srgb,var(--profile-card-elevated)_58%,var(--profile-card-bg)_42%)]",
  metric:
    "border-[color:color-mix(in_srgb,var(--profile-card-line)_70%,var(--profile-card-primary)_16%)] bg-[color:color-mix(in_srgb,var(--profile-card-elevated)_50%,transparent)]",
  chip:
    "border-[color:color-mix(in_srgb,var(--profile-card-primary)_48%,var(--profile-card-line))] bg-[color:var(--profile-card-primary-soft)] text-[color:var(--profile-card-primary-strong)]",
  label: "text-[color:var(--profile-card-soft-muted)]",
  muted: "text-[color:var(--profile-card-muted)]",
  accent: "text-[color:var(--profile-card-primary-strong)]",
  avatar:
    "border-[color:color-mix(in_srgb,var(--profile-card-primary)_48%,var(--profile-card-line))] ring-1 ring-[color:color-mix(in_srgb,var(--profile-card-primary)_24%,transparent)]",
  divider: "bg-[color:color-mix(in_srgb,var(--profile-card-line)_70%,var(--profile-card-primary)_18%)]"
};

function getTechnicianPublicInfoCardThemeStyle(): CSSProperties {
  return {
    "--profile-card-bg": "var(--client-bg, var(--admin-bg, #ffffff))",
    "--profile-card-elevated": "var(--client-elevated, var(--admin-elevated, #ffffff))",
    "--profile-card-line": "var(--client-line, var(--admin-line, rgba(22, 54, 48, 0.14)))",
    "--profile-card-muted": "var(--client-muted, var(--admin-muted, rgba(22, 54, 48, 0.68)))",
    "--profile-card-soft-muted": "var(--client-soft-muted, color-mix(in srgb, var(--profile-card-muted) 64%, transparent))",
    "--profile-card-primary": "var(--client-primary, var(--admin-accent, #367a71))",
    "--profile-card-primary-soft": "var(--client-primary-soft, color-mix(in srgb, var(--profile-card-primary) 14%, transparent))",
    "--profile-card-primary-strong": "var(--client-primary-strong, var(--admin-accent-strong, #245a53))",
    "--profile-card-shadow": "var(--client-shadow, 0 24px 58px rgba(21, 57, 51, 0.18))",
    "--profile-card-surface": "var(--client-surface, var(--admin-surface, #ffffff))",
    "--profile-card-text": "var(--client-text, var(--admin-text, #163630))",
    "--profile-card-backdrop": "color-mix(in srgb, var(--profile-card-bg) 24%, rgba(0, 0, 0, 0.72))"
  } as CSSProperties;
}

function formatTechnicianHeightValue(value?: string) {
  return value?.trim().replace(/\s*(cm|厘米|センチ|㎝)$/i, "").trim() ?? "";
}

function formatTechnicianRating(value: number | string) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(1) : "—";
}

function getTechnicianIdentityDisplayLabel(label?: Technician["identityLabel"]) {
  if (label === "店铺所属技师") {
    return "店铺所属";
  }

  return label ?? "个人技师";
}

function formatPaymentMethodLabels(paymentMethods: string[]) {
  return paymentMethods
    .map((method) => paymentMethodLabels[method as ServicePaymentMethod] ?? method)
    .join("、");
}

function formatAcceptanceRate(value: number) {
  const percent = value / 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)}%`;
}

function formatJpy(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
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
  formalData,
  hideUnavailableFields = false,
  onClose,
  technician,
  themeScope = "user"
}: {
  className?: string;
  dynamicTo?: string;
  formalData?: TechnicianFormalContactCardData;
  hideUnavailableFields?: boolean;
  onClose?: () => void;
  technician: Technician;
  themeScope?: TechnicianPublicInfoCardThemeScope;
}) {
  const surface = publicInfoCardSurface;
  const { language } = useOptionalI18n();
  const tf = (source: keyof typeof formalContactCardTranslations) =>
    translateTechnicianContactCardText(source, language);
  const themeStyle = getTechnicianPublicInfoCardThemeStyle();
  const displayName = technician.nickname?.trim() || technician.name;
  const introductionText = technician.bio?.trim() || "这个技师暂时还没有补充介绍。";
  const details = formalData?.contactDetails;
  const completedOrderCount = formalData?.metrics.completedOrderCount ?? technician.orderCount;
  const rating = formatTechnicianRating(formalData?.metrics.ratingAverage ?? technician.rating);
  const reviewCount = Math.max(0, formalData?.metrics.reviewCount ?? technician.reviewCount);
  const basicInfoItems = [
    ["身份", getTechnicianIdentityDisplayLabel(technician.identityLabel)],
    ...(hideUnavailableFields && !technician.age ? [] : [["年龄", technician.age || "未设置"]]),
    ...(hideUnavailableFields && !formatTechnicianHeightValue(technician.height)
      ? []
      : [["身高（cm）", formatTechnicianHeightValue(technician.height) || "未设置"]])
  ];
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
        {dynamicTo ? (
          <Link aria-label={`查看${displayName}动态页`} className={actionButtonClassName} to={dynamicTo}>
            <AppIcon className="h-5 w-5" name="moments" />
          </Link>
        ) : null}
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
            {!hideUnavailableFields ? <KycVerifiedBadge className="ml-1 inline-flex align-middle" size="label" /> : null}
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
          <strong className="mt-1 block truncate text-[20px] leading-none">{completedOrderCount.toLocaleString("ja-JP")}</strong>
        </div>
        <div className={cn("rounded-[18px] border p-2.5", surface.metric)}>
          <div className={cn("grid min-w-0", formalData ? "grid-cols-[1fr_auto_1fr] gap-2" : "grid-cols-1")}>
            <div className="min-w-0">
              <p className={cn("text-xs font-bold", surface.label)}>服务评分</p>
              <div className="mt-1 flex min-w-0 items-end gap-1">
                <strong className={cn("block truncate text-[20px] leading-none", surface.accent)}>{rating}</strong>
                <span className={cn("pb-0.5 text-xs font-black leading-none", surface.muted)}>/5</span>
              </div>
              <p className={cn("mt-2 truncate text-[10px] font-black leading-none", surface.muted)}>{reviewCount.toLocaleString("ja-JP")} 人评价</p>
            </div>
            {formalData ? (
              <>
                <div className={cn("w-px", surface.divider)} />
                <div className="min-w-0">
                  <p className={cn("text-xs font-bold", surface.label)}>接单率</p>
                  <strong className={cn("mt-1 block truncate text-[20px] leading-none", surface.accent)}>
                    {formatAcceptanceRate(formalData.metrics.acceptanceRateBps)}
                  </strong>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className={cn("my-4 h-px", surface.divider)} />

      <div>
        <h2 className="text-lg font-black">基础信息</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {basicInfoItems.map(([label, value]) => (
            <div className={cn("rounded-[18px] border p-3", surface.panel)} key={label}>
              <p className={cn("text-xs font-bold", surface.label)}>{label}</p>
              <strong className="mt-1 block truncate text-sm">{value}</strong>
            </div>
          ))}
        </div>

        {!hideUnavailableFields || technician.languages.length > 0 ? <div className={cn("mt-3 rounded-[18px] border p-3", surface.panel)}>
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
        </div> : null}

        {details ? (
          <>
            {!hideUnavailableFields || details.bidBudgetMinJpy !== null || details.bidBudgetMaxJpy !== null ? <div className={cn("mt-3 rounded-[18px] border p-3", surface.panel)}>
              <p className={cn("text-xs font-bold", surface.label)}>接单预算</p>
              <p className={cn("mt-2 text-sm font-bold leading-6", surface.muted)}>
                {details.bidBudgetMinJpy === null && details.bidBudgetMaxJpy === null
                  ? tf("未设置接单预算")
                  : `${details.bidBudgetMinJpy === null ? "—" : formatJpy(details.bidBudgetMinJpy)} - ${details.bidBudgetMaxJpy === null ? "—" : formatJpy(details.bidBudgetMaxJpy)}`}
              </p>
            </div> : null}

            {!hideUnavailableFields || details.paymentMethods.length > 0 ? <div className={cn("mt-3 rounded-[18px] border p-3", surface.panel)}>
              <p className={cn("text-xs font-bold", surface.label)}>支持支付方式</p>
              <p className={cn("mt-2 text-sm font-bold leading-6", surface.muted)}>
                {details.paymentMethods.length > 0
                  ? formatPaymentMethodLabels(details.paymentMethods)
                  : tf("未设置支付方式")}
              </p>
            </div> : null}
          </>
        ) : null}

        {!hideUnavailableFields || Boolean(technician.bio?.trim()) ? <div className={cn("mt-3 overflow-hidden rounded-[24px] border px-5 py-4", surface.panel)}>
          <p className={cn("text-xs font-bold", surface.label)}>自我介绍</p>
          <p className={cn("mt-2 text-sm leading-6", surface.muted)}>{introductionText}</p>
        </div> : null}

        {details ? (
          <>
            {!hideUnavailableFields || details.specialTags.length > 0 ? <div className={cn("mt-3 rounded-[18px] border p-3", surface.panel)} data-testid="technician-info-special-tags">
              <p className={cn("text-xs font-bold", surface.label)}>特殊标签</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {details.specialTags.length > 0 ? details.specialTags.map((tag) => (
                  <span className={cn("rounded-full border px-2.5 py-1 text-xs font-black", surface.chip)} key={tag}>{tag}</span>
                )) : <span className={cn("text-sm font-bold", surface.muted)}>{tf("暂无特殊标签")}</span>}
              </div>
            </div> : null}

            {!hideUnavailableFields || details.profileTags.length > 0 ? <div className={cn("mt-3 rounded-[18px] border p-3", surface.panel)} data-testid="technician-info-tags">
              <p className={cn("text-xs font-bold", surface.label)}>标签</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {details.profileTags.length > 0 ? details.profileTags.map((tag) => (
                  <span className={cn("rounded-full border px-2.5 py-1 text-xs font-black", surface.chip)} key={tag}>{tag}</span>
                )) : <span className={cn("text-sm font-bold", surface.muted)}>{tf("暂无标签")}</span>}
              </div>
            </div> : null}

            {!hideUnavailableFields || details.services.length > 0 ? <div className={cn("mt-3 rounded-[18px] border p-3", surface.panel)} data-testid="technician-info-services">
              <p className={cn("text-xs font-bold", surface.label)}>服务信息</p>
              {details.services.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {details.services.map((service) => (
                    <article className={cn("rounded-[16px] border p-3", surface.metric)} key={service.id}>
                      <strong className="block text-sm">{service.name}</strong>
                      <p className={cn("mt-1 text-xs font-bold", surface.muted)}>
                        {formatJpy(service.priceAmount)} / {service.durationMinutes} {tf("分钟（含税）")}
                      </p>
                    </article>
                  ))}
                </div>
              ) : <p className={cn("mt-2 text-sm font-bold", surface.muted)}>{tf("暂无服务信息")}</p>}
            </div> : null}
          </>
        ) : null}
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

  const themeStyle = getTechnicianPublicInfoCardThemeStyle();

  const modal = (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[180] flex items-center justify-center bg-[color:var(--profile-card-backdrop)] px-4 py-[max(18px,env(safe-area-inset-top))] pb-[max(18px,env(safe-area-inset-bottom))] text-[color:var(--profile-card-text)] backdrop-blur-md"
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

  if (typeof document === "undefined") {
    return modal;
  }

  const portalTarget = document.querySelector<HTMLElement>(".client-shell") ?? document.body;

  return createPortal(modal, portalTarget);
}
