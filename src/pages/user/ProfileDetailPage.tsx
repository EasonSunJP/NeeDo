import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppTopBar, EmptyStatePanel, PageScaffold, SurfacePanel } from "../../components/client-ui/AppScaffold";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { coreReadApi, coreReadIdFromRoute, mapCoreCustomerToCustomer, mapCoreShopToStore, mapCoreTechnicianToTechnician } from "../../features/core-read/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import { pricingModeApi } from "../../features/pricing-mode/api";
import { socialPaths } from "../../features/social/paths";
import { SocialProfilePage } from "../../features/social/pages/SocialProfilePage";
import { UnifiedSimpleProfileCard } from "../../shared/profile-card";
import { getScopedProfileDetailPath } from "../../shared/profile-detail";
import { TechnicianProfileInfoView, fromCoreTechnicianDetail } from "../../shared/technician-profile";

function technicianDetailIdFromRoute(id: string | undefined) {
  const numericId = coreReadIdFromRoute(id);

  if (numericId) {
    return numericId;
  }

  return id && /^s\d{10}$/u.test(id) ? id : null;
}

export function ProfileDetailPage() {
  const { entityType, id } = useParams();

  if (entityType === "technician") {
    return <TechnicianApiProfilePage id={technicianDetailIdFromRoute(id)} />;
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

function TechnicianApiProfilePage({ id }: { id: number | string | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [retryRevision, setRetryRevision] = useState(0);
  const [canonicalAlias, setCanonicalAlias] = useState<{ internalId: number; publicId: string } | null>(null);
  const requestId = typeof id === "string" && canonicalAlias?.publicId === id ? canonicalAlias.internalId : id;
  const detailQuery = useCoreReadQuery(() => requestId ? coreReadApi.getTechnicianDetail(requestId) : null, [requestId, retryRevision]);
  const queriedDetail = detailQuery.data;
  const detailMatchesRoute = !queriedDetail || (typeof id === "number" ? queriedDetail.id === id : queriedDetail.publicId === id);
  const detail = detailMatchesRoute ? queriedDetail : null;
  const shopId = detail?.shop?.id ?? null;
  const technicianId = detail?.id ?? null;
  const servicesQuery = useCoreReadQuery(
    () => shopId && technicianId ? pricingModeApi.listPublicTechnicianServices(shopId, technicianId, { page: 1, pageSize: 20 }) : null,
    [shopId, technicianId, retryRevision]
  );
  const scope = location.pathname.startsWith("/merchant/") ? "merchant" : location.pathname.startsWith("/technician/") ? "technician" : "user";

  useEffect(() => {
    if (typeof id !== "number" || !detail?.publicId) {
      return;
    }

    setCanonicalAlias({ internalId: detail.id, publicId: detail.publicId });
    navigate(
      {
        pathname: getScopedProfileDetailPath(scope, "technician", detail.publicId),
        search: location.search
      },
      { replace: true }
    );
  }, [detail?.publicId, id, location.search, navigate, scope]);

  const handleBack = () => navigate(-1);
  const handleClose = () => {
    if (searchParams.get("view") === "card" && typeof window !== "undefined" && window.history.state?.idx > 0) {
      navigate(-1);
      return;
    }

    navigate(scope === "user" ? "/" : `/${scope}`);
  };
  const handleRetry = () => setRetryRevision((value) => value + 1);

  if (!id) {
    return <TechnicianProfileStatus description="技师资料链接无效。" onBack={handleBack} onClose={handleClose} title="暂无技师资料" />;
  }

  if (detailQuery.loading || !detailMatchesRoute || (detail?.shop && servicesQuery.loading)) {
    return <TechnicianProfileStatus description="正在从正式资料服务读取技师信息。" onBack={handleBack} onClose={handleClose} title="正在载入技师" />;
  }

  if (detailQuery.error || servicesQuery.error) {
    return <TechnicianProfileStatus description={detailQuery.error ?? servicesQuery.error ?? "error.api"} onBack={handleBack} onClose={handleClose} onRetry={handleRetry} title="技师资料读取失败" />;
  }

  if (!detail) {
    return <TechnicianProfileStatus description="当前技师暂时没有公开资料。" onBack={handleBack} onClose={handleClose} title="暂无技师资料" />;
  }

  const model = fromCoreTechnicianDetail(detail, servicesQuery.data?.list ?? []);

  return (
    <MobileShell showBottomNav={false}>
      <main className="mx-auto w-full max-w-[480px] space-y-4 px-4 pb-10 pt-4">
        <MobileFullscreenHeader onBack={handleBack} onClose={handleClose} title="详细信息卡" />
        <TechnicianProfileInfoView model={model} />
        <Link className="block text-center text-sm font-bold text-[color:var(--client-primary)]" to={socialPaths.accountProfile(scope, detail.id)}>
          查看技师动态
        </Link>
      </main>
    </MobileShell>
  );
}

function TechnicianProfileStatus({
  description,
  onBack,
  onClose,
  onRetry,
  title
}: {
  description: string;
  onBack: () => void;
  onClose: () => void;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <MobileShell showBottomNav={false}>
      <main className="mx-auto w-full max-w-[480px] space-y-4 px-4 pb-10 pt-4">
        <MobileFullscreenHeader onBack={onBack} onClose={onClose} title="详细信息卡" />
        <EmptyStatePanel
          action={onRetry ? <button className="rounded-full bg-[color:var(--client-primary)] px-5 py-2.5 text-sm font-black text-[color:var(--client-primary-contrast)]" onClick={onRetry} type="button">重新加载技师资料</button> : undefined}
          caption={description}
          title={title}
        />
      </main>
    </MobileShell>
  );
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
