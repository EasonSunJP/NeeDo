# NeeDo 海外投資人路演級BP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依照已核准設計規格，製作一套34頁、全繁體中文、可編輯的 NeeDo 海外投資人前A輪融資簡報，並交付經逐頁視覺檢查的 PPTX、PDF、聯絡表及驗證報告。

**Architecture:** 以 PptxGenJS 建立單一16:9簡報生成器；把文案、財務數據、CPS成熟度證據、來源、白綠母版、原創有機曲面、圖表與各章投影片分離。所有商業數字由凍結資料模組驅動，所有頁面透過共用版面邊界與頁腳產生，最後以語意／色彩測試、Office結構驗證、PDF匯出、文字擷取及34頁影像檢查完成交付。

**Tech Stack:** Node.js 22、PptxGenJS、Sharp、Node Test Runner、Python 3.12、openpyxl、python-pptx、pypdf、LibreOffice、Poppler `pdftoppm`。

## Global Constraints

- 唯一內容規格：`docs/superpowers/specs/2026-08-23-needo-overseas-investor-roadshow-design.md`。
- 固定為26頁主簡報＋8頁附錄，共34頁；不得增刪、調換或合併頁面。
- 全篇使用繁體中文；頁面標題不得使用英文。必要的產品名、法規名、縮寫、網址及財務慣例可保留拉丁字元。
- 融資條件固定為2億日圓、10%股權、18億日圓融資前估值、20億日圓融資後估值。
- 「超過100家店鋪」只能標為「使用意向」，不得表述為簽約、付費、部署或營收。
- 主簡報只展示一般與激進方案；保守方案只能在附錄作壓力測試。
- 高消費場所點單必須呈現含稅價格、客人選擇、追加前確認、即時總額及逐項帳單，並標為本地／靜態可操作原型。
- 第14頁必須把人工智慧調度與 CPS 達人成交增長呈現為雙引擎，且只在「已完成並可驗證的真實服務訂單」交會。
- CPS 必須完整呈現服務選擇、內容／專屬連結／推廣碼／二維碼、預約、履約、歸因、退款／風控及佣金結算流程。
- CPS 推廣計畫、連結、歸因、佣金狀態、結算、風控與稽核目前屬本地狀態驅動的可操作原型；不得把種子資料、示例點擊、示例訂單、示例成交額或示例佣金寫成實際營運數據。
- 成人向服務只作獨立受監管拓展研究；目前產品條款禁止成人性服務，不得描述為既有功能或收入來源。
- 每頁至少包含一個有意義的圖表、流程、資料視覺或產品畫面；不得以裝飾性色條、標題底線或無功能漸層充數。
- 財務圖表必須使用 PowerPoint 原生可編輯圖表；流程、飛輪、矩陣及圖示使用可編輯向量物件。
- 全篇約70–80%可視面積使用純白 `FFFFFF`；暖白 `F8FBF9` 與霧綠 `EDF5F1` 作分區底色。品牌主綠使用 `7EA993`，數據主綠使用 `5F8F78`，深綠文字使用 `2F5F4A`，正文使用 `26352E`，次要文字使用 `6F7F77`，激進方案使用低飽和暖橙 `D89A72`，風險使用柔和深紅 `A85D55`。
- 白色與綠色是唯一主配色；不得使用大面積黑色、深色章節底、愛奇藝官方高飽和亮綠、霓虹效果或娛樂內容圖片。
- 封面、章節及雙引擎頁使用原創半透明綠色有機曲面、柔和飄帶或波浪；不得複製使用者參考圖的字母封面、曲面素材或既有版式。
- 繁體中文使用 `PingFang TC`，數字及拉丁字元使用 `Arial`；所有文字框預留至少10%高度餘量。
- 不複製陌陌、LINE、雲集或滴滴的圖片、圖表、商標或角色；只吸收資訊層級、章節節奏及圖表類型。
- 不修改 `src/`、財務模型原檔、舊版PDF腳本或任何既有產品功能。
- 不提交目前工作區中的其他修改或未追蹤檔案；每次提交只加入本計畫列出的新簡報來源檔。
- 二進位交付物只寫入 `outputs/needo-roadshow-2026-08-23/`，不加入 Git。
- 所有重要事實緊鄰標示「官方統計」「公司提供」「使用意向」「訪談觀察」「可操作原型」「模型預測」或「融資後建置」。
- 任何當期市場、法規、競品或官方統計，在製作時只使用官方或原始來源重新核驗，並記錄資料年份、口徑、頁碼或完整網址。

## File Map

```text
scripts/needo-roadshow/
├── build.mjs                         # 建立PPTX並寫出資料清單
├── content.mjs                       # 34頁繁體文案、標題、標籤及來源ID
├── data.mjs                          # 一般、激進、保守、回報及里程碑數據
├── sources.mjs                       # 公司文件、官方來源及引用格式
├── theme.mjs                         # 16:9、色彩、字體、間距及頁型
├── components.mjs                    # 標題、頁腳、卡片、數字、證據標籤、圖例
├── organic-surfaces.mjs              # 原創柔和曲面、飄帶與弧形SVG
├── diagrams.mjs                      # 五方協調、履約閉環、雙引擎、漏斗、矩陣
├── verify.mjs                        # 內容、數字、標籤、頁序與禁用語驗證
├── make-contact-sheet.mjs            # 以Sharp建立34頁聯絡表
├── extract-model.py                  # 從V2.2模型擷取保守／一般資料供交叉核對
├── extract-pptx-text.py              # 以python-pptx擷取頁序及文字
├── slides/
│   ├── 01-thesis.mjs                 # 第1–4頁
│   ├── 02-market.mjs                 # 第5–9頁
│   ├── 03-product.mjs                # 第10–14頁
│   ├── 04-validation.mjs             # 第15–18頁
│   ├── 05-economics.mjs              # 第19–22頁
│   ├── 06-finance.mjs                # 第23–26頁
│   └── 07-appendix.mjs               # 第27–34頁
└── tests/
    ├── data.test.mjs                 # 財務數字、公式及情境名稱
    ├── content.test.mjs              # 34頁內容、標籤及禁用語
    └── layout.test.mjs               # 元件邊界、頁型及視覺最低要求

outputs/needo-roadshow-2026-08-23/
├── NeeDo_海外投資人路演級BP_繁中_2026-08-23.pptx
├── NeeDo_海外投資人路演級BP_繁中_2026-08-23.pdf
├── source-manifest.json
├── verification.json
├── extracted-text.txt
└── preview/
    ├── slide-01.png ... slide-34.png
    └── contact-sheet.jpg
```

