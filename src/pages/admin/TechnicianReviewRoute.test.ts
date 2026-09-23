import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("operations technician application review route", () => {
  it("routes document review to the formal pending technician workflow", () => {
    const layoutSource = read("../../components/admin/AdminLayout.tsx");
    const pageSource = read("./TechniciansPage.tsx");
    const translationsSource = read("../../i18n/translations.ts");

    expect(layoutSource).toContain('/admin/technicians?module=review');
    expect(layoutSource).not.toContain('/admin/merchants?module=technician-review');
    expect(pageSource).toContain('searchParams.get("module") === "review"');
    expect(pageSource).toContain('status: isReviewMode ? "pending_review" : undefined');
    expect(pageSource).toContain('const reviewTechnicians = useMemo(() => technicians.filter((item) => item.status === "pending_review"), [technicians]);');
    expect(pageSource).toContain('title={isRankingMode ? translate("技师榜单") : isReviewMode ? "技师资料审核" : "技师管理"}');
    expect(pageSource).toContain("actions={isReviewMode || isRankingMode ? <></> : undefined}");
    expect(pageSource).toContain("DataTable<BackofficeTechnicianPayload>");
    expect(pageSource).toContain('title: "技师"');
    expect(pageSource).toContain('title: "创建时间"');
    expect(pageSource).toContain("暂无待审核的技师资料");
    expect(translationsSource).toContain('"技师资料审核":');
    expect(translationsSource).toContain('"这里只显示已开通技师身份、资料状态为待审核的档案；身份开通申请由目标店铺审核。":');
    expect(translationsSource).toContain('"暂无待审核的技师资料":');
    expect(translationsSource).toContain('"技师身份申请由目标店铺审核，不在此资料列表中。":');
  });
});
