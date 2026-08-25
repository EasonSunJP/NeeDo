# NeeDo 海外投資人路演 BP 參考風格精緻版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 `NeeDoBP_CN_2026-08-14.pdf` 的暖白、柔綠、3D 城市、手機與圓角卡片語言，重製一套不含 NeeDo 卡通角色的 34 頁繁體中文海外投資人路演 BP。

**Architecture:** 新版使用獨立的 `scripts/needo-roadshow-reference-style/` 生成器，從 `scripts/needo-roadshow/data.mjs` 與既有 34 頁內容鎖定匯入數據，不覆蓋母版版或歷史輸出。3D 場景圖只作背景和情境敘事；所有標題、數字、圖表、來源及披露使用 PowerPoint 原生物件，最後透過結構、文字、邊界、PDF 與逐頁視覺檢查驗收。

**Tech Stack:** Node.js 22、PptxGenJS、Sharp、Python 3、python-pptx、LibreOffice、Poppler、內建 image generation。

## Global Constraints

- 輸出固定為 34 頁、16:9、繁體中文。
- 參考 PDF 只提供視覺語言；不得沿用其中的簡體中文、Free SaaS、舊財務數據或 14 頁結構。
- 融資條件固定為 2 億日圓、出讓 10%、Pre-A、投前 18 億日圓、投後 20 億日圓。
- 100+ 店鋪只能表述為使用意向，不得表述為簽約、付費、營收或活躍店鋪。
- 一般方案第三年 6,000 店；激進方案第三年 10,000 店；保守情境僅置於附錄。
- SaaS 每店每月 9,800 日圓、最低合約期 6 個月；免預約費期間仍收 SaaS 月費。
- CPS 與透明點單必須披露為可操作原型，尚無真實歸因 GMV 或 CPS 收入。
- 成人性服務相關業態不納入核心財務模型；現行條款禁止，未來須獨立合規評估。
- 所有精確文字與圖表必須為 PPT 原生元素；3D 圖像不得承載可讀數據。
- 所有場景圖不得出現 NeeDo 吉祥物或其他卡通品牌角色；角色位置改用手機、平台節點、資料中樞或里程碑。
- 原始 PDF、原始母版及既有輸出不得修改。

---

## File Map

### New source files

- `scripts/needo-roadshow-reference-style/theme.mjs`：暖白柔綠主題、字體、背景與頁面常數。
- `scripts/needo-roadshow-reference-style/content.mjs`：34 頁標題、結論、來源與披露映射。
- `scripts/needo-roadshow-reference-style/assets.mjs`：九組 3D 場景資產路徑與用途。
- `scripts/needo-roadshow-reference-style/components.mjs`：標題、頁腳、卡片、英雄數字、流程、圖表與披露元件。
- `scripts/needo-roadshow-reference-style/slides/market.mjs`：第 1–9 頁。
- `scripts/needo-roadshow-reference-style/slides/product.mjs`：第 10–18 頁。
- `scripts/needo-roadshow-reference-style/slides/business.mjs`：第 19–26 頁。
- `scripts/needo-roadshow-reference-style/slides/appendix.mjs`：第 27–34 頁。
- `scripts/needo-roadshow-reference-style/build.mjs`：組裝 34 頁並輸出 PPTX 與來源清單。
- `scripts/needo-roadshow-reference-style/verify.py`：結構、邊界、關鍵文字、禁用舊數據與原生圖表檢查。
- `scripts/needo-roadshow-reference-style/make-contact-sheet.py`：生成 34 頁總覽。
- `scripts/needo-roadshow-reference-style/data.test.mjs`：財務與披露鎖定測試。
- `scripts/needo-roadshow-reference-style/layout.test.mjs`：色彩、版式、資產與頁數測試。

### New visual assets

- `assets/needo-roadshow-reference-style/ecosystem-cover.png`
- `assets/needo-roadshow-reference-style/market-network.png`
- `assets/needo-roadshow-reference-style/supply-awakening.png`
- `assets/needo-roadshow-reference-style/five-party-coordination.png`
- `assets/needo-roadshow-reference-style/ai-scheduling.png`
- `assets/needo-roadshow-reference-style/dual-engine.png`
- `assets/needo-roadshow-reference-style/transparent-ordering.png`
- `assets/needo-roadshow-reference-style/cps-loop.png`
- `assets/needo-roadshow-reference-style/tokyo-roadmap.png`
- `assets/needo-roadshow-reference-style/manifest.json`

### New outputs

