import { useMemo, useState } from "react";
import { Drawer } from "../../../components/ui/Drawer";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { cn, yen } from "../../../lib/utils";
import { getArrangementStatusLabel, getServiceModeLabel, type DispatchServiceMode } from "../domain";
import { getMerchantScheduleArrangementPath } from "../paths";
import {
  annotateArrangement,
  assignArrangementTechnician,
  getTodayArrangements,
  rescheduleArrangement
} from "../store";
import { useEntityStore } from "../../../state/entityStore";
import { ArrangementDetailContent, getArrangementStatusClassName, getArrangementStatusTone } from "./ArrangementDetailContent";

export function TodayArrangementTable({
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
  const [serviceMode, setServiceMode] = useState<DispatchServiceMode>("store");
  const [selectedArrangementOrderId, setSelectedArrangementOrderId] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const arrangements = getTodayArrangements(storeId, serviceMode);
  const selectedArrangement = arrangements.find((arrangement) => arrangement.orderId === selectedArrangementOrderId) ?? null;
  const isMobileSurface = surface === "mobile";
  const sectionClass = isMobileSurface
    ? "border-line bg-white/90 shadow-panel backdrop-blur-xl"
    : "merchant-dispatch-surface";
  const cardClass = isMobileSurface ? "border-line bg-white/80" : "merchant-dispatch-card";
  const quietTextClass = isMobileSurface ? "text-ink/60" : "text-ink/58";
  const labelTextClass = isMobileSurface ? "text-ink/45" : "text-ink/45";
  const secondaryButtonClass = isMobileSurface ? "bg-white/80" : undefined;
  const toggleClass = isMobileSurface ? "border-line bg-white/80 text-ink/60" : "merchant-dispatch-toggle";
  const toggleActiveClass = isMobileSurface ? "border-moss bg-moss text-white" : "is-active";
  const alertClass = isMobileSurface ? "bg-lemon/25 text-[#795b00]" : "merchant-dispatch-alert";

  const cycleTechnician = (currentTechnicianId: string | null) => {
    if (storeTechnicians.length === 0) {
      return null;
    }

    if (!currentTechnicianId) {
      return storeTechnicians[0]?.id ?? null;
    }

    const currentIndex = storeTechnicians.findIndex((technician) => technician.id === currentTechnicianId);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % storeTechnicians.length;
    return storeTechnicians[nextIndex]?.id ?? null;
  };

  const runAction = (runner: () => { ok: boolean; message?: string }) => {
    const result = runner();
    setFlashMessage(result.ok ? "已同步到共享调度数据。" : result.message ?? "操作失败。");
  };

  return (
    <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-black">今日预约安排</h3>
          <p className={cn("mt-1 text-sm leading-6", quietTextClass)}>到店 / 上门切换后字段保持一致，修改时间、担当和备注都会同步到同一份调度数据。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["store", "home"] as const).map((mode) => (
            <button
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-black transition",
                toggleClass,
                serviceMode === mode && toggleActiveClass
              )}
              key={mode}
              onClick={() => setServiceMode(mode)}
              type="button"
            >
              {getServiceModeLabel(mode)}
            </button>
          ))}
        </div>
      </div>

      {flashMessage ? <p className={cn("mt-3 rounded-2xl px-4 py-3 text-sm font-semibold", alertClass)}>{flashMessage}</p> : null}

      {surface === "mobile" ? (
        <div className="mt-4 space-y-3">
          {arrangements.map((arrangement) => (
            <article className={cn("rounded-[22px] border p-4", cardClass)} key={arrangement.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getArrangementStatusClassName(arrangement.status)} tone={getArrangementStatusTone(arrangement.status)}>
                      {getArrangementStatusLabel(arrangement.status)}
                    </Badge>
                    <span className={cn("text-xs font-semibold", labelTextClass)}>{arrangement.startTime}-{arrangement.endTime}</span>
                  </div>
                  <h4 className="mt-2 text-base font-black text-ink">{arrangement.serviceName}</h4>
                  <p className={cn("mt-1 text-sm", quietTextClass)}>{arrangement.customerName} · {arrangement.address}</p>
                  <p className={cn("mt-1 text-xs", labelTextClass)}>{arrangement.technicianLabel ?? "待分配"} · {yen(arrangement.amount)}</p>
                </div>
                {isMobileSurface ? (
                  <Button className={secondaryButtonClass} size="sm" to={getMerchantScheduleArrangementPath(arrangement)} variant="secondary">详情</Button>
                ) : (
                  <Button className={secondaryButtonClass} size="sm" variant="secondary" onClick={() => setSelectedArrangementOrderId(arrangement.orderId)}>详情</Button>
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button className={secondaryButtonClass} size="sm" variant="secondary" onClick={() => runAction(() => rescheduleArrangement(arrangement.orderId, 60, operatorId))}>顺延 1 小时</Button>
                <Button size="sm" onClick={() => runAction(() => assignArrangementTechnician(arrangement.orderId, cycleTechnician(arrangement.technicianId), operatorId))}>切换担当</Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="merchant-dispatch-table-shell mt-4 overflow-x-auto rounded-[22px] border">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="merchant-dispatch-table-header text-xs font-black uppercase text-ink/45">
              <tr>
                {["预约项目", "预约时间", "地址", "担当技师", "备注", "订单状态", "操作"].map((label) => (
                  <th className="border-b border-line px-4 py-3" key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {arrangements.map((arrangement) => (
                <tr className="merchant-dispatch-table-row border-b border-line last:border-b-0" key={arrangement.id}>
                  <td className="px-4 py-3">
                    <p className="font-black text-ink">{arrangement.serviceName}</p>
                    <p className="mt-1 text-xs text-ink/45">{arrangement.customerName}</p>
                  </td>
                  <td className="px-4 py-3">{arrangement.startTime}-{arrangement.endTime}</td>
                  <td className="px-4 py-3">
                    <p>{arrangement.address}</p>
                    <p className="mt-1 text-xs text-ink/45">{arrangement.roomLabel}</p>
                  </td>
                  <td className="px-4 py-3">{arrangement.technicianLabel ?? "待分配"}</td>
                  <td className="px-4 py-3">{arrangement.internalNote || arrangement.note || "-"}</td>
                  <td className="px-4 py-3">
                    <Badge className={getArrangementStatusClassName(arrangement.status)} tone={getArrangementStatusTone(arrangement.status)}>
                      {getArrangementStatusLabel(arrangement.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => runAction(() => rescheduleArrangement(arrangement.orderId, 60, operatorId))}>改时间</Button>
                      <Button size="sm" onClick={() => runAction(() => assignArrangementTechnician(arrangement.orderId, cycleTechnician(arrangement.technicianId), operatorId))}>改担当</Button>
                      <Button size="sm" variant="secondary" onClick={() => runAction(() => annotateArrangement(arrangement.orderId, operatorId))}>备注</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isMobileSurface ? (
        <Drawer onClose={() => setSelectedArrangementOrderId(null)} open={Boolean(selectedArrangement)} title="预约安排详情">
          {selectedArrangement ? (
            <ArrangementDetailContent
              arrangement={selectedArrangement}
              onActionComplete={(result) => setFlashMessage(result.ok ? "已同步到共享调度数据。" : result.message ?? "操作失败。")}
              operatorId={operatorId}
              storeId={storeId}
              surface={surface}
            />
          ) : null}
        </Drawer>
      ) : null}
    </section>
  );
}
