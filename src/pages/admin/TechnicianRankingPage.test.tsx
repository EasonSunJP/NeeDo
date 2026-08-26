import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calculateAverageOrderValue,
  updateRankingSearchParams,
} from "../../components/admin/TechnicianRankingModule";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("operations technician ranking integrated workspace", () => {
  it("calculates zero average safely and applies ranking URL resets without losing module", () => {
    expect(calculateAverageOrderValue(9800, 0)).toBe(0);
    expect(calculateAverageOrderValue(9800, 4)).toBe(2450);

    const next = updateRankingSearchParams(
      new URLSearchParams("module=ranking&period=custom&from=2026-08-01&to=2026-08-15&page=4"),
      { from: null, page: "1", period: "today", to: null },
    );

    expect(next.toString()).toBe("module=ranking&period=today&page=1");
  });

  it("keeps ranking filters in the URL and derives average order values safely", () => {
    const source = read("../../components/admin/TechnicianRankingModule.tsx");

    expect(source).toContain("useSearchParams");
    expect(source).toContain("setSearchParams(nextParams, { replace: true })");
    for (const key of [
      "period",
      "from",
      "to",
      "sortBy",
      "sortOrder",
      "keyword",
      "shopId",
      "city",
      "page",
    ]) {
      expect(source).toContain(`searchParams.get("${key}")`);
    }
    expect(source).toContain('nextParams.set("module", "ranking")');
    expect(source).toContain("setTimeout(");
    expect(source).toContain("350");
    expect(source).toContain("const translate = useCallback");
    expect(source).toContain(
      "Number.isSafeInteger(parsedShopId) && parsedShopId > 0",
    );
    expect(source).toContain("calculateAverageOrderValue(");
    expect(source).toContain("setData(createEmptyRanking())");
    expect(source).toContain("setLoadFailed(true)");
  });

  it("uses only formal ranking APIs and returns selected row plus period metadata", () => {
    const source = read("../../components/admin/TechnicianRankingModule.tsx");

    expect(source).toMatch(
      /backofficeRealDataApi\s*\.\s*technicianRankings/,
    );
    expect(source).toMatch(
      /backofficeRealDataApi\s*\.\s*exportTechnicianRankings/,
    );
    expect(source).toContain("downloadCsvExport");
    expect(source).toContain('variant="primary"');
    expect(source).not.toContain('variant="dark"');
    expect(source).toMatch(/onSelectTechnician\(\{\s*period,\s*row\s*\}\)/);
    expect(source).not.toMatch(
      /data\/mock|mapBackofficeTechnician|TechnicianListModule|localStorage/,
    );
  });

  it("places the selected ranking-period metrics above the independent formal detail panel", () => {
    const source = read("./TechniciansPage.tsx");

    expect(source).toContain("selectedRanking");
    expect(source).toContain("setSelectedRanking(null)");
    expect(source).toContain("selectedRanking.row.rank");
    expect(source).toContain("selectedRanking.row.completedServiceAmountJpy");
    expect(source).toContain("selectedRanking.row.completedOrderCount");
    expect(source).toContain("selectedRanking.row.workingDayCount");
    expect(source).toContain("selectedRankingAverageOrderValue");
    expect(source).toContain("FormalTechnicianDetailPanel");
    expect(source.indexOf("{selectedRanking ?")).toBeLessThan(
      source.indexOf("{technicianDetailLoading ?"),
    );
  });

  it("localizes the ranking workspace heading, definition, and selected-row summary", () => {
    const source = read("./TechniciansPage.tsx");

    expect(source).toContain('const translate = useCallback');
    expect(source).toContain('title={isRankingMode ? translate("技师榜单")');
    expect(source).toContain('translate("按已完成订单核算技师业绩；服务金额包含已记账的加钟金额，同一订单只计一单，至少完成一单计为一个工作日。")');
    expect(source).toContain('translate("榜单期间")');
    expect(source).toContain('title={translate("技师集中详情")}');
    expect(source).toContain('"服务金额", rankingCurrencyFormatter');
    expect(source).toContain('"完成订单", rankingNumberFormatter');
    expect(source).toContain('"平均客单价", rankingCurrencyFormatter');
    expect(source).toContain('{translate(label)}</dt>');
  });
});
