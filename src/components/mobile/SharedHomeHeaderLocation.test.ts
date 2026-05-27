import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import merchantSource from "../../pages/mobile/MerchantPortalPage.tsx?raw";
import technicianSource from "../../pages/mobile/TechnicianPortalPage.tsx?raw";
import userSource from "../../pages/user/HomePage.tsx?raw";
import userScheduleSource from "../../pages/user/UserSchedulePage.tsx?raw";
import userScheduleDetailSource from "../../pages/user/UserTechnicianScheduleDetailPage.tsx?raw";

describe("SharedHomeHeader location entry", () => {
  it("routes user, merchant, and technician location controls to the shared service-range page", () => {
    expect(userSource).toContain('locationTo="/me/settings/service-range"');
    expect(userScheduleSource).toContain('locationTo="/me/settings/service-range"');
    expect(userScheduleDetailSource).toContain('locationTo="/me/settings/service-range"');
    expect(merchantSource).toContain('locationTo="/merchant/settings/service-range"');
    expect(technicianSource).toContain('locationTo="/technician/settings/service-range"');
    expect(appSource).toContain('path="/merchant/settings/service-range"');
  });

  it("does not keep a page-local location picker on the user home page", () => {
    expect(userSource).not.toContain("LocationSheet");
    expect(userSource).not.toContain("setLocationSheetOpen");
    expect(userSource).not.toContain("selectHomeLocationManually");
  });
});
