import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("merchant dispatch center production routes", () => {
  it("keeps formal routes off legacy browser-state scheduling workspaces", () => {
    const source = read("./DispatchCenterRoutePages.tsx");

    expect(source).toContain("MerchantScheduleManagementPanel");
    expect(source).not.toContain("DispatchOverviewWorkspace");
    expect(source).not.toContain("MerchantAppointmentScheduleWorkspace");
    expect(source).not.toContain("ManualSchedulingWorkspace");
    expect(source).not.toContain("AutomationWizard");
    expect(source).not.toContain("SmartSchedulingWorkspace");
    expect(source).toContain('to="/merchant-admin/orders"');
  });

  it("uses persisted schedule APIs for list and audited mutations", () => {
    const source = read("./MerchantScheduleManagementPanel.tsx");

    expect(source).toContain('bookingApi.listManagedScheduleSlots("merchant-admin"');
    expect(source).toContain('bookingApi.createManagedScheduleSlot("merchant-admin"');
    expect(source).toContain('bookingApi.updateManagedScheduleSlot("merchant-admin"');
    expect(source).toContain('bookingApi.deleteManagedScheduleSlot("merchant-admin"');
    expect(source).toContain('backofficeRealDataApi.services("merchant-admin"');
    expect(source).toContain('backofficeRealDataApi.technicians("merchant-admin"');
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("data/mock");
  });
});
