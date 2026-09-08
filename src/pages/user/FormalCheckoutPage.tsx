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
  type AdministrativeRegionReference,
  type BookingScheduleSlot,
  type ManualPaymentMethod
} from "../../features/booking/api";
import {
  coreReadApi,
  type CoreServiceDetail,
  type CoreTechnicianCard
} from "../../features/core-read/api";
import { pricingModeApi } from "../../features/pricing-mode/api";
import { cn, yen } from "../../lib/utils";
import { SocialProfileMiniCard } from "../../shared/profile-card/SocialProfileMiniCard";
import { mapCoreServiceCardToUnifiedData, UnifiedServiceInfoCard } from "../../shared/service-card";
import type { FulfillmentMode } from "../../types/domain";
import {
  CheckoutProgressNav,
  resolveActiveCheckoutStep,
  type CheckoutProgressKey
} from "./formal-checkout/CheckoutProgressNav";
import { CheckoutTimeRow } from "./formal-checkout/CheckoutTimeRow";
import {
  getTokyoDayWindow,
  getTokyoSlotParts,
  isCheckoutSlotBookable,
  resolveInitialCheckoutSlotId
} from "./formal-checkout/checkoutTimeSlots";

type LoadStatus = "loading" | "success" | "error";
type TechnicianLoadStatus = "idle" | "loading" | "error";
type EstimateStatus = "idle" | "loading" | "success" | "error" | "expired";

const quickNotes = ["女性技师优先", "请提前联系", "需要安静环境"];
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

function describeCheckoutError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有创建预约的权限";
    if (error.status === 404) return "服务不存在或已停止预约";
    if (error.status === 409) return "预约状态已变化，请重新选择时段";
    if (error.status >= 500) return "预约服务暂时不可用，请稍后重试";
  }
  return "预约页加载失败，请检查网络后重试";
}

function describeEstimateError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.message === "error.travel.outside_service_area") return "该地址超出店铺的上门服务范围。";
    if (error.message === "error.travel.provider_unconfigured") return "路线供应商尚未配置，暂时无法估算交通费。";
    if (error.message === "error.travel.route_not_found") return "没有找到可用的驾驶路线，请检查地址。";
    if (error.message.startsWith("error.travel.provider_")) return "路线供应商暂时不可用，请稍后重试。";
  }
  return "交通费估算失败，请检查地址后重试。";
}

function resolveFulfillmentMode(service: CoreServiceDetail, requestedMode: string | null): FulfillmentMode {
  if (requestedMode === "home" || requestedMode === "store") return requestedMode;
  return service.serviceMode === "home" || service.serviceMode === "onsite" ? "home" : "store";
}

function formatTokyoDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
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

type FormalCheckoutPageProps =
  | { serviceId: number; shopId?: never; technicianId?: never; technicianServiceId?: never }
  | { serviceId?: never; shopId: number; technicianId: number; technicianServiceId: number };

