import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { useAuth } from "../../auth/AuthProvider";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { technicianNavItems } from "../../components/mobile/navItems";
import { Button } from "../../components/ui/Button";
import { useClientTheme } from "../../theme/ClientThemeProvider";
import {
  bookingApi,
  type BookingOrder,
  type BookingOrderStatus,
  type BookingScheduleSlot
} from "../booking/api";
import { schedulingApi } from "../scheduling/api";
import { FormalScheduleRangeEditor } from "./FormalScheduleRangeEditor";
import { FormalTechnicianScheduleWorkspace } from "./FormalTechnicianScheduleWorkspace";
import {
  parsePositiveRouteId,
  useFormalTechnicianOrderResource,
  useFormalTechnicianScheduleResource
} from "./formal-resource";

const panelClass =
  "rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] p-4 shadow-[var(--client-shadow)]";
const fieldClass =
  "mt-2 h-11 w-full rounded-[16px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-4 text-sm font-bold text-[color:var(--client-text)] outline-none";

function TechnicianSchedulePageShell({
  title,
  subtitle,
  backTo = "/technician/schedule",
  children
}: {
  title: string;
  subtitle?: string;
  backTo?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { isNight } = useClientTheme();
  return (
    <MobileShell navItems={technicianNavItems}>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[960px] flex-col bg-[color:var(--client-bg)] text-[color:var(--client-text)]">
        <MobileFullscreenHeader
          className="sticky top-0 z-50 border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_96%,transparent)] text-[color:var(--client-text)] backdrop-blur-xl"
          dark={isNight}
          onBack={() => navigate(backTo)}
          subtitle={subtitle}
          title={title}
        />
        <main className="min-h-0 flex-1 px-4 py-3 pb-24">{children}</main>
      </div>
    </MobileShell>
  );
}

function RouteUnavailable({ kind }: { kind: "order" | "schedule" }) {
  return (
    <TechnicianSchedulePageShell title={kind === "schedule" ? "排班记录不可用" : "订单记录不可用"}>
      <section className={panelClass} role="alert">
        <p className="text-sm font-bold leading-6 text-[color:var(--client-muted)]">
          路由中的记录编号无效，未读取任何演示或浏览器缓存数据。
        </p>
        <Button className="mt-4" to="/technician/schedule">返回正式排班</Button>
      </section>
    </TechnicianSchedulePageShell>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <section aria-live="polite" className={panelClass}>
      <p className="text-sm font-black">{label}</p>
    </section>
  );
}

function ErrorPanel({
  title,
  error,
  onRetry
}: {
  title: string;
  error: string;
  onRetry: () => void;
}) {
  return (
    <section className={panelClass} role="alert">
      <h2 className="text-base font-black">{title}</h2>
      <p className="mt-2 break-words text-xs font-bold leading-5 text-[color:var(--client-muted)]">{error}</p>
      <Button className="mt-4" onClick={onRetry}>重新加载</Button>
    </section>
  );
}

function ScheduleResourceErrorPanel({
  title,
  error,
  onRetry
}: {
  title: string;
  error: string;
  onRetry: () => void;
}) {
  const missingShop = error === "error.technician.shop_required";
  return (
    <ErrorPanel
      error={missingShop ? "关联店铺并配置正式服务后即可使用排班；当前不会读取演示排班或临时数据。" : error}
      onRetry={onRetry}
      title={missingShop ? "暂未关联店铺" : title}
    />
  );
}

export function TechnicianScheduleIndexRoutePage() {
  const { session } = useAuth();
  const resource = useFormalTechnicianScheduleResource(session, null);

  if (resource.loading) {
    return <TechnicianSchedulePageShell backTo="/technician" title="排班与预约"><LoadingPanel label="正在读取正式排班与预约" /></TechnicianSchedulePageShell>;
  }
  if (resource.error || !resource.data) {
    return (
      <TechnicianSchedulePageShell backTo="/technician" title="排班与预约">
        <ScheduleResourceErrorPanel
          error={resource.error ?? "error.schedule.profile_not_found"}
          onRetry={resource.retry}
          title="正式排班资源加载失败"
        />
      </TechnicianSchedulePageShell>
    );
  }

  return (
    <TechnicianSchedulePageShell
      backTo="/technician"
      subtitle={`${resource.data.profile.displayName} · ${resource.data.profile.shop?.name ?? "--"}`}
      title="排班与预约"
    >
      <FormalTechnicianScheduleWorkspace
        profileAvatarUrl={resource.data.profile.avatarUrl}
        profileName={resource.data.profile.displayName}
        shopName={resource.data.profile.shop?.name ?? "--"}
      />
    </TechnicianSchedulePageShell>
  );
}

function localDateLabel(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function localTimeLabel(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "--:--";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function timeRangeLabel(startsAt: string | Date, endsAt: string | Date): string {
  return `${localTimeLabel(startsAt)}–${localTimeLabel(endsAt)}`;
}

function slotStatusLabel(status: BookingScheduleSlot["status"]): string {
  if (status === "available") return "可预约";
  if (status === "blocked") return "已锁定";
  return "已有预约";
}

function scheduleMutationError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 40911 || error.message === "error.schedule.conflict") {
      return "时间与已有排班冲突，请调整后重试";
    }
    if (error.code === 40912 || error.message === "error.schedule.slot_in_use") {
      return "该时段已有预约，无法修改或删除";
    }
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前技师身份没有操作该排班的权限";
    if (error.status === 404) return "排班不存在或已不属于当前技师";
  }
  return "正式排班操作失败，请检查网络后重试";
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[16px] bg-[color:var(--client-elevated)] px-3 py-3">
      <dt className="text-[11px] font-bold text-[color:var(--client-muted)]">{label}</dt>
      <dd className="mt-1 text-sm font-black">{value}</dd>
    </div>
  );
}

