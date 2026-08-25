# Formal Store Detail Real-Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the numeric customer/merchant store-detail route with an API-only page that displays persisted shop, service, technician-test-account, and aggregate-review data without legacy virtual metrics or review rows.

**Architecture:** Add a focused `FormalStoreDetailPage` that consumes `CoreShopDetail` directly through `coreReadApi.getShopDetail`. Keep the existing `StoreDetailExperience` intact for direct merchant presentation calls and explicit static-demo compatibility; make `StoreDetailPage` a narrow route switch between those two surfaces.

**Tech Stack:** React 19, TypeScript strict mode, React Router, Vite, Vitest raw-source contract tests, existing NeeDo client UI and i18n providers.

## Global Constraints

- This is one Step 09 frontend mock-retirement micro-step; do not change Prisma, migrations, seed, backend APIs, Booking state, orders, wallet, schedule, IM, Social, or theme tokens.
- Numeric store routes may render only fields returned by `CoreShopDetail` and its nested API records.
- Do not import `src/data/mock.ts`, `entityStore`, browser-local orders, or Social compatibility into the formal page.
- Do not derive acceptance/cancellation rates, favorite/share counts, rankings, newcomer badges, technician-owned recommendations, availability copy, or individual reviews.
- Keep the existing `StoreDetailExperience` and its direct merchant presentation caller working.
- All newly visible fixed copy must use the existing i18n language state and include `zh`, `zh-Hant`, `ja`, `en`, and `ko` values.

---

### Task 1: Add the API-only formal store page

**Files:**
- Create: `src/pages/user/FormalStoreDetailPage.test.ts`
- Create: `src/pages/user/FormalStoreDetailPage.tsx`

**Interfaces:**
- Consumes: `coreReadApi.getShopDetail(shopId: number): Promise<CoreShopDetail>`, `useCoreReadQuery<TData>(load, deps)`, and `getScopedProfileDetailPath(scope, "technician", id)`.
- Produces: `FormalStoreDetailPage({ shopId, scope }: { shopId: number; scope: "user" | "merchant" }): JSX.Element`.

- [ ] **Step 1: Write the failing source-contract test**

Create `src/pages/user/FormalStoreDetailPage.test.ts` with assertions that establish the formal-data boundary:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { FormalStoreContent } from "./FormalStoreDetailPage";
import source from "./FormalStoreDetailPage.tsx?raw";
import type { CoreShopDetail } from "../../features/core-read/api";

