import { useState, type ReactNode } from "react";
import { KycVerifiedBadge } from "../../components/ui/KycVerifiedBadge";
import { copyTextToClipboard } from "../../lib/share";
import { cn } from "../../lib/utils";
import {
  getServiceReviewStampVisual,
  splitMaxReviewStampLabel
} from "../order-detail/serviceReviewTagCatalog";
import { UnifiedServiceInfoCard, type UnifiedServiceInfoCardData } from "../service-card";
import type { TechnicianProfileInfoModel } from "./model";

type TechnicianProfileInfoViewProps = {
  className?: string;
  model: TechnicianProfileInfoModel;
  privacySlot?: ReactNode;
  serviceAction?: (service: UnifiedServiceInfoCardData, index: number) => ReactNode;
};

const panelClassName = "rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,var(--client-primary)_12%)] bg-[color:color-mix(in_srgb,var(--client-elevated)_70%,transparent)]";
const mutedClassName = "text-[color:var(--client-muted)]";
const fixedReviewStampFallbacks = [
  { code: "appeal_max", label: "魅力max", tone: "appeal" },
  { code: "service_max", label: "服务max", tone: "service" },
  { code: "emotion_max", label: "情绪max", tone: "empathy" },
  { code: "energy_max", label: "元气max", tone: "energy" }
] as const;

function genderLabel(gender: TechnicianProfileInfoModel["gender"]) {
  if (gender === "female") return "女性";
  if (gender === "male") return "男性";
  return "未公开";
}

function formatRating(value: number | null) {
  return value === null ? "未读取" : `${value.toFixed(1)}/5`;
}

function ReviewStampLabel({ label }: { label: string }) {
  const parts = splitMaxReviewStampLabel(label);

  return parts.marker ? (
    <span className="leading-none"><span>{parts.title}</span><span className="font-black">{parts.marker}</span></span>
  ) : <span>{label}</span>;
}

