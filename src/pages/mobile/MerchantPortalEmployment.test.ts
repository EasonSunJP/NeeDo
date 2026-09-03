import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MerchantPortalPage.tsx", import.meta.url), "utf8");

describe("MerchantPortal formal employment data", () => {
  it("joins persisted technician employment types from the protected merchant API", () => {
    expect(source).toContain('backofficeRealDataApi.technicians("merchant-admin"');
    expect(source).toContain("toMerchantStaffEmploymentType");
    expect(source).toContain("formalStaffById");
    expect(source).toContain("无法读取正式员工数据");
  });

  it("does not infer employment from identity labels or array position", () => {
    expect(source).not.toContain("index % 4");
    expect(source).not.toContain("getMerchantStaffEmploymentType(technician, index)");
  });

  it("renders every staff role as a full-width top-level section", () => {
    const roleSectionSource = source.slice(
      source.indexOf("function MerchantStaffRoleSection"),
      source.indexOf("function getMerchantOrderProvider")
    );
    const staffPanelSource = source.slice(
      source.indexOf('{activeView === "staff" && ('),
      source.indexOf('{activeView === "schedule" && (')
    );

    expect(staffPanelSource).not.toContain('title="职务与员工"');
    expect(roleSectionSource).toContain("rounded-[28px]");
    expect(roleSectionSource).toContain("<h2");
    expect(roleSectionSource).toContain("{group.count} 人");
    expect(roleSectionSource).not.toContain("rounded-[24px]");
  });
});
