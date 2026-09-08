import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { backofficeRealDataApi } from "../../api/backofficeRealData";
import { pricingModeApi } from "../../features/pricing-mode/api";
import { schedulingApi, type SchedulingScope } from "../../features/scheduling/api";
import { loadManagedScheduleWindow } from "../../features/scheduling/window-loader";
import type { BookingScheduleSlot } from "../../features/booking/api";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { getAuthenticatedPersistentCacheScope } from "../../lib/persistentCacheScope";
import { persistentResourceCache } from "../../lib/persistentResourceCache";

type FormalScheduleInventoryPanelProps = {
  scope: SchedulingScope;
  shopId?: number | null;
};

type ServiceChoice = {
  id: number;
  name: string;
  durationMinutes: number;
  source: "shop" | "technician";
};

type TechnicianChoice = {
  id: number;
  name: string;
};

type ScheduleInventoryCacheValue = {
  services: ServiceChoice[];
  slots: BookingScheduleSlot[];
  technicians: TechnicianChoice[];
};

const scheduleConflictMessage = "该时段与现有排班冲突，请调整开始时间";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toLocalDateInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatLocalDateTime(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return `${toLocalDateInput(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getScheduleFailureMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.code === 40911) {
      return scheduleConflictMessage;
    }

    if (error.code === 40912) {
      return "该时段已有预约，不能修改或删除";
    }

    if (error.status === 403) {
      return "当前身份没有管理正式排班的权限";
    }

    if (error.status === 401) {
      return "登录状态已失效，请重新登录";
    }
  }

  return "正式排班操作失败，请稍后重试";
}

export function FormalScheduleInventoryPanel({ scope, shopId = null }: FormalScheduleInventoryPanelProps) {
  const { language } = useI18n();
  const t = useCallback((source: string) => translateText(source, language), [language]);
  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const rangeEnd = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() + 60);
    date.setHours(23, 59, 59, 999);
    return date;
  }, [today]);
  const cacheScope = getAuthenticatedPersistentCacheScope();
  const cacheKey = `schedule:inventory:${scope}:${shopId ?? "self"}:${today.toISOString()}:${rangeEnd.toISOString()}`;
  const cachedInventory = cacheScope
    ? persistentResourceCache.peek<ScheduleInventoryCacheValue>(cacheScope, cacheKey)
    : undefined;
  const [services, setServices] = useState<ServiceChoice[]>(() => cachedInventory?.services ?? []);
  const [technicians, setTechnicians] = useState<TechnicianChoice[]>(() => cachedInventory?.technicians ?? []);
  const [slots, setSlots] = useState<BookingScheduleSlot[]>(() => cachedInventory?.slots ?? []);
  const [selectedServiceKey, setSelectedServiceKey] = useState("");
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [selectedDate, setSelectedDate] = useState(toLocalDateInput(today));
  const [selectedTime, setSelectedTime] = useState("10:00");
  const [capacity, setCapacity] = useState("1");
  const [inventoryLoading, setInventoryLoading] = useState(() => cachedInventory === undefined);
  const [inventorySaving, setInventorySaving] = useState(false);
  const [inventoryError, setInventoryError] = useState("");
  const [pendingDeleteSlotId, setPendingDeleteSlotId] = useState<number | null>(null);

  const loadInventory = useCallback(async (force = false) => {
    if (scope === "technician" && !shopId) {
      setServices([]);
      setTechnicians([]);
      setSlots([]);
      setInventoryError(t("当前技师账号尚未关联有效店铺"));
      setInventoryLoading(false);
      return;
    }

    const cached = cacheScope
      ? persistentResourceCache.peek<ScheduleInventoryCacheValue>(cacheScope, cacheKey)
      : undefined;
    if (cached) {
      setSlots(cached.slots);
      setServices(cached.services);
      setTechnicians(cached.technicians);
    }
    setInventoryLoading(cached === undefined);
    setInventoryError("");

    try {
      const loadFromServer = async (): Promise<ScheduleInventoryCacheValue> => {
        const slotPromise = loadManagedScheduleWindow(scope, { from: today, to: rangeEnd });
        if (scope === "merchant-admin") {
          const [slotResult, serviceResult, technicianResult] = await Promise.all([
            slotPromise,
            backofficeRealDataApi.services("merchant-admin", { page: 1, pageSize: 100 }),
            backofficeRealDataApi.technicians("merchant-admin", { page: 1, pageSize: 100 })
          ]);
          return {
            slots: slotResult,
            services: serviceResult.list.map((service) => ({
              durationMinutes: service.durationMinutes,
              id: service.id,
              name: service.name,
              source: "shop" as const
            })),
            technicians: technicianResult.list.map((technician) => ({ id: technician.id, name: technician.displayName }))
          };
        }
        const [slotResult, serviceResult] = await Promise.all([
          slotPromise,
          pricingModeApi.listTechnicianServices(shopId as number, { activeOnly: true, page: 1, pageSize: 100 })
        ]);
        return {
          slots: slotResult,
          services: serviceResult.list.filter((service) => service.isBookable).map((service) => ({
            durationMinutes: service.durationMinutes,
            id: service.id,
            name: service.name,
            source: "technician" as const
          })),
          technicians: []
        };
      };
      const result = cacheScope
        ? await persistentResourceCache.load({ force, key: cacheKey, load: loadFromServer, scope: cacheScope })
        : await loadFromServer();
      setSlots(result.slots);
      setServices(result.services);
      setTechnicians(result.technicians);
    } catch (error) {
      const fallback = cacheScope
        ? persistentResourceCache.peek<ScheduleInventoryCacheValue>(cacheScope, cacheKey)
        : undefined;
      if (fallback) {
        setSlots(fallback.slots);
        setServices(fallback.services);
        setTechnicians(fallback.technicians);
      } else {
        setSlots([]);
        setServices([]);
        setTechnicians([]);
        setInventoryError(t(getScheduleFailureMessage(error)));
      }
    } finally {
      setInventoryLoading(false);
    }
  }, [cacheKey, cacheScope, rangeEnd, scope, shopId, t, today]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    if (!cacheScope) return;
    return persistentResourceCache.subscribe<ScheduleInventoryCacheValue>(cacheScope, cacheKey, (inventory) => {
      setSlots(inventory.slots);
      setServices(inventory.services);
      setTechnicians(inventory.technicians);
      setInventoryError("");
      setInventoryLoading(false);
    });
  }, [cacheKey, cacheScope]);

  useEffect(() => {
    if (!services.some((service) => `${service.source}:${service.id}` === selectedServiceKey)) {
      const first = services[0];
      setSelectedServiceKey(first ? `${first.source}:${first.id}` : "");
    }
  }, [selectedServiceKey, services]);

  const selectedService = services.find((service) => `${service.source}:${service.id}` === selectedServiceKey) ?? null;

  const createSlot = async () => {
    if (!selectedService) {
      setInventoryError(t("请先创建并选择可预约服务"));
      return;
    }

    const startsAt = new Date(`${selectedDate}T${selectedTime}:00`);
    const endsAt = new Date(startsAt.getTime() + selectedService.durationMinutes * 60_000);
    const parsedCapacity = Number.parseInt(capacity, 10);

    if (!Number.isFinite(startsAt.getTime()) || startsAt < new Date()) {
      setInventoryError(t("请选择当前时间之后的有效开始时间"));
      return;
    }

    if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1 || parsedCapacity > 100) {
      setInventoryError(t("可预约人数必须在 1 到 100 之间"));
      return;
    }

    setInventorySaving(true);
    setInventoryError("");

    try {
      await schedulingApi.createSlot(scope, {
        ...(selectedService.source === "shop"
          ? { serviceId: selectedService.id }
          : { technicianServiceId: selectedService.id }),
        capacity: parsedCapacity,
        endsAt,
        startsAt,
        ...(scope === "merchant-admin" && selectedTechnicianId
          ? { technicianProfileId: Number(selectedTechnicianId) }
          : {})
      });
      await loadInventory(true);
    } catch (error) {
      setInventoryError(t(getScheduleFailureMessage(error)));
    } finally {
      setInventorySaving(false);
    }
  };

  const updateSlotStatus = async (slot: BookingScheduleSlot) => {
    setInventorySaving(true);
    setInventoryError("");

    try {
      await schedulingApi.updateSlot(scope, slot.id, {
        status: slot.status === "blocked" ? "available" : "blocked"
      });
      await loadInventory(true);
    } catch (error) {
      setInventoryError(t(getScheduleFailureMessage(error)));
    } finally {
      setInventorySaving(false);
    }
  };

  const deleteSlot = async (slotId: number) => {
    if (pendingDeleteSlotId !== slotId) {
      setPendingDeleteSlotId(slotId);
      return;
    }

    setInventorySaving(true);
    setInventoryError("");

    try {
      await schedulingApi.deleteSlot(scope, slotId);
      setPendingDeleteSlotId(null);
      await loadInventory(true);
    } catch (error) {
      setInventoryError(t(getScheduleFailureMessage(error)));
    } finally {
      setInventorySaving(false);
    }
  };

  return (
    <section className="mx-4 rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:var(--client-surface)] p-4 shadow-sm" data-testid="formal-schedule-inventory-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-black text-[color:var(--client-text)]">{t("正式可预约时段")}</p>
          <p className="mt-1 text-xs font-bold leading-5 text-[color:var(--client-muted)]">{t("保存后会实时同步到用户预约页、商户端和技师端")}</p>
        </div>
        <button className="rounded-full border border-[color:var(--client-line)] px-3 py-2 text-xs font-black text-[color:var(--client-text)] disabled:opacity-50" disabled={inventoryLoading || inventorySaving} onClick={() => void loadInventory(true)} type="button">
          {t("刷新")}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-black text-[color:var(--client-muted)]">
          {t("服务项目")}
          <select className="h-11 rounded-xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-sm text-[color:var(--client-text)]" onChange={(event) => setSelectedServiceKey(event.target.value)} value={selectedServiceKey}>
            <option value="">{t("请选择服务")}</option>
            {services.map((service) => <option key={`${service.source}:${service.id}`} value={`${service.source}:${service.id}`}>{service.name} · {service.durationMinutes}{t("分钟")}</option>)}
          </select>
        </label>
        {scope === "merchant-admin" ? (
          <label className="grid gap-1 text-xs font-black text-[color:var(--client-muted)]">
            {t("指定技师（可选）")}
            <select className="h-11 rounded-xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-sm text-[color:var(--client-text)]" onChange={(event) => setSelectedTechnicianId(event.target.value)} value={selectedTechnicianId}>
              <option value="">{t("不指定技师")}</option>
              {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
            </select>
          </label>
        ) : null}
        <label className="grid gap-1 text-xs font-black text-[color:var(--client-muted)]">
          {t("日期")}
          <input className="h-11 rounded-xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-sm text-[color:var(--client-text)]" min={toLocalDateInput(today)} onChange={(event) => setSelectedDate(event.target.value)} type="date" value={selectedDate} />
        </label>
        <label className="grid gap-1 text-xs font-black text-[color:var(--client-muted)]">
          {t("开始时间")}
          <input className="h-11 rounded-xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-sm text-[color:var(--client-text)]" onChange={(event) => setSelectedTime(event.target.value)} type="time" value={selectedTime} />
        </label>
        <label className="grid gap-1 text-xs font-black text-[color:var(--client-muted)]">
          {t("可预约人数")}
          <input className="h-11 rounded-xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] px-3 text-sm text-[color:var(--client-text)]" max="100" min="1" onChange={(event) => setCapacity(event.target.value)} type="number" value={capacity} />
        </label>
      </div>

      <button className="mt-4 h-11 w-full rounded-full bg-[color:var(--client-primary)] text-sm font-black text-[color:var(--client-needo-text)] disabled:opacity-50" disabled={inventoryLoading || inventorySaving || services.length === 0} onClick={() => void createSlot()} type="button">
        {inventorySaving ? t("保存中") : t("新增正式可预约时段")}
      </button>

      {inventoryError ? <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-bold text-red-500" role="alert">{inventoryError}</p> : null}

      <div className="mt-4 space-y-2">
        {inventoryLoading ? <p className="py-4 text-center text-sm font-bold text-[color:var(--client-muted)]">{t("加载正式排班中")}</p> : null}
        {!inventoryLoading && slots.length === 0 ? <p className="py-4 text-center text-sm font-bold text-[color:var(--client-muted)]">{t("当前范围没有正式可预约时段")}</p> : null}
        {slots.map((slot) => (
          <article className="rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-3" key={slot.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[color:var(--client-text)]">{slot.serviceName}</p>
                <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{formatLocalDateTime(slot.startsAt)}–{formatLocalDateTime(slot.endsAt).slice(11)}</p>
                <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{slot.technicianName || t("未指定技师")} · {slot.bookedCount}/{slot.capacity}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_16%,transparent)] px-2 py-1 text-[11px] font-black text-[color:var(--client-text)]">
                {slot.status === "booked" ? t("已预约") : slot.status === "blocked" ? t("已锁定") : t("可预约")}
              </span>
            </div>
            <div className={`mt-3 grid gap-2 ${scope === "technician" ? "grid-cols-3" : "grid-cols-2"}`}>
              {scope === "technician" ? (
                <Link
                  className="grid h-9 place-items-center rounded-full border border-[color:var(--client-line)] text-xs font-black text-[color:var(--client-text)]"
                  to={`/technician/schedule/events/${slot.id}`}
                >
                  {t("查看详情")}
                </Link>
              ) : null}
              <button className="h-9 rounded-full border border-[color:var(--client-line)] text-xs font-black text-[color:var(--client-text)] disabled:opacity-40" disabled={inventorySaving || slot.status === "booked" || slot.bookedCount > 0} onClick={() => void updateSlotStatus(slot)} type="button">
                {slot.status === "blocked" ? t("恢复可预约") : t("锁定时段")}
              </button>
              <button className="h-9 rounded-full border border-red-500/35 text-xs font-black text-red-500 disabled:opacity-40" disabled={inventorySaving || slot.status === "booked" || slot.bookedCount > 0} onClick={() => void deleteSlot(slot.id)} type="button">
                {pendingDeleteSlotId === slot.id ? t("再次点击确认删除") : t("删除时段")}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
