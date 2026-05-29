import { describe, expect, it } from "vitest";
// @ts-expect-error -- Vitest runs this source guard in Node; frontend tsconfig intentionally omits Node types.
import { readFileSync } from "node:fs";
import source from "./UnifiedUserCalendar.tsx?raw";

const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

describe("UnifiedUserCalendar event detail page", () => {
  it("shows event creator details, participant list entry, and creator chat wiring", () => {
    expect(source).toContain("UnifiedCalendarEventDetailPage");
    expect(source).toContain("创建者");
    expect(source).toContain("参加者");
    expect(source).toContain("EventParticipantStack");
    expect(source).toContain("联系创建者");
    expect(source).toContain("creatorUserId");
    expect(source).toContain("ensureDirectConversation");
    expect(source).toContain("预约详细确认");
    expect(source).toContain("isNeedoAppointmentEvent");
    expect(source).toContain('activeScope === "user"');
    expect(source).toContain('`/technician/orders/${encodedOrderId}`');
    expect(source).toContain('`/merchant/schedule/arrangements/${encodedOrderId}`');
    expect(source).toContain('const statusOptions = ["已承诺", "辞退", "保留"] as const;');
    expect(source).not.toContain('"未操作"');
    expect(source).not.toContain("grid-cols-4 gap-1.5");
  });
});

describe("UnifiedUserCalendar event editor page", () => {
  it("opens the add and edit itinerary editor as a fullscreen mobile page", () => {
    expect(source).toContain("function CalendarEventEditorPage");
    expect(source).toContain('<MobileFullscreenPage className="z-[130]"');
    expect(source).toContain('closeLabel={`关闭${title}`}');
    expect(source).toContain('info={draft.id ? "编辑完整行程信息" : "新建完整行程信息"}');
    expect(source).toContain("grid grid-cols-[0.9fr_1.1fr] gap-2");
    expect(source).toContain('aria-label={`取消${title}`}');
    expect(source).toContain('aria-label={`完成${title}`}');
    expect(source).toContain("bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,var(--client-bg)_76%,transparent)_42%,var(--client-bg)_100%)]");
    expect(source).toContain("<CalendarEventEditorPage");
    expect(source).not.toContain("function EditorSheet");
    expect(source).not.toContain("border-t border-[color:color-mix(in_srgb,var(--client-line)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_92%,transparent)]");
    expect(source).not.toContain("<BottomSheet onClose={onClose} title={draft.id ? \"编辑行程\" : \"新增行程\"}>");
  });

  it("keeps native date and time inputs constrained on mobile WebKit", () => {
    expect(source).toContain('const temporalInputClass = "calendar-event-editor__temporal-input mt-1 text-center";');
    expect(source).toContain('type="date"');
    expect(source).toContain('type="time"');
    expect(source.match(/cn\(inputClass, temporalInputClass\)/g)).toHaveLength(3);
    expect(styles).toContain(".client-shell .calendar-event-editor__temporal-input");
    expect(styles).toContain(".client-shell .calendar-event-editor__temporal-input::-webkit-date-and-time-value");
    expect(styles).toContain(".client-shell .calendar-event-editor__temporal-input::-webkit-datetime-edit");
    expect(styles).toContain("max-width: 100%;");
    expect(styles).toContain("max-inline-size: 100%;");
    expect(styles).toContain("-webkit-appearance: none;");
  });
});

describe("UnifiedUserCalendar multi-day interactions", () => {
  it("keeps week and three-day timeline creation aligned with the day timeline", () => {
    expect(source).toContain("type MultiDayDraftRange = DraftRange &");
    expect(source).toContain("function UnifiedCalendarMultiDayTimeline");
    expect(source).toContain("onCreate(draftRange.date, minutesToTime(draftRange.start), minutesToTime(draftRange.end));");
    expect(source).toContain('title="新建行程"');
    expect(source).toContain("compact={useCompactDraftAction}");
    expect(source).toContain("onCreate={isMerchantAppointmentStatusMode ? undefined : openCreate}");
  });

  it("centers day, three-day, and week timelines on the first timed event", () => {
    expect(source).toContain("function getTimelineAutoScrollAnchor");
    expect(source).toContain("function scrollTimelineToFirstEvent");
    expect(source).toContain("function useTimelineFirstEventAutoScroll");
    expect(source).toContain("!isFullDayTimelineEvent(event)");
    expect(source).toContain("const dayTimelineAutoScrollKey");
    expect(source).toContain("const multiDayTimelineAutoScrollKey");
    expect(source).toContain("useTimelineFirstEventAutoScroll(dayTimelineAutoScrollKey, timelineAutoScrollAnchor, canvasRef);");
    expect(source).toContain("useTimelineFirstEventAutoScroll(multiDayTimelineAutoScrollKey, timelineAutoScrollAnchor, canvasRef);");
  });

  it("switches date header selections back to the single-day view", () => {
    expect(source).toContain("const openDateInDayView = (date: string) => {");
    expect(source).toContain('setView("day");');
    expect(source).toContain("onSelectDate={openDateInDayView}");
  });

  it("uses the month grid as a drilldown calendar without a lower itinerary list", () => {
    expect(source).toContain('role="button"');
    expect(source).toContain("const selectDate = () => onSelectDate?.(date);");
    expect(source).toContain("onSelectDate(date);");
    expect(source).not.toContain("renderSelectedDateList");
    expect(source).not.toContain("function EventList");
  });

  it("keeps dense timeline and month labels readable in narrow columns", () => {
    expect(source).toContain("letterSpacing: 0");
    expect(source).toContain('textOrientation: "upright"');
    expect(source).toContain('writingMode: "vertical-rl"');
    expect(source).toContain('dense ? "grid place-items-center px-0.5 py-1 text-center text-[8px] leading-[9px]"');
    expect(source).toContain('className="focus-ring block h-[14px] w-full truncate');
    expect(source).not.toContain("break-words");
  });

  it("keeps the customer calendar focused on customer appointments instead of staff shift blocks", () => {
    expect(source).toContain("return bookingEvents;");
    expect(source).toContain(".filter((schedule) => schedule.orderId && customerOrderIds.has(schedule.orderId))");
    expect(source).not.toContain("return [...shiftEvents, ...bookingEvents];");
    expect(source).not.toContain(".filter((schedule) => relevantTechnicianIds.has(schedule.staffId) || (schedule.orderId && customerOrderIds.has(schedule.orderId)))");
  });
});
