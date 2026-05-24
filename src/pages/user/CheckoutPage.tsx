import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import {
  AppTopBar,
  PageScaffold,
  PrimaryButton,
  SecondaryButton,
  SurfacePanel
} from "../../components/client-ui/AppScaffold";
import { ClientEdgeMask } from "../../components/mobile/ClientEdgeMask";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { services } from "../../data/mock";
import { bookingApi, isBookingApiId, mapBookingOrderToDomainOrder, type BookingScheduleSlot } from "../../features/booking/api";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { getMessagePath, getUserConversationId } from "../../lib/messageCenter";
import { cn, yen } from "../../lib/utils";
import { updateCustomerEntity, useEntityStore } from "../../state/entityStore";
import { useShiftPlanningStore } from "../../state/shiftPlanningStore";
import { addUserOrder } from "../../state/userOrderStore";
import type { Order, ServicePaymentMethod, Store } from "../../types/domain";
import type { FinalBookableSlot } from "../../types/shiftPlanning";
import { confirmNeedoReverseBooking } from "../mobile/NeedoExchangePage";

type CheckoutProgressIcon = "package" | "mode" | "time" | "location" | "technician" | "remark";
type CheckoutEditorSection = "package" | "fulfillment" | "time" | "location" | "technician" | "remark";
type CheckoutTimeEditor = "date" | "time" | "people";
type CheckoutFulfillmentMode = "home" | "store";

const peopleOptions = ["1名", "2名", "3名", "4名"];
const calendarWeekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];
const directOnlinePaymentMethods: ServicePaymentMethod[] = ["paypay", "paypal", "wechatpay", "alipay"];
const platformPrepayMethods: ServicePaymentMethod[] = ["platform", "prepay"];
const paymentMethodLabels: Record<ServicePaymentMethod, string> = {
  platform: "平台支付",
  offline: "线下支付",
  prepay: "预付",
  cash: "现金",
  paypay: "PayPay",
  paypal: "PayPal",
  wechatpay: "WeChat Pay",
  alipay: "Alipay"
};
const orderNoUnsafeCharacterPattern = new RegExp(["-", ":", "\\s"].join("|"), "g");
const homeAddressOptions = [
  {
    id: "home-shinjuku",
    title: "新宿公寓",
    detail: "東京都新宿区西新宿7-9-12 · 公寓 1204",
    contact: "林小雨 · +81 80-2345-7812"
  },
  {
    id: "home-azabu",
    title: "麻布住宅",
    detail: "東京都港区麻布十番2-3-8 · 1202",
    contact: "周知夏 · +81 80-6677-9812"
  },
  {
    id: "home-shibuya",
    title: "涩谷办公室",
    detail: "東京都涩谷区道玄坂1-18-5 · 8F",
    contact: "王一帆 · +81 70-5421-1098"
  }
] as const;
const travelEstimateMinutes = 28;
const travelEstimateFee = 800;

function CheckoutInlineTag({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-block max-w-full whitespace-normal break-words text-left leading-tight [overflow-wrap:anywhere]", className)}>
      {children}
    </span>
  );
}

type CheckoutDialogState =
  | {
      kind: "insufficient";
      balance: number;
      deficit: number;
      required: number;
      paymentMethod: ServicePaymentMethod;
    }
  | {
      kind: "failure";
      message: string;
    };

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getApiSlotDateKey(slot: BookingScheduleSlot) {
  return formatDateKey(new Date(slot.startsAt));
}

