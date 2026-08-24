import { useCallback, useEffect, useMemo, useState } from "react";
import { backofficeRealDataApi, type BackofficeServicePayload, type BackofficeTechnicianPayload } from "../../../api/backofficeRealData";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { bookingApi, type BookingScheduleSlot } from "../../../features/booking/api";

const inputClassName = "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold outline-none focus:border-moss";
const pageSize = 30;

function dateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function dateTimeInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function initialStartValue() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  return dateTimeInputValue(start);
}

function initialRange() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 31);
  return { from: dateInputValue(from), to: dateInputValue(to) };
}

function toIso(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("日期时间格式不正确");
  return parsed.toISOString();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusBadge(status: BookingScheduleSlot["status"]) {
  if (status === "available") return <Badge tone="green">可预约</Badge>;
  if (status === "booked") return <Badge tone="blue">已预约</Badge>;
  return <Badge tone="yellow">已阻塞</Badge>;
}

export function MerchantScheduleManagementPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [range, setRange] = useState(initialRange);
  const [page, setPage] = useState(1);
  const [slots, setSlots] = useState<BookingScheduleSlot[]>([]);
  const [total, setTotal] = useState(0);
  const [services, setServices] = useState<BackofficeServicePayload[]>([]);
  const [technicians, setTechnicians] = useState<BackofficeTechnicianPayload[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [technicianProfileId, setTechnicianProfileId] = useState("");
  const [startsAt, setStartsAt] = useState(initialStartValue);
  const [capacity, setCapacity] = useState("1");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | "create" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);

  const loadMasterData = useCallback(async () => {
    const [servicePage, technicianPage] = await Promise.all([
      backofficeRealDataApi.services("merchant-admin", { page: 1, pageSize: 100 }),
      backofficeRealDataApi.technicians("merchant-admin", { page: 1, pageSize: 100 })
    ]);
    setServices(servicePage.list);
    setTechnicians(technicianPage.list.filter((technician) => technician.status === "published"));
    setServiceId((current) => current || (servicePage.list[0] ? String(servicePage.list[0].id) : ""));
  }, []);

  const loadSlots = useCallback(async () => {
    const response = await bookingApi.listManagedScheduleSlots("merchant-admin", {
      from: toIso(`${range.from}T00:00`),
      page,
      pageSize,
      to: toIso(`${range.to}T23:59`)
    });
    setSlots(response.list);
    setTotal(response.total);
  }, [page, range.from, range.to]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([loadMasterData(), loadSlots()])
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [loadMasterData, loadSlots, reloadVersion]);

  const selectedService = useMemo(
    () => services.find((service) => service.id === Number(serviceId)) ?? null,
    [serviceId, services]
  );
  const endPreview = useMemo(() => {
    if (!selectedService || !startsAt) return "";
    const end = new Date(startsAt);
    if (!Number.isFinite(end.getTime())) return "";
    end.setMinutes(end.getMinutes() + selectedService.durationMinutes);
    return dateTimeInputValue(end);
  }, [selectedService, startsAt]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const refresh = (message: string) => {
    setNotice(message);
    setReloadVersion((current) => current + 1);
  };

  const createSlot = async () => {
    if (!selectedService || !endPreview) {
      setError("请先选择正式服务和开始时间");
      return;
    }
    setBusyId("create");
    setError("");
    setNotice("");
    try {
      await bookingApi.createManagedScheduleSlot("merchant-admin", {
        capacity: Number(capacity),
        endsAt: toIso(endPreview),
        serviceId: selectedService.id,
        startsAt: toIso(startsAt),
        technicianProfileId: technicianProfileId ? Number(technicianProfileId) : null
      });
      refresh("排班时段已写入正式数据库并记录审计日志。");
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
    } finally {
      setBusyId(null);
    }
  };

  const updateStatus = async (slot: BookingScheduleSlot) => {
    const nextStatus = slot.status === "blocked" ? "available" : "blocked";
    setBusyId(slot.id);
    setError("");
    setNotice("");
    try {
      await bookingApi.updateManagedScheduleSlot("merchant-admin", slot.id, { status: nextStatus });
      refresh(nextStatus === "blocked" ? "时段已阻塞。" : "时段已恢复可预约。");
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
    } finally {
      setBusyId(null);
    }
  };

  const deleteSlot = async (slot: BookingScheduleSlot) => {
    if (!window.confirm(`确认软删除 ${formatDateTime(slot.startsAt)} 的排班时段吗？`)) return;
    setBusyId(slot.id);
    setError("");
    setNotice("");
    try {
      await bookingApi.deleteManagedScheduleSlot("merchant-admin", slot.id);
      refresh("未使用时段已软删除并记录审计日志。");
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-[22px] border border-line bg-white p-4 shadow-panel">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label><span className="mb-2 block text-xs font-black text-ink/55">开始日期</span><input className={inputClassName} type="date" value={range.from} onChange={(event) => { setRange((current) => ({ ...current, from: event.target.value })); setPage(1); }} /></label>
          <label><span className="mb-2 block text-xs font-black text-ink/55">结束日期</span><input className={inputClassName} type="date" value={range.to} onChange={(event) => { setRange((current) => ({ ...current, to: event.target.value })); setPage(1); }} /></label>
          <Button disabled={loading} onClick={() => setReloadVersion((current) => current + 1)} variant="secondary">刷新正式数据</Button>
        </div>
      </section>

      {!readOnly ? (
        <section className="rounded-[22px] border border-line bg-white p-5 shadow-panel">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-lg font-black text-ink">新增可预约时段</h3><p className="mt-1 text-xs font-bold text-ink/50">结束时间按正式服务时长自动计算；重叠和时长错误由后端事务拒绝。</p></div>
            <Badge tone="green">正式写入</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label><span className="mb-2 block text-xs font-black text-ink/55">服务</span><select className={inputClassName} value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">请选择</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMinutes} 分</option>)}</select></label>
            <label><span className="mb-2 block text-xs font-black text-ink/55">员工（可选）</span><select className={inputClassName} value={technicianProfileId} onChange={(event) => setTechnicianProfileId(event.target.value)}><option value="">店铺公共时段</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.displayName}</option>)}</select></label>
            <label><span className="mb-2 block text-xs font-black text-ink/55">开始时间</span><input className={inputClassName} type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
            <label><span className="mb-2 block text-xs font-black text-ink/55">结束时间</span><input className={inputClassName} disabled type="datetime-local" value={endPreview} /></label>
            <label><span className="mb-2 block text-xs font-black text-ink/55">容量</span><input className={inputClassName} max={100} min={1} type="number" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>
          </div>
          <div className="mt-4"><Button disabled={busyId !== null || !selectedService || !endPreview || Number(capacity) < 1} onClick={() => void createSlot()}>创建正式时段</Button></div>
        </section>
      ) : null}

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
      {notice ? <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">{notice}</p> : null}

      <section className="overflow-hidden rounded-[22px] border border-line bg-white shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h3 className="text-lg font-black text-ink">正式排班库存</h3><p className="mt-1 text-xs font-bold text-ink/50">共 {total} 条；本页 {slots.length} 条</p></div><Badge tone="neutral">第 {page}/{pageCount} 页</Badge></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-paper text-xs font-black text-ink/55"><tr><th className="px-4 py-3">时间</th><th className="px-4 py-3">服务</th><th className="px-4 py-3">员工</th><th className="px-4 py-3">容量</th><th className="px-4 py-3">状态</th>{!readOnly ? <th className="px-4 py-3">操作</th> : null}</tr></thead>
            <tbody>{loading ? <tr><td className="px-4 py-8 text-center font-bold text-ink/50" colSpan={readOnly ? 5 : 6}>正在读取正式排班...</td></tr> : null}{!loading && slots.length === 0 ? <tr><td className="px-4 py-8 text-center font-bold text-ink/50" colSpan={readOnly ? 5 : 6}>所选日期内没有排班时段</td></tr> : null}{slots.map((slot) => <tr className="border-t border-line" key={slot.id}><td className="px-4 py-3 font-bold"><span className="block">{formatDateTime(slot.startsAt)}</span><span className="mt-1 block text-xs text-ink/45">至 {formatDateTime(slot.endsAt)}</span></td><td className="px-4 py-3 font-black">{slot.serviceName}</td><td className="px-4 py-3">{slot.technicianName ?? "店铺公共"}</td><td className="px-4 py-3">{slot.bookedCount}/{slot.capacity}</td><td className="px-4 py-3">{statusBadge(slot.status)}</td>{!readOnly ? <td className="px-4 py-3"><div className="flex gap-2"><Button disabled={busyId !== null || slot.status === "booked" || slot.bookedCount > 0} onClick={() => void updateStatus(slot)} size="sm" variant="secondary">{slot.status === "blocked" ? "恢复" : "阻塞"}</Button><Button disabled={busyId !== null || slot.bookedCount > 0} onClick={() => void deleteSlot(slot)} size="sm" variant="danger">软删除</Button></div></td> : null}</tr>)}</tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4"><Button disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} size="sm" variant="secondary">上一页</Button><Button disabled={loading || page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} size="sm" variant="secondary">下一页</Button></div>
      </section>
    </div>
  );
}