describe("FormalStoreDetailPage real-data boundary", () => {
  it("loads the numeric shop through the core-read API", () => {
    expect(source).toContain("coreReadApi.getShopDetail(shopId)");
    expect(source).toContain("shop.services.map");
    expect(source).toContain("shop.technicians.map");
    expect(source).toContain("shop.reviewSummary");
    expect(source).toContain("const firstService = shop.services[0] ?? null;");
    expect(source).toContain('to={`/checkout/${firstService.id}`}');
  });

  it("does not depend on legacy or browser-local records", () => {
    expect(source).not.toContain("data/mock");
    expect(source).not.toContain("entityStore");
    expect(source).not.toContain("userOrderStore");
    expect(source).not.toContain("features/social");
  });

  it("does not render unsupported virtual store metrics or review rows", () => {
    ["acceptRate", "cancelRate", "favoriteCount", "shareCount", "shareContent", "Best", "newcomer", "review.author", "review.body"].forEach((token) => {
      expect(source).not.toContain(token);
    });
    expect(source).toContain("noPublicReviewDetails");
  });

  it("renders API records and only the first real service as the booking action", () => {
    const shop = {
      id: 1,
      name: "API Store",
      city: "Tokyo",
      address: "1-1",
      coverUrl: null,
      description: "Persisted description",
      phone: null,
      latitude: null,
      longitude: null,
      mediaAssets: [],
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
      reviewSummary: { ratingAverage: "4.8", reviewCount: 2, latestReviewAt: null, highlights: ["Clean"] },
      services: [
        {
          id: 11, name: "Real Service One", description: null, city: "Tokyo", priceAmount: "6800", currency: "JPY", durationMinutes: 120, coverUrl: null,
          category: { id: 1, code: "care", name: "Care", nameJa: null, nameEn: null, parentId: null, iconUrl: null, sortOrder: 1, isActive: true, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" },
          shop: { id: 1, name: "API Store", city: "Tokyo", address: "1-1", coverUrl: null, reviewSummary: { ratingAverage: "4.8", reviewCount: 2, latestReviewAt: null, highlights: [] } },
          technician: null, reviewSummary: { ratingAverage: "4.8", reviewCount: 2, latestReviewAt: null, highlights: [] }
        },
        {
          id: 12, name: "Real Service Two", description: null, city: "Tokyo", priceAmount: "7800", currency: "JPY", durationMinutes: 90, coverUrl: null,
          category: { id: 1, code: "care", name: "Care", nameJa: null, nameEn: null, parentId: null, iconUrl: null, sortOrder: 1, isActive: true, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" },
          shop: { id: 1, name: "API Store", city: "Tokyo", address: "1-1", coverUrl: null, reviewSummary: { ratingAverage: "4.8", reviewCount: 2, latestReviewAt: null, highlights: [] } },
          technician: null, reviewSummary: { ratingAverage: "4.8", reviewCount: 2, latestReviewAt: null, highlights: [] }
        }
      ],
      technicians: [{ id: 21, displayName: "Real Technician", city: "Tokyo", avatarUrl: null, reviewSummary: { ratingAverage: "invalid", reviewCount: 1, latestReviewAt: null, highlights: [] } }]
    } satisfies CoreShopDetail;
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(FormalStoreContent, { language: "en", scope: "user", shop }))
    );

    expect(html).toContain("API Store");
    expect(html).toContain("Real Service One");
    expect(html).toContain("Real Technician");
    expect(html).toContain('href="/checkout/11"');
    expect(html).not.toContain('href="/checkout/12"');
    expect(html).not.toContain("NaN");
  });

  it("uses multilingual fixed copy and neutral missing-image states", () => {
    expect(source).toContain("type FormalStoreDetailCopy");
    expect(source).toContain('zh: {');
    expect(source).toContain('"zh-Hant": {');
    expect(source).toContain('ja: {');
    expect(source).toContain('en: {');
    expect(source).toContain('ko: {');
    expect(source).toContain("InitialPlaceholder");
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```bash
npx vitest run src/pages/user/FormalStoreDetailPage.test.ts
```

Expected: FAIL because `FormalStoreDetailPage.tsx` does not exist.

- [ ] **Step 3: Implement the formal page with direct API fields**

Create `src/pages/user/FormalStoreDetailPage.tsx` with these concrete responsibilities:

```tsx
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
import { getScopedProfileDetailPath } from "../../shared/profile-detail";

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

function ratingValue(reviewSummary: CoreShopDetail["reviewSummary"]) {
  const value = Number(reviewSummary.ratingAverage);
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

export function FormalStoreContent({ language, scope, shop }: {
  language: Language;
  scope: "user" | "merchant";
  shop: CoreShopDetail;
}) {
  const copy = copyByLanguage[language];
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
              ★ {ratingValue(shop.reviewSummary)} · {copy.reviewCount(shop.reviewSummary.reviewCount)}
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
                    <p className="mt-1 text-xs font-black text-[color:var(--client-primary)]">★ {ratingValue(technician.reviewSummary)} · {copy.reviewCount(technician.reviewSummary.reviewCount)}</p>
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
        <p className="mt-3 text-2xl font-black text-[color:var(--client-text)]">★ {ratingValue(shop.reviewSummary)}</p>
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
      {query.data ? <FormalStoreContent language={language} scope={scope} shop={query.data} /> : null}
    </PageScaffold>
  );
}
```

- [ ] **Step 4: Run the focused test and type-check**

Run:

```bash
npx vitest run src/pages/user/FormalStoreDetailPage.test.ts
npx tsc -b --noEmit
```

Expected: the focused test passes and TypeScript reports no errors introduced by the new component.

- [ ] **Step 5: Commit the formal page slice**

```bash
git add src/pages/user/FormalStoreDetailPage.tsx src/pages/user/FormalStoreDetailPage.test.ts
git commit -m "feat: add real-data store detail page"
```

---

### Task 2: Route numeric stores away from the legacy experience

**Files:**
- Modify: `src/pages/user/StoreDetailPage.test.ts`
- Modify: `src/pages/user/StoreDetailPage.tsx:1-60,4164-4201`

**Interfaces:**
- Consumes: `FormalStoreDetailPage({ shopId, scope })` from Task 1 and `isStaticDemoMode(): boolean`.
- Produces: `StoreDetailPage` route behavior where numeric IDs always use the formal page, explicit static-demo nonnumeric IDs use the legacy page, and formal nonnumeric IDs show an unavailable state.

- [ ] **Step 1: Add failing route-isolation assertions**

Append this test group to `src/pages/user/StoreDetailPage.test.ts`:

```ts
describe("StoreDetailPage formal route isolation", () => {
  it("routes numeric IDs to the API-only page", () => {
    expect(pageSource).toContain('import { FormalStoreDetailPage } from "./FormalStoreDetailPage";');
    expect(pageSource).toContain("if (apiId) {");
    expect(pageSource).toContain("return <FormalStoreDetailPage scope={scope} shopId={apiId} />;");
  });

  it("keeps nonnumeric legacy records inside static-demo mode", () => {
    expect(pageSource).toContain("const allowLegacyStore = isStaticDemoMode();");
    expect(pageSource).toContain("allowLegacyStore ? stores.find((item) => item.id === id) ?? null : null");
    expect(pageSource).not.toContain("stores.find((item) => item.id === id) ?? stores[0]");
  });

  it("localizes the formal invalid-link state", () => {
    expect(pageSource).toContain("const formalStoreLinkCopy: Record<Language");
    expect(pageSource).toContain("formalStoreLinkCopy[language]");
  });
});
```

- [ ] **Step 2: Run the route test and verify it fails**

Run:

```bash
npx vitest run src/pages/user/StoreDetailPage.test.ts
```

Expected: FAIL because the numeric route still maps API records into `StoreDetailExperience` and the nonnumeric route still falls back to `stores[0]`.

- [ ] **Step 3: Make `StoreDetailPage` a route switch**

Add imports:

```ts
import { isStaticDemoMode } from "../../api/staticDemoMode";
import { FormalStoreDetailPage } from "./FormalStoreDetailPage";
```

Remove the route-only imports `mapCoreShopToStore`, `mapCoreTechnicianToTechnician`, and `useCoreReadQuery` if no legacy code above uses them. Replace the current exported route component with:

```tsx
const formalStoreLinkCopy: Record<Language, { description: string; title: string }> = {
  zh: { description: "请从正式店铺列表重新选择店铺。", title: "店铺链接不可用" },
  "zh-Hant": { description: "請從正式店鋪列表重新選擇店鋪。", title: "店鋪連結不可用" },
  ja: { description: "正式な店舗一覧から店舗を選び直してください。", title: "店舗リンクを利用できません" },
  en: { description: "Select the store again from the formal store list.", title: "Store link unavailable" },
  ko: { description: "정식 매장 목록에서 매장을 다시 선택해 주세요.", title: "매장 링크를 사용할 수 없습니다" }
};

export function StoreDetailPage({ scope = "user" }: { scope?: "user" | "merchant" } = {}) {
  const { id } = useParams();
  const { stores } = useEntityStore();
  const { language } = useI18n();
  const apiId = coreReadIdFromRoute(id);

  if (apiId) {
    return <FormalStoreDetailPage scope={scope} shopId={apiId} />;
  }

  const allowLegacyStore = isStaticDemoMode();
  const legacyStore = allowLegacyStore ? stores.find((item) => item.id === id) ?? null : null;

  if (!legacyStore) {
    const unavailableCopy = formalStoreLinkCopy[language];
    return <StoreDetailStatus description={unavailableCopy.description} scope={scope} title={unavailableCopy.title} />;
  }

  return <StoreDetailExperience scope={scope} store={legacyStore} />;
}
```

This removes the API-to-legacy mapping that fabricated technician service ownership and prevents the first-local-store fallback.

- [ ] **Step 4: Run store-detail and direct-caller regressions**

Run:

```bash
npx vitest run src/pages/user/FormalStoreDetailPage.test.ts src/pages/user/StoreDetailPage.test.ts src/pages/mobile/MerchantPortalPage.test.tsx src/components/client-ui/AppScaffold.test.tsx
```

Expected: all focused tests pass, including tests that still exercise `StoreDetailExperience` source contracts.

- [ ] **Step 5: Commit the routing slice**

```bash
git add src/pages/user/StoreDetailPage.tsx src/pages/user/StoreDetailPage.test.ts
git commit -m "fix: isolate formal store routes from legacy data"
```

---

### Task 3: Document and verify the mock-retirement boundary

**Files:**
- Modify: `docs/MOCK_RETIREMENT_MAP.md`

**Interfaces:**
- Consumes: the formal page and route behavior from Tasks 1-2.
- Produces: repository documentation and fresh verification evidence for the completed micro-step.

- [ ] **Step 1: Update the StoreDetailPage entry**

Change the Step 09 store-detail paragraph to state:

```markdown
`src/pages/user/StoreDetailPage.tsx` routes numeric store IDs to the isolated `FormalStoreDetailPage`, which renders only `/api/v1/shops/:id` shop, service, technician and aggregate-review fields. Nonnumeric legacy stores are reachable only in explicit static-demo mode; `StoreDetailExperience` remains for direct merchant presentation compatibility and is not used by numeric formal routes.
```

- [ ] **Step 2: Run policy scans**

Run:

```bash
rg -n "data/mock|entityStore|userOrderStore|features/social|acceptRate|cancelRate|Best|newcomer" src/pages/user/FormalStoreDetailPage.tsx
rg -n "TODO|FIXME|not implemented" src/pages/user/FormalStoreDetailPage.tsx src/pages/user/FormalStoreDetailPage.test.ts src/pages/user/StoreDetailPage.tsx
```

Expected: both commands produce no matches.

- [ ] **Step 3: Run the complete frontend gates**

Run:

```bash
npm run lint
npm test -- --run
npm run verify:production-build
```

Expected: TypeScript, Vitest, formal production build, and production-bundle audit all pass. If unrelated dirty-worktree failures appear, record the exact failing files and separately rerun every test directly owned by this plan.

- [ ] **Step 4: Validate a seeded numeric store in the browser**

Start or reuse the formal local services, then open a seeded route such as `/stores/1`. Confirm from visible UI and network data that:

- service cards match `shop.services` IDs/names/prices;
- technician cards match `shop.technicians` IDs/names/avatars;
- no 98% acceptance, favorites, share counts, ranking badges, mock service ownership, 林小雨/佐藤健 review rows, or replacement people are visible;
- a missing image shows initials rather than an unrelated generated image;
- service and technician links retain numeric IDs.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/MOCK_RETIREMENT_MAP.md
git commit -m "docs: record formal store detail retirement"
```