---

### Task 1: Freeze the evidence, financial data, and slide contract

**Files:**
- Create: `scripts/needo-roadshow/data.mjs`
- Create: `scripts/needo-roadshow/content.mjs`
- Create: `scripts/needo-roadshow/sources.mjs`
- Create: `scripts/needo-roadshow/extract-model.py`
- Create: `scripts/needo-roadshow/tests/data.test.mjs`
- Create: `scripts/needo-roadshow/tests/content.test.mjs`

**Interfaces:**

```ts
type EvidenceType = "官方統計" | "公司提供" | "使用意向" | "訪談觀察" | "可操作原型" | "模型預測" | "融資後建置";
type YearMetric = { year: 1 | 2 | 3; stores: number; orders: number; revenueJpyM: number; operatingProfitJpyM: number; margin: number; endingCashJpyM: number };
type MonthlyMetric = { month: number; stores: number; orders: number; revenueJpyM: number; operatingProfitJpyM: number; endingCashJpyM: number };
type Scenario = { label: string; years: readonly [YearMetric, YearMetric, YearMetric]; month18: MonthlyMetric; monthly: readonly MonthlyMetric[] };
type SlideContent = { number: number; section: string; title: string; evidence: readonly EvidenceType[]; sourceIds: readonly string[]; visual: string };

export declare const deckMeta: Readonly<{ title: "NeeDo 海外投資人前A輪融資簡報"; date: "2026-08-23"; mainSlides: 26; appendixSlides: 8; totalSlides: 34 }>;
export declare const scenarios: Readonly<{ conservative: Scenario; general: Scenario; aggressive: Scenario }>;
export declare const slides: readonly SlideContent[];
```

- [ ] 先寫 `data.test.mjs`，斷言融資額、股權、估值、一般／激進三年核心數字、兩方案第18個月數字、轉正月份、最低現金、5年投資回報及稀釋敏感度。
- [ ] 在 `extract-model.py` 用 openpyxl 以工作表名稱及列標籤擷取 `首页仪表盘`、`参数设置`、`A_36个月模型`、`B_36个月模型`、`三年PL`、`现金流`；輸出到標準輸出，不寫回模型。
- [ ] 執行擷取腳本，核對一般方案與V2.2原「方案B（高速增长）」完全一致，並擷取保守壓力測試完整三年及36個月資料。
- [ ] 在 `data.mjs` 凍結已驗證數字；激進方案使用規格核准的敏感度結果，另附假設陣列及 `sourceType: "模型預測"`。
- [ ] 實作投資回報公式 `investorValue = exitEquityValue * ownership`、`multiple = investorValue / investment`、`irr = multiple ** (1 / 5) - 1`，避免在文案中手寫不同口徑。
- [ ] 先寫 `content.test.mjs`，斷言頁碼連續1–34、前26頁為主簡報、後8頁為附錄、標題唯一、主簡報無「保守方案」、全篇無「簽約100家」「已部署人工智慧調度」「已有活躍達人網路」「已有歸因成交額」「CPS已產生收入」等錯誤表述。
- [ ] 在 `sources.mjs` 建立來源登錄；每筆包含 `id`、`title`、`publisher`、`urlOrPath`、`retrievedAt`、`year`、`scope`、`evidenceType`。公司來源必須包含 `docs/NEEDO_AFIRIEITO_ADMIN_DEVELOPMENT.md`、`src/features/business-cps/model.ts`、`src/features/business-cps/logic.ts` 及其測試，作為 CPS 成熟度證據。
- [ ] 重新核驗警察廳、e-Gov、厚生勞動省、JNTO、法務省及Recruit來源；法規與市場數字只採官方或原始資料，訪談敘述維持「訪談觀察」。
- [ ] 在 `content.mjs` 逐頁錄入核准規格的繁體文案、視覺類型、證據標籤及來源ID；不在版面模組內另寫商業文案。
- [ ] 執行測試，確認數據與內容合約先紅後綠。

**Run:**

```bash
/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/needo-roadshow/extract-model.py outputs/01a01893-cba2-7063-ab00-e9f8e301040a/NeeDo_三年财务模型_CN_V2.2_2026-08-22.xlsx
NODE_PATH=/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test scripts/needo-roadshow/tests/data.test.mjs scripts/needo-roadshow/tests/content.test.mjs
```

**Expected:** 兩個測試檔全部通過；擷取輸出顯示一般方案第3年收入 `4162.506237...` 百萬日圓、營業利潤 `2351.720743...` 百萬日圓，且模型原檔雜湊不變。

**Commit:**

```bash
git add scripts/needo-roadshow/data.mjs scripts/needo-roadshow/content.mjs scripts/needo-roadshow/sources.mjs scripts/needo-roadshow/extract-model.py scripts/needo-roadshow/tests/data.test.mjs scripts/needo-roadshow/tests/content.test.mjs
git commit -m "feat(bp): freeze roadshow content and evidence data"
```

---

### Task 2: Build the institutional master and reusable visual system

