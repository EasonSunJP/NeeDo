import assert from "node:assert/strict";
const { describe, it } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");

import * as components from "./components.mjs";
import { premiumSlides } from "./content.mjs";
import { THEME, addDarkBase, addLightBase, createDeck } from "./theme.mjs";
import * as data from "../needo-roadshow/data.mjs";
import {
  BUSINESS_PAGE_RANGE,
  FUNDING_ALLOCATION,
  buildBusinessSlides,
  buildScenarioSeries,
} from "./slides/business.mjs";

function buildWithChartCapture() {
  const deck = createDeck();
  const charts = [];
  const textCalls = [];
  const originalAddSlide = deck.addSlide.bind(deck);
  deck.addSlide = (...args) => {
    const slide = originalAddSlide(...args);
    const slideNumber = deck._slides.length;
    const originalAddChart = slide.addChart.bind(slide);
    const originalAddText = slide.addText.bind(slide);
    slide.addChart = (...chartArgs) => {
      charts.push(chartArgs);
      return originalAddChart(...chartArgs);
    };
    slide.addText = (...textArgs) => {
      textCalls.push({ slideNumber, textArgs });
      return originalAddText(...textArgs);
    };
    return slide;
  };

  buildBusinessSlides({
    pptx: deck,
    deck,
    theme: { ...THEME, addDarkBase, addLightBase },
    components,
    content: premiumSlides,
    data,
    assets: {},
  });
  return { deck, charts, textCalls };
}

describe("premium business narrative", () => {
  it("builds exactly the approved eight-slide checkpoint range", () => {
    assert.deepEqual(BUSINESS_PAGE_RANGE, { first: 19, last: 26, count: 8 });
    const { deck } = buildWithChartCapture();
    assert.equal(deck._slides.length, 8);
  });

  it("preserves every annual scenario value without duplicating model numbers", () => {
    for (const scenarioName of ["general", "aggressive"]) {
      const scenario = data.scenarios[scenarioName];
      assert.deepEqual(buildScenarioSeries(scenario), {
        labels: ["Y1", "Y2", "Y3"],
        stores: scenario.stores,
        orders: scenario.orders,
        revenueM: scenario.revenueM,
        profitM: scenario.profitM,
        margin: scenario.margin,
      });
    }
  });

  it("locks the funding proposal to the approved JPY 200M allocation", () => {
    assert.deepEqual(FUNDING_ALLOCATION, [
      { name: "產品／工程", value: 80_000_000 },
      { name: "市場／店鋪導入", value: 60_000_000 },
      { name: "客服／安全／合規", value: 30_000_000 },
      { name: "營運資金", value: 30_000_000 },
    ]);
    assert.equal(FUNDING_ALLOCATION.reduce((sum, item) => sum + item.value, 0), data.financing.amountJpy);
  });

  it("uses editable native charts with locked labels, fonts and scenario colors", () => {
    const { charts } = buildWithChartCapture();
    assert.equal(charts.length, 3);

    const scenarioCharts = charts.slice(0, 2);
    assert.deepEqual(
      scenarioCharts.map(([, series]) => series.map(({ values }) => values)),
      [
        [data.scenarios.general.revenueM, data.scenarios.general.profitM],
        [data.scenarios.aggressive.revenueM, data.scenarios.aggressive.profitM],
      ],
    );
    assert.deepEqual(scenarioCharts[0][2].chartColors, [THEME.colors.dataGreen, THEME.colors.sage]);
    assert.deepEqual(scenarioCharts[1][2].chartColors, [THEME.colors.orange, "B86F4B"]);

    for (const [, , options] of charts) {
      assert.equal(options.dataLabelFontFace, THEME.font);
      assert.equal(options.showValue, true);
      assert.ok(options.chartColors.every((color) => /^[0-9A-F]{6}$/.test(color)));
    }
  });

  it("places page 25 after the doughnut to avoid LibreOffice chart-layer displacement", () => {
    const { textCalls } = buildWithChartCapture();
    const pageNumber = textCalls.find(({ slideNumber, textArgs: [text] }) => slideNumber === 7 && text === "25");

    assert.ok(pageNumber);
    assert.equal(pageNumber.textArgs[1].objectName, "Funding page number");
    assert.ok(pageNumber.textArgs[1].x >= 11.9);
  });
});
