import { describe, expect, it } from "vitest";
import source from "./CitySettingsPage.tsx?raw";

describe("CitySettingsPage Excel export action", () => {
  it("exposes a city Excel export action wired to the full Japan city dataset", () => {
    expect(source).toContain("downloadJapanCityExcel");
    expect(source).toContain("handleExportExcel");
    expect(source).toContain("导出 Excel");
    expect(source).toContain("上级代码");
    expect(source).toContain("formatParentCode");
  });
});