**Files:**
- Create: `scripts/needo-roadshow/build.mjs`
- Create: `scripts/needo-roadshow/theme.mjs`
- Create: `scripts/needo-roadshow/components.mjs`
- Create: `scripts/needo-roadshow/organic-surfaces.mjs`
- Create: `scripts/needo-roadshow/diagrams.mjs`
- Create: `scripts/needo-roadshow/tests/layout.test.mjs`

**Interfaces:**

```ts
export const PAGE = { width: 13.333, height: 7.5 };
export const SAFE = { left: 0.58, right: 0.58, top: 0.42, bottom: 0.38 };

type SlideFrameOptions = { number: number; section: string; title: string; theme?: "white" | "warm" | "mist"; evidence?: readonly string[]; sources?: readonly string[] };
type OrganicSurfaceOptions = { variant: "cover" | "section" | "dual-engine"; x: number; y: number; w: number; h: number; colors: readonly string[]; opacity: number };

export declare function addSlideFrame(slide: object, options: SlideFrameOptions): void;
export declare function addNativeChart(slide: object, type: string, series: readonly object[], options: object): void;
export declare function addEvidenceTag(slide: object, label: string, x: number, y: number, options?: object): void;
export declare function assertSlideBounds(slideSpec: object): void;
export declare function buildOrganicSurfaceSvg(options: Omit<OrganicSurfaceOptions, "x" | "y"> & { width: number; height: number }): string;
export declare function addOrganicSurface(slide: object, options: OrganicSurfaceOptions): void;
```

- [ ] 先寫 `layout.test.mjs`，斷言寬螢幕尺寸、四周安全區、標題34–42點、章節標題44–52點、正文15–18點、來源9–10點。
- [ ] 在 `theme.mjs` 定義純白 `FFFFFF`、暖白 `F8FBF9`、霧綠 `EDF5F1`、柔和主綠 `7EA993`、數據主綠 `5F8F78`、深綠文字 `2F5F4A`、正文 `26352E`、次要文字 `6F7F77`、低飽和暖橙 `D89A72`、柔和深紅 `A85D55`、字體、陰影、圓角、圖表軸與頁型；所有色碼不含 `#`。
- [ ] 建立顏色使用測試：禁止 `000000` 大面積底色、`17221F` 深色章節底、`00DC5A`、`00A98F`、`5F9C88`、`4F8F7A`、螢光／霓虹漸層；每種頁型的背景只能是 `FFFFFF`、`F8FBF9` 或 `EDF5F1`。
- [ ] 在 `components.mjs` 實作投影片框架、結論式標題、章節導覽、頁碼、資料口徑、來源、數字卡、比較表、情境圖例及產品成熟度標籤。
- [ ] 每個文字元件都接受明確 `x/y/w/h/fontSize`，加入邊界檢查與10%文字高度餘量；錯誤時在建置階段直接拋出頁碼和元件名稱。
- [ ] 在 `organic-surfaces.mjs` 以原創 SVG 路徑實作 `cover`、`section`、`dual-engine` 三種半透明柔和綠色曲面；每種只使用規格色板、可縮放至16:9且不含參考圖字母或外部圖片。
- [ ] 在 `diagrams.mjs` 實作可編輯向量版本的五方連鎖、三層市場、履約閉環、人工智慧排班、人工智慧×CPS雙引擎、使用意向漏斗、三階段進入市場及供需／CPS五層壁壘。
- [ ] 建立白色封面、暖白使命／章節頁、白色分析頁及白色附錄頁四種版型；以霧綠卡片、細線與曲面分層，不得加入大面積深色底、裝飾性長條或標題底線。
- [ ] 以 `public/icons/icon-512-v7.png` 作品牌標誌，以 `public/images/japan-prefectures.svg` 作日本市場輪廓；其餘視覺優先使用原生形狀與向量圖，不依賴網路圖片。
- [ ] 建立 `build.mjs` 的增量建置骨架：解析 `--range` 與 `--out`，只動態載入範圍涵蓋且已存在的章節模組；缺少範圍所需模組時回報明確檔名，讓第3–6任務可各自生成章節開發版。
- [ ] 執行版面測試，確認元件不超出13.333×7.5英吋畫布，且所有頁型都有主視覺區。

**Run:**

```bash
NODE_PATH=/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test scripts/needo-roadshow/tests/layout.test.mjs
```

**Expected:** 測試全部通過；任何超界元件會回報 `slideNumber`、`componentName` 及超界方向。

**Commit:**

```bash
git add scripts/needo-roadshow/build.mjs scripts/needo-roadshow/theme.mjs scripts/needo-roadshow/components.mjs scripts/needo-roadshow/organic-surfaces.mjs scripts/needo-roadshow/diagrams.mjs scripts/needo-roadshow/tests/layout.test.mjs
git commit -m "feat(bp): add institutional roadshow design system"
```

---

### Task 3: Produce slides 1–9 — investment thesis, pain, and market

**Files:**
- Create: `scripts/needo-roadshow/slides/01-thesis.mjs`
- Create: `scripts/needo-roadshow/slides/02-market.mjs`

**Slide allocation:**

- 第1頁：封面與融資條件。
- 第2頁：融資摘要。
- 第3頁：四大投資亮點。
- 第4頁：使命與三個價值支柱。
- 第5頁：電話／LINE傳統預約鏈。
- 第6頁：店鋪、中介、服務者、交通與場所的五方重排。
- 第7頁：外國人、隱私、繞單及高消費帳單風險。
- 第8頁：首發、鄰接、受監管場景三層市場。
- 第9頁：缺工、訪日需求、人工智慧與基礎設施四個驅動力。

