import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AppIcon, IconButton, floatingHeaderControlButtonClassName } from "../../components/client-ui/AppScaffold";
import { featureCarouselFrameClassName, FeatureCarousel, type FeatureCarouselSlide } from "../../components/client-ui/FeatureCarousel";
import { FloatingHomeHeader, floatingHeaderGlassPanelClassName, floatingHeaderPillSurfaceClassName } from "../../components/mobile/FloatingHomeHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { Badge } from "../../components/ui/Badge";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { coreReadApi, mapCoreCategoryToServiceCategory, mapCoreServiceToServiceItem, mapCoreShopToStore, mapCoreTechnicianToTechnician } from "../../features/core-read/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { getCategoryHeroImage, orderedServiceCategories, type HomeCategoryId } from "../../lib/homeCategories";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { useHorizontalDragScroll } from "../../lib/useHorizontalDragScroll";
import { cn, yen } from "../../lib/utils";
import { TechnicianShowcaseCard, getTechnicianDynamicPath, UnifiedSimpleProfileCard } from "../../shared/profile-card";
import type { ServiceCategory, ServiceItem, Store, Technician } from "../../types/domain";

const categoryDescriptionMap: Record<HomeCategoryId, string> = {
  cleaning: "日常保洁、深度保洁、厨卫清洁、退房清扫",
  massage: "肩颈、腰背、全身、深夜到家",
  recycle: "旧家电、家具、纸箱、搬家杂物",
  pet: "喂养、遛狗、猫砂清理、洗护接送",
  business: "办公室保洁、商旅按摩、接待预约、企业月结",
  dining: "聚餐订位、包间预约、门店到店服务",
  repair: "水电、门锁、家具、墙面小修",
  laundry: "洗护、熨烫、取送、衣物整理",
  moving: "同城搬家、行李搬运、小型货运",
  appliance: "空调、洗衣机、油烟机、浴室干燥机",
  install: "灯具、家电、家具、门锁安装",
  beauty: "美甲、美睫、妆发、上门护理",
  nanny: "保姆、月嫂、育儿陪护、住家服务",
  care: "陪护、康养、术后护理、长期照料",
  deep: "重油污、水垢、空置房、重点区域清洁",
  storage: "收纳规划、衣橱整理、空间归位",
  homecare: "木地板、沙发、家居保养维护",
  guide: "景点讲解、路线规划、陪同接待",
  property: "看房陪同、租住咨询、区域介绍",
  tutor: "语言辅导、数学陪练、升学答疑",
  sports: "健身陪练、拉伸放松、基础体能训练",
  legal: "合同说明、法务咨询、纠纷整理",
  renovation: "局部翻新、家具安装、小型改造",
  other: "临时陪同、代办跑腿、非标准化需求"
};

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
const homeCategoryIdSet = new Set(orderedServiceCategories.map((item) => item.id));
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

function getDeterministicRank(seed: string) {
  let hash = 0;

  for (const char of seed) {
    hash = (hash * 33 + char.charCodeAt(0)) % 10007;
  }

  return hash % 17;
}

function buildCategoryTokens(category: ServiceCategory, relatedServices: ServiceItem[]) {
  return Array.from(
    new Set([
      category.name,
      category.id,
      categoryDescriptionMap[category.id as HomeCategoryId] ?? "",
      ...relatedServices.flatMap((service) => [service.name, service.summary, ...service.tags])
    ])
  );
}

function getTechnicianGenderLabels(gender?: Technician["gender"]) {
  if (gender === "female") {
    return ["女", "女性", "女性技师", "女技师"];
  }

  if (gender === "male") {
    return ["男", "男性", "男性技师", "男技师"];
  }

  return [];
}

function buildServiceSearchFragments(service: ServiceItem, category?: ServiceCategory) {
  return [
    service.name,
    service.summary,
    service.fastestArrival,
    service.mode,
    category?.name ?? "",
    category ? categoryDescriptionMap[category.id as HomeCategoryId] ?? "" : "",
    ...service.tags,
    ...service.serviceAreas,
    ...service.notice,
    ...service.flow,
    ...service.packages.flatMap((item) => [item.name, item.description, ...item.includes])
  ];
}

