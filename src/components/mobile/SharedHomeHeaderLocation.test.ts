import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import merchantSource from "../../pages/mobile/MerchantPortalPage.tsx?raw";
import technicianSource from "../../pages/mobile/TechnicianPortalPage.tsx?raw";
import userSource from "../../pages/user/HomePage.tsx?raw";
import userScheduleSource from "../../pages/user/UserSchedulePage.tsx?raw";
import userScheduleDetailSource from "../../pages/user/UserTechnicianScheduleDetailPage.tsx?raw";

describe("SharedHomeHeader location entry", () => {
  it("links each portal home notification shortcut and compacts the displayed location", () => {
    expect(userSource).toContain('secondaryActionTo="/notifications"');
    expect(merchantSource).toContain('secondaryActionTo="/merchant/notifications"');
    expect(technicianSource).toContain('secondaryActionTo="/technician/notifications"');
    expect(userSource).toContain("compactLocationLabel");
    expect(merchantSource).toContain("compactLocationLabel");
    expect(technicianSource).toContain("compactLocationLabel");
    expect(appSource).toContain('path="/notifications"');
    expect(appSource).toContain('path="/merchant/notifications"');
    expect(appSource).toContain('path="/technician/notifications"');
  });
  it("routes remaining user, merchant, and technician location controls to the shared service-range page", () => {
    expect(userSource).toContain('locationTo="/me/settings/service-range"');
    expect(userScheduleDetailSource).toContain('locationTo="/me/settings/service-range"');
    expect(merchantSource).toContain('locationTo="/merchant/settings/service-range"');
    expect(technicianSource).toContain('locationTo="/technician/settings/service-range"');
    expect(appSource).toContain('path="/merchant/settings/service-range"');
  });

  it("uses the compact shared schedule header instead of a location control on user schedule", () => {
    expect(userScheduleSource).toContain("SchedulePageHeader");
    expect(userScheduleSource).not.toContain("SharedHomeHeader");
    expect(userScheduleSource).not.toContain('locationTo="/me/settings/service-range"');
  });

  it("shows the current service area caption above the technician task header location", () => {
    const taskHeaderStart = technicianSource.indexOf("function TasksView");
    const taskHeaderEnd = technicianSource.indexOf("type TechnicianProfileDraft", taskHeaderStart);
    const taskHeaderSource = technicianSource.slice(taskHeaderStart, taskHeaderEnd);

    expect(taskHeaderSource).toContain("<SharedHomeHeader");
    expect(taskHeaderSource).toContain('locationCaption="当前服务区域"');
    expect(taskHeaderSource).toContain('locationLabel={profile.serviceAreas[0] ?? profile.city ?? "服务区域未设置"}');
    expect(taskHeaderSource).toContain('locationTo="/technician/settings/service-range"');
  });

  it("does not keep a page-local location picker on the user home page", () => {
    expect(userSource).not.toContain("LocationSheet");
    expect(userSource).not.toContain("setLocationSheetOpen");
    expect(userSource).not.toContain("selectHomeLocationManually");
  });
});
