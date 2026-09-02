import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { useAuth } from "../../auth/AuthProvider";
import {
  AppIcon,
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
  mapCoreTechnicianToTechnician,
  type CoreServiceDetail
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

type LoadStatus = "loading" | "success" | "error";

const quickNotes = ["女性技师优先", "请提前联系", "需要安静环境"];

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

function formatSlotDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo"
  }).format(date);
}

function getTokyoSlotParts(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric"
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`
  };
}

function remainingCapacity(slot: BookingScheduleSlot) {
  return Math.max(0, slot.capacity - slot.bookedCount);
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
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [fulfillmentMode, setFulfillmentMode] = useState<FulfillmentMode>("store");
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod>("onsite");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState(searchParams.get("remark") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const remarkInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeProgressStep, setActiveProgressStep] = useState(0);

  useEffect(() => {
    let active = true;
    const requestedDate = searchParams.get("date");
    const requestedStart = requestedDate ? new Date(`${requestedDate}T00:00:00+09:00`) : null;
    const from = requestedStart && Number.isFinite(requestedStart.getTime()) ? requestedStart : new Date();
    const to = new Date(from);
    to.setDate(to.getDate() + 21);
    setLoadStatus("loading");
    setLoadError("");

    Promise.all([
      coreReadApi.getServiceDetail(serviceId),
      bookingApi.listAvailability({
        serviceId,
        from: from.toISOString(),
        to: to.toISOString(),
        page: 1,
        pageSize: 100
      })
    ])
      .then(([serviceDetail, availability]) => {
        if (!active) return;
        const availableSlots = availability.list
          .filter((slot) => slot.status === "available" && remainingCapacity(slot) > 0)
          .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
        const requestedTime = searchParams.get("time");
        const requestedSlot = availableSlots.find((slot) => {
          const parts = getTokyoSlotParts(slot.startsAt);
          return parts?.date === requestedDate && (!requestedTime || parts.time === requestedTime);
        });

        setService(serviceDetail);
        setSlots(availableSlots);
        setSelectedSlotId(requestedSlot?.id ?? availableSlots[0]?.id ?? null);
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
  }, [revision, searchParams, serviceId]);

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
    () => slots.find((slot) => slot.id === selectedSlotId) ?? null,
    [selectedSlotId, slots]
  );
  const displayService = useMemo(
    () => (service ? mapCoreServiceToServiceItem(service) : null),
    [service]
  );
  const displayTechnician = useMemo(
    () => (service?.technician ? mapCoreTechnicianToTechnician(service.technician) : null),
    [service]
  );
  const supportsBothModes = service?.serviceMode === "both";
  const people = searchParams.get("people") ?? "1名";

  const appendQuickNote = (value: string) => {
    setNote((current) => current.includes(value) ? current : [current.trim(), value].filter(Boolean).join("、"));
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
            <SurfacePanel className="overflow-hidden p-0">
            <img
              alt={service.name}
              className="h-48 w-full object-cover"
              src={getGeneratedImageThumbnailUrl(displayService.cover)}
            />
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap gap-2">
                {displayService.tags.slice(0, 3).map((tag) => (
                  <span className="rounded-full bg-[color:var(--client-elevated)] px-3 py-1 text-[10px] font-black text-[color:var(--client-muted)]" key={tag}>{tag}</span>
                ))}
              </div>
              <h1 className="text-xl font-black text-[color:var(--client-text)]">{service.name}</h1>
              <p className="text-sm font-bold leading-6 text-[color:var(--client-muted)]">{service.description}</p>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <strong className="text-2xl font-black text-[color:var(--client-primary)]">{yen(Number(service.priceAmount))}</strong>
                <span className="text-sm font-black text-[color:var(--client-muted)]">{service.durationMinutes} 分钟</span>
                <span className="text-sm font-black text-[color:var(--client-muted)]">{service.city}</span>
              </div>
              {displayService.packages[0]?.includes.length ? (
                <div className="flex flex-wrap gap-2 border-t border-[color:var(--client-line)] pt-3">
                  {displayService.packages[0].includes.map((item) => (
                    <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1 text-[10px] font-black text-[color:var(--client-primary)]" key={item}>{item}</span>
                  ))}
                </div>
              ) : null}
            </div>
            </SurfacePanel>
          </div>

          <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[1] = node)}>
            <SectionTitle>服务方式</SectionTitle>
            <SurfacePanel className="p-4">
            <div className="grid grid-cols-2 gap-2">
              {(["store", "home"] as const).map((mode) => {
                const disabled = !supportsBothModes && fulfillmentMode !== mode;
                return (
                  <button
                    className={cn(
                      "h-12 rounded-full text-sm font-black transition",
                      fulfillmentMode === mode
                        ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
                        : "bg-[color:var(--client-elevated)] text-[color:var(--client-muted)]",
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
              <div className="mt-4 rounded-[20px] bg-[color:var(--client-elevated)] p-4">
                <p className="text-sm font-black text-[color:var(--client-text)]">{service.shop.name}</p>
                <p className="mt-1 text-xs font-bold leading-5 text-[color:var(--client-muted)]">{service.shop.city} · {service.shop.address}</p>
              </div>
            ) : (
              <textarea
                aria-label="上门地址"
                className="focus-ring mt-4 min-h-24 w-full rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]"
                onChange={(event) => setAddress(event.target.value)}
                placeholder="请输入完整地址、房间号和联系电话"
                value={address}
              />
            )}
            </SurfacePanel>
          </div>

          <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[2] = node)}>
            <SectionTitle>时间</SectionTitle>
            <SurfacePanel className="p-4">
            {selectedSlot ? (
              <div className="mb-3 grid grid-cols-2 gap-2 rounded-[18px] bg-[color:var(--client-primary-soft)] p-3 text-sm font-black">
                <span>{formatSlotDateTime(selectedSlot.startsAt)}</span>
                <span className="text-right">{people}</span>
              </div>
            ) : null}
            {slots.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-[color:var(--client-line)] px-4 py-6 text-center">
                <p className="text-sm font-black text-[color:var(--client-text)]">暂时没有可预约时段</p>
                <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">店铺发布新的正式排班后会自动显示。</p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {slots.map((slot) => {
                  const active = slot.id === selectedSlotId;
                  return (
                    <button
                      className={cn(
                        "rounded-[18px] border px-4 py-3 text-left transition",
                        active
                          ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)]"
                          : "border-[color:var(--client-line)] bg-[color:var(--client-surface)]"
                      )}
                      key={slot.id}
                      onClick={() => setSelectedSlotId(slot.id)}
                      type="button"
                    >
                      <span className="block text-sm font-black text-[color:var(--client-text)]">{formatSlotDateTime(slot.startsAt)}</span>
                      <span className="mt-1 block text-xs font-bold text-[color:var(--client-muted)]">
                        {slot.technicianName ?? "店铺安排技师"} · 剩余 {remainingCapacity(slot)} 名
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            </SurfacePanel>
          </div>

          <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[3] = node)}>
            <SectionTitle>地址</SectionTitle>
            <SurfacePanel className="p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]"><AppIcon name="map" /></span>
              <div>
                <h2 className="text-sm font-black text-[color:var(--client-text)]">{fulfillmentMode === "store" ? service.shop.name : "上门服务地址"}</h2>
                <p className="mt-1 text-xs font-bold leading-5 text-[color:var(--client-muted)]">{fulfillmentMode === "store" ? `${service.shop.city} · ${service.shop.address}` : address || "请填写上门地址"}</p>
              </div>
            </div>
            </SurfacePanel>
          </div>

          <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[4] = node)}>
            <SectionTitle>技师</SectionTitle>
            {displayTechnician ? (
              <SocialProfileMiniCard
                className="w-full"
                detailTo={`/technicians/${displayTechnician.id}`}
                showAction={false}
                technician={displayTechnician}
                topTags={[{ label: "本次担当", tone: "green" }]}
              />
            ) : (
              <SurfacePanel className="p-4">
                <p className="text-sm font-black text-[color:var(--client-text)]">由店铺安排技师</p>
                <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">确认接单后将在预约详情中显示正式担当信息。</p>
              </SurfacePanel>
            )}
          </div>

          <div className="scroll-mt-[170px] space-y-2 pt-1" ref={(node) => void (sectionRefs.current[5] = node)}>
            <SectionTitle>备注</SectionTitle>
            <SurfacePanel className="p-4">
            <div className="flex flex-wrap gap-2">
              {quickNotes.map((quickNote) => (
                <button className="rounded-full bg-[color:var(--client-elevated)] px-3 py-2 text-xs font-black" key={quickNote} onClick={() => appendQuickNote(quickNote)} type="button">{quickNote}</button>
              ))}
            </div>
            <textarea
              className="focus-ring mt-3 min-h-24 w-full rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]"
              id="formal-checkout-note"
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder="过敏、门禁、语言等需要店铺提前了解的信息"
              ref={remarkInputRef}
              value={note}
            />
            </SurfacePanel>
          </div>

          <div className="grid gap-3">
            <SurfacePanel className="p-4">
              <h2 className="text-sm font-black">注意事项</h2>
              <p className="mt-2 text-xs font-bold leading-5 text-[color:var(--client-muted)]">预约前请确认服务时间、地址与付款方式；服务内容以本页正式数据及店铺最终确认结果为准。</p>
            </SurfacePanel>
            <SurfacePanel className="p-4">
              <h2 className="text-sm font-black">取消政策</h2>
              <p className="mt-2 text-xs font-bold leading-5 text-[color:var(--client-muted)]">提交后可在预约详情查看当前状态；取消条件以正式订单状态与店铺规则为准。</p>
            </SurfacePanel>
            <SurfacePanel className="p-4">
              <h2 className="text-sm font-black">NDP（NeeDoPoint）</h2>
              <p className="mt-2 text-xs font-bold leading-5 text-[color:var(--client-muted)]">本次订单的 NDP 使用与结算结果，以服务完成后的正式结算记录为准。</p>
            </SurfacePanel>
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

          <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[880px] border-t border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-bg)_92%,transparent)] p-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] backdrop-blur-xl">
            <div className="mx-auto flex max-w-[680px] items-center gap-3">
              <div className="min-w-[104px]">
                <p className="text-[10px] font-black text-[color:var(--client-muted)]">应付金额</p>
                <strong className="block text-xl font-black text-[color:var(--client-primary)]">{yen(Number(service.priceAmount))}</strong>
                <div className="mt-1 flex gap-1">
                  {(["onsite", "bank_transfer"] as const).map((method) => (
                    <button
                      className={cn("rounded-full px-2 py-1 text-[9px] font-black", paymentMethod === method ? "bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]" : "bg-[color:var(--client-elevated)] text-[color:var(--client-muted)]")}
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      type="button"
                    >
                      {method === "onsite" ? "到店后支付" : "银行转账"}
                    </button>
                  ))}
                </div>
              </div>
              <button className="h-12 shrink-0 rounded-full border border-[color:var(--client-line)] px-4 text-sm font-black" onClick={() => navigate(`/stores/${service.shop.id}`)} type="button">联系</button>
              <button
                className="focus-ring inline-flex h-12 min-w-0 flex-1 items-center justify-center rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-[0_18px_40px_color-mix(in_srgb,var(--client-primary)_24%,transparent)] transition disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!selectedSlot || submitting}
                onClick={() => void submitBooking()}
                type="button"
              >
                {submitting ? "创建预约中" : isAuthenticated ? "确定预约" : "登录后确定预约"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </PageScaffold>
  );
}
