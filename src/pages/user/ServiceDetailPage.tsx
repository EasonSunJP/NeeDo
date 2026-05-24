import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppIcon, floatingHeaderControlButtonClassName, type IconName } from "../../components/client-ui/AppScaffold";
import { ClientEdgeMask } from "../../components/mobile/ClientEdgeMask";
import { MobileFullscreenBackButton, MobileFullscreenCloseButton } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { SectionTitle } from "../../components/mobile/SectionTitle";
import { ServiceFlowSection, mobileDetailCardClassName, mobileDetailInnerCardClassName } from "../../components/mobile/ServiceFlowSection";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { HighlightedTagText } from "../../components/ui/HighlightedTagText";
import { coreReadApi, coreReadIdFromRoute, mapCoreServiceToServiceItem, mapCoreTechnicianToTechnician } from "../../features/core-read/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { cn, yen } from "../../lib/utils";
import type { ServiceItem, Technician } from "../../types/domain";

const servicePriceHighlightClassName = "text-[color:var(--client-primary)]";

type ServiceTopActionIconName = "like" | "favorite" | "translate" | "forward";

const serviceTopActionIconMap: Record<ServiceTopActionIconName, IconName> = {
  like: "heart",
  favorite: "star",
  translate: "globe",
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
      <div className="pointer-events-none absolute inset-x-0 safe-floating-top z-[90] px-4">
        <MobileFullscreenBackButton className="pointer-events-auto" onBack={() => navigate(-1)} />
      </div>
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
  const apiId = coreReadIdFromRoute(id);
  const serviceQuery = useCoreReadQuery(
    () => (apiId ? coreReadApi.getServiceDetail(apiId) : null),
    [apiId]
  );
  const service = useMemo(
    () => (serviceQuery.data ? mapCoreServiceToServiceItem(serviceQuery.data) : null),
    [serviceQuery.data]
  );
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [translated, setTranslated] = useState(false);
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

  if (!apiId) {
    return <ServiceDetailStatus description="这个服务链接还停留在旧 demo ID，第一批去 Mock 后请从首页或分类页重新进入真实 API 服务。" title="服务链接不可用" />;
  }

  if (serviceQuery.loading) {
    return <ServiceDetailStatus description="正在从 /api/v1/services 读取服务资料。" title="正在载入服务" />;
  }

  if (serviceQuery.error) {
    return <ServiceDetailStatus description={serviceQuery.error} title="服务读取失败" />;
  }

  if (!service) {
    return <ServiceDetailStatus description="当前服务暂时没有公开资料。" title="暂无服务资料" />;
  }

  return (
    <MobileFullscreenPage>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 z-10 h-[var(--client-sticky-tab-single-spacer)] border-b border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:var(--client-bg)]"
      />
      <div className="pointer-events-none absolute inset-x-0 safe-floating-top z-[90] px-4">
        <MobileFullscreenBackButton className="pointer-events-auto" onBack={() => navigate(-1)} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 safe-floating-top z-[90] flex justify-end px-4">
        <div className="pointer-events-auto flex items-center gap-1.5">
          <ServiceTopActionButton active={liked} label="点赞" name="like" onClick={() => setLiked((current) => !current)} />
          <ServiceTopActionButton active={favorited} label="收藏" name="favorite" onClick={() => setFavorited((current) => !current)} />
          <ServiceTopActionButton active={translated} label="翻译" name="translate" onClick={() => setTranslated((current) => !current)} />
          <ServiceTopActionButton active={forwarded} label="转发" name="forward" onClick={() => setForwarded((current) => !current)} />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 safe-header-top px-4 pb-3 text-[color:var(--client-text)]">
        <div className="min-w-0 pl-[56px] pr-[212px]">
          <div className="truncate text-base font-black">服务详情</div>
          <p className="mt-0.5 truncate text-[11px] font-bold leading-5 text-ink/45">
            {service.fastestArrival} · {service.serviceAreas.slice(0, 2).join(" / ")}
          </p>
        </div>
      </div>

      <main className="scrollbar-none relative z-0 min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+8.5rem)] pt-[var(--client-sticky-tab-single-spacer)]">
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
            {[...service.serviceAreas, ...service.tags].slice(0, 12).map((tag) => (
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
                <Link className={cn(mobileDetailInnerCardClassName, "flex items-center gap-3")} key={technician.id} to={`/profiles/technician/${technician.id}`}>
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
            <Badge tone="green">{service.sales} 条</Badge>
          </div>
          <div className="mt-3 rounded-[18px] bg-paper p-3 text-xs leading-5 text-ink/55">
            {service.tags.length > 0 ? service.tags.join(" / ") : "暂无公开评价摘要。"}
          </div>
        </section>
      </main>

      <ClientEdgeMask className="z-10" edge="bottom" mode="absolute" />
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