function getApiSlotTime(slot: BookingScheduleSlot) {
  const date = new Date(slot.startsAt);

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getApiSlotTimesForDate(slots: BookingScheduleSlot[], date: Date) {
  const dateKey = formatDateKey(date);

  return Array.from(
    new Set(
      slots
        .filter((slot) => slot.status === "available" && getApiSlotDateKey(slot) === dateKey)
        .map(getApiSlotTime)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function findApiSlotForSelection(slots: BookingScheduleSlot[], date: Date, time: string) {
  const dateKey = formatDateKey(date);

  return slots.find(
    (slot) => slot.status === "available" && getApiSlotDateKey(slot) === dateKey && getApiSlotTime(slot) === time
  );
}

function formatSlotTime(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

const alwaysBookableSlotTimes = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";

  return `${String(hour).padStart(2, "0")}:${minute}`;
});

function isClockTimeValue(value: string) {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(extractTimePart(value));
}

function isAlwaysBookableStore(store: Store | null | undefined) {
  return Boolean(store?.alwaysBookable && store.openStatus !== "closed");
}

function getConfirmedSlotTimesForDate(
  finalBookableSlots: FinalBookableSlot[],
  date: Date,
  input: {
    fulfillmentMode: CheckoutFulfillmentMode;
    storeId: string;
    technicianId: string;
  }
) {
  const dateKey = formatDateKey(date);
  const times = finalBookableSlots
    .filter((slot) => {
      if (slot.date !== dateKey || slot.status !== "available") {
        return false;
      }

      if (input.fulfillmentMode === "store") {
        return slot.storeId === input.storeId;
      }

      return slot.technicianId === input.technicianId;
    })
    .map((slot) => formatSlotTime(slot.hour));

  return Array.from(new Set(times)).sort((left, right) => left.localeCompare(right));
}

function findFirstConfirmedSlotDate(
  finalBookableSlots: FinalBookableSlot[],
  input: {
    fulfillmentMode: CheckoutFulfillmentMode;
    storeId: string;
    technicianId: string;
  }
) {
  const firstDateKey = finalBookableSlots
    .filter((slot) => {
      if (slot.status !== "available") {
        return false;
      }

      if (input.fulfillmentMode === "store") {
        return slot.storeId === input.storeId;
      }

      return slot.technicianId === input.technicianId;
    })
    .map((slot) => slot.date)
    .sort((left, right) => left.localeCompare(right))[0];

  return firstDateKey ? parseDateParam(firstDateKey) : null;
}

function buildSeatOptions(store: Store) {
  const gallery = store.gallery.length > 0 ? store.gallery : [store.cover];

  return [
    {
      id: `${store.id}-seat-window`,
      name: "窗边安静席",
      detail: "适合需要更安静环境或希望靠窗的位置。",
      tags: ["靠窗", "安静"],
      status: "当前可选"
    },
    {
      id: `${store.id}-seat-private`,
      name: "半包围护理位",
      detail: "隐私感更强，适合长时间护理或深度放松。",
      tags: ["私密", "深度护理"],
      status: "优先推荐"
    },
    {
      id: `${store.id}-seat-pair`,
      name: "并排双人位",
      detail: "适合同伴同行或需要并排安排的用户。",
      tags: ["双人", "同行"],
      status: "需确认档期"
    }
  ].map((item, index) => ({
    ...item,
    cover: gallery[index] ?? gallery[0] ?? store.cover
  }));
}

function getModeNoticeItems(mode: CheckoutFulfillmentMode, serviceNotice: string[]) {
  if (mode === "store") {
    return [
      "本店暂不接待儿童单独入店，请由成人陪同。",
      "迟到无联系 15 分钟以上会自动取消预约，已支付预付不退还。",
      ...serviceNotice.slice(0, 1)
    ];
  }

  return [
    "请确保联系电话畅通，服务前会再次确认上门信息。",
    "若上门地址临时变更，系统会重新计算预计路程与路费。",
    ...serviceNotice.slice(0, 1)
  ];
}

function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDateParam(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;

  return new Date(Number(year), Number(month) - 1, Number(day));
}

function resolveSlotDate(slot: string, baseDate: Date) {
  const date = normalizeDate(baseDate);

  if (slot.includes("明日")) {
    date.setDate(date.getDate() + 1);
    return date;
  }

  if (slot.includes("今日")) {
    return date;
  }

  const weekdayMap: Array<[string, number]> = [
    ["周日", 0],
    ["周一", 1],
    ["周二", 2],
    ["周三", 3],
    ["周四", 4],
    ["周五", 5],
    ["周六", 6]
  ];
  const matchedWeekday = weekdayMap.find(([label]) => slot.includes(label));

  if (!matchedWeekday) {
    return date;
  }

  const [, targetWeekday] = matchedWeekday;
  let diff = (targetWeekday - date.getDay() + 7) % 7;

  if (diff === 0) {
    diff = 7;
  }

  date.setDate(date.getDate() + diff);

  return date;
}

function extractTimePart(slot: string) {
  const match = slot.match(/(\d{1,2}:\d{2})/);

  return match ? match[1] : slot;
}

function formatBookingDateLabel(date: Date) {
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（周${weekday}）`;
}

function formatBookingDateTimeLabel(date: Date, slot: string) {
  return `${formatBookingDateLabel(date)} ${extractTimePart(slot)}`;
}

function formatCalendarDateTitle(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（周${calendarWeekdayLabels[date.getDay()]}）`;
}

function formatCalendarMonthTitle(date: Date) {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
}

function formatOrderDateTime(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function addMinutes(date: Date, minutes: number) {
  const next = new Date(date);

  next.setMinutes(next.getMinutes() + minutes);

  return next;
}

function isCheckoutDateAvailable(date: Date, minDate: Date, getAvailableTimes: (date: Date) => string[]) {
  const normalized = normalizeDate(date);
  const min = normalizeDate(minDate);

  return normalized.getTime() >= min.getTime() && getAvailableTimes(date).length > 0;
}

function buildBookingDateTime(date: Date, slot: string) {
  const [hours, minutes] = extractTimePart(slot)
    .split(":")
    .map((part) => Number(part));
  const next = new Date(date);

  next.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);

  return next;
}

function formatCountdownLabel(target: Date, nowMs: number) {
  const diff = Math.max(0, target.getTime() - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}小时${minutes}分${seconds}秒后`;
}

function formatYenText(value: number) {
  return `${Math.max(0, Math.round(value)).toLocaleString("ja-JP")}日元`;
}

function getTechnicianAvailabilityLabel(status: "available" | "busy" | "off") {
  if (status === "available") {
    return "当前可约";
  }

  if (status === "busy") {
    return "档期较满";
  }

  return "暂未接单";
}

function CheckoutProgressGlyph({ icon }: { icon: CheckoutProgressIcon }) {
  const stroke = "currentColor";

  return (
    <svg aria-hidden="true" className="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24">
      {icon === "package" ? (
        <>
          <path d="M12 3.7 19 7.5v9L12 20.3 5 16.5v-9L12 3.7Z" stroke={stroke} strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M5 7.5 12 11l7-3.5M12 11v9.3" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </>
      ) : null}
      {icon === "mode" ? (
        <>
          <path d="M4.8 7.2h9.7c1.4 0 2.6 1.2 2.6 2.6v4.5c0 1.4-1.2 2.6-2.6 2.6H9.9l-3.3 2.6v-2.6H4.8c-1.4 0-2.6-1.2-2.6-2.6V9.8c0-1.4 1.2-2.6 2.6-2.6Z" stroke={stroke} strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M17.2 5.3h2a2.6 2.6 0 0 1 2.6 2.6v4.4a2.6 2.6 0 0 1-2.6 2.6h-.8v2.1l-2.5-2.1" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </>
      ) : null}
      {icon === "time" ? (
        <>
          <circle cx="12" cy="12" r="8" stroke={stroke} strokeWidth="1.8" />
          <path d="M12 7.8v4.5l3.1 1.9" stroke={stroke} strokeLinecap="round" strokeWidth="1.8" />
        </>
      ) : null}
      {icon === "location" ? (
        <>
          <path d="M12 20s5.9-4.5 5.9-9.8a5.9 5.9 0 1 0-11.8 0C6.1 15.5 12 20 12 20Z" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <circle cx="12" cy="10.3" r="2.2" stroke={stroke} strokeWidth="1.8" />
        </>
      ) : null}
      {icon === "technician" ? (
        <>
          <circle cx="12" cy="9" r="3.2" stroke={stroke} strokeWidth="1.8" />
          <path d="M6.8 19.2c.7-3 2.8-4.7 5.2-4.7s4.5 1.7 5.2 4.7" stroke={stroke} strokeLinecap="round" strokeWidth="1.8" />
        </>
      ) : null}
      {icon === "remark" ? (
        <>
          <path d="M7 6.2h10A1.8 1.8 0 0 1 18.8 8v7.4A1.8 1.8 0 0 1 17 17.2h-4l-3.2 2.6v-2.6H7A1.8 1.8 0 0 1 5.2 15.4V8A1.8 1.8 0 0 1 7 6.2Z" stroke={stroke} strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M8.8 10.2h6.4M8.8 13h4.2" stroke={stroke} strokeLinecap="round" strokeWidth="1.8" />
        </>
      ) : null}
    </svg>
  );
}

function checkoutProgressPath(first: boolean) {
  if (first) {
    return "M18 4H117C125 4 132 7 138 12L151 25C156 30 156 38 151 43L138 56C132 61 125 64 117 64H18C10 64 4 58 4 50V18C4 10 10 4 18 4Z";
  }

  return "M20 4H117C125 4 132 7 138 12L151 25C156 30 156 38 151 43L138 56C132 61 125 64 117 64H20C14 64 9 61 6 56L0 34L6 12C9 7 14 4 20 4Z";
}

function CheckoutProgressArrow({
  active,
  first,
  icon,
  label,
  onClick
}: {
  active: boolean;
  first: boolean;
  icon: CheckoutProgressIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="relative min-w-0 flex-1" onClick={onClick} type="button">
      <svg
        aria-hidden="true"
        className="h-[56px] w-full"
        preserveAspectRatio="none"
        style={{ color: active ? "var(--client-primary)" : "color-mix(in srgb, var(--client-surface) 88%, rgba(25,29,36,0.98))" }}
        viewBox="0 0 156 68"
      >
        <path d={checkoutProgressPath(first)} fill="currentColor" />
      </svg>
      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 pb-[2px]",
          active ? "text-[#090806]" : "text-white/90"
        )}
      >
        <CheckoutProgressGlyph icon={icon} />
        <span className="line-clamp-2 max-w-[calc(100%-10px)] text-center text-[9px] font-black leading-[1.05] tracking-normal [overflow-wrap:anywhere]">
          {label}
        </span>
      </div>
    </button>
  );
}

function CheckoutDatePicker({
  getAvailableTimes,
  minDate,
  onClose,
  onSelectDate,
  onTimeChange,
  selectedDate,
  time
}: {
  getAvailableTimes: (date: Date) => string[];
  minDate: Date;
  onClose: () => void;
  onSelectDate: (date: Date) => void;
  onTimeChange: (time: string) => void;
  selectedDate: Date;
  time: string;
}) {
  const [viewDate, setViewDate] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells = useMemo(
    () => [
      ...Array.from({ length: firstWeekday }, (_, index) => ({ key: `ghost-${index}`, day: 0, ghost: true })),
      ...Array.from({ length: daysInMonth }, (_, index) => ({ key: `day-${index + 1}`, day: index + 1, ghost: false }))
    ],
    [daysInMonth, firstWeekday]
  );

  useEffect(() => {
    setViewDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [selectedDate]);

  return (
    <div className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_76%,transparent)] p-4">
      <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
        <span className="text-sm font-black text-[color:var(--client-text)]">来店日</span>
        <div className="flex h-12 items-center justify-between border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_80%,transparent)] px-4 text-left">
          <span className="truncate text-[20px] font-black tracking-[-0.03em] text-[color:var(--client-text)]">{formatCalendarDateTitle(selectedDate)}</span>
          <span className="shrink-0 text-xs text-[color:var(--client-muted)]">▲</span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between px-1">
        <button
          aria-label="上个月"
          className="grid h-10 w-10 place-items-center text-[34px] font-black text-[color:var(--client-muted)]"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          type="button"
        >
          ‹
        </button>
        <h4 className="text-[22px] font-black tracking-[-0.03em] text-[color:var(--client-text)]">{formatCalendarMonthTitle(viewDate)}</h4>
        <button
          aria-label="下个月"
          className="grid h-10 w-10 place-items-center text-[34px] font-black text-[color:var(--client-muted)]"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          type="button"
        >
          ›
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 text-center text-[15px] font-black">
        {calendarWeekdayLabels.map((label, index) => (
          <span
            className={cn(
              index === 0 && "text-[#ff6b6b]",
              index === 6 && "text-[#3a91df]",
              index !== 0 && index !== 6 && "text-[color:var(--client-muted)]"
            )}
            key={label}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-y-2 text-center">
        {cells.map((cell, index) => {
          const date = new Date(year, month, cell.day || 1);
          const selectable = !cell.ghost && isCheckoutDateAvailable(date, minDate, getAvailableTimes);
          const selected =
            selectable &&
            selectedDate.getFullYear() === year &&
            selectedDate.getMonth() === month &&
            selectedDate.getDate() === cell.day;
          const weekday = index % 7;

          return (
            <button
              className={cn(
                "mx-auto flex h-[62px] w-[46px] flex-col items-center justify-start pt-1 font-black transition",
                cell.ghost && "pointer-events-none opacity-0",
                !selectable && !cell.ghost && "text-[color:color-mix(in_srgb,var(--client-muted)_54%,transparent)]",
                selectable && "text-[color:var(--client-text)]",
                selected && "rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-primary)_20%,transparent)] ring-1 ring-[color:var(--client-primary)]",
                weekday === 0 && !cell.ghost && "text-[#ff6b6b]",
                weekday === 6 && !cell.ghost && "text-[#3a91df]"
              )}
              disabled={!selectable}
              key={cell.key}
              onClick={() => {
                const nextDate = new Date(year, month, cell.day);
                const nextTimes = getAvailableTimes(nextDate);

                if (!nextTimes.includes(time)) {
                  const nextTime = nextTimes[0] ?? time;

                  onTimeChange(nextTime);
                }

                onSelectDate(nextDate);
                onClose();
              }}
              type="button"
            >
              <span className={cn("text-[21px] leading-none", selected && "text-[color:var(--client-text)]")}>
                {cell.ghost ? "" : cell.day}
              </span>
              {selectable ? (
                <span className="mt-2 h-5 w-5 rounded-full border-[4px] border-[#f08a00]" />
              ) : (
                <span className="mt-1.5 text-lg text-[color:color-mix(in_srgb,var(--client-muted)_44%,transparent)]">－</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CheckoutTimePicker({
  onClose,
  onTimeChange,
  timeOptions,
  time
}: {
  onClose: () => void;
  onTimeChange: (time: string) => void;
  timeOptions: string[];
  time: string;
}) {
  if (timeOptions.length === 0) {
    return (
      <div className="rounded-[18px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-5 text-sm font-semibold text-[color:var(--client-muted)]">
        当前日期没有 confirmed slots 可预约时间。
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {timeOptions.map((option) => {
        const active = option === time;

        return (
          <button
            className={cn(
              "rounded-[18px] border px-4 py-4 text-left transition",
              active
                ? "border-[color:color-mix(in_srgb,var(--client-primary)_30%,transparent)] bg-[color:var(--client-primary-soft)]"
                : "border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]"
            )}
            key={option}
            onClick={() => {
              onTimeChange(option);
              onClose();
            }}
            type="button"
          >
            <span className={cn("block text-[22px] font-black tracking-[-0.04em]", active ? "text-[color:var(--client-primary)]" : "text-[color:var(--client-text)]")}>
              {option}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CheckoutPeoplePicker({
  onClose,
  onPeopleChange,
  people
}: {
  onClose: () => void;
  onPeopleChange: (people: string) => void;
  people: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {peopleOptions.map((option) => {
        const active = option === people;

        return (
          <button
            className={cn(
              "rounded-[18px] border px-4 py-4 text-left transition",
              active
                ? "border-[color:color-mix(in_srgb,var(--client-primary)_30%,transparent)] bg-[color:var(--client-primary-soft)]"
                : "border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]"
            )}
            key={option}
            onClick={() => {
              onPeopleChange(option);
              onClose();
            }}
            type="button"
          >
            <span className={cn("block text-[22px] font-black tracking-[-0.04em]", active ? "text-[color:var(--client-primary)]" : "text-[color:var(--client-text)]")}>
              {option}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function CheckoutPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { serviceId } = useParams();
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const { customers, stores, technicians } = useEntityStore();
  const shiftPlanning = useShiftPlanningStore();
  const service = services.find((item) => item.id === serviceId) ?? services[0];
  const apiServiceId = isBookingApiId(serviceId) ? Number(serviceId) : null;
  const initialSlot = searchParams.get("time") ?? "今日 21:00";
  const routeMode = searchParams.get("mode");
  const initialActiveTech = searchParams.get("technician") ?? technicians[0]?.id ?? "";
  const initialFulfillmentMode: CheckoutFulfillmentMode =
    routeMode === "store" || routeMode === "home" ? routeMode : searchParams.get("store") ? "store" : service.mode;
  const initialSelectedStoreId = searchParams.get("store") ?? stores[0]?.id ?? "";
  const initialSelectedStore = useMemo(
    () => stores.find((item) => item.id === initialSelectedStoreId) ?? stores[0],
    [initialSelectedStoreId, stores]
  );
  const initialStoreAlwaysBookable = initialFulfillmentMode === "store" && isAlwaysBookableStore(initialSelectedStore);
  const firstConfirmedBookingDate = useMemo(
    () =>
      initialStoreAlwaysBookable
        ? null
        : findFirstConfirmedSlotDate(shiftPlanning.finalBookableSlots, {
            fulfillmentMode: initialFulfillmentMode,
            storeId: initialSelectedStoreId,
            technicianId: initialActiveTech
          }),
    [initialActiveTech, initialFulfillmentMode, initialSelectedStoreId, initialStoreAlwaysBookable, shiftPlanning.finalBookableSlots]
  );
  const bookingBaseDate = useMemo(
    () => normalizeDate(parseDateParam(searchParams.get("date")) ?? firstConfirmedBookingDate ?? new Date()),
    [firstConfirmedBookingDate, searchParams]
  );
  const [activePackage, setActivePackage] = useState(searchParams.get("package") ?? "");
  const [activeSlot, setActiveSlot] = useState(extractTimePart(initialSlot));
  const [selectedBookingDate, setSelectedBookingDate] = useState<Date>(() => resolveSlotDate(initialSlot, bookingBaseDate));
  const [activeTech, setActiveTech] = useState(initialActiveTech);
  const [fulfillmentMode, setFulfillmentMode] = useState<CheckoutFulfillmentMode>(
    initialFulfillmentMode
  );
  const [selectedStoreId, setSelectedStoreId] = useState<string>(initialSelectedStoreId);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(homeAddressOptions[0]?.id ?? "");
  const [expandedSection, setExpandedSection] = useState<CheckoutEditorSection | null>(null);
  const [activeTimeEditor, setActiveTimeEditor] = useState<CheckoutTimeEditor | null>(null);
  const [bookingRemark, setBookingRemark] = useState(searchParams.get("remark") ?? "");
  const [selectedPeople, setSelectedPeople] = useState(searchParams.get("people") ?? peopleOptions[0]);
  const [checkoutDialog, setCheckoutDialog] = useState<CheckoutDialogState | null>(null);
  const [apiAvailabilitySlots, setApiAvailabilitySlots] = useState<BookingScheduleSlot[]>([]);
  const [apiAvailabilityFailed, setApiAvailabilityFailed] = useState(false);
  const [creatingApiBooking, setCreatingApiBooking] = useState(false);
  const [locationFeedback, setLocationFeedback] = useState<string | null>(null);
  const needoPostId = searchParams.get("needoPostId");
  const [manualAddressTitle, setManualAddressTitle] = useState("上门地址");
  const [manualAddressDetail, setManualAddressDetail] = useState("");
  const [manualAddressContact, setManualAddressContact] = useState("");
  const selectedPackage = useMemo(
    () => service.packages.find((pkg) => pkg.id === activePackage) ?? service.packages[0],
    [activePackage, service.packages]
  );
  const selectedStore = useMemo(
    () => (fulfillmentMode === "store" ? stores.find((item) => item.id === selectedStoreId) ?? stores[0] : null),
    [fulfillmentMode, selectedStoreId, stores]
  );
  const selectedStoreAlwaysBookable = fulfillmentMode === "store" && isAlwaysBookableStore(selectedStore);
  const selectedAddress = useMemo(
    () => homeAddressOptions.find((item) => item.id === selectedAddressId) ?? homeAddressOptions[0],
    [selectedAddressId]
  );
  const selectedTechnician = useMemo(() => technicians.find((tech) => tech.id === activeTech) ?? technicians[0], [activeTech, technicians]);
  const currentCustomer = useMemo(
    () => customers.find((customer) => customer.id === session?.linkedCustomerId) ?? customers[0],
    [customers, session?.linkedCustomerId]
  );
  const seatOptions = useMemo(() => buildSeatOptions(stores.find((item) => item.id === selectedStoreId) ?? stores[0]), [selectedStoreId, stores]);
  const [selectedSeatId, setSelectedSeatId] = useState<string>(seatOptions[0]?.id ?? "");
  const selectedSeat = useMemo(() => seatOptions.find((item) => item.id === selectedSeatId) ?? seatOptions[0], [seatOptions, selectedSeatId]);
  const locationAddressLine = fulfillmentMode === "store" ? selectedStore?.address ?? stores[0]?.address ?? "" : manualAddressDetail || "请填写上门地址";
  const locationMetaLine =
    fulfillmentMode === "store"
      ? `${selectedStore?.name ?? stores[0]?.name ?? "门店"} · ${selectedStore?.area ?? stores[0]?.area ?? "东京"}`
      : `${manualAddressTitle || "上门地址"} · ${manualAddressContact || "请填写联系人与电话"}`;
  const locationMapQuery =
    fulfillmentMode === "store"
      ? `${selectedStore?.name ?? stores[0]?.name ?? ""} ${selectedStore?.address ?? stores[0]?.address ?? ""}`
      : manualAddressDetail
        ? `${manualAddressTitle} ${manualAddressDetail}`
        : "";
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationMapQuery)}`;
  const googleMapsEmbedUrl = `https://www.google.com/maps?output=embed&q=${encodeURIComponent(locationMapQuery)}`;
  const locationCopyText =
    fulfillmentMode === "store"
      ? `${selectedStore?.name ?? stores[0]?.name ?? ""} ${selectedStore?.address ?? stores[0]?.address ?? ""}`
      : `${manualAddressDetail} ${manualAddressContact}`.trim();
  const progressSteps = useMemo(
    () =>
      [
        { key: "package", label: "套餐", icon: "package" as const },
        { key: "fulfillment", label: fulfillmentMode === "store" ? "到店服务" : "上门服务", icon: "mode" as const },
        { key: "time", label: "时间", icon: "time" as const },
        { key: "location", label: "地址", icon: "location" as const },
        { key: "technician", label: "技师", icon: "technician" as const },
        { key: "remark", label: "备注", icon: "remark" as const }
      ] satisfies ReadonlyArray<{ key: CheckoutEditorSection; label: string; icon: CheckoutProgressIcon }>,
    [fulfillmentMode]
  );
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const remarkInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeProgressStep, setActiveProgressStep] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const totalPrice = selectedPackage.price + (fulfillmentMode === "home" ? travelEstimateFee : 0);
  const sameDayNoContactCancellationFee = totalPrice;
  const sameDayContactCancellationFee = Math.round(totalPrice * 0.5);
  const ndpRewardMax = Math.max(0, Math.round(totalPrice * 0.05));
  const bookingDateLabel = useMemo(() => formatBookingDateLabel(selectedBookingDate), [selectedBookingDate]);
  const bookingDateTimeLabel = useMemo(() => formatBookingDateTimeLabel(selectedBookingDate, activeSlot), [activeSlot, selectedBookingDate]);
  const bookingDateTime = useMemo(() => buildBookingDateTime(selectedBookingDate, activeSlot), [activeSlot, selectedBookingDate]);
  const countdownLabel = useMemo(() => formatCountdownLabel(bookingDateTime, nowMs), [bookingDateTime, nowMs]);
  const arrivalLeadMinutes = 10;
  const reservationHoldMinutes = 15;
  const arrivalNotice =
    fulfillmentMode === "store"
      ? `*请提前${arrivalLeadMinutes}分钟到达，迟到无联系保留${reservationHoldMinutes}分钟`
      : `*请保持电话畅通，服务前${arrivalLeadMinutes}分钟会再次联系`;
  const contactPath = getMessagePath("user", getUserConversationId(fulfillmentMode === "store" ? "store" : "technician"), `${location.pathname}${location.search}`);
  const counterpartyPaymentMethods: ServicePaymentMethod[] = fulfillmentMode === "store"
    ? selectedStore?.paymentMethods ?? ["platform", "prepay"]
    : selectedTechnician.paymentMethods ?? ["platform", "offline"];
  const directOnlinePaymentMethod = counterpartyPaymentMethods.find((method) => directOnlinePaymentMethods.includes(method));
  const platformPrepayMethod = counterpartyPaymentMethods.find((method) => platformPrepayMethods.includes(method));
  const paymentTags = counterpartyPaymentMethods.slice(0, 3).map((method) => paymentMethodLabels[method]);
  const remarkSuggestions = fulfillmentMode === "store" ? ["忌口提醒", "靠窗座位", "安静区域", "提前联系"] : ["门禁说明", "停车位置", "语言偏好", "提前联系"];
  const noticeItems = useMemo(() => getModeNoticeItems(fulfillmentMode, service.notice), [fulfillmentMode, service.notice]);
  const getCheckoutAvailableTimes = (date: Date) =>
    apiServiceId
      ? getApiSlotTimesForDate(apiAvailabilitySlots, date)
      : selectedStoreAlwaysBookable
      ? alwaysBookableSlotTimes
      : getConfirmedSlotTimesForDate(shiftPlanning.finalBookableSlots, date, {
          fulfillmentMode,
          storeId: selectedStoreId,
          technicianId: activeTech
        });
  const availableTimesForSelectedDate = useMemo(
    () => getCheckoutAvailableTimes(selectedBookingDate),
    [activeTech, fulfillmentMode, selectedBookingDate, selectedStoreAlwaysBookable, selectedStoreId, shiftPlanning.finalBookableSlots]
  );
  const hasBookableSlot = apiServiceId
    ? availableTimesForSelectedDate.includes(activeSlot)
    : selectedStoreAlwaysBookable
      ? isClockTimeValue(activeSlot)
      : availableTimesForSelectedDate.includes(activeSlot);
  const timeHelperLabel = selectedStoreAlwaysBookable && !apiServiceId ? "测试店铺随时可约" : hasBookableSlot ? countdownLabel : "仅显示 confirmed slots";

  useEffect(() => {
    if (selectedStoreAlwaysBookable && isClockTimeValue(activeSlot)) {
      return;
    }

    if (availableTimesForSelectedDate.length === 0 || availableTimesForSelectedDate.includes(activeSlot)) {
      return;
    }

    setActiveSlot(availableTimesForSelectedDate[0]);
  }, [activeSlot, availableTimesForSelectedDate, selectedStoreAlwaysBookable]);

  useEffect(() => {
    if (selectedStoreAlwaysBookable || availableTimesForSelectedDate.length > 0 || !firstConfirmedBookingDate) {
      return;
    }

    if (formatDateKey(selectedBookingDate) !== formatDateKey(firstConfirmedBookingDate)) {
      setSelectedBookingDate(firstConfirmedBookingDate);
    }
  }, [availableTimesForSelectedDate.length, firstConfirmedBookingDate, selectedBookingDate, selectedStoreAlwaysBookable]);

  useEffect(() => {
    if (!apiServiceId || availableTimesForSelectedDate.length > 0) {
      return;
    }

    const firstSlot = apiAvailabilitySlots.find((slot) => slot.status === "available");

    if (!firstSlot) {
      return;
    }

    setSelectedBookingDate(new Date(firstSlot.startsAt));
    setActiveSlot(getApiSlotTime(firstSlot));
  }, [apiAvailabilitySlots, apiServiceId, availableTimesForSelectedDate.length]);

  useEffect(() => {
    const updateProgressByScroll = () => {
      const progressBottom = progressBarRef.current?.getBoundingClientRect().bottom ?? 138;
      const threshold = progressBottom + Math.max(0, (window.innerHeight - progressBottom) / 2);
      let nextStep = 0;

      sectionRefs.current.forEach((section, index) => {
        if (section && section.getBoundingClientRect().top <= threshold) {
          nextStep = index;
        }
      });

      setActiveProgressStep((current) => (current === nextStep ? current : nextStep));
    };

    const frameId = window.requestAnimationFrame(updateProgressByScroll);
    window.addEventListener("scroll", updateProgressByScroll, { passive: true });
    window.addEventListener("resize", updateProgressByScroll);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", updateProgressByScroll);
      window.removeEventListener("resize", updateProgressByScroll);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!seatOptions.some((item) => item.id === selectedSeatId)) {
      setSelectedSeatId(seatOptions[0]?.id ?? "");
    }
  }, [seatOptions, selectedSeatId]);

  useEffect(() => {
    if (!apiServiceId) {
      setApiAvailabilitySlots([]);
      setApiAvailabilityFailed(false);
      return;
    }

    let active = true;
    const from = normalizeDate(new Date());
    const to = new Date(from);
    to.setDate(to.getDate() + 21);

    bookingApi
      .listAvailability({
        serviceId: apiServiceId,
        shopId: isBookingApiId(selectedStoreId) ? Number(selectedStoreId) : undefined,
        technicianId: isBookingApiId(activeTech) ? Number(activeTech) : undefined,
        from: from.toISOString(),
        to: to.toISOString(),
        pageSize: 100
      })
      .then((data) => {
        if (!active) {
          return;
        }

        setApiAvailabilitySlots(data.list);
        setApiAvailabilityFailed(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setApiAvailabilitySlots([]);
        setApiAvailabilityFailed(true);
      });

    return () => {
      active = false;
    };
  }, [activeTech, apiServiceId, selectedStoreId]);

  const jumpToSection = (index: number) => {
    const section = sectionRefs.current[index];
    const step = progressSteps[index];

    if (step) {
      setExpandedSection(step.key);
      setActiveTimeEditor(step.key === "time" ? "date" : null);
    }

    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (step?.key === "remark") {
      window.setTimeout(() => {
        remarkInputRef.current?.focus();
      }, 320);
    }
  };

  const toggleSection = (section: CheckoutEditorSection) => {
    const next = expandedSection === section ? null : section;

    setExpandedSection(next);
    setActiveTimeEditor(next === "time" ? "date" : null);

    if (next === "remark") {
      window.requestAnimationFrame(() => {
        remarkInputRef.current?.focus();
      });
    }
  };

  const toggleTimeEditor = (editor: CheckoutTimeEditor) => {
    const closing = expandedSection === "time" && activeTimeEditor === editor;

    setExpandedSection(closing ? null : "time");
    setActiveTimeEditor(closing ? null : editor);
  };

  const closeSectionEdit = () => {
    setExpandedSection(null);
    setActiveTimeEditor(null);
    remarkInputRef.current?.blur();
  };

  const handleFulfillmentModeChange = (mode: CheckoutFulfillmentMode) => {
    setFulfillmentMode(mode);
    closeSectionEdit();

    if (mode === "store" && !selectedStoreId) {
      setSelectedStoreId(stores[0]?.id ?? "");
    }
  };

  const applyHomeAddressTemplate = (templateId: string) => {
    const template = homeAddressOptions.find((item) => item.id === templateId);

    if (!template) {
      return;
    }

    setSelectedAddressId(template.id);
    setManualAddressTitle(template.title);
    setManualAddressDetail(template.detail);
    setManualAddressContact(template.contact);
    closeSectionEdit();
  };

  const appendRemarkSuggestion = (value: string) => {
    setBookingRemark((current) => {
      if (current.includes(value)) {
        return current;
      }

      return current.trim() ? `${current.trim()}，${value}` : value;
    });
    closeSectionEdit();
  };

  const openGoogleMaps = () => {
    window.open(googleMapsUrl, "_blank", "noopener,noreferrer");
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(locationCopyText);
      setLocationFeedback("地址已复制");
    } catch {
      setLocationFeedback("复制失败，请手动复制");
    }

    window.setTimeout(() => {
      setLocationFeedback((current) => (current === "地址已复制" || current === "复制失败，请手动复制" ? null : current));
    }, 2000);
  };

  const createOrder = (paymentMethod: ServicePaymentMethod, paymentStatus: Order["paymentStatus"]) => {
    const orderId = `ord-local-${Date.now()}`;
    const autoConfirmed =
      fulfillmentMode === "store"
        ? selectedStore?.openStatus === "open"
        : selectedTechnician.status === "available" && selectedTechnician.acceptRate >= 95;
    const expectedArrivalAt =
      fulfillmentMode === "store"
        ? formatOrderDateTime(addMinutes(bookingDateTime, -arrivalLeadMinutes))
        : formatOrderDateTime(addMinutes(bookingDateTime, -travelEstimateMinutes));
    const order: Order = {
      id: orderId,
      orderNo: `ND${formatOrderDateTime(new Date()).replace(orderNoUnsafeCharacterPattern, "")}${String(Math.floor(Math.random() * 900) + 100)}`,
      mode: fulfillmentMode,
      status: autoConfirmed ? "confirmed" : "pending",
      customerId: currentCustomer.id,
      customerName: currentCustomer.name,
      itemName: `${service.name} · ${selectedPackage.name}`,
      storeName: fulfillmentMode === "store" ? selectedStore?.name : undefined,
      technicianName: selectedTechnician.name,
      city: "东京",
      area: fulfillmentMode === "store" ? selectedStore?.area ?? "东京" : selectedTechnician.serviceAreas[0] ?? service.serviceAreas[0] ?? "东京",
      amount: totalPrice,
      paymentStatus,
      paymentMethod,
      autoConfirmed,
      expectedArrivalAt,
      bookedAt: formatOrderDateTime(bookingDateTime),
      createdAt: formatOrderDateTime(new Date()),
      source: "app",
      remark: [bookingRemark.trim(), fulfillmentMode === "store" ? selectedSeat?.name : manualAddressDetail, selectedPeople]
        .filter(Boolean)
        .join(" / ")
    };

    return addUserOrder(order);
  };

  const createApiBackedOrder = async () => {
    if (!apiServiceId) {
      return false;
    }

    const selectedApiSlot = findApiSlotForSelection(apiAvailabilitySlots, selectedBookingDate, activeSlot);

    if (!selectedApiSlot) {
      setExpandedSection("time");
      setActiveTimeEditor("time");
      setCheckoutDialog({
        kind: "failure",
        message: apiAvailabilityFailed
          ? "预约失败：可用时段接口暂不可用，请稍后重试。"
          : "预约失败：当前时间已不可预约，请重新选择可预约时间。"
      });
      return true;
    }

    setCreatingApiBooking(true);
    try {
      const apiOrder = await bookingApi.createBooking({
        serviceId: apiServiceId,
        scheduleSlotId: selectedApiSlot.id,
        fulfillmentMode,
        note: [bookingRemark.trim(), fulfillmentMode === "store" ? selectedSeat?.name : manualAddressDetail, selectedPeople]
          .filter(Boolean)
          .join(" / ")
      });
      const order = addUserOrder(mapBookingOrderToDomainOrder(apiOrder));
      openCreatedOrder(order, "预约成功，已进入订单详情。");
    } catch {
      setExpandedSection("time");
      setActiveTimeEditor("time");
      setCheckoutDialog({ kind: "failure", message: "预约失败：当前时间已被预约，请重新选择。" });
    } finally {
      setCreatingApiBooking(false);
    }

    return true;
  };

  const openCreatedOrder = (order: Order, notice: string) => {
    if (needoPostId) {
      confirmNeedoReverseBooking("user", needoPostId);
    }

    navigate(`/orders/${order.id}`, { replace: true, state: { notice } });
  };

  const createWalletPaidOrder = (paymentMethod: ServicePaymentMethod, rechargeBonus = 0) => {
    updateCustomerEntity(currentCustomer.id, (customer) => ({
      points: Math.max(0, (customer.points ?? 0) + rechargeBonus - totalPrice)
    }));

    const order = createOrder(paymentMethod, paymentMethod === "prepay" ? "depositPaid" : "paid");
    openCreatedOrder(order, "预约成功，已使用钱包点数完成本次预付。");
  };

  const handleConfirmBooking = async () => {
    if (creatingApiBooking) {
      return;
    }

    if (fulfillmentMode === "home" && !manualAddressDetail.trim()) {
      setExpandedSection("location");
      setCheckoutDialog({ kind: "failure", message: "请先填写完整上门地址，再提交预约。" });
      return;
    }

    if (!hasBookableSlot) {
      setExpandedSection("time");
      setActiveTimeEditor("time");
      setCheckoutDialog({
        kind: "failure",
        message: selectedStoreAlwaysBookable
          ? "预约失败：请选择有效预约时间。"
          : "预约失败：当前时间不在 confirmed slots 最终可预约时间内，请重新选择可预约时间。"
      });
      return;
    }

    if (fulfillmentMode === "store" && selectedStore?.openStatus === "closed") {
      setCheckoutDialog({ kind: "failure", message: "预约失败：当前门店暂停接收预约，请重新选择时间或联系商户。" });
      return;
    }

    if (await createApiBackedOrder()) {
      return;
    }

    if (fulfillmentMode === "store") {
      const order = createOrder(platformPrepayMethod ?? "offline", platformPrepayMethod === "prepay" ? "depositPaid" : "unpaid");
      openCreatedOrder(order, "预约成功，已进入订单详情。");
      return;
    }

    if (directOnlinePaymentMethod) {
      const order = createOrder(directOnlinePaymentMethod, "unpaid");
      openCreatedOrder(order, `预约已提交，服务前需要先通过 ${paymentMethodLabels[directOnlinePaymentMethod]} 支付给对方。`);
      return;
    }

    if (platformPrepayMethod) {
      const balance = currentCustomer.points ?? 0;

      if (balance < totalPrice) {
        setCheckoutDialog({
          kind: "insufficient",
          balance,
          deficit: totalPrice - balance,
          required: totalPrice,
          paymentMethod: platformPrepayMethod
        });
        return;
      }

      createWalletPaidOrder(platformPrepayMethod);
      return;
    }

    const order = createOrder(counterpartyPaymentMethods[0] ?? "offline", "unpaid");
    openCreatedOrder(order, "预约成功，付款方式将在服务前与对方确认。");
  };

  return (
    <PageScaffold contentClassName="space-y-4 pb-36 pt-[calc(env(safe-area-inset-top,0px)+148px)] sm:pt-[calc(env(safe-area-inset-top,0px)+156px)]" navItems={[]}>
      <AppTopBar
        fixed
        footer={
          <div ref={progressBarRef} className="px-1">
            <div className="flex items-center">
              {progressSteps.map((step, index) => (
                <CheckoutProgressArrow
                  active={index <= activeProgressStep}
                  first={index === 0}
                  icon={step.icon}
                  key={`${step.label}-${index}`}
                  label={step.label}
                  onClick={() => jumpToSection(index)}
                />
              ))}
            </div>
          </div>
        }
        footerClassName="mt-3"
        info="预约已统一为真实新页面流程"
        title="确认预约"
      />

      <div className="space-y-3">
        <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[0] = node)}>
          <p className="px-1 text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--client-primary)]">套餐</p>
          <button
            className="w-full rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-3 text-left shadow-[0_14px_28px_rgba(0,0,0,0.06)]"
            onClick={() => toggleSection("package")}
            type="button"
          >
            <span className="relative block h-[138px] w-full overflow-hidden rounded-[24px] bg-black">
              <img alt={service.name} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(service.cover)} />
            </span>
            <div className="mt-3 flex flex-wrap gap-2">
              {service.tags.slice(0, 2).map((tag) => (
                <CheckoutInlineTag
                  className="rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-3 py-1 text-[11px] font-black text-[color:var(--client-muted)]"
                  key={tag}
                >
                  {tag}
                </CheckoutInlineTag>
              ))}
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[18px] font-black leading-[1.18] tracking-[-0.03em] text-[color:var(--client-text)]">{service.name}</p>
                <p className="mt-1.5 text-sm leading-6 text-[color:var(--client-muted)]">
                  {selectedPackage.description || service.summary}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-[22px] font-black tracking-[-0.04em] text-[color:var(--client-primary)]">{yen(selectedPackage.price)}</span>
              <span className="text-sm font-semibold text-[color:var(--client-muted)]">{selectedPackage.durationMinutes} 分钟</span>
              <span className="text-sm font-semibold text-[color:var(--client-muted)]">{selectedStore?.area ?? service.serviceAreas[0] ?? "东京"}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedPackage.includes.slice(0, 4).map((item) => (
                <CheckoutInlineTag
                  className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-3 py-1 text-[11px] font-black text-[color:var(--client-primary)]"
                  key={item}
                >
                  {item}
                </CheckoutInlineTag>
              ))}
            </div>
            <div className="mt-3 border-t border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] pt-3">
              <p className="text-xs font-semibold text-[color:var(--client-muted)]">{selectedPackage.name}</p>
            </div>
          </button>
          {expandedSection === "package" ? (
            <SurfacePanel className="space-y-2 p-3">
              {service.packages.map((pkg) => {
                const active = selectedPackage.id === pkg.id;

                return (
                  <button
                    className={`w-full rounded-[18px] border px-3 py-3 text-left transition ${
                      active
                        ? "border-[color:color-mix(in_srgb,var(--client-primary)_28%,transparent)] bg-[color:var(--client-primary-soft)]"
                        : "border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]"
                    }`}
                    key={pkg.id}
                    onClick={() => {
                      setActivePackage(pkg.id);
                      closeSectionEdit();
                    }}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-[color:var(--client-text)]">{pkg.name}</p>
                        <p className="mt-1 text-xs text-[color:var(--client-muted)]">{pkg.durationMinutes} 分钟 · {pkg.description}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {pkg.includes.slice(0, 4).map((item) => (
                            <CheckoutInlineTag
                              className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-2 py-0.5 text-[10px] font-black text-[color:var(--client-primary)]"
                              key={item}
                            >
                              {item}
                            </CheckoutInlineTag>
                          ))}
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-black text-[color:var(--client-primary)]">{yen(pkg.price)}</span>
                    </div>
                  </button>
                );
              })}
            </SurfacePanel>
          ) : null}
        </div>

        <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[1] = node)}>
          <p className="px-1 text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--client-primary)]">服务方式</p>
          <div className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-3 shadow-[0_14px_28px_rgba(0,0,0,0.06)]">
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "store" as const, label: "到店服务" },
                { key: "home" as const, label: "上门服务" }
              ].map((item) => {
                const active = fulfillmentMode === item.key;

                return (
                  <button
                    className={cn(
                      "rounded-full px-4 py-3 text-sm font-black transition",
                      active
                        ? "bg-[color:var(--client-primary)] text-[#090806]"
                        : "bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] text-[color:var(--client-muted)]"
                    )}
                    key={item.key}
                    onClick={() => handleFulfillmentModeChange(item.key)}
                    type="button"
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <button className="mt-3 w-full text-left" onClick={() => toggleSection("fulfillment")} type="button">
              {fulfillmentMode === "store" ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-[17px] font-black tracking-[-0.03em] text-[color:var(--client-text)]">到店服务</p>
                    <p className="mt-1 text-sm leading-6 text-[color:var(--client-muted)]">
                      已选坐席：{selectedSeat?.name ?? "请先选择坐席"} · {selectedStore?.name ?? stores[0]?.name ?? "门店"}
                    </p>
                  </div>
                  <div className="rounded-[22px] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] p-3">
                    <p className="text-sm font-black text-[color:var(--client-text)]">{selectedSeat?.name ?? "请先选择坐席"}</p>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">{selectedSeat?.detail}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(selectedSeat?.tags ?? []).map((tag) => (
                        <CheckoutInlineTag
                          className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-3 py-1 text-[11px] font-black text-[color:var(--client-primary)]"
                          key={tag}
                        >
                          {tag}
                        </CheckoutInlineTag>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-[17px] font-black tracking-[-0.03em] text-[color:var(--client-text)]">上门服务</p>
                    <p className="mt-1 text-sm leading-6 text-[color:var(--client-muted)]">
                      技师将从 {selectedTechnician.serviceAreas[0] ?? "当前服务区"} 出发，系统会按地址自动估算行程。
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-[22px] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] p-3">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[color:var(--client-primary)]">预计路程</p>
                      <p className="mt-2 text-lg font-black text-[color:var(--client-text)]">{travelEstimateMinutes} 分钟</p>
                    </div>
                    <div className="rounded-[22px] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] p-3">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[color:var(--client-primary)]">预估路费</p>
                      <p className="mt-2 text-lg font-black text-[color:var(--client-text)]">{yen(travelEstimateFee)}</p>
                    </div>
                  </div>
                </div>
              )}
            </button>
          </div>
          {expandedSection === "fulfillment" ? (
            <SurfacePanel className="space-y-2 p-3">
              {fulfillmentMode === "store" ? (
                seatOptions.map((seat) => {
                  const active = seat.id === selectedSeatId;

                  return (
                    <button
                      className={`w-full rounded-[22px] border px-3 py-3 text-left transition ${
                        active
                          ? "border-[color:color-mix(in_srgb,var(--client-primary)_28%,transparent)] bg-[color:var(--client-primary-soft)]"
                          : "border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]"
                      }`}
                      key={seat.id}
                      onClick={() => {
                        setSelectedSeatId(seat.id);
                        closeSectionEdit();
                      }}
                      type="button"
                    >
                      <div className="flex items-start gap-3">
                        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[18px] bg-black">
                          <img alt={seat.name} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getGeneratedImageThumbnailUrl(seat.cover)} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-[color:var(--client-text)]">{seat.name}</p>
                          <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">{seat.detail}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {seat.tags.map((tag) => (
                              <CheckoutInlineTag
                                className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-2.5 py-1 text-[10px] font-black text-[color:var(--client-primary)]"
                                key={tag}
                              >
                                {tag}
                              </CheckoutInlineTag>
                            ))}
                          </div>
                        </div>
                        <span className="shrink-0 text-[11px] font-black text-[color:var(--client-muted)]">{active ? "已选" : seat.status}</span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-[22px] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] p-4">
                  <p className="text-sm font-black text-[color:var(--client-text)]">系统会在你填写完整上门地址后，自动更新预计路程和路费。</p>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">当前按最近服务区预估为 {travelEstimateMinutes} 分钟，路费约 {yen(travelEstimateFee)}。</p>
                </div>
              )}
            </SurfacePanel>
          ) : null}
        </div>

        <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[2] = node)}>
          <p className="px-1 text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--client-primary)]">时间</p>
          <div className="w-full rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-3 text-left shadow-[0_14px_28px_rgba(0,0,0,0.06)]">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--client-primary)]">预约时间</p>
              <div className="mt-3 grid gap-2">
                <button
                  className={cn(
                    "rounded-[18px] border px-3 py-3 text-left transition",
                    expandedSection === "time" && activeTimeEditor === "date"
                      ? "border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] bg-[color:var(--client-primary-soft)]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]"
                  )}
                  onClick={() => toggleTimeEditor("date")}
                  type="button"
                >
                  <span className="text-xs font-black text-[color:var(--client-muted)]">日期</span>
                  <span className="mt-1 block text-[17px] font-black tracking-[-0.02em] text-[color:var(--client-text)]">{bookingDateLabel}</span>
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={cn(
                      "rounded-[18px] border px-3 py-3 text-left transition",
                      expandedSection === "time" && activeTimeEditor === "time"
                        ? "border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] bg-[color:var(--client-primary-soft)]"
                        : "border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]"
                    )}
                    onClick={() => toggleTimeEditor("time")}
                    type="button"
                  >
                    <span className="text-xs font-black text-[color:var(--client-muted)]">时间</span>
                    <span className="mt-1 block text-[22px] font-black tracking-[-0.04em] text-[color:var(--client-primary)]">{hasBookableSlot ? extractTimePart(activeSlot) : "无可约"}</span>
                    <span className="mt-1 block text-[11px] font-semibold text-[color:var(--client-muted)]">{timeHelperLabel}</span>
                  </button>
                  <button
                    className={cn(
                      "rounded-[18px] border px-3 py-3 text-left transition",
                      expandedSection === "time" && activeTimeEditor === "people"
                        ? "border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] bg-[color:var(--client-primary-soft)]"
                        : "border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]"
                    )}
                    onClick={() => toggleTimeEditor("people")}
                    type="button"
                  >
                    <span className="text-xs font-black text-[color:var(--client-muted)]">人数</span>
                    <span className="mt-1 block text-[22px] font-black tracking-[-0.04em] text-[color:var(--client-text)]">{selectedPeople}</span>
                  </button>
                </div>
                <p className="text-xs leading-5 text-[color:var(--client-muted)]">{hasBookableSlot ? arrivalNotice : "当前日期没有最终确认后的可预约时间，请重新选择日期。"}</p>
              </div>
            </div>
            <div className="mt-3 border-t border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] pt-3">
              <p className="text-xs font-semibold text-[color:var(--client-muted)]">{bookingDateTimeLabel} · {selectedPeople}</p>
            </div>
          </div>
          {expandedSection === "time" && activeTimeEditor ? (
            <SurfacePanel className="p-3">
              {activeTimeEditor === "date" ? (
                <CheckoutDatePicker
                  getAvailableTimes={getCheckoutAvailableTimes}
                  minDate={bookingBaseDate}
                  onClose={closeSectionEdit}
                  onSelectDate={setSelectedBookingDate}
                  onTimeChange={setActiveSlot}
                  selectedDate={selectedBookingDate}
                  time={activeSlot}
                />
              ) : null}
              {activeTimeEditor === "time" ? (
                <CheckoutTimePicker
                  onClose={closeSectionEdit}
                  onTimeChange={setActiveSlot}
                  timeOptions={availableTimesForSelectedDate}
                  time={activeSlot}
                />
              ) : null}
              {activeTimeEditor === "people" ? (
                <CheckoutPeoplePicker onClose={closeSectionEdit} onPeopleChange={setSelectedPeople} people={selectedPeople} />
              ) : null}
            </SurfacePanel>
          ) : null}
        </div>

        <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[3] = node)}>
          <p className="px-1 text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--client-primary)]">地址</p>
          <div className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-3 shadow-[0_14px_28px_rgba(0,0,0,0.06)]">
            {locationMapQuery.trim() ? (
              <div className="relative overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[#101318]">
                <iframe
                  aria-hidden="true"
                  className="pointer-events-none h-[136px] w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={googleMapsEmbedUrl}
                  title="Google 地图缩略图"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/55 via-black/15 to-transparent px-3 pb-3 pt-8">
                  <span className="rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/92">
                    Google Maps
                  </span>
                  <span className="text-[10px] font-semibold text-white/82">{fulfillmentMode === "store" ? "门店位置预览" : "上门地址预览"}</span>
                </div>
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-8 text-center">
                <p className="text-sm font-black text-[color:var(--client-text)]">填写地址后会显示地图缩略图</p>
                <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">方便确认定位、路线和复制地址。</p>
              </div>
            )}
            <button className="w-full text-left" onClick={() => toggleSection("location")} type="button">
              <div className="mt-3 min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-black text-[color:var(--client-text)]">{locationAddressLine}</p>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">{locationMetaLine}</p>
                </div>
              </div>
            </button>
            <div className="mt-3 flex gap-2">
              <button
                className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-2 text-xs font-black text-[color:var(--client-primary)] disabled:opacity-45"
                disabled={!locationMapQuery.trim()}
                onClick={openGoogleMaps}
                type="button"
              >
                Google 地图
              </button>
              <button
                className="rounded-full bg-[color:color-mix(in_srgb,var(--client-surface)_70%,transparent)] px-3 py-2 text-xs font-black text-[color:var(--client-text)] disabled:opacity-45"
                disabled={!locationCopyText.trim()}
                onClick={() => {
                  void copyAddress();
                }}
                type="button"
              >
                复制地址
              </button>
              {locationFeedback ? <span className="self-center text-[11px] font-bold text-[color:var(--client-muted)]">{locationFeedback}</span> : null}
            </div>
          </div>
          {expandedSection === "location" ? (
            <SurfacePanel className="space-y-2 p-3">
              {fulfillmentMode === "store"
                ? stores.slice(0, 3).map((item) => {
                    const active = selectedStore?.id === item.id;

                    return (
                      <button
                        className={`w-full rounded-[18px] border px-3 py-3 text-left transition ${
                          active
                            ? "border-[color:color-mix(in_srgb,var(--client-primary)_28%,transparent)] bg-[color:var(--client-primary-soft)]"
                            : "border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]"
                        }`}
                        key={item.id}
                        onClick={() => {
                          setSelectedStoreId(item.id);
                          closeSectionEdit();
                        }}
                        type="button"
                      >
                        <p className="text-sm font-black text-[color:var(--client-text)]">{item.address}</p>
                        <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">{item.name} · {item.area}</p>
                      </button>
                    );
                  })
                : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {homeAddressOptions.map((item) => {
                        const active = selectedAddress.id === item.id && manualAddressDetail === item.detail;

                        return (
                          <button
                            className={cn(
                              "max-w-full whitespace-normal break-words rounded-full px-3 py-1.5 text-left text-[11px] font-black leading-tight transition [overflow-wrap:anywhere]",
                              active
                                ? "bg-[color:var(--client-primary)] text-[#090806]"
                                : "bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] text-[color:var(--client-muted)]"
                            )}
                            key={item.id}
                            onClick={() => applyHomeAddressTemplate(item.id)}
                            type="button"
                          >
                            {item.title}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      className="w-full rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-3 text-sm outline-none"
                      onChange={(event) => setManualAddressTitle(event.target.value)}
                      placeholder="地址名称，例如：新宿公寓 / 公司前台"
                      value={manualAddressTitle}
                    />
                    <textarea
                      className="min-h-[96px] w-full rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-3 text-sm leading-6 outline-none"
                      onChange={(event) => setManualAddressDetail(event.target.value)}
                      placeholder="请输入详细上门地址"
                      value={manualAddressDetail}
                    />
                    <input
                      className="w-full rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-3 text-sm outline-none"
                      onChange={(event) => setManualAddressContact(event.target.value)}
                      placeholder="联系人 / 电话"
                      value={manualAddressContact}
                    />
                  </div>
                )}
            </SurfacePanel>
          ) : null}
        </div>

        <div className="scroll-mt-[170px] space-y-2" ref={(node) => void (sectionRefs.current[4] = node)}>
          <p className="px-1 text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--client-primary)]">技师</p>
          <button
            className="w-full rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 text-left shadow-[0_14px_28px_rgba(0,0,0,0.06)]"
            onClick={() => toggleSection("technician")}
            type="button"
          >
            <div className="grid grid-cols-[92px_minmax(0,1fr)_16px] gap-4">
              <AvatarImage alt={selectedTechnician.name} className="h-[92px] w-[92px] rounded-[24px]" src={selectedTechnician.avatar} />
              <div className="min-w-0">
                <p className="truncate text-[18px] font-black leading-none tracking-[-0.03em] text-[color:var(--client-text)]">
                  {selectedTechnician.nickname?.trim() || selectedTechnician.name}
                </p>
                <p className="mt-2 text-[13px] text-[color:var(--client-muted)]">
                  {selectedTechnician.serviceAreas[0] ?? "东京"} · {getTechnicianAvailabilityLabel(selectedTechnician.status)}
                </p>
                <p className="mt-3 text-[13px] font-black text-[color:var(--client-text)]">
                  ★ {selectedTechnician.rating.toFixed(1)} · {selectedTechnician.reviewCount} 评价
                </p>
                <p className="mt-2 line-clamp-1 text-sm leading-6 text-[color:var(--client-muted)]">
                  {selectedTechnician.skills.slice(0, 3).join(" / ")}
                </p>
                <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                  <div className="min-w-0 flex flex-wrap gap-2">
                    {selectedTechnician.skills.slice(0, 2).map((tag) => (
                      <CheckoutInlineTag
                        className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary)]"
                        key={tag}
                      >
                        {tag}
                      </CheckoutInlineTag>
                    ))}
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-[14px] font-black",
                        selectedTechnician.status === "available" ? "text-[color:var(--client-primary)]" : "text-[color:var(--client-text)]"
                      )}
                    >
                      {getTechnicianAvailabilityLabel(selectedTechnician.status)}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--client-muted)]">{selectedTechnician.acceptRate}% 接单率</p>
                  </div>
                </div>
              </div>
              <svg aria-hidden="true" className="mt-1 h-4 w-4 text-[color:var(--client-muted)]" fill="none" viewBox="0 0 24 24">
                <path d="m9 6 6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
              </svg>
            </div>
          </button>
          {expandedSection === "technician" ? (
            <SurfacePanel className="space-y-2 p-3">
              {technicians.map((tech) => {
                const active = activeTech === tech.id;

                return (
                  <button
                    className={
                      `w-full rounded-[24px] border p-4 text-left transition ${
                        active
                          ? "border-[color:color-mix(in_srgb,var(--client-primary)_28%,transparent)] bg-[color:var(--client-primary-soft)]"
                          : "border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]"
                      }`
                    }
                    key={tech.id}
                    onClick={() => {
                      setActiveTech(tech.id);
                      closeSectionEdit();
                    }}
                    type="button"
                  >
                    <div className="grid grid-cols-[84px_minmax(0,1fr)_16px] gap-4">
                      <AvatarImage alt={tech.name} className="h-[84px] w-[84px] rounded-[22px]" src={tech.avatar} />
                      <div className="min-w-0">
                        <p className="truncate text-[17px] font-black leading-none tracking-[-0.03em] text-[color:var(--client-text)]">
                          {tech.nickname?.trim() || tech.name}
                        </p>
                        <p className="mt-2 text-[13px] text-[color:var(--client-muted)]">
                          {tech.serviceAreas[0] ?? "东京"} · {getTechnicianAvailabilityLabel(tech.status)}
                        </p>
                        <p className="mt-3 text-[13px] font-black text-[color:var(--client-text)]">★ {tech.rating.toFixed(1)} · {tech.reviewCount} 评价</p>
                        <p className="mt-2 line-clamp-1 text-sm leading-6 text-[color:var(--client-muted)]">{tech.skills.slice(0, 3).join(" / ")}</p>
                        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                          <div className="min-w-0 flex flex-wrap gap-2">
                            {tech.skills.slice(0, 2).map((tag) => (
                              <CheckoutInlineTag
                                className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary)]"
                                key={tag}
                              >
                                {tag}
                              </CheckoutInlineTag>
                            ))}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={cn("text-[14px] font-black", tech.status === "available" ? "text-[color:var(--client-primary)]" : "text-[color:var(--client-text)]")}>
                              {active ? "已选" : getTechnicianAvailabilityLabel(tech.status)}
                            </p>
                            <p className="mt-1 text-xs text-[color:var(--client-muted)]">{tech.acceptRate}% 接单率</p>
                          </div>
                        </div>
                      </div>
                      <svg aria-hidden="true" className="mt-1 h-4 w-4 text-[color:var(--client-muted)]" fill="none" viewBox="0 0 24 24">
                        <path d="m9 6 6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </SurfacePanel>
          ) : null}
        </div>

        <div className="scroll-mt-[170px] space-y-2 pt-1" ref={(node) => void (sectionRefs.current[5] = node)}>
          <p className="px-1 text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--client-primary)]">备注</p>
          <div
            className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-3 shadow-[0_14px_28px_rgba(0,0,0,0.06)]"
            onClick={() => remarkInputRef.current?.focus()}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black text-[color:var(--client-text)]">特殊需求</p>
              <p className="text-xs font-semibold text-[color:var(--client-muted)]">{bookingRemark.trim() ? `已填写 ${bookingRemark.trim().length} 字` : "可选填写"}</p>
            </div>
            <textarea
              className="min-h-[156px] w-full rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 py-3.5 text-sm leading-6 outline-none"
              onChange={(event) => setBookingRemark(event.target.value)}
              placeholder="填写特殊需求：忌口、靠窗座位、门禁、停车、语言偏好等"
              ref={remarkInputRef}
              value={bookingRemark}
            />
            <div className="flex flex-wrap gap-2">
              {remarkSuggestions.map((item) => (
                <button
                  className="max-w-full whitespace-normal break-words rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-3 py-1.5 text-left text-[11px] font-black leading-tight text-[color:var(--client-primary)] [overflow-wrap:anywhere]"
                  key={item}
                  onClick={() => appendRemarkSuggestion(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <p className="px-1 text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--client-primary)]">注意事项</p>
          <SurfacePanel className="space-y-3 p-4">
            <div className="space-y-2">
              {noticeItems.map((item, index) => (
                <div className="flex items-start gap-3" key={`${item}-${index}`}>
                  <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--client-primary)]" />
                  <p className="text-sm leading-6 text-[color:var(--client-muted)]">{item}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] pt-3">
              <p className="text-sm font-black text-[color:var(--client-text)]">取消政策</p>
              <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">如果取消本预约，会收取下述费用</p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[color:var(--client-muted)]">当日取消（无联系）：</span>
                  <strong className="shrink-0 text-[color:var(--client-text)]">
                    {formatYenText(sameDayNoContactCancellationFee)}（{selectedPeople}）
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[color:var(--client-muted)]">当日取消（有联系）：</span>
                  <strong className="shrink-0 text-[color:var(--client-text)]">
                    {formatYenText(sameDayContactCancellationFee)}（{selectedPeople}）
                  </strong>
                </div>
              </div>
            </div>

            <div className="border-t border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] pt-3">
              <p className="text-sm font-black text-[color:var(--client-text)]">NDP（NeeDoPoint）</p>
              <p className="mt-1 text-sm font-black text-[color:var(--client-primary)]">0~{ndpRewardMax.toLocaleString("ja-JP")}NDP获得</p>
              <p className="mt-2 text-xs leading-5 text-[color:var(--client-muted)]">
                *被赋予的NDP的数量以及种类，会因为预约的条件以及商户/技师的支付情况有所变动。
                <button
                  className="inline-flex align-baseline font-black text-[color:var(--client-primary)] underline decoration-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] underline-offset-4"
                  onClick={() => navigate("/me/settings/ndp-guide")}
                  type="button"
                >
                  详细请点这里
                </button>
                确认。
              </p>
            </div>
          </SurfacePanel>
        </div>
      </div>

      <ClientEdgeMask
        edge="bottom"
        style={{
          "--client-edge-mask-bottom-height": "calc(env(safe-area-inset-bottom,0px) + 10.25rem)",
          "--client-edge-mask-bottom-mid-opacity": "0.86",
          "--client-edge-mask-bottom-mid-stop": "44%",
          "--client-edge-mask-bottom-strong-opacity": "1",
          "--client-edge-mask-bottom-strong-stop": "72%"
        } as CSSProperties}
      />
      <footer className="safe-nav-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[880px] px-4 pb-[calc(max(env(safe-area-inset-bottom),12px)+10px)] pt-14">
        <div className="pointer-events-auto space-y-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black text-[color:color-mix(in_srgb,var(--client-text)_72%,var(--client-muted)_28%)]">应付金额</p>
              <strong className="mt-1 block text-[26px] font-black leading-none text-[color:var(--client-primary)]">{yen(totalPrice)}</strong>
            </div>
            <div className="flex max-w-[54vw] flex-wrap justify-end gap-2">
              {paymentTags.map((tag) => (
                <CheckoutInlineTag
                  className="rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] px-2.5 py-1 text-[10px] font-black text-[color:var(--client-text)] backdrop-blur"
                  key={tag}
                >
                  {tag}
                </CheckoutInlineTag>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2.5">
            <SecondaryButton className="w-full" to={contactPath}>
              联系
            </SecondaryButton>
            <PrimaryButton className="w-full" onClick={handleConfirmBooking}>
              确定预约
            </PrimaryButton>
          </div>
        </div>
      </footer>

      {checkoutDialog ? (
        <div
          className="fixed inset-x-0 bottom-0 z-[120] flex items-end bg-black/58 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] backdrop-blur-md backdrop-saturate-75 sm:items-center sm:justify-center sm:pb-0"
          style={{ top: "calc(-16px - env(safe-area-inset-top,0px))" }}
        >
          <div className="w-full max-w-md rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:var(--client-surface)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
            {checkoutDialog.kind === "insufficient" ? (
              <>
                <p className="text-[18px] font-black text-[color:var(--client-text)]">余额不足，需要充值</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--client-muted)]">
                  本次需要 {yen(checkoutDialog.required)} 点数，当前余额 {yen(checkoutDialog.balance)}，还差 {yen(checkoutDialog.deficit)}。是否充值后继续预约？
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <SecondaryButton className="w-full" onClick={() => setCheckoutDialog(null)}>
                    放弃
                  </SecondaryButton>
                  <PrimaryButton
                    className="w-full"
                    onClick={() => {
                      const rechargeBonus = checkoutDialog.deficit + 2000;
                      const method = checkoutDialog.paymentMethod;

                      setCheckoutDialog(null);
                      createWalletPaidOrder(method, rechargeBonus);
                    }}
                  >
                    充值
                  </PrimaryButton>
                </div>
              </>
            ) : (
              <>
                <p className="text-[18px] font-black text-[color:var(--client-text)]">预约失败</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--client-muted)]">{checkoutDialog.message}</p>
                <div className="mt-4">
                  <PrimaryButton className="w-full" onClick={() => setCheckoutDialog(null)}>
                    我知道了
                  </PrimaryButton>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </PageScaffold>
  );
}
