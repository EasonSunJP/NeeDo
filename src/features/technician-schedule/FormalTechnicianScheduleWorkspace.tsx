import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppIcon, FeatureSegmentedTabs } from "../../components/client-ui/AppScaffold";
import {
  ContactEventTimelinePanel,
  type ContactEventTimelineEntry
} from "../../components/mobile/ContactEventTimeline";
import {
  UnifiedUserCalendar,
  type UnifiedCalendarTechnician
} from "../../components/scheduling/UnifiedUserCalendar";
import { FormalTechnicianOrdersPanel } from "../../components/technician/FormalTechnicianOrdersPanel";
import type { BookingOrder } from "../booking/api";
import { loadEveryTechnicianOrder } from "../scheduling/window-loader";
import { cn } from "../../lib/utils";

type WorkspaceTab = "calendar" | "settings";

const schedulePanelClass =
  "rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] shadow-[var(--client-shadow)]";

function timelineDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "numeric",
    second: "2-digit",
    year: "numeric"
  }).format(date);
}

function buildStatusTimelineEntries(orders: BookingOrder[]): ContactEventTimelineEntry[] {
  return orders.flatMap((order) => order.statusHistory.map((history) => {
    const role = history.toStatus === "pending"
      ? "预约创建"
      : history.toStatus === "confirmed"
        ? "服务方接单"
        : history.toStatus === "inService"
          ? "开始服务"
          : history.toStatus === "completed"
            ? "结束服务"
            : "取消 / 异常";
    const action = history.toStatus === "pending"
      ? "已创建预约"
      : history.toStatus === "confirmed"
        ? "已确认接单"
        : history.toStatus === "inService"
          ? "已开始服务"
          : history.toStatus === "completed"
            ? "已结束服务"
            : "预约已取消";
    const reason = history.reason?.trim() ?? "";
    const createdAt = new Date(history.createdAt);
    const isProblem = history.toStatus === "cancelled" || /迟到|异常|失败|冲突|拒绝|取消/.test(reason);

    return {
      entry: {
        actorName: "系统",
        actorRole: role,
        atLabel: timelineDateTime(history.createdAt),
        id: `order-${order.id}-history-${history.id}`,
        message: (
          <>
            {action}：订单
            <Link
              className="font-black text-[color:var(--client-primary)] underline decoration-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] decoration-2 underline-offset-2"
              to={`/technician/orders/${order.id}`}
            >
              {order.orderNo}
            </Link>
            ，项目 {order.serviceName}，预约时间 {timelineDateTime(order.startsAt)}{reason ? `，${reason}` : ""}。
          </>
        ),
        preserveAtLabel: true,
        title: role,
        tone: isProblem ? "red" : "green"
      } satisfies ContactEventTimelineEntry,
      sortAt: Number.isFinite(createdAt.getTime()) ? createdAt.getTime() : 0
    };
  })).sort((left, right) => right.sortAt - left.sortAt).slice(0, 24).map(({ entry }) => entry);
}

