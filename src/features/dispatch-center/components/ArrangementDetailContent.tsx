import { useMemo } from "react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { cn, yen } from "../../../lib/utils";
import { useEntityStore } from "../../../state/entityStore";
import { getArrangementStatusLabel, getServiceModeLabel, type DispatchArrangement } from "../domain";
import {
  annotateArrangement,
  assignArrangementTechnician,
  cancelArrangement,
  rescheduleArrangement
} from "../store";

type ArrangementActionResult = { ok: boolean; message?: string };

export function getArrangementStatusTone(status: DispatchArrangement["status"]) {
  if (status === "completed") {
    return "green";
  }

  if (status === "pending") {
    return "yellow";
  }

  if (status === "cancelled") {
    return "red";
  }

  return "blue";
}

export function getArrangementStatusClassName(status: DispatchArrangement["status"]) {
  if (status === "inService") {
    return "schedule-legend-badge schedule-legend-badge--in-service";
  }

  if (status === "confirmed") {
    return "schedule-legend-badge schedule-legend-badge--booked";
  }

  if (status === "pending" || status === "cancelled") {
    return "schedule-legend-badge schedule-legend-badge--conflict-pending";
  }

  return "schedule-legend-badge schedule-legend-badge--scheduled";
}

export function ArrangementDetailContent({
  arrangement,
  operatorId,
  storeId,
  surface,
  onActionComplete
}: {
  arrangement: DispatchArrangement;
  operatorId: string;
  storeId: string;
  surface: "desktop" | "mobile";
  onActionComplete?: (result: ArrangementActionResult) => void;
}) {
  const { technicians } = useEntityStore();
  const storeTechnicians = useMemo(() => technicians.filter((technician) => technician.storeId === storeId), [storeId, technicians]);
  const isMobileSurface = surface === "mobile";
  const cardClass = isMobileSurface
    ? "border-line bg-white/80"
    : "merchant-dispatch-card";
  const softPanelClass = isMobileSurface
    ? "bg-paper/70"
    : "merchant-dispatch-soft-panel";
  const labelTextClass = isMobileSurface ? "text-ink/45" : "text-ink/45";
  const secondaryButtonClass = isMobileSurface ? "bg-white/80" : undefined;

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

  const runAction = (runner: () => ArrangementActionResult) => {
    const result = runner();
    onActionComplete?.(result);
  };

  return (
    <div className="space-y-4">
      <div className={cn("rounded-[22px] p-4", softPanelClass)}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={cn("text-xs font-black uppercase tracking-[0.16em]", isMobileSurface ? "text-ink/45" : "text-moss/70")}>{arrangement.orderNo}</p>
            <h4 className="mt-2 text-xl font-black text-ink">{arrangement.serviceName}</h4>
          </div>
          <Badge className={getArrangementStatusClassName(arrangement.status)} tone={getArrangementStatusTone(arrangement.status)}>
            {getArrangementStatusLabel(arrangement.status)}
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            ["客户", arrangement.customerName],
            ["时间", `${arrangement.date} ${arrangement.startTime}-${arrangement.endTime}`],
            ["服务方式", getServiceModeLabel(arrangement.serviceMode)],
            ["担当", arrangement.technicianLabel ?? "待分配"],
            ["地址", arrangement.address],
            ["金额", yen(arrangement.amount)]
          ].map(([label, value]) => (
            <div className={cn("rounded-2xl border px-4 py-3", cardClass)} key={label}>
              <p className={cn("text-xs font-bold", labelTextClass)}>{label}</p>
              <strong className="mt-1 block text-sm">{value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button onClick={() => runAction(() => assignArrangementTechnician(arrangement.orderId, cycleTechnician(arrangement.technicianId), operatorId))}>切换担当</Button>
        <Button className={secondaryButtonClass} variant="secondary" onClick={() => runAction(() => rescheduleArrangement(arrangement.orderId, 60, operatorId))}>顺延 1 小时</Button>
        <Button className={secondaryButtonClass} variant="secondary" onClick={() => runAction(() => annotateArrangement(arrangement.orderId, operatorId))}>写入备注</Button>
        <Button variant="danger" onClick={() => runAction(() => cancelArrangement(arrangement.orderId, operatorId))}>取消预约</Button>
      </div>
    </div>
  );
}