- `outputs/needo-roadshow-reference-style-2026-08-23/NeeDo_海外投資人路演_BP_參考風格精緻版_2026-08-23.pptx`
- `outputs/needo-roadshow-reference-style-2026-08-23/NeeDo_海外投資人路演_BP_參考風格精緻版_2026-08-23.pdf`
- `outputs/needo-roadshow-reference-style-2026-08-23/contact-sheet-reference-style.png`
- `outputs/needo-roadshow-reference-style-2026-08-23/source-manifest-reference-style.json`
- `outputs/needo-roadshow-reference-style-2026-08-23/extracted-text-reference-style.txt`
- `outputs/needo-roadshow-reference-style-2026-08-23/verification-reference-style.json`

---

### Task 1: 鎖定資料、內容與參考風格常數

**Files:**
- Create: `scripts/needo-roadshow-reference-style/content.mjs`
- Create: `scripts/needo-roadshow-reference-style/theme.mjs`
- Create: `scripts/needo-roadshow-reference-style/data.test.mjs`
- Create: `scripts/needo-roadshow-reference-style/layout.test.mjs`
- Import: `scripts/needo-roadshow/data.mjs`

**Interfaces:**
- Produces: `referenceSlides: Array<{page:number,title:string,statement:string,layout:string,asset:string|null,source:string,disclosure:string}>`
- Produces: `THEME`, `LAYOUT_FAMILIES`, `OUTPUT_PATHS`.

- [ ] **Step 1: Write the failing data-lock test**

```js
import { describe, expect, it } from "vitest";
import { financing, economics, scenarios } from "../needo-roadshow/data.mjs";
import { referenceSlides } from "./content.mjs";

describe("reference-style roadshow locks", () => {
  it("keeps 34 slides and the approved financing", () => {
    expect(referenceSlides).toHaveLength(34);
    expect(financing).toMatchObject({ amountJpy: 200_000_000, equity: 0.10, preMoney: 1_800_000_000, postMoney: 2_000_000_000 });
  });

  it("keeps unit economics and store scenarios", () => {
    expect(economics).toMatchObject({ storeSaasMonthly: 9800, bookingFee: 500, simplifiedOrderContribution: 340 });
    expect(economics.simplifiedOrderContribution / economics.bookingFee).toBeCloseTo(0.68, 6);
    expect(scenarios.general.stores).toEqual([1200, 3000, 6000]);
    expect(scenarios.aggressive.stores).toEqual([1800, 5000, 10000]);
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run: `npm test -- scripts/needo-roadshow-reference-style/data.test.mjs`  
Expected: FAIL because `content.mjs` does not exist.

- [ ] **Step 3: Implement the 34-page content and theme constants**

`referenceSlides` must use pages 1–34 without gaps. `THEME.colors` must include `warmWhite: "FBFAF7"`, `deepGreen: "0B5943"`, `green: "2E8B62"`, `mint: "88CFA8"`, `mist: "E9F4ED"`, `orange: "F39A24"`, `text: "101A16"`.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- scripts/needo-roadshow-reference-style/data.test.mjs scripts/needo-roadshow-reference-style/layout.test.mjs`  
Expected: all tests passed.

---

### Task 2: 生成並驗收九組 3D 品牌場景

**Files:**
- Create: `assets/needo-roadshow-reference-style/*.png`
- Create: `assets/needo-roadshow-reference-style/manifest.json`
- Create: `scripts/needo-roadshow-reference-style/assets.mjs`
- Modify: `scripts/needo-roadshow-reference-style/layout.test.mjs`

**Interfaces:**
- Produces: `SCENE_ASSETS: Record<"cover"|"market"|"supply"|"coordination"|"scheduling"|"dualEngine"|"ordering"|"cps"|"roadmap", string>`.
- Every PNG is 16:9, minimum 1536×864, without readable text or third-party logos.

- [ ] **Step 1: Extend the failing asset test**

```js
import fs from "node:fs";
import { SCENE_ASSETS } from "./assets.mjs";

it("maps nine accepted 3D scene assets", () => {
  expect(Object.keys(SCENE_ASSETS)).toHaveLength(9);
  for (const file of Object.values(SCENE_ASSETS)) {
    expect(file.endsWith(".png")).toBe(true);
    expect(fs.existsSync(file)).toBe(true);
  }
});
```

- [ ] **Step 2: Generate the nine scenes from the approved reference style**

Every prompt must specify: warm ivory background, soft mint-green miniature Japanese city, premium rounded 3D illustration, neutral platform hub or smartphone instead of a mascot, soft daylight, generous text-safe area, no NeeDo mascot, no cartoon brand character, no readable text, no logo, no third-party character, no dark background, no neon.

