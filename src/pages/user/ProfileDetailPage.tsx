import { Link, useParams } from "react-router-dom";
import { AppTopBar, EmptyStatePanel, PageScaffold, SurfacePanel } from "../../components/client-ui/AppScaffold";
import { Badge } from "../../components/ui/Badge";
import { coreReadApi, coreReadIdFromRoute, mapCoreCustomerToCustomer, mapCoreShopToStore, mapCoreTechnicianToTechnician } from "../../features/core-read/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import { SocialProfilePage } from "../../features/social/pages/SocialProfilePage";
import { UnifiedSimpleProfileCard } from "../../shared/profile-card";

export function ProfileDetailPage() {
  const { entityType, id } = useParams();
  const apiId = coreReadIdFromRoute(id);

  if (!apiId || (entityType !== "technician" && entityType !== "user" && entityType !== "shop")) {
    return <SocialProfilePage />;
  }

  if (entityType === "technician") {
    return <TechnicianApiProfilePage id={apiId} />;
  }

  if (entityType === "shop") {
    return <ShopApiProfilePage id={apiId} />;
  }

  return <CustomerApiProfilePage id={apiId} />;
}

function ProfileStatus({
  description,
  title
}: {
  description: string;
  title: string;
}) {
  return (
    <PageScaffold contentClassName="space-y-5 pb-28">
      <AppTopBar subtitle="真实 API 数据源" title="资料详情" />
      <EmptyStatePanel caption={description} title={title} />
    </PageScaffold>
  );
}

function TechnicianApiProfilePage({ id }: { id: number }) {
  const query = useCoreReadQuery(() => coreReadApi.getTechnicianDetail(id), [id]);

  if (query.loading) {
    return <ProfileStatus description="正在从 /api/v1/technicians 读取技师资料。" title="正在载入技师" />;
  }

  if (query.error) {
    return <ProfileStatus description={query.error} title="技师读取失败" />;
  }

  if (!query.data) {
    return <ProfileStatus description="当前技师暂时没有公开资料。" title="暂无技师资料" />;
  }

  const technician = mapCoreTechnicianToTechnician(query.data);
  const services = query.data.services.map((service) => ({
    id: String(service.id),
    name: service.name,
    price: Number.parseFloat(service.priceAmount),
    to: `/services/${service.id}`
  }));

  return (
    <PageScaffold contentClassName="space-y-5 pb-28">
      <AppTopBar subtitle="真实 API 数据源" title="技师详情" />
      <UnifiedSimpleProfileCard entityType="technician" technician={technician} variant="list" />
      <SurfacePanel>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-[color:var(--client-text)]">可预约服务</h2>
          <Badge tone="blue">{services.length} 项</Badge>
        </div>
        <div className="mt-3 space-y-2">
          {services.length > 0 ? (
            services.map((service) => (
              <Link className="flex items-center justify-between gap-3 rounded-[18px] bg-[color:var(--client-bg-soft)] px-3 py-3 text-sm font-black text-[color:var(--client-text)]" key={service.id} to={service.to}>
                <span className="min-w-0 truncate">{service.name}</span>
                <span className="shrink-0 text-[color:var(--client-primary)]">¥{service.price.toLocaleString("ja-JP")}</span>
              </Link>
            ))
          ) : (
            <p className="text-sm leading-6 text-[color:var(--client-muted)]">当前技师暂未公开可预约服务。</p>
          )}
        </div>
      </SurfacePanel>
    </PageScaffold>
  );
}

function CustomerApiProfilePage({ id }: { id: number }) {
  const query = useCoreReadQuery(() => coreReadApi.getCustomerProfile(id), [id]);

  if (query.loading) {
    return <ProfileStatus description="正在从 /api/v1/profiles/customers 读取用户资料。" title="正在载入用户" />;
  }

  if (query.error) {
    return <ProfileStatus description={query.error} title="用户资料读取失败" />;
  }

  if (!query.data) {
    return <ProfileStatus description="当前用户暂时没有公开资料。" title="暂无用户资料" />;
  }

  return (
    <PageScaffold contentClassName="space-y-5 pb-28">
      <AppTopBar subtitle="真实 API 数据源" title="用户资料" />
      <UnifiedSimpleProfileCard customer={mapCoreCustomerToCustomer(query.data)} entityType="user" variant="list" />
      <SurfacePanel>
        <h2 className="text-lg font-black text-[color:var(--client-text)]">公开资料</h2>
        <p className="mt-2 text-sm leading-7 text-[color:var(--client-muted)]">{query.data.bio ?? "当前用户暂未填写公开简介。"}</p>
      </SurfacePanel>
    </PageScaffold>
  );
}

function ShopApiProfilePage({ id }: { id: number }) {
  const query = useCoreReadQuery(() => coreReadApi.getShopDetail(id), [id]);

  if (query.loading) {
    return <ProfileStatus description="正在从 /api/v1/shops 读取店铺资料。" title="正在载入店铺" />;
  }

  if (query.error) {
    return <ProfileStatus description={query.error} title="店铺读取失败" />;
  }

  if (!query.data) {
    return <ProfileStatus description="当前店铺暂时没有公开资料。" title="暂无店铺资料" />;
  }

  return (
    <PageScaffold contentClassName="space-y-5 pb-28">
      <AppTopBar subtitle="真实 API 数据源" title="店铺资料" />
      <UnifiedSimpleProfileCard detailTo={`/stores/${query.data.id}`} entityType="shop" store={mapCoreShopToStore(query.data)} technicians={query.data.technicians.map(mapCoreTechnicianToTechnician)} variant="list" />
      <SurfacePanel>
        <h2 className="text-lg font-black text-[color:var(--client-text)]">店铺简介</h2>
        <p className="mt-2 text-sm leading-7 text-[color:var(--client-muted)]">{query.data.description ?? "当前店铺暂未填写公开简介。"}</p>
      </SurfacePanel>
    </PageScaffold>
  );
}
