import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AppIcon, IconButton, floatingHeaderControlButtonClassName } from "../../components/client-ui/AppScaffold";
import { featureCarouselFrameClassName } from "../../components/client-ui/FeatureCarousel";
import {
  FloatingHomeHeader,
  floatingHeaderGlassPanelClassName,
  floatingHeaderPillSurfaceClassName,
  floatingHeaderSearchFieldClassName,
  floatingHeaderSearchIconClassName,
  floatingHeaderSearchInputClassName
} from "../../components/mobile/FloatingHomeHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { useOptionalAuth } from "../../auth/AuthProvider";
import {
  coreReadApi,
  mapCoreCategoryToServiceCategory,
  mapCoreServiceToServiceItem,
  type CoreShopCard,
  type CoreTechnicianCard
} from "../../features/core-read/api";
import {
  entityEngagementApi,
  type EntityFavoriteState,
  type EntityTarget
} from "../../features/entity-engagement/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import { PublishedCarousel } from "../../features/content-publication/PublishedCarousel";
import { resolveSearchOrigin } from "../../features/location/searchOrigin";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { type HomeCategoryId } from "../../lib/homeCategories";
import { useHorizontalDragScroll } from "../../lib/useHorizontalDragScroll";
import { useHomeLayoutStore } from "../../state/homeLayoutStore";
import { useHomeLocationPreference } from "../../state/homeLocationStore";
import { cn } from "../../lib/utils";
import type { ServiceCategory, ServiceItem, Technician } from "../../types/domain";
import {
  SocialProfileMiniCard,
  TechnicianShowcaseCard,
  type SocialProfileMiniData
} from "../../shared/profile-card";
import { mapServiceItemToUnifiedData, UnifiedServiceInfoCard } from "../../shared/service-card";
import { canRunCategorySearch, parseCategorySearchDraft } from "./categorySearch";

type PopularSearchTag = {
  id: string;
  label: string;
  query: string;
  categoryId: HomeCategoryId;
  aliases?: string[];
};

type CategoryEntityFilter = "all" | "store" | "technician" | "service";

const popularCategoryTags: PopularSearchTag[] = [
  { id: "tag-cleaning-home", label: "家政", query: "#家政", categoryId: "cleaning", aliases: ["家庭保洁", "保洁"] },
  { id: "tag-massage-door", label: "上门按摩", query: "#上门按摩", categoryId: "massage", aliases: ["按摩", "肩颈放松"] },
  { id: "tag-business-host", label: "商务接待", query: "#商务接待", categoryId: "business", aliases: ["商务", "接待预约"] },
  { id: "tag-dining-room", label: "包间预订", query: "#包间预订", categoryId: "dining", aliases: ["餐饮预约", "聚餐订位"] },
  { id: "tag-repair-home", label: "上门维修", query: "#上门维修", categoryId: "repair", aliases: ["维修", "家居小修"] },
  { id: "tag-appliance-ac", label: "空调清洗", query: "#空调清洗", categoryId: "appliance", aliases: ["家电清洗"] },
  { id: "tag-beauty-door", label: "上门美业", query: "#上门美业", categoryId: "beauty", aliases: ["美甲美睫", "妆发"] },
  { id: "tag-photo-booking", label: "约拍", query: "#约拍", categoryId: "beauty", aliases: ["模特拍照", "拍照", "写真", "摄影"] },
  { id: "tag-pet-care", label: "宠物相关", query: "#宠物相关", categoryId: "pet", aliases: ["宠物照看", "遛狗喂养"] },
  { id: "tag-recycle-home", label: "二手回收", query: "#二手回收", categoryId: "recycle", aliases: ["上门回收", "旧物回收"] },
  { id: "tag-moving-city", label: "同城搬家", query: "#同城搬家", categoryId: "moving", aliases: ["搬家", "货运搬运"] },
  { id: "tag-nanny-yuesao", label: "月嫂", query: "#月嫂", categoryId: "nanny", aliases: ["保姆月嫂", "育儿陪护"] },
  { id: "tag-care-health", label: "康养护理", query: "#康养护理", categoryId: "care", aliases: ["护理", "陪护"] },
  { id: "tag-cleaning-deep", label: "深度保洁", query: "#深度保洁", categoryId: "deep", aliases: ["重度清洁"] },
  { id: "tag-storage-home", label: "收纳整理", query: "#收纳整理", categoryId: "storage", aliases: ["衣橱整理"] },
  { id: "tag-homecare", label: "家居养护", query: "#家居养护", categoryId: "homecare", aliases: ["家具养护"] },
  { id: "tag-guide", label: "陪同导游", query: "#陪同导游", categoryId: "guide", aliases: ["导游", "路线规划"] },
  { id: "tag-property", label: "看房陪同", query: "#看房陪同", categoryId: "property", aliases: ["不动产", "租住咨询"] },
  { id: "tag-tutor", label: "家庭教师", query: "#家庭教师", categoryId: "tutor", aliases: ["一对一辅导"] },
  { id: "tag-sports", label: "健身陪练", query: "#健身陪练", categoryId: "sports", aliases: ["运动指导", "拉伸"] },
  { id: "tag-legal", label: "法务咨询", query: "#法务咨询", categoryId: "legal", aliases: ["法律支援", "合同说明"] },
  { id: "tag-renovation", label: "装修翻新", query: "#装修翻新", categoryId: "renovation", aliases: ["装修", "局部翻新"] }
];