function buildTechnicianSearchFragments(technician: Technician) {
  return [
    technician.name,
    technician.nickname ?? "",
    technician.bio ?? "",
    technician.identityLabel ?? "",
    technician.role,
    technician.status,
    ...getTechnicianGenderLabels(technician.gender),
    ...technician.skills,
    ...technician.serviceAreas,
    ...technician.languages,
    ...(technician.profileTags ?? [])
  ];
}

function buildStoreSearchFragments(store: Store, linkedTechnicians: Technician[]) {
  return [
    store.name,
    store.area,
    store.address,
    store.description,
    store.rankLabel,
    store.businessHours,
    store.mode,
    ...store.tags,
    ...linkedTechnicians.flatMap(buildTechnicianSearchFragments)
  ];
}

function matchesAllSearchKeywords(fragments: string[], keywords: string[]) {
  const normalizedKeywords = keywords.map(normalizeText).filter(Boolean);

  if (normalizedKeywords.length === 0) {
    return true;
  }

  const haystack = fragments.filter(Boolean).map(normalizeText).join("|");
  return normalizedKeywords.every((keyword) => haystack.includes(keyword));
}

function parseSearchDraft(value: string) {
  const parts = value
    .trim()
    .split(/[，、,]+|\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const tagIds: string[] = [];
  const customLabels: string[] = [];

  parts.forEach((part) => {
    const matchedTag = findTagByText(part);

    if (matchedTag) {
      tagIds.push(matchedTag.id);
      return;
    }

    const normalizedLabel = formatSearchDisplayLabel(part);

    if (normalizedLabel) {
      customLabels.push(normalizedLabel);
    }
  });

  return {
    tagIds: uniqueStrings(tagIds),
    customLabels: uniqueStrings(customLabels)
  };
}

function formatSearchDisplayLabel(value: string) {
  const plainValue = value.replace(/^[＃#]+/, "").trim();
  return plainValue;
}

function buildDisplayLabels(tagIds: string[], customLabels: string[]) {
  const knownLabels = uniqueStrings(tagIds)
    .map((tagId) => popularCategoryTagMap.get(tagId)?.label)
    .filter((label): label is string => Boolean(label));

  return [...knownLabels, ...uniqueStrings(customLabels)];
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

function resolveMatchedCategories(tagIds: string[] = []) {
  const selectedCategoryIds = uniqueStrings(
    tagIds.map((tagId) => popularCategoryTagMap.get(tagId)?.categoryId).filter((categoryId): categoryId is HomeCategoryId => Boolean(categoryId))
  );

  if (selectedCategoryIds.length === 0) {
    return orderedServiceCategories;
  }

  return orderedServiceCategories.filter((category) => selectedCategoryIds.includes(category.id as HomeCategoryId));
}

function scoreByTokens(fragments: string[], tokens: string[]) {
  const haystack = fragments.filter(Boolean).map(normalizeText).join("|");

  return tokens.reduce((total, token, index) => {
    const normalized = normalizeText(token);

    if (!normalized || !haystack.includes(normalized)) {
      return total;
    }

    return total + Math.max(1, 6 - index);
  }, 0);
}

function rankStoreForCategory(store: Store, linkedTechnicians: Technician[], category: ServiceCategory, tokens: string[]) {
  const semanticScore = scoreByTokens(buildStoreSearchFragments(store, linkedTechnicians), tokens);
  const modeScore = category.mode === "store" ? 12 : category.mode === "both" ? 6 : 2;

  return semanticScore * 10 + modeScore + getDeterministicRank(`${category.id}:${store.id}`);
}

function rankTechnicianForCategory(technician: Technician, category: ServiceCategory, tokens: string[]) {
  const semanticScore = scoreByTokens(buildTechnicianSearchFragments(technician), tokens);
  const modeScore = category.mode === "home" ? 12 : category.mode === "both" ? 8 : 3;

  return semanticScore * 10 + modeScore + getDeterministicRank(`${category.id}:${technician.id}`);
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

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" className={cn("h-3.5 w-3.5 transition", open ? "rotate-180" : "")} fill="none" viewBox="0 0 20 20">
      <path d="m5.5 7.5 4.5 4.5 4.5-4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function ServicePreviewCard({ service }: { service: ServiceItem }) {
  return (
    <Link
      className="overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)] shadow-[0_18px_36px_rgba(0,0,0,0.06)]"
      to={`/services/${service.id}`}
    >
      <div className="relative h-[126px] overflow-hidden bg-black">
        <img alt={service.name} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(service.cover)} />
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-1 text-[15px] font-black text-[color:var(--client-text)]">{service.name}</h3>
            <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[color:var(--client-muted)]">{service.summary}</p>
          </div>
          <Badge className="shrink-0 whitespace-nowrap" tone="green">{service.fastestArrival}</Badge>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-wrap gap-2">
            {service.tags.slice(0, 2).map((tag) => (
              <span
                className="inline-flex rounded-full bg-[color:var(--client-primary-soft)] px-2.5 py-1 text-[11px] font-black text-[color:var(--client-primary)]"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
          <strong className="shrink-0 text-[15px] font-black text-[color:var(--client-text)]">{yen(service.priceFrom)} 起</strong>
        </div>
      </div>
    </Link>
  );
}

export function CategoryPage() {
  const navigate = useNavigate();
  const { language } = useI18n();
  const t = (text: string) => translateText(text, language);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCategoryId = searchParams.get("category");
  const entityFilter = normalizeEntityFilter(searchParams.get("type"));
  const initialTagIds = getTagIdsFromSearchParams(searchParams);
  const [activeCategoryId, setActiveCategoryId] = useState<HomeCategoryId>(
    initialCategoryId && homeCategoryIdSet.has(initialCategoryId)
      ? (initialCategoryId as HomeCategoryId)
      : ((orderedServiceCategories[0]?.id ?? "cleaning") as HomeCategoryId)
  );
  const [searchDraft, setSearchDraft] = useState("");
  const [appliedTagIds, setAppliedTagIds] = useState<string[]>(initialTagIds);
  const [appliedCustomLabels, setAppliedCustomLabels] = useState<string[]>([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const { scrollRef: tagRailRef, dragScrollProps: tagRailDragProps } = useHorizontalDragScroll({});
  const categoryQuery = useCoreReadQuery(() => coreReadApi.listCategories({ pageSize: 100 }), []);
  const apiCategoryId = useMemo(
    () =>
      categoryQuery.data?.list.find((category) => mapCoreCategoryToServiceCategory(category).id === activeCategoryId)?.id,
    [activeCategoryId, categoryQuery.data]
  );
  const searchKeyword = useMemo(() => buildDisplayLabels(appliedTagIds, appliedCustomLabels).join(" "), [appliedCustomLabels, appliedTagIds]);
  const hasExplicitCategoryScope = Boolean(searchParams.get("category")) || appliedTagIds.length > 0 || appliedCustomLabels.length > 0;
  const searchCategoryId = entityFilter === "technician" && !hasExplicitCategoryScope ? undefined : apiCategoryId;
  const searchQuery = useCoreReadQuery(
    () =>
      coreReadApi.search({
        categoryId: searchCategoryId,
        keyword: searchKeyword || undefined,
        pageSize: 40,
        sort: "rating_desc"
      }),
    [searchCategoryId, searchKeyword]
  );
  const apiServices = useMemo(
    () => searchQuery.data?.list.map(mapCoreServiceToServiceItem) ?? [],
    [searchQuery.data]
  );
  const apiStores = useMemo(
    () =>
      Array.from(new Map((searchQuery.data?.list ?? []).map((service) => {
        const store = mapCoreShopToStore(service.shop);
        return [store.id, store] as const;
      })).values()),
    [searchQuery.data]
  );
  const apiTechnicians = useMemo(
    () =>
      Array.from(new Map((searchQuery.data?.list ?? []).flatMap((service) => {
        if (!service.technician) {
          return [];
        }

        const technician = mapCoreTechnicianToTechnician(service.technician);
        return [[technician.id, technician] as const];
      })).values()),
    [searchQuery.data]
  );
  const serviceByTechnicianId = useMemo(
    () => {
      const entries = (searchQuery.data?.list ?? [])
        .filter((service) => Boolean(service.technician))
        .map((service) => [String(service.technician?.id), mapCoreServiceToServiceItem(service)] as const);

      return new Map(entries);
    },
    [searchQuery.data]
  );

  useEffect(() => {
    const requestedCategoryId = searchParams.get("category");

    if (!requestedCategoryId || !homeCategoryIdSet.has(requestedCategoryId)) {
      return;
    }

    const nextCategoryId = requestedCategoryId as HomeCategoryId;

    if (nextCategoryId !== activeCategoryId) {
      setActiveCategoryId(nextCategoryId);
    }
  }, [activeCategoryId, searchParams]);

  useEffect(() => {
    const nextTagIds = getTagIdsFromSearchParams(searchParams);
    const requestedCategoryId = searchParams.get("category");

    setAppliedTagIds((current) => (areStringListsEqual(current, nextTagIds) ? current : nextTagIds));

    if (requestedCategoryId && homeCategoryIdSet.has(requestedCategoryId)) {
      return;
    }

    if (nextTagIds.length === 0) {
      return;
    }

    const preferredCategoryId = findPreferredCategoryId(
      nextTagIds,
      orderedServiceCategories.map((category) => category.id)
    );

    if (preferredCategoryId) {
      setActiveCategoryId(preferredCategoryId);
    }
  }, [searchParams]);

  const filteredCategories = useMemo(() => resolveMatchedCategories(appliedTagIds), [appliedTagIds]);
  const activeCategory =
    filteredCategories.find((category) => category.id === activeCategoryId) ??
    filteredCategories[0] ??
    orderedServiceCategories.find((category) => category.id === activeCategoryId) ??
    orderedServiceCategories[0];
  const appliedSearchKeywords = appliedCustomLabels;
  const hasAppliedSearch = appliedTagIds.length > 0 || appliedSearchKeywords.length > 0;
  const scopedCategoryIds = useMemo(
    () => (appliedTagIds.length > 0 ? filteredCategories.map((category) => category.id) : []),
    [appliedTagIds.length, filteredCategories]
  );
  const relatedServices = useMemo(
    () => {
      const hasActiveCategoryResult = apiServices.some((service) => service.categoryId === activeCategory.id);
      const categoryScope = scopedCategoryIds.length > 0 ? scopedCategoryIds : appliedSearchKeywords.length > 0 || !hasActiveCategoryResult ? [] : [activeCategory.id];

      return apiServices
        .filter((service) => categoryScope.length === 0 || categoryScope.includes(service.categoryId))
        .filter((service) => {
          const category = orderedServiceCategories.find((item) => item.id === service.categoryId);
          return matchesAllSearchKeywords(buildServiceSearchFragments(service, category), appliedSearchKeywords);
        })
        .sort((left, right) => right.sales - left.sales || right.rating - left.rating)
        .slice(0, 4);
    },
    [activeCategory.id, apiServices, appliedSearchKeywords, scopedCategoryIds]
  );
  const categoryTokens = useMemo(
    () => uniqueStrings([...buildCategoryTokens(activeCategory, relatedServices), ...appliedSearchKeywords]),
    [activeCategory, appliedSearchKeywords, relatedServices]
  );

  const relatedStores = useMemo(
    () =>
      apiStores
        .map((store) => {
          const linkedTechnicians = apiTechnicians.filter((technician) => technician.storeId === store.id);

          return {
            store,
            technicians: linkedTechnicians,
            score: rankStoreForCategory(store, linkedTechnicians, activeCategory, categoryTokens)
          };
        })
        .filter((item) => matchesAllSearchKeywords(buildStoreSearchFragments(item.store, item.technicians), appliedSearchKeywords))
        .sort((left, right) => right.score - left.score)
        .slice(0, entityFilter === "store" ? 10 : 3),
    [activeCategory, apiStores, apiTechnicians, appliedSearchKeywords, categoryTokens, entityFilter]
  );

  const relatedTechnicians = useMemo(
    () =>
      apiTechnicians
        .map((technician) => ({
          technician,
          score: rankTechnicianForCategory(technician, activeCategory, categoryTokens)
        }))
        .filter((item) => matchesAllSearchKeywords(buildTechnicianSearchFragments(item.technician), appliedSearchKeywords))
        .sort((left, right) => right.score - left.score)
        .slice(0, entityFilter === "technician" ? 20 : 4),
    [activeCategory, apiTechnicians, appliedSearchKeywords, categoryTokens, entityFilter]
  );

  const bookableProfiles = useMemo(
    () =>
      [
        ...(entityFilter === "all" || entityFilter === "store"
          ? relatedStores.map((item) => ({ id: `shop-${item.store.id}`, type: "shop" as const, score: item.score, store: item.store, technicians: item.technicians }))
          : []),
        ...(entityFilter === "all" || entityFilter === "technician"
          ? relatedTechnicians.map((item) => ({ id: `technician-${item.technician.id}`, type: "technician" as const, score: item.score, technician: item.technician }))
          : [])
      ]
        .sort((left, right) => right.score - left.score)
        .slice(0, entityFilter === "technician" ? 20 : entityFilter === "store" ? 12 : 6),
    [entityFilter, relatedStores, relatedTechnicians]
  );
  const bookableStoreProfiles = useMemo(
    () => bookableProfiles.filter((item): item is Extract<(typeof bookableProfiles)[number], { type: "shop" }> => item.type === "shop"),
    [bookableProfiles]
  );
  const bookableTechnicianProfiles = useMemo(
    () => bookableProfiles.filter((item): item is Extract<(typeof bookableProfiles)[number], { type: "technician" }> => item.type === "technician"),
    [bookableProfiles]
  );

  const categoryHeroSlides = useMemo<FeatureCarouselSlide[]>(() => {
    const serviceSlides = relatedServices.slice(0, 3).map((service) => ({
      id: `category-service-${service.id}`,
      badge: t("全部分类"),
      title: t(activeCategory.name),
      caption: `${t(service.name)} · ${t(service.summary)}`,
      cta: t("查看服务"),
      image: service.cover,
      to: `/services/${service.id}`
    }));

    if (serviceSlides.length > 0) {
      return serviceSlides;
    }

    return uniqueById([activeCategory, ...filteredCategories])
      .slice(0, 3)
      .map((category) => ({
        id: `category-fallback-${category.id}`,
        badge: t("全部分类"),
        title: t(category.name),
        caption: t(categoryDescriptionMap[category.id as HomeCategoryId] ?? "从上方标签快速切换查看当前分类内容。"),
        cta: t("进入分类"),
        image: getCategoryHeroImage(category.id as HomeCategoryId),
        to: `/categories?category=${category.id}`
      }));
  }, [activeCategory, filteredCategories, language, relatedServices]);
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

  const handleCategorySelect = (categoryId: HomeCategoryId) => {
    setActiveCategoryId((current) => (current === categoryId ? current : categoryId));
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("category", categoryId);
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
    const parsedDraft = parseSearchDraft(draftValue);

    if (parsedDraft.tagIds.length === 0 && parsedDraft.customLabels.length === 0) {
      setSearchDraft("");
      return;
    }

    const nextTagIds = uniqueStrings([...appliedTagIds, ...parsedDraft.tagIds]);
    const nextCustomLabels = uniqueStrings([...appliedCustomLabels, ...parsedDraft.customLabels]);
    const matchedCategories = resolveMatchedCategories(nextTagIds);

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
  const showServiceSection = entityFilter === "all" || entityFilter === "service";
  const hasVisibleResults = (showServiceSection && relatedServices.length > 0) || bookableProfiles.length > 0;
  const showEmptyState = filteredCategories.length === 0 || (hasAppliedSearch && !hasVisibleResults);
  const isCoreReadLoading = categoryQuery.loading || searchQuery.loading;
  const coreReadError = categoryQuery.error ?? searchQuery.error;

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
                    "flex h-11 min-w-0 flex-1 items-center gap-2 px-3 pr-1.5 text-[color:var(--client-muted)]",
                    floatingHeaderPillSurfaceClassName,
                    "bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] shadow-[0_10px_24px_rgba(0,0,0,0.05)]"
                  )}
                >
                  <AppIcon className="h-4 w-4" name="search" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)]"
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
                    "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-3.5 text-[13px] font-black text-[color:var(--client-text)]",
                    floatingHeaderPillSurfaceClassName,
                    "bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] shadow-[0_10px_24px_rgba(0,0,0,0.05)]"
                  )}
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
                const active = appliedTagIds.includes(tag.id) || (!hasAppliedSearch && !searchDraft.trim() && activeCategory.id === tag.categoryId);

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

            {tagMenuOpen ? (
              <div className="absolute inset-x-3 top-full z-50 mt-2 rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_96%,transparent)] p-4 shadow-[0_22px_50px_rgba(0,0,0,0.16)] backdrop-blur-2xl">
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
                    const active = appliedTagIds.includes(tag.id) || (!hasAppliedSearch && !searchDraft.trim() && activeCategory.id === tag.categoryId);

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
            ) : null}
          </div>
        </FloatingHomeHeader>

        <div className="space-y-4 px-4 pb-28 pt-4">
          <section className="space-y-3">
            <FeatureCarousel autoRotateMs={5200} cardHeightClassName="h-[204px]" slides={categoryHeroSlides} />

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
                          当前分类切换后，这里的服务、店铺和技师推荐会同步刷新，不再固定显示同一批内容。
                        </p>
                        <div className="rounded-[14px] bg-[color:color-mix(in_srgb,var(--client-primary)_10%,var(--client-surface))] px-3 py-2.5">
                          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--client-primary)]">当前聚焦</p>
                          <p className="mt-1 text-[12px] leading-5 text-[color:var(--client-text)]">
                            {activeCategory.name}，下面会优先展示对应的服务摘要与可预约店铺 / 个人技师。
                          </p>
                        </div>
                      </div>
                    }
                    label="可预约服务列表说明"
                    infoPanelClassName="border-transparent"
                    title="可预约服务列表"
                    titleClassName="text-[20px] font-black tracking-[-0.02em] text-[color:var(--client-text)]"
                  />
                </div>
              </div>

              {showServiceSection && relatedServices.length > 0 ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {relatedServices.slice(0, 2).map((service) => (
                    <ServicePreviewCard key={service.id} service={service} />
                  ))}
                </div>
              ) : showServiceSection ? (
                <div className="rounded-[24px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-4 py-5 text-[13px] leading-6 text-[color:var(--client-muted)]">
                  当前分类暂时没有独立服务套餐卡，先为你展示最匹配的可预约店铺与个人技师。
                </div>
              ) : null}

              {bookableProfiles.length > 0 ? (
                <div className="space-y-3">
                  {bookableStoreProfiles.map((item) => (
                    <UnifiedSimpleProfileCard
                      className="border-transparent"
                      detailTo={`/stores/${item.store.id}`}
                      entityType="shop"
                      key={item.id}
                      store={item.store}
                      technicians={item.technicians}
                      variant="list"
                    />
                  ))}

                  {bookableTechnicianProfiles.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
                      {bookableTechnicianProfiles.map((item, index) => (
                        <TechnicianShowcaseCard
                          detailTo={getTechnicianDynamicPath(item.technician)}
                          directService={serviceByTechnicianId.get(item.technician.id)}
                          fallbackServices={relatedServices}
                          key={item.id}
                          language={language}
                          rankIndex={index}
                          technician={item.technician}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          )}
        </div>
      </div>
    </MobileShell>
  );
}
