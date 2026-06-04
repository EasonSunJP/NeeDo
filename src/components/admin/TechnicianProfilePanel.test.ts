import { describe, expect, it } from "vitest";
import profilePanelSource from "./TechnicianProfilePanel.tsx?raw";

describe("TechnicianProfilePanel merchant schedule surface", () => {
  it("uses the technician personal calendar with search for merchant staff details", () => {
    expect(profilePanelSource).toContain("function MerchantStaffPersonalCalendar");
    expect(profilePanelSource).toContain("ScheduleSearchField");
    expect(profilePanelSource).toContain("<UnifiedUserCalendar");
    expect(profilePanelSource).toContain('currentTechnician={technician}');
    expect(profilePanelSource).toContain('scope="technician"');
    expect(profilePanelSource).toContain('displayMode="parallel"');
    expect(profilePanelSource).toContain("searchQuery={scheduleSearchQuery}");
    expect(profilePanelSource).toContain("<MerchantStaffPersonalCalendar");
    expect(profilePanelSource).not.toContain("<ScheduleGrid");
    expect(profilePanelSource).not.toContain("getDispatchScheduleGrid");
    expect(profilePanelSource).not.toContain('periodCellVariant="calendarSummary"');
    expect(profilePanelSource).not.toContain("<MonthlyScheduleCalendar compact schedules={staffSchedules} technicians={[technician]} />");
  });

  it("uses compact merchant-mobile tabs and editable management sections", () => {
    expect(profilePanelSource).toContain("function StaffDetailTabBar");
    expect(profilePanelSource).toContain("function StaffDetailFloatingTabs");
    expect(profilePanelSource).toContain("client-bottom-nav");
    expect(profilePanelSource).toContain("client-liquid-glass-nav");
    expect(profilePanelSource).toContain("data-client-bottom-nav-panel");
    expect(profilePanelSource).toContain("<AppIcon");
    expect(profilePanelSource).toContain("fixed inset-x-0 bottom-0");
    expect(profilePanelSource).toContain("min-w-[560px]");
    expect(profilePanelSource).not.toContain("role=\"tablist\"");
    expect(profilePanelSource).not.toContain("h-9 shrink-0 rounded-[8px] border px-3");
    expect(profilePanelSource).toContain("rounded-[22px]");
    expect(profilePanelSource).toContain("function EditablePanelActions");
    expect(profilePanelSource).toContain("<IconButton");
    expect(profilePanelSource).not.toContain("aria-label={`编辑${label}`} className=");
    expect(profilePanelSource).toContain("const [editingSection, setEditingSection]");
    expect(profilePanelSource).toContain("writeStaffManagementDraft");
    expect(profilePanelSource).toContain("editableAction(\"preferences\", \"偏好信息\")");
    expect(profilePanelSource).toContain("editableAction(\"compensation\", \"薪酬设置\")");
    expect(profilePanelSource).toContain("editableAction(\"permissions\", \"权限设置\")");
  });
});
