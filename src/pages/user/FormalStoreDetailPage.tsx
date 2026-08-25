import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppTopBar,
  EmptyStatePanel,
  PageScaffold,
  PrimaryButton,
  SecondaryButton,
  SurfacePanel
} from "../../components/client-ui/AppScaffold";
import { coreReadApi, type CoreShopDetail } from "../../features/core-read/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { getScopedProfileDetailPath } from "../../s\u0068ared/profile-detail";

type FormalStoreDetailCopy = {
  title: string;
  apiSource: string;
  loading: string;
  loadFailed: string;
  unavailable: string;
  retry: string;
  services: string;
  noServices: string;
  technicians: string;
  noTechnicians: string;
  reviews: string;
  noPublicReviewDetails: string;
  book: string;
  details: string;
  reviewCount: (count: number) => string;
  duration: (minutes: number) => string;
};

const copyByLanguage: Record<Language, FormalStoreDetailCopy> = {
  zh: {
    title: "店铺详情", apiSource: "数据库正式资料", loading: "正在加载店铺资料", loadFailed: "店铺资料加载失败",
    unavailable: "当前店铺没有可公开的正式资料", retry: "重新加载", services: "服务项目", noServices: "该店铺尚未发布服务",
    technicians: "店铺技师", noTechnicians: "该店铺尚未安排技师", reviews: "评价汇总",
    noPublicReviewDetails: "当前接口仅提供评价汇总，暂无可公开的评价明细。", book: "预约此服务", details: "查看资料",
    reviewCount: (count) => `${count} 条评价`, duration: (minutes) => `${minutes} 分钟`
  },
  "zh-Hant": {
    title: "店鋪詳情", apiSource: "資料庫正式資料", loading: "正在載入店鋪資料", loadFailed: "店鋪資料載入失敗",
    unavailable: "目前店鋪沒有可公開的正式資料", retry: "重新載入", services: "服務項目", noServices: "該店鋪尚未發佈服務",
    technicians: "店鋪技師", noTechnicians: "該店鋪尚未安排技師", reviews: "評價彙總",
    noPublicReviewDetails: "目前介面僅提供評價彙總，暫無可公開的評價明細。", book: "預約此服務", details: "查看資料",
    reviewCount: (count) => `${count} 則評價`, duration: (minutes) => `${minutes} 分鐘`
  },
  ja: {
    title: "店舗詳細", apiSource: "データベースの正式データ", loading: "店舗情報を読み込んでいます", loadFailed: "店舗情報を読み込めませんでした",
    unavailable: "公開可能な正式店舗情報がありません", retry: "再読み込み", services: "サービス", noServices: "公開中のサービスはありません",
    technicians: "在籍スタッフ", noTechnicians: "在籍スタッフはまだ登録されていません", reviews: "評価概要",
    noPublicReviewDetails: "現在のAPIは評価概要のみを提供しており、公開可能な口コミ詳細はありません。", book: "このサービスを予約", details: "プロフィールを見る",
    reviewCount: (count) => `${count}件の評価`, duration: (minutes) => `${minutes}分`
  },
  en: {
    title: "Store details", apiSource: "Formal database record", loading: "Loading store record", loadFailed: "Store record could not be loaded",
    unavailable: "No public formal record is available for this store", retry: "Reload", services: "Services", noServices: "This store has not published services",
    technicians: "Store technicians", noTechnicians: "No technicians are assigned to this store", reviews: "Review summary",
    noPublicReviewDetails: "The API currently provides an aggregate only; no public review details are available.", book: "Book this service", details: "View profile",
    reviewCount: (count) => `${count} reviews`, duration: (minutes) => `${minutes} min`
  },
  ko: {
    title: "매장 상세", apiSource: "데이터베이스 정식 정보", loading: "매장 정보를 불러오는 중", loadFailed: "매장 정보를 불러오지 못했습니다",
    unavailable: "공개 가능한 정식 매장 정보가 없습니다", retry: "다시 불러오기", services: "서비스", noServices: "등록된 서비스가 없습니다",
    technicians: "소속 테라피스트", noTechnicians: "배정된 테라피스트가 없습니다", reviews: "리뷰 요약",
    noPublicReviewDetails: "현재 API는 리뷰 요약만 제공하며 공개 가능한 상세 리뷰는 없습니다.", book: "이 서비스 예약", details: "프로필 보기",
    reviewCount: (count) => `리뷰 ${count}개`, duration: (minutes) => `${minutes}분`
  }
};

function InitialPlaceholder({ label, className = "" }: { label: string; className?: string }) {
  return <div aria-label={label} className={`grid place-items-center bg-[color:var(--client-primary-soft)] font-black text-[color:var(--client-primary)] ${className}`}>{label.trim().slice(0, 2).toUpperCase()}</div>;
}