- [ ] 實作 `buildThesisSlides(pptx, ctx)`，只從 `content.mjs` 與 `data.mjs` 取文字和數字。
- [ ] 封面使用白色主背景與兩條原創半透明綠色曲面，分別代表服務供給與達人需求，並在「真實履約訂單」節點交會；不使用外部照片或參考圖字母，醒目顯示2億日圓與10%股權。
- [ ] 融資摘要頁把「超過100家」緊鄰標為「使用意向，不等於簽約或營收」，並把資金用途寫成產品、人工智慧調度、CPS真實歸因／結算、供給網路、合規安全與區域增長。
- [ ] 投資亮點頁將3.1個月標成固定費收入對成功報酬的毛回收示例，不暗示完整獲客成本已回收；第四項亮點呈現人工智慧履約效率與 CPS 達人成交增長的雙引擎。
- [ ] 第5頁以七步箭頭流程呈現傳統預約，並在「二十年未改變」旁顯示「訪談觀察」。
- [ ] 第6頁以臨時改期為中心畫出五方連鎖；每個節點標示重複聯絡或狀態不同步的成本。
- [ ] 第7頁使用三欄風險結構，第三欄完整放入價格可見、客人選擇、追加確認、即時總額及逐項帳單主張。
- [ ] 第8頁將キャバクラ等接待型場所與成人性服務分成法律性質不同的受監管場景，不混為同一業態。
- [ ] 第9頁的旅客、居民、缺工或產業數字只顯示已核驗年份與口徑；無可靠統一數字時使用定性驅動力而非推估總額。
- [ ] 生成只含第1–9頁的開發版PPTX，使用LibreOffice轉成PDF，渲染9頁並逐頁檢查字體、對比與引文。

**Run:**

```bash
NODE_PATH=/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/needo-roadshow/build.mjs --range 1-9 --out /private/tmp/needo-roadshow-1-9.pptx
/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 /Users/eason/.agents/skills/anthropic-skills/skills/pptx/scripts/office/soffice.py --headless --convert-to pdf --outdir /private/tmp /private/tmp/needo-roadshow-1-9.pptx
pdftoppm -png -r 144 /private/tmp/needo-roadshow-1-9.pdf /private/tmp/needo-roadshow-1-9
```

**Expected:** 開發版包含9頁；所有頁面使用白色／暖白／霧綠底；第1頁呈現兩條原創柔和曲面；第3頁包含雙引擎；第7頁同時包含外國人、隱私／繞單及高消費透明化三類問題。

**Commit:**

```bash
git add scripts/needo-roadshow/slides/01-thesis.mjs scripts/needo-roadshow/slides/02-market.mjs
git commit -m "feat(bp): build thesis and market narrative slides"
```

---

### Task 4: Produce slides 10–18 — product, trust, validation, and go-to-market

**Files:**
- Create: `scripts/needo-roadshow/slides/03-product.mjs`
- Create: `scripts/needo-roadshow/slides/04-validation.mjs`

**Slide allocation:**

- 第10頁：六個角色入口的產品生態。
- 第11頁：一個訂單／狀態／受保護溝通／CPS歸因的履約閉環。
- 第12頁：店內供給優先、外部已審核資源補位的人工智慧排班。
- 第13頁：隱私、資格、付款、價格快照、CPS事件、爭議及安全。
- 第14頁：人工智慧調度與CPS達人成交雙引擎。
- 第15頁：核心、後續、鄰接三層收入模式。
- 第16頁：超過100家使用意向漏斗。
- 第17頁：六個履約／信任指標與四個CPS增長指標。
- 第18頁：東京核心區至日本主要城市的三階段進入市場。

- [ ] 實作 `buildProductSlides(pptx, ctx)` 與 `buildValidationSlides(pptx, ctx)`。
- [ ] 第10頁以客人、店鋪、中介、服務者、達人／推廣者及平台營運六個入口環繞單一交易狀態；每個入口顯示「已完成前端流程」「可操作原型」或「融資後建置」。
- [ ] 第11頁把菜單、價格、追加確認、逐項帳單、CPS歸因證據與佣金快照納入完整履約閉環；佣金必須在履約、退款期及風控條件完成後才可結算。
- [ ] 第12頁明確呈現「推薦候選人 → 規則檢查 → 本人確認 → 完成排班」，不得畫成未經同意的自動派單。
- [ ] 第13頁將點單與 CPS 流程標為本地／靜態，且不宣稱端對端加密、完整保險、真實歸因、正式佣金支付或商用風控已完成。
- [ ] 第14頁使用 `dual-engine` 原創柔和雙曲面：左側人工智慧調度從需求至真實履約，右側 CPS 從服務選擇至佣金結算，只在完成且可驗證的真實服務訂單交會；同時標示中介從逐單聯絡升級為例外管理。
- [ ] 第15頁只把固定月費、預約費及V2.2已建模收入列入模型；達人 CPS 撮合／歸因／廣告合作列為模型中的後續收入，高消費場所透明點單列為未納入核心損益的鄰接產品，不虛構佣金率或歸因收入。
- [ ] 第16頁漏斗只填入「100+使用意向」；接觸、訪談、試點、付費及續約只作階段名稱，不虛構數量或轉換率；CPS只顯示可操作原型，不顯示示例達人、點擊、成交或佣金數字。
- [ ] 第17頁以二組指標矩陣呈現六個履約／信任指標與四個 CPS 指標：達人啟用、點擊／掃碼至履約轉化、可歸因完成訂單／成交額、含佣金獲客成本與退款／追回／異常率。
- [ ] 第18頁把30,000日圓成功報酬限定於介紹／營業渠道成功簽約，加入分階段資金釋放門檻，並把區域增長表述為「店鋪供給密度＋當地達人服務分發」；CPS渠道只按有效履約後付費。
- [ ] 生成第10–18頁開發版，轉成PDF並逐頁檢查成熟度標籤、流程方向與資訊密度。

**Run:**

```bash
NODE_PATH=/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/needo-roadshow/build.mjs --range 10-18 --out /private/tmp/needo-roadshow-10-18.pptx
/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 /Users/eason/.agents/skills/anthropic-skills/skills/pptx/scripts/office/soffice.py --headless --convert-to pdf --outdir /private/tmp /private/tmp/needo-roadshow-10-18.pptx
pdftoppm -png -r 144 /private/tmp/needo-roadshow-10-18.pdf /private/tmp/needo-roadshow-10-18
```

