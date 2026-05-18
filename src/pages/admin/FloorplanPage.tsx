import { useRef, useState, type PointerEvent } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { cn } from "../../lib/utils";

type FloorAreaStatus = "使用中" | "空闲" | "清洁中" | "预约" | "锁定";
type FloorAreaType = "room" | "bed" | "table" | "station";
type FloorArea = {
  id: string;
  label: string;
  type: FloorAreaType;
  status: FloorAreaStatus;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  assignee: string;
  revenue: number;
  utilization: number;
  nextBooking: string;
  history: Array<{ date: string; orders: number; revenue: number; utilization: number }>;
  bookings: Array<{ time: string; customer: string; service: string; status: string }>;
};

const areaTypeLabels: Record<FloorAreaType, string> = {
  room: "包间",
  bed: "床位",
  table: "桌位",
  station: "工位"
};

const initialAreas: FloorArea[] = [
  {
    id: "room-1",
    label: "包间 A",
    type: "room",
    status: "使用中",
    x: 6,
    y: 12,
    w: 22,
    h: 28,
    color: "#4b7cff",
    assignee: "佐藤 美咲",
    revenue: 42800,
    utilization: 86,
    nextBooking: "21:00 肩颈护理",
    history: [
      { date: "4/10", orders: 8, revenue: 38600, utilization: 79 },
      { date: "4/11", orders: 10, revenue: 45200, utilization: 91 },
      { date: "4/12", orders: 9, revenue: 42800, utilization: 86 }
    ],
    bookings: [
      { time: "18:30", customer: "林 小雨", service: "肩颈护理 90 分钟", status: "服务中" },
      { time: "21:00", customer: "Mia Chen", service: "全身放松", status: "待到店" }
    ]
  },
  {
    id: "room-2",
    label: "包间 B",
    type: "room",
    status: "空闲",
    x: 32,
    y: 12,
    w: 22,
    h: 28,
    color: "#22b36b",
    assignee: "王 静",
    revenue: 31800,
    utilization: 64,
    nextBooking: "19:30 精油护理",
    history: [
      { date: "4/10", orders: 5, revenue: 24600, utilization: 48 },
      { date: "4/11", orders: 7, revenue: 33200, utilization: 66 },
      { date: "4/12", orders: 6, revenue: 31800, utilization: 64 }
    ],
    bookings: [
      { time: "19:30", customer: "佐藤 健", service: "精油护理", status: "已预约" },
      { time: "22:00", customer: "Alex Wu", service: "睡眠舒缓", status: "待确认" }
    ]
  },
  {
    id: "bed-1",
    label: "床位 1",
    type: "bed",
    status: "清洁中",
    x: 62,
    y: 12,
    w: 16,
    h: 20,
    color: "#f4a840",
    assignee: "田中 翔太",
    revenue: 22600,
    utilization: 58,
    nextBooking: "20:30 待清洁完成",
    history: [
      { date: "4/10", orders: 4, revenue: 16800, utilization: 42 },
      { date: "4/11", orders: 6, revenue: 25400, utilization: 62 },
      { date: "4/12", orders: 5, revenue: 22600, utilization: 58 }
    ],
    bookings: [
      { time: "20:30", customer: "高橋 莉奈", service: "足部护理", status: "清洁后开放" },
      { time: "21:30", customer: "Daniel Park", service: "肩背放松", status: "候补" }
    ]
  },
  {
    id: "table-1",
    label: "桌位 1",
    type: "table",
    status: "预约",
    x: 8,
    y: 52,
    w: 17,
    h: 20,
    color: "#ff5c72",
    assignee: "店长",
    revenue: 18600,
    utilization: 72,
    nextBooking: "18:45 双人预约",
    history: [
      { date: "4/10", orders: 7, revenue: 16800, utilization: 66 },
      { date: "4/11", orders: 8, revenue: 20400, utilization: 75 },
      { date: "4/12", orders: 7, revenue: 18600, utilization: 72 }
    ],
    bookings: [
      { time: "18:45", customer: "山本 亮", service: "双人套餐", status: "已预约" },
      { time: "20:15", customer: "林 小雨", service: "茶点休息", status: "待支付" }
    ]
  },
  {
    id: "station-1",
    label: "工位 1",
    type: "station",
    status: "使用中",
    x: 35,
    y: 55,
    w: 18,
    h: 18,
    color: "#8d5a7b",
    assignee: "Urban Beauty",
    revenue: 25400,
    utilization: 79,
    nextBooking: "服务中",
    history: [
      { date: "4/10", orders: 6, revenue: 21800, utilization: 70 },
      { date: "4/11", orders: 7, revenue: 28600, utilization: 83 },
      { date: "4/12", orders: 6, revenue: 25400, utilization: 79 }
    ],
    bookings: [
      { time: "18:00", customer: "王 静", service: "美甲护理", status: "服务中" },
      { time: "20:00", customer: "Nina Li", service: "美睫自然款", status: "已预约" }
    ]
  },
  {
    id: "table-2",
    label: "桌位 2",
    type: "table",
    status: "空闲",
    x: 66,
    y: 52,
    w: 18,
    h: 20,
    color: "#63a8d8",
    assignee: "未分配",
    revenue: 9200,
    utilization: 31,
    nextBooking: "可立即接待",
    history: [
      { date: "4/10", orders: 2, revenue: 6800, utilization: 22 },
      { date: "4/11", orders: 3, revenue: 9800, utilization: 34 },
      { date: "4/12", orders: 2, revenue: 9200, utilization: 31 }
    ],
    bookings: [
      { time: "19:00", customer: "开放预约", service: "可接散客", status: "可售" },
      { time: "21:00", customer: "开放预约", service: "晚间空档", status: "可售" }
    ]
  }
];

