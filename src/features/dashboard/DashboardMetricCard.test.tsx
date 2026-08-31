import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { DashboardMetricCard } from "./DashboardMetricCard";

function renderCard(node: React.ReactNode) {
  return renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
}

describe("DashboardMetricCard", () => {
  it.each([
    [12.5, "+12.5%", "dashboard-comparison-positive"],
    [-4, "-4%", "dashboard-comparison-negative"],
    [0, "0%", "dashboard-comparison-zero"]
  ] as const)("renders the %s comparison without obscuring the unit", (changeRatePercent, label, className) => {
    const markup = renderCard(
      <DashboardMetricCard
        comparison={{ changeRatePercent, current: 24, previous: 20 }}
        title="活跃技师"
        unit="people"
      />
    );

    expect(markup).toContain(">24<");
    expect(markup).toContain("人");
    expect(markup).toContain(label);
    expect(markup).toContain(className);
    expect(markup).toContain('data-no-i18n="true"');
  });

  it("shows an explicit no-baseline state instead of inventing a percentage", () => {
    const markup = renderCard(
      <DashboardMetricCard
        comparison={{ changeRatePercent: null, current: 3, previous: 0 }}
        title="新增用户"
        unit="people"
      />
    );

    expect(markup).toContain("暂无上期基线");
    expect(markup).not.toContain("Infinity");
  });

  it("keeps unavailable member data distinct from zero and shows true completed users", () => {
    const markup = renderCard(
      <DashboardMetricCard
        secondary={{ label: "利用者数", unit: "people", value: 123 }}
        statusMessage="会员功能尚未开放"
        title="会员数"
        unit="people"
        value={null}
      />
    );

    expect(markup).toContain("会员数");
    expect(markup).toContain(">—<");
    expect(markup).toContain("会员功能尚未开放");
    expect(markup).toContain("利用者数");
    expect(markup).toContain(">123<");
  });

  it("labels formal NDP as primary and Test NDP as secondary without combining them", () => {
    const markup = renderCard(
      <DashboardMetricCard title="存量 NDP" unit="ndp" value={999} testNdp={25} />
    );

    expect(markup).toContain(">999<");
    expect(markup).toContain("NDP");
    expect(markup).toContain("Test NDP");
    expect(markup).toContain(">25<");
    expect(markup).not.toContain("1,024");
  });
});
