import { describe, expect, it } from "vitest";
import source from "./ShopMemberCenterPage.tsx?raw";

describe("ShopMemberCenterPage visual shell", () => {
  it("uses shared mobile header spacing, themed overview colors, and a single card tab frame", () => {
    expect(source).toContain("floatingHeaderGlassPanelClassName");
    expect(source).toContain("floatingHeaderInnerClassName");
    expect(source).toContain("const memberHeaderContentGapPx = 16");
    expect(source).toContain("spacerGapPx={memberHeaderContentGapPx}");
    expect(source).toMatch(/items=\{\[\s*\{ label: "卡模板"[\s\S]*value=\{filter\}\s*variant="header"/);
    expect(source).not.toContain("rgba(124,109,242");
    expect(source).not.toContain("#17172d");
    expect(source).not.toContain("#22214a");
  });

  it("renders source pie analytics as a large labeled chart instead of a small chart with a side legend", () => {
    expect(source).toContain("function getPieSlicePath");
    expect(source).toContain("client-member-source-pie");
    expect(source).toContain("会员来源：${item.label}，${item.percentage}%");
    expect(source).toContain("<tspan");
    expect(source).not.toContain("min-[390px]:grid-cols-[150px,minmax(0,1fr)]");
    expect(source).not.toContain('className="mx-auto h-[150px] w-[150px]');
  });

  it("keeps analytics dimension buttons compact enough for the mobile panel", () => {
    expect(source).toMatch(/title="维度"[\s\S]*<div className="grid grid-cols-4 gap-1\.5">[\s\S]*min-h-\[44px\][\s\S]*rounded-\[14px\][\s\S]*text-\[11px\]/);
    expect(source).not.toContain("min-h-[58px] rounded-[18px] border px-1 text-center text-[12px]");
  });

  it("puts total spend on a full-width second row in analytics summary", () => {
    expect(source).toMatch(/title="会员分析"[\s\S]*<div className="grid grid-cols-2 gap-2">[\s\S]*label="会员总数"[\s\S]*label="客单价"[\s\S]*<div className="col-span-2">[\s\S]*label="总消费"/);
    expect(source).not.toContain('<div className="grid grid-cols-3 gap-2">\\n          <KpiTile label="会员总数"');
  });

  it("offsets the selected pie slice so the active group is visually separated", () => {
    expect(source).toContain("function getPieOffset");
    expect(source).toContain("const selectedOffset = selected ? getPieOffset(3.2, midAngle) : null");
    expect(source).toContain('transform={selectedOffset ? `translate(${selectedOffset.x} ${selectedOffset.y})` : undefined}');
  });

  it("opens chart settings as an overlay dropdown without moving the pie chart", () => {
    expect(source).toContain("function AnalyticsSettingsDropdown");
    expect(source).toContain("visibleGroupKeysByDimension");
    expect(source).toContain("showChartDetails");
    expect(source).toContain('aria-label="图表设置"');
    expect(source).toContain('aria-label="图表显示设置"');
    expect(source).toContain("absolute right-0 top-full z-30");
    expect(source).toContain('className="relative"');
    expect(source).toContain("显示详细数据");
    expect(source).toContain("bg-[color:var(--client-bg)]");
    expect(source).toContain("setVisibleGroupKeysByDimension");
    expect(source).toContain("filteredAnalyticsResult.summary.memberCount");
    expect(source).toContain("getShopMemberAnalytics(snapshot, dimension, { groupKeys: visibleGroupKeys })");
    expect(source).not.toContain("function AnalyticsSettingsPanel");
    expect(source).not.toContain("mb-3 rounded-[22px]");
    expect(source).not.toContain('className="mb-3 flex justify-end"');
    expect(source).not.toContain('value={`${result.summary.memberCount}`}');
    expect(source).not.toContain("显示人数 / 件数");
    expect(source).not.toContain("var(--client-surface)_94%,var(--client-bg)_6%");
  });
});
