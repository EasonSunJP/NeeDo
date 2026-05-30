import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppIcon, FeatureSegmentedTabs } from "../../components/client-ui/AppScaffold";
import { FeatureCarousel, type FeatureCarouselSlide } from "../../components/client-ui/FeatureCarousel";
import { FloatingActionButton } from "../../components/mobile/FloatingActionButton";
import {
  FloatingHomeHeader,
  floatingHeaderGlassPanelClassName,
  floatingHeaderInnerClassName,
  floatingHeaderSearchFieldClassName,
  floatingHeaderSearchIconClassName,
  floatingHeaderSearchTextClassName
} from "../../components/mobile/FloatingHomeHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { roleBasedTabConfig } from "../../components/mobile/navItems";
import { SharedHomeHeader } from "../../components/mobile/SharedHomeHeader";
import { CloseIconButton } from "../../components/ui/CloseIconButton";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { useAuth } from "../../auth/AuthProvider";
import { serviceCategories, services as legacyServices } from "../../data/mock";
import { coreReadApi, mapCoreServiceToServiceItem, mapCoreShopToStore, mapCoreTechnicianToTechnician } from "../../features/core-read/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText, type Language } from "../../i18n/translations";
import { parseBrowserStorageJson, removeBrowserStorage, writeBrowserStorage } from "../../lib/browserStorage";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { cn } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import { getResolvedCarouselSlides, resolveCarouselTargetPath, useCarouselStore } from "../../state/homeCarouselStore";
import { useNeedoPetSettings } from "../../state/needoPetSettings";
import { useClientTheme, type ClientTheme } from "../../theme/ClientThemeProvider";
import { useUserOrders } from "../../state/userOrderStore";
import { SocialProfileMiniCard, TechnicianShowcaseCard, buildServiceMiniCardData, getTechnicianDynamicPath } from "../../shared/profile-card";
import { getCustomerLevelLabel } from "../../shared/profile-card/customerMembership";
import {
  useHomeLayoutStore,
  type HomeLocationOption,
  type HomeRecommendationTabKey,
  type HomeServiceModuleConfig
} from "../../state/homeLayoutStore";
import { syncHomeDeviceLocationForAppOpen } from "../../state/homeLocationStore";
import type { Order, ServiceItem, Store, Technician } from "../../types/domain";

const reminderDismissStorageKey = "needo.home.reminder.dismiss.v1";
const currentAppointmentStatuses: Order["status"][] = ["pending", "unpaid", "confirmed", "scheduled", "inService"];

type ServiceRecommendationCardData = {
  kind: "service";
  id: string;
  to: string;
  service: ServiceItem;
  provider?: Store | Technician;
};

type StoreRecommendationCardData = {
  kind: "store";
  id: string;
  to: string;
  store: Store;
};

type TechnicianRecommendationCardData = {
  kind: "technician";
  id: string;
  to: string;
  technician: Technician;
};

type RecommendationCardData = ServiceRecommendationCardData | StoreRecommendationCardData | TechnicianRecommendationCardData;

