import { cn, statusLabel } from "../../lib/utils";
import type { Order } from "../../types/domain";

const acceptedOrderStatuses: Order["status"][] = ["confirmed", "scheduled", "inService", "completed"];

function parseOrderDateTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);

  if (!match) {
    return null;
  }

  const [, year, month, day, hours, minutes] = match;

  return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), 0, 0);
}

function formatTimeLabel(date: Date | null) {
  if (!date) {
    return "预计到达";
  }

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function resolveExpectedArrivalLabel(order: Order) {
  const expected = parseOrderDateTime(order.expectedArrivalAt ?? "");

  if (expected) {
    return formatTimeLabel(expected);
  }

  const bookedAt = parseOrderDateTime(order.bookedAt);

  if (!bookedAt) {
    return "预计到达";
  }

  bookedAt.setMinutes(bookedAt.getMinutes() - 10);

  return formatTimeLabel(bookedAt);
}

function resolveActiveStepIndex(order: Order) {
  if (order.status === "completed") {
    return 4;
  }

  if (order.status === "inService") {
    return 3;
  }

  if (acceptedOrderStatuses.includes(order.status) || order.autoConfirmed) {
    return 0;
  }

  return -1;
}

function resolveHeadline(order: Order, subject: string, activeStepIndex: number) {
  if (order.status === "completed") {
    return "服务已完成";
  }

  if (order.status === "inService") {
    return `${subject}正在服务`;
  }

  if (order.status === "cancelled") {
    return "预约已取消";
  }

  if (order.status === "refunding" || order.status === "refunded") {
    return order.status === "refunding" ? "退款处理中" : "退款已完成";
  }

  return activeStepIndex >= 0 ? `${subject}已确认接单` : `等待${subject}确认接单`;
}

export function OrderDynamicStatusCard({
  order,
  providerName
}: {
  order: Order;
  providerName?: string;
}) {
  const activeStepIndex = resolveActiveStepIndex(order);
  const subject = providerName ?? (order.mode === "home" ? order.technicianName ?? "技师" : order.storeName ?? "商铺");
  const steps =
    order.mode === "home"
      ? ["确认接单", "请出发", `预计到达 ${resolveExpectedArrivalLabel(order)}`, "正在服务", "服务完成"]
      : ["商铺确认接单", "请出发", `预计到达 ${resolveExpectedArrivalLabel(order)}`, "正在服务", "服务完成"];

  return (
    <section className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-primary)_30%,var(--client-line))] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_88%,var(--client-primary)_12%),color-mix(in_srgb,var(--client-bg)_82%,var(--client-primary)_18%))] p-4 text-[color:var(--client-text)] shadow-[0_18px_42px_color-mix(in_srgb,var(--client-primary)_12%,transparent)]">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="text-[11px] font-black tracking-[0.16em] text-[color:var(--client-primary-strong)]">动态状态</p>
          <h2 className="mt-3 text-[21px] font-black leading-[1.18] tracking-normal text-[color:var(--client-text)]">
            {resolveHeadline(order, subject, activeStepIndex)}
          </h2>
        </div>
        <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_52%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-4 text-[13px] font-black text-[color:var(--client-primary-strong)]">
          {statusLabel(order.status)}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-5 gap-0">
        {steps.map((step, index) => {
          const active = index <= activeStepIndex;

          return (
            <div className="min-w-0" key={`${step}-${index}`}>
              <div className="flex items-center">
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full border text-[15px] font-black",
                    active
                      ? "border-[color:color-mix(in_srgb,var(--client-primary)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_20%,var(--client-elevated))] text-[color:var(--client-primary-strong)]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_72%,var(--client-primary)_28%)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] text-[color:var(--client-muted)]"
                  )}
                >
                  {index + 1}
                </span>
                {index < steps.length - 1 ? (
                  <span
                    className={cn(
                      "h-[2px] min-w-0 flex-1",
                      index < activeStepIndex ? "bg-[color:color-mix(in_srgb,var(--client-primary)_58%,transparent)]" : "bg-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)]"
                    )}
                  />
                ) : null}
              </div>
              <p className={cn("mt-2 min-h-[34px] pr-1 text-[11px] font-black leading-4", active ? "text-[color:var(--client-text)]" : "text-[color:var(--client-muted)]")}>{step}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