const smartLayout = [
  { x: 6, y: 12, w: 22, h: 28 },
  { x: 32, y: 12, w: 22, h: 28 },
  { x: 62, y: 12, w: 16, h: 20 },
  { x: 8, y: 52, w: 17, h: 20 },
  { x: 35, y: 55, w: 18, h: 18 },
  { x: 66, y: 52, w: 18, h: 20 },
  { x: 78, y: 30, w: 14, h: 16 },
  { x: 55, y: 42, w: 14, h: 16 }
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function statusTone(status: FloorAreaStatus) {
  if (status === "使用中") return "red";
  if (status === "空闲") return "green";
  if (status === "锁定") return "neutral";

  return "yellow";
}

function AreaHistoryChart({ area }: { area: FloorArea }) {
  const maxRevenue = Math.max(...area.history.map((item) => item.revenue), 1);
  const maxOrders = Math.max(...area.history.map((item) => item.orders), 1);

  return (
    <div className="rounded-lg bg-paper p-3">
      <div className="flex h-44 items-end gap-3 border-b border-line pb-3">
        {area.history.map((item) => (
          <div className="flex flex-1 flex-col items-center justify-end gap-2" key={item.date}>
            <div className="flex h-32 w-full items-end justify-center gap-1">
              <span
                className="w-4 rounded-t bg-moss"
                style={{ height: `${Math.max(10, (item.revenue / maxRevenue) * 100)}%` }}
                title={`流水 ¥${item.revenue.toLocaleString("ja-JP")}`}
              />
              <span
                className="w-4 rounded-t bg-lemon"
                style={{ height: `${Math.max(10, (item.orders / maxOrders) * 100)}%` }}
                title={`订单 ${item.orders}`}
              />
            </div>
            <span className="text-[11px] font-bold text-ink/45">{item.date}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {area.history.map((item) => (
          <div className="rounded-lg bg-white p-2 text-center" key={`${item.date}-util`}>
            <p className="text-[11px] font-bold text-ink/45">{item.date}</p>
            <strong className="mt-1 block text-sm">{item.utilization}%</strong>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-black/5">
              <span className="block h-full rounded-full bg-coral" style={{ width: `${item.utilization}%` }} />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold text-ink/55">
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-moss" />流水</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-lemon" />订单</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-coral" />利用率</span>
      </div>
    </div>
  );
}

function makeArea(index: number): FloorArea {
  const layout = smartLayout[index % smartLayout.length];

  return {
    id: `custom-${Date.now()}`,
    label: `新区域 ${index + 1}`,
    type: "room",
    status: "空闲",
    x: layout.x,
    y: layout.y,
    w: layout.w,
    h: layout.h,
    color: "#2f75ff",
    assignee: "未分配",
    revenue: 0,
    utilization: 0,
    nextBooking: "暂无预约",
    history: [
      { date: "4/10", orders: 0, revenue: 0, utilization: 0 },
      { date: "4/11", orders: 0, revenue: 0, utilization: 0 },
      { date: "4/12", orders: 0, revenue: 0, utilization: 0 }
    ],
    bookings: [{ time: "开放", customer: "可配置预约", service: "新区域待上架", status: "配置中" }]
  };
}

export function FloorplanPage() {
  const planRef = useRef<HTMLDivElement>(null);
  const [areas, setAreas] = useState<FloorArea[]>(initialAreas);
  const [selectedId, setSelectedId] = useState(initialAreas[0].id);
  const [editMode, setEditMode] = useState(false);
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const selected = areas.find((area) => area.id === selectedId) ?? areas[0];
  const utilization = areas.length ? Math.round(areas.reduce((sum, area) => sum + area.utilization, 0) / areas.length) : 0;
  const busyCount = areas.filter((area) => area.status === "使用中").length;
  const cleanCount = areas.filter((area) => area.status === "清洁中").length;
  const revenue = areas.reduce((sum, area) => sum + area.revenue, 0);

  const updateArea = (id: string, patch: Partial<FloorArea>) => {
    setAreas((current) => current.map((area) => (area.id === id ? { ...area, ...patch } : area)));
  };

  const nudgeSelected = (dx: number, dy: number) => {
    updateArea(selected.id, {
      x: clamp(selected.x + dx, 2, 98 - selected.w),
      y: clamp(selected.y + dy, 2, 98 - selected.h)
    });
  };

  const resizeSelected = (dw: number, dh: number) => {
    updateArea(selected.id, {
      w: clamp(selected.w + dw, 10, 44),
      h: clamp(selected.h + dh, 10, 40),
      x: clamp(selected.x, 2, 98 - clamp(selected.w + dw, 10, 44)),
      y: clamp(selected.y, 2, 98 - clamp(selected.h + dh, 10, 40))
    });
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, area: FloorArea) => {
    setSelectedId(area.id);

    if (!editMode || area.status === "锁定") {
      return;
    }

    const rect = planRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging({
      id: area.id,
      offsetX: event.clientX - rect.left - (area.x / 100) * rect.width,
      offsetY: event.clientY - rect.top - (area.y / 100) * rect.height
    });
  };

  const dragArea = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) {
      return;
    }

    const rect = planRef.current?.getBoundingClientRect();
    const area = areas.find((item) => item.id === dragging.id);

    if (!rect || !area) {
      return;
    }

    const nextX = ((event.clientX - rect.left - dragging.offsetX) / rect.width) * 100;
    const nextY = ((event.clientY - rect.top - dragging.offsetY) / rect.height) * 100;

    updateArea(area.id, {
      x: clamp(nextX, 2, 98 - area.w),
      y: clamp(nextY, 2, 98 - area.h)
    });
  };

  const addArea = () => {
    const next = makeArea(areas.length);
    setAreas((current) => [...current, next]);
    setSelectedId(next.id);
    setEditMode(true);
  };

  const deleteSelected = () => {
    if (areas.length <= 1) {
      return;
    }

    setAreas((current) => {
      const next = current.filter((area) => area.id !== selected.id);
      setSelectedId(next[0].id);

      return next;
    });
  };

  const applySmartLayout = () => {
    setAreas((current) => current.map((area, index) => ({ ...area, ...smartLayout[index % smartLayout.length] })));
  };

  return (
    <AdminLayout>
      <ModuleShell
        title="场控布局 / 平面图"
        description="适用于包间、床位、桌位、工位和区域状态管理，支持拖拽布局、利用率查看与消费记录查看。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant={editMode ? "secondary" : "primary"} onClick={() => setEditMode((current) => !current)}>
              {editMode ? "退出编辑" : "进入编辑模式"}
            </Button>
            <Button variant="secondary" onClick={addArea}>
              添加物件
            </Button>
            <Button variant="secondary" onClick={applySmartLayout}>
              智能整理
            </Button>
          </div>
        }
      >
        <section className="grid gap-3 md:grid-cols-4">
          {[
            ["今日流水", `¥${revenue.toLocaleString("ja-JP")}`, "包间、床位、桌位合计"],
            ["全店利用率", `${utilization}%`, "按区域今日使用时长估算"],
            ["服务中区域", `${busyCount} 个`, "需要关注服务进度"],
            ["待清洁", `${cleanCount} 个`, "影响下一轮可预约时间"]
          ].map(([label, value, caption]) => (
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={label}>
              <p className="text-xs font-bold text-ink/50">{label}</p>
              <strong className="mt-2 block text-2xl" data-no-i18n>
                {value}
              </strong>
              <p className="mt-2 text-xs text-ink/55">{caption}</p>
            </article>
          ))}
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr,380px]">
          <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TitleWithInfo
                as="h2"
                info={editMode ? "编辑模式已开启：可添加、删除、移动、缩放、命名、改色和设置担当者。" : "查看模式：点击物件可查看历史数据、未来预约和运营建议。"}
                label="GINZA Calm Body Lab 平面图说明"
                title="GINZA Calm Body Lab 平面图"
                titleClassName="font-bold"
                variant="paper"
              />
              <div className="flex gap-2">
                <Badge tone="green">利用率 {utilization}%</Badge>
                <Badge tone={editMode ? "red" : "neutral"}>{editMode ? "编辑中" : "查看中"}</Badge>
              </div>
            </div>
            <div
              className={cn(
                "relative mt-4 h-[560px] overflow-hidden rounded-lg border border-line bg-paper",
                editMode &&
                  "bg-[linear-gradient(rgba(47,117,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(47,117,255,0.12)_1px,transparent_1px)] bg-[size:24px_24px]"
              )}
              onPointerMove={dragArea}
              onPointerUp={() => setDragging(null)}
              ref={planRef}
            >
              <div className="absolute inset-x-8 top-8 h-16 rounded-lg border border-line bg-white p-3 text-sm font-bold">前台 / 等候区</div>
              <div className="absolute bottom-8 left-8 right-8 h-16 rounded-lg border border-line bg-white p-3 text-sm font-bold">后勤 / 仓储 / 消毒区</div>
              {areas.map((area) => {
                const selectedArea = selected.id === area.id;

                return (
                  <button
                    className={cn(
                      "absolute rounded-lg border-2 p-3 text-left text-sm font-bold shadow-panel transition",
                      editMode && area.status !== "锁定" && "cursor-move",
                      selectedArea ? "border-moss bg-mint/30" : "border-line bg-white"
                    )}
                    key={area.id}
                    onPointerDown={(event) => startDrag(event, area)}
                    style={{
                      left: `${area.x}%`,
                      top: `${area.y}%`,
                      width: `${area.w}%`,
                      height: `${area.h}%`,
                      borderColor: selectedArea ? undefined : area.color,
                      background: selectedArea ? undefined : `color-mix(in srgb, ${area.color} 16%, var(--admin-surface, #fff))`
                    }}
                    type="button"
                  >
                    <span>{area.label}</span>
                    <span className="mt-2 block text-xs font-semibold text-ink/55">{area.status}</span>
                    <span className="mt-1 block text-[11px] font-semibold text-ink/45">{area.assignee}</span>
                    {editMode && selectedArea && <span className="absolute bottom-1 right-1 h-4 w-4 rounded-sm border border-moss bg-white" />}
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            {editMode ? (
              <>
                <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                  <div className="flex items-start justify-between gap-3">
                    <TitleWithInfo
                      as="h2"
                      info="自定义命名、颜色、担当者和区域类型。"
                      label="物件编辑说明"
                      title="物件编辑"
                      titleClassName="font-bold"
                      variant="paper"
                    />
                    <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm">
                    <label className="grid gap-1">
                      <span className="text-xs font-bold text-ink/50">名称</span>
                      <input className="h-10 rounded-lg border border-line bg-paper px-3 outline-none" value={selected.label} onChange={(event) => updateArea(selected.id, { label: event.target.value })} />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-bold text-ink/50">担当者</span>
                      <input className="h-10 rounded-lg border border-line bg-paper px-3 outline-none" value={selected.assignee} onChange={(event) => updateArea(selected.id, { assignee: event.target.value })} />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="grid gap-1">
                        <span className="text-xs font-bold text-ink/50">类型</span>
                        <select className="h-10 rounded-lg border border-line bg-paper px-3 outline-none" value={selected.type} onChange={(event) => updateArea(selected.id, { type: event.target.value as FloorAreaType })}>
                          {Object.entries(areaTypeLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs font-bold text-ink/50">颜色</span>
                        <input className="h-10 rounded-lg border border-line bg-paper px-2" type="color" value={selected.color} onChange={(event) => updateArea(selected.id, { color: event.target.value })} />
                      </label>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                  <h2 className="font-bold">状态与布局</h2>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(["空闲", "清洁中", "预约", "使用中", "锁定"] as FloorAreaStatus[]).map((status) => (
                      <Button key={status} size="sm" variant={selected.status === status ? "primary" : "secondary"} onClick={() => updateArea(selected.id, { status })}>
                        设为{status}
                      </Button>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Button size="sm" variant="secondary" onClick={() => nudgeSelected(0, -2)}>
                      上移
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => nudgeSelected(-2, 0)}>
                      左移
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => nudgeSelected(2, 0)}>
                      右移
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => nudgeSelected(0, 2)}>
                      下移
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => resizeSelected(2, 2)}>
                      放大
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => resizeSelected(-2, -2)}>
                      缩小
                    </Button>
                  </div>
                  <Button className="mt-3 w-full" disabled={areas.length <= 1} variant="danger" onClick={deleteSelected}>
                    删除物件
                  </Button>
                </section>
              </>
            ) : (
              <>
                <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                  <div className="flex items-start justify-between gap-3">
                    <TitleWithInfo
                      as="h2"
                      info="点击平面图物件即可切换查看。"
                      label="区域洞察说明"
                      title="区域洞察"
                      titleClassName="font-bold"
                      variant="paper"
                    />
                    <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
                  </div>
                  <div className="mt-3 space-y-3 text-sm">
                    {[
                      ["名称", selected.label],
                      ["类型", areaTypeLabels[selected.type]],
                      ["担当者", selected.assignee],
                      ["今日利用率", `${selected.utilization}%`],
                      ["消费记录", `¥${selected.revenue.toLocaleString("ja-JP")}`],
                      ["下一预约", selected.nextBooking]
                    ].map(([label, value]) => (
                      <div className="flex justify-between gap-3" key={label}>
                        <span className="text-ink/55">{label}</span>
                        <strong className="text-right" data-no-i18n={label !== "名称" && label !== "担当者"}>
                          {value}
                        </strong>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                  <h2 className="font-bold">以往数据</h2>
                  <div className="mt-3">
                    <AreaHistoryChart area={selected} />
                  </div>
                  <div className="mt-3 space-y-2">
                    {selected.history.map((item) => (
                      <article className="rounded-lg bg-paper p-3 text-sm" key={item.date}>
                        <div className="flex justify-between">
                          <strong>{item.date}</strong>
                          <span data-no-i18n>¥{item.revenue.toLocaleString("ja-JP")}</span>
                        </div>
                        <p className="mt-1 text-xs text-ink/55">
                          {item.orders} 单 · 利用率 {item.utilization}%
                        </p>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                  <h2 className="font-bold">未来预约</h2>
                  <div className="mt-3 space-y-2">
                    {selected.bookings.map((booking) => (
                      <article className="rounded-lg bg-paper p-3 text-sm" key={`${booking.time}-${booking.customer}`}>
                        <div className="flex items-start justify-between gap-2">
                          <strong>{booking.time}</strong>
                          <Badge tone={booking.status === "可售" ? "green" : booking.status === "待确认" ? "yellow" : "neutral"}>{booking.status}</Badge>
                        </div>
                        <p className="mt-1 font-bold">{booking.service}</p>
                        <p className="mt-1 text-xs text-ink/55">{booking.customer}</p>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                  <h2 className="font-bold">智能建议</h2>
                  <div className="mt-3 space-y-2 text-xs leading-5 text-ink/60">
                    <p>1. {selected.label} 当前利用率 {selected.utilization}%，建议按晚高峰优先保留高客单项目。</p>
                    <p>2. 担当者为 {selected.assignee}，若连续服务超过 4 小时，建议自动插入 15 分钟缓冲。</p>
                    <p>3. 下一预约为 {selected.nextBooking}，系统可同步影响用户端可预约时段。</p>
                  </div>
                </section>
              </>
            )}
          </aside>
        </div>
      </ModuleShell>
    </AdminLayout>
  );
}
