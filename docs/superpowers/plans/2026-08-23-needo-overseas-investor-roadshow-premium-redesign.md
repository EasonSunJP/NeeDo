# NeeDo 海外投資人路演 BP LINE 節奏 AI 精緻版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改動34頁內容、財務數據與披露口徑的前提下，製作一套具LINE上市路演節奏、白綠生活服務質感與原創AI主視覺的精緻版繁體中文投資人BP。

**Architecture:** 新版使用獨立的 `scripts/needo-roadshow-premium/` 生成器，從既有 `scripts/needo-roadshow/data.mjs` 匯入已驗證的財務與內容鎖定值，不覆蓋原始BP。五組AI圖像只作為背景與視覺隱喻；所有標題、數據、圖表、來源與披露仍以PowerPoint原生元素生成，最後經結構、文字、邊界、PDF與全頁視覺驗證。

**Tech Stack:** Node.js 22、PptxGenJS、Sharp、Python 3、python-pptx、LibreOffice、Poppler、內建 image_gen。

## Global Constraints

- 輸出固定為34頁、16:9、繁體中文。
- 融資條件固定為2億日圓、出讓10%、Pre-A、投前18億日圓、投後20億日圓。
- 100+店鋪只能表述為使用意向，不得表述為正式簽約、付費、收入或活躍店鋪。
- 一般方案第三年6,000店；激進方案第三年10,000店；保守情境僅置於附錄。
- CPS與透明點單必須披露為可操作原型，尚無真實歸因GMV或CPS收入。
- 成人性服務相關業態不納入核心財務模型；現行條款禁止，未來須獨立合規評估。
- 深墨綠重點頁固定為第2、10、16、19、26、31、34頁，共7頁。
- 其餘頁面以白色、冷白與柔和綠為主；低飽和橙只用於激進情境、風險與資金解鎖。
- AI圖像不得含文字、數字、第三方品牌、LINE角色或可辨識真人。
- AI圖像不得承載任何需精確閱讀的資料；所有文字與圖表必須為PPT原生元素。
- 新版另行輸出，不覆蓋現有 `NeeDo_海外投資人路演_BP_繁中母版_2026-08-23.*`。

---

## File Map

### New source files

- `scripts/needo-roadshow-premium/theme.mjs`：深淺雙母版、色彩、字體、間距與背景。
- `scripts/needo-roadshow-premium/assets.mjs`：AI資產路徑、裁切與用途映射。
- `scripts/needo-roadshow-premium/components.mjs`：標題、頁腳、英雄數字、圖表框、生態節點、流程、軌道與披露元件。
- `scripts/needo-roadshow-premium/content.mjs`：34頁短標題、頁面結論、來源與披露文字。
- `scripts/needo-roadshow-premium/slides/market.mjs`：第1–9頁。
- `scripts/needo-roadshow-premium/slides/product.mjs`：第10–18頁。
- `scripts/needo-roadshow-premium/slides/business.mjs`：第19–26頁。
- `scripts/needo-roadshow-premium/slides/appendix.mjs`：第27–34頁。
- `scripts/needo-roadshow-premium/build.mjs`：組裝34頁並輸出PPTX與來源清單。
- `scripts/needo-roadshow-premium/verify-pptx.py`：頁數、比例、原生圖表、深色頁、越界、關鍵披露與禁用表述檢查。
- `scripts/needo-roadshow-premium/make-contact-sheet.mjs`：生成新版全頁縮圖。
- `scripts/needo-roadshow-premium/data.test.mjs`：財務與披露鎖定測試。
- `scripts/needo-roadshow-premium/layout.test.mjs`：版式數量、深色頁與AI資產映射測試。

### New visual assets

- `assets/needo-roadshow-premium/ai/cover-network.png`
- `assets/needo-roadshow-premium/ai/coordination-network.png`
- `assets/needo-roadshow-premium/ai/scheduling-space.png`
- `assets/needo-roadshow-premium/ai/transparent-ordering.png`
- `assets/needo-roadshow-premium/ai/cps-loop.png`
- `assets/needo-roadshow-premium/ai/prompts.json`

