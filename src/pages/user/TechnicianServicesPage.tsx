import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import { MobileBottomActionBar } from "../../components/mobile/MobileBottomActionBar";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { coreReadApi } from "../../features/core-read/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import { pricingModeApi, type TechnicianServicePayload } from "../../features/pricing-mode/api";
import { socialPaths } from "../../features/social/paths";
import type { SocialPortalScope } from "../../features/social/types";
import { cn } from "../../lib/utils";
import { mapTechnicianServiceToUnifiedData, UnifiedServiceInfoCard } from "../../shared/service-card";
import { useEntityStore } from "../../state/entityStore";
import { buildTechnicianServiceCheckoutRoute, getTechnicianServiceDetailPath } from "./formal-checkout/checkoutServiceRoute";

function routeEntityIdToApiId(value: string | undefined) {
  if (!value) return null;
  if (/^[1-9]\d*$/.test(value)) return Number(value);
  const suffix = value.match(/(\d+)$/)?.[1];
  return suffix ? Number(suffix) : null;
}

const supplementaryServicePattern = /(?:^|[\s|｜:：])(施術)?延長(?:[\s|｜:：]|$)|(?:^|[\s|｜:：])(オプション|追加|附加|加钟|加鐘|add[ -]?on|extension)(?:[\s|｜:：]|$)/iu;

function isSupplementaryService(service: TechnicianServicePayload) {
  return [service.name, ...service.tags]
    .some((value) => supplementaryServicePattern.test(value.normalize("NFKC")));
}

export function findPrimaryTechnicianService(services: TechnicianServicePayload[]) {
  const mainServices = services
    .filter((service) => service.isBookable && !isSupplementaryService(service))
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
  return mainServices.find((service) => service.isRecommended) ?? mainServices[0] ?? null;
}

function ServiceSelectionButton({
  disabled,
  locked,
  name,
  onToggle,
  selected
}: {
  disabled: boolean;
  locked: boolean;
  name: string;
  onToggle: () => void;
  selected: boolean;
}) {
  return (
    <button
      aria-label={locked ? `主要服务 ${name}` : selected ? `取消选择 ${name}` : `选择 ${name}`}
      aria-pressed={selected}
      className={cn(
        "focus-ring grid h-10 w-10 place-items-center rounded-full border-2 transition active:scale-95 disabled:cursor-not-allowed",
        disabled && !selected && "opacity-40",
        selected
          ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
          : "border-[color:var(--client-primary)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)] text-[color:var(--client-primary)]"
      )}
      disabled={disabled || locked}
      onClick={onToggle}
      type="button"
    >
      {selected ? <AppIcon className="h-5 w-5" name="check" /> : null}
    </button>
  );
}