**Expected:** 開發版包含9頁；第10頁有六個角色；第14頁清楚呈現人工智慧×CPS雙引擎；第11、13、15頁均能看到高消費場所透明點單及CPS的正確成熟度與商業邊界。

**Commit:**

```bash
git add scripts/needo-roadshow/slides/03-product.mjs scripts/needo-roadshow/slides/04-validation.mjs
git commit -m "feat(bp): build product validation and go-to-market slides"
```

---

### Task 5: Produce slides 19–26 — economics, financial scenarios, governance, and return

**Files:**
- Create: `scripts/needo-roadshow/slides/05-economics.mjs`
- Create: `scripts/needo-roadshow/slides/06-finance.mjs`

**Slide allocation:**

- 第19頁：商戶投資回報與CPS增量毛利公式。
- 第20頁：固定費回收、成熟店鋪示例與CPS獲客公式。
- 第21頁：五類替代方案及CPS能力競爭格局。
- 第22頁：供需、CPS轉化與信任五層壁壘。
- 第23頁：一般／激進三年財務方案。
- 第24頁：資金用途與第18個月雙方案里程碑。
- 第25頁：治理與四個責任單元。
- 第26頁：5年投資回報、稀釋敏感度與邀請。

- [ ] 實作 `buildEconomicsSlides(pptx, ctx)` 與 `buildFinanceSlides(pptx, ctx)`。
- [ ] 第19頁把商戶節省、補位新增毛利與減少損失明確排除在 NeeDo 營業收入之外；CPS商戶效益按「達人歸因完成訂單新增毛利－優惠－已釋放佣金－活動成本」計算，並禁止把自然訂單重複歸因。
- [ ] 第20頁由 `data.mjs` 計算58,800日圓六個月固定費收入、3.1個月毛回收、80筆月訂單、40,000日圓預約費及49,800日圓單店月收入；另展示「有效CPS獲客成本＝佣金＋優惠＋素材／營運＋歸因／結算成本，除以通過退款期的新客數」，不填虛構比率。
- [ ] 第21頁只比較可由競品官方網站核驗的能力；新增達人服務選擇、點擊至履約歸因、佣金／結算／風控三個比較維度；價格不明時使用「依方案／需詢價」，不製造統一費率。
- [ ] 第22頁把達人、內容、服務、受眾、區域及真實履約組成的CPS轉化圖譜列為第三層壁壘；所有供需與CPS資料壁壘均標為融資後隨真實交易形成的目標，不暗示已擁有大規模交易或達人資料。
- [ ] 第23頁使用三組原生直條圖：期末活躍店鋪、營業收入、營業利潤；一般為綠色、激進為橙色，負值以紅色顯示。
- [ ] 第23頁只從 `scenarios.general` 與 `scenarios.aggressive` 取值；顯示一般第9個月、激進第10個月單月營業利潤轉正。
- [ ] 第24頁以原生圓環圖呈現30/25/15/15/15資金用途；30%產品項明確涵蓋人工智慧調度與CPS真實事件／歸因／結算正式化，並以雙軌里程碑呈現一般與激進第18個月目標。
- [ ] 第25頁不創造團隊姓名或履歷；四個責任單元必須涵蓋CPS歸因／結算、達人商業合作標示及佣金風控，再展示月度報告、季度董事會與受監管服務開放門檻。
- [ ] 第26頁由公式生成50／100／200億日圓退出情境、2.5／5／10倍及約20.1%／38.0%／58.5%內部報酬率，另顯示8%與6%持股稀釋敏感度。
- [ ] 投資回報頁緊鄰顯示「示意情境、非估值承諾或收益保證、未扣稅費／交易成本／未來稀釋」。
- [ ] 生成第19–26頁開發版，轉成PDF，核對所有圖表數值、圖例、負值、單位與註記。

**Run:**

```bash
NODE_PATH=/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/needo-roadshow/build.mjs --range 19-26 --out /private/tmp/needo-roadshow-19-26.pptx
/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 /Users/eason/.agents/skills/anthropic-skills/skills/pptx/scripts/office/soffice.py --headless --convert-to pdf --outdir /private/tmp /private/tmp/needo-roadshow-19-26.pptx
pdftoppm -png -r 144 /private/tmp/needo-roadshow-19-26.pdf /private/tmp/needo-roadshow-19-26
```

**Expected:** 開發版包含8頁；第19–22頁清楚區分CPS公式、可操作原型與融資後資料壁壘；第23頁沒有保守方案；第26頁的倍數和內部報酬率均由相同輸入公式產生。

**Commit:**

```bash
git add scripts/needo-roadshow/slides/05-economics.mjs scripts/needo-roadshow/slides/06-finance.mjs
git commit -m "feat(bp): build economics finance and return slides"
```

---

### Task 6: Produce slides 27–34 — investor diligence appendix

**Files:**
- Create: `scripts/needo-roadshow/slides/07-appendix.mjs`

**Slide allocation:**

- 第27頁：保守／一般／激進完整假設。
- 第28頁：一般與激進36個月收入、利潤、現金曲線。
- 第29頁：含達人CPS／廣告撮合的八類收入結構演變。
- 第30頁：成本與組織擴張。
- 第31頁：市場來源與研究方法。
- 第32頁：接待型夜間場所與成人性服務的合規邊界。
- 第33頁：已完成／可操作原型／融資後正式化產品成熟度。
- 第34頁：十一類主要風險與應對。

