import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppTopBar, EmptyStatePanel, PageScaffold, SurfacePanel } from "../../components/client-ui/AppScaffold";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { coreReadApi, coreReadIdFromRoute, coreReadShopIdFromRoute, mapCoreCustomerToCustomer, mapCoreShopToStore, mapCoreTechnicianToTechnician, type CoreCustomerProfile } from "../../features/core-read/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import { pricingModeApi } from "../../features/pricing-mode/api";
import { socialPaths } from "../../features/social/paths";
import { SocialAccountProfilePage } from "../../features/social/route-pages";
import { languageLocales } from "../../i18n/translations";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { UnifiedSimpleProfileCard } from "../../shared/profile-card";
import { resolveCustomerMembership } from "../../shared/profile-card/customerMembership";
import { formatCustomerGenderLabel } from "../../shared/profile-card/customerProfileLabels";
import { normalizeProfileLanguageLabels } from "../../shared/profile-card/profileLanguages";
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
  const [searchParams] = useSearchParams();

  if (entityType === "technician") {
    return <TechnicianApiProfilePage id={technicianDetailIdFromRoute(id)} />;
  }

  if (entityType === "shop") {
    const shopId = coreReadShopIdFromRoute(id);
    const sourcePostId = Number(searchParams.get("sourcePostId"));
    const validSourcePostId = Number.isSafeInteger(sourcePostId) && sourcePostId > 0 ? sourcePostId : undefined;
    return shopId
      ? <ShopApiProfilePage id={shopId} key={`${shopId}:${validSourcePostId ?? "direct"}`} sourcePostId={validSourcePostId} />
      : <SocialAccountProfilePage />;
  }

  const apiId = coreReadIdFromRoute(id);

  if (!apiId || entityType !== "user") {
    return <SocialAccountProfilePage />;
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
  const detailQuery = useCoreReadQuery(
    () => requestId ? coreReadApi.getTechnicianDetail(requestId) : null,
    [requestId, retryRevision],
    {
      enabled: Boolean(requestId),
      force: retryRevision > 0,
      key: `core:technician:${requestId ?? "missing"}`
    }
  );
  const queriedDetail = detailQuery.data;
  const detailMatchesRoute = !queriedDetail || (typeof id === "number" ? queriedDetail.id === id : queriedDetail.publicId === id);
  const detail = detailMatchesRoute ? queriedDetail : null;
  const technicianId = detail?.id ?? null;
  const servicesQuery = useCoreReadQuery(
    () => technicianId ? pricingModeApi.listPublicTechnicianProfileServices(technicianId, { page: 1, pageSize: 20 }) : null,
    [technicianId, retryRevision],
    {
      enabled: Boolean(technicianId),
      force: retryRevision > 0,
      key: `technician:public-profile-services:${technicianId ?? "missing"}:page-1:size-20`
    }
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

  if (detailQuery.loading || !detailMatchesRoute || (detail && servicesQuery.loading)) {
    return <TechnicianProfileStatus description="正在从正式资料服务读取技师信息。" onBack={handleBack} onClose={handleClose} title="正在载入技师" />;
  }

  if (detailQuery.error || servicesQuery.error) {
    return <TechnicianProfileStatus description={detailQuery.error ?? servicesQuery.error ?? "error.api"} onBack={handleBack} onClose={handleClose} onRetry={handleRetry} title="技师资料读取失败" />;
  }

  if (!detail) {
    return <TechnicianProfileStatus description="当前技师暂时没有公开资料。" onBack={handleBack} onClose={handleClose} title="暂无技师资料" />;
  }

  const model = fromCoreTechnicianDetail(detail, servicesQuery.data?.list ?? []);
  const socialAccountUserId = detail.socialAccountUserId;
  const socialIdentityId = detail.socialIdentityId;
  const socialAccountPath =
    typeof socialAccountUserId === "number" &&
    Number.isSafeInteger(socialAccountUserId) &&
    socialAccountUserId > 0 &&
    typeof socialIdentityId === "number" &&
    Number.isSafeInteger(socialIdentityId) &&
    socialIdentityId > 0
    ? socialPaths.accountProfile(scope, socialAccountUserId, socialIdentityId)
    : null;

  return (
    <MobileShell showBottomNav={false}>
      <main className="client-app-gutter w-full space-y-4 pb-10 pt-4">
        <MobileFullscreenHeader onBack={handleBack} onClose={handleClose} title="详细信息卡" />
        <TechnicianProfileInfoView model={model} />
        {socialAccountPath ? (
          <Link className="block text-center text-sm font-bold text-[color:var(--client-primary)]" to={socialAccountPath}>
            查看技师动态
          </Link>
        ) : null}
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
      <main className="client-app-gutter w-full space-y-4 pb-10 pt-4">
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
  const { language } = useOptionalI18n();
  const query = useCoreReadQuery(
    () => coreReadApi.getCustomerProfile(id),
    [id]
  );

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
      <CustomerProfileBasics profile={query.data} />
      <CustomerCreditReview language={language} profile={query.data} />
      <SurfacePanel>
        <h2 className="text-lg font-black text-[color:var(--client-text)]">公开资料</h2>
        <p className="mt-2 text-sm leading-7 text-[color:var(--client-muted)]">{query.data.bio ?? "当前用户暂未填写公开简介。"}</p>
      </SurfacePanel>
    </PageScaffold>
  );
}

function CustomerProfileBasics({ profile }: { profile: CoreCustomerProfile }) {
  const languages = normalizeProfileLanguageLabels(profile.languages ?? []);
  const membership = resolveCustomerMembership(profile.membershipLevel);
  const items = [
    ["性别", formatCustomerGenderLabel(profile.gender)],
    ["年龄", profile.age === null || profile.age === undefined ? "未设置" : String(profile.age)],
    ["身高（cm）", profile.heightCm === null || profile.heightCm === undefined ? "未设置" : `${profile.heightCm}cm`],
    ["会员等级", membership.label],
    ["等级", `Lv.${profile.level}`]
  ];

  return (
    <SurfacePanel>
      <h2 className="text-lg font-black text-[color:var(--client-text)]">基础信息</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(([label, value]) => (
          <div className="rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-bg-soft)] p-3" key={label}>
            <p className="text-xs font-bold text-[color:var(--client-muted)]">{label}</p>
            <p className="mt-1 font-black text-[color:var(--client-text)]">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-bg-soft)] p-3">
        <p className="text-xs font-bold text-[color:var(--client-muted)]">语言能力</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {languages.length > 0 ? languages.map((item) => (
            <span className="rounded-full border border-[color:var(--client-line)] px-3 py-1 text-xs font-black text-[color:var(--client-text)]" key={item}>{item}</span>
          )) : <span className="text-sm text-[color:var(--client-muted)]">未设置</span>}
        </div>
      </div>
    </SurfacePanel>
  );
}

function CustomerCreditReview({
  language,
  profile
}: {
  language: keyof typeof languageLocales;
  profile: CoreCustomerProfile;
}) {
  const review = profile.reviewSummary;
  const hasReviews = review.reviewCount > 0;
  const rating = Number.parseFloat(review.ratingAverage);
  const latestReview = review.latestReviewAt
    ? new Intl.DateTimeFormat(languageLocales[language], { dateStyle: "medium" }).format(new Date(review.latestReviewAt))
    : "—";

  return (
    <SurfacePanel>
      <h2 className="text-lg font-black text-[color:var(--client-text)]">信用评价</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["信用评分", hasReviews && Number.isFinite(rating) ? rating.toFixed(1) : "—"],
          ["评价数量", String(review.reviewCount)],
          ["最近评价", latestReview]
        ].map(([label, value]) => (
          <div className="rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-bg-soft)] p-3" key={label}>
            <p className="text-xs font-bold text-[color:var(--client-muted)]">{label}</p>
            <p className="mt-1 font-black text-[color:var(--client-text)]">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-bg-soft)] p-3">
        <p className="text-xs font-bold text-[color:var(--client-muted)]">最近评价摘要</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {review.highlights.length > 0 ? review.highlights.map((item, index) => (
            <span className="rounded-full border border-[color:var(--client-line)] px-3 py-1 text-xs font-black text-[color:var(--client-text)]" key={`${item}-${index}`}>{item}</span>
          )) : <span className="text-sm text-[color:var(--client-muted)]">暂无评价</span>}
        </div>
      </div>
    </SurfacePanel>
  );
}

function ShopApiProfilePage({ id, sourcePostId }: { id: number | string; sourcePostId?: number }) {
  const query = useCoreReadQuery(
    () => sourcePostId ? coreReadApi.getShopDetail(id, { sourcePostId }) : coreReadApi.getShopDetail(id),
    [id, sourcePostId]
  );

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
      <UnifiedSimpleProfileCard detailTo={sourcePostId ? "" : `/stores/${query.data.id}`} entityType="shop" store={mapCoreShopToStore(query.data)} technicians={query.data.technicians.map(mapCoreTechnicianToTechnician)} variant="list" />
      <SurfacePanel>
        <h2 className="text-lg font-black text-[color:var(--client-text)]">店铺简介</h2>
        <p className="mt-2 text-sm leading-7 text-[color:var(--client-muted)]">{query.data.description ?? "当前店铺暂未填写公开简介。"}</p>
      </SurfacePanel>
    </PageScaffold>
  );
}