export function TechnicianReviewTagSummaryView({ model }: { model: TechnicianProfileInfoModel }) {
  const fixedTags = new Map(model.reviewTagSummary.special.map((tag) => [tag.code, tag] as const));

  return (
    <>
      <section className={cn(panelClassName, "p-3")} data-testid="technician-info-special-tags">
        <p className={cn("text-xs font-bold", mutedClassName)}>特殊标签</p>
        <div aria-label="评价特殊标签" className="social-profile-review-stamps mt-2 grid grid-cols-4 gap-1 px-0.5 pt-1.5" role="list">
          {fixedReviewStampFallbacks.map((fallback, index) => {
            const tag = fixedTags.get(fallback.code);
            const visual = getServiceReviewStampVisual(fallback, index);
            const count = tag?.count ?? 0;

            return (
              <div
                aria-label={`${fallback.label} ×${count}`}
                className={cn("service-review-stamp min-w-0", `service-review-stamp--${visual.tone}`)}
                key={fallback.code}
                role="listitem"
              >
                <span className="service-review-stamp__icon"><img alt="" aria-hidden="true" draggable={false} src={visual.iconSrc} /></span>
                <span className="service-review-stamp__label"><ReviewStampLabel label={fallback.label} /></span>
                <span className="service-review-stamp__count">×{count}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className={cn(panelClassName, "p-3")} data-testid="technician-info-tags">
        <p className={cn("text-xs font-bold", mutedClassName)}>标签</p>
        <div className="mt-2 flex min-h-7 flex-wrap gap-1.5">
          {model.reviewTagSummary.custom.length > 0 ? model.reviewTagSummary.custom.map((tag) => (
            <span
              className="rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_42%,var(--client-line))] bg-[color:var(--client-primary-soft)] px-2.5 py-1 text-xs font-black text-[color:var(--client-primary)]"
              key={tag.label}
            >
              {tag.label}{tag.count > 1 ? ` ×${tag.count}` : ""}
            </span>
          )) : <span className={cn("text-sm font-bold", mutedClassName)}>暂无标签</span>}
        </div>
      </section>
    </>
  );
}

export function TechnicianProfileInfoView({ className, model, privacySlot, serviceAction }: TechnicianProfileInfoViewProps) {
  const [copyStatus, setCopyStatus] = useState<"" | "copied" | "failed">("");
  const copyNeedoId = async () => {
    setCopyStatus(await copyTextToClipboard(model.publicId) ? "copied" : "failed");
  };

  return (
    <div className={cn("space-y-4", className)} data-testid="technician-profile-info-view">
      <section className="overflow-visible rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,var(--client-primary)_18%)] bg-[color:var(--client-surface)] p-4 text-[color:var(--client-text)] shadow-panel">
        <header className="flex min-w-0 items-start gap-3">
          {model.avatarUrl ? (
            <img alt={model.displayName} className="h-32 w-32 shrink-0 rounded-[26px] border-[3px] border-[color:color-mix(in_srgb,var(--client-primary)_48%,var(--client-line))] object-cover shadow-soft" src={model.avatarUrl} />
          ) : (
            <div aria-label={`${model.displayName} 暂无公开照片`} className="grid h-32 w-32 shrink-0 place-items-center rounded-[26px] border-[3px] border-[color:color-mix(in_srgb,var(--client-primary)_48%,var(--client-line))] bg-[color:var(--client-elevated)] text-4xl font-black text-[color:var(--client-muted)]" role="img">
              {Array.from(model.displayName)[0] ?? "·"}
            </div>
          )}
          <div className="min-w-0 flex-1 pt-1">
            <h1 className="text-[21px] font-black leading-7">{model.displayName} <KycVerifiedBadge className="inline-flex align-middle" size="label" /></h1>
            <span className="mt-2 inline-flex rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_45%,var(--client-line))] bg-[color:var(--client-primary-soft)] px-2.5 py-1 text-[11px] font-black text-[color:var(--client-primary)]">{model.identityLabel}</span>
            <button aria-label="复制 NeeDo ID" className={cn("mt-2 block max-w-full cursor-copy truncate text-left text-xs font-bold", mutedClassName)} onClick={() => void copyNeedoId()} type="button">ID：{model.publicId}</button>
            {copyStatus ? <p aria-live="polite" className={cn("mt-1 text-xs font-bold", mutedClassName)} role="status">{copyStatus === "copied" ? "已复制" : "复制失败，请手动复制"}</p> : null}
          </div>
        </header>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className={cn(panelClassName, "min-w-0 p-3")}><p className={cn("text-[11px] font-bold", mutedClassName)}>从业年数</p><strong className="mt-1 block truncate text-lg">{model.yearsExperience} 年</strong></div>
          <div className={cn(panelClassName, "min-w-0 p-3")}><p className={cn("text-[11px] font-bold", mutedClassName)}>接单率</p><strong className="mt-1 block truncate text-lg">{model.acceptanceRatePercent === null ? "未读取" : `${model.acceptanceRatePercent}%`}</strong></div>
          <div className={cn(panelClassName, "min-w-0 p-3")}><p className={cn("text-[11px] font-bold", mutedClassName)}>评价</p><strong className="mt-1 block truncate text-lg">{formatRating(model.ratingAverage)}</strong><span className={cn("mt-1 block truncate text-[10px] font-bold", mutedClassName)}>{model.reviewCount === null ? "未读取" : `${model.reviewCount} 次`}</span></div>
        </div>
        <div className={cn(panelClassName, "mt-2 p-3")} data-testid="technician-profile-completed-orders">
          <p className={cn("text-[11px] font-bold", mutedClassName)}>完成订单数</p>
          <strong className="mt-1 block text-xl">{model.completedOrderCount === null ? "未读取" : model.completedOrderCount.toLocaleString("ja-JP")}</strong>
        </div>

        <div className="my-4 h-px bg-[color:var(--client-line)]" />
        <h2 className="text-lg font-black">基础信息</h2>
        <div className="mt-3 space-y-3">
          <section className={cn(panelClassName, "grid grid-cols-3 divide-x divide-[color:var(--client-line)] p-3")}>
            <div className="min-w-0 pr-2"><p className={cn("text-xs font-bold", mutedClassName)}>性别</p><strong className="mt-1 block truncate text-sm">{genderLabel(model.gender)}</strong></div>
            <div className="min-w-0 px-2"><p className={cn("text-xs font-bold", mutedClassName)}>年龄</p><strong className="mt-1 block truncate text-sm">{model.age ?? "未设置"}</strong></div>
            <div className="min-w-0 pl-2"><p className={cn("text-xs font-bold", mutedClassName)}>身高</p><strong className="mt-1 block truncate text-sm">{model.heightCm === null ? "未设置" : `${model.heightCm}cm`}</strong></div>
          </section>

          <section className={cn(panelClassName, "p-3")}>
            <p className={cn("text-xs font-bold", mutedClassName)}>语言能力</p>
            <div className="mt-2 flex min-h-7 flex-wrap gap-1.5">
              {model.languages.length > 0 ? model.languages.map((language) => <span className="rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_42%,var(--client-line))] bg-[color:var(--client-primary-soft)] px-2.5 py-1 text-xs font-black text-[color:var(--client-primary)]" key={language}>{language}</span>) : <span className={cn("text-sm font-bold", mutedClassName)}>未设置</span>}
            </div>
          </section>

          <section className={cn(panelClassName, "p-3")}>
            <p className={cn("text-xs font-bold", mutedClassName)}>自我介绍</p>
            <p className={cn("mt-2 whitespace-pre-wrap text-sm font-bold leading-6", mutedClassName)}>{model.bio ?? "暂无简介"}</p>
          </section>

          <TechnicianReviewTagSummaryView model={model} />
          {privacySlot}
        </div>
      </section>

      <section className="space-y-3" data-testid="technician-profile-services">
        <h2 className="px-1 text-lg font-black text-[color:var(--client-text)]">服务信息</h2>
        {model.services.length > 0 ? model.services.map((service, index) => (
          <UnifiedServiceInfoCard actionSlot={serviceAction?.(service, index)} data={service} key={service.id} />
        )) : <p className={cn("px-1 text-sm font-bold", mutedClassName)}>暂无服务信息</p>}
      </section>
    </div>
  );
}
