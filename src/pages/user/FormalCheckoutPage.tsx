import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { travelFareApi, type JapaneseRouteAddress, type RouteEstimate } from "../../api/travelFare";
import { useAuth } from "../../auth/AuthProvider";
import {
  AppTopBar,
  PageScaffold,
  PrimaryButton,
  SecondaryButton,
  SurfacePanel
} from "../../components/client-ui/AppScaffold";
import {
  bookingApi,
  createBookingIdempotencyKey,
  type AdministrativeRegionReference,
  type BookingScheduleSlot,
  type ManualPaymentMethod,
  type TechnicianServiceBookingContext
} from "../../features/booking/api";
import { loadAvailabilityWindow } from "../../features/booking/window-loaders";
import {
  coreReadApi,
  type CoreServiceDetail,
  type CoreTechnicianCard
} from "../../features/core-read/api";
import {
  customerAddressApi,
  type CustomerAddress
} from "../../features/customer-address/api";
import { getExchangePost } from "../../features/exchange/api";
import type { ExchangePost } from "../../features/exchange/types";
import { pricingModeApi } from "../../features/pricing-mode/api";
import { cn, yen } from "../../lib/utils";
import {
  mapExchangeIntelligencePublisherToProfileData,
  UnifiedProfileCard,
  type ExchangeIntelligencePublisherProfileProjection
} from "../../shared/profile-card";
import { SocialProfileMiniCard } from "../../shared/profile-card/SocialProfileMiniCard";
import {
  mapCoreServiceCardToUnifiedData,
  mapExchangeIntelligenceServiceToUnifiedData,
  mapTechnicianBookingContextServiceToUnifiedData,
  UnifiedServiceInfoCard,
  type UnifiedServiceInfoCardData
} from "../../shared/service-card";
import type { FulfillmentMode } from "../../types/domain";
import {
  CheckoutProgressNav,
  resolveActiveCheckoutStep,
  type CheckoutProgressKey
} from "./formal-checkout/CheckoutProgressNav";
import { CheckoutTimeRow } from "./formal-checkout/CheckoutTimeRow";
import {
  useCheckoutText,
  type CheckoutTextKey,
  type CheckoutTextValues
} from "./formal-checkout/i18n";
import {
  getTokyoDayWindow,
  getTokyoSlotParts,
  isCheckoutSlotBookable,
  resolveInitialCheckoutSlotId
} from "./formal-checkout/checkoutTimeSlots";

type LoadStatus = "loading" | "success" | "error";
type TechnicianLoadStatus = "idle" | "loading" | "error";
export type CheckoutCatalogRef =
  | { type: "shop_service"; id: number }
  | { type: "technician_service"; id: number; shopId?: number; technicianId?: number };

type CheckoutServiceContext = {
  catalogRef: CheckoutCatalogRef;
  publicId: string;
  serviceInfo: UnifiedServiceInfoCardData;
  serviceDetailPath: string;
  serviceMode: string;
  shop: {
    name: string;
    city: string;
    address: string;
    contactPath: string;
  };
  coreService: CoreServiceDetail | null;
  technicianPublisher: ExchangeIntelligencePublisherProfileProjection | null;
};

type BookingIdempotencyState = { fingerprint: string; key: string };

class CheckoutSourceError extends Error {
  constructor(readonly copyKey: CheckoutTextKey) {
    super(copyKey);
  }
}
type EstimateStatus = "idle" | "loading" | "success" | "error" | "expired";

const quickNotes = ["preferFemaleTechnician", "contactInAdvance", "quietEnvironment"] as const satisfies readonly CheckoutTextKey[];
const checkoutScheduleSlotStateKey = "checkoutScheduleSlotId";
const emptyHomeAddress: JapaneseRouteAddress = { countryCode: "JP", postalCode: "", prefecture: "", city: "", addressLine1: "", addressLine2: "", building: "" };

function checkoutHistoryState(value: unknown) {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function persistedCheckoutScheduleSlotId(value: unknown) {
  const slotId = checkoutHistoryState(value)[checkoutScheduleSlotStateKey];
  return typeof slotId === "number" && Number.isInteger(slotId) && slotId > 0 ? slotId : null;
}

function requestedCheckoutScheduleSlotId(value: string | null) {
  return value && /^[1-9]\d*$/u.test(value) ? Number(value) : null;
}

function describeCheckoutError(error: unknown): CheckoutTextKey {
  if (error instanceof CheckoutSourceError) return error.copyKey;
  if (error instanceof ApiClientError) {
    if (error.code === 41038) return "priceUpdated";
    if (error.status === 401) return "loginExpired";
    if (error.status === 403) return "permissionDenied";
    if (error.status === 404) return "serviceUnavailable";
    if (error.status === 409) return "bookingStateChanged";
    if (error.status >= 500) return "bookingServiceUnavailable";
  }
  return "checkoutLoadNetworkError";
}

function describeEstimateError(error: unknown): CheckoutTextKey {
  if (error instanceof ApiClientError) {
    if (error.message === "error.travel.outside_service_area") return "travelOutsideArea";
    if (error.message === "error.travel.provider_unconfigured") return "travelProviderUnconfigured";
    if (error.message === "error.travel.route_not_found") return "travelRouteNotFound";
    if (error.message.startsWith("error.travel.provider_")) return "travelProviderUnavailable";
  }
  return "travelEstimateFailed";
}

function resolveFulfillmentMode(serviceMode: string, requestedMode: string | null): FulfillmentMode {
  if (serviceMode === "home" || serviceMode === "onsite" || serviceMode === "home_visit") return "home";
  if (serviceMode === "store") return "store";
  return requestedMode === "home" ? "home" : "store";
}

export function slotInsideIntelligenceWindow(
  slot: Pick<BookingScheduleSlot, "startsAt" | "endsAt">,
  source: NonNullable<ExchangePost["intelligence"]>
) {
  const slotStartsAt = new Date(slot.startsAt).getTime();
  const slotEndsAt = new Date(slot.endsAt).getTime();
  const windowStartsAt = new Date(source.booking.serviceWindow.startsAt).getTime();
  const windowEndsAt = new Date(source.booking.serviceWindow.endsAt).getTime();
  return [slotStartsAt, slotEndsAt, windowStartsAt, windowEndsAt].every(Number.isFinite)
    && slotStartsAt >= windowStartsAt
    && slotEndsAt <= windowEndsAt;
}

function resolveBookingIdempotencyKey(
  current: BookingIdempotencyState | null,
  fingerprint: string
): BookingIdempotencyState {
  return current?.fingerprint === fingerprint
    ? current
    : { fingerprint, key: createBookingIdempotencyKey() };
}

function ensureIntelligenceCheckoutSource(post: ExchangePost, catalogRef: CheckoutCatalogRef) {
  if (post.type !== "intelligence" || !post.intelligence) {
    throw new CheckoutSourceError("sourceInvalid");
  }
  if (post.status !== "published" || !post.intelligence.booking.available) {
    throw new CheckoutSourceError("sourceEnded");
  }
  const target = post.intelligence.booking.target;
  if (!target || target.type !== catalogRef.type || target.id !== catalogRef.id) {
    throw new CheckoutSourceError("sourceMismatch");
  }
  if (!post.intelligence.publisherCard || !post.intelligence.serviceCard) {
    throw new CheckoutSourceError("sourceIncomplete");
  }
  return post.intelligence;
}

function serviceModeLabel(serviceMode: string, t: (key: CheckoutTextKey, values?: CheckoutTextValues) => string) {
  if (serviceMode === "home" || serviceMode === "onsite" || serviceMode === "home_visit") return t("homeShort");
  if (serviceMode === "both" || serviceMode === "flexible") return t("storeOrHomeShort");
  return t("storeShort");
}

function formatTokyoDate(value: string, language: "zh" | "zh-Hant" | "ja" | "en" | "ko") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const locale = { zh: "zh-CN", "zh-Hant": "zh-TW", ja: "ja-JP", en: "en-US", ko: "ko-KR" }[language];
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Tokyo",
    weekday: "short",
    year: "numeric"
  }).format(date);
}