export function FormalCheckoutPage(props: FormalCheckoutPageProps) {
  const shopServiceId = props.serviceId;
  const technicianServiceId = props.technicianServiceId;
  const technicianServiceShopId = props.shopId;
  const technicianServiceTechnicianId = props.technicianId;
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [service, setService] = useState<CoreServiceDetail | null>(null);
  const [serviceBookingMetadata, setServiceBookingMetadata] = useState<{ tags: string[]; usageCount: number } | null>(null);
  const [slots, setSlots] = useState<BookingScheduleSlot[]>([]);
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
  const [estimateError, setEstimateError] = useState("");
  const estimateRequestVersionRef = useRef(0);
  const [prefectures, setPrefectures] = useState<AdministrativeRegionReference[]>([]);
  const [municipalities, setMunicipalities] = useState<AdministrativeRegionReference[]>([]);
  const [selectedAdmin1Code, setSelectedAdmin1Code] = useState("");
  const [selectedAdmin2Code, setSelectedAdmin2Code] = useState("");
  const [regionLoadError, setRegionLoadError] = useState("");
  const [municipalitiesLoading, setMunicipalitiesLoading] = useState(false);
  const [note, setNote] = useState(searchParams.get("remark") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [addressCopyLabel, setAddressCopyLabel] = useState("复制地址");
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const remarkInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeProgressStep, setActiveProgressStep] = useState(0);
  const selectedDayWindow = useMemo(() => getTokyoDayWindow(selectedDate), [selectedDate]);
  const persistedSlotId = persistedCheckoutScheduleSlotId(location.state);
  const requestedTechnicianId = searchParams.get("technician");
  const shopServiceTechnicianId = requestedTechnicianId && /^[1-9]\d*$/.test(requestedTechnicianId)
    ? Number(requestedTechnicianId)
    : undefined;

  const updateHomeAddress = (field: keyof JapaneseRouteAddress, value: string) => {
    estimateRequestVersionRef.current += 1;
    setHomeAddress((current) => ({ ...current, [field]: value }));
    setEstimate(null);
    setEstimateStatus("idle");
    setEstimateError("");
  };

  useEffect(() => {
    if (!selectedDayWindow) return undefined;
    let active = true;
    setLoadStatus("loading");
    setLoadError("");
    setServiceBookingMetadata(null);

    const serviceRequest = shopServiceId
      ? coreReadApi.getServiceDetail(shopServiceId).then(async (serviceDetail) => {
          const navigation = await pricingModeApi.getBookingNavigation(
            serviceDetail.shop.id,
            { page: 1, pageSize: 100 }
          );
          const bookingService = navigation.entry === "service_menu"
            ? navigation.services.list.find((item) => item.id === shopServiceId)
            : null;
          if (!bookingService) {
            throw new Error("Shop service is unavailable in the current pricing mode");
          }
          return {
            detail: serviceDetail,
            bookingMetadata: {
              tags: bookingService.tags,
              usageCount: bookingService.usageCount
            }
          };
        })
      : Promise.all([
          coreReadApi.getShopDetail(technicianServiceShopId!),
          coreReadApi.listCategories({ page: 1, pageSize: 100 }),
          pricingModeApi.listPublicTechnicianServices(
            technicianServiceShopId!,
            technicianServiceTechnicianId!,
            { page: 1, pageSize: 100 }
          )
        ]).then(([shop, categories, technicianServices]) => {
          const technicianService = technicianServices.list.find((item) => item.id === technicianServiceId);
          const category = categories.list.find((item) => item.id === technicianService?.categoryId);
          const technician = shop.technicians.find((item) => item.id === technicianServiceTechnicianId) ?? null;
          if (!technicianService || !category) throw new Error("Technician service is unavailable");
          return { detail: {
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
            reviewSummary: technician?.reviewSummary ?? {
              ratingAverage: "0",
              reviewCount: 0,
              latestReviewAt: null,
              highlights: []
            },
            serviceMode: "store",
            mediaAssets: [],
            createdAt: technicianService.createdAt,
            updatedAt: technicianService.updatedAt
          }, bookingMetadata: { tags: technicianService.tags, usageCount: technicianService.usageCount } };
        });

    Promise.all([
      serviceRequest,
      bookingApi.listAvailability({
        ...(shopServiceId ? { serviceId: shopServiceId } : { technicianServiceId }),
        ...(shopServiceId && shopServiceTechnicianId ? { technicianId: shopServiceTechnicianId } : {}),
        from: selectedDayWindow.from,
        to: selectedDayWindow.to,
        includeUnavailable: true,
        page: 1,
        pageSize: 100
      })
    ])
      .then(([loadedService, availability]) => {
        if (!active) return;
        const serviceDetail = loadedService.detail;
        const formalSlots = availability.list
          .slice()
          .sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id - right.id);
        const requestedTime = searchParams.get("time");

        setService(serviceDetail);
        setServiceBookingMetadata(loadedService.bookingMetadata);
        setSlots(formalSlots);
        setSelectedSlotId(resolveInitialCheckoutSlotId(formalSlots, selectedDate, requestedTime, persistedSlotId));
        setFulfillmentMode(resolveFulfillmentMode(serviceDetail, searchParams.get("mode")));
        setLoadStatus("success");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setService(null);
        setServiceBookingMetadata(null);
        setSlots([]);
        setSelectedSlotId(null);
        setLoadError(describeCheckoutError(error));
        setLoadStatus("error");
      });
    return () => {
      active = false;
    };
  }, [persistedSlotId, revision, searchParams, selectedDate, selectedDayWindow, shopServiceId, shopServiceTechnicianId, technicianServiceId, technicianServiceShopId, technicianServiceTechnicianId]);

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
    }
  }, [checkoutNowMs, selectedSlotId, slots]);

  useEffect(() => {
    let active = true;
    setRegionLoadError("");
    void bookingApi
      .listAdministrativeRegions({ country: "JP", locale: "ja" })
      .then(({ list }) => {
        if (active) setPrefectures(list);
      })
      .catch(() => {
        if (active) {
          setPrefectures([]);
          setRegionLoadError("行政区域加载失败，请重试");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedAdmin1Code) {
      setMunicipalities([]);
      setMunicipalitiesLoading(false);
      return;
    }
    let active = true;
    setMunicipalitiesLoading(true);
    setRegionLoadError("");
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
          setRegionLoadError("行政区域加载失败，请重试");
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

  useEffect(() => {
    if (!selectedTechnicianProfileId || service?.technician?.id === selectedTechnicianProfileId) {
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
  }, [selectedTechnicianProfileId, service?.technician?.id]);

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

  const supportsBothModes = service?.serviceMode === "both";
  const canSubmitBooking = Boolean(selectedSlot) && (
    fulfillmentMode === "store" ||
    Boolean(homeAddress.addressLine1.trim() && selectedAdmin1Code && selectedAdmin2Code && estimateStatus === "success")
  );
  const people = searchParams.get("people") ?? "1名";
  const formattedHomeAddress = [homeAddress.postalCode, homeAddress.prefecture, homeAddress.city, homeAddress.addressLine1, homeAddress.addressLine2, homeAddress.building].map((value) => value?.trim()).filter(Boolean).join(" ");
  const locationAddress = fulfillmentMode === "store" ? service?.shop.address.trim() ?? "" : formattedHomeAddress;
  const locationTitle = fulfillmentMode === "store" ? service?.shop.name ?? "" : "上门服务地址";
  const locationQuery = fulfillmentMode === "store" ? [locationTitle, locationAddress].filter(Boolean).join(" ") : "";
  const selectedTechnician = useMemo(() => {
    if (!selectedTechnicianProfileId) return null;
    if (service?.technician?.id === selectedTechnicianProfileId) return service.technician;
    return selectedTechnicianDetail?.id === selectedTechnicianProfileId
      ? selectedTechnicianDetail
      : null;
  }, [selectedTechnicianDetail, selectedTechnicianProfileId, service?.technician]);
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
      primaryLabel: "技师",
      kycVerified: false,
      levelLabel: "",
      scoreLabel: "服务评价",
      scoreValue: `${finiteRating(technician.reviewSummary.ratingAverage).toFixed(1)}/5`,
      followerCount: 0,
      followingCount: 0
    };
  }, [selectedTechnician]);

  const appendQuickNote = (value: string) => {
    setNote((current) => current.includes(value) ? current : [current.trim(), value].filter(Boolean).join("、"));
  };

  const requestTravelEstimate = async () => {
    if (!service || estimateStatus === "loading") return;
    if (!selectedSlotId) {
      setEstimateError("请先从上方时间栏选定一个可用时段，再估算交通费。");
      setEstimateStatus("error");
      return;
    }
    const normalizedAddress = Object.fromEntries(Object.entries(homeAddress).map(([key, value]) => [key, value.trim()])) as JapaneseRouteAddress;
    if (!/^\d{3}-?\d{4}$/.test(normalizedAddress.postalCode) || !normalizedAddress.prefecture || !normalizedAddress.city || !normalizedAddress.addressLine1) {
      setEstimateError("请完整填写邮编、都道府县、市区町村和街道地址。");
      setEstimateStatus("error");
      return;
    }
    const requestVersion = ++estimateRequestVersionRef.current;
    setEstimateStatus("loading"); setEstimateError(""); setEstimate(null);
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
      setEstimateError("");
    }
    setSelectedSlotId(slot.id);
    const nextSearchParams = new URLSearchParams(location.search);
    const previousState = checkoutHistoryState(location.state);
    if (
      nextSearchParams.get("time") === selectedTime
      && persistedCheckoutScheduleSlotId(previousState) === slot.id
    ) return;
    nextSearchParams.set("time", selectedTime);
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
      setAddressCopyLabel("已复制");
      window.setTimeout(() => setAddressCopyLabel("复制地址"), 1600);
    } catch {
      setAddressCopyLabel("复制失败");
      window.setTimeout(() => setAddressCopyLabel("复制地址"), 1600);
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
      return;
    }
    if (!isAuthenticated) {
      navigate(`/login/user?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }
    if (fulfillmentMode === "home" && (!estimate || estimateStatus !== "success" || Date.parse(estimate.expiresAt) <= Date.now())) {
      setEstimateStatus(estimate ? "expired" : estimateStatus);
      setSubmitError("请先取得有效的正式交通费估价，再提交预约");
      return;
    }
    if (fulfillmentMode === "home") {
      if (!selectedAdmin1Code || !selectedAdmin2Code) {
        setSubmitError("请先选择都道府县和市区町村，再提交预约");
        return;
      }
      if (!homeAddress.addressLine1.trim()) {
        setSubmitError("请先填写完整上门地址，再提交预约");
        return;
      }
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const fulfillment = fulfillmentMode === "home"
        ? { fulfillmentMode: "home" as const, serviceLocation: { countryCode: "JP" as const, admin1Code: selectedAdmin1Code, admin2Code: selectedAdmin2Code }, fulfillmentAddress: Object.fromEntries(Object.entries(homeAddress).map(([key, value]) => [key, value.trim()])) as JapaneseRouteAddress, travelEstimatePublicId: estimate!.publicId }
        : { fulfillmentMode: "store" as const };
      const order = await bookingApi.createBooking({
        ...(shopServiceId ? { serviceId: shopServiceId } : { technicianServiceId: technicianServiceId! }),
        scheduleSlotId: freshSelectedSlot.id,
        ...fulfillment,
        paymentMethod,
        note: note.trim() || undefined
      });
      navigate(`/orders/${order.id}`, {
        replace: true,
        state: { notice: "预约成功，已进入订单详情。" }
      });
    } catch (error) {
      setSubmitError(describeCheckoutError(error));
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
        closeLabel="关闭确认预约"
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
        info="请逐项确认正式服务、时间、地址及担当信息后再提交。"
        onBack={() => navigate(-1)}
        onClose={() => navigate("/", { replace: true })}
        title="确认预约"
      />

      {loadStatus === "loading" ? (
        <SurfacePanel className="p-6 text-center" aria-live="polite">
          <p className="text-sm font-black text-[color:var(--client-text)]">正在加载正式预约信息</p>
        </SurfacePanel>
      ) : null}

      {loadStatus === "error" ? (
        <div role="alert">
          <SurfacePanel className="p-6 text-center">
            <h2 className="text-lg font-black text-[color:var(--client-text)]">预约页加载失败</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-[color:var(--client-muted)]">{loadError}</p>
            <PrimaryButton className="mt-4 w-full" onClick={() => setRevision((current) => current + 1)}>
              重新加载预约页
            </PrimaryButton>
          </SurfacePanel>
        </div>
      ) : null}

      {loadStatus === "success" && service ? (
        <>
          <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[0] = node)}>
            <SectionTitle>套餐</SectionTitle>
            <UnifiedServiceInfoCard data={mapCoreServiceCardToUnifiedData(service)} detailTo={`/services/${service.id}`} />
            {serviceBookingMetadata ? (
              <div className="flex flex-wrap items-center gap-2 px-1 text-xs font-bold text-[color:var(--client-muted)]">
                <span>已使用 {serviceBookingMetadata.usageCount} 次</span>
                {serviceBookingMetadata.tags.map((tag) => <span className="rounded-full border px-2 py-1" key={tag}>{tag}</span>)}
              </div>
            ) : null}
          </div>

          <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[1] = node)}>
            <SectionTitle>服务方式</SectionTitle>
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
                      {mode === "store" ? "到店服务" : "上门服务"}
                    </button>
                  );
                })}
              </div>
              {fulfillmentMode === "store" ? (
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-[17px] font-black tracking-[-0.03em] text-[color:var(--client-text)]">到店服务</p>
                    <p className="mt-1 text-sm leading-6 text-[color:var(--client-muted)]">{service.shop.name}</p>
                  </div>
                  <div className="rounded-[22px] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] p-3">
                    <p className="text-sm font-black text-[color:var(--client-text)]">{service.shop.name}</p>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">{service.shop.city} · {service.shop.address}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-[17px] font-black tracking-[-0.03em] text-[color:var(--client-text)]">上门服务</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      aria-label="都道府县"
                      className="focus-ring w-full rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]"
                      onChange={(event) => {
                        setSelectedAdmin1Code(event.target.value);
                        setSelectedAdmin2Code("");
                        updateHomeAddress("prefecture", prefectures.find((region) => region.code === event.target.value)?.name ?? "");
                        updateHomeAddress("city", "");
                      }}
                      value={selectedAdmin1Code}
                    >
                      <option value="">请选择都道府县</option>
                      {prefectures.map((region) => (
                        <option key={region.code} value={region.code}>{region.name}</option>
                      ))}
                    </select>
                    <select
                      aria-label="市区町村"
                      className="focus-ring w-full rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)] disabled:opacity-50"
                      disabled={!selectedAdmin1Code || municipalitiesLoading}
                      onChange={(event) => {
                        setSelectedAdmin2Code(event.target.value);
                        updateHomeAddress("city", municipalities.find((region) => region.code === event.target.value)?.name ?? "");
                      }}
                      value={selectedAdmin2Code}
                    >
                      <option value="">{municipalitiesLoading ? "正在加载市区町村" : "请选择市区町村"}</option>
                      {municipalities.map((region) => (
                        <option key={region.code} value={region.code}>{region.name}</option>
                      ))}
                    </select>
                  </div>
                  {regionLoadError ? <p className="text-xs font-bold text-red-500">{regionLoadError}</p> : null}
                  <div className="grid grid-cols-2 gap-2">
                    <input aria-label="邮政编码" className="focus-ring rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 py-2.5 text-sm font-bold" onChange={(event) => updateHomeAddress("postalCode", event.target.value)} placeholder="邮编 104-0061" value={homeAddress.postalCode} />
                    <input aria-label="街道地址" className="focus-ring rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 py-2.5 text-sm font-bold" onChange={(event) => updateHomeAddress("addressLine1", event.target.value)} placeholder="銀座1-2-3" value={homeAddress.addressLine1} />
                    <input aria-label="地址补充" className="focus-ring rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 py-2.5 text-sm font-bold" onChange={(event) => updateHomeAddress("addressLine2", event.target.value)} placeholder="丁目、番地（可选）" value={homeAddress.addressLine2} />
                    <input aria-label="建筑物与房间" className="focus-ring rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 py-2.5 text-sm font-bold" onChange={(event) => updateHomeAddress("building", event.target.value)} placeholder="建筑物、房间号（可选）" value={homeAddress.building} />
                  </div>
                  <button className="focus-ring inline-flex h-12 w-full items-center justify-center rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-50" disabled={estimateStatus === "loading" || !selectedSlotId} onClick={() => void requestTravelEstimate()} type="button">{estimateStatus === "loading" ? "正在计算驾驶路线…" : estimateStatus === "error" || estimateStatus === "expired" ? "重新估算交通费" : "估算交通费"}</button>
                  {estimateStatus === "success" && estimate ? <div className="rounded-[20px] bg-[color:var(--client-primary-soft)] p-3"><p className="text-sm font-black text-[color:var(--client-primary)]">正式交通费 ¥{estimate.fareAmountJpy.toLocaleString("ja-JP")}</p><p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">驾驶距离 {(estimate.distanceMeters / 1000).toFixed(1)} km · 适用上限 {(estimate.bandMaximumDistanceMeters / 1000).toFixed(1)} km · 策略 v{estimate.policyVersion}</p><p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">估价有效至 {new Date(estimate.expiresAt).toLocaleString("ja-JP")}</p></div> : null}
                  {estimateStatus === "expired" ? <p className="text-sm font-black text-amber-700" role="alert">交通费估价已过期，请重新估算。</p> : null}
                  {estimateStatus === "error" ? <p className="text-sm font-black text-red-600" role="alert">{estimateError}</p> : null}
                </div>
              )}
            </div>
          </div>

          <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[2] = node)}>
            <SectionTitle>时间</SectionTitle>
            <div className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)]">
              <p className="text-xs font-black text-[color:var(--client-primary)]">预约时间</p>
              <div className="mt-3 rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] p-4">
                <p className="text-xs font-bold text-[color:var(--client-muted)]">日期</p>
                <p className="mt-2 text-[18px] font-black text-[color:var(--client-text)]">{formatTokyoDate(`${selectedDate}T00:00:00+09:00`)}</p>
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
                  <p className="mt-3 text-xs leading-5 text-[color:var(--client-muted)]">*请提前10分钟到达，迟到无联系保留15分钟</p>
                </>
              ) : (
                <div className="mt-3 rounded-[22px] border border-dashed border-[color:var(--client-line)] px-4 py-8 text-center">
                  <p className="text-sm font-black text-[color:var(--client-text)]">暂时没有可预约时段</p>
                  <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">店铺发布新的正式排班后会自动显示。</p>
                </div>
              )}
            </div>
          </div>

          <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[3] = node)}>
            <SectionTitle>地址</SectionTitle>
            <div className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-3 shadow-[0_14px_28px_rgba(0,0,0,0.06)]">
              {fulfillmentMode === "home" ? (
                <div className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:var(--client-surface)] px-4 py-6 text-center">
                  <p className="text-sm font-black text-[color:var(--client-text)]">为保护上门地址隐私，此处不加载第三方地图预览。</p>
                </div>
              ) : locationQuery ? (
                <div className="relative overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[#101318]">
                  <iframe
                    aria-hidden="true"
                    className="pointer-events-none h-[136px] w-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={googleMapsEmbedUrl(locationQuery)}
                    title="Google 地图缩略图"
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/55 via-black/15 to-transparent px-3 pb-3 pt-8">
                    <span className="rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/92">Google Maps</span>
                    <span className="text-[10px] font-semibold text-white/82">{fulfillmentMode === "store" ? "门店位置预览" : "上门地址预览"}</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-[22px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] px-4 py-8 text-center">
                  <p className="text-sm font-black text-[color:var(--client-text)]">填写地址后会显示地图缩略图</p>
                </div>
              )}
              <div className="mt-3">
                <p className="text-sm font-black text-[color:var(--client-text)]">{locationAddress || "请填写上门地址"}</p>
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
                    Google 地图
                  </a>
                ) : null}
                <button
                  className="rounded-full bg-[color:color-mix(in_srgb,var(--client-surface)_70%,transparent)] px-3 py-2 text-xs font-black text-[color:var(--client-text)] disabled:opacity-45"
                  disabled={!locationAddress}
                  onClick={() => void copyAddress()}
                  type="button"
                >
                  {addressCopyLabel}
                </button>
              </div>
            </div>
          </div>

          <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[4] = node)}>
            <SectionTitle>技师</SectionTitle>
            {checkoutTechnicianCardData ? (
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
                  {technicianLoadStatus === "error" ? "当前技师资料不可用" : "正在读取技师详细信息"}
                </p>
              </div>
            ) : (
              <div className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)]">
                <p className="text-sm font-black text-[color:var(--client-text)]">由店铺安排技师</p>
                <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">确认接单后将在预约详情中显示正式担当信息。</p>
              </div>
            )}
          </div>

          <div className="scroll-mt-[170px] space-y-2 pt-1" ref={(node) => void (sectionRefs.current[5] = node)}>
            <SectionTitle>备注</SectionTitle>
            <div className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-3 shadow-[0_14px_28px_rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between gap-3 px-1 pb-2">
                <p className="text-sm font-black text-[color:var(--client-text)]">特殊需求</p>
                <p className="text-xs font-semibold text-[color:var(--client-muted)]">{note.trim() ? `已填写 ${note.trim().length} 字` : "可选填写"}</p>
              </div>
              <textarea
                className="focus-ring min-h-[156px] w-full rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 py-3.5 text-sm font-bold leading-6 text-[color:var(--client-text)]"
                id="formal-checkout-note"
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder="填写特殊需求：忌口、靠窗座位、门禁、停车、语言偏好等"
                ref={remarkInputRef}
                value={note}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {quickNotes.map((quickNote) => (
                  <button
                    className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary)]"
                    key={quickNote}
                    onClick={() => appendQuickNote(quickNote)}
                    type="button"
                  >
                    {quickNote}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <SectionTitle>注意事项</SectionTitle>
            <div className="space-y-4 rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)]">
              <div className="flex items-start gap-3">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--client-primary)]" />
                <p className="text-sm leading-6 text-[color:var(--client-muted)]">预约前请确认服务时间、地址与付款方式；服务内容以本页正式数据及店铺最终确认结果为准。</p>
              </div>
              <div className="border-t border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] pt-4">
                <h3 className="text-sm font-black text-[color:var(--client-text)]">取消政策</h3>
                <p className="mt-2 text-xs leading-5 text-[color:var(--client-muted)]">提交后可在预约详情查看当前状态；取消条件以正式订单状态与店铺规则为准。</p>
              </div>
              <div className="border-t border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] pt-4">
                <h3 className="text-sm font-black text-[color:var(--client-text)]">NDP（NeeDoPoint）</h3>
                <p className="mt-2 text-xs leading-5 text-[color:var(--client-muted)]">本次订单的 NDP 使用与结算结果，以服务完成后的正式结算记录为准。</p>
              </div>
            </div>
          </div>

          {submitError ? (
            <div role="alert">
              <SurfacePanel className="border-red-400/35 bg-red-500/10 p-4">
                <p className="text-sm font-black text-red-500">{submitError}</p>
                {submitError === "预约状态已变化，请重新选择时段" ? (
                  <SecondaryButton className="mt-3 w-full" onClick={() => setRevision((current) => current + 1)}>
                    重新加载可预约时段
                  </SecondaryButton>
                ) : null}
              </SurfacePanel>
            </div>
          ) : null}

          <footer className="safe-nav-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[880px] bg-gradient-to-t from-[color:var(--client-bg)] via-[color:var(--client-bg)] to-transparent px-4 pb-[calc(max(env(safe-area-inset-bottom),12px)+10px)] pt-14">
            <div className="pointer-events-auto space-y-3">
              <div className="grid grid-cols-[minmax(0,1fr),auto] items-end gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black text-[color:color-mix(in_srgb,var(--client-text)_72%,var(--client-muted)_28%)]">应付金额</p>
                  <strong className="mt-1 block text-[26px] font-black leading-none text-[color:var(--client-primary)]">{yen(Number(service.priceAmount) + (fulfillmentMode === "home" && estimateStatus === "success" ? estimate?.fareAmountJpy ?? 0 : 0))}</strong>
                  {fulfillmentMode === "home" ? <span className="mt-1 block text-[10px] font-bold text-[color:var(--client-muted)]">服务费 + 正式交通费</span> : null}
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
                      {method === "onsite" ? "到店后支付" : "银行转账"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2.5">
                <SecondaryButton className="w-full" onClick={() => navigate(`/stores/${service.shop.id}`)}>联系</SecondaryButton>
                <button
                  className="focus-ring inline-flex h-12 w-full items-center justify-center rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-[0_18px_40px_color-mix(in_srgb,var(--client-primary)_24%,transparent)] transition disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canSubmitBooking || submitting}
                  onClick={() => void submitBooking()}
                  type="button"
                >
                  {submitting ? "创建预约中" : isAuthenticated ? "确定预约" : "登录后确定预约"}
                </button>
              </div>
            </div>
          </footer>
        </>
      ) : null}
    </PageScaffold>
  );
}