- [ ] 實作 `buildAppendixSlides(pptx, ctx)`，共8頁且只使用已凍結資料與來源登錄。
- [ ] 第27頁以三欄比較完整列出店鋪、流失、技師、完單、海外使用者、店鋪推廣、達人／廣告撮合收入、人力及主要成本假設；硬編碼輸入使用同一視覺標記，模型未提供的達人數、佣金率及歸因轉化率保持空白並標示「模型未提供」。
- [ ] 第28頁一般與激進分成兩個座標區，各自顯示月營收、月營業利潤與月末現金，不把不同量級擠在同一軸。
- [ ] 第29頁使用原生100%堆疊直條圖；達人CPS／廣告撮合沿用V2.2後續收入口徑，第一年尚未啟用的收入維持零，不用視覺最小值假裝有收入。
- [ ] 第30頁將研發、非研發、雲端、品牌、商務、客服安全、行政、成功報酬、獲店、eKYC、支付、風險準備及返還分成可讀成本群組；模型未獨立列示CPS佣金或達人營運成本時標示「尚未拆分」，不從其他成本推定。
- [ ] 第31頁把官方／原始來源、公司本地文件與訪談觀察分區；CPS成熟度引用 `docs/NEEDO_AFIRIEITO_ADMIN_DEVELOPMENT.md`、`src/features/business-cps/model.ts`、`src/features/business-cps/logic.ts` 及測試，每個市場數字附年份、口徑及可追溯URL或本地路徑。
- [ ] 第32頁明確區分キャバクラ等接待型夜間場所與成人性服務，並列出許可、年齡、營業時間、廣告、支付、消費者保護、資料隔離及營運主體門檻。
- [ ] 第33頁將多模式排班，以及CPS推廣計畫、服務選擇、素材、專屬連結／推廣碼／二維碼、歸因、佣金狀態、結算、風控與稽核流程列為本地／靜態可操作原型；將真實曝光至退款事件、不可竄改歸因、正式佣金結算、反作弊與財務對帳列為融資後正式化；同頁保留透明點單的成熟度邊界。
- [ ] 第34頁完整覆蓋十一類風險：店鋪轉化、供需密度、現金消耗、排班同意、隱私安全、帳單爭議、CPS錯誤／重複歸因與佣金詐欺、達人內容違規、受監管服務法律支付、繞單及預測偏差。
- [ ] 生成第27–34頁開發版，轉成PDF，檢查小字、表格、圖例、來源網址及法律邊界。

**Run:**

```bash
NODE_PATH=/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/needo-roadshow/build.mjs --range 27-34 --out /private/tmp/needo-roadshow-27-34.pptx
/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 /Users/eason/.agents/skills/anthropic-skills/skills/pptx/scripts/office/soffice.py --headless --convert-to pdf --outdir /private/tmp /private/tmp/needo-roadshow-27-34.pptx
pdftoppm -png -r 144 /private/tmp/needo-roadshow-27-34.pdf /private/tmp/needo-roadshow-27-34
```

**Expected:** 開發版包含8頁；保守情境只出現在附錄；第29–30頁不虛構CPS收入或成本假設；第32與33頁不把受監管業務、靜態點單或CPS原型表述為已正式商用。

**Commit:**

```bash
git add scripts/needo-roadshow/slides/07-appendix.mjs
git commit -m "feat(bp): add investor diligence appendix"
```

---

### Task 7: Add the full-deck builder and semantic verification

**Files:**
- Modify: `scripts/needo-roadshow/build.mjs`
- Create: `scripts/needo-roadshow/verify.mjs`

**Build contract:**

```ts
type BuildDeckOptions = { outputPath: string; range?: `${number}-${number}` };
type VerifyDeckOptions = { pptxPath: string; manifestPath: string; reportPath: string };
type VerificationResult = { passed: boolean; checks: readonly string[]; warnings: readonly string[]; slideCount: number; titleSequence: readonly string[] };

export declare function buildDeck(options: BuildDeckOptions): Promise<void>;
export declare function verifyDeck(options: VerifyDeckOptions): Promise<VerificationResult>;
```

- [ ] 完成 `build.mjs`：載入PptxGenJS、設定 `LAYOUT_WIDE`、作者／主旨／公司、母版語言及16:9版面，按1–34頁固定順序呼叫七個章節模組。
- [ ] 保留並測試 `--range 1-9` 及 `--out path`；省略範圍時建立完整34頁。
- [ ] 建置時寫出 `source-manifest.json`，包含每頁標題、證據標籤、來源ID、數字來源與成熟度。
- [ ] `verify.mjs` 檢查34頁、26＋8分界、頁碼連續、標題順序、每頁主視覺、每頁來源／口徑、數字精確值及融資條件一致。
- [ ] 加入禁用語檢查：舊版費率、100家簽約、已創造營收、已部署人工智慧、未經同意自動派單、成人服務現已支援、點單已正式後端化、已有活躍達人網路、已有歸因成交額、CPS已產生收入、CPS已有正式後端。
- [ ] 加入關鍵文案檢查：價格事前可見、項目由客人選擇、追加消費再次確認、即時消費總額、逐項帳單、使用意向、模型預測、回報非保證聲明、人工智慧調度、CPS達人成交增長、真實履約訂單、佣金退款／風控條件及可操作原型。
- [ ] 加入色彩與頁型檢查：每頁背景只能是 `FFFFFF`、`F8FBF9` 或 `EDF5F1`；投影片 XML／SVG 不得包含 `00DC5A`、`00A98F`、`5F9C88`、`4F8F7A` 或大面積 `000000`／`17221F`；第1、14頁必須引用原創有機曲面資產。
- [ ] 加入繁簡用字守門；允許官方原始文件名的簡體中文，但投影片標題與正文不得出現「增长」「财务」「预约」「门店」等簡體用字。
- [ ] 完整執行三個Node測試檔，再建立最終PPTX並執行語意驗證。

**Run:**