export function TechnicianServicesPage({ scope = "user" }: { scope?: SocialPortalScope } = {}) {
  const { shopId, technicianId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const apiShopId = routeEntityIdToApiId(shopId);
  const apiTechnicianId = routeEntityIdToApiId(technicianId);
  const { stores, technicians } = useEntityStore();
  const store = stores.find((item) => item.id === shopId) ?? stores[0];
  const technician = technicians.find((item) => item.id === technicianId) ?? technicians[0];
  const [services, setServices] = useState<TechnicianServicePayload[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const detailQuery = useCoreReadQuery(
    () => apiTechnicianId ? coreReadApi.getTechnicianDetail(apiTechnicianId) : null,
    [apiTechnicianId],
    { enabled: Boolean(apiTechnicianId), key: `core:technician:${apiTechnicianId ?? "missing"}:service-list` }
  );

  useEffect(() => {
    if (!apiShopId || !apiTechnicianId) return;
    let mounted = true;
    setLoading(true);
    setFailed(false);
    pricingModeApi
      .listPublicTechnicianServices(apiShopId, apiTechnicianId, { page: 1, pageSize: 20 })
      .then((result) => {
        if (!mounted) return;
        setServices(result.list);
        const primaryService = findPrimaryTechnicianService(result.list);
        if (primaryService) setSelectedServiceIds([primaryService.id]);
        else setSelectedServiceIds([]);
      })
      .catch(() => {
        if (mounted) setFailed(true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [apiShopId, apiTechnicianId]);

  const primaryServiceId = useMemo(() => findPrimaryTechnicianService(services)?.id ?? null, [services]);
  const toggleServiceSelection = (serviceId: number) => {
    if (serviceId === primaryServiceId) return;
    setSelectedServiceIds((current) => current.includes(serviceId)
      ? current.filter((id) => id !== serviceId)
      : [...current, serviceId]);
  };
  const selectedServices = useMemo(
    () => selectedServiceIds.flatMap((id) => services.find((service) => service.id === id) ?? []),
    [selectedServiceIds, services]
  );
  const selectedService = selectedServices[0] ?? null;
  const checkoutTo = selectedService ? buildTechnicianServiceCheckoutRoute(selectedService.id, {
    date: searchParams.get("date"),
    people: searchParams.get("people"),
    serviceIds: selectedServiceIds,
    time: searchParams.get("time")
  }) : null;
  const socialDetail = detailQuery.data;
  const activityPath = socialDetail?.socialAccountUserId && socialDetail.socialIdentityId
    ? socialPaths.accountProfile(scope, socialDetail.socialAccountUserId, socialDetail.socialIdentityId)
    : null;
  const closePage = () => navigate(scope === "user" ? "/" : `/${scope}`);

  return (
    <MobileShell showBottomNav={false}>
      <MobileFullscreenPage>
        <MobileFullscreenHeader
          info={store ? `${store.name} · ${technician?.name ?? socialDetail?.displayName ?? "技师"}` : "技师可预约服务"}
          onBack={() => navigate(-1)}
          onClose={closePage}
          title="服务内容"
        />
        <main className="client-app-gutter scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+112px)] pt-4">
          {failed ? (
            <div className="rounded-[18px] border border-line bg-white p-4 text-sm font-bold text-ink/58">
              暂时无法读取技师服务，稍后再试。
            </div>
          ) : null}
          <div className="grid gap-3">
            {services.length > 0 ? services.map((service) => {
              const selected = selectedServiceIds.includes(service.id);
              return (
                <UnifiedServiceInfoCard
                  actionSlot={scope === "user" ? (
                    <ServiceSelectionButton
                      disabled={!service.isBookable}
                      locked={service.id === primaryServiceId}
                      name={service.name}
                      onToggle={() => toggleServiceSelection(service.id)}
                      selected={selected}
                    />
                  ) : undefined}
                  className={cn(loading && "opacity-70", selected && "ring-2 ring-[color:var(--client-primary)]")}
                  data={mapTechnicianServiceToUnifiedData(service)}
                  detailTo={getTechnicianServiceDetailPath(service.id, scope)}
                  key={service.id || service.name}
                />
              );
            }) : (
              <div className="rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 text-sm font-bold text-[color:var(--client-muted)]">
                {loading ? "正在读取技师服务..." : "该技师暂未开放可预约服务。"}
              </div>
            )}
          </div>
          {activityPath ? (
            <Link className="block text-center text-xs font-bold text-[color:var(--client-muted)]" state={{ from: location.pathname }} to={activityPath}>
              查看技师动态
            </Link>
          ) : null}
        </main>
        {scope === "user" ? (
          <MobileBottomActionBar>
            {checkoutTo ? (
              <Link className="focus-ring flex min-h-12 w-full items-center justify-center rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-[0_14px_34px_color-mix(in_srgb,var(--client-primary)_34%,transparent)]" to={checkoutTo}>
                预约已选服务
              </Link>
            ) : (
              <button className="min-h-12 w-full rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] opacity-50" disabled type="button">
                请选择服务
              </button>
            )}
          </MobileBottomActionBar>
        ) : null}
      </MobileFullscreenPage>
    </MobileShell>
  );
}