function TechnicianScheduleDetailBody({ slotId }: { slotId: number }) {
  const { session } = useAuth();
  const resource = useFormalTechnicianScheduleResource(session, slotId);
  const navigate = useNavigate();
  const [slot, setSlot] = useState<BookingScheduleSlot | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);

  useEffect(() => {
    setSlot(resource.data?.slot ?? null);
  }, [resource.data?.slot]);

  if (resource.loading) {
    return <TechnicianSchedulePageShell title="正式排班详情"><LoadingPanel label="正在读取正式排班" /></TechnicianSchedulePageShell>;
  }
  if (resource.error || !resource.data || !slot) {
    return (
      <TechnicianSchedulePageShell title="正式排班详情">
        <ScheduleResourceErrorPanel
          error={resource.error ?? "error.schedule.slot_not_found"}
          onRetry={resource.retry}
          title="正式排班加载失败"
        />
      </TechnicianSchedulePageShell>
    );
  }

  const updateStatus = async () => {
    if (pending || slot.status === "booked") return;
    setPending(true);
    setActionError("");
    try {
      const updated = await schedulingApi.updateSlot("technician", slot.id, {
        status: slot.status === "blocked" ? "available" : "blocked"
      });
      setSlot(updated);
      setDeleteArmed(false);
    } catch (error) {
      setActionError(scheduleMutationError(error));
    } finally {
      setPending(false);
    }
  };

  const deleteSlot = async () => {
    if (pending || slot.status === "booked") return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setPending(true);
    setActionError("");
    try {
      await schedulingApi.deleteSlot("technician", slot.id);
      navigate("/technician/schedule");
    } catch (error) {
      setActionError(scheduleMutationError(error));
      setDeleteArmed(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <TechnicianSchedulePageShell
      subtitle={`${localDateLabel(slot.startsAt)} · ${timeRangeLabel(slot.startsAt, slot.endsAt)}`}
      title="正式排班详情"
    >
      <div className="space-y-4">
        <section className={panelClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1 text-xs font-black">
                {slotStatusLabel(slot.status)}
              </span>
              <h2 className="mt-3 text-xl font-black">{slot.serviceName}</h2>
              <p className="mt-1 text-sm font-bold text-[color:var(--client-muted)]">
                {localDateLabel(slot.startsAt)} · {timeRangeLabel(slot.startsAt, slot.endsAt)}
              </p>
            </div>
            <span className="text-xs font-bold text-[color:var(--client-muted)]">ID {slot.id}</span>
          </div>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2">
            <DetailRow label="店铺" value={slot.shopName} />
            <DetailRow label="技师" value={slot.technicianName ?? resource.data.profile.displayName} />
            <DetailRow label="服务时长" value={`${slot.durationMinutes} 分钟`} />
            <DetailRow label="容量 / 已预约" value={`${slot.capacity} / ${slot.bookedCount}`} />
          </dl>
        </section>

        {actionError ? <section className={panelClass} role="alert"><p className="text-sm font-black text-red-500">{actionError}</p></section> : null}

        {slot.status === "booked" ? (
          <section className={panelClass}>
            <p className="text-sm font-bold text-[color:var(--client-muted)]">该时段已有预约，时间、状态和删除操作均由服务端锁定。</p>
          </section>
        ) : (
          <section className="grid gap-2 sm:grid-cols-3">
            <Button disabled={pending} to={`/technician/schedule/events/${slot.id}/edit`} variant="secondary">编辑时段</Button>
            <Button disabled={pending} onClick={() => void updateStatus()} variant="secondary">
              {slot.status === "blocked" ? "恢复可预约" : "锁定时段"}
            </Button>
            <Button disabled={pending} onClick={() => void deleteSlot()} variant="danger">
              {deleteArmed ? "再次点击确认删除" : "删除时段"}
            </Button>
          </section>
        )}
      </div>
    </TechnicianSchedulePageShell>
  );
}

export function TechnicianScheduleDetailRoutePage() {
  const { eventId } = useParams<{ eventId: string }>();
  const slotId = parsePositiveRouteId(eventId);
  if (!slotId) return <RouteUnavailable kind="schedule" />;
  return <TechnicianScheduleDetailBody slotId={slotId} />;
}

function createDefaultScheduleRange() {
  const startsAt = new Date(Date.now() + 24 * 60 * 60_000);
  startsAt.setSeconds(0, 0);
  startsAt.setMinutes(Math.ceil(startsAt.getMinutes() / 15) * 15);
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  return { startsAt, endsAt };
}

function TechnicianScheduleEditorBody({ slotId }: { slotId: number | null }) {
  const { session } = useAuth();
  const resource = useFormalTechnicianScheduleResource(session, slotId);
  const navigate = useNavigate();
  const defaultRange = useMemo(createDefaultScheduleRange, []);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState(defaultRange.startsAt);
  const [endsAt, setEndsAt] = useState(defaultRange.endsAt);
  const [capacity, setCapacity] = useState(1);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!resource.data) return;
    if (resource.data.slot) {
      setSelectedServiceId(resource.data.slot.technicianServiceId);
      setStartsAt(new Date(resource.data.slot.startsAt));
      setEndsAt(new Date(resource.data.slot.endsAt));
      setCapacity(resource.data.slot.capacity);
      return;
    }
    const firstService = resource.data.services[0];
    if (firstService && selectedServiceId === null) {
      setSelectedServiceId(firstService.id);
      setEndsAt(new Date(startsAt.getTime() + firstService.durationMinutes * 60_000));
    }
  }, [resource.data, slotId]);

  if (resource.loading) {
    return <TechnicianSchedulePageShell title={slotId ? "编辑正式排班" : "新建正式排班"}><LoadingPanel label="正在读取技师服务与排班" /></TechnicianSchedulePageShell>;
  }
  if (resource.error || !resource.data) {
    return (
      <TechnicianSchedulePageShell title={slotId ? "编辑正式排班" : "新建正式排班"}>
        <ScheduleResourceErrorPanel error={resource.error ?? "error.api"} onRetry={resource.retry} title="正式排班资源加载失败" />
      </TechnicianSchedulePageShell>
    );
  }
  if (slotId && !resource.data.slot) {
    return (
      <TechnicianSchedulePageShell title="编辑正式排班">
        <ErrorPanel error="error.schedule.slot_not_found" onRetry={resource.retry} title="正式排班加载失败" />
      </TechnicianSchedulePageShell>
    );
  }

  const selectedService = resource.data.services.find((item) => item.id === selectedServiceId) ?? null;
  const requiredDuration = resource.data.slot?.durationMinutes ?? selectedService?.durationMinutes ?? 0;
  const actualDuration = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  const validCapacity = Number.isInteger(capacity) && capacity >= 1 && capacity <= 100;
  const validFuture = Boolean(slotId) || startsAt.getTime() > Date.now();
  const canSave = Boolean(selectedServiceId) && requiredDuration > 0 && actualDuration === requiredDuration && validCapacity && validFuture && !pending;

  const save = async () => {
    if (!canSave || !selectedServiceId) return;
    setPending(true);
    setActionError("");
    try {
      const saved = slotId
        ? await schedulingApi.updateSlot("technician", slotId, { startsAt, endsAt, capacity })
        : await schedulingApi.createSlot("technician", {
            technicianServiceId: selectedServiceId,
            startsAt,
            endsAt,
            capacity
          });
      navigate(`/technician/schedule/events/${saved.id}`);
    } catch (error) {
      setActionError(scheduleMutationError(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <TechnicianSchedulePageShell
      subtitle={resource.data.profile.displayName}
      title={slotId ? "编辑正式排班" : "新建正式排班"}
    >
      <div className="space-y-4">
        <section className={panelClass}>
          <label className="block text-sm font-black">
            服务
            {slotId ? (
              <span className="mt-2 block rounded-[16px] bg-[color:var(--client-elevated)] px-4 py-3">
                {resource.data.slot?.serviceName}
              </span>
            ) : (
              <select
                className={fieldClass}
                onChange={(event) => {
                  const nextId = Number(event.target.value);
                  const nextService = resource.data?.services.find((item) => item.id === nextId);
                  setSelectedServiceId(nextId);
                  if (nextService) setEndsAt(new Date(startsAt.getTime() + nextService.durationMinutes * 60_000));
                }}
                value={selectedServiceId ?? ""}
              >
                {resource.data.services.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} 分钟</option>
                ))}
              </select>
            )}
          </label>
          {resource.data.services.length === 0 ? (
            <p className="mt-3 text-sm font-bold text-[color:var(--client-muted)]">当前没有已启用且可预约的正式技师服务，无法创建排班。</p>
          ) : null}
          <label className="mt-4 block text-sm font-black">
            容量
            <input
              className={fieldClass}
              max={100}
              min={1}
              name="capacity"
              onChange={(event) => setCapacity(Number(event.target.value))}
              type="number"
              value={capacity}
            />
          </label>
        </section>

        <section className={panelClass}>
          <h2 className="mb-3 text-sm font-black">选择日期内的时间范围</h2>
          <FormalScheduleRangeEditor
            disabled={pending}
            durationMinutes={requiredDuration || 60}
            endsAt={endsAt}
            onChange={(nextStart, nextEnd) => {
              setStartsAt(nextStart);
              setEndsAt(nextEnd);
            }}
            startsAt={startsAt}
          />
        </section>

        {!validFuture ? <p className="text-sm font-black text-red-500">新排班的开始时间必须在未来</p> : null}
        {!validCapacity ? <p className="text-sm font-black text-red-500">容量必须为 1 到 100 的整数</p> : null}
        {requiredDuration > 0 && actualDuration !== requiredDuration ? (
          <p className="text-sm font-black text-red-500">时间范围必须与服务时长 {requiredDuration} 分钟一致</p>
        ) : null}
        {actionError ? <p className="text-sm font-black text-red-500" role="alert">{actionError}</p> : null}

        <Button className="w-full" disabled={!canSave} onClick={() => void save()}>
          {pending ? "保存中" : "保存正式排班"}
        </Button>
      </div>
    </TechnicianSchedulePageShell>
  );
}