export function FormalTechnicianScheduleWorkspace({
  dataCenterPeriod,
  initialSelectedDate,
  profileAvatarUrl,
  profileId,
  profileName,
  searchQuery = "",
  shopId,
  shopName
}: {
  dataCenterPeriod?: "last7days" | "last30days" | "week" | "month" | "year";
  initialSelectedDate?: string;
  profileAvatarUrl?: string | null;
  profileId: number;
  profileName: string;
  searchQuery?: string;
  shopId: number;
  shopName: string;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<WorkspaceTab>("calendar");
  const [statusOrders, setStatusOrders] = useState<BookingOrder[]>([]);
  const [statusLoadState, setStatusLoadState] = useState<"loading" | "success" | "error">("loading");
  const calendarTechnician = useMemo<UnifiedCalendarTechnician>(() => ({
    avatar: profileAvatarUrl ?? "",
    id: String(profileId),
    name: profileName,
    storeId: String(shopId)
  }), [profileAvatarUrl, profileId, profileName, shopId]);
  const statusTimelineEntries = useMemo(() => buildStatusTimelineEntries(statusOrders), [statusOrders]);
  const statusRecordTarget = statusOrders[0] ?? null;
  const dataCenterPeriodLabel = dataCenterPeriod === "last30days"
    ? "近30天"
    : dataCenterPeriod === "week"
      ? "本周"
      : dataCenterPeriod === "month"
        ? "本月"
        : dataCenterPeriod === "year"
          ? "今年"
          : dataCenterPeriod === "last7days"
            ? "近7天"
            : null;

  useEffect(() => {
    let active = true;
    setStatusLoadState("loading");
    void loadEveryTechnicianOrder()
      .then((orders) => {
        if (!active) return;
        setStatusOrders(orders);
        setStatusLoadState("success");
      })
      .catch(() => {
        if (!active) return;
        setStatusOrders([]);
        setStatusLoadState("error");
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="text-[color:var(--client-text)]" data-testid="formal-technician-schedule-workspace">
      <div className="mb-4">
        <FeatureSegmentedTabs
          items={[
            { label: "我的排班", value: "calendar" },
            { label: "排班设置", value: "settings" }
          ]}
          onChange={setTab}
          value={tab}
          variant="header"
        />
      </div>

      <div className="space-y-4">
        {dataCenterPeriodLabel ? <p className="rounded-2xl border border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,transparent)] px-4 py-2.5 text-xs font-black text-[color:var(--client-muted)]">数据中心期间：{dataCenterPeriodLabel}</p> : null}
        {tab === "settings" ? (
        <div className="space-y-4" data-testid="formal-schedule-settings-surface">
          <section className={cn(schedulePanelClass, "p-4")}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black text-[color:var(--client-muted)]">{shopName}</p>
                <h2 className="mt-1 text-xl font-black">正式排班设置</h2>
              </div>
              <Link
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--client-needo-text)]"
                to="/technician/schedule/new"
              >
                <AppIcon className="h-4 w-4" name="plus" />新建正式排班
              </Link>
            </div>
            <p className="mt-3 text-xs font-bold leading-5 text-[color:var(--client-muted)]">
              新增、编辑和锁定都会写入当前技师身份的正式排班接口；本页不创建浏览器排班记录。
            </p>
          </section>
          <section
            className="client-feature-panel rounded-[28px] border p-4 text-white shadow-[var(--client-shadow)]"
            data-testid="formal-schedule-orders-surface"
          >
            <div className="mb-4">
              <p className="text-[11px] font-black text-white/50">正式服务器数据</p>
              <h2 className="mt-1 text-xl font-black">预约订单</h2>
            </div>
            <FormalTechnicianOrdersPanel />
          </section>
        </div>
        ) : (
          <>
          <UnifiedUserCalendar
            currentTechnician={calendarTechnician}
            displayMode="parallel"
            formalOnly
            initialSelectedDate={initialSelectedDate}
            scope="technician"
            searchQuery={searchQuery}
            showSourceDrawer
          />
          <ContactEventTimelinePanel
            commentAuthorAvatarSrc={profileAvatarUrl ?? undefined}
            commentAuthorName={profileName}
            commentAuthorRole="补充记录"
            commentButtonLabel="补充记录"
            commentPlaceholder="记录执行经过、异常原因或后续处理..."
            emptyLabel={statusLoadState === "loading"
              ? "正在读取正式状态记录"
              : statusLoadState === "error"
                ? "正式状态记录读取失败，请稍后重试"
                : "暂无执行 / 异常记录"}
            events={statusTimelineEntries}
            layout="three-column"
            onCommentButtonClick={statusRecordTarget ? () => navigate(`/technician/orders/${statusRecordTarget.id}`) : undefined}
            showCommentComposer={Boolean(statusRecordTarget)}
            title="状态记录"
          />
          <button
            aria-label="新建正式排班"
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+24px)] right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-[0_18px_42px_color-mix(in_srgb,var(--client-primary)_40%,transparent)]"
            onClick={() => navigate("/technician/schedule/new")}
            type="button"
          >
            <AppIcon name="plus" />
          </button>
          </>
        )}
      </div>
    </div>
  );
}