```bash
mkdir -p outputs/needo-roadshow-2026-08-23/preview
NODE_PATH=/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test scripts/needo-roadshow/tests/*.test.mjs
NODE_PATH=/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/needo-roadshow/build.mjs --out outputs/needo-roadshow-2026-08-23/NeeDo_海外投資人路演級BP_繁中_2026-08-23.pptx
NODE_PATH=/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/needo-roadshow/verify.mjs --pptx outputs/needo-roadshow-2026-08-23/NeeDo_海外投資人路演級BP_繁中_2026-08-23.pptx --manifest outputs/needo-roadshow-2026-08-23/source-manifest.json --report outputs/needo-roadshow-2026-08-23/verification.json
```

**Expected:** 三個測試檔全部通過；建置器產生34頁PPTX；`verification.json` 顯示 `passed: true`、`slideCount: 34` 且沒有禁用語。

**Commit:**

```bash
git add scripts/needo-roadshow/build.mjs scripts/needo-roadshow/verify.mjs
git commit -m "feat(bp): add full roadshow builder and verification"
```

---

### Task 8: Validate Office structure, export PDF, and extract text

**Files:**
- Create: `scripts/needo-roadshow/extract-pptx-text.py`
- Create: `scripts/needo-roadshow/make-contact-sheet.mjs`
- Generate: `outputs/needo-roadshow-2026-08-23/NeeDo_海外投資人路演級BP_繁中_2026-08-23.pdf`
- Generate: `outputs/needo-roadshow-2026-08-23/extracted-text.txt`
- Generate: `outputs/needo-roadshow-2026-08-23/preview/slide-01.png` through `slide-34.png`
- Generate: `outputs/needo-roadshow-2026-08-23/preview/contact-sheet.jpg`

- [ ] 執行官方PPTX結構驗證，修正關係、內容類型、圖表或媒體錯誤，直到回傳成功。
- [ ] 用LibreOffice把完整PPTX匯出為PDF；確認PDF固定34頁且頁面比例為16:9。
- [ ] `extract-pptx-text.py` 以python-pptx依投影片順序輸出頁碼、標題、正文、圖表標籤與備註；文字順序固定可供搜尋。
- [ ] 使用pypdf核對PDF頁數、媒體框及可提取文字；缺少可提取文字的頁面必須由投影片文字層修正，不以圖片取代。
- [ ] 使用 `pdftoppm -png -r 144` 將全部34頁渲染為 `slide-01.png` 至 `slide-34.png`。
- [ ] `make-contact-sheet.mjs` 以Sharp建立5欄聯絡表，每格顯示頁碼；不得縮小到無法辨識主要標題。
- [ ] 搜尋擷取文字，確認34個標題、2億日圓、10%、100家使用意向、9,800日圓、500日圓、30,000日圓、一般／激進、人工智慧調度、CPS達人成交增長、真實履約訂單、可操作原型、點單透明化與非保證聲明完整存在。

**Run:**

```bash
/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 /Users/eason/.agents/skills/anthropic-skills/skills/pptx/scripts/office/validate.py outputs/needo-roadshow-2026-08-23/NeeDo_海外投資人路演級BP_繁中_2026-08-23.pptx
/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 /Users/eason/.agents/skills/anthropic-skills/skills/pptx/scripts/office/soffice.py --headless --convert-to pdf --outdir outputs/needo-roadshow-2026-08-23 outputs/needo-roadshow-2026-08-23/NeeDo_海外投資人路演級BP_繁中_2026-08-23.pptx
/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/needo-roadshow/extract-pptx-text.py outputs/needo-roadshow-2026-08-23/NeeDo_海外投資人路演級BP_繁中_2026-08-23.pptx outputs/needo-roadshow-2026-08-23/extracted-text.txt
pdftoppm -png -r 144 outputs/needo-roadshow-2026-08-23/NeeDo_海外投資人路演級BP_繁中_2026-08-23.pdf outputs/needo-roadshow-2026-08-23/preview/slide
NODE_PATH=/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/needo-roadshow/make-contact-sheet.mjs outputs/needo-roadshow-2026-08-23/preview outputs/needo-roadshow-2026-08-23/preview/contact-sheet.jpg
```

**Expected:** Office驗證成功；PDF為34頁；`extracted-text.txt` 依1–34頁排列；預覽資料夾有34張頁面圖與1張聯絡表。

**Commit:**

```bash
git add scripts/needo-roadshow/extract-pptx-text.py scripts/needo-roadshow/make-contact-sheet.mjs
git commit -m "test(bp): add export and visual QA tooling"
```

---

### Task 9: Perform two-pass visual QA and repair every defect

**Files:**
- Modify as needed: `scripts/needo-roadshow/theme.mjs`
- Modify as needed: `scripts/needo-roadshow/components.mjs`
- Modify as needed: `scripts/needo-roadshow/diagrams.mjs`
- Modify as needed: `scripts/needo-roadshow/slides/*.mjs`
- Regenerate: `outputs/needo-roadshow-2026-08-23/*`

- [ ] 第一輪使用聯絡表檢查整體節奏：白色／暖白／霧綠比例、章節轉換、有機曲面重複度、模組化網格、資訊密度、圖表色彩、頁碼及品牌一致性；確認白色與綠色為唯一主配色、綠色柔和不刺眼，且整體更像可信生活服務基礎設施而非娛樂影音平台。
- [ ] 第二輪逐張開啟34張144 DPI頁面圖，檢查中文方框、替代字體換行、文字截斷、重疊、低對比、模糊圖片、表格過密、來源過小、負值顏色及頁面邊界。
- [ ] 對每個問題回到來源元件修正，不在輸出PDF上覆蓋補丁；修改後重新產生PPTX、PDF、頁面圖與聯絡表。
- [ ] 對財務頁逐項人工比對 `data.mjs`：一般／激進三年數字、第18個月數字、轉正月份、最低現金、資金用途、倍數與內部報酬率。
- [ ] 對產品頁逐項人工檢查成熟度：已完成、可操作原型、融資後建置不得混用；高消費點單不得列入核心損益；CPS種子資料及示例點擊、訂單、成交額、佣金不得出現在實際驗證或業績區。
- [ ] 對第14、17、19、20、22、24、29、33、34頁人工核對CPS：雙引擎交會點、試點指標、商戶增量毛利、有效獲客成本、轉化圖譜、資金用途、收入邊界、成熟度及風險必須一致。
- [ ] 對合規頁人工檢查：接待型夜間場所與成人性服務分開；法規及支付結論有來源與非法律意見邊界。
- [ ] 重新執行全部測試、語意驗證、Office結構驗證、PDF頁數及文字擷取，直到所有檢查通過。
- [ ] 在 `verification.json` 加入人工檢查紀錄：檢查日期、34頁完成、修正輪次、剩餘警告；剩餘警告必須為空陣列。