- [ ] **Step 3: Inspect every scene at original resolution**

Reject any image with pseudo-text, inconsistent mascot anatomy, third-party marks, low-contrast focal objects, insufficient title-safe space or blue/cyberpunk styling.

- [ ] **Step 4: Record prompts and hashes**

`manifest.json` stores `id`, `prompt`, `createdAt`, `file`, `sha256`, `approvedSlides` for all nine assets.

- [ ] **Step 5: Implement the asset map and rerun tests**

Run: `npm test -- scripts/needo-roadshow-reference-style/layout.test.mjs`  
Expected: all asset and style tests passed.

---

### Task 3: 建立參考風格元件系統

**Files:**
- Create: `scripts/needo-roadshow-reference-style/components.mjs`
- Modify: `scripts/needo-roadshow-reference-style/theme.mjs`
- Modify: `scripts/needo-roadshow-reference-style/layout.test.mjs`

**Interfaces:**
- Produces: `createDeck()`, `addBase()`, `addTitle()`, `addLogo()`, `addCard()`, `addHeroNumber()`, `addPill()`, `addSource()`, `addDisclosure()`, `addNativeColumnChart()`, `addNativeLineChart()`, `addFlowStep()`, `addOrbitNode()`.

- [ ] **Step 1: Add layout-family and component tests**

```js
it("uses at least eight layout families", () => {
  expect(new Set(LAYOUT_FAMILIES).size).toBeGreaterThanOrEqual(8);
});
```

- [ ] **Step 2: Implement the warm-white base and reusable components**

`createDeck()` sets `LAYOUT_WIDE` before creating slides, applies `Arial Unicode MS`, uses fresh PptxGenJS option objects, and preserves at least 0.5-inch outer margins. Cards use white fill, pale-green border and low-opacity gray-green shadow.

- [ ] **Step 3: Implement native chart helpers**

All charts use native PowerPoint charts. General = `2E8B62`, aggressive = `F39A24`, conservative = `8A9B92`. Negative profits remain numerically negative in labels and data tables.

- [ ] **Step 4: Run layout tests**

Run: `npm test -- scripts/needo-roadshow-reference-style/layout.test.mjs`  
Expected: all component and layout tests passed.

---

### Task 4: 製作市場與痛點頁（第 1–9 頁）

**Files:**
- Create: `scripts/needo-roadshow-reference-style/slides/market.mjs`
- Create: `scripts/needo-roadshow-reference-style/build.mjs`

**Interfaces:**
- Produces: `buildMarketSlides(ctx): void`.
- Consumes: `{ pptx, theme, components, content, data, assets }`.

- [ ] **Step 1: Implement slides 1–3**

Use cover ecosystem, market network and supply-awakening scenes. Keep precise financing and market figures in native text boxes.

- [ ] **Step 2: Implement slides 4–6**

Use native flow shapes for the six-step phone/LINE process, a five-party coordination network, and four role cards. Add the transparent-consumption conclusion on slide 5.

- [ ] **Step 3: Implement slides 7–9**

Use a visitor journey funnel, a three-layer market funnel and three compliance zones. Preserve all evidence labels and adult-market boundary language.

- [ ] **Step 4: Build a 9-slide draft and render it**

Run: `node scripts/needo-roadshow-reference-style/build.mjs --through 9`  
Expected: a 9-slide PPTX with no missing assets.

---

### Task 5: 製作產品與雙引擎頁（第 10–18 頁）

**Files:**
- Create: `scripts/needo-roadshow-reference-style/slides/product.mjs`
- Modify: `scripts/needo-roadshow-reference-style/build.mjs`

**Interfaces:**
- Produces: `buildProductSlides(ctx): void`.

- [ ] **Step 1: Implement slides 10–13**

Create the platform flywheel, fulfillment loop, AI scheduling scene and three-level resource pool with native labels and metrics.

- [ ] **Step 2: Implement slides 14–18**

Create privacy-loop comparison, transparent ordering, dual-engine scene, CPS attribution flow and maturity matrix. Mark CPS and transparent ordering as operable prototypes.

- [ ] **Step 3: Build an 18-slide draft and render it**

Run: `node scripts/needo-roadshow-reference-style/build.mjs --through 18`  
Expected: an 18-slide PPTX with all required disclosures.

---

### Task 6: 製作驗證、商模與財務頁（第 19–26 頁）

**Files:**
- Create: `scripts/needo-roadshow-reference-style/slides/business.mjs`
- Modify: `scripts/needo-roadshow-reference-style/build.mjs`

