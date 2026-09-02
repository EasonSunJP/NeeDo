import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { useAuth } from "../../auth/AuthProvider";
import {
  AppTopBar,
  PageScaffold,
  PrimaryButton,
  SecondaryButton,
  SurfacePanel
} from "../../components/client-ui/AppScaffold";
import { bookingApi, type BookingScheduleSlot, type ManualPaymentMethod } from "../../features/booking/api";
import {
  coreReadApi,
  mapCoreServiceToServiceItem,
  type CoreServiceDetail,
  type CoreTechnicianCard
} from "../../features/core-read/api";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { cn, yen } from "../../lib/utils";
import { SocialProfileMiniCard } from "../../shared/profile-card/SocialProfileMiniCard";
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

const quickNotes = ["女性技师优先", "请提前联系", "需要安静环境"];
const checkoutScheduleSlotStateKey = "checkoutScheduleSlotId";

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

export function FormalCheckoutPage({ serviceId }: { serviceId: number }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [service, setService] = useState<CoreServiceDetail | null>(null);
  const [slots, setSlots] = useState<BookingScheduleSlot[]>([]);
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
  const [address, setAddress] = useState("");
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

  useEffect(() => {
    if (!selectedDayWindow) return undefined;
    let active = true;
    setLoadStatus("loading");
    setLoadError("");

    Promise.all([
      coreReadApi.getServiceDetail(serviceId),
      bookingApi.listAvailability({
        serviceId,
        from: selectedDayWindow.from,
        to: selectedDayWindow.to,
        includeUnavailable: true,
        page: 1,
        pageSize: 100
      })
    ])
      .then(([serviceDetail, availability]) => {
        if (!active) return;
        const formalSlots = availability.list
          .slice()
          .sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id - right.id);
        const requestedTime = searchParams.get("time");

        setService(serviceDetail);
        setSlots(formalSlots);
        setSelectedSlotId(resolveInitialCheckoutSlotId(formalSlots, selectedDate, requestedTime, persistedSlotId));
        setFulfillmentMode(resolveFulfillmentMode(serviceDetail, searchParams.get("mode")));
        setLoadStatus("success");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setService(null);
        setSlots([]);
        setSelectedSlotId(null);
        setLoadError(describeCheckoutError(error));
        setLoadStatus("error");
      });
    return () => {
      active = false;
    };
  }, [persistedSlotId, revision, searchParams, selectedDate, selectedDayWindow, serviceId]);

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
    () => slots.find((slot) => slot.id === selectedSlotId && isCheckoutSlotBookable(slot)) ?? null,
    [selectedSlotId, slots]
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

  const displayService = useMemo(
    () => (service ? mapCoreServiceToServiceItem(service) : null),
    [service]
  );
  const supportsBothModes = service?.serviceMode === "both";
  const people = searchParams.get("people") ?? "1名";
  const packageDetail = displayService?.packages[0] ?? null;
  const locationAddress = fulfillmentMode === "store" ? service?.shop.address.trim() ?? "" : address.trim();
  const locationTitle = fulfillmentMode === "store" ? service?.shop.name ?? "" : "上门服务地址";
  const locationQuery = [locationTitle, locationAddress].filter(Boolean).join(" ");
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
      id: String(technician.id),
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

  const selectCheckoutSlot = (slotId: number) => {
    const slot = slots.find((candidate) => candidate.id === slotId && isCheckoutSlotBookable(candidate));
    if (!slot) return;
    const selectedTime = getTokyoSlotParts(slot.startsAt)?.time;
    if (!selectedTime) return;

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
    if (!selectedSlot || submitting) return;
    if (!isAuthenticated) {
      navigate(`/login/user?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }
    if (fulfillmentMode === "home" && !address.trim()) {
      setSubmitError("请先填写完整上门地址，再提交预约");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const order = await bookingApi.createBooking({
        serviceId,
        scheduleSlotId: selectedSlot.id,
        fulfillmentMode,
        paymentMethod,
        note: [fulfillmentMode === "home" ? `上门地址：${address.trim()}` : "", note.trim()]
          .filter(Boolean)
          .join(" / ") || undefined
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

      {loadStatus === "success" && service && displayService ? (
        <>
          <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[0] = node)}>
            <SectionTitle>套餐</SectionTitle>
            <div className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-3 shadow-[0_14px_28px_rgba(0,0,0,0.06)]">
              <div className="relative h-[196px] w-full overflow-hidden rounded-[24px] bg-black">
                <img
                  alt={service.name}
                  className="absolute inset-0 h-full w-full scale-[1.035] object-cover"
                  src={getGeneratedImageThumbnailUrl(displayService.cover)}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {displayService.tags.slice(0, 2).map((tag) => (
                  <span
                    className="rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-3 py-1 text-[11px] font-black text-[color:var(--client-muted)]"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <h1 className="mt-3 text-[20px] font-black leading-tight tracking-[-0.03em] text-[color:var(--client-text)]">{service.name}</h1>
              {service.description ? (
                <p className="mt-1.5 text-sm leading-6 text-[color:var(--client-muted)]">{service.description}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <strong className="text-[25px] font-black tracking-[-0.04em] text-[color:var(--client-primary)]">{yen(Number(service.priceAmount))}</strong>
                <span className="text-sm font-semibold text-[color:var(--client-muted)]">{service.durationMinutes} 分钟</span>
                <span className="text-sm font-semibold text-[color:var(--client-muted)]">{service.city}</span>
              </div>
              {packageDetail?.includes.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {packageDetail.includes.slice(0, 4).map((item) => (
                    <span
                      className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-3 py-1 text-[11px] font-black text-[color:var(--client-primary)]"
                      key={item}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 border-t border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] pt-3">
                <p className="text-xs font-semibold text-[color:var(--client-muted)]">{packageDetail?.name ?? service.category.name}</p>
              </div>
            </div>
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
                <div className="mt-3">
                  <p className="text-[17px] font-black tracking-[-0.03em] text-[color:var(--client-text)]">上门服务</p>
                  <textarea
                    aria-label="上门地址"
                    className="focus-ring mt-3 min-h-28 w-full rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]"
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="请输入完整地址、房间号和联系电话"
                    value={address}
                  />
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
              {locationQuery ? (
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
                  <strong className="mt-1 block text-[26px] font-black leading-none text-[color:var(--client-primary)]">{yen(Number(service.priceAmount))}</strong>
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
                  disabled={!selectedSlot || submitting}
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
