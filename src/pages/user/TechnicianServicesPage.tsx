import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppTopBar, PageScaffold, PrimaryButton } from "../../components/client-ui/AppScaffold";
import { SectionTitle } from "../../components/mobile/SectionTitle";
import { pricingModeApi, type TechnicianServicePayload } from "../../features/pricing-mode/api";
import { cn, yen } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";

function routeEntityIdToApiId(value: string | undefined) {
  if (!value) {
    return null;
  }

  if (/^[1-9]\d*$/.test(value)) {
    return Number(value);
  }

  const suffix = value.match(/(\d+)$/)?.[1];
  return suffix ? Number(suffix) : null;
}

export function TechnicianServicesPage() {
  const { shopId, technicianId } = useParams();
  const apiShopId = routeEntityIdToApiId(shopId);
  const apiTechnicianId = routeEntityIdToApiId(technicianId);
  const { stores, technicians } = useEntityStore();
  const store = stores.find((item) => item.id === shopId) ?? stores[0];
  const technician = technicians.find((item) => item.id === technicianId) ?? technicians[0];
  const [services, setServices] = useState<TechnicianServicePayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!apiShopId || !apiTechnicianId) {
      return;
    }

    let mounted = true;
    setLoading(true);
    setFailed(false);
    pricingModeApi
      .listPublicTechnicianServices(apiShopId, apiTechnicianId, { page: 1, pageSize: 20 })
      .then((result) => {
        if (mounted) {
          setServices(result.list);
        }
      })
      .catch(() => {
        if (mounted) {
          setFailed(true);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [apiShopId, apiTechnicianId]);

  return (
    <PageScaffold contentClassName="px-0 pt-0">
      <AppTopBar title="技师服务" />
      <section className="space-y-4 px-4 pb-28 pt-3">
        <SectionTitle
          caption={store ? `${store.name} · ${technician?.name ?? "技师"}` : "技师可预约服务"}
          title="服务信息"
        />
        {failed ? (
          <div className="rounded-[18px] border border-line bg-white p-4 text-sm font-bold text-ink/58">
            暂时无法读取技师服务，稍后再试。
          </div>
        ) : null}
        <div className="grid gap-3">
          {services.length > 0 ? services.map((service) => (
            <article
              className={cn(
                "rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:var(--client-surface)] p-4 shadow-soft",
                loading && "opacity-70"
              )}
              key={service.id || service.name}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[17px] font-black text-[color:var(--client-text)]">{service.name}</h2>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--client-muted)]">
                    {service.description ?? "预约前请确认服务时间与到店方式。"}
                  </p>
                </div>
                <strong className="shrink-0 text-sm font-black text-[color:var(--client-accent-text)]">
                  {service.priceAmount > 0 ? yen(service.priceAmount) : "预约确认"}
                </strong>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-bold text-ink/60">
                  {service.durationMinutes} 分钟
                </span>
                {service.tags.slice(0, 3).map((tag) => (
                  <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-bold text-ink/60" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              <PrimaryButton
                className="mt-4 w-full"
                to={`/checkout/${service.id > 0 ? `technician-service-${service.id}` : "svc-fallback"}`}
              >
                预约这个服务
              </PrimaryButton>
            </article>
          )) : (
            <div className="rounded-[18px] border border-line bg-white p-4 text-sm font-bold text-ink/58">
              {loading ? "正在读取技师服务..." : "该技师暂未开放可预约服务。"}
            </div>
          )}
        </div>
        <Link className="block text-center text-xs font-bold text-[color:var(--client-muted)]" to={technician ? `/profiles/technician/${technician.id}` : "/stores"}>
          查看技师动态
        </Link>
      </section>
    </PageScaffold>
  );
}
