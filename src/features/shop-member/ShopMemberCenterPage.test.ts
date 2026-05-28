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
});