export function TechnicianScheduleEditorRoutePage() {
  const { eventId } = useParams<{ eventId: string }>();
  if (eventId) {
    const slotId = parsePositiveRouteId(eventId);
    if (!slotId) return <RouteUnavailable kind="schedule" />;
    return <TechnicianScheduleEditorBody slotId={slotId} />;
  }
  return <TechnicianScheduleEditorBody slotId={null} />;
}

export function TechnicianScheduleTransferRoutePage() {
  return (
    <TechnicianSchedulePageShell title="班次转让暂未开放">
      <section className={panelClass}>
        <p className="text-sm font-bold leading-6 text-[color:var(--client-muted)]">
          正式班次转让状态机尚未启用。当前页面不会创建浏览器记录，也不会写入数据库；请返回排班页继续管理正式时段。
        </p>
        <Button className="mt-4" to="/technician/schedule">返回正式排班</Button>
      </section>
    </TechnicianSchedulePageShell>
  );
}

function orderStatusLabel(status: BookingOrderStatus): string {
  if (status === "pending") return "待确认";
  if (status === "confirmed") return "已确认";
  if (status === "inService") return "服务中";
  if (status === "completed") return "已完成";
  return "已取消";
}

function orderPaymentLabel(order: BookingOrder): string {
  const method = order.paymentMethod === "onsite" ? "现场支付" : "银行转账";
  const status = order.paymentStatus === "confirmed"
    ? "已确认收款"
    : order.paymentStatus === "refundPending"
      ? "退款处理中"
      : order.paymentStatus === "refunded"
        ? "已退款"
        : "待确认收款";
  return `${method} · ${status}`;
}