**Interfaces:**
- Produces: `buildBusinessSlides(ctx): void`.

- [ ] **Step 1: Implement slides 19–22**

Make `100+`, `¥9,800`, `¥500`, `約¥340` and `68%` native hero numbers. Preserve usage-intent, contract-period, free-booking-fee and CAC-payback disclosures.

- [ ] **Step 2: Implement slides 23–24 with native charts**

General Y1 profit is `-83.360 MJPY`; aggressive Y1 profit is `-131.326 MJPY`. Show negative values explicitly in the side data table even if the chart renderer suppresses minus signs.

- [ ] **Step 3: Implement slides 25–26**

Funding allocation totals `80 + 60 + 30 + 30 = 200 MJPY`. Show Pre-A, 10%, pre-money 1.8B and post-money 2.0B with a non-guarantee disclosure.

- [ ] **Step 4: Run financial tests**

Run: `npm test -- scripts/needo-roadshow-reference-style/data.test.mjs`  
Expected: all financing, scenario and unit-economics tests passed.

---

### Task 7: 製作附錄與盡調頁（第 27–34 頁）

**Files:**
- Create: `scripts/needo-roadshow-reference-style/slides/appendix.mjs`
- Modify: `scripts/needo-roadshow-reference-style/build.mjs`

**Interfaces:**
- Produces: `buildAppendixSlides(ctx): void`.

- [ ] **Step 1: Implement slides 27–30**

Create conservative native chart, three-scenario comparison, 12-quarter cash/profit line chart and grouped source index.

- [ ] **Step 2: Implement slides 31–34**

Create governance cards, 18-month city-roadmap, due-diligence data-room index and a closing slide that echoes the cover scene.

- [ ] **Step 3: Build the complete deck**

Run: `node scripts/needo-roadshow-reference-style/build.mjs`  
Expected: the final 34-slide PPTX and source manifest are created in the approved output directory.

---

### Task 8: 結構、內容與逐頁視覺驗收

**Files:**
- Create: `scripts/needo-roadshow-reference-style/verify.py`
- Create: `scripts/needo-roadshow-reference-style/make-contact-sheet.py`
- Create: `outputs/needo-roadshow-reference-style-2026-08-23/*`

**Interfaces:**
- Produces: `verification-reference-style.json` with `slides`, `ratio`, `nativeCharts`, `requiredTextMissing`, `forbiddenTextFound`, `outOfBounds`, `errors`, `status`.

- [ ] **Step 1: Run all targeted tests**

Run: `npm test -- scripts/needo-roadshow-reference-style/data.test.mjs scripts/needo-roadshow-reference-style/layout.test.mjs`  
Expected: all tests passed.

- [ ] **Step 2: Validate the PPTX package**

Run: `python /Users/eason/.agents/skills/anthropic-skills/skills/pptx/scripts/office/validate.py outputs/needo-roadshow-reference-style-2026-08-23/NeeDo_海外投資人路演_BP_參考風格精緻版_2026-08-23.pptx`  
Expected: no structural or chart errors.

- [ ] **Step 3: Extract and scan all text**

Run: `markitdown outputs/needo-roadshow-reference-style-2026-08-23/NeeDo_海外投資人路演_BP_參考風格精緻版_2026-08-23.pptx`  
Expected: 34 slide blocks, no placeholder text, no stale Free-SaaS assumption and all required disclosures present.

- [ ] **Step 4: Convert to PDF and render all pages**

Run: `python /Users/eason/.agents/skills/anthropic-skills/skills/pptx/scripts/office/soffice.py --headless --convert-to pdf outputs/needo-roadshow-reference-style-2026-08-23/NeeDo_海外投資人路演_BP_參考風格精緻版_2026-08-23.pptx`  
Expected: a 34-page PDF.

- [ ] **Step 5: Generate and inspect the contact sheet**

Run: `python scripts/needo-roadshow-reference-style/make-contact-sheet.py`  
Expected: all 34 slides visible with consistent warm-white/green styling and no obvious overflow.

- [ ] **Step 6: Run the final verifier**

Run: `python scripts/needo-roadshow-reference-style/verify.py`  
Expected: `status: passed`, `slides: 34`, `requiredTextMissing: []`, `forbiddenTextFound: []`, `outOfBounds: []`, `errors: []`.

- [ ] **Step 7: Re-render after every visual fix and repeat Steps 2–6**

The final report must correspond to the latest PPTX and PDF timestamps; stale previews are not acceptable evidence.