### New outputs

- `outputs/needo-roadshow-premium-2026-08-23/NeeDo_海外投資人路演_BP_LINE節奏_AI精緻版_2026-08-23.pptx`
- `outputs/needo-roadshow-premium-2026-08-23/NeeDo_海外投資人路演_BP_LINE節奏_AI精緻版_2026-08-23.pdf`
- `outputs/needo-roadshow-premium-2026-08-23/contact-sheet-premium.png`
- `outputs/needo-roadshow-premium-2026-08-23/source-manifest-premium.json`
- `outputs/needo-roadshow-premium-2026-08-23/extracted-text-premium.txt`
- `outputs/needo-roadshow-premium-2026-08-23/verification-premium.json`
- `outputs/needo-roadshow-premium-2026-08-23/previews/slide-01.png` 至 `slide-34.png`

---

### Task 1: 建立新版資料與披露鎖定

**Files:**
- Create: `scripts/needo-roadshow-premium/content.mjs`
- Create: `scripts/needo-roadshow-premium/data.test.mjs`
- Import: `scripts/needo-roadshow/data.mjs`

**Interfaces:**
- Consumes: `financing`、`scenarios`、`economics`、`market`、`sources` from `../needo-roadshow/data.mjs`
- Produces: `premiumSlides: Array<{page:number,title:string,statement:string,mode:"light"|"dark",source:string}>`

- [ ] **Step 1: Write the failing data-lock test**

```js
import { describe, expect, it } from "vitest";
import { financing, scenarios } from "../needo-roadshow/data.mjs";
import { premiumSlides } from "./content.mjs";

describe("premium roadshow locks", () => {
  it("keeps 34 slides and seven approved dark slides", () => {
    expect(premiumSlides).toHaveLength(34);
    expect(premiumSlides.filter((slide) => slide.mode === "dark").map((slide) => slide.page))
      .toEqual([2, 10, 16, 19, 26, 31, 34]);
  });

  it("keeps financing and store scenarios", () => {
    expect(financing).toMatchObject({ amountJpy: 200_000_000, equity: 0.10, preMoney: 1_800_000_000, postMoney: 2_000_000_000 });
    expect(scenarios.general.stores).toEqual([1200, 3000, 6000]);
    expect(scenarios.aggressive.stores).toEqual([1800, 5000, 10000]);
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run: `npm test -- scripts/needo-roadshow-premium/data.test.mjs`  
Expected: FAIL because `content.mjs` does not exist.

- [ ] **Step 3: Implement `premiumSlides` with all 34 approved titles and statements**

Use the existing 34-slide order. Shorten visual titles where necessary, but keep each full disclosure in `statement` or `source`. Dark pages must be exactly `[2,10,16,19,26,31,34]`.

- [ ] **Step 4: Run the targeted test**

Run: `npm test -- scripts/needo-roadshow-premium/data.test.mjs`  
Expected: 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/needo-roadshow-premium/content.mjs scripts/needo-roadshow-premium/data.test.mjs
git commit -m "test: lock premium roadshow content and disclosures"
```

---

### Task 2: 生成並驗收五組AI視覺資產

**Files:**
- Create: `assets/needo-roadshow-premium/ai/*.png`
- Create: `assets/needo-roadshow-premium/ai/prompts.json`
- Create: `scripts/needo-roadshow-premium/assets.mjs`
- Test: `scripts/needo-roadshow-premium/layout.test.mjs`

**Interfaces:**
- Produces: `AI_ASSETS: Record<"cover"|"coordination"|"scheduling"|"ordering"|"cps", string>`
- Image size: 16:9 landscape, minimum 1536×864, no embedded text.

- [ ] **Step 1: Write the failing asset-map test**

