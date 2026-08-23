import assert from "node:assert/strict";
const { describe, it } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");
import { financing, scenarios, slideTitles } from "../needo-roadshow/data.mjs";
import { premiumSlides } from "./content.mjs";

describe("premium roadshow locks", () => {
  it("keeps 34 slides and seven approved dark slides", () => {
    assert.equal(premiumSlides.length, 34);
    assert.deepEqual(premiumSlides.filter((slide) => slide.mode === "dark").map((slide) => slide.page), [2, 10, 16, 19, 26, 31, 34]);
  });

  it("keeps financing and store scenarios", () => {
    assert.deepEqual(financing, { amountJpy: 200_000_000, equity: 0.10, round: "Pre-A", preMoney: 1_800_000_000, postMoney: 2_000_000_000 });
    assert.deepEqual(scenarios.general.stores, [1200, 3000, 6000]);
    assert.deepEqual(scenarios.aggressive.stores, [1800, 5000, 10000]);
  });

  it("derives every title from the approved source data", () => {
    assert.deepEqual(premiumSlides.map((slide) => slide.title), slideTitles);
  });

  it("locks the Pre-A round and appendix classification", () => {
    assert.equal(financing.round, "Pre-A");
    for (const page of [2, 25, 26]) {
      assert.ok(premiumSlides[page - 1].statement.includes(financing.round));
    }
    assert.deepEqual(premiumSlides.filter((slide) => slide.section === "appendix").map((slide) => slide.page), [27, 28]);
    assert.ok(premiumSlides[26].statement.includes("僅附錄"));
  });

  it("labels prototype-only CPS and transparent-order disclosures", () => {
    for (const page of [10, 15, 16, 17, 18, 22]) {
      assert.match(premiumSlides[page - 1].statement, /可操作原型|尚無真實歸因 GMV|不納入核心模型/);
    }
  });

  it("states the prohibited and separately regulated adult-service boundary", () => {
    for (const page of [8, 9, 23, 30, 31]) {
      assert.ok(premiumSlides[page - 1].statement.includes("現行條款禁止"));
      assert.ok(premiumSlides[page - 1].statement.includes("獨立受監管市場"));
      assert.ok(premiumSlides[page - 1].statement.includes("不進入核心模型"));
    }
  });
});