function finiteRating(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function googleMapsSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function googleMapsEmbedUrl(query: string) {
  return `https://www.google.com/maps?output=embed&q=${encodeURIComponent(query)}`;
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="px-1 text-sm font-black tracking-wide text-[color:var(--client-primary)]">{children}</h2>;
}

export function FormalCheckoutPage({ catalogRef }: { catalogRef: CheckoutCatalogRef }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const serviceId = catalogRef.type === "shop_service" ? catalogRef.id : null;
  const technicianServiceId = catalogRef.type === "technician_service" ? catalogRef.id : null;
  const technicianServiceShopId = catalogRef.type === "technician_service" ? catalogRef.shopId : undefined;
  const technicianServiceTechnicianId = catalogRef.type === "technician_service" ? catalogRef.technicianId : undefined;
  const exchangePostParam = searchParams.get("exchangePost");
  const exchangePostId = exchangePostParam && /^[1-9]\d*$/u.test(exchangePostParam)
    ? Number(exchangePostParam)
    : null;
  const { isAuthenticated } = useAuth();
  const { language, t } = useCheckoutText();
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState<CheckoutTextKey | null>(null);
  const [revision, setRevision] = useState(0);
  const [service, setService] = useState<CheckoutServiceContext | null>(null);
  const [intelligenceSource, setIntelligenceSource] = useState<NonNullable<ExchangePost["intelligence"]> | null>(null);
  const [slots, setSlots] = useState<BookingScheduleSlot[]>([]);
  const [slotSelectionInvalid, setSlotSelectionInvalid] = useState(false);
  const [checkoutNowMs, setCheckoutNowMs] = useState(() => Date.now());
  const [selectedTechnicianDetail, setSelectedTechnicianDetail] = useState<CoreTechnicianCard | null>(null);
  const [technicianLoadStatus, setTechnicianLoadStatus] = useState<TechnicianLoadStatus>("idle");
  const [selectedDate] = useState(() => {
    const requestedDate = searchParams.get("date");
    if (requestedDate && getTokyoDayWindow(requestedDate)) return requestedDate;
    return getTokyoSlotParts(new Date().toISOString())!.date;
  });
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [fulfillmentMode, setFulfillmentMode] = useState<FulfillmentMode>("store");
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod>("onsite");
  const [homeAddress, setHomeAddress] = useState<JapaneseRouteAddress>(emptyHomeAddress);
  const [estimate, setEstimate] = useState<RouteEstimate | null>(null);
  const [estimateStatus, setEstimateStatus] = useState<EstimateStatus>("idle");
  const [estimateError, setEstimateError] = useState<CheckoutTextKey | null>(null);
  const estimateRequestVersionRef = useRef(0);
  const [prefectures, setPrefectures] = useState<AdministrativeRegionReference[]>([]);
  const [municipalities, setMunicipalities] = useState<AdministrativeRegionReference[]>([]);
  const [selectedAdmin1Code, setSelectedAdmin1Code] = useState("");
  const [selectedAdmin2Code, setSelectedAdmin2Code] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [selectedSavedAddressPublicId, setSelectedSavedAddressPublicId] = useState("");
  const [savedAddressLoadError, setSavedAddressLoadError] = useState<CheckoutTextKey | null>(null);
  const homeAddressTouchedRef = useRef(false);
  const [regionLoadError, setRegionLoadError] = useState<CheckoutTextKey | null>(null);
  const [municipalitiesLoading, setMunicipalitiesLoading] = useState(false);
  const [note, setNote] = useState(searchParams.get("remark") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<CheckoutTextKey | null>(null);
  const [addressCopyLabel, setAddressCopyLabel] = useState<CheckoutTextKey>("copyAddress");
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const remarkInputRef = useRef<HTMLTextAreaElement | null>(null);
  const bookingIdempotencyRef = useRef<BookingIdempotencyState | null>(null);
  const [activeProgressStep, setActiveProgressStep] = useState(0);
  const selectedDayWindow = useMemo(() => getTokyoDayWindow(selectedDate), [selectedDate]);
  const persistedSlotId = persistedCheckoutScheduleSlotId(location.state);
  const requestedDateParam = searchParams.get("date");
  const requestedSlotParam = searchParams.get("scheduleSlotId");
  const requestedSlotId = requestedCheckoutScheduleSlotId(requestedSlotParam);
  const hasRequestedSlotSelection = requestedSlotParam !== null || searchParams.get("time") !== null || persistedSlotId !== null;
  const requestedDateInvalid = requestedDateParam !== null && getTokyoDayWindow(requestedDateParam) === null;
  const requestedTechnicianId = searchParams.get("technician");
  const shopServiceTechnicianId = requestedTechnicianId && /^[1-9]\d*$/.test(requestedTechnicianId)
    ? Number(requestedTechnicianId)
    : undefined;

  const updateHomeAddress = (field: keyof JapaneseRouteAddress, value: string) => {
    homeAddressTouchedRef.current = true;
    estimateRequestVersionRef.current += 1;
    setHomeAddress((current) => ({ ...current, [field]: value }));
    setEstimate(null);
    setEstimateStatus("idle");
    setEstimateError(null);
  };

  const applySavedAddress = (address: CustomerAddress) => {
    homeAddressTouchedRef.current = true;
    estimateRequestVersionRef.current += 1;
    setSelectedSavedAddressPublicId(address.publicId);
    setSelectedAdmin1Code(address.admin1Code);
    setSelectedAdmin2Code(address.admin2Code);
    setHomeAddress({
      countryCode: "JP",
      postalCode: address.postalCode,
      prefecture: address.prefecture,
      city: address.city,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 ?? "",
      building: address.building ?? ""
    });
    setEstimate(null);
    setEstimateStatus("idle");
    setEstimateError(null);
  };

  useEffect(() => {
    if (!selectedDayWindow) return undefined;
    let active = true;
    setLoadStatus("loading");
    setLoadError(null);
    const servicePromise: Promise<CheckoutServiceContext> = serviceId !== null
      ? coreReadApi.getServiceDetail(serviceId).then(async (serviceDetail) => {
          const navigation = await pricingModeApi
            .getBookingNavigation(serviceDetail.shop.id, { page: 1, pageSize: 100 })
            .catch(() => null);
          const bookingMetadata = navigation?.entry === "service_menu"
            ? navigation.services.list.find((item) => item.id === serviceId) ?? null
            : null;
          if (navigation && !bookingMetadata) {
            throw new CheckoutSourceError("pricingModeUnavailable");
          }
          const serviceInfo = mapCoreServiceCardToUnifiedData(serviceDetail);
          return {
            catalogRef: { type: "shop_service", id: serviceId },
            publicId: serviceDetail.publicId,
            serviceInfo: bookingMetadata
              ? {
                  ...serviceInfo,
                  tags: bookingMetadata.tags,
                  completedOrderCount: bookingMetadata.usageCount
                }
              : serviceInfo,
            serviceDetailPath: `/services/${serviceDetail.id}`,
            serviceMode: serviceDetail.serviceMode,
            shop: {
              name: serviceDetail.shop.name,
              city: serviceDetail.shop.city,
              address: serviceDetail.shop.address,
              contactPath: `/stores/${serviceDetail.shop.id}`
            },
            coreService: serviceDetail,
            technicianPublisher: null
          };
        })
      : technicianServiceShopId && technicianServiceTechnicianId
        ? Promise.all([
            coreReadApi.getShopDetail(technicianServiceShopId),
            coreReadApi.listCategories({ page: 1, pageSize: 100 }),
            pricingModeApi.listPublicTechnicianServices(
              technicianServiceShopId,
              technicianServiceTechnicianId,
              { page: 1, pageSize: 100 }
            )
          ]).then(([shop, categories, technicianServices]) => {
            const technicianService = technicianServices.list.find((item) => item.id === technicianServiceId);
            const category = categories.list.find((item) => item.id === technicianService?.categoryId);
            const technician = shop.technicians.find((item) => item.id === technicianServiceTechnicianId) ?? null;
            if (!technicianService || !category || !technician) {
              throw new CheckoutSourceError("technicianServiceMismatch");
            }
            const serviceDetail: CoreServiceDetail = {
              id: technicianService.id,
              publicId: technicianService.publicId,
              name: technicianService.name,
              description: technicianService.description,
              category,
              shop,
              technician,
              city: shop.city,
              priceAmount: String(technicianService.priceAmount),
              currency: technicianService.currency,
              durationMinutes: technicianService.durationMinutes,
              usageCount: technicianService.usageCount,
              coverUrl: technicianService.coverImageUrl ?? technicianService.images[0] ?? shop.coverUrl,
              reviewSummary: technician.reviewSummary,
              serviceMode: "store",
              mediaAssets: [],
              createdAt: technicianService.createdAt,
              updatedAt: technicianService.updatedAt
            };
            return {
              catalogRef,
              publicId: technicianService.publicId,
              serviceInfo: {
                ...mapCoreServiceCardToUnifiedData(serviceDetail),
                tags: technicianService.tags,
                completedOrderCount: technicianService.usageCount
              },
              serviceDetailPath: `/stores/${shop.publicId}/technicians/${technician.publicId}/services`,
              serviceMode: "store",
              shop: {
                name: shop.name,
                city: shop.city,
                address: shop.address,
                contactPath: `/stores/${shop.id}`
              },
              coreService: serviceDetail,
              technicianPublisher: null
            };
          })
        : bookingApi.getTechnicianServiceBookingContext(technicianServiceId!).then((bookingContext: TechnicianServiceBookingContext) => {
            if (bookingContext.target.id !== technicianServiceId) {
              throw new CheckoutSourceError("technicianServiceMismatch");
            }
            return {
              catalogRef,
              publicId: bookingContext.serviceCard.publicId,
              serviceInfo: mapTechnicianBookingContextServiceToUnifiedData(
                bookingContext.serviceCard,
                serviceModeLabel(bookingContext.serviceCard.serviceMode, t)
              ),
              serviceDetailPath: bookingContext.serviceCard.detailPath,
              serviceMode: bookingContext.serviceCard.serviceMode,
              shop: {
                name: bookingContext.shopCard.name,
                city: "",
                address: bookingContext.shopCard.address,
                contactPath: bookingContext.shopCard.detailPath
              },
              coreService: null,
              technicianPublisher: bookingContext.technicianCard
            };
          });
    const exchangePromise = exchangePostParam === null
      ? Promise.resolve<ExchangePost | null>(null)
      : exchangePostId === null
        ? Promise.reject<ExchangePost | null>(new CheckoutSourceError("sourceLinkInvalid"))
        : getExchangePost(String(exchangePostId));

    Promise.all([servicePromise, exchangePromise])
      .then(async ([serviceContext, sourcePost]) => {
        const source = sourcePost ? ensureIntelligenceCheckoutSource(sourcePost, catalogRef) : null;
        const availabilityWindow = source
          ? {
              from: source.booking.serviceWindow.startsAt,
              to: source.booking.serviceWindow.endsAt
            }
          : selectedDayWindow;
        const availability = await loadAvailabilityWindow({
          serviceId: serviceId ?? undefined,
          technicianServiceId: technicianServiceId ?? undefined,
          ...(serviceId && shopServiceTechnicianId ? { technicianId: shopServiceTechnicianId } : {}),
          from: availabilityWindow.from,
          to: availabilityWindow.to,
          includeUnavailable: true
        });
        return { serviceContext, availability, source };
      })
      .then(({ serviceContext, availability, source }) => {
        if (!active) return;
        const formalSlots = availability
          .filter((slot) => catalogRef.type === "shop_service"
            ? slot.serviceId === catalogRef.id && slot.technicianServiceId === null
            : slot.technicianServiceId === catalogRef.id && slot.serviceId === null)
          .filter((slot) => source ? slotInsideIntelligenceWindow(slot, source) : true)
          .slice()
          .sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id - right.id);
        const requestedTime = searchParams.get("time");
        const explicitSlotId = requestedSlotParam !== null ? requestedSlotId : persistedSlotId;
        const resolvedSlotId = requestedDateInvalid || (requestedSlotParam !== null && requestedSlotId === null)
          ? null
          : resolveInitialCheckoutSlotId(formalSlots, selectedDate, requestedTime, explicitSlotId);

        setService(serviceContext);
        setIntelligenceSource(source);
        setSlots(formalSlots);
        setSelectedSlotId(resolvedSlotId);
        setSlotSelectionInvalid(hasRequestedSlotSelection && resolvedSlotId === null);
        setFulfillmentMode(resolveFulfillmentMode(source?.serviceMode ?? serviceContext.serviceMode, searchParams.get("mode")));
        setLoadStatus("success");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setService(null);
        setIntelligenceSource(null);
        setSlots([]);
        setSelectedSlotId(null);
        setLoadError(describeCheckoutError(error));
        setLoadStatus("error");
      });
    return () => {
      active = false;
    };
  }, [catalogRef.id, catalogRef.type, exchangePostId, exchangePostParam, hasRequestedSlotSelection, language, persistedSlotId, requestedDateInvalid, requestedSlotId, requestedSlotParam, revision, searchParams, selectedDate, selectedDayWindow, serviceId, shopServiceTechnicianId, technicianServiceId, technicianServiceShopId, technicianServiceTechnicianId]);

  useEffect(() => {
    const nextBoundaryMs = slots.reduce<number | null>((earliest, slot) => {
      const startsAtMs = new Date(slot.startsAt).getTime();
      if (!Number.isFinite(startsAtMs) || startsAtMs <= checkoutNowMs) return earliest;
      return earliest === null || startsAtMs < earliest ? startsAtMs : earliest;
    }, null);
    if (nextBoundaryMs === null) return undefined;

    const timeoutId = window.setTimeout(() => {
      setCheckoutNowMs(Date.now());
    }, Math.max(0, nextBoundaryMs - Date.now()));
    return () => window.clearTimeout(timeoutId);
  }, [checkoutNowMs, slots]);

  useEffect(() => {
    if (
      selectedSlotId !== null
      && !slots.some((slot) => slot.id === selectedSlotId && isCheckoutSlotBookable(slot, checkoutNowMs))
    ) {
      setSelectedSlotId(null);
      setSlotSelectionInvalid(true);
    }
  }, [checkoutNowMs, selectedSlotId, slots]);

  useEffect(() => {
    let active = true;
    setRegionLoadError(null);
    void bookingApi
      .listAdministrativeRegions({ country: "JP", locale: "ja" })
      .then(({ list }) => {
        if (active) setPrefectures(list);
      })
      .catch(() => {
        if (active) {
          setPrefectures([]);
          setRegionLoadError("regionLoadFailed");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setSavedAddresses([]);
      setSelectedSavedAddressPublicId("");
      return undefined;
    }
    let active = true;
    setSavedAddressLoadError(null);
    void customerAddressApi.list({ page: 1, pageSize: 100 })
      .then(({ list }) => {
        if (!active) return;
        setSavedAddresses(list);
        const defaultAddress = list.find((address) => address.isDefault);
        if (defaultAddress && !homeAddressTouchedRef.current) {
          setSelectedSavedAddressPublicId(defaultAddress.publicId);
          setSelectedAdmin1Code(defaultAddress.admin1Code);
          setSelectedAdmin2Code(defaultAddress.admin2Code);
          setHomeAddress({
            countryCode: "JP",
            postalCode: defaultAddress.postalCode,
            prefecture: defaultAddress.prefecture,
            city: defaultAddress.city,
            addressLine1: defaultAddress.addressLine1,
            addressLine2: defaultAddress.addressLine2 ?? "",
            building: defaultAddress.building ?? ""
          });
        }
      })
      .catch(() => {
        if (active) {
          setSavedAddresses([]);
          setSavedAddressLoadError("savedAddressLoadFailed");
        }
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!selectedAdmin1Code) {
      setMunicipalities([]);
      setMunicipalitiesLoading(false);
      return;
    }
    let active = true;
    setMunicipalitiesLoading(true);
    setRegionLoadError(null);
    void bookingApi
      .listAdministrativeRegions({
        country: "JP",
        locale: "ja",
        parent: selectedAdmin1Code
      })
      .then(({ list }) => {
        if (active) setMunicipalities(list);
      })
      .catch(() => {
        if (active) {
          setMunicipalities([]);
          setRegionLoadError("regionLoadFailed");
        }
      })
      .finally(() => {
        if (active) setMunicipalitiesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedAdmin1Code]);

  useEffect(() => {
    const updateProgressByScroll = () => {
      const progressBottom = progressBarRef.current?.getBoundingClientRect().bottom ?? 138;
      const sectionTops = sectionRefs.current.map(
        (section) => section?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
      );
      const nextStep = resolveActiveCheckoutStep({
        progressBottom,
        sectionTops,
        viewportHeight: window.innerHeight
      });
      setActiveProgressStep((current) => current === nextStep ? current : nextStep);
    };
    const frameId = window.requestAnimationFrame(updateProgressByScroll);
    window.addEventListener("scroll", updateProgressByScroll, { passive: true });
    window.addEventListener("resize", updateProgressByScroll);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", updateProgressByScroll);
      window.removeEventListener("resize", updateProgressByScroll);
    };
  }, [loadStatus]);

  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.id === selectedSlotId && isCheckoutSlotBookable(slot, checkoutNowMs)) ?? null,
    [checkoutNowMs, selectedSlotId, slots]
  );
  const selectedTechnicianProfileId = selectedSlot?.technicianProfileId ?? null;
  const coreService = service?.coreService ?? null;
  const fixedTechnicianPublisher = intelligenceSource?.publisherCard?.type === "technician"
    ? intelligenceSource.publisherCard
    : service?.technicianPublisher?.type === "technician"
      ? service.technicianPublisher
      : null;

  useEffect(() => {
    if (!selectedTechnicianProfileId || coreService?.technician?.id === selectedTechnicianProfileId || fixedTechnicianPublisher) {
      setSelectedTechnicianDetail(null);
      setTechnicianLoadStatus("idle");
      return undefined;
    }

    let active = true;
    setSelectedTechnicianDetail(null);
    setTechnicianLoadStatus("loading");
    coreReadApi.getTechnicianDetail(selectedTechnicianProfileId)
      .then((technician) => {
        if (!active) return;
        if (technician.id !== selectedTechnicianProfileId) {
          setTechnicianLoadStatus("error");
          return;
        }
        setSelectedTechnicianDetail(technician);
        setTechnicianLoadStatus("idle");
      })
      .catch(() => {
        if (!active) return;
        setTechnicianLoadStatus("error");
      });

    return () => {
      active = false;
    };
  }, [coreService?.technician?.id, fixedTechnicianPublisher, selectedTechnicianProfileId]);

  useEffect(() => {
    if (!estimate) return undefined;
    const remainingMs = Date.parse(estimate.expiresAt) - Date.now();
    if (remainingMs <= 0) {
      setEstimateStatus("expired");
      return undefined;
    }
    const timeoutId = window.setTimeout(() => setEstimateStatus("expired"), remainingMs);
    return () => window.clearTimeout(timeoutId);
  }, [estimate]);

  const checkoutServiceMode = intelligenceSource?.serviceMode ?? service?.serviceMode;
  const supportsBothModes = checkoutServiceMode === "both" || checkoutServiceMode === "flexible";
  const canSubmitBooking = Boolean(selectedSlot) && (
    fulfillmentMode === "store" ||
    Boolean(homeAddress.addressLine1.trim() && selectedAdmin1Code && selectedAdmin2Code && estimateStatus === "success")
  );
  const requestedPeople = searchParams.get("people");
  const peopleCount = requestedPeople?.match(/^\d+/u)?.[0] ?? "1";
  const people = t("peopleCount", { count: peopleCount });
  const valueLocale = language === "zh" ? "ja-JP" : language;
  const formattedHomeAddress = [homeAddress.postalCode, homeAddress.prefecture, homeAddress.city, homeAddress.addressLine1, homeAddress.addressLine2, homeAddress.building].map((value) => value?.trim()).filter(Boolean).join(" ");
  const locationAddress = fulfillmentMode === "store" ? service?.shop.address.trim() ?? "" : formattedHomeAddress;
  const locationTitle = fulfillmentMode === "store" ? service?.shop.name ?? "" : t("homeService");
  const locationQuery = fulfillmentMode === "store" ? [locationTitle, locationAddress].filter(Boolean).join(" ") : "";
  const selectedTechnician = useMemo(() => {
    if (!selectedTechnicianProfileId) return null;
    if (coreService?.technician?.id === selectedTechnicianProfileId) return coreService.technician;
    return selectedTechnicianDetail?.id === selectedTechnicianProfileId
      ? selectedTechnicianDetail
      : null;
  }, [coreService?.technician, selectedTechnicianDetail, selectedTechnicianProfileId]);
  const checkoutTechnicianCardData = useMemo(() => {
    const technician = selectedTechnician;
    if (!technician) return null;

    return {
      id: technician.publicId,
      entityType: "technician" as const,
      displayName: technician.displayName,
      avatar: technician.avatarUrl ?? "",
      coverImage: technician.avatarUrl ?? "",
      regionLabel: technician.city,
      addressValue: technician.city,
      primaryLabel: t("technician"),
      kycVerified: false,
      levelLabel: "",
      scoreLabel: t("serviceReviews"),
      scoreValue: `${finiteRating(technician.reviewSummary.ratingAverage).toFixed(1)}/5`,
      followerCount: 0,
      followingCount: 0
    };
  }, [language, selectedTechnician]);
  const displayServiceInfo = useMemo(
    () => intelligenceSource?.serviceCard
      ? mapExchangeIntelligenceServiceToUnifiedData(
          intelligenceSource.serviceCard,
          serviceModeLabel(intelligenceSource.serviceMode, t)
        )
      : service?.serviceInfo ?? null,
    [intelligenceSource, language, service?.serviceInfo]
  );
  const sourcePublisherData = useMemo(() => {
    const publisher = intelligenceSource?.publisherCard ?? fixedTechnicianPublisher;
    if (!publisher) return null;
    return mapExchangeIntelligencePublisherToProfileData(
      publisher,
      serviceModeLabel(service?.serviceMode ?? "store", t),
      {
        entity: publisher.type === "shop" ? t("shop") : t("technician"),
        bookable: t("available"),
        unavailable: t("unavailable"),
        rating: publisher.type === "shop" ? t("shopRating") : t("serviceRating"),
        reviews: t("reviews"),
        serviceMode: t("serviceMethod"),
        completedOrders: t("completedOrders"),
        acceptanceRate: t("acceptanceRate"),
        experience: publisher.type === "technician" ? t("experienceYears", { count: publisher.yearsExperience }) : ""
      }
    );
  }, [fixedTechnicianPublisher, intelligenceSource?.publisherCard, language, service?.serviceMode]);

  const appendQuickNote = (value: string) => {
    setNote((current) => current.includes(value) ? current : [current.trim(), value].filter(Boolean).join("、"));
  };

  const requestTravelEstimate = async () => {
    if (!service || estimateStatus === "loading") return;
    if (!selectedSlotId) {
      setEstimateError("selectTimeBeforeEstimate");
      setEstimateStatus("error");
      return;
    }
    const normalizedAddress = Object.fromEntries(Object.entries(homeAddress).map(([key, value]) => [key, value.trim()])) as JapaneseRouteAddress;
    if (!/^\d{3}-?\d{4}$/.test(normalizedAddress.postalCode) || !normalizedAddress.prefecture || !normalizedAddress.city || !normalizedAddress.addressLine1) {
      setEstimateError("completeAddressForEstimate");
      setEstimateStatus("error");
      return;
    }
    const requestVersion = ++estimateRequestVersionRef.current;
    setEstimateStatus("loading"); setEstimateError(null); setEstimate(null);
    try {
      const result = await travelFareApi.createEstimate({ servicePublicId: service.publicId, scheduleSlotId: selectedSlotId, destination: normalizedAddress });
      if (requestVersion !== estimateRequestVersionRef.current) return;
      setEstimate(result); setEstimateStatus(Date.parse(result.expiresAt) > Date.now() ? "success" : "expired");
    } catch (error) {
      if (requestVersion !== estimateRequestVersionRef.current) return;
      setEstimateError(describeEstimateError(error)); setEstimateStatus("error");
    }
  };

  const selectCheckoutSlot = (slotId: number) => {
    const slot = slots.find(
      (candidate) => candidate.id === slotId && isCheckoutSlotBookable(candidate, Date.now())
    );
    if (!slot) return;
    const selectedTime = getTokyoSlotParts(slot.startsAt)?.time;
    if (!selectedTime) return;

    if (slot.id !== selectedSlotId) {
      estimateRequestVersionRef.current += 1;
      setEstimate(null);
      setEstimateStatus("idle");
      setEstimateError(null);
    }
    setSelectedSlotId(slot.id);
    setSlotSelectionInvalid(false);
    const nextSearchParams = new URLSearchParams(location.search);
    const previousState = checkoutHistoryState(location.state);
    if (
      nextSearchParams.get("time") === selectedTime
      && persistedCheckoutScheduleSlotId(previousState) === slot.id
    ) return;
    nextSearchParams.set("time", selectedTime);
    nextSearchParams.set("scheduleSlotId", String(slot.id));
    navigate({
      pathname: location.pathname,
      search: `?${nextSearchParams.toString()}`,
      hash: location.hash
    }, {
      replace: true,
      state: {
        ...previousState,
        [checkoutScheduleSlotStateKey]: slot.id
      }
    });
  };

  const copyAddress = async () => {
    if (!locationAddress) return;
    try {
      await navigator.clipboard.writeText(locationAddress);
      setAddressCopyLabel("copied");
      window.setTimeout(() => setAddressCopyLabel("copyAddress"), 1600);
    } catch {
      setAddressCopyLabel("copyFailed");
      window.setTimeout(() => setAddressCopyLabel("copyAddress"), 1600);
    }
  };

  const jumpToSection = (index: number, key: CheckoutProgressKey) => {
    const section = sectionRefs.current[index];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
    if (section) {
      section.scrollIntoView({ behavior, block: "start" });
    }
    if (key === "remark") {
      window.setTimeout(() => remarkInputRef.current?.focus(), reduceMotion ? 0 : 320);
    }
  };

  const submitBooking = async () => {
    if (submitting) return;
    const freshSelectedSlot = slots.find(
      (slot) => slot.id === selectedSlotId && isCheckoutSlotBookable(slot, Date.now())
    );
    if (!freshSelectedSlot) {
      setSelectedSlotId(null);
      setSlotSelectionInvalid(true);
      return;
    }
    if (!isAuthenticated) {
      navigate(`/login/user?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }
    if (fulfillmentMode === "home" && (!estimate || estimateStatus !== "success" || Date.parse(estimate.expiresAt) <= Date.now())) {
      setEstimateStatus(estimate ? "expired" : estimateStatus);
      setSubmitError("validEstimateRequired");
      return;
    }
    if (fulfillmentMode === "home") {
      if (!selectedAdmin1Code || !selectedAdmin2Code) {
        setSubmitError("chooseRegionsBeforeSubmit");
        return;
      }
      if (!homeAddress.addressLine1.trim()) {
        setSubmitError("completeHomeAddressBeforeSubmit");
        return;
      }
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const fulfillment = fulfillmentMode === "home"
        ? { fulfillmentMode: "home" as const, serviceLocation: { countryCode: "JP" as const, admin1Code: selectedAdmin1Code, admin2Code: selectedAdmin2Code }, fulfillmentAddress: Object.fromEntries(Object.entries(homeAddress).map(([key, value]) => [key, value.trim()])) as JapaneseRouteAddress, travelEstimatePublicId: estimate!.publicId }
        : { fulfillmentMode: "store" as const };
      const bookingInput = {
        ...(catalogRef.type === "shop_service"
          ? { serviceId: catalogRef.id }
          : { technicianServiceId: catalogRef.id }),
        ...(exchangePostId ? { exchangeIntelligencePostId: exchangePostId } : {}),
        expectedPriceAmountJpy: Number(displayServiceInfo?.priceAmount ?? freshSelectedSlot.priceAmount),
        scheduleSlotId: freshSelectedSlot.id,
        ...fulfillment,
        paymentMethod,
        note: note.trim() || undefined
      };
      const fingerprint = JSON.stringify(bookingInput);
      const idempotency = exchangePostId
        ? resolveBookingIdempotencyKey(bookingIdempotencyRef.current, fingerprint)
        : null;
      bookingIdempotencyRef.current = idempotency;
      const order = idempotency
        ? await bookingApi.createBooking(bookingInput, idempotency.key)
        : await bookingApi.createBooking(bookingInput);
      navigate(`/orders/${order.id}`, {
        replace: true,
        state: { notice: t("bookingCreated") }
      });
    } catch (error) {
      setSubmitError(describeCheckoutError(error));
      if (error instanceof ApiClientError && error.status === 409) {
        setSelectedSlotId(null);
        setSlotSelectionInvalid(true);
      }
      if (error instanceof ApiClientError && error.code === 41038) {
        setRevision((current) => current + 1);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageScaffold
      contentClassName="space-y-4 pb-40 pt-[calc(env(safe-area-inset-top,0px)+148px)] sm:pt-[calc(env(safe-area-inset-top,0px)+156px)]"
      navItems={[]}
    >
      <AppTopBar
        closeLabel={t("closeCheckout")}
        fixed
        footer={(
          <CheckoutProgressNav
            activeIndex={activeProgressStep}
            containerRef={progressBarRef}
            fulfillmentMode={fulfillmentMode}
            onSelect={jumpToSection}
          />
        )}
        footerClassName="mt-3"
        info={t("checkoutInfo")}
        onBack={() => navigate(-1)}
        onClose={() => navigate("/", { replace: true })}
        title={t("checkoutTitle")}
      />

      {loadStatus === "loading" ? (
        <SurfacePanel className="p-6 text-center" aria-live="polite">
          <p className="text-sm font-black text-[color:var(--client-text)]" data-no-i18n>{t("loadingCheckout")}</p>
        </SurfacePanel>
      ) : null}

      {loadStatus === "error" ? (
        <div role="alert">
          <SurfacePanel className="p-6 text-center">
            <h2 className="text-lg font-black text-[color:var(--client-text)]" data-no-i18n>{t("checkoutLoadFailed")}</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-[color:var(--client-muted)]" data-no-i18n>{loadError ? t(loadError) : null}</p>
            <PrimaryButton className="mt-4 w-full" onClick={() => setRevision((current) => current + 1)}>
              <span data-no-i18n>{t("reloadCheckout")}</span>
            </PrimaryButton>
          </SurfacePanel>
        </div>
      ) : null}

      {loadStatus === "success" && service && displayServiceInfo ? (
        <>
          <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[0] = node)}>
            <SectionTitle>{t("package")}</SectionTitle>
            {intelligenceSource ? (
              <SurfacePanel className="border-[color:var(--client-primary)]/25 bg-[color:var(--client-primary-soft)] p-4">
                <p className="text-xs font-black text-[color:var(--client-primary)]" data-no-i18n>{t("sourceInfo")} · #{exchangePostId}</p>
                <p className="mt-1 text-sm font-bold text-[color:var(--client-text)]" data-no-i18n>{t("sourceLocked")}</p>
              </SurfacePanel>
            ) : null}
            <UnifiedServiceInfoCard data={displayServiceInfo} detailTo={intelligenceSource?.serviceCard?.detailPath ?? service.serviceDetailPath} />
            {intelligenceSource?.publisherCard?.type === "shop" && sourcePublisherData ? (
              <UnifiedProfileCard
                data={sourcePublisherData}
                detailTo={intelligenceSource.publisherCard?.detailPath}
                variant="detailHeader"
              />
            ) : null}
          </div>

          <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[1] = node)}>
            <SectionTitle>{t("serviceMethod")}</SectionTitle>
            <div className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-3 shadow-[0_14px_28px_rgba(0,0,0,0.06)]">
              <div className="grid grid-cols-2 gap-2">
                {(["store", "home"] as const).map((mode) => {
                  const disabled = !supportsBothModes && fulfillmentMode !== mode;
                  return (
                    <button
                      className={cn(
                        "rounded-full px-4 py-3 text-sm font-black transition",
                        fulfillmentMode === mode
                          ? "bg-[color:var(--client-primary)] text-[#090806]"
                          : "bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] text-[color:var(--client-muted)]",
                        disabled && "cursor-not-allowed opacity-45"
                      )}
                      disabled={disabled}
                      key={mode}
                      onClick={() => setFulfillmentMode(mode)}
                      type="button"
                    >
                      <span data-no-i18n>{mode === "store" ? t("storeService") : t("homeService")}</span>
                    </button>
                  );
                })}
              </div>
              {fulfillmentMode === "store" ? (
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-[17px] font-black tracking-[-0.03em] text-[color:var(--client-text)]" data-no-i18n>{t("storeService")}</p>
                    <p className="mt-1 text-sm leading-6 text-[color:var(--client-muted)]">{service.shop.name}</p>
                  </div>
                  <div className="rounded-[22px] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] p-3">
                    <p className="text-sm font-black text-[color:var(--client-text)]">{service.shop.name}</p>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">{service.shop.city} · {service.shop.address}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-[17px] font-black tracking-[-0.03em] text-[color:var(--client-text)]" data-no-i18n>{t("homeService")}</p>
                  {isAuthenticated ? (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <select
                        aria-label={t("savedAddress")}
                        data-no-i18n
                        className="focus-ring w-full rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]"
                        onChange={(event) => {
                          const address = savedAddresses.find((item) => item.publicId === event.target.value);
                          if (address) applySavedAddress(address);
                          else setSelectedSavedAddressPublicId("");
                        }}
                        value={selectedSavedAddressPublicId}
                      >
                        <option value="">{t("selectSavedAddress")}</option>
                        {savedAddresses.map((address) => (
                          <option key={address.publicId} value={address.publicId}>
                            {address.label}{address.isDefault ? " ★" : ""} · {address.prefecture}{address.city}{address.addressLine1}
                          </option>
                        ))}
                      </select>
                      <button
                        className="focus-ring rounded-full border border-[color:var(--client-primary)] px-4 text-xs font-black text-[color:var(--client-primary)]"
                        onClick={() => navigate("/me/addresses")}
                        type="button"
                      >
                        <span data-no-i18n>{t("manage")}</span>
                      </button>
                    </div>
                  ) : null}
                  {savedAddressLoadError ? <p className="text-xs font-bold text-amber-700" data-no-i18n>{t(savedAddressLoadError)}</p> : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      aria-label={t("prefecture")}
                      data-no-i18n
                      className="focus-ring w-full rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]"
                      onChange={(event) => {
                        setSelectedAdmin1Code(event.target.value);
                        setSelectedAdmin2Code("");
                        updateHomeAddress("prefecture", prefectures.find((region) => region.code === event.target.value)?.name ?? "");
                        updateHomeAddress("city", "");
                      }}
                      value={selectedAdmin1Code}
                    >
                      <option value="">{t("choosePrefecture")}</option>
                      {prefectures.map((region) => (
                        <option key={region.code} value={region.code}>{region.name}</option>
                      ))}
                    </select>
                    <select
                      aria-label={t("municipality")}
                      data-no-i18n
                      className="focus-ring w-full rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)] disabled:opacity-50"
                      disabled={!selectedAdmin1Code || municipalitiesLoading}
                      onChange={(event) => {
                        setSelectedAdmin2Code(event.target.value);
                        updateHomeAddress("city", municipalities.find((region) => region.code === event.target.value)?.name ?? "");
                      }}
                      value={selectedAdmin2Code}
                    >
                      <option value="">{municipalitiesLoading ? t("loadingMunicipalities") : t("chooseMunicipality")}</option>
                      {municipalities.map((region) => (
                        <option key={region.code} value={region.code}>{region.name}</option>
                      ))}
                    </select>
                  </div>
                  {regionLoadError ? <p className="text-xs font-bold text-red-500" data-no-i18n>{t(regionLoadError)}</p> : null}
                  <div className="grid grid-cols-2 gap-2">
                    <input aria-label={t("postalCode")} className="focus-ring rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 py-2.5 text-sm font-bold" data-no-i18n onChange={(event) => updateHomeAddress("postalCode", event.target.value)} placeholder={t("postalCodePlaceholder")} value={homeAddress.postalCode} />
                    <input aria-label={t("streetAddress")} className="focus-ring rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 py-2.5 text-sm font-bold" data-no-i18n onChange={(event) => updateHomeAddress("addressLine1", event.target.value)} placeholder="銀座1-2-3" value={homeAddress.addressLine1} />
                    <input aria-label={t("addressExtra")} className="focus-ring rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 py-2.5 text-sm font-bold" data-no-i18n onChange={(event) => updateHomeAddress("addressLine2", event.target.value)} placeholder={t("addressExtraPlaceholder")} value={homeAddress.addressLine2} />
                    <input aria-label={t("buildingRoom")} className="focus-ring rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 py-2.5 text-sm font-bold" data-no-i18n onChange={(event) => updateHomeAddress("building", event.target.value)} placeholder={t("buildingRoomPlaceholder")} value={homeAddress.building} />
                  </div>
                  <button className="focus-ring inline-flex h-12 w-full items-center justify-center rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-50" data-no-i18n disabled={estimateStatus === "loading" || !selectedSlotId} onClick={() => void requestTravelEstimate()} type="button">{estimateStatus === "loading" ? t("calculatingRoute") : estimateStatus === "error" || estimateStatus === "expired" ? t("recalculateTravelFee") : t("estimateTravelFee")}</button>
                  {estimateStatus === "success" && estimate ? <div className="rounded-[20px] bg-[color:var(--client-primary-soft)] p-3" data-no-i18n><p className="text-sm font-black text-[color:var(--client-primary)]">{t("formalTravelFee", { amount: estimate.fareAmountJpy.toLocaleString(valueLocale) })}</p><p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{t("routeDetails", { distance: (estimate.distanceMeters / 1000).toFixed(1), maximum: (estimate.bandMaximumDistanceMeters / 1000).toFixed(1), version: estimate.policyVersion })}</p><p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{t("estimateValidUntil", { expiresAt: new Date(estimate.expiresAt).toLocaleString(valueLocale) })}</p></div> : null}
                  {estimateStatus === "expired" ? <p className="text-sm font-black text-amber-700" data-no-i18n role="alert">{t("estimateExpired")}</p> : null}
                  {estimateStatus === "error" && estimateError ? <p className="text-sm font-black text-red-600" data-no-i18n role="alert">{t(estimateError)}</p> : null}
                </div>
              )}
            </div>
          </div>

          <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[2] = node)}>
            <SectionTitle>{t("time")}</SectionTitle>
            <div className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)]">
              <p className="text-xs font-black text-[color:var(--client-primary)]" data-no-i18n>{t("bookingTime")}</p>
              <div className="mt-3 rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] p-4">
                <p className="text-xs font-bold text-[color:var(--client-muted)]" data-no-i18n>{t("date")}</p>
                <p className="mt-2 text-[18px] font-black text-[color:var(--client-text)]" data-no-i18n>{formatTokyoDate(`${selectedDate}T00:00:00+09:00`, language)}</p>
              </div>
              {slots.length ? (
                <>
                  <CheckoutTimeRow
                    date={selectedDate}
                    nowMs={checkoutNowMs}
                    onSelect={selectCheckoutSlot}
                    people={people}
                    selectedSlotId={selectedSlotId}
                    slots={slots}
                  />
                  {slotSelectionInvalid ? (
                    <div className="mt-3 rounded-[18px] border border-amber-400/40 bg-amber-500/10 px-4 py-3" data-no-i18n role="alert">
                      <p className="text-sm font-black text-amber-700">{t("invalidCheckoutSlot")}</p>
                    </div>
                  ) : null}
                  <p className="mt-3 text-xs leading-5 text-[color:var(--client-muted)]" data-no-i18n>{t("arrivalReminder")}</p>
                </>
              ) : (
                <div className="mt-3 rounded-[22px] border border-dashed border-[color:var(--client-line)] px-4 py-8 text-center">
                  <p className="text-sm font-black text-[color:var(--client-text)]" data-no-i18n>{t("noSlots")}</p>
                  <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]" data-no-i18n>{t("slotsAppearAfterPublish")}</p>
                  {slotSelectionInvalid ? (
                    <p className="mt-3 text-sm font-black text-amber-700" data-no-i18n role="alert">{t("invalidCheckoutSlot")}</p>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[3] = node)}>
            <SectionTitle>{t("address")}</SectionTitle>
            <div className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-3 shadow-[0_14px_28px_rgba(0,0,0,0.06)]">
              {fulfillmentMode === "home" ? (
                <div className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:var(--client-surface)] px-4 py-6 text-center">
                  <p className="text-sm font-black text-[color:var(--client-text)]" data-no-i18n>{t("homeAddressPrivacy")}</p>
                </div>
              ) : locationQuery ? (
                <div className="relative overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[#101318]">
                  <iframe
                    aria-hidden="true"
                    className="pointer-events-none h-[136px] w-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={googleMapsEmbedUrl(locationQuery)}
                    title={t("mapThumbnailTitle")}
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/55 via-black/15 to-transparent px-3 pb-3 pt-8">
                    <span className="rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/92">Google Maps</span>
                    <span className="text-[10px] font-semibold text-white/82" data-no-i18n>{fulfillmentMode === "store" ? t("storeMapPreview") : t("homeMapPreview")}</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-[22px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] px-4 py-8 text-center">
                  <p className="text-sm font-black text-[color:var(--client-text)]" data-no-i18n>{t("mapAfterAddress")}</p>
                </div>
              )}
              <div className="mt-3">
                <p className="text-sm font-black text-[color:var(--client-text)]" data-no-i18n>{locationAddress || t("enterHomeAddress")}</p>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">{locationTitle}{service.shop.city ? ` · ${service.shop.city}` : ""}</p>
              </div>
              <div className="mt-3 flex gap-2">
                {locationQuery ? (
                  <a
                    className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-2 text-xs font-black text-[color:var(--client-primary)]"
                    href={googleMapsSearchUrl(locationQuery)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span data-no-i18n>{t("googleMaps")}</span>
                  </a>
                ) : null}
                <button
                  className="rounded-full bg-[color:color-mix(in_srgb,var(--client-surface)_70%,transparent)] px-3 py-2 text-xs font-black text-[color:var(--client-text)] disabled:opacity-45"
                  disabled={!locationAddress}
                  onClick={() => void copyAddress()}
                  type="button"
                >
                  <span data-no-i18n>{t(addressCopyLabel)}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[4] = node)}>
            <SectionTitle>{t("technician")}</SectionTitle>
            {fixedTechnicianPublisher && sourcePublisherData ? (
              <UnifiedProfileCard
                data={sourcePublisherData}
                detailTo={fixedTechnicianPublisher.detailPath}
                variant="detailHeader"
              />
            ) : checkoutTechnicianCardData ? (
              <SocialProfileMiniCard
                className="cursor-pointer"
                data={checkoutTechnicianCardData}
                detailTo={`/profiles/technician/${checkoutTechnicianCardData.id}?view=card`}
                onOpenDetails={() => navigate(`/profiles/technician/${checkoutTechnicianCardData.id}?view=card`)}
                showAction={false}
                showLevel={false}
                showSocialStats={false}
              />
            ) : selectedTechnicianProfileId ? (
              <div
                aria-busy={technicianLoadStatus === "loading"}
                className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)]"
                role={technicianLoadStatus === "error" ? "alert" : undefined}
              >
                <p className="text-sm font-black text-[color:var(--client-text)]">
                  <span data-no-i18n>{technicianLoadStatus === "error" ? t("technicianDetailsUnavailable") : t("loadingTechnicianDetails")}</span>
                </p>
              </div>
            ) : (
              <div className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)]">
                <p className="text-sm font-black text-[color:var(--client-text)]" data-no-i18n>{t("assignedByShop")}</p>
                <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]" data-no-i18n>{t("assignedAfterConfirmation")}</p>
              </div>
            )}
          </div>

          <div className="scroll-mt-[170px] space-y-2 pt-1" ref={(node) => void (sectionRefs.current[5] = node)}>
            <SectionTitle>{t("remark")}</SectionTitle>
            <div className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-3 shadow-[0_14px_28px_rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between gap-3 px-1 pb-2">
                <p className="text-sm font-black text-[color:var(--client-text)]" data-no-i18n>{t("specialRequests")}</p>
                <p className="text-xs font-semibold text-[color:var(--client-muted)]" data-no-i18n>{note.trim() ? t("noteCount", { count: note.trim().length }) : t("optional")}</p>
              </div>
              <textarea
                className="focus-ring min-h-[156px] w-full rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 py-3.5 text-sm font-bold leading-6 text-[color:var(--client-text)]"
                id="formal-checkout-note"
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                data-no-i18n
                placeholder={t("notePlaceholder")}
                ref={remarkInputRef}
                value={note}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {quickNotes.map((quickNote) => (
                  <button
                    className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary)]"
                    data-no-i18n
                    key={quickNote}
                    onClick={() => appendQuickNote(t(quickNote))}
                    type="button"
                  >
                    {t(quickNote)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <SectionTitle>{t("notices")}</SectionTitle>
            <div className="space-y-4 rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)]">
              <div className="flex items-start gap-3">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--client-primary)]" />
                <p className="text-sm leading-6 text-[color:var(--client-muted)]" data-no-i18n>{t("bookingNotice")}</p>
              </div>
              <div className="border-t border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] pt-4">
                <h3 className="text-sm font-black text-[color:var(--client-text)]" data-no-i18n>{t("cancellationPolicy")}</h3>
                <p className="mt-2 text-xs leading-5 text-[color:var(--client-muted)]" data-no-i18n>{t("cancellationNotice")}</p>
              </div>
              <div className="border-t border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] pt-4">
                <h3 className="text-sm font-black text-[color:var(--client-text)]">NDP（NeeDoPoint）</h3>
                <p className="mt-2 text-xs leading-5 text-[color:var(--client-muted)]" data-no-i18n>{t("ndpNotice")}</p>
              </div>
            </div>
          </div>

          {submitError ? (
            <div role="alert">
              <SurfacePanel className="border-red-400/35 bg-red-500/10 p-4">
                <p className="text-sm font-black text-red-500" data-no-i18n>{t(submitError)}</p>
                {submitError === "bookingStateChanged" ? (
                  <SecondaryButton className="mt-3 w-full" onClick={() => setRevision((current) => current + 1)}>
                    <span data-no-i18n>{t("reloadAvailableTimes")}</span>
                  </SecondaryButton>
                ) : null}
              </SurfacePanel>
            </div>
          ) : null}

          <footer className="safe-nav-bottom client-app-frame client-app-gutter pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-[color:var(--client-bg)] via-[color:var(--client-bg)] to-transparent pb-[calc(max(env(safe-area-inset-bottom),12px)+10px)] pt-14">
            <div className="pointer-events-auto space-y-3">
              <div className="grid grid-cols-[minmax(0,1fr),auto] items-end gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black text-[color:color-mix(in_srgb,var(--client-text)_72%,var(--client-muted)_28%)]" data-no-i18n>{t("amountDue")}</p>
                  <strong className="mt-1 block text-[26px] font-black leading-none text-[color:var(--client-primary)]">{yen(Number(displayServiceInfo.priceAmount) + (fulfillmentMode === "home" && estimateStatus === "success" ? estimate?.fareAmountJpy ?? 0 : 0))}</strong>
                  {fulfillmentMode === "home" ? <span className="mt-1 block text-[10px] font-bold text-[color:var(--client-muted)]" data-no-i18n>{t("serviceAndTravelFee")}</span> : null}
                </div>
                <div className="flex max-w-[54vw] flex-wrap justify-end gap-2">
                  {(["onsite", "bank_transfer"] as const).map((method) => (
                    <button
                      aria-pressed={paymentMethod === method}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[10px] font-black backdrop-blur",
                        paymentMethod === method
                          ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]"
                          : "border-[color:var(--client-line)] bg-[color:var(--client-surface)] text-[color:var(--client-text)]"
                      )}
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      type="button"
                    >
                      <span data-no-i18n>{method === "onsite" ? t("payOnArrival") : t("bankTransfer")}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2.5">
                <SecondaryButton className="w-full" onClick={() => navigate(service.shop.contactPath)}><span data-no-i18n>{t("contact")}</span></SecondaryButton>
                <button
                  className="focus-ring inline-flex h-12 w-full items-center justify-center rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-[0_18px_40px_color-mix(in_srgb,var(--client-primary)_24%,transparent)] transition disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canSubmitBooking || submitting}
                  onClick={() => void submitBooking()}
                  type="button"
                >
                  <span data-no-i18n>{submitting ? t("creatingBooking") : isAuthenticated ? t("confirmBooking") : t("loginToConfirmBooking")}</span>
                </button>
              </div>
            </div>
          </footer>
        </>
      ) : null}
    </PageScaffold>
  );
}