```js
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { AI_ASSETS } from "./assets.mjs";

describe("premium AI assets", () => {
  it("maps five project-local PNG assets", () => {
    expect(Object.keys(AI_ASSETS).sort()).toEqual(["coordination", "cover", "cps", "ordering", "scheduling"]);
    Object.values(AI_ASSETS).forEach((asset) => {
      expect(asset.endsWith(".png")).toBe(true);
      expect(fs.existsSync(asset)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing assets failure**

Run: `npm test -- scripts/needo-roadshow-premium/layout.test.mjs`  
Expected: FAIL because `assets.mjs` and PNG files do not exist.

- [ ] **Step 3: Generate the cover asset with built-in image generation**

Prompt requirements: white architectural space, translucent mist-green ribbons and glass nodes, expandable service network, visual mass on the right, clean title-safe area on the left, premium Japanese lifestyle-service brand, no text, no logo, no people, no neon, no blue technology aesthetic.

- [ ] **Step 4: Generate the coordination-network asset**

Prompt requirements: central deep-forest glass core, five outer translucent nodes connected by soft curved paths, premium editorial 3D visualization, white and pale green background, no labels, no icons, no people.

- [ ] **Step 5: Generate the scheduling-space asset**

Prompt requirements: translucent three-dimensional time grid, movable capsules, conflict paths and rerouting, sage green and white, precise but soft, no text, no UI screenshots, no cyberpunk lighting.

- [ ] **Step 6: Generate the transparent-ordering asset**

Prompt requirements: premium transparent selection layers, confirmation nodes, running-total trail and itemized ledger metaphor, white and sage palette with muted orange confirmation point, no readable prices, no people, no venue branding.

- [ ] **Step 7: Generate the CPS-loop asset**

Prompt requirements: content, creator, booking, fulfillment, attribution and settlement represented by six glass nodes on a continuous luminous loop, dark forest background, sage highlights and one muted-orange risk gate, central safe area, no text or logos.

- [ ] **Step 8: Inspect every image and save only accepted outputs into the workspace**

Validation checklist for each image: no text-like artifacts, no third-party marks, correct safe area, correct white/green palette, no human anatomy defects, no LINE character resemblance.

- [ ] **Step 9: Record prompts and file hashes**

`prompts.json` must store `id`, `prompt`, `generator`, `createdAt`, `file`, `sha256`, and `approvedUse` for all five assets.

- [ ] **Step 10: Implement `AI_ASSETS` and rerun the test**

Run: `npm test -- scripts/needo-roadshow-premium/layout.test.mjs`  
Expected: asset-map test passed.

- [ ] **Step 11: Commit**

```bash
git add assets/needo-roadshow-premium/ai scripts/needo-roadshow-premium/assets.mjs scripts/needo-roadshow-premium/layout.test.mjs
git commit -m "feat: add original AI visuals for premium roadshow"
```

---

### Task 3: 建立深淺雙母版與高級元件系統

**Files:**
- Create: `scripts/needo-roadshow-premium/theme.mjs`
- Create: `scripts/needo-roadshow-premium/components.mjs`
- Modify: `scripts/needo-roadshow-premium/layout.test.mjs`

**Interfaces:**
- Produces: `THEME`, `createDeck()`, `addLightBase()`, `addDarkBase()`, `addHeroNumber()`, `addInsight()`, `addSource()`, `addNativeBarChart()`, `addNativeLineChart()`, `addOrbitNode()`, `addDisclosure()`.
- All color values use six-digit hex without `#`.

- [ ] **Step 1: Extend the failing layout test**

