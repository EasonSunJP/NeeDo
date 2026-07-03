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
import { SpecialBlackFlatIcon, SpecialBlackIcon, type SpecialBlackFlatIconName } from "../../components/mobile/SpecialBlackIcon";
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
import { shareContent } from "../../lib/share";
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
  "special-black": "bg-[color:var(--client-primary-soft)] text-[color:var(--client-accent-text)]",
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

function getSpecialBlackQuickActionIconName(id: string): SpecialBlackFlatIconName {
  if (id === "stores") {
    return "store";
  }

  if (id === "nearby-technicians") {
    return "technician";
  }

  if (id === "my-schedule") {
    return "calendar";
  }

  return "service";
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

function StarFillIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={cn("h-4 w-4", className)} fill="currentColor" viewBox="0 0 24 24">
      <path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8L12 3.8Z" />
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
      className="nearby-technician-card-elevation w-[180px] min-w-[180px]"
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
    return <SocialProfileMiniCard detailTo={data.to} showShareAction store={data.store} />;
  }

  if (data.kind === "technician") {
    return <SocialProfileMiniCard detailTo={data.to} showShareAction technician={data.technician} />;
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

function SpecialBlackReminderDialog({
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
        "pointer-events-none fixed inset-0 z-[1100] flex items-end justify-center px-5 pb-[calc(104px+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] transition duration-300",
        visible ? "opacity-100" : "opacity-0"
      )}
      role="dialog"
    >
      <div className="absolute inset-0 bg-[rgba(1,4,10,0.64)]" />
      <div
        className={cn(
          "pointer-events-auto relative w-full max-w-[420px] overflow-hidden rounded-[30px] border border-[rgba(104,133,191,0.2)] bg-[linear-gradient(180deg,rgba(26,35,54,0.98),rgba(8,12,20,0.98))] p-4 text-[#f7f9ff] shadow-[0_28px_80px_rgba(0,0,0,0.7),0_0_42px_rgba(80,132,255,0.2)] transition duration-300",
          visible ? "translate-y-0 scale-100" : "translate-y-4 scale-[0.98]",
          highPriority ? "shadow-[0_28px_80px_rgba(0,0,0,0.72),0_0_48px_rgba(255,78,154,0.24)]" : null
        )}
      >
        <span aria-hidden="true" className="absolute left-1/2 top-3 h-1 w-10 -translate-x-1/2 rounded-full bg-[rgba(160,183,230,0.28)]" />
        <div className="mt-4 flex items-start gap-3">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[22px] bg-[radial-gradient(circle_at_35%_24%,rgba(142,168,255,0.26),rgba(36,48,88,0.28)_58%,rgba(13,20,35,0.82)_100%)] shadow-[0_0_26px_rgba(98,89,255,0.24)]">
            <SpecialBlackFlatIcon className="special-black-flat-icon h-10 w-10" name="bell" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="inline-flex rounded-full bg-[rgba(95,141,255,0.12)] px-3 py-1 text-[11px] font-black tracking-[0.1em] text-[rgba(241,246,255,0.82)]">{t("即将开始的预约提醒")}</p>
            <p className="mt-3 text-[18px] font-black leading-6">{reminderTitle}</p>
            <p className="mt-1 text-[12px] leading-5 text-[rgba(223,231,250,0.68)]">{reminderMeta}</p>
          </div>
          <button
            aria-label={t("关闭提醒")}
            className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[rgba(118,147,205,0.16)] bg-[rgba(16,23,36,0.72)] text-[rgba(241,246,255,0.82)] shadow-[0_0_20px_rgba(79,139,255,0.12)]"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true" className="text-[20px] leading-none">×</span>
          </button>
        </div>
        <Link className="focus-ring mt-4 block space-y-3" to={jumpTo}>
          <span className="grid gap-3 sm:grid-cols-2">
            {store ? (
              <span className="flex min-w-0 items-center gap-3 rounded-[18px] border border-[rgba(91,123,190,0.12)] bg-[rgba(13,20,32,0.82)] px-3 py-3">
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[14px] bg-black">
                  <img alt={store.name} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(store.cover)} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-black uppercase tracking-[0.12em] text-[rgba(223,231,250,0.52)]">{t("店铺")}</span>
                  <span className="mt-1 block line-clamp-1 text-[13px] font-black text-white">{store.name}</span>
                  <span className="mt-1 block line-clamp-1 text-[11px] text-[rgba(223,231,250,0.62)]">{`${store.area} · ${reminder.startsAt}`}</span>
                </span>
              </span>
            ) : null}
            {service ? (
              <span className="flex min-w-0 items-center gap-3 rounded-[18px] border border-[rgba(91,123,190,0.12)] bg-[rgba(13,20,32,0.82)] px-3 py-3">
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[14px] bg-black">
                  <img alt={service.name} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(service.cover)} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-black uppercase tracking-[0.12em] text-[rgba(223,231,250,0.52)]">{t("服务")}</span>
                  <span className="mt-1 block line-clamp-1 text-[13px] font-black text-white">{service.name}</span>
                  <span className="mt-1 block line-clamp-1 text-[11px] text-[rgba(223,231,250,0.62)]">
                    {`${t(serviceCategories.find((item) => item.id === service.categoryId)?.name ?? "服务")} · ${reminder.startsAt}`}
                  </span>
                </span>
              </span>
            ) : null}
          </span>
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