**Run:**

```bash
NODE_PATH=/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test scripts/needo-roadshow/tests/*.test.mjs
NODE_PATH=/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/needo-roadshow/verify.mjs --pptx outputs/needo-roadshow-2026-08-23/NeeDo_海外投資人路演級BP_繁中_2026-08-23.pptx --manifest outputs/needo-roadshow-2026-08-23/source-manifest.json --report outputs/needo-roadshow-2026-08-23/verification.json
/Users/eason/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 /Users/eason/.agents/skills/anthropic-skills/skills/pptx/scripts/office/validate.py outputs/needo-roadshow-2026-08-23/NeeDo_海外投資人路演級BP_繁中_2026-08-23.pptx
```

**Expected:** 全部自動檢查通過；34頁已逐頁人工查看；沒有截斷、重疊、方框、佔位文字、舊版費率、錯誤成熟度或未註明的模型預測。

**Commit:**

```bash
git add scripts/needo-roadshow
git commit -m "fix(bp): complete full-deck visual and content QA"
```

---

### Task 10: Final package and handoff

**Files:**
- Verify: `outputs/needo-roadshow-2026-08-23/NeeDo_海外投資人路演級BP_繁中_2026-08-23.pptx`
- Verify: `outputs/needo-roadshow-2026-08-23/NeeDo_海外投資人路演級BP_繁中_2026-08-23.pdf`
- Verify: `outputs/needo-roadshow-2026-08-23/source-manifest.json`
- Verify: `outputs/needo-roadshow-2026-08-23/verification.json`
- Verify: `outputs/needo-roadshow-2026-08-23/preview/contact-sheet.jpg`

- [ ] 計算PPTX、PDF及聯絡表的SHA-256，記錄在最終交付訊息中。
- [ ] 確認PPTX可重新開啟、PDF可讀、兩者均為34頁，且檔名日期與簡報封面一致。
- [ ] 確認 `git status --short` 沒有把使用者原有修改或二進位輸出加入暫存區。
- [ ] 最終交付訊息提供PPTX、PDF、聯絡表及驗證報告的可點擊絕對路徑。
- [ ] 明確說明四項口徑：100+為使用意向、財務為模型預測、高消費點單為本地／靜態原型、CPS管理流程為本地狀態驅動的可操作原型且尚無真實歸因收入。
- [ ] 列出本次重新核驗的官方來源類別及資料日期，不把投資回報描述為承諾。

**Run:**

```bash
shasum -a 256 outputs/needo-roadshow-2026-08-23/NeeDo_海外投資人路演級BP_繁中_2026-08-23.pptx outputs/needo-roadshow-2026-08-23/NeeDo_海外投資人路演級BP_繁中_2026-08-23.pdf outputs/needo-roadshow-2026-08-23/preview/contact-sheet.jpg
git status --short
```

**Expected:** 三個雜湊均成功產生；交付目錄包含兩個34頁主檔、來源清單、驗證報告、文字擷取、34張預覽與聯絡表；Git暫存區不含無關檔案。

**Commit:** 此任務不提交二進位交付物；前一任務已提交所有可重建來源與驗證程式。

## Final Acceptance Checklist

- [ ] 34頁順序與核准規格完全一致。
- [ ] 全篇繁體中文，沒有英文頁面標題及未授權簡體文案。
- [ ] 2億日圓、10%股權、18億融資前、20億融資後全篇一致。
- [ ] 100+只表述為店鋪使用意向。
- [ ] 一般與激進方案數字、轉正月份及第18個月里程碑正確。
- [ ] 保守方案只出現在附錄壓力測試。
- [ ] 固定費9,800日圓、第四個月起每單500日圓、六個月最低合約、30,000日圓成功報酬口徑一致。
- [ ] 高消費場所透明點單包含含稅價格、客人選擇、追加確認、即時總額及逐項帳單。
- [ ] 第14頁以真實完成履約訂單為交會點，清楚呈現人工智慧調度與CPS達人成交增長雙引擎。
- [ ] CPS完整包含服務選擇、內容／連結／推廣碼／二維碼、預約、履約、歸因、退款／風控及佣金結算。
- [ ] 不存在虛構的活躍達人數、歸因成交額、佣金率、點擊轉化率、活動投資回報或結算紀錄。
- [ ] 點單、排班與CPS的可操作原型、融資後正式化邊界清晰。
- [ ] 接待型夜間場所與成人性服務的法律性質分開表述。
- [ ] 每頁都有有意義的視覺、證據標籤、頁碼及來源／口徑。
- [ ] 全篇以白色、暖白及霧綠為背景，沒有大面積黑色、深色章節底、高飽和亮綠或霓虹效果。
- [ ] 封面、章節及雙引擎頁使用原創半透明綠色曲面，不複製使用者參考圖的字母、素材或版式。
- [ ] 財務圖表可在PowerPoint內編輯。
- [ ] PPTX結構驗證成功，PDF與PPTX均為34頁。
- [ ] 34頁全部渲染並逐頁檢查，沒有截斷、重疊、方框、低對比或模糊表格。
- [ ] 文字擷取包含完整頁序、標題、核心數字及風險聲明。
- [ ] `verification.json` 為通過狀態且剩餘警告為空。
