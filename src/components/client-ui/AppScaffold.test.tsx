import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import storeDetailSource from "../../pages/user/StoreDetailPage.tsx?raw";
import appScaffoldSource from "./AppScaffold.tsx?raw";
import { AppIcon, getAdaptiveTabLabelClass, IconButton } from "./AppScaffold";

describe("completed icon", () => {
  it("renders the completed check as a transparent mask cutout", () => {
    const markup = renderToStaticMarkup(createElement(AppIcon, { name: "completed" }));

    expect(markup).toContain("<mask");
    expect(markup).toContain('maskUnits="userSpaceOnUse"');
    expect(markup).toContain('data-icon-part="completed-seal"');
    expect(markup).toContain('fill="currentColor"');
    expect(markup).toContain('data-icon-part="completed-check-cutout"');
    expect(markup).toContain('stroke="black"');
    expect(markup).not.toContain('stroke="#f7f9f7"');
    expect(markup).not.toContain("M4.4 15.3A8.2 8.2");
  });

  it("uses an isolated mask for every completed icon instance", () => {
    const markup = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(AppIcon, { name: "completed" }),
        createElement(AppIcon, { name: "completed" })
      )
    );
    const maskIds = [...markup.matchAll(/<mask[^>]* id="([^"]+)"/gu)].map((match) => match[1]);
    const maskReferences = [...markup.matchAll(/mask="url\(#([^)]+)\)"/gu)].map((match) => match[1]);

    expect(maskIds).toHaveLength(2);
    expect(new Set(maskIds).size).toBe(2);
    expect(maskReferences).toHaveLength(2);
    expect(new Set(maskReferences).size).toBe(2);
    expect([...new Set(maskReferences)].sort()).toEqual([...new Set(maskIds)].sort());
    maskReferences.forEach((maskId) => {
      expect(maskIds.filter((candidate) => candidate === maskId)).toHaveLength(1);
    });
  });
});

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

describe("IconMetricAction shared shell", () => {
  it("uses theme tokens for metric shells so heart and share icons follow the active UI theme", () => {
    expect(appScaffoldSource).toContain(
      "bg-[color:color-mix(in_srgb,var(--client-primary-soft)_72%,var(--client-surface)_28%)]"
    );
    expect(appScaffoldSource).toContain("border-[color:color-mix(in_srgb,var(--client-primary)_30%,transparent)]");
    expect(appScaffoldSource).toContain("text-[color:var(--client-primary)]");
    expect(appScaffoldSource).not.toContain("white_92%");
    expect(appScaffoldSource).not.toContain("white_82%");
  });
});

describe("IconButton disabled semantics", () => {
  it("keeps an unavailable action as a native disabled button", () => {
    const markup = renderToStaticMarkup(createElement(IconButton, {
      disabled: true,
      icon: "up",
      label: "上移",
      onClick: () => undefined
    }));

    expect(markup).toMatch(/^<button /u);
    expect(markup).toContain('aria-label="上移"');
    expect(markup).toContain("disabled");
  });
});