function SpecialBlackAppointmentOverviewButton({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  const appointmentBadge = count > 99 ? "99+" : String(count);

  return (
    <Link
      aria-label="预约一览"
      className="focus-ring special-black-appointment-overview-button fixed z-[115] grid h-[58px] w-[58px] place-items-center rounded-full border border-[rgba(128,139,255,0.34)] bg-[radial-gradient(circle_at_35%_24%,rgba(142,168,255,0.98),rgba(58,67,176,0.78)_58%,rgba(29,37,75,0.9)_100%)] text-white"
      style={{
        bottom: "calc(env(safe-area-inset-bottom) + 118px)",
        right: "max(22px, calc((100vw - var(--client-bottom-nav-max-width, 430px)) / 2 + 24px))"
      }}
      to="/orders"
    >
      <SpecialBlackFlatIcon className="special-black-flat-icon h-8 w-8" name="calendar" />
      <span className="absolute -right-2 -top-2 min-w-7 rounded-full bg-[#ff4d55] px-1.5 py-1 text-center text-[13px] font-black leading-none text-white shadow-[0_0_16px_rgba(255,77,85,0.58)]">
        {appointmentBadge}
      </span>
    </Link>
  );
}

function formatCompactMetric(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const count = Math.max(0, Math.floor(value));

  if (count >= 10_000) {
    return `${Math.round(count / 1000) / 10}万`;
  }

  if (count >= 1000) {
    const rounded = Math.round(count / 100) / 10;
    return Number.isInteger(rounded) ? `${rounded.toFixed(0)}k` : `${rounded}k`;
  }

  return count.toLocaleString("ja-JP");
}

function normalizeSpecialBlackTagValue(value: string) {
  return value.toLowerCase().replace(/[\s,./・-]+/g, "");
}

function isSpecialBlackLocationTag(tag: string, locationValues: string[]) {
  const normalizedTag = normalizeSpecialBlackTagValue(tag);

  if (!normalizedTag) {
    return true;
  }

  if (["tokyo", "東京", "東京都", "东京都"].includes(normalizedTag)) {
    return true;
  }

  return locationValues.some((value) => {
    const normalizedValue = normalizeSpecialBlackTagValue(value);
    return normalizedValue ? normalizedValue.includes(normalizedTag) || normalizedTag.includes(normalizedValue) : false;
  });
}

function getSpecialBlackBusinessTags(tags: string[], locationValues: string[]) {
  const normalizedSeen = new Set<string>();

  return tags.filter((tag) => {
    const normalizedTag = normalizeSpecialBlackTagValue(tag);

    if (!normalizedTag || normalizedSeen.has(normalizedTag) || isSpecialBlackLocationTag(tag, locationValues)) {
      return false;
    }

    normalizedSeen.add(normalizedTag);
    return true;
  });
}

function getSpecialBlackTagUnits(tag: string) {
  return Array.from(tag).reduce((total, char) => total + (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(char) ? 2 : 1), 0) + 4;
}

function getSpecialBlackVisibleTags(tags: string[]) {
  const maxUnits = 34;
  const visibleTags: string[] = [];
  let usedUnits = 0;

  for (const tag of tags) {
    const nextUnits = getSpecialBlackTagUnits(tag);

    if (visibleTags.length > 0 && usedUnits + nextUnits > maxUnits) {
      break;
    }

    visibleTags.push(tag);
    usedUnits += nextUnits;
  }

  return {
    visibleTags,
    truncated: visibleTags.length < tags.length
  };
}

function getSpecialBlackRecommendationMeta(data: RecommendationCardData) {
  if (data.kind === "store") {
    const store = data.store;
    const address = store.address || store.area;
    const businessTags = getSpecialBlackBusinessTags(store.tags, [store.area, store.address]);

    return {
      id: data.id,
      to: data.to,
      cover: store.cover,
      title: store.name.replace(/\s+Lounge$/i, ""),
      typeLabel: "店铺",
      rating: store.rating,
      primaryMetric: store.reviewCount,
      shareMetric: Math.max(0, Math.round(store.reviewCount / 24)),
      address,
      businessTags
    };
  }

  if (data.kind === "technician") {
    const technician = data.technician;
    const address = technician.serviceAreas[0] ?? "";
    const businessTags = getSpecialBlackBusinessTags([...(technician.profileTags ?? []), ...technician.skills], technician.serviceAreas);

    return {
      id: data.id,
      to: data.to,
      cover: technician.avatar,
      title: technician.nickname || technician.name,
      typeLabel: "技师",
      rating: technician.rating,
      primaryMetric: technician.reviewCount,
      shareMetric: Math.max(0, Math.round(technician.reviewCount / 20)),
      address,
      businessTags
    };
  }

  const service = data.service;
  const address = service.serviceAreas[0] ?? "";
  const businessTags = getSpecialBlackBusinessTags(service.tags, service.serviceAreas);

  return {
    id: data.id,
    to: data.to,
    cover: service.cover,
    title: service.name,
    typeLabel: "服务",
    rating: service.rating,
    primaryMetric: service.sales,
    shareMetric: Math.max(0, Math.round(service.sales / 32)),
    address,
    businessTags
  };
}

function SpecialBlackMetricButton({
  count,
  icon,
  label,
  onClick,
  to
}: {
  count: number;
  icon: "heart" | "share";
  label: string;
  onClick?: () => void;
  to?: string;
}) {
  const content = (
    <>
      <span className="grid h-[30px] w-[30px] place-items-center rounded-full border border-[rgba(95,141,255,0.28)] bg-[rgba(20,29,48,0.72)] text-[rgba(243,247,255,0.92)] shadow-[0_0_18px_rgba(95,141,255,0.18)]">
        {icon === "share" ? (
          <SpecialBlackFlatIcon className="special-black-flat-icon h-[16px] w-[16px]" name="share-add" />
        ) : (
          <AppIcon className="h-[15px] w-[15px]" name={icon} />
        )}
      </span>
      <span className="mt-1 block text-center text-[10px] font-black leading-none text-white">{formatCompactMetric(count)}</span>
    </>
  );

  if (onClick) {
    return (
      <button aria-label={label} className="focus-ring shrink-0" onClick={onClick} type="button">
        {content}
      </button>
    );
  }

  return (
    <Link aria-label={label} className="focus-ring shrink-0" to={to ?? "/"}>
      {content}
    </Link>
  );
}

function SpecialBlackRecommendationCard({ data }: { data: RecommendationCardData }) {
  const meta = getSpecialBlackRecommendationMeta(data);
  const tagDisplay = getSpecialBlackVisibleTags(meta.businessTags);

  return (
    <article className="special-black-recommendation-card relative h-[154px] overflow-hidden rounded-[22px] border border-[rgba(104,132,192,0.18)] bg-[linear-gradient(180deg,rgba(17,23,35,0.94),rgba(6,10,18,0.98))] p-2 shadow-[0_20px_48px_rgba(0,0,0,0.46)]">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_88%,rgba(95,87,255,0.16),transparent_27%),linear-gradient(115deg,rgba(255,255,255,0.025)_0_1px,transparent_1px_40px)]" />
      <Link className="focus-ring relative grid h-full grid-cols-[138px_minmax(0,1fr)] gap-3 text-left" to={meta.to}>
        <span className="relative h-[138px] overflow-hidden rounded-[18px] bg-[#080c14]">
          <img alt={meta.title} className="h-full w-full object-cover" src={getGeneratedImageThumbnailUrl(meta.cover)} />
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[rgba(16,19,25,0.72)] px-2.5 py-1 text-[12px] font-black text-white shadow-[0_8px_18px_rgba(0,0,0,0.35)]">
            <StarFillIcon className="h-3.5 w-3.5" />
            {meta.rating.toFixed(1)}
          </span>
        </span>

        <span className="min-w-0 pr-1 pt-[44px]">
          <span className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden whitespace-nowrap leading-6">
            <span className="min-w-0 truncate text-[16px] font-black text-white">{meta.title}</span>
            <span className="shrink-0 rounded-full bg-[rgba(72,88,255,0.18)] px-2 py-0.5 text-[11px] font-black leading-none text-[#7d91ff]">{meta.typeLabel}</span>
          </span>
          {meta.address ? (
            <span className="mt-1 block truncate text-[12px] font-bold leading-5 text-[rgba(232,238,255,0.68)]">{meta.address}</span>
          ) : null}
          {tagDisplay.visibleTags.length > 0 ? (
            <span className="mt-1.5 flex max-h-[44px] flex-wrap items-center gap-1.5 overflow-hidden">
              {tagDisplay.visibleTags.map((tag, tagIndex) => (
                <span className="rounded-full bg-[rgba(225,234,255,0.07)] px-2.5 py-1 text-[11px] font-bold leading-none text-[rgba(232,238,255,0.72)]" key={`${meta.id}-${tag}-${tagIndex}`}>
                  {tag}
                </span>
              ))}
              {tagDisplay.truncated ? (
                <span className="rounded-full bg-[rgba(225,234,255,0.07)] px-2.5 py-1 text-[11px] font-bold leading-none text-[rgba(232,238,255,0.72)]">...</span>
              ) : null}
            </span>
          ) : null}
        </span>
      </Link>

      <div className="absolute right-2 top-2 z-10 flex gap-1.5">
        <SpecialBlackMetricButton count={meta.primaryMetric} icon="heart" label={`${meta.title} 详情`} to={meta.to} />
        <SpecialBlackMetricButton
          count={meta.shareMetric}
          icon="share"
          label={`分享 ${meta.title}`}
          onClick={() => {
            void shareContent({
              title: `${meta.title} | NeeDo`,
              text: meta.address ? `${meta.title} · ${meta.address}` : meta.title,
              url: meta.to,
              copiedMessage: "链接已复制，可以转发给联系人"
            });
          }}
        />
      </div>

    </article>
  );
}

