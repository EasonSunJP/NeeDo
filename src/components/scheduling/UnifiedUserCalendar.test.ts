import { describe, expect, it } from "vitest";
import source from "./UnifiedUserCalendar.tsx?raw";

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
    expect(source).toContain("<CalendarEventEditorPage");
    expect(source).not.toContain("function EditorSheet");
    expect(source).not.toContain("<BottomSheet onClose={onClose} title={draft.id ? \"编辑行程\" : \"新增行程\"}>");
  });
});