```js
import { describe, expect, it } from "vitest";
import { THEME, DARK_PAGES, LAYOUT_FAMILIES } from "./theme.mjs";

describe("premium visual system", () => {
  it("uses the approved palette and layout count", () => {
    expect(THEME.colors).toMatchObject({ white: "FFFFFF", deepForest: "173C2E", nightForest: "102D23", green: "72A58B", orange: "D8946B" });
    expect(DARK_PAGES).toEqual([2, 10, 16, 19, 26, 31, 34]);
    expect(new Set(LAYOUT_FAMILIES).size).toBeGreaterThanOrEqual(6);
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing theme failure**

Run: `npm test -- scripts/needo-roadshow-premium/layout.test.mjs`  
Expected: FAIL because `theme.mjs` does not exist.

- [ ] **Step 3: Implement the theme constants and deck masters**

`createDeck()` must instantiate a new PptxGenJS object, set `LAYOUT_WIDE` before adding slides, apply `Arial Unicode MS`, and define `NEEDO_PREMIUM_LIGHT` and `NEEDO_PREMIUM_DARK` masters.

- [ ] **Step 4: Implement the reusable components**

Components must use fresh option objects, zero text margins where alignment matters, no title underlines, no full-width decoration bars, and no reusable mutated PptxGenJS option objects.

- [ ] **Step 5: Run layout tests**

Run: `npm test -- scripts/needo-roadshow-premium/layout.test.mjs`  
Expected: all visual-system tests passed.

- [ ] **Step 6: Commit**

```bash
git add scripts/needo-roadshow-premium/theme.mjs scripts/needo-roadshow-premium/components.mjs scripts/needo-roadshow-premium/layout.test.mjs
git commit -m "feat: add premium light and dark roadshow system"
```

---

### Task 4: 重構市場與痛點頁（1–9）

**Files:**
- Create: `scripts/needo-roadshow-premium/slides/market.mjs`
- Modify: `scripts/needo-roadshow-premium/build.mjs`

**Interfaces:**
- Produces: `buildMarketSlides(ctx): void`
- Consumes: `ctx = { pptx, deck, theme, components, content, data, assets }`

- [ ] **Step 1: Implement slide 1 as a bright AI hero cover**

Use `cover-network.png` as a right-side half-bleed image. Keep the left title block under 42pt and the financing line as one native text row.

- [ ] **Step 2: Implement slide 2 as the first dark investment-thesis page**

Use one 38–42pt conclusion and four numbered investment judgments. Do not use four equal white cards.

- [ ] **Step 3: Implement slides 3–5 with distinct layouts**

- Slide 3: two 56–64pt demand numbers plus a single bottom implication.
- Slide 4: left-to-right phone/LINE coordination timeline plus a large “變更一次＝流程重做一次” callout.
- Slide 5: `coordination-network.png` plus native labels and the transparent-consumption conclusion.

- [ ] **Step 4: Implement slides 6–9**

- Slide 6: circular responsibility chain.
- Slide 7: foreign-customer funnel with four friction exits.
- Slide 8: three-level market map and official supply-side numbers.
- Slide 9: three regulatory zones with visually decreasing permission levels.

- [ ] **Step 5: Build a nine-slide checkpoint deck**

Run: `node scripts/needo-roadshow-premium/build.mjs --through 9`  
Expected: 9-slide checkpoint PPTX produced without errors.

- [ ] **Step 6: Export and inspect slides 1–9**

Run the LibreOffice wrapper and render nine PNGs. Verify title safe areas, AI image crops, Traditional Chinese, dark-page contrast, and no repeated card grid.

- [ ] **Step 7: Commit**

```bash
git add scripts/needo-roadshow-premium/slides/market.mjs scripts/needo-roadshow-premium/build.mjs
git commit -m "feat: redesign premium market and problem narrative"
```

---

### Task 5: 重構產品與雙引擎頁（10–18）

**Files:**
- Create: `scripts/needo-roadshow-premium/slides/product.mjs`
- Modify: `scripts/needo-roadshow-premium/build.mjs`

**Interfaces:**
- Produces: `buildProductSlides(ctx): void`

- [ ] **Step 1: Implement slide 10 as a dark platform chapter page**

Central NeeDo core with five native module labels and large surrounding negative space.

- [ ] **Step 2: Implement slides 11–13**

- Slide 11: one circular fulfillment loop with six native stages.
- Slide 12: `scheduling-space.png` on 58% of the page plus three result metrics.
- Slide 13: internal, partner-store and external-provider capacity funnel.

- [ ] **Step 3: Implement slides 14–16**

- Slide 14: platform-outside negative loop versus platform-inside positive loop.
- Slide 15: native transparent bill panel over `transparent-ordering.png`.
- Slide 16: dark CPS chapter page using `cps-loop.png`, with AI scheduling and CPS shown as two reinforcing engines.

- [ ] **Step 4: Implement slides 17–18**

- Slide 17: attribution flow with refund/risk gate before commission settlement.
- Slide 18: stepped maturity ladder for “已可操作／本輪完成／未宣稱”.

- [ ] **Step 5: Build and visually inspect slides 10–18**

Run: `node scripts/needo-roadshow-premium/build.mjs --from 10 --through 18`  
Expected: 9-slide checkpoint deck; no AI image contains legible text.

- [ ] **Step 6: Commit**

```bash
git add scripts/needo-roadshow-premium/slides/product.mjs scripts/needo-roadshow-premium/build.mjs
git commit -m "feat: redesign premium product and CPS narrative"
```

---

### Task 6: 重構商業驗證、單位經濟與融資頁（19–26）

**Files:**
- Create: `scripts/needo-roadshow-premium/slides/business.mjs`
- Modify: `scripts/needo-roadshow-premium/build.mjs`

**Interfaces:**
- Produces: `buildBusinessSlides(ctx): void`

- [ ] **Step 1: Implement slide 19 as a dark 100+ validation page**

Use “100+” at 64–72pt, keep “使用意向” adjacent, and place the non-contract/non-revenue disclosure on the same visual plane.

- [ ] **Step 2: Implement slides 20–22**

- Slide 20: city-density growth staircase and four city KPIs.
- Slide 21: transaction core with four revenue streams around it.
- Slide 22: four hero numbers and a two-channel CAC payback comparison.

- [ ] **Step 3: Implement slides 23–24 with native charts**

Use full-width native charts. General uses green; aggressive uses muted orange. Preserve all three annual values and non-promissory disclosure.

- [ ] **Step 4: Implement slide 25 as a funding donut and timeline**

Use a native doughnut chart for ¥200M allocation and a native 18-month milestone line.

- [ ] **Step 5: Implement slide 26 as a dark investment-terms page**

Use ¥200M, 10%, ¥1.8B and ¥2.0B as primary numbers. Keep return examples clearly labeled as arithmetic scenarios with no return promise.

- [ ] **Step 6: Build and inspect slides 19–26**

Confirm chart data labels, negative values, orange/green distinction, disclosure readability, and no table overflowing the footer.

- [ ] **Step 7: Commit**

```bash
git add scripts/needo-roadshow-premium/slides/business.mjs scripts/needo-roadshow-premium/build.mjs
git commit -m "feat: redesign premium validation and finance narrative"
```

---

### Task 7: 重構附錄、風險、路線圖與結尾（27–34）

**Files:**
- Create: `scripts/needo-roadshow-premium/slides/appendix.mjs`
- Modify: `scripts/needo-roadshow-premium/build.mjs`

**Interfaces:**
- Produces: `buildAppendixSlides(ctx): void`

- [ ] **Step 1: Implement slides 27–30**

- Slide 27: conservative scenario with low-saturation native chart.
- Slide 28: three assumption tracks instead of a dense grid.
- Slide 29: three-scenario cash line chart with first-10-month risk window.
- Slide 30: grouped source registry and URLs.

- [ ] **Step 2: Implement slide 31 as a dark compliance page**

Show six risk domains as product-control layers. Adult-market content remains an isolated regulated zone.

- [ ] **Step 3: Implement slides 32–33**

- Slide 32: full-width four-phase roadmap.
- Slide 33: data-room index interface with commercial, product, finance and compliance folders.

- [ ] **Step 4: Implement slide 34 as the dark closing page**

Reuse a dark-compatible crop of the cover AI visual, one closing statement, financing line and four next steps.

- [ ] **Step 5: Build and inspect slides 27–34**

Verify appendix remains readable, sources are complete, dark pages use light text, and closing visually echoes the cover.

- [ ] **Step 6: Commit**

```bash
git add scripts/needo-roadshow-premium/slides/appendix.mjs scripts/needo-roadshow-premium/build.mjs
git commit -m "feat: redesign premium appendix and closing"
```

---

### Task 8: 完整輸出、自動驗證與逐頁QA

**Files:**
- Create: `scripts/needo-roadshow-premium/verify-pptx.py`
- Create: `scripts/needo-roadshow-premium/make-contact-sheet.mjs`
- Create: `outputs/needo-roadshow-premium-2026-08-23/*`

**Interfaces:**
- `verify-pptx.py <pptx> <report>` returns exit 0 only when all artifact checks pass.

- [ ] **Step 1: Implement premium artifact verification**

Checks must include: 34 slides, 13.333×7.5 inches, at least six native charts, zero out-of-bounds text boxes, exactly seven dark-page tags in slide notes or manifest, no simplified `时`, required disclosures present, forbidden overclaims absent.

- [ ] **Step 2: Generate the full premium PPTX and manifest**

Run: `node scripts/needo-roadshow-premium/build.mjs`  
Expected: 34-slide premium PPTX and `source-manifest-premium.json`.

- [ ] **Step 3: Run data and layout tests**

Run: `npm test -- scripts/needo-roadshow-premium/data.test.mjs scripts/needo-roadshow-premium/layout.test.mjs`  
Expected: all premium tests passed.

- [ ] **Step 4: Run the project test suite**

Run: `npm test`  
Expected: all repository tests passed.

- [ ] **Step 5: Run the premium verifier and official PPTX validator**

Run:

```bash
python3 scripts/needo-roadshow-premium/verify-pptx.py \
  outputs/needo-roadshow-premium-2026-08-23/NeeDo_海外投資人路演_BP_LINE節奏_AI精緻版_2026-08-23.pptx \
  outputs/needo-roadshow-premium-2026-08-23/verification-premium.json
PYTHONPATH=/private/tmp/needo-pydeps python3 /Users/eason/.agents/skills/anthropic-skills/skills/pptx/scripts/office/validate.py \
  outputs/needo-roadshow-premium-2026-08-23/NeeDo_海外投資人路演_BP_LINE節奏_AI精緻版_2026-08-23.pptx
```

Expected: premium verifier status `pass`; official validator prints `All validations PASSED!`.

- [ ] **Step 6: Export the final PDF with the verified font configuration**

Use `scripts/needo-roadshow/fonts.conf`, `FONTCONFIG_PATH`, and writable `XDG_CACHE_HOME`, then confirm `pdfinfo` reports 34 pages and 16:9 size.

- [ ] **Step 7: Render all slides and create the contact sheet**

Render 34 PNG files at 110–150 DPI and generate `contact-sheet-premium.png` with slide numbers.

- [ ] **Step 8: Inspect all 34 slides visually**

Check font rendering, title hierarchy, dark/light rhythm, AI crop quality, chart labels, source legibility, no repeated three-slide card grid, no footer collision, and no low-contrast text.

- [ ] **Step 9: Extract all slide text**

Reuse `scripts/needo-roadshow/extract-pptx-text.py` to write `extracted-text-premium.txt`, then scan for placeholder text, forbidden overclaims and simplified `时`.

- [ ] **Step 10: Commit final generator and artifacts**

```bash
git add scripts/needo-roadshow-premium assets/needo-roadshow-premium outputs/needo-roadshow-premium-2026-08-23
git commit -m "feat: deliver premium AI NeeDo investor roadshow"
```

---

## Final Acceptance Checklist

- [ ] 34頁繁體中文PPTX與PDF均可開啟。
- [ ] 七頁深墨綠重點頁與其餘白綠頁形成清楚節奏。
- [ ] 五組AI視覺資產均為原創、無文字、無第三方品牌。
- [ ] 每頁一個核心投資判斷，沒有連續三頁相同卡片網格。
- [ ] 所有圖表、數據、融資條件、披露與來源保持原生可編輯。
- [ ] 100+店鋪、CPS、透明點單與成人市場口徑沒有誇大。
- [ ] 一般、激進與保守三情境數值與已驗證模型一致。
- [ ] 自動測試、premium verifier、官方PPTX validator全部通過。
- [ ] PDF為34頁，34張預覽圖與全頁縮圖已人工檢查。
