import { useMemo, useState } from "react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Drawer } from "../../../components/ui/Drawer";
import { cn } from "../../../lib/utils";
import type { DispatchSpecialTask } from "../domain";
import { createSpecialTask, getSpecialTasks, updateSpecialTask } from "../store";
import { useEntityStore } from "../../../state/entityStore";

function sourceLabel(source: DispatchSpecialTask["source"]) {
  const labels: Record<DispatchSpecialTask["source"], string> = {
    merchant_manual: "商户端录入",
    admin_manual: "后台代录",
    overtime: "排班外加班",
    unassigned_order: "未分配派单"
  };

  return labels[source];
}

function statusTone(status: DispatchSpecialTask["status"]) {
  return status === "assigned" || status === "completed" ? "green" : status === "cancelled" ? "neutral" : "yellow";
}

export function SpecialTaskPool({
  operatorId,
  storeId,
  surface
}: {
  operatorId: string;
  storeId: string;
  surface: "desktop" | "mobile";
}) {
  const { technicians } = useEntityStore();
  const storeTechnicians = useMemo(() => technicians.filter((technician) => technician.storeId === storeId), [storeId, technicians]);
  const tasks = getSpecialTasks(storeId);
  const [editorOpen, setEditorOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    serviceMode: "store" | "home";
    date: string;
    startTime: string;
    endTime: string;
    address: string;
    note: string;
  }>({
    serviceMode: "store",
    date: "2026-04-20",
    startTime: "20:00",
    endTime: "21:30",
    address: "店内新增任务",
    note: "电话预约 / 加钟 / 临时安排"
  });
  const isMobileSurface = surface === "mobile";
  const sectionClass = isMobileSurface
    ? "border-line bg-white/90 shadow-panel backdrop-blur-xl"
    : "merchant-dispatch-surface";
  const cardClass = isMobileSurface ? "border-line bg-white/80" : "merchant-dispatch-card";
  const quietTextClass = isMobileSurface ? "text-ink/60" : "text-ink/58";
  const secondaryButtonClass = isMobileSurface ? "bg-white/80" : undefined;
  const inputClass = isMobileSurface
    ? "mt-2 w-full rounded-2xl border border-line bg-white/80 px-4 py-3 text-ink outline-none"
    : "merchant-dispatch-field mt-2 w-full rounded-2xl border px-4 py-3 outline-none";
  const alertClass = isMobileSurface ? "bg-lemon/25 text-[#795b00]" : "merchant-dispatch-alert";

  const cycleTechnician = (currentId: string | null) => {
    if (storeTechnicians.length === 0) {
      return null;
    }

    if (!currentId) {
      return storeTechnicians[0]?.id ?? null;
    }

    const currentIndex = storeTechnicians.findIndex((technician) => technician.id === currentId);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % storeTechnicians.length;
    return storeTechnicians[nextIndex]?.id ?? null;
  };

  const runAction = (runner: () => { ok: boolean; message?: string }) => {
    const result = runner();
    setMessage(result.ok ? "任务池已同步更新。" : result.message ?? "操作失败。");
  };

  return (
    <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-black">特派任务池</h3>
          <p className={cn("mt-1 text-sm leading-6", quietTextClass)}>电话预约、临时加钟、后台代录和排班外加班都进入这里，再决定分配、取消还是转正式订单。</p>
        </div>
        <Button onClick={() => setEditorOpen(true)}>新增特派任务</Button>
      </div>

      {message ? <p className={cn("mt-3 rounded-2xl px-4 py-3 text-sm font-semibold", alertClass)}>{message}</p> : null}

      <div className="mt-4 space-y-3">
        {tasks.map((task) => (
          <article className={cn("rounded-[22px] border p-4", cardClass)} key={task.id}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="blue">{sourceLabel(task.source)}</Badge>
                  <Badge tone={statusTone(task.status)}>{task.status === "assigned" ? "已分配" : task.status === "cancelled" ? "已取消" : task.status === "completed" ? "已完成" : "待分配"}</Badge>
                </div>
                <h4 className="mt-2 text-base font-black text-ink">{task.date} {task.startTime}-{task.endTime}</h4>
                <p className="mt-2 text-sm text-ink/60">{task.address}</p>
                <p className="mt-1 text-xs text-ink/45">{task.note}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => runAction(() => updateSpecialTask(task.id, { technicianId: cycleTechnician(task.technicianId), status: "assigned" }, operatorId))}>
                  担当/员工交代
                </Button>
                <Button className={secondaryButtonClass} size="sm" variant="secondary" onClick={() => runAction(() => updateSpecialTask(task.id, { status: "completed" }, operatorId))}>完成</Button>
                <Button className={secondaryButtonClass} size="sm" variant="secondary" onClick={() => runAction(() => updateSpecialTask(task.id, { status: "cancelled", technicianId: null }, operatorId))}>取消</Button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Drawer onClose={() => setEditorOpen(false)} open={editorOpen} title="新增特派任务">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-ink">
              服务方式
              <select
                className={inputClass}
                onChange={(event) => setDraft((current) => ({ ...current, serviceMode: event.target.value as "store" | "home" }))}
                value={draft.serviceMode}
              >
                <option value="store">到店服务</option>
                <option value="home">上门服务</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-ink">
              日期
              <input
                className={inputClass}
                onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                type="date"
                value={draft.date}
              />
            </label>
            <label className="text-sm font-semibold text-ink">
              开始时间
              <input
                className={inputClass}
                onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
                type="time"
                value={draft.startTime}
              />
            </label>
            <label className="text-sm font-semibold text-ink">
              结束时间
              <input
                className={inputClass}
                onChange={(event) => setDraft((current) => ({ ...current, endTime: event.target.value }))}
                type="time"
                value={draft.endTime}
              />
            </label>
          </div>

          <label className="block text-sm font-semibold text-ink">
            地址 / 场景
            <input
              className={inputClass}
              onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))}
              value={draft.address}
            />
          </label>

          <label className="block text-sm font-semibold text-ink">
            说明
            <textarea
              className={cn(inputClass, "h-28")}
              onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
              value={draft.note}
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              onClick={() => {
                const result = createSpecialTask(
                  {
                    storeId,
                    source: "merchant_manual",
                    serviceMode: draft.serviceMode,
                    date: draft.date,
                    startTime: draft.startTime,
                    endTime: draft.endTime,
                    address: draft.address,
                    technicianId: null,
                    orderId: null,
                    status: "pending",
                    note: draft.note
                  },
                  operatorId
                );
                setMessage(result.ok ? "已加入特派任务池。" : "创建失败。");
                if (result.ok) {
                  setEditorOpen(false);
                }
              }}
            >
              保存任务
            </Button>
            <Button className={secondaryButtonClass} onClick={() => setEditorOpen(false)} variant="secondary">取消</Button>
          </div>
        </div>
      </Drawer>
    </section>
  );
}