function orderMutationError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前技师身份没有处理该订单的权限";
    if (error.status === 404) return "订单不存在或已不属于当前技师";
    if (error.status === 409) return "订单状态已变化，请重新加载后再操作";
  }
  return "正式订单操作失败，请检查网络后重试";
}

function primaryOrderAction(status: BookingOrderStatus): { label: string; run: (id: number) => Promise<BookingOrder> } | null {
  if (status === "pending") return { label: "确认接单", run: bookingApi.confirmOrder };
  if (status === "confirmed") return { label: "开始服务", run: bookingApi.startOrder };
  if (status === "inService") return { label: "完成服务", run: bookingApi.completeOrder };
  return null;
}

function TechnicianOrderDetailBody({ orderId }: { orderId: number }) {
  const { session } = useAuth();
  const resource = useFormalTechnicianOrderResource(session, orderId);
  const [order, setOrder] = useState<BookingOrder | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [cancelArmed, setCancelArmed] = useState(false);

  useEffect(() => {
    setOrder(resource.data);
  }, [resource.data]);

  if (resource.loading) {
    return <TechnicianSchedulePageShell title="正式预约订单"><LoadingPanel label="正在读取正式订单" /></TechnicianSchedulePageShell>;
  }
  if (resource.error || !order) {
    return (
      <TechnicianSchedulePageShell title="正式预约订单">
        <ErrorPanel error={resource.error ?? "error.order.not_found"} onRetry={resource.retry} title="正式订单加载失败" />
      </TechnicianSchedulePageShell>
    );
  }

  const primary = primaryOrderAction(order.status);
  const canCancel = order.status === "pending" || order.status === "confirmed";

  const runPrimary = async () => {
    if (!primary || pending) return;
    setPending(true);
    setActionError("");
    try {
      setOrder(await primary.run(order.id));
      setCancelArmed(false);
    } catch (error) {
      setActionError(orderMutationError(error));
    } finally {
      setPending(false);
    }
  };

  const cancel = async () => {
    if (pending || !canCancel) return;
    if (!cancelArmed) {
      setCancelArmed(true);
      return;
    }
    setPending(true);
    setActionError("");
    try {
      setOrder(await bookingApi.cancelOrder(order.id, "技师端取消正式预约"));
      setCancelArmed(false);
    } catch (error) {
      setActionError(orderMutationError(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <TechnicianSchedulePageShell
      backTo="/technician/schedule"
      subtitle={`${order.orderNo} · ${timeRangeLabel(order.startsAt, order.endsAt)}`}
      title="正式预约订单"
    >
      <div className="space-y-4">
        <section className={panelClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1 text-xs font-black">
                {orderStatusLabel(order.status)}
              </span>
              <h2 className="mt-3 text-xl font-black">{order.serviceName}</h2>
              <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{order.orderNo}</p>
            </div>
            <strong className="text-lg font-black">¥{Number(order.priceAmount).toLocaleString("ja-JP")}</strong>
          </div>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2">
            <DetailRow label="店铺" value={order.shopName} />
            <DetailRow label="预约时间" value={`${localDateLabel(order.startsAt)} · ${timeRangeLabel(order.startsAt, order.endsAt)}`} />
            <DetailRow label="支付" value={orderPaymentLabel(order)} />
            <DetailRow label="客户账号" value={`#${order.customerUserId}`} />
          </dl>
          {order.note ? (
            <div className="mt-3 rounded-[16px] bg-[color:var(--client-elevated)] px-3 py-3 text-sm">
              <strong>备注：</strong>{order.note}
            </div>
          ) : null}
        </section>

        <section className={panelClass}>
          <h2 className="text-base font-black">状态记录</h2>
          <ol className="mt-3 space-y-2">
            {order.statusHistory.map((history) => (
              <li className="rounded-[16px] bg-[color:var(--client-elevated)] px-3 py-3" key={history.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">{orderStatusLabel(history.toStatus)}</strong>
                  <span className="text-xs font-bold text-[color:var(--client-muted)]">
                    {localDateLabel(history.createdAt)} {localTimeLabel(history.createdAt)}
                  </span>
                </div>
                {history.reason ? <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{history.reason}</p> : null}
              </li>
            ))}
          </ol>
        </section>

        {actionError ? <p className="text-sm font-black text-red-500" role="alert">{actionError}</p> : null}
        {primary || canCancel ? (
          <section className="grid gap-2 sm:grid-cols-2">
            {canCancel ? (
              <Button disabled={pending} onClick={() => void cancel()} variant="danger">
                {cancelArmed ? "再次点击确认取消" : "取消预约"}
              </Button>
            ) : null}
            {primary ? <Button disabled={pending} onClick={() => void runPrimary()}>{primary.label}</Button> : null}
          </section>
        ) : null}
      </div>
    </TechnicianSchedulePageShell>
  );
}

export function TechnicianOrderDetailRoutePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const orderIdValue = parsePositiveRouteId(orderId);
  if (!orderIdValue) return <RouteUnavailable kind="order" />;
  return <TechnicianOrderDetailBody orderId={orderIdValue} />;
}