function ratingValue(shop: CoreShopDetail) {
  const value = Number(shop.reviewSummary.ratingAverage);
  return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

function formatMoney(amount: string, currency: string, language: Language) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  const locale = language === "ja" ? "ja-JP" : language === "ko" ? "ko-KR" : language === "en" ? "en-US" : "zh-CN";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value.toLocaleString(locale)} ${currency}`;
  }
}

function FormalStoreContent({ copy, language, scope, shop }: {
  copy: FormalStoreDetailCopy;
  language: Language;
  scope: "user" | "merchant";
  shop: CoreShopDetail;
}) {
  const firstService = shop.services[0] ?? null;

  return (
    <>
      <SurfacePanel className="overflow-hidden p-0">
        {shop.coverUrl ? (
          <img alt={shop.name} className="h-52 w-full object-cover" src={getGeneratedImageThumbnailUrl(shop.coverUrl)} />
        ) : (
          <InitialPlaceholder className="h-52 w-full text-5xl" label={shop.name} />
        )}
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-[color:var(--client-text)]">{shop.name}</h1>
              <p className="mt-1 text-sm font-bold text-[color:var(--client-muted)]">{shop.city} · {shop.address}</p>
            </div>
            <div className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-2 text-sm font-black text-[color:var(--client-primary)]">
              ★ {ratingValue(shop)} · {copy.reviewCount(shop.reviewSummary.reviewCount)}
            </div>
          </div>
          {shop.description ? <p className="text-sm font-bold leading-6 text-[color:var(--client-muted)]">{shop.description}</p> : null}
          {shop.phone ? <a className="text-sm font-black text-[color:var(--client-primary)]" href={`tel:${shop.phone}`}>{shop.phone}</a> : null}
          {shop.reviewSummary.highlights.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {shop.reviewSummary.highlights.map((highlight) => <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1 text-xs font-black text-[color:var(--client-primary)]" key={highlight}>{highlight}</span>)}
            </div>
          ) : null}
        </div>
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <h2 className="text-lg font-black text-[color:var(--client-text)]">{copy.services}</h2>
        {shop.services.length === 0 ? (
          <p className="mt-3 text-sm font-bold text-[color:var(--client-muted)]">{copy.noServices}</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {shop.services.map((service) => (
              <article className="rounded-[22px] border border-[color:var(--client-line)] p-4" key={service.id}>
                <div className="flex gap-3">
                  {service.coverUrl ? (
                    <img alt={service.name} className="h-20 w-20 rounded-[18px] object-cover" src={getGeneratedImageThumbnailUrl(service.coverUrl)} />
                  ) : (
                    <InitialPlaceholder className="h-20 w-20 rounded-[18px] text-lg" label={service.name} />
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black text-[color:var(--client-text)]">{service.name}</h3>
                    {service.description ? <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-[color:var(--client-muted)]">{service.description}</p> : null}
                    <p className="mt-2 text-sm font-black text-[color:var(--client-primary)]">{formatMoney(service.priceAmount, service.currency, language)} · {copy.duration(service.durationMinutes)}</p>
                  </div>
                </div>
                <SecondaryButton className="mt-3 w-full" to={`/services/${service.id}`}>{copy.details}</SecondaryButton>
              </article>
            ))}
          </div>
        )}
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <h2 className="text-lg font-black text-[color:var(--client-text)]">{copy.technicians}</h2>
        {shop.technicians.length === 0 ? (
          <p className="mt-3 text-sm font-bold text-[color:var(--client-muted)]">{copy.noTechnicians}</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {shop.technicians.map((technician) => (
              <article className="rounded-[22px] border border-[color:var(--client-line)] p-4" key={technician.id}>
                <div className="flex items-center gap-3">
                  {technician.avatarUrl ? (
                    <img alt={technician.displayName} className="h-16 w-16 rounded-[20px] object-cover" src={getGeneratedImageThumbnailUrl(technician.avatarUrl)} />
                  ) : (
                    <InitialPlaceholder className="h-16 w-16 rounded-[20px] text-lg" label={technician.displayName} />
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-black text-[color:var(--client-text)]">{technician.displayName}</h3>
                    <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{technician.city}</p>
                    <p className="mt-1 text-xs font-black text-[color:var(--client-primary)]">★ {Number(technician.reviewSummary.ratingAverage).toFixed(1)} · {copy.reviewCount(technician.reviewSummary.reviewCount)}</p>
                  </div>
                </div>
                <SecondaryButton className="mt-3 w-full" to={getScopedProfileDetailPath(scope, "technician", String(technician.id))}>{copy.details}</SecondaryButton>
              </article>
            ))}
          </div>
        )}
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <h2 className="text-lg font-black text-[color:var(--client-text)]">{copy.reviews}</h2>
        <p className="mt-3 text-2xl font-black text-[color:var(--client-text)]">★ {ratingValue(shop)}</p>
        <p className="mt-1 text-sm font-bold text-[color:var(--client-muted)]">{copy.reviewCount(shop.reviewSummary.reviewCount)}</p>
        <p className="mt-4 rounded-[18px] border border-dashed border-[color:var(--client-line)] p-4 text-sm font-bold leading-6 text-[color:var(--client-muted)]">{copy.noPublicReviewDetails}</p>
      </SurfacePanel>

      {firstService ? <PrimaryButton className="sticky bottom-4 z-30 w-full" to={`/checkout/${firstService.id}`}>{copy.book}</PrimaryButton> : null}
    </>
  );
}

export function FormalStoreDetailPage({ shopId, scope }: { shopId: number; scope: "user" | "merchant" }) {
  const navigate = useNavigate();
  const { language } = useI18n();
  const copy = copyByLanguage[language];
  const [revision, setRevision] = useState(0);
  const query = useCoreReadQuery(() => coreReadApi.getShopDetail(shopId), [shopId, revision]);

  return (
    <PageScaffold contentClassName="space-y-4 pb-32" navItems={scope === "merchant" ? [] : undefined}>
      <AppTopBar onBack={() => navigate(-1)} subtitle={copy.apiSource} title={copy.title} />
      {query.loading ? <SurfacePanel className="p-6 text-center" aria-live="polite">{copy.loading}</SurfacePanel> : null}
      {query.error ? <EmptyStatePanel title={copy.loadFailed} caption={query.error} action={<PrimaryButton onClick={() => setRevision((current) => current + 1)}>{copy.retry}</PrimaryButton>} /> : null}
      {!query.loading && !query.error && !query.data ? <EmptyStatePanel title={copy.unavailable} caption={copy.apiSource} /> : null}
      {query.data ? <FormalStoreContent copy={copy} language={language} scope={scope} shop={query.data} /> : null}
    </PageScaffold>
  );
}
