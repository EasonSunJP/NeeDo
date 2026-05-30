import { describe, expect, it } from "vitest";
import storeDetailSource from "../../pages/user/StoreDetailPage.tsx?raw";
import { getAdaptiveTabLabelClass } from "./AppScaffold";

describe("FeatureSegmentedTabs adaptive labels", () => {
  it("lightly compresses dense four-character labels without touching short labels", () => {
    expect(getAdaptiveTabLabelClass("メニュー")).toContain("[transform:scaleX(0.9)]");
    expect(getAdaptiveTabLabelClass("メニュー", { dense: true })).toContain("[transform:scaleX(0.82)]");
    expect(getAdaptiveTabLabelClass("フィード", { dense: true })).toContain("[transform:scaleX(0.82)]");
    expect(getAdaptiveTabLabelClass("情報")).not.toContain("scaleX");
    expect(getAdaptiveTabLabelClass("メニュー", { relaxed: true })).not.toContain("scaleX");
  });
});

describe("StoreDetailPage compact metrics", () => {
  it("renders rating, favorite, and travel as evenly distributed normal-weight metrics", () => {
    expect(storeDetailSource).toContain("grid grid-cols-3 gap-2");
    expect(storeDetailSource).toContain("storeCompactMetricPillClassName");
    expect(storeDetailSource).not.toContain("grid grid-cols-[minmax(0,1.42fr)_minmax(0,0.82fr)_minmax(0,1.04fr)]");
    expect(storeDetailSource).not.toContain('className="text-[16px] font-black leading-none text-[color:var(--client-primary)]"');
    expect(storeDetailSource).not.toContain('className="whitespace-nowrap text-[12px] font-black leading-none text-[color:var(--client-primary)]"');
    expect(storeDetailSource).not.toContain("{store.rating.toFixed(1)} · {shortNumber(store.reviewCount)} 评价");
    expect(storeDetailSource).not.toContain("· {shortNumber(store.reviewCount)} 评价");
    expect(storeDetailSource).not.toContain("· {shortNumber(store.reviewCount)}");
  });

  it("keeps rating count and favorite full count hidden until their metric buttons are tapped", () => {
    expect(storeDetailSource).toContain('icon="heart"');
    expect(storeDetailSource).toContain("label={formatStoreCompactCount(favoriteCount)}");
    expect(storeDetailSource).toContain("activeMetricDetail");
    expect(storeDetailSource).toContain("data-store-metric-detail={metric}");
    expect(storeDetailSource).toContain('metric="rating"');
    expect(storeDetailSource).toContain('metric="favorite"');
    expect(storeDetailSource).toContain('ariaLabel="查看评价件数"');
    expect(storeDetailSource).toContain('ariaLabel="查看收藏详细数字"');
    expect(storeDetailSource).toContain("评价件数");
    expect(storeDetailSource).toContain("收藏人数");
    expect(storeDetailSource).toContain("formatStoreDetailedCount(store.reviewCount)");
    expect(storeDetailSource).toContain("formatStoreDetailedCount(favoriteCount)");
    expect(storeDetailSource).toContain("function formatStoreCompactCount");
    expect(storeDetailSource).toContain("function formatStoreDetailedCount");
    expect(storeDetailSource).not.toContain('label={`${shortNumber(favoriteCount)} 收藏`}');
  });

  it("keeps the transport select aligned with the compact metric font", () => {
    expect(storeDetailSource).toContain("client-transport-estimate-trigger");
    expect(storeDetailSource).toContain("client-transport-estimate-menu");
    expect(storeDetailSource).toContain('role="listbox"');
    expect(storeDetailSource).toContain('role="option"');
    expect(storeDetailSource).toContain("absolute right-0 top-[calc(100%+6px)]");
    expect(storeDetailSource).not.toContain("<select");
    expect(storeDetailSource).toContain("text-[12px] font-normal text-[color:var(--client-muted)]");
  });

  it("renders the budget as a normal detail row", () => {
    expect(storeDetailSource).toContain('const displayedBudgetLabel = industry === "cleaning" ? "¥10,000 - ¥20,000"');
    expect(storeDetailSource).toContain('<InfoRow label="预算">');
    expect(storeDetailSource).toContain("{displayedBudgetLabel}");
    expect(storeDetailSource).toContain("mt-1.5 text-sm font-normal leading-6 text-[color:var(--client-text)]");
    expect(storeDetailSource).not.toContain("预算：");
    expect(storeDetailSource).not.toContain('className="text-[20px] font-black leading-none text-[color:var(--client-text)]">{displayedBudgetLabel}</span>');
    expect(storeDetailSource).not.toContain('tone="accent"');
  });

  it("removes the outer frame from the basic info block only", () => {
    expect(storeDetailSource).toContain("store-basic-info-block");
    expect(storeDetailSource).toContain("!rounded-none !border-0 !bg-transparent !p-0 !shadow-none");
    expect(storeDetailSource).toContain("!p-0");
    expect(storeDetailSource).not.toContain("!shadow-none p-4");
  });
});
