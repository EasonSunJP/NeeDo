import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppIcon, floatingHeaderControlButtonClassName, type IconName } from "../../components/client-ui/AppScaffold";
import { MobileFullscreenCloseButton, MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { SectionTitle } from "../../components/mobile/SectionTitle";
import { ServiceFlowSection, mobileDetailCardClassName, mobileDetailInnerCardClassName } from "../../components/mobile/ServiceFlowSection";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { HighlightedTagText } from "../../components/ui/HighlightedTagText";
import {
  coreReadApi,
  coreReadIdFromRoute,
  mapCoreServiceToServiceItem,
  mapCoreTechnicianToTechnician,
  type CoreServiceReview
} from "../../features/core-read/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { cn, yen } from "../../lib/utils";
import { getTechnicianDynamicPath } from "../../shared/profile-card";
import type { ServiceItem, Technician } from "../../types/domain";

const servicePriceHighlightClassName = "text-[color:var(--client-primary)]";

export function buildServiceTagLabels(serviceAreas: string[], tags: string[]) {
  return Array.from(new Set([...serviceAreas, ...tags])).slice(0, 12);
}

export function formatServiceReviewDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
}

export function ServiceReviewCard({ review }: { review: CoreServiceReview }) {
  const reviewerInitial = review.reviewer.displayName.trim().slice(0, 1) || "用";

  return (
    <article className="flex items-start gap-3">
      {review.reviewer.avatarUrl ? (
        <AvatarImage
          alt={review.reviewer.displayName}
          className="h-11 w-11 shrink-0 !rounded-[14px] border border-[color:var(--client-line)]"
          src={review.reviewer.avatarUrl}
        />
      ) : (
        <div
          aria-label={review.reviewer.displayName}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-primary-soft)] text-sm font-black text-[color:var(--client-primary)]"
          role="img"
        >
          {reviewerInitial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header>
          <h3 className="truncate text-[15px] font-black text-[color:var(--client-text)]">
            {review.reviewer.displayName}
          </h3>
          <time
            className="mt-1 block text-[11px] font-semibold text-[color:var(--client-soft-muted)]"
            dateTime={review.createdAt}
          >
            {formatServiceReviewDate(review.createdAt)}
          </time>
        </header>
        <div className="relative mt-3 rounded-[20px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-4 before:absolute before:-top-[7px] before:left-4 before:h-3 before:w-3 before:rotate-45 before:border-l before:border-t before:border-[color:var(--client-line)] before:bg-[color:var(--client-bg)]">
          <h4 className="relative text-sm font-black leading-6 text-[color:var(--client-text)]">
            {review.title || "服务评价"}
          </h4>
          {review.comment ? (
            <p className="relative mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[color:var(--client-muted)]">
              {review.comment}
            </p>
          ) : null}
          {review.mediaAssets.length > 0 ? (
            <div className="relative mt-3 grid grid-cols-2 gap-2">
              {review.mediaAssets.map((asset) => (
                <img
                  alt={asset.altText || review.title || "评价图片"}
                  className="aspect-[4/3] w-full rounded-[14px] object-cover"
                  key={asset.id}
                  loading="lazy"
                  src={getGeneratedImageThumbnailUrl(asset.url)}
                />
              ))}
            </div>
          ) : null}
          <p className="relative mt-3 text-left text-[12px] font-black text-[color:var(--client-primary)]">
            ★ {review.rating.toFixed(1)} / 5
          </p>
        </div>
      </div>
    </article>
  );
}

type ServiceTopActionIconName = "favorite" | "forward";

const serviceTopActionIconMap: Record<ServiceTopActionIconName, IconName> = {
  favorite: "heart",
  forward: "share"
};

function ServiceTopActionButton({
  active = false,
  label,
  name,
  onClick
}: {
  active?: boolean;
  label: string;
  name: ServiceTopActionIconName;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        floatingHeaderControlButtonClassName,
        "text-[color:var(--client-muted)] hover:-translate-y-0.5",
        active ? "border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)] text-[color:var(--client-primary)]" : ""
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      <AppIcon className="h-5 w-5" name={serviceTopActionIconMap[name]} />
      <span className="sr-only">{label}</span>
    </button>
  );
}

function ServiceDetailHero({
  service,
  onPreview
}: {
  service: ServiceItem;
  onPreview: () => void;
}) {
  return (
    <button
      aria-label="放大头图"
      className="focus-ring relative h-[204px] w-full overflow-hidden rounded-[28px] bg-ink text-left text-white shadow-soft"
      onClick={onPreview}
      type="button"
    >
      <img alt={service.name} className="absolute inset-0 h-full w-full scale-[1.035] object-cover opacity-45" src={getGeneratedImageThumbnailUrl(service.cover)} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/30 to-ink" />
      <div className="relative flex h-full flex-col justify-between p-4">
        <div className="flex items-center gap-2">
          <Badge tone="green">服务</Badge>
          <Badge tone={service.mode === "home" ? "blue" : "yellow"}>{service.mode === "home" ? "上门服务" : "到店服务"}</Badge>
        </div>
        <h1 className="overflow-hidden text-[26px] font-black leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
          {service.name}
        </h1>
      </div>
    </button>
  );
}

function ServiceDetailStatus({
  description,
  title
}: {
  description: string;
  title: string;
}) {
  const navigate = useNavigate();

  return (
    <MobileFullscreenPage>
      <MobileFullscreenHeader
        className="service-detail-header"
        closeLabel="关闭服务详情"
        onBack={() => navigate(-1)}
        onClose={() => navigate(-1)}
        title="服务详情"
      />
      <main className="flex min-h-0 flex-1 items-center justify-center px-5 py-16">
        <section className={cn(mobileDetailCardClassName, "w-full max-w-[420px] text-center")}>
          <Badge tone="blue">服务详情</Badge>
          <h1 className="mt-4 text-[20px] font-black text-ink">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-ink/58">{description}</p>
        </section>
      </main>
    </MobileFullscreenPage>
  );
}

function ServiceDetailContent() {
  const navigate = useNavigate();
  const { id } = useParams();
  const apiId = coreReadIdFromRoute(id, { allowUuid: true });
  const serviceQuery = useCoreReadQuery(
    () => (apiId ? coreReadApi.getServiceDetail(apiId) : null),
    [apiId],
    { enabled: Boolean(apiId), key: `core:service:${apiId ?? "invalid"}` }
  );
  const serviceReviewsQuery = useCoreReadQuery(
    () => (apiId ? coreReadApi.listServiceReviews(apiId, { page: 1, pageSize: 20 }) : null),
    [apiId],
    { enabled: Boolean(apiId), key: `core:service:${apiId ?? "invalid"}:reviews` }
  );
  const service = useMemo(
    () => (serviceQuery.data ? mapCoreServiceToServiceItem(serviceQuery.data) : null),
    [serviceQuery.data]
  );
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [favorited, setFavorited] = useState(false);
  const [forwarded, setForwarded] = useState(false);
  const [heroPreviewOpen, setHeroPreviewOpen] = useState(false);

  useEffect(() => {
    setSelectedPackageId(service?.packages[0]?.id ?? "");
    setHeroPreviewOpen(false);
  }, [service?.id, service?.packages]);

  const selectedPackage = useMemo(
    () => service?.packages.find((item) => item.id === selectedPackageId) ?? service?.packages[0],
    [selectedPackageId, service?.packages]
  );
  const selectedTechnicians = useMemo(
    () => (serviceQuery.data?.technician ? [mapCoreTechnicianToTechnician(serviceQuery.data.technician)] : []),
    [serviceQuery.data?.technician]
  );
  const checkoutHref = service && selectedPackage ? `/checkout/${service.id}?package=${selectedPackage.id}` : service ? `/checkout/${service.id}` : "/categories";

  if (apiId && serviceQuery.loading) {
    return <ServiceDetailStatus description="正在从 /api/v1/services 读取服务资料。" title="正在载入服务" />;
  }

  if (apiId && serviceQuery.error) {
    return <ServiceDetailStatus description={serviceQuery.error} title="服务读取失败" />;
  }

  if (!apiId) {
    return <ServiceDetailStatus description="请从真实店铺或服务列表重新选择可预约项目。" title="服务链接不可用" />;
  }

  if (!service) {
    return <ServiceDetailStatus description="当前服务暂时没有公开资料。" title="暂无服务资料" />;
  }

  return (
    <MobileFullscreenPage>
      <MobileFullscreenHeader
         action={(
           <>
             <ServiceTopActionButton active={favorited} label="收藏" name="favorite" onClick={() => setFavorited((current) => !current)} />
             <ServiceTopActionButton active={forwarded} label="转发" name="forward" onClick={() => setForwarded((current) => !current)} />
           </>
        )}
        className="service-detail-header"
        closeLabel="关闭服务详情"
        info={`${service.fastestArrival} · ${service.serviceAreas.slice(0, 2).join(" / ")}`}
        onBack={() => navigate(-1)}
        onClose={() => navigate(-1)}
        title="服务详情"
      />

      <main className="scrollbar-none relative z-0 min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+8.5rem)] pt-4">
        <ServiceDetailHero onPreview={() => setHeroPreviewOpen(true)} service={service} />

        <section className={mobileDetailCardClassName}>
          <div>
            <p className="text-[11px] font-black text-ink/45">介绍</p>
            <HighlightedTagText
              className="mt-2 block text-sm font-semibold leading-6 text-ink/68"
              tagClassName="text-[color:var(--client-primary)]"
              text={service.summary}
            />
          </div>
          <div className="mt-3 rounded-[18px] bg-paper px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black text-ink/45">期限</p>
              <span className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-2.5 py-1 text-[10px] font-black text-[color:var(--client-primary)]">
                预约开放中
              </span>
            </div>
            <p className="mt-2 text-[13px] font-black text-ink/70">最近可约：{service.fastestArrival}</p>
          </div>
        </section>

        <section className={mobileDetailCardClassName}>
          <SectionTitle caption={`${service.sales.toLocaleString("zh-CN")} 次利用 · ★ ${service.rating.toFixed(2)}`} title="套餐与价格">
            <Badge tone="green">{service.packages.length} 个套餐</Badge>
          </SectionTitle>
          <div className="mt-3 space-y-2">
            {service.packages.map((pkg) => {
              const active = pkg.id === selectedPackage?.id;

              return (
                <button
                  className={cn(
                    "focus-ring w-full rounded-[18px] border p-3 text-left transition",
                    active
                      ? "border-[color:color-mix(in_srgb,var(--client-primary)_44%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]"
                      : "border-transparent bg-paper"
                  )}
                  key={pkg.id}
                  onClick={() => setSelectedPackageId(pkg.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-black text-ink">{pkg.name}</h2>
                      <p className="mt-1 text-xs font-bold text-ink/45">{pkg.durationMinutes} 分钟</p>
                    </div>
                    <strong className={`shrink-0 text-[18px] font-black leading-none ${servicePriceHighlightClassName}`}>{yen(pkg.price)}</strong>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-ink/58">{pkg.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pkg.includes.slice(0, 4).map((item) => (
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-ink/48" key={item}>
                        {item}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <ServiceFlowSection flow={service.flow} />

        <section className={mobileDetailCardClassName}>
          <h2 className="font-black">服务标签</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {buildServiceTagLabels(service.serviceAreas, service.tags).map((tag) => (
              <span className="rounded-[18px] bg-paper px-3 py-2 text-xs font-bold text-ink/60" key={tag}>
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {service.notice.map((item) => (
              <p className="rounded-[18px] bg-paper p-3 text-xs leading-5 text-ink/55" key={item}>
                {item}
              </p>
            ))}
          </div>
        </section>

        <section className={mobileDetailCardClassName}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-black">可选技师</h2>
            <Badge tone="blue">{service.technicianCount} 人</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {selectedTechnicians.length > 0 ? (
              selectedTechnicians.map((technician) => (
                <Link className={cn(mobileDetailInnerCardClassName, "flex items-center gap-3")} key={technician.id} to={getTechnicianDynamicPath(technician)}>
                  <AvatarImage alt={technician.name} className="h-12 w-12" src={technician.avatar} />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{technician.nickname?.trim() || technician.name}</strong>
                    <span className="mt-1 block truncate text-xs text-ink/50">
                      ★ {technician.rating.toFixed(1)} · {technician.serviceAreas.slice(0, 2).join(" / ")}
                    </span>
                  </span>
                  <span className="text-lg font-black text-ink/30">›</span>
                </Link>
              ))
            ) : (
              <p className="rounded-[18px] bg-paper p-3 text-xs leading-5 text-ink/55">当前服务暂未公开可指定技师。</p>
            )}
          </div>
        </section>

        <section className={mobileDetailCardClassName}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-black">评价摘要</h2>
            <Badge tone="green">{serviceReviewsQuery.data?.total ?? 0} 条</Badge>
          </div>
          {serviceReviewsQuery.loading ? (
            <p className="mt-3 rounded-[18px] bg-paper p-3 text-xs leading-5 text-ink/55" role="status">
              正在读取评价…
            </p>
          ) : serviceReviewsQuery.error ? (
            <p className="mt-3 rounded-[18px] bg-paper p-3 text-xs leading-5 text-ink/55" role="alert">
              评价读取失败，请稍后重试。
            </p>
          ) : serviceReviewsQuery.data && serviceReviewsQuery.data.list.length > 0 ? (
            <div className="mt-4 space-y-5">
              {serviceReviewsQuery.data.list.map((review) => (
                <ServiceReviewCard key={review.id} review={review} />
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-[18px] bg-paper p-3 text-xs leading-5 text-ink/55">
              暂无公开评价。
            </p>
          )}
        </section>
      </main>

      <footer className="absolute inset-x-0 bottom-0 z-20 grid grid-cols-[1fr,auto] items-center gap-3 border-t border-transparent bg-transparent px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-4">
        <div>
          <p className="text-xs font-bold text-ink/45">价格</p>
          <strong className={`text-xl ${servicePriceHighlightClassName}`}>{yen(selectedPackage?.price ?? service.priceFrom)}</strong>
        </div>
        <Button className="min-w-[150px]" to={checkoutHref}>
          立即预约
        </Button>
      </footer>

      {heroPreviewOpen ? (
        <div className="fixed inset-0 z-[96] bg-black/90 px-4 py-6">
          <button aria-label="关闭头图预览" className="absolute inset-0" onClick={() => setHeroPreviewOpen(false)} type="button" />
          <div className="absolute right-4 top-[calc(env(safe-area-inset-top)+12px)] z-[97]">
            <MobileFullscreenCloseButton className="border-white/25 bg-black/40 text-white" label="关闭大图" onClose={() => setHeroPreviewOpen(false)} />
          </div>
          <div className="pointer-events-none relative z-[96] mx-auto flex h-full w-full max-w-[480px] items-center justify-center">
            <img alt={service.name} className="max-h-full w-full rounded-[28px] object-contain shadow-soft" src={getGeneratedImageThumbnailUrl(service.cover)} />
          </div>
        </div>
      ) : null}
    </MobileFullscreenPage>
  );
}

export function ServiceDetailPage() {
  return (
    <MobileShell navItems={[]}>
      <ServiceDetailContent />
    </MobileShell>
  );
}