const pinnedCategoryTags = popularCategoryTags.slice(0, 10);
const popularCategoryTagMap = new Map(popularCategoryTags.map((item) => [item.id, item] as const));
const entityFilterTags: Array<{ value: CategoryEntityFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "store", label: "店铺" },
  { value: "technician", label: "技师" },
  { value: "service", label: "服务" }
];
const entityFilterMenuTags = entityFilterTags.filter((tag) => tag.value !== "all");
const activeSearchChipClassName =
  "rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,var(--client-surface))] px-3 py-1.5 text-[12px] font-black text-[color:var(--client-primary)]";

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[＃#]/g, "").replace(/\s+/g, "");
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items));
}

function isFiniteMetric(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeMetric(value: unknown) {
  return isFiniteMetric(value) ? Math.max(0, Math.floor(value)) : 0;
}

function parseFormalRating(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function entityTargetKey(target: EntityTarget) {
  return `${target.targetType}:${target.publicId}`;
}

function buildFormalShopCardData(shop: CoreShopCard): SocialProfileMiniData {
  return {
    id: shop.publicId,
    entityType: "shop",
    displayName: shop.name,
    avatar: shop.coverUrl ?? "",
    coverImage: shop.coverUrl ?? "",
    regionLabel: shop.city,
    addressLabel: shop.city,
    addressValue: shop.address,
    primaryLabel: "店铺",
    kycVerified: false,
    serviceTags: (Array.isArray(shop.businessKeywords) ? shop.businessKeywords : []).map((keyword) => keyword.label).slice(0, 5),
    levelLabel: "",
    scoreLabel: "服务评价",
    scoreValue: `${parseFormalRating(shop.reviewSummary.ratingAverage).toFixed(1)}/5`,
    followerCount: normalizeMetric(shop.favoriteCount),
    followingCount: 0,
    shareCount: normalizeMetric(shop.shareCount),
    detailPath: `/stores/${shop.id}`
  };
}

function buildFormalTechnicianInput(technician: CoreTechnicianCard): Technician {
  return {
    id: String(technician.id),
    systemId: technician.publicId,
    name: technician.displayName,
    storeId: "",
    role: "therapist",
    status: "off",
    rating: parseFormalRating(technician.reviewSummary.ratingAverage),
    orderCount: normalizeMetric(technician.completedOrderCount),
    income: 0,
    skills: [],
    serviceAreas: technician.city ? [technician.city] : [],
    acceptRate: normalizeMetric(technician.acceptanceRatePercent),
    cancelRate: 0,
    reviewCount: normalizeMetric(technician.reviewSummary.reviewCount),
    favoriteCount: normalizeMetric(technician.favoriteCount),
    shareCount: normalizeMetric(technician.shareCount),
    distanceKm: technician.distanceKm,
    languages: [],
    avatar: technician.avatarUrl ?? ""
  };
}

function findTagByText(value: string) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  return (
    popularCategoryTags.find((tag) =>
      [tag.query, tag.label, ...(tag.aliases ?? [])].some((candidate) => normalizeText(candidate) === normalized)
    ) ?? null
  );
}

function getTagIdsFromSearchParams(searchParams: URLSearchParams) {
  const rawValues = [...searchParams.getAll("tag"), ...searchParams.getAll("tags")]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return uniqueStrings(
    rawValues
      .map((value) => {
        if (popularCategoryTagMap.has(value)) {
          return value;
        }

        return findTagByText(value)?.id ?? "";
      })
      .filter(Boolean)
  );
}

function areStringListsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function normalizeEntityFilter(value: string | null): CategoryEntityFilter {
  if (value === "store" || value === "technician" || value === "service") {
    return value;
  }

  return "all";
}

function findPreferredCategoryId(tagIds: string[], availableCategoryIds: string[]) {
  const preferredCategoryIds = uniqueStrings(
    tagIds.map((tagId) => popularCategoryTagMap.get(tagId)?.categoryId).filter((categoryId): categoryId is HomeCategoryId => Boolean(categoryId))
  );

  for (let index = preferredCategoryIds.length - 1; index >= 0; index -= 1) {
    const categoryId = preferredCategoryIds[index];

    if (availableCategoryIds.includes(categoryId)) {
      return categoryId;
    }
  }

  return null;
}

function resolveMatchedCategories(categories: ServiceCategory[], tagIds: string[] = []) {
  const selectedCategoryIds = uniqueStrings(
    tagIds.map((tagId) => popularCategoryTagMap.get(tagId)?.categoryId).filter((categoryId): categoryId is HomeCategoryId => Boolean(categoryId))
  );

  if (selectedCategoryIds.length === 0) {
    return categories;
  }

  return categories.filter((category) => selectedCategoryIds.includes(category.id as HomeCategoryId));
}

function CoreReadInlineState({
  description,
  title
}: {
  description: string;
  title: string;
}) {
  return (
    <section className={cn(featureCarouselFrameClassName, "rounded-[28px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-5 py-10 text-center")}>
      <p className="text-[16px] font-black text-[color:var(--client-text)]">{title}</p>
      <p className="mt-2 text-[13px] leading-6 text-[color:var(--client-muted)]">{description}</p>
    </section>
  );
}

function CoreReadScopedState({
  description,
  onRetry,
  title
}: {
  description: string;
  onRetry?: () => void;
  title: string;
}) {
  const { language } = useI18n();

  return (
    <div className="rounded-[24px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-4 py-5 text-center">
      <p className="text-[14px] font-black text-[color:var(--client-text)]">{title}</p>
      <p className="mt-1 text-[12px] leading-5 text-[color:var(--client-muted)]">{description}</p>
      {onRetry ? (
        <button
          className="mt-3 rounded-full bg-[color:var(--client-primary)] px-4 py-2 text-[12px] font-black text-[#090806]"
          onClick={onRetry}
          type="button"
        >
          {translateText("重试", language)}
        </button>
      ) : null}
    </div>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" className={cn("h-3.5 w-3.5 transition", open ? "rotate-180" : "")} fill="none" viewBox="0 0 20 20">
      <path d="m5.5 7.5 4.5 4.5 4.5-4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function ServicePreviewCard({ service }: { service: ServiceItem }) {
  return <UnifiedServiceInfoCard data={mapServiceItemToUnifiedData(service)} detailTo={`/services/${service.id}`} />;
}

export function CategoryPage() {
  const navigate = useNavigate();
  const auth = useOptionalAuth();
  const { language } = useI18n();
  const t = (text: string) => translateText(text, language);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCategoryId = searchParams.get("category");
  const entityFilter = normalizeEntityFilter(searchParams.get("type"));
  const initialTagIds = getTagIdsFromSearchParams(searchParams);
  const [activeCategoryId, setActiveCategoryId] = useState<HomeCategoryId>(
    (initialCategoryId || "cleaning") as HomeCategoryId
  );
  const [searchDraft, setSearchDraft] = useState("");
  const [appliedTagIds, setAppliedTagIds] = useState<string[]>(initialTagIds);
  const [appliedCustomLabels, setAppliedCustomLabels] = useState<string[]>([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const { config: homeLayoutConfig } = useHomeLayoutStore();
  const { state: homeLocationPreference } = useHomeLocationPreference();
  const selectedServiceLocation =
    homeLayoutConfig.locations.find(
      (location) => location.id === homeLayoutConfig.selectedLocationId
    ) ?? homeLayoutConfig.locations[0];
  const searchOrigin = resolveSearchOrigin({
    selectedServiceLocation,
    deviceLocation: homeLocationPreference
  });
  const { scrollRef: tagRailRef, dragScrollProps: tagRailDragProps } = useHorizontalDragScroll({});
  const categoryQuery = useCoreReadQuery(
    () => coreReadApi.listCategories({ pageSize: 100 }),
    [],
    { key: "core:categories:page-size-100" }
  );
  const availableCategories = useMemo(
    () => uniqueById((categoryQuery.data?.list ?? []).map(mapCoreCategoryToServiceCategory)),
    [categoryQuery.data]
  );
  const availableCategoryIdSet = useMemo(
    () => new Set(availableCategories.map((category) => category.id)),
    [availableCategories]
  );
  const selectedHomeCategoryIds = useMemo(
    () => {
      const explicitCategoryIds = uniqueStrings([
        ...appliedTagIds
        .map((tagId) => popularCategoryTagMap.get(tagId)?.categoryId ?? "")
        .filter(Boolean),
        searchParams.get("category") ?? ""
      ].filter(Boolean));

      if (explicitCategoryIds.length > 0 || appliedCustomLabels.length > 0) {
        return explicitCategoryIds;
      }

      if (entityFilter !== "all") {
        return [];
      }

      return ["cleaning"];
    },
    [appliedCustomLabels, appliedTagIds, entityFilter, searchParams]
  );
  const searchCategoryIds = useMemo(
    () => uniqueStrings(
      (categoryQuery.data?.list ?? [])
        .filter((category) => selectedHomeCategoryIds.includes(mapCoreCategoryToServiceCategory(category).id))
        .map((category) => String(category.id))
    ).map(Number),
    [categoryQuery.data, selectedHomeCategoryIds]
  );
  const coreSearchQuery = useMemo(
    () => ({
      keywords: appliedCustomLabels,
      categoryIds: searchCategoryIds,
      pageSize: 40,
      sort: "rating_desc" as const
    }),
    [appliedCustomLabels, searchCategoryIds]
  );
  const technicianCoreSearchQuery = useMemo(
    () => ({
      ...coreSearchQuery,
      ...(searchOrigin
        ? { latitude: searchOrigin.latitude, longitude: searchOrigin.longitude }
        : {})
    }),
    [coreSearchQuery, searchOrigin?.latitude, searchOrigin?.longitude]
  );
  const searchTermsKey = useMemo(
    () => JSON.stringify({
      categoryIds: [...searchCategoryIds].sort((left, right) => left - right),
      keywords: [...appliedCustomLabels].sort()
    }),
    [appliedCustomLabels, searchCategoryIds]
  );
  const [shopRetryKey, setShopRetryKey] = useState(0);
  const [technicianRetryKey, setTechnicianRetryKey] = useState(0);
  const [serviceRetryKey, setServiceRetryKey] = useState(0);
  const loadShops = entityFilter === "all" || entityFilter === "store";
  const loadTechnicians = entityFilter === "all" || entityFilter === "technician";
  const loadServices = entityFilter === "all" || entityFilter === "service";
  const searchFiltersReady = canRunCategorySearch({
    selectedHomeCategoryIds,
    searchCategoryIds,
    keywords: appliedCustomLabels
  });
  const shopSearchQuery = useCoreReadQuery(
    () => loadShops && searchFiltersReady ? coreReadApi.searchShops(coreSearchQuery) : null,
    [loadShops, searchFiltersReady, searchTermsKey, shopRetryKey],
    {
      enabled: loadShops && searchFiltersReady,
      force: shopRetryKey > 0,
      key: `core:shop-search:${searchTermsKey}`
    }
  );
  const technicianSearchQuery = useCoreReadQuery(
    () => loadTechnicians && searchFiltersReady ? coreReadApi.searchTechnicians(technicianCoreSearchQuery) : null,
    [
      loadTechnicians,
      searchFiltersReady,
      searchTermsKey,
      searchOrigin?.latitude,
      searchOrigin?.longitude,
      technicianRetryKey
    ],
    {
      enabled: loadTechnicians && searchFiltersReady,
      force: technicianRetryKey > 0,
      key: `core:technician-search:${searchTermsKey}:${searchOrigin?.latitude ?? ""}:${searchOrigin?.longitude ?? ""}`
    }
  );
  const serviceSearchQuery = useCoreReadQuery(
    () => loadServices && searchFiltersReady ? coreReadApi.searchServices(coreSearchQuery) : null,
    [loadServices, searchFiltersReady, searchTermsKey, serviceRetryKey],
    {
      enabled: loadServices && searchFiltersReady,
      force: serviceRetryKey > 0,
      key: `core:service-search:${searchTermsKey}`
    }
  );
  const apiServices = useMemo(
    () => serviceSearchQuery.data?.list.map(mapCoreServiceToServiceItem) ?? [],
    [serviceSearchQuery.data]
  );
  const apiStores = useMemo(
    () => shopSearchQuery.data?.list ?? [],
    [shopSearchQuery.data]
  );
  const apiTechnicians = useMemo(
    () => technicianSearchQuery.data?.list ?? [],
    [technicianSearchQuery.data]
  );

  useEffect(() => {
    const requestedCategoryId = searchParams.get("category");

    if (!requestedCategoryId || !availableCategoryIdSet.has(requestedCategoryId)) {
      return;
    }

    const nextCategoryId = requestedCategoryId as HomeCategoryId;

    if (nextCategoryId !== activeCategoryId) {
      setActiveCategoryId(nextCategoryId);
    }
  }, [activeCategoryId, availableCategoryIdSet, searchParams]);

  useEffect(() => {
    const nextTagIds = getTagIdsFromSearchParams(searchParams);
    const requestedCategoryId = searchParams.get("category");

    setAppliedTagIds((current) => (areStringListsEqual(current, nextTagIds) ? current : nextTagIds));

    if (requestedCategoryId && availableCategoryIdSet.has(requestedCategoryId)) {
      return;
    }

    if (nextTagIds.length === 0) {
      return;
    }

    const preferredCategoryId = findPreferredCategoryId(
      nextTagIds,
      availableCategories.map((category) => category.id)
    );

    if (preferredCategoryId) {
      setActiveCategoryId(preferredCategoryId);
    }
  }, [availableCategories, availableCategoryIdSet, searchParams]);

  useEffect(() => {
    const firstCategoryId = availableCategories[0]?.id;

    if (!firstCategoryId || availableCategoryIdSet.has(activeCategoryId)) {
      return;
    }

    setActiveCategoryId(firstCategoryId as HomeCategoryId);
  }, [activeCategoryId, availableCategories, availableCategoryIdSet]);

  const filteredCategories = useMemo(
    () => resolveMatchedCategories(availableCategories, appliedTagIds),
    [appliedTagIds, availableCategories]
  );
  const activeCategory =
    filteredCategories.find((category) => category.id === activeCategoryId) ??
    filteredCategories[0] ??
    availableCategories.find((category) => category.id === activeCategoryId) ??
    availableCategories[0] ??
    null;
  const appliedSearchKeywords = appliedCustomLabels;
  const hasAppliedSearch = entityFilter !== "all" || appliedTagIds.length > 0 || appliedSearchKeywords.length > 0;
  const relatedServices = useMemo(
    () => [...apiServices]
      .sort((left, right) => right.sales - left.sales || right.rating - left.rating)
      .slice(0, entityFilter === "service" ? 20 : 4),
    [apiServices, entityFilter]
  );
  const relatedStores = useMemo(
    () => apiStores.slice(0, entityFilter === "store" ? 10 : 3),
    [apiStores, entityFilter]
  );

  const relatedTechnicians = useMemo(
    () => apiTechnicians.slice(0, entityFilter === "technician" ? 20 : 4),
    [apiTechnicians, entityFilter]
  );

  const shopProfiles = useMemo(
    () => relatedStores.map((profile) => ({
      id: `shop-${profile.id}`,
      profile,
      cardData: buildFormalShopCardData(profile)
    })),
    [relatedStores]
  );
  const technicianProfiles = useMemo(
    () => relatedTechnicians.map((profile) => ({
      id: `technician-${profile.id}`,
      profile,
      technician: buildFormalTechnicianInput(profile)
    })),
    [relatedTechnicians]
  );
  const visibleEngagementTargets = useMemo(
    () => [
      ...relatedStores.map((profile) => ({
        targetType: "shop" as const,
        publicId: profile.publicId,
        favoriteCount: normalizeMetric(profile.favoriteCount),
        shareCount: normalizeMetric(profile.shareCount)
      })),
      ...relatedTechnicians.map((profile) => ({
        targetType: "technician" as const,
        publicId: profile.publicId,
        favoriteCount: normalizeMetric(profile.favoriteCount),
        shareCount: normalizeMetric(profile.shareCount)
      }))
    ],
    [relatedStores, relatedTechnicians]
  );
  const visibleEngagementTargetKey = useMemo(
    () => visibleEngagementTargets.map(entityTargetKey).join("|"),
    [visibleEngagementTargets]
  );
  const [favoriteStates, setFavoriteStates] = useState<Record<string, EntityFavoriteState>>({});

  useEffect(() => {
    const visibleKeys = new Set(visibleEngagementTargets.map(entityTargetKey));

    setFavoriteStates((current) => {
      const next: Record<string, EntityFavoriteState> = {};
      visibleEngagementTargets.forEach((target) => {
        const key = entityTargetKey(target);
        next[key] = current[key] ?? {
          targetType: target.targetType,
          publicId: target.publicId,
          favoriteCount: target.favoriteCount,
          isFavorited: false
        };
      });
      return Object.keys(current).every((key) => visibleKeys.has(key)) && Object.keys(current).length === Object.keys(next).length
        ? current
        : next;
    });
    if (!auth?.isAuthenticated || visibleEngagementTargets.length === 0) {
      return undefined;
    }

    let stale = false;
    void entityEngagementApi
      .getFavoriteStatuses(visibleEngagementTargets.map(({ targetType, publicId }) => ({ targetType, publicId })))
      .then(({ list }) => {
        if (stale) return;
        setFavoriteStates((current) => {
          const next = { ...current };
          list.forEach((state) => {
            next[entityTargetKey(state)] = state;
          });
          return next;
        });
      })
      .catch(() => undefined);

    return () => {
      stale = true;
    };
  }, [auth?.isAuthenticated, visibleEngagementTargetKey]);

  const getFavoriteState = (target: EntityTarget, fallbackCount: number): EntityFavoriteState =>
    favoriteStates[entityTargetKey(target)] ?? { ...target, favoriteCount: fallbackCount, isFavorited: false };

  const appliedSearchChips = useMemo(() => {
    const chips: Array<
      | { kind: "entity"; key: string; label: string; value: CategoryEntityFilter }
      | { kind: "tag"; key: string; label: string; tagId: string }
      | { kind: "custom"; key: string; label: string }
    > = [];

    if (entityFilter !== "all") {
      const label = entityFilterTags.find((tag) => tag.value === entityFilter)?.label ?? entityFilter;
      chips.push({ kind: "entity", key: `entity-${entityFilter}`, label, value: entityFilter });
    }

    appliedTagIds.forEach((tagId) => {
      const label = popularCategoryTagMap.get(tagId)?.label;

      if (label) {
        chips.push({ kind: "tag", key: `tag-${tagId}`, label, tagId });
      }
    });

    appliedCustomLabels.forEach((label) => {
      chips.push({ kind: "custom", key: `custom-${label}`, label });
    });

    return chips;
  }, [appliedCustomLabels, appliedTagIds, entityFilter]);
  const emptySearchLabels = appliedSearchChips.map((chip) => chip.label);

  const syncTagSearchParams = (nextTagIds: string[], nextCategoryId?: HomeCategoryId) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("tag");
      next.delete("tags");

      nextTagIds.forEach((tagId) => next.append("tag", tagId));

      if (nextCategoryId) {
        next.set("category", nextCategoryId);
      }

      return next;
    }, { replace: true });
  };

  const handleEntityFilterSelect = (nextEntityFilter: CategoryEntityFilter) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);

      if (nextEntityFilter === "all") {
        next.delete("type");
      } else {
        next.set("type", nextEntityFilter);
      }

      return next;
    }, { replace: true });
  };

  const applySearch = (draftValue = searchDraft) => {
    const parsedDraft = parseCategorySearchDraft(draftValue, findTagByText);

    if (parsedDraft.tagIds.length === 0 && parsedDraft.customLabels.length === 0) {
      setSearchDraft("");
      return;
    }

    const nextTagIds = uniqueStrings([...appliedTagIds, ...parsedDraft.tagIds]);
    const nextCustomLabels = uniqueStrings([...appliedCustomLabels, ...parsedDraft.customLabels]);
    const matchedCategories = resolveMatchedCategories(availableCategories, nextTagIds);

    setSearchDraft("");
    setAppliedTagIds(nextTagIds);
    setAppliedCustomLabels(nextCustomLabels);

    if (nextTagIds.length > 0 && matchedCategories.length > 0) {
      const preferredCategoryId =
        findPreferredCategoryId(
          nextTagIds,
          matchedCategories.map((category) => category.id)
        ) ??
        (matchedCategories[0].id as HomeCategoryId);

      setActiveCategoryId(preferredCategoryId);
      syncTagSearchParams(nextTagIds, preferredCategoryId);
      return;
    }

    syncTagSearchParams(nextTagIds);
  };

  const handleTagSelect = (tag: PopularSearchTag) => {
    const active = appliedTagIds.includes(tag.id);
    const nextTagIds = active ? appliedTagIds.filter((tagId) => tagId !== tag.id) : uniqueStrings([...appliedTagIds, tag.id]);

    setSearchDraft("");
    setAppliedTagIds(nextTagIds);
    syncTagSearchParams(nextTagIds, active ? undefined : tag.categoryId);

    if (!active) {
      setActiveCategoryId(tag.categoryId);
    }
  };

  const handleCustomLabelRemove = (label: string) => {
    setAppliedCustomLabels((current) => current.filter((item) => item !== label));
  };

  const handleAppliedSearchChipRemove = (chip: (typeof appliedSearchChips)[number]) => {
    if (chip.kind === "entity") {
      handleEntityFilterSelect("all");
      return;
    }

    if (chip.kind === "tag") {
      const matchedTag = popularCategoryTagMap.get(chip.tagId);

      if (matchedTag) {
        handleTagSelect(matchedTag);
      }

      return;
    }

    handleCustomLabelRemove(chip.label);
  };

  const entityFilterLabel = entityFilterTags.find((tag) => tag.value === entityFilter)?.label ?? "全部";
  const showServiceSection = loadServices;
  const showShopSection = loadShops;
  const showTechnicianSection = loadTechnicians;
  const requestedSearchQueries = [
    ...(loadShops ? [shopSearchQuery] : []),
    ...(loadTechnicians ? [technicianSearchQuery] : []),
    ...(loadServices ? [serviceSearchQuery] : [])
  ];
  const hasStaticSearchContent = apiServices.length > 0 || apiStores.length > 0 || apiTechnicians.length > 0;
  const allRequestedSearchesLoading = requestedSearchQueries.length > 0 && requestedSearchQueries.every((query) => query.loading);
  const allRequestedSearchesSucceeded = requestedSearchQueries.every((query) => !query.loading && !query.error);
  const showEmptyState = !activeCategory || filteredCategories.length === 0 || (allRequestedSearchesSucceeded && !hasStaticSearchContent);
  const isCoreReadLoading = (categoryQuery.loading || allRequestedSearchesLoading) && !hasStaticSearchContent;
  const coreReadError = hasStaticSearchContent ? null : categoryQuery.error;

  const searchTagMenu = tagMenuOpen ? (
              <div id="category-search-tags" className="absolute inset-x-3 top-full z-50 mt-2 max-h-[65dvh] overflow-y-auto rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_96%,transparent)] p-4 shadow-[0_22px_50px_rgba(0,0,0,0.16)] backdrop-blur-2xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--client-primary)]">对象与人气标签</p>
                    <p className="mt-1 text-[12px] leading-5 text-[color:var(--client-muted)]">先选店铺、技师或服务，也可以继续多选分类标签刷新下方内容。</p>
                  </div>
                  <button
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-3 text-[12px] font-black text-[color:var(--client-text)]"
                    onClick={() => setTagMenuOpen(false)}
                    type="button"
                  >
                    收起
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {entityFilterMenuTags.map((tag) => {
                    const active = entityFilter === tag.value;

                    return (
                      <button
                        className="min-w-0 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] px-2 py-2 text-[13px] font-black transition"
                        key={`entity-${tag.value}`}
                        onClick={() => handleEntityFilterSelect(tag.value)}
                        type="button"
                      >
                        <span className={cn("transition", active ? "text-[color:var(--client-primary)]" : "text-[color:var(--client-text)]")}>{tag.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="my-4 h-px bg-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)]" />

                <div className="flex flex-wrap gap-2">
                  {popularCategoryTags.map((tag) => {
                    const active = appliedTagIds.includes(tag.id) || (!hasAppliedSearch && !searchDraft.trim() && activeCategory?.id === tag.categoryId);

                    return (
                      <button
                        className="rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] px-3.5 py-2 text-[13px] font-black transition"
                        key={tag.id}
                        onClick={() => handleTagSelect(tag)}
                        type="button"
                      >
                        <span className={cn("transition", active ? "text-[color:var(--client-primary)]" : "text-[color:var(--client-text)]")}>{tag.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null;

  return (
    <MobileShell>
      <div className="relative">
        {tagMenuOpen ? (
          <button
            aria-label="关闭筛选菜单"
            className="fixed inset-0 z-30 cursor-default bg-black/28 backdrop-blur-[3px]"
            onClick={() => setTagMenuOpen(false)}
            type="button"
          />
        ) : null}

        <FloatingHomeHeader
          className="gap-0"
          frameClassName="z-40"
          overlay={searchTagMenu}
          panelClassName={floatingHeaderGlassPanelClassName}
          spacerGapPx={0}
          stacked
        >
          <div className="relative px-3 pb-3">
            <div className="flex items-center gap-2">
                <IconButton
                  className={`${floatingHeaderControlButtonClassName} shrink-0`}
                  icon="back"
                  label="返回"
                  onClick={() => navigate(-1)}
                />

                <label
                  className={cn(
                    floatingHeaderSearchFieldClassName,
                    "pr-1.5"
                  )}
                >
                  <AppIcon className={floatingHeaderSearchIconClassName} name="search" />
                  <input
                    className={floatingHeaderSearchInputClassName}
                    onChange={(event) => {
                      setSearchDraft(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        applySearch();
                      }
                    }}
                    placeholder="输入关键词后添加"
                    value={searchDraft}
                  />
                  <button
                    className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--client-primary)] px-3 text-[12px] font-black text-[#090806] shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_28%,transparent)]"
                    onClick={() => applySearch()}
                    type="button"
                  >
                    添加
                  </button>
                </label>

                <button
                  className={cn(
                    "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-3.5 text-[13px] font-black text-[color:var(--client-text)]",
                    floatingHeaderPillSurfaceClassName,
                    "bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] shadow-[0_10px_24px_rgba(0,0,0,0.05)]"
                  )}
                  aria-controls="category-search-tags"
                  aria-expanded={tagMenuOpen}
                  onClick={() => setTagMenuOpen((current) => !current)}
                  type="button"
                >
                  {entityFilterLabel}
                  <ChevronDownIcon open={tagMenuOpen} />
                </button>
              </div>

            <div
              {...tagRailDragProps}
              className="mt-2 flex gap-2 overflow-x-auto py-1 [scrollbar-width:none]"
              ref={tagRailRef}
              style={{ msOverflowStyle: "none" }}
            >
              {pinnedCategoryTags.map((tag) => {
                const active = appliedTagIds.includes(tag.id) || (!hasAppliedSearch && !searchDraft.trim() && activeCategory?.id === tag.categoryId);

                return (
                  <button
                    className="shrink-0 whitespace-nowrap rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] px-3.5 py-2 text-[13px] font-black transition"
                    key={tag.id}
                    onClick={() => handleTagSelect(tag)}
                    type="button"
                  >
                    <span className={cn("transition", active ? "text-[color:var(--client-primary)]" : "text-[color:var(--client-text)]")}>{tag.label}</span>
                  </button>
                );
              })}
            </div>


          </div>
        </FloatingHomeHeader>

        <div className="space-y-4 px-4 pb-28 pt-4">
          <section className="space-y-3">
            <PublishedCarousel scene="user-home" cardHeightClassName="h-[204px]" />

            <div className="flex flex-wrap items-center gap-2 px-1">
              {appliedSearchChips.length > 0 ? (
                appliedSearchChips.map((chip) => (
                  <button
                    className={activeSearchChipClassName}
                    key={chip.key}
                    onClick={() => handleAppliedSearchChipRemove(chip)}
                    type="button"
                  >
                    {chip.label}
                    <span aria-hidden="true" className="ml-1.5 opacity-70">x</span>
                  </button>
                ))
              ) : (
                <span className="rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] px-3 py-1.5 text-[12px] font-black text-[color:var(--client-muted)]">
                  暂无生效标签
                </span>
              )}
            </div>
          </section>

          {isCoreReadLoading ? (
            <CoreReadInlineState description="正在从 /api/v1/search 与 /api/v1/categories 读取分类和搜索结果。" title="正在载入真实数据" />
          ) : coreReadError ? (
            <CoreReadInlineState description={coreReadError} title="搜索数据读取失败" />
          ) : showEmptyState ? (
            <section className={cn(featureCarouselFrameClassName, "rounded-[28px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-5 py-10 text-center")}>
              <p className="text-[16px] font-black text-[color:var(--client-text)]">{emptySearchLabels.length > 0 ? "没有找到匹配结果" : "没有找到匹配的标签或分类"}</p>
              {emptySearchLabels.length > 0 ? (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {emptySearchLabels.map((label) => (
                    <span
                      className="rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,var(--client-surface))] px-3 py-1 text-[12px] font-black whitespace-nowrap text-[color:var(--client-primary)]"
                      key={`missing-empty-${label}`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 text-[13px] leading-6 text-[color:var(--client-muted)]">可以调整上方标签，或重新输入别的关键词再试试。</p>
            </section>
          ) : (
            <section className={cn(featureCarouselFrameClassName, "space-y-4")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <TitleWithInfo
                    as="h2"
                    info={
                      <div className="space-y-2.5">
                        <p className="text-[13px] leading-6 text-[color:var(--client-text)]">
                          {t("搜索店铺、技师、服务")}
                        </p>
                        <div className="rounded-[14px] bg-[color:color-mix(in_srgb,var(--client-primary)_10%,var(--client-surface))] px-3 py-2.5">
                          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--client-primary)]">当前聚焦</p>
                          <p className="mt-1 text-[12px] leading-5 text-[color:var(--client-text)]">
                            {activeCategory?.name} · {t("搜索结果")}
                          </p>
                        </div>
                      </div>
                    }
                    label={t("搜索结果")}
                    infoPanelClassName="border-transparent"
                    title={t("搜索结果")}
                    titleClassName="text-[20px] font-black tracking-[-0.02em] text-[color:var(--client-text)]"
                  />
                </div>
              </div>

              {showServiceSection ? (
                <div className="space-y-3">
                  <h3 className="text-[16px] font-black text-[color:var(--client-text)]">{t("服务")}</h3>
                  {serviceSearchQuery.loading ? (
                    <CoreReadScopedState description={t("正在载入真实数据")} title={t("正在载入服务")} />
                  ) : serviceSearchQuery.error ? (
                    <CoreReadScopedState
                      description={serviceSearchQuery.error}
                      onRetry={() => setServiceRetryKey((current) => current + 1)}
                      title={`${t("服务")} · ${t("搜索失败，请稍后重试")}`}
                    />
                  ) : relatedServices.length > 0 ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {relatedServices.map((service) => (
                        <ServicePreviewCard key={service.id} service={service} />
                      ))}
                    </div>
                  ) : (
                    <CoreReadScopedState description={t("没有找到匹配结果")} title={t("服务")} />
                  )}
                </div>
              ) : null}

              {showShopSection ? (
                <div className="space-y-3">
                  <h3 className="text-[16px] font-black text-[color:var(--client-text)]">{t("店铺")}</h3>
                  {shopSearchQuery.loading ? (
                    <CoreReadScopedState description={t("正在载入真实数据")} title={t("正在载入店铺")} />
                  ) : shopSearchQuery.error ? (
                    <CoreReadScopedState
                      description={shopSearchQuery.error}
                      onRetry={() => setShopRetryKey((current) => current + 1)}
                      title={`${t("店铺")} · ${t("搜索失败，请稍后重试")}`}
                    />
                  ) : shopProfiles.length > 0 ? (
                    <div className="space-y-3">
                      {shopProfiles.map((item) => {
                        const target: EntityTarget = { targetType: "shop", publicId: item.profile.publicId };
                        const favoriteState = getFavoriteState(target, normalizeMetric(item.profile.favoriteCount));
                        const detailPath = `/stores/${item.profile.id}`;

                        return (
                          <SocialProfileMiniCard
                            data={{
                              ...item.cardData,
                              favoriteCount: isFiniteMetric(item.profile.favoriteCount)
                                ? favoriteState.favoriteCount
                                : undefined,
                              isFavorited: favoriteState.isFavorited,
                              shareCount: isFiniteMetric(item.profile.shareCount)
                                ? item.profile.shareCount
                                : undefined,
                            }}
                            detailTo={detailPath}
                            key={`${item.id}-${favoriteState.isFavorited}`}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <CoreReadScopedState description={t("没有找到匹配结果")} title={t("店铺")} />
                  )}
                </div>
              ) : null}

              {showTechnicianSection ? (
                <div className="space-y-3">
                  <h3 className="text-[16px] font-black text-[color:var(--client-text)]">{t("技师")}</h3>
                  {!searchOrigin ? (
                    <p
                      className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_8%,var(--client-surface))] px-3 py-2 text-[12px] leading-5 text-[color:var(--client-muted)]"
                      data-search-origin-guidance
                    >
                      {t("开启首页服务位置或设备定位后，可查看附近技师排名。")}
                    </p>
                  ) : null}
                  {technicianSearchQuery.loading ? (
                    <CoreReadScopedState description={t("正在载入真实数据")} title={t("正在载入技师")} />
                  ) : technicianSearchQuery.error ? (
                    <CoreReadScopedState
                      description={technicianSearchQuery.error}
                      onRetry={() => setTechnicianRetryKey((current) => current + 1)}
                      title={`${t("技师")} · ${t("搜索失败，请稍后重试")}`}
                    />
                  ) : technicianProfiles.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
                      {technicianProfiles.map((item, index) => {
                        const target: EntityTarget = { targetType: "technician", publicId: item.profile.publicId };
                        const favoriteState = getFavoriteState(target, normalizeMetric(item.profile.favoriteCount));
                        const detailPath = `/profiles/technician/${item.profile.publicId}`;

                        return (
                          <TechnicianShowcaseCard
                            detailTo={detailPath}
                            formalData={{
                              acceptanceRatePercent: item.profile.acceptanceRatePercent,
                              age: item.profile.age,
                              avatarUrl: item.profile.avatarUrl,
                              city: item.profile.city,
                              completedOrderCount: item.profile.completedOrderCount,
                              displayName: item.profile.displayName,
                              distanceKm: item.profile.distanceKm,
                              favoriteCount: isFiniteMetric(item.profile.favoriteCount)
                                ? favoriteState.favoriteCount
                                : undefined,
                              isFavorited: favoriteState.isFavorited,
                              languages: item.technician.languages,
                              nearbyRank: item.profile.nearbyRank,
                              primaryService: item.profile.primaryService,
                              ratingAverage: item.profile.reviewSummary.ratingAverage,
                              reviewCount: item.profile.reviewSummary.reviewCount,
                              shareCount: isFiniteMetric(item.profile.shareCount)
                                ? item.profile.shareCount
                                : undefined
                            }}
                            key={`${item.id}-${favoriteState.isFavorited}`}
                            language={language}
                            rankIndex={index}
                            technician={item.technician}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <CoreReadScopedState description={t("没有找到匹配结果")} title={t("技师")} />
                  )}
                </div>
              ) : null}
            </section>
          )}
        </div>
      </div>
    </MobileShell>
  );
}