function SpecialBlackHeroTitle({ title }: { title: string }) {
  const numberMatch = title.match(/^(.*?)(\d+)(.*)$/);

  if (!numberMatch) {
    return <span className="block max-w-[76%] text-[28px] font-black leading-[1.08] text-white">{title}</span>;
  }

  return (
    <span className="flex flex-wrap items-baseline gap-x-3 text-[28px] font-black leading-none text-white">
      <span>{numberMatch[1]?.trim()}</span>
      <span className="bg-[linear-gradient(135deg,#4f66ff_0%,#7a62ff_45%,#d350ff_100%)] bg-clip-text text-[54px] leading-none text-transparent">
        {numberMatch[2]}
      </span>
      <span>{numberMatch[3]?.trim()}</span>
    </span>
  );
}

function SpecialBlackHeroSlide({ slide }: { slide: FeatureCarouselSlide }) {
  return (
    <>
      <img alt={slide.title} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(slide.image)} />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(1,4,10,0.74)_0%,rgba(1,4,10,0.42)_48%,rgba(1,4,10,0.24)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(0deg,rgba(1,4,10,0.46),transparent)]" />
      <div className="relative flex h-full flex-col justify-between px-4 py-[18px] pb-9 text-white">
        <div>
          {slide.badge ? (
            <span className="inline-flex rounded-full border border-[rgba(190,203,235,0.1)] bg-[rgba(232,238,255,0.13)] px-3 py-1.5 text-[12px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              {slide.badge}
            </span>
          ) : null}
          <h3 className="mt-8">
            <SpecialBlackHeroTitle title={slide.title} />
          </h3>
          {slide.caption ? <p className="mt-3 max-w-[86%] text-[13px] font-bold leading-5 text-[rgba(246,248,255,0.78)]">{slide.caption}</p> : null}
        </div>
        <span className="inline-flex w-fit items-center gap-3 rounded-[18px] border border-[rgba(216,225,255,0.18)] bg-[rgba(24,29,43,0.58)] px-4 py-3 text-[13px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          {slide.cta || "查看详情并预约"}
          <ChevronIcon className="h-4 w-4" />
        </span>
      </div>
    </>
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
  const t = (text: string) => translateText(text, language);
  const specialBlackProjectItems = quickActionItems.map((item) => ({
    ...item,
    displayTitle: getQuickActionTitle(item.id, item.title, language),
    iconName: getSpecialBlackQuickActionIconName(item.id)
  }));

  if (theme === "special-black") {
    return (
      <MobileShell className="special-black-home-layout" showTopEdgeMask={false}>
        {activeReminder ? (
          <SpecialBlackReminderDialog
            highPriority={activeReminder.minutesUntil <= 10}
            jumpTo={activeReminderJumpTo}
            onClose={() => setDismissedReminder({ orderId: activeReminder.order.id, dismissedAt: Date.now() })}
            reminder={activeReminder}
            visible={reminderVisible}
          />
        ) : null}

        <div className="relative min-h-[100dvh] overflow-hidden pb-28 text-[#f7f9ff]">
          <div aria-hidden="true" className="special-black-home-background pointer-events-none absolute inset-0" />
          <div aria-hidden="true" className="special-black-home-header-clip pointer-events-none fixed inset-x-0 top-0 z-[1000] h-[calc(env(safe-area-inset-top)+124px)]" />

          <div className="special-black-home-fixed-header pointer-events-none fixed inset-x-0 top-0 z-[1002] h-[calc(env(safe-area-inset-top)+124px)] overflow-hidden px-[19px] pb-[14px] pt-[calc(env(safe-area-inset-top)+12px)]">
            <div aria-hidden="true" className="special-black-home-fixed-header-fill pointer-events-none absolute inset-0 z-0" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-px bg-[linear-gradient(90deg,transparent,rgba(117,146,205,0.2),transparent)]" />
            <div className="pointer-events-auto relative z-10 mx-auto flex w-full flex-col gap-3">
              <header className="flex items-center justify-between gap-3">
              <Link aria-label={t("打开个人主页")} className="focus-ring shrink-0" to={userPortalConfig.myPath}>
                <span className="special-black-home-avatar relative block h-12 w-12 shrink-0 overflow-hidden rounded-[13px] border border-[rgba(117,146,205,0.16)] bg-[rgba(14,19,29,0.9)] shadow-[0_14px_28px_rgba(0,0,0,0.26)]">
                  <img alt={currentCustomer.name} className="h-full w-full object-cover" src={currentCustomer.avatar} />
                </span>
              </Link>
              <Link
                className="focus-ring special-black-home-header-location flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-[rgba(104,132,192,0.16)] bg-[rgba(13,18,29,0.84)] px-3 text-left shadow-[inset_0_1px_0_rgba(148,170,214,0.05),0_12px_28px_rgba(0,0,0,0.2)]"
                to="/me/settings/service-range"
              >
                <SpecialBlackFlatIcon className="special-black-flat-icon special-black-home-bright-icon h-7 w-7 shrink-0" name="location" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold leading-none text-[rgba(223,231,250,0.55)]">{t("当前服务区域")}</span>
                  <span className="mt-1 block truncate text-[14px] font-black leading-none text-white">{selectedLocation.label}</span>
                </span>
                <ChevronIcon className="h-3.5 w-3.5 shrink-0 text-[rgba(175,185,207,0.55)]" />
              </Link>

              <Link
                aria-label={t("系统设置")}
                className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[rgba(104,132,192,0.16)] bg-[rgba(13,18,29,0.84)] shadow-[inset_0_1px_0_rgba(148,170,214,0.05),0_12px_28px_rgba(0,0,0,0.2)]"
                to={userPortalConfig.settingsPath}
              >
                <SpecialBlackFlatIcon className="special-black-flat-icon special-black-home-bright-icon h-6 w-6" name="settings" />
              </Link>
              </header>

              <Link
                className="focus-ring flex h-10 items-center gap-2.5 rounded-full border border-[rgba(104,132,192,0.14)] bg-[rgba(11,16,26,0.84)] px-3 shadow-[inset_0_1px_0_rgba(130,160,214,0.05),0_10px_24px_rgba(0,0,0,0.16)]"
                to="/categories"
              >
                <AppIcon className="h-4 w-4 shrink-0 text-[rgba(222,231,250,0.56)]" name="search" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-none text-[rgba(222,231,250,0.58)]">{t("搜索店铺、技师、服务")}</span>
              </Link>
            </div>
          </div>

          <div className="special-black-home-content relative z-10 space-y-4 px-[19px] pt-[calc(env(safe-area-inset-top)+124px)]">

            <FeatureCarousel
              autoRotateMs={null}
              cardHeightClassName="h-[218px]"
              renderSlide={({ slide }) => <SpecialBlackHeroSlide slide={slide} />}
              slideClassName="rounded-[28px] border-[rgba(104,132,192,0.2)] shadow-[0_22px_48px_rgba(0,0,0,0.38)]"
              slides={carouselSlides}
            />

            <section>
              <div className="grid grid-cols-4 gap-3">
                {specialBlackProjectItems.map((item) => (
                  <Link
                    className="special-black-project-card focus-ring relative grid h-[100px] min-w-0 grid-rows-[44px,1fr] items-start justify-items-center gap-1.5 overflow-hidden rounded-[22px] border border-[rgba(104,132,192,0.18)] bg-[linear-gradient(180deg,rgba(18,24,36,0.94),rgba(7,11,19,0.98))] px-2 py-3 text-center shadow-[0_18px_38px_rgba(0,0,0,0.34)]"
                    key={item.id}
                    to={item.to}
                  >
                    <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(95,141,255,0.12),transparent_54%)]" />
                    <span className="special-black-home-quick-glyph relative grid h-[44px] w-[44px] shrink-0 place-items-center text-white">
                      <SpecialBlackFlatIcon className="special-black-flat-icon h-[43px] w-[43px]" name={item.iconName} />
                    </span>
                    <span className="flex min-h-[28px] w-full items-center justify-center overflow-hidden" data-no-i18n>
                      <span className={cn("w-full text-[13px] font-black leading-[16px] text-white", getQuickActionTitleClassName(item.displayTitle))}>
                        {item.displayTitle}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <section className="space-y-2.5">
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
                      <SpecialBlackRecommendationCard
                        data={card}
                        key={`${recommendationTab}-${card.id}`}
                      />
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
              <section className="grid grid-cols-2 gap-3 py-1">
                {performanceMetrics.map((item, index) => (
                  <div
                    className="special-black-project-card rounded-[20px] border border-[rgba(98,125,184,0.14)] bg-[linear-gradient(180deg,rgba(24,31,46,0.92),rgba(12,17,27,0.96))] px-3 py-4"
                    key={item.id}
                  >
                    <SpecialBlackIcon className="h-11 w-11 rounded-[15px]" imageClassName="scale-[1.12]" name={index % 2 === 0 ? "checklist" : "clock"} />
                    <p className="mt-3 text-[20px] font-black tracking-[-0.03em] text-white">{item.value}</p>
                    <p className="mt-1 text-[13px] font-black text-white">{item.label}</p>
                    {item.caption ? <p className="mt-1 text-[11px] leading-5 text-[rgba(223,231,250,0.56)]">{item.caption}</p> : null}
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        </div>

        <SpecialBlackAppointmentOverviewButton count={activeAppointmentOrders.length} />
      </MobileShell>
    );
  }
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