type ReminderState = {
  order: Order;
  minutesUntil: number;
  startsAt: string;
  store: Store | null;
  service: ServiceItem | null;
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function getLocationTokens(location: HomeLocationOption) {
  return [location.city, location.area, location.district ?? "", location.label].filter(Boolean).map(normalizeText);
}

function getLocationScore(values: string[], location: HomeLocationOption) {
  const haystack = values.filter(Boolean).map(normalizeText).join("|");

  if (!haystack) {
    return 0;
  }

  return getLocationTokens(location).reduce((total, token, index) => {
    if (!token) {
      return total;
    }

    return haystack.includes(token) ? total + Math.max(1, 4 - index) : total;
  }, 0);
}

function parseDateTime(value: string) {
  const [datePart, timePart = "00:00"] = value.split(" ");
  const [year = "1970", month = "01", day = "01"] = datePart.split("-");
  const [hour = "00", minute = "00"] = timePart.split(":");

  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
}

function formatDateTimeLabel(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function sortByLocation<T>(items: T[], getLocationValues: (item: T) => string[], location: HomeLocationOption) {
  return [...items].sort((left, right) => getLocationScore(getLocationValues(right), location) - getLocationScore(getLocationValues(left), location));
}

function getTextOverlapScore(values: string[], targets: string[]) {
  const haystack = values.filter(Boolean).map(normalizeText).join("|");

  if (!haystack) {
    return 0;
  }

  return targets.filter(Boolean).map(normalizeText).reduce((total, token) => {
    if (!token) {
      return total;
    }

    return haystack.includes(token) || token.includes(haystack) ? total + 1 : total;
  }, 0);
}

function getServiceProviderScore(values: string[], service: ServiceItem, location: HomeLocationOption) {
  const categoryName = serviceCategories.find((category) => category.id === service.categoryId)?.name ?? "";
  const serviceTerms = [service.name, categoryName, service.summary, ...service.tags, ...service.serviceAreas];

  return getLocationScore(values, location) * 4 + getTextOverlapScore(values, serviceTerms);
}

function resolveServiceProvider(service: ServiceItem, storeList: Store[], technicianList: Technician[], location: HomeLocationOption) {
  const providers: Array<Store | Technician> = service.mode === "store" ? storeList : technicianList;
  const scored = providers
    .map((provider) => {
      const values =
        "address" in provider
          ? [provider.name, provider.area, provider.address, provider.description, ...provider.tags]
          : [provider.name, provider.nickname ?? "", provider.bio ?? "", ...provider.skills, ...provider.serviceAreas, ...provider.languages];

      return {
        provider,
        score: getServiceProviderScore(values, service, location)
      };
    })
    .sort((left, right) => right.score - left.score);

  return scored[0]?.provider ?? storeList[0] ?? technicianList[0];
}

function getQuickActionTitleClassName(title: string) {
  const length = Array.from(title.replace(/\s/g, "")).length;

  if (length <= 5) {
    return "inline-block whitespace-nowrap";
  }

  if (length <= 8) {
    return "inline-block w-[136%] max-w-[136%] -mx-[18%] whitespace-nowrap [transform:scaleX(0.72)] [transform-origin:center]";
  }

  return "line-clamp-2";
}

const quickActionIconClassNames: Record<ClientTheme, string> = {
  "light-green": "bg-[color:var(--client-primary-soft)] text-[color:var(--client-accent-text)]",
  "dark-green": "bg-[color:var(--client-primary-soft)] text-[color:var(--client-accent-text)]",
  "black-gold": "bg-[color:var(--client-primary-soft)] text-[color:var(--client-accent-text)]",
  "vital-mono": "bg-[color:var(--client-primary-soft)] text-[color:var(--client-accent-text)]",
  "cool-black-gray": "bg-[color:var(--client-primary-soft)] text-[color:var(--client-accent-text)]",
  "neon-pink": "bg-[color:var(--client-primary-soft)] text-[color:var(--client-accent-text)]"
};

function getQuickActionIconClassName(theme: ClientTheme) {
  return quickActionIconClassNames[theme];
}

function getQuickActionTitle(id: string, sourceTitle: string, language: Language) {
  const quickActionTitles: Record<string, Partial<Record<Language, string>>> = {
    "nearby-technicians": {
      "zh-Hant": "附近技師",
      ja: "スタッフ探し",
      en: "Find staff",
      ko: "주변 기사 찾기"
    },
    "find-service": {
      "zh-Hant": "查找服務",
      ja: "サービス探し",
      en: "Find services",
      ko: "서비스 찾기"
    },
    "my-schedule": {
      "zh-Hant": "我的行程",
      ja: "スケジュール",
      en: "My schedule",
      ko: "내 일정"
    }
  };

  return quickActionTitles[id]?.[language] ?? translateText(sourceTitle, language);
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={cn("h-4 w-4", className)} fill="none" viewBox="0 0 24 24">
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
    </svg>
  );
}

function CalendarClockIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={cn("h-8 w-8", className)} fill="none" viewBox="0 0 24 24">
      <path
        d="M6.5 3.8v3.1M17.5 3.8v3.1M4.3 9.1h15.4M4.3 11.2V7.1c0-1.1.9-2 2-2h11.4c1.1 0 2 .9 2 2v6.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M4.3 11.2v6.1c0 1.1.9 2 2 2h6.1M8 12.6h2.4M8 16h2.4M13.2 12.6h2.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <circle cx="16.8" cy="16.8" r="4.2" stroke="currentColor" strokeWidth="2" />
      <path d="M16.8 14.2v2.8l1.9 1.1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function HomeSectionHeader({
  title,
  caption,
  actionLabel,
  actionTo
}: {
  title: string;
  caption?: string;
  actionLabel?: string;
  actionTo?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <TitleWithInfo
        as="h2"
        info={caption}
        label={`${title} 说明`}
        title={title}
        titleClassName="text-[18px] font-black tracking-[-0.02em] text-[color:var(--client-text)]"
      />
      {actionLabel && actionTo ? (
        <Link className="inline-flex shrink-0 items-center gap-1 text-[12px] font-black text-[color:var(--client-primary)]" to={actionTo}>
          {actionLabel}
          <ChevronIcon className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function NearbyTechnicianCard({
  directService,
  fallbackServices,
  language,
  rankIndex,
  technician
}: {
  directService?: ServiceItem;
  fallbackServices: ServiceItem[];
  language: Language;
  rankIndex: number;
  technician: Technician;
}) {
  return (
    <TechnicianShowcaseCard
      className="w-[180px] min-w-[180px]"
      detailTo={getTechnicianDynamicPath(technician)}
      directService={directService}
      fallbackServices={fallbackServices}
      language={language}
      rankIndex={rankIndex}
      technician={technician}
    />
  );
}

function ServiceModule({
  location,
  moduleConfig,
  items
}: {
  location: HomeLocationOption;
  moduleConfig: HomeServiceModuleConfig;
  items: ServiceItem[];
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TitleWithInfo
              as="h2"
              info={`根据 ${location.label} 推荐 2-4 个图像化入口，点击进入对应服务列表。`}
              label={`${moduleConfig.title} 说明`}
              title={moduleConfig.title}
              titleClassName="text-[18px] font-black tracking-[-0.02em] text-[color:var(--client-text)]"
            />
            {moduleConfig.badge ? (
              <span className="inline-flex rounded-full bg-[color:var(--client-primary-soft)] px-2.5 py-1 text-[11px] font-black text-[color:var(--client-primary)]">
                {moduleConfig.badge}
              </span>
            ) : null}
          </div>
        </div>
        <Link className="inline-flex shrink-0 items-center gap-1 text-[12px] font-black text-[color:var(--client-primary)]" to={moduleConfig.targetTo}>
          查看
          <ChevronIcon className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {items.map((service) => (
          <Link className="group relative block h-[132px] overflow-hidden rounded-[22px] bg-black" key={service.id} to={moduleConfig.targetTo}>
            <img
              alt={service.name}
              className="absolute inset-0 h-full w-full scale-[1.035] object-cover transition duration-300 group-hover:scale-[1.06]"
              src={getGeneratedImageThumbnailUrl(service.cover)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(0,0,0,0.62)] via-[rgba(0,0,0,0.08)] to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3 text-white">
              <p className="line-clamp-1 text-[14px] font-black">{service.name}</p>
              <p className="mt-1 line-clamp-1 text-[11px] text-white/80">{service.tags[0] ?? service.fastestArrival}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function RecommendationCard({ data }: { data: RecommendationCardData }) {
  if (data.kind === "store") {
    return <SocialProfileMiniCard detailTo={data.to} store={data.store} />;
  }

  if (data.kind === "technician") {
    return <SocialProfileMiniCard detailTo={data.to} technician={data.technician} />;
  }

  return <SocialProfileMiniCard data={buildServiceMiniCardData(data.service, data.provider)} detailTo={data.to} />;
}

function ReminderMiniCard({
  cover,
  label,
  title,
  meta
}: {
  cover: string;
  label: string;
  title: string;
  meta: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[18px] bg-white/12 px-3 py-3 backdrop-blur">
      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[14px] bg-black">
        <img alt={title} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(cover)} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-white/62">{label}</p>
        <p className="mt-1 line-clamp-1 text-[13px] font-black text-white">{title}</p>
        <p className="mt-1 line-clamp-1 text-[11px] text-white/72">{meta}</p>
      </div>
    </div>
  );
}

function ReminderBanner({
  reminder,
  jumpTo,
  highPriority,
  onClose,
  visible
}: {
  reminder: ReminderState;
  jumpTo: string;
  highPriority: boolean;
  onClose: () => void;
  visible: boolean;
}) {
  const store = reminder.store;
  const service = reminder.service;
  const { language } = useI18n();
  const t = (text: string) => translateText(text, language);
  const reminderTitle = (() => {
    if (language === "en") {
      return `Your next appointment starts in ${reminder.minutesUntil} minutes`;
    }

    if (language === "ja") {
      return `次の予約は${reminder.minutesUntil}分後に始まります`;
    }

    if (language === "ko") {
      return `다음 예약이 ${reminder.minutesUntil}분 후 시작됩니다`;
    }

    if (language === "zh-Hant") {
      return `您的下次行程會在 ${reminder.minutesUntil} 分鐘後開始`;
    }

    return `您的下次行程会在 ${reminder.minutesUntil} 分钟后开始`;
  })();
  const reminderMeta = (() => {
    if (language === "en") {
      return `${reminder.startsAt} start · View appointment details`;
    }

    if (language === "ja") {
      return `${reminder.startsAt}開始 · 予約詳細を見る`;
    }

    if (language === "ko") {
      return `${reminder.startsAt} 시작 · 예약 상세 보기`;
    }

    if (language === "zh-Hant") {
      return `${reminder.startsAt} 開始 · 點擊查看預約詳情`;
    }

    return `${reminder.startsAt} 开始 · 点击查看预约详情`;
  })();

  return (
    <div
      aria-modal="true"
      className={cn(
        "pointer-events-none fixed inset-0 z-40 flex items-center justify-center px-4 py-[max(1rem,env(safe-area-inset-top))] transition duration-300",
        visible ? "opacity-100" : "opacity-0"
      )}
      role="dialog"
    >
      <div className="absolute inset-0 bg-black/42 backdrop-blur-[10px]" />
      <div className="pointer-events-auto relative w-full max-w-[720px]">
        <Link
          className={cn(
            "block max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[30px] border px-4 py-5 text-white shadow-[0_28px_80px_rgba(0,0,0,0.36)] transition duration-300 sm:px-5 sm:py-5",
            highPriority
              ? "border-[rgba(255,255,255,0.16)] bg-[linear-gradient(135deg,rgba(223,91,82,0.96),rgba(131,41,35,0.92))]"
              : "border-[rgba(255,255,255,0.12)] bg-[linear-gradient(135deg,rgba(16,23,22,0.95),rgba(33,45,41,0.92))]",
            visible ? "scale-100 translate-y-0" : "scale-[0.98] translate-y-3"
          )}
          to={jumpTo}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex rounded-full bg-white/14 px-3 py-1 text-[11px] font-black tracking-[0.1em] text-white/86">
                {t("即将开始的预约提醒")}
              </div>
              <p className="mt-3 text-[18px] font-black leading-6">{reminderTitle}</p>
              <p className="mt-1 text-[12px] text-white/76">{reminderMeta}</p>
            </div>
            <CloseIconButton
              className="h-10 w-10 shrink-0 border-white/12 bg-white/12 text-white/86 hover:bg-white/18"
              iconClassName="h-5 w-5"
              label={t("关闭提醒")}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {store ? (
              <ReminderMiniCard
                cover={store.cover}
                label={t("店铺")}
                meta={`${store.area} · ${reminder.startsAt}`}
                title={store.name}
              />
            ) : null}
            {service ? (
              <ReminderMiniCard
                cover={service.cover}
                label={t("服务")}
                meta={`${t(serviceCategories.find((item) => item.id === service.categoryId)?.name ?? "服务")} · ${reminder.startsAt}`}
                title={service.name}
              />
            ) : null}
          </div>
        </Link>
      </div>
    </div>
  );
}

function getOrderTimeValue(order: Order) {
  const bookedTime = parseDateTime(order.bookedAt).getTime();

  if (Number.isFinite(bookedTime) && bookedTime > 0) {
    return bookedTime;
  }

  const createdTime = parseDateTime(order.createdAt).getTime();
  return Number.isFinite(createdTime) ? createdTime : 0;
}

function CurrentAppointmentFloatingButton({ count, latestOrder }: { count: number; latestOrder?: Order }) {
  if (count <= 0 || !latestOrder) {
    return null;
  }

  const timeLabel = latestOrder.bookedAt.split(" ")[1] ?? latestOrder.bookedAt;

  return (
    <FloatingActionButton
      ariaLabel="查看预约记录"
      badge={count}
      srText={timeLabel}
      storageKey="needo.fab.current-appointment"
      title="查看预约记录"
      to="/orders"
    >
      <CalendarClockIcon />
    </FloatingActionButton>
  );
}

function HomeCoreReadState({
  description,
  title
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-[22px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 py-6 text-center">
      <p className="text-[15px] font-black text-[color:var(--client-text)]">{title}</p>
      <p className="mt-2 text-[12px] leading-5 text-[color:var(--client-muted)]">{description}</p>
    </div>
  );
}

function loadDismissedReminder() {
  if (typeof window === "undefined") {
    return null;
  }

  return parseBrowserStorageJson<{ orderId: string; dismissedAt: number } | null>(reminderDismissStorageKey, null, {
    kind: "session",
    removeOnError: true,
    silent: true
  });
}

function saveDismissedReminder(value: { orderId: string; dismissedAt: number } | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!value) {
    removeBrowserStorage(reminderDismissStorageKey, {
      kind: "session",
      silent: true
    });
    return;
  }

  writeBrowserStorage(reminderDismissStorageKey, JSON.stringify(value), {
    kind: "session",
    silent: true
  });
}

function resolveStoreForOrder(order: Order, storeList: Store[], technicianList: Technician[]) {
  if (order.storeName) {
    return storeList.find((item) => item.name === order.storeName) ?? null;
  }

  const matchedTechnician = technicianList.find((item) => item.name === order.technicianName);
  return storeList.find((item) => item.id === matchedTechnician?.storeId) ?? null;
}

function resolveServiceForOrder(order: Order) {
  const orderText = normalizeText(order.itemName);

  const scored = legacyServices
    .map((service) => {
      const categoryName = serviceCategories.find((item) => item.id === service.categoryId)?.name ?? "";
      const serviceTokens = [
        service.name,
        service.name.replace("上门", ""),
        service.name.replace(/\d+\s*号套餐/g, "").trim(),
        categoryName,
        ...service.tags
      ]
        .filter(Boolean)
        .map(normalizeText);

      const score = serviceTokens.reduce((total, token) => {
        if (!token) {
          return total;
        }

        if (orderText.includes(token) || token.includes(orderText)) {
          return total + 4;
        }

        return orderText.includes(token.replace("服务", "")) ? total + 2 : total;
      }, 0);

      return { service, score };
    })
    .sort((left, right) => right.score - left.score);

  return scored[0]?.score ? scored[0].service : null;
}

export function HomePage() {
  const userPortalConfig = roleBasedTabConfig.user;
  const { theme } = useClientTheme();
  const { language } = useI18n();
  const { session } = useAuth();
  const { config } = useHomeLayoutStore();
  const petSettings = useNeedoPetSettings();
  const { scenes: carouselScenes, revision: carouselRevision } = useCarouselStore();
  const { customers, stores: legacyStores, technicians: legacyTechnicians, revision: entityRevision } = useEntityStore();
  const userOrders = useUserOrders();
  const currentCustomer = customers.find((item) => item.id === session?.linkedCustomerId) ?? customers[0];
  const selectedLocation = config.locations.find((item) => item.id === config.selectedLocationId) ?? config.locations[0];
  const homeRecommendationsQuery = useCoreReadQuery(() => coreReadApi.getHomeRecommendations({ limit: 20 }), []);
  const apiServices = useMemo(
    () => homeRecommendationsQuery.data?.services.map(mapCoreServiceToServiceItem) ?? legacyServices,
    [homeRecommendationsQuery.data]
  );
  const apiStores = useMemo(
    () => homeRecommendationsQuery.data?.shops.map(mapCoreShopToStore) ?? legacyStores,
    [homeRecommendationsQuery.data, entityRevision, legacyStores]
  );
  const apiTechnicians = useMemo(
    () => homeRecommendationsQuery.data?.technicians.map(mapCoreTechnicianToTechnician) ?? legacyTechnicians,
    [homeRecommendationsQuery.data, entityRevision, legacyTechnicians]
  );
  const serviceByTechnicianId = useMemo(
    () => {
      const apiEntries = (homeRecommendationsQuery.data?.services ?? [])
        .filter((service) => Boolean(service.technician))
        .map((service) => [String(service.technician?.id), mapCoreServiceToServiceItem(service)] as const);

      if (apiEntries.length > 0) {
        return new Map(apiEntries);
      }

      const fallbackEntries = legacyTechnicians.map((technician, index) => [
        technician.id,
        legacyServices[index % legacyServices.length] ?? legacyServices[0]
      ] as const).filter((entry): entry is readonly [string, ServiceItem] => Boolean(entry[1]));

      return new Map(fallbackEntries);
    },
    [entityRevision, homeRecommendationsQuery.data, legacyTechnicians]
  );
  const [recommendationTab, setRecommendationTab] = useState<HomeRecommendationTabKey>(config.recommendation.defaultTab);
  const [now, setNow] = useState(() => new Date());
  const [dismissedReminder, setDismissedReminder] = useState(() => loadDismissedReminder());
  const [reminderVisible, setReminderVisible] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void syncHomeDeviceLocationForAppOpen(config.locations, selectedLocation.id);
  }, [config.locations, selectedLocation.id]);

  useEffect(() => {
    setRecommendationTab(config.recommendation.defaultTab);
  }, [config.recommendation.defaultTab]);

  useEffect(() => {
    saveDismissedReminder(dismissedReminder);
  }, [dismissedReminder]);

  const nearbyTechnicians = useMemo(() => {
    return [...apiTechnicians]
      .sort((left, right) => {
        const rightLocation = getLocationScore([...right.serviceAreas, ...right.skills, right.bio ?? ""], selectedLocation);
        const leftLocation = getLocationScore([...left.serviceAreas, ...left.skills, left.bio ?? ""], selectedLocation);

        if (rightLocation !== leftLocation) {
          return rightLocation - leftLocation;
        }

        if (config.nearbyTechnician.sortBy === "availability") {
          return (right.status === "available" ? 1 : 0) - (left.status === "available" ? 1 : 0) || right.reviewCount - left.reviewCount;
        }

        if (config.nearbyTechnician.sortBy === "rating") {
          return right.rating - left.rating;
        }

        return right.reviewCount - left.reviewCount;
      })
      .slice(0, config.nearbyTechnician.limit);
  }, [apiTechnicians, config.nearbyTechnician.limit, config.nearbyTechnician.sortBy, selectedLocation]);

  const recommendationStores = useMemo(
    () =>
      [...apiStores].sort((left, right) => {
        const rightLocation = getLocationScore([right.area, right.address, ...right.tags, right.description], selectedLocation);
        const leftLocation = getLocationScore([left.area, left.address, ...left.tags, left.description], selectedLocation);

        if (rightLocation !== leftLocation) {
          return rightLocation - leftLocation;
        }

        if (config.recommendation.tabs.stores.sortBy === "reviewCount") {
          return right.reviewCount - left.reviewCount;
        }

        return right.rating - left.rating;
      }),
    [apiStores, config.recommendation.tabs.stores.sortBy, selectedLocation]
  );

  const recommendationTechnicians = useMemo(
    () =>
      [...apiTechnicians].sort((left, right) => {
        const rightLocation = getLocationScore([...right.serviceAreas, ...right.skills, right.bio ?? ""], selectedLocation);
        const leftLocation = getLocationScore([...left.serviceAreas, ...left.skills, left.bio ?? ""], selectedLocation);

        if (rightLocation !== leftLocation) {
          return rightLocation - leftLocation;
        }

        if (config.recommendation.tabs.technicians.sortBy === "rating") {
          return right.rating - left.rating;
        }

        return right.reviewCount - left.reviewCount;
      }),
    [apiTechnicians, config.recommendation.tabs.technicians.sortBy, selectedLocation]
  );

  const recommendationServices = useMemo(
    () =>
      [...apiServices].sort((left, right) => {
        const rightLocation = getLocationScore([...right.serviceAreas, right.name, ...right.tags, right.summary], selectedLocation);
        const leftLocation = getLocationScore([...left.serviceAreas, left.name, ...left.tags, left.summary], selectedLocation);

        if (rightLocation !== leftLocation) {
          return rightLocation - leftLocation;
        }

        if (config.recommendation.tabs.services.sortBy === "rating") {
          return right.rating - left.rating;
        }

        return right.sales - left.sales;
      }),
    [apiServices, config.recommendation.tabs.services.sortBy, selectedLocation]
  );

  const serviceModuleItems = useMemo(
    () =>
      config.serviceModules
        .filter((item) => item.enabled)
        .slice(0, 2)
        .map((moduleConfig) => {
          const scopedServices = apiServices.filter((service) => moduleConfig.categoryIds.includes(service.categoryId));
          const matched = sortByLocation(
            scopedServices.length > 0 ? scopedServices : apiServices,
            (item) => [...item.serviceAreas, item.name, ...item.tags, item.summary],
            selectedLocation
          ).slice(0, moduleConfig.maxItems);

          return {
            moduleConfig,
            items: matched
          };
        }),
    [apiServices, config.serviceModules, selectedLocation]
  );

  const recommendationCards = useMemo<Record<HomeRecommendationTabKey, RecommendationCardData[]>>(
    () => ({
      stores: recommendationStores.map((store) => ({
        kind: "store" as const,
        id: store.id,
        to: `/stores/${store.id}`,
        store
      })),
      technicians: recommendationTechnicians.map((technician) => ({
        kind: "technician" as const,
        id: technician.id,
        to: getTechnicianDynamicPath(technician),
        technician
      })),
      services: recommendationServices.map((service) => ({
        kind: "service" as const,
        id: service.id,
        to: `/services/${service.id}`,
        service,
        provider: resolveServiceProvider(service, apiStores, apiTechnicians, selectedLocation)
      }))
    }),
    [apiStores, apiTechnicians, recommendationServices, recommendationStores, recommendationTechnicians, selectedLocation]
  );

  const currentRecommendationList = recommendationCards[recommendationTab];
  const recommendationVisibleLimit = recommendationTab === "technicians" ? 20 : config.recommendation.maxItems;
  const visibleRecommendationList = currentRecommendationList.slice(0, recommendationVisibleLimit);
  const shouldShowMore = currentRecommendationList.length > recommendationVisibleLimit;
  const quickActionItems = [
    {
      id: "stores",
      title: "店铺预约",
      caption: "到店服务",
      to: "/categories?type=store",
      icon: "map" as const
    },
    {
      id: "nearby-technicians",
      title: "附近技师",
      caption: "按距离查找",
      to: "/categories?type=technician",
      icon: "manager" as const
    },
    {
      id: "find-service",
      title: "查找服务",
      caption: "服务列表",
      to: "/categories?type=service",
      icon: "search" as const
    },
    {
      id: "my-schedule",
      title: "我的日程",
      caption: "行程管理",
      to: "/schedule",
      icon: "calendar" as const
    }
  ];

  const activeAppointmentOrders = useMemo(
    () =>
      userOrders
        .filter((order) => order.customerId === currentCustomer.id)
        .filter((order) => currentAppointmentStatuses.includes(order.status))
        .sort((left, right) => getOrderTimeValue(right) - getOrderTimeValue(left)),
    [currentCustomer.id, userOrders]
  );
  const latestActiveAppointment = activeAppointmentOrders[0];

  const reminderState = useMemo<ReminderState | null>(() => {
    if (!config.reminder.enabled) {
      return null;
    }

    const candidates = userOrders
      .filter((order) => order.customerId === currentCustomer.id)
      .filter((order) => order.status === "confirmed" || order.status === "scheduled")
      .map((order) => {
        const start = parseDateTime(order.bookedAt);
        const minutesUntil = Math.floor((start.getTime() - now.getTime()) / 60_000);

        return {
          order,
          start,
          minutesUntil
        };
      })
      .filter((item) => item.minutesUntil >= 0 && item.minutesUntil <= config.reminder.triggerWindowMinutes)
      .sort((left, right) => left.start.getTime() - right.start.getTime());

    const closest = candidates[0];

    if (!closest) {
      return null;
    }

    return {
      order: closest.order,
      minutesUntil: closest.minutesUntil,
      startsAt: formatDateTimeLabel(closest.start),
      store: resolveStoreForOrder(closest.order, legacyStores, legacyTechnicians),
      service: resolveServiceForOrder(closest.order)
    };
  }, [config.reminder.enabled, config.reminder.triggerWindowMinutes, currentCustomer.id, entityRevision, legacyStores, legacyTechnicians, now, userOrders]);

  useEffect(() => {
    if (!reminderState) {
      setReminderVisible(false);
      return;
    }

    setReminderVisible(false);
    const frame = window.requestAnimationFrame(() => setReminderVisible(true));

    return () => window.cancelAnimationFrame(frame);
  }, [reminderState?.order.id]);

  const reminderDismissedRecently =
    reminderState &&
    dismissedReminder?.orderId === reminderState.order.id &&
    now.getTime() - dismissedReminder.dismissedAt < config.reminder.dismissCooldownMinutes * 60_000;

  const activeReminder = reminderState && !reminderDismissedRecently ? reminderState : null;
  const activeReminderJumpTo =
    activeReminder && config.reminder.jumpTarget === "orders" ? "/orders" : activeReminder ? `/orders/${activeReminder.order.id}` : "/orders";

  const carouselSlides = useMemo<FeatureCarouselSlide[]>(
    () =>
      getResolvedCarouselSlides("home", now, carouselScenes.home)
        .filter((slide) => slide.status === "active")
        .map((slot) => ({
          id: slot.id,
          badge: slot.badge,
          title: slot.title,
          caption: slot.caption,
          cta: slot.cta,
          image: slot.image,
          to: resolveCarouselTargetPath(slot.target, "user")
        })),
    [carouselRevision, carouselScenes.home, now]
  );

  const performanceMetrics = config.platformMetrics.filter((item) => item.enabled);
  const hasStaticHomeContent = apiServices.length > 0 || apiStores.length > 0 || apiTechnicians.length > 0;
  const homeCoreLoading = homeRecommendationsQuery.loading && !hasStaticHomeContent;
  const homeCoreError = hasStaticHomeContent ? null : homeRecommendationsQuery.error;

  return (
    <MobileShell>
      <FloatingHomeHeader
        panelClassName={floatingHeaderGlassPanelClassName}
        stacked
      >
        <div className={cn(floatingHeaderInnerClassName, "space-y-3")}>
          <SharedHomeHeader
            avatarAlt={currentCustomer.name}
            avatarLevelLabel={getCustomerLevelLabel(currentCustomer.activeScore)}
            avatarMembershipLevel={currentCustomer.memberLevel}
            avatarSrc={currentCustomer.avatar}
            avatarTo={userPortalConfig.myPath}
            locationLabel={selectedLocation.label}
            locationCaption="当前服务区域"
            locationTo="/me/settings/service-range"
            settingsLabel="系统设置"
            settingsTo={userPortalConfig.settingsPath}
          />

          <Link
            className={cn("focus-ring", floatingHeaderSearchFieldClassName)}
            to="/categories"
          >
            <AppIcon className={floatingHeaderSearchIconClassName} name="search" />
            <span className={floatingHeaderSearchTextClassName}>搜索店铺、技师、服务</span>
          </Link>
        </div>
      </FloatingHomeHeader>

      <div className="space-y-5 px-4 pb-28 pt-2">
        {activeReminder ? (
          <ReminderBanner
            highPriority={activeReminder.minutesUntil <= 10}
            jumpTo={activeReminderJumpTo}
            onClose={() => setDismissedReminder({ orderId: activeReminder.order.id, dismissedAt: Date.now() })}
            reminder={activeReminder}
            visible={reminderVisible}
          />
        ) : null}

        <FeatureCarousel cardHeightClassName="h-[204px]" slides={carouselSlides} />

        <section className="py-0.5">
          <div className="grid grid-cols-4 gap-2">
            {quickActionItems.map((item) => {
              const title = getQuickActionTitle(item.id, item.title, language);

              return (
                <Link
                  className="grid min-h-[76px] min-w-0 grid-rows-[34px,1fr] items-start justify-items-center gap-1.5 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-surface)_100%,transparent),color-mix(in_srgb,var(--client-surface)_86%,transparent))] px-2 py-3 text-center shadow-[0_12px_26px_rgba(0,0,0,0.09)]"
                  key={item.id}
                  to={item.to}
                >
                  <span
                    className={cn(
                      "inline-flex h-[34px] w-[34px] items-center justify-center rounded-[13px]",
                      getQuickActionIconClassName(theme)
                    )}
                  >
                    <AppIcon className="h-[18px] w-[18px]" name={item.icon} />
                  </span>
                  <span className="flex min-h-[28px] w-full items-center justify-center overflow-hidden" data-no-i18n>
                    <span className={cn("w-full text-[12px] font-black leading-[14px] text-[color:var(--client-text)]", getQuickActionTitleClassName(title))}>
                      {title}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <HomeSectionHeader caption="保持现有推荐逻辑，只在首页重新组织为店铺 / 技师 / 服务三类切换。" title="精选推荐" />
          <FeatureSegmentedTabs
            items={(Object.entries(config.recommendation.tabs) as Array<[HomeRecommendationTabKey, { label: string }]>).map(([key, item]) => ({
              label: item.label,
              value: key
            }))}
            onChange={setRecommendationTab}
            value={recommendationTab}
          />

          {homeCoreLoading ? (
            <HomeCoreReadState description="正在从 /api/v1/home/recommendations 读取首页推荐。" title="正在载入真实推荐" />
          ) : homeCoreError ? (
            <HomeCoreReadState description={homeCoreError} title="推荐读取失败" />
          ) : visibleRecommendationList.length > 0 ? (
            recommendationTab === "technicians" ? (
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
                {visibleRecommendationList.map((card, index) =>
                  card.kind === "technician" ? (
                    <TechnicianShowcaseCard
                      detailTo={card.to}
                      directService={serviceByTechnicianId.get(card.technician.id)}
                      fallbackServices={apiServices}
                      key={`${recommendationTab}-${card.id}`}
                      language={language}
                      rankIndex={index}
                      technician={card.technician}
                    />
                  ) : null
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {visibleRecommendationList.map((card) => (
                  <RecommendationCard data={card} key={`${recommendationTab}-${card.id}`} />
                ))}
              </div>
            )
          ) : (
            <HomeCoreReadState description="当前 API 暂无可展示的店铺、技师或服务推荐。" title="暂无推荐内容" />
          )}

          {!homeCoreLoading && !homeCoreError && shouldShowMore ? (
            <Link
              className="flex items-center justify-center gap-1 rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)] px-4 py-3 text-[14px] font-black text-[color:var(--client-text)]"
              to={config.recommendation.moreLinks[recommendationTab].to}
            >
              {config.recommendation.moreLinks[recommendationTab].label}
              <ChevronIcon className="h-4 w-4" />
            </Link>
          ) : null}
        </section>

        <section className="space-y-4">
          <HomeSectionHeader
            actionLabel="更多技师"
            actionTo="/categories?type=technician"
            caption="根据当前定位优先排序，展示附近可预约或高评价技师。"
            title={config.nearbyTechnician.title}
          />
          {homeCoreLoading ? (
            <HomeCoreReadState description="正在读取真实技师列表。" title="正在载入附近技师" />
          ) : homeCoreError ? (
            <HomeCoreReadState description={homeCoreError} title="技师读取失败" />
          ) : nearbyTechnicians.length > 0 ? (
            <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
              {nearbyTechnicians.map((technician, index) => (
                <NearbyTechnicianCard
                  directService={serviceByTechnicianId.get(technician.id)}
                  fallbackServices={apiServices}
                  key={technician.id}
                  language={language}
                  rankIndex={index}
                  technician={technician}
                />
              ))}
            </div>
          ) : (
            <HomeCoreReadState description="当前 API 暂无公开技师资料。" title="暂无技师" />
          )}
        </section>

        {!homeCoreLoading && !homeCoreError
          ? serviceModuleItems.map(({ moduleConfig, items }) => (
              items.length > 0 ? <ServiceModule items={items} key={moduleConfig.id} location={selectedLocation} moduleConfig={moduleConfig} /> : null
            ))
          : null}

        {config.platformMetricsVisible && performanceMetrics.length > 0 ? (
          <section className="py-1">
            <div className="grid grid-cols-2 gap-3">
              {performanceMetrics.map((item) => (
                <div
                  className="rounded-[22px] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-3 py-4"
                  key={item.id}
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]">
                    <AppIcon name={item.icon} />
                  </span>
                  <p className="mt-3 text-[20px] font-black tracking-[-0.03em] text-[color:var(--client-text)]">{item.value}</p>
                  <p className="mt-1 text-[13px] font-black text-[color:var(--client-text)]">{item.label}</p>
                  {item.caption ? <p className="mt-1 text-[11px] leading-5 text-[color:var(--client-muted)]">{item.caption}</p> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {petSettings.enabled ? null : <CurrentAppointmentFloatingButton count={activeAppointmentOrders.length} latestOrder={latestActiveAppointment} />}

    </MobileShell>
  );
}
