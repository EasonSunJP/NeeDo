import { useParams } from "react-router-dom";
import { AppTopBar, EmptyStatePanel, PageScaffold, SurfacePanel } from "../../components/client-ui/AppScaffold";
import { coreReadApi, coreReadIdFromRoute, mapCoreCustomerToCustomer, mapCoreShopToStore, mapCoreTechnicianToTechnician } from "../../features/core-read/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import { SocialProfilePage } from "../../features/social/pages/SocialProfilePage";
import { UnifiedSimpleProfileCard } from "../../shared/profile-card";

export function ProfileDetailPage() {
  const { entityType, id } = useParams();

  if (entityType === "technician") {
    return <SocialProfilePage />;
  }

  const apiId = coreReadIdFromRoute(id);

  if (!apiId || (entityType !== "user" && entityType !== "shop")) {
    return <SocialProfilePage />;
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
