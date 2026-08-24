import { useEffect, useMemo, useState } from "react";
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
  type CoreServiceDetail
} from "../../features/core-read/api";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { cn, yen } from "../../lib/utils";
import type { FulfillmentMode } from "../../types/domain";

type LoadStatus = "loading" | "success" | "error";

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
    timeStyle: "short"
  }).format(date);
}

function remainingCapacity(slot: BookingScheduleSlot) {
  return Math.max(0, slot.capacity - slot.bookedCount);
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

  useEffect(() => {
    let active = true;
    const from = new Date();
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

        setService(serviceDetail);
        setSlots(availableSlots);
        setSelectedSlotId(availableSlots[0]?.id ?? null);
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

  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.id === selectedSlotId) ?? null,
    [selectedSlotId, slots]
  );
  const displayService = useMemo(
    () => (service ? mapCoreServiceToServiceItem(service) : null),
    [service]
  );
  const supportsBothModes = service?.serviceMode === "both";

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
        state: { notice: "预约成功，订单已保存到服务器。" }
      });
    } catch (error) {
      setSubmitError(describeCheckoutError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageScaffold contentClassName="space-y-4 pb-36" navItems={[]}>
      <AppTopBar
        closeLabel="关闭确认预约"
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
          <SurfacePanel className="overflow-hidden p-0">
            <img
              alt={service.name}
              className="h-44 w-full object-cover"
              src={getGeneratedImageThumbnailUrl(displayService.cover)}
            />
            <div className="p-4">
              <p className="text-xs font-black text-[color:var(--client-primary)]">{service.shop.name}</p>
              <div className="mt-1 flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-xl font-black text-[color:var(--client-text)]">{service.name}</h1>
                  <p className="mt-2 text-sm font-bold leading-6 text-[color:var(--client-muted)]">{service.description}</p>
                </div>
                <strong className="shrink-0 text-lg font-black text-[color:var(--client-primary)]">
                  {yen(Number(service.priceAmount))}
                </strong>
              </div>
            </div>
          </SurfacePanel>

          {supportsBothModes ? (
            <SurfacePanel className="p-4">
              <h2 className="text-sm font-black text-[color:var(--client-text)]">服务方式</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["store", "home"] as const).map((mode) => (
                  <SecondaryButton
                    className={cn("w-full", fulfillmentMode === mode && "border-[color:var(--client-primary)] text-[color:var(--client-primary)]")}
                    key={mode}
                    onClick={() => setFulfillmentMode(mode)}
                  >
                    {mode === "store" ? "到店服务" : "上门服务"}
                  </SecondaryButton>
                ))}
              </div>
            </SurfacePanel>
          ) : null}

          <SurfacePanel className="p-4">
            <h2 className="text-sm font-black text-[color:var(--client-text)]">选择可预约时段</h2>
            {slots.length === 0 ? (
              <div className="mt-3 rounded-[18px] border border-dashed border-[color:var(--client-line)] px-4 py-6 text-center">
                <p className="text-sm font-black text-[color:var(--client-text)]">暂时没有可预约时段</p>
                <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">店铺发布新的正式排班后会自动显示。</p>
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
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

          {fulfillmentMode === "home" ? (
            <SurfacePanel className="p-4">
              <label className="text-sm font-black text-[color:var(--client-text)]" htmlFor="formal-checkout-address">上门地址</label>
              <textarea
                className="focus-ring mt-3 min-h-24 w-full rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]"
                id="formal-checkout-address"
                onChange={(event) => setAddress(event.target.value)}
                placeholder="请输入完整地址、房间号和联系电话"
                value={address}
              />
            </SurfacePanel>
          ) : null}

          <SurfacePanel className="p-4">
            <h2 className="text-sm font-black text-[color:var(--client-text)]">付款方式</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["onsite", "bank_transfer"] as const).map((method) => (
                <SecondaryButton
                  className={cn("w-full", paymentMethod === method && "border-[color:var(--client-primary)] text-[color:var(--client-primary)]")}
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                >
                  {method === "onsite" ? "现场支付" : "银行转账"}
                </SecondaryButton>
              ))}
            </div>
            <label className="mt-4 block text-sm font-black text-[color:var(--client-text)]" htmlFor="formal-checkout-note">预约备注</label>
            <textarea
              className="focus-ring mt-3 min-h-24 w-full rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)]"
              id="formal-checkout-note"
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder="过敏、门禁、语言等需要店铺提前了解的信息"
              value={note}
            />
          </SurfacePanel>

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
            <button
              className="focus-ring inline-flex h-12 w-full items-center justify-center rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-[0_18px_40px_color-mix(in_srgb,var(--client-primary)_24%,transparent)] transition disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedSlot || submitting}
              onClick={() => void submitBooking()}
              type="button"
            >
              {submitting ? "创建预约中" : isAuthenticated ? "提交正式预约" : "登录后提交预约"}
            </button>
          </div>
        </>
      ) : null}
    </PageScaffold>
  );
}
