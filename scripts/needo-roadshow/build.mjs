import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { T, organicRibbon, networkSvg } from "./theme.mjs";
import { financing, scenarios, economics, market, sources, slideTitles } from "./data.mjs";
import {
  addBackground, addHeader, addFooter, addCard, addPill, addStat, addBody,
  addSectionLabel, addProcess, addMetricTable, addCallout,
} from "./components.mjs";

const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs");
const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "NeeDo";
pptx.company = "NeeDo";
pptx.subject = "海外投資人 Pre-A 路演簡報";
pptx.title = "NeeDo 海外投資人路演｜繁體中文母版";
pptx.lang = "zh-TW";
pptx.theme = {
  headFontFace: T.font,
  bodyFontFace: T.font,
  lang: "zh-TW",
};
pptx.defineSlideMaster({
  title: "NEEDO_WHITE_GREEN",
  background: { color: T.c.white },
  objects: [
    { text: { text: "NeeDo", options: { x: 11.62, y: 6.88, w: 0.95, h: 0.2, fontFace: T.font, fontSize: 9, color: T.c.data, bold: true, align: "right", margin: 0 } } },
  ],
  slideNumber: { x: 12.62, y: 6.88, w: 0.25, h: 0.2, fontFace: T.font, fontSize: 8.5, color: T.c.muted, align: "right", margin: 0 },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outDir = path.join(root, "outputs/needo-roadshow-2026-08-23");
fs.mkdirSync(outDir, { recursive: true });

const moneyM = (v) => `¥${Number(v).toLocaleString("zh-TW", { maximumFractionDigits: 0 })}M`;
const moneyB = (v) => `¥${(v / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 1 })}B`;
const num = (v) => Number(v).toLocaleString("zh-TW", { maximumFractionDigits: 0 });
const pct = (v) => `${Number(v).toFixed(1)}%`;

function slideBase(page, { ribbon = true, flip = page % 2 === 0, tint = T.c.white, source = "" } = {}) {
  const slide = pptx.addSlide("NEEDO_WHITE_GREEN");
  addBackground(slide, pptx, { ribbon, flip, tint });
  if (page > 1 && page < 34) addHeader(slide, pptx, slideTitles[page - 1], page);
  if (page > 1 && page < 34) addFooter(slide, source);
  return slide;
}

function addBar(slide, { labels, series, x = 0.8, y = 2, w = 5.5, h = 3.8, colors = [T.c.data, T.c.orange], maxVal, showLegend = true, showValue = true, valAxisTitle = "" }) {
  slide.addChart(pptx.ChartType.bar, series.map((s) => ({ name: s.name, labels, values: s.values })), {
    x, y, w, h,
    catAxisLabelFontFace: T.font,
    catAxisLabelFontSize: 10,
    valAxisLabelFontFace: T.font,
    valAxisLabelFontSize: 9,
    valAxisTitle,
    valAxisTitleFontFace: T.font,
    valAxisTitleFontSize: 9,
    showLegend,
    legendFontFace: T.font,
    legendFontSize: 9,
    legendPos: "b",
    showTitle: false,
    showValue,
    dataLabelPosition: "outEnd",
    dataLabelColor: T.c.ink,
    dataLabelFormatCode: "0",
    chartColors: colors,
    showCatName: false,
    showValAxisTitle: Boolean(valAxisTitle),
    showCatAxisTitle: false,
    showValue: showValue,
    showGridLines: true,
    gridLine: { color: T.c.line, transparency: 30 },
    showBorder: false,
    showValAxis: true,
    showCatAxis: true,
    valAxisMaxVal: maxVal,
  });
}

function addLineChart(slide, { labels, series, x = 0.8, y = 2, w = 6, h = 3.8, colors = [T.c.data, T.c.orange, T.c.muted], showLegend = true, showValue = false, minVal = 0 }) {
  slide.addChart(pptx.ChartType.line, series.map((s) => ({ name: s.name, labels, values: s.values })), {
    x, y, w, h,
    catAxisLabelFontFace: T.font,
    catAxisLabelFontSize: 9,
    valAxisLabelFontFace: T.font,
    valAxisLabelFontSize: 9,
    showLegend,
    legendFontFace: T.font,
    legendFontSize: 9,
    legendPos: "b",
    showTitle: false,
    showValue,
    dataLabelColor: T.c.ink,
    dataLabelFormatCode: "0",
    chartColors: colors,
    lineSize: 2.5,
    showMarker: true,
    markerSize: 5,
    showGridLines: true,
    gridLine: { color: T.c.line, transparency: 25 },
    showBorder: false,
    valAxisMinVal: minVal,
  });
}

function roleNode(slide, x, y, label, sub, accent = T.c.data) {
  slide.addShape(pptx.ShapeType.ellipse, { x, y, w: 1.18, h: 1.18, fill: { color: T.c.white }, line: { color: accent, width: 1.8 } });
  slide.addText(label, { x: x + 0.12, y: y + 0.28, w: 0.94, h: 0.22, fontFace: T.font, fontSize: 12, bold: true, color: T.c.ink, align: "center", margin: 0, fit: "shrink" });
  slide.addText(sub, { x: x + 0.12, y: y + 0.58, w: 0.94, h: 0.25, fontFace: T.font, fontSize: 8.5, color: T.c.muted, align: "center", margin: 0, fit: "shrink" });
}

function note(slide, text, x, y, w, h = 0.34, color = T.c.muted) {
  addBody(slide, text, { x, y, w, h, size: 9.2, color });
}

// 01 封面
{
  const slide = slideBase(1, { ribbon: false, tint: T.c.warmWhite });
  slide.addImage({ data: organicRibbon({ color: T.c.mist, opacity: 0.96 }), x: 0, y: 2.95, w: 13.333, h: 4.25 });
  slide.addShape(pptx.ShapeType.ellipse, { x: 9.95, y: 0.72, w: 2.35, h: 2.35, fill: { color: T.c.mist, transparency: 15 }, line: { color: T.c.green, transparency: 58, width: 1 } });
  slide.addShape(pptx.ShapeType.ellipse, { x: 10.51, y: 1.28, w: 1.23, h: 1.23, fill: { color: T.c.white, transparency: 18 }, line: { color: T.c.data, width: 1.2 } });
  slide.addText("NeeDo", { x: 0.74, y: 0.56, w: 2.2, h: 0.42, fontFace: T.font, fontSize: 22, bold: true, color: T.c.dark, margin: 0 });
  slide.addText("讓日本服務業\n從人工協調走向可規模化履約", { x: 0.74, y: 1.55, w: 8.5, h: 1.52, fontFace: T.font, fontSize: 31, bold: true, color: T.c.ink, breakLine: false, margin: 0, fit: "shrink", paraSpaceAfterPt: 5 });
  slide.addText("AI排班 × 交易履約 × 透明點單 × CPS增長", { x: 0.78, y: 3.64, w: 6.65, h: 0.33, fontFace: T.font, fontSize: 14, bold: true, color: T.c.dark, margin: 0 });
  addPill(slide, pptx, "Pre-A", { x: 0.78, y: 4.18, w: 1.1, fill: T.c.dark, color: T.c.white, border: T.c.dark });
  addPill(slide, pptx, "融資 2億日圓", { x: 2.02, y: 4.18, w: 1.72 });
  addPill(slide, pptx, "出讓 10% 股權", { x: 3.9, y: 4.18, w: 1.72 });
  slide.addText("繁體中文海外投資人版｜2026年8月", { x: 0.78, y: 6.54, w: 4.2, h: 0.24, fontFace: T.font, fontSize: 10.5, color: T.c.muted, margin: 0 });
  slide.addText("機密｜僅供合格投資人討論", { x: 9.67, y: 6.54, w: 2.7, h: 0.24, fontFace: T.font, fontSize: 10, color: T.c.muted, align: "right", margin: 0 });
}

// 02 投資命題
{
  const slide = slideBase(2);
  addCallout(slide, pptx, "NeeDo不是另一個預約入口；它是跨店鋪、服務者、客人與場所的履約作業系統。", { x: 0.72, y: 1.53, w: 11.88, h: 0.72 });
  const items = [
    ["市場時機", "訪日與在留外國人創新高，語言友善供給不足"],
    ["產品楔子", "從電話／LINE人工協調切入AI排班與交易閉環"],
    ["增長引擎", "CPS把內容、達人與可履約服務連接起來"],
    ["財務槓桿", "SaaS建立關係，交易與增值收入放大毛利"],
  ];
  items.forEach(([title, text], i) => {
    const x = 0.72 + i * 3.02;
    addCard(slide, pptx, { x, y: 2.64, w: 2.78, h: 2.55, fill: i === 0 ? T.c.mist : T.c.white });
    slide.addShape(pptx.ShapeType.ellipse, { x: x + 0.2, y: 2.87, w: 0.42, h: 0.42, fill: { color: i === 3 ? T.c.orange : T.c.data }, line: { transparency: 100 } });
    slide.addText(String(i + 1), { x: x + 0.2, y: 2.96, w: 0.42, h: 0.2, fontFace: T.font, fontSize: 10, bold: true, color: T.c.white, align: "center", margin: 0 });
    addBody(slide, title, { x: x + 0.2, y: 3.55, w: 2.35, h: 0.28, size: 15.5, bold: true });
    addBody(slide, text, { x: x + 0.2, y: 4.05, w: 2.35, h: 0.73, size: 11.5, color: T.c.muted });
  });
  addBody(slide, "投資焦點", { x: 0.8, y: 5.62, w: 1.0, h: 0.24, size: 10.5, bold: true, color: T.c.data });
  addBody(slide, "2億日圓用於18個月內把『可操作原型＋使用意向』轉化為可驗證的付費、留存與跨城市密度。", { x: 1.9, y: 5.55, w: 9.85, h: 0.42, size: 13.5, bold: true });
}

// 03 需求側
{
  const slide = slideBase(3, { source: "來源：JNTO 2025年訪日外客統計；出入國在留管理廳 2025年末統計（S1、S2）" });
  addStat(slide, pptx, { x: 0.72, y: 1.6, w: 3.5, h: 1.55, value: "4,268萬", label: "2025年訪日外客", sub: "年增 15.8%｜歷史新高" });
  addStat(slide, pptx, { x: 4.48, y: 1.6, w: 3.5, h: 1.55, value: "412.5萬", label: "2025年末在留外國人", sub: "年增 9.5%｜歷史新高" });
  addStat(slide, pptx, { x: 8.24, y: 1.6, w: 3.5, h: 1.55, value: "雙增長", label: "短期訪日＋長期居住", sub: "同時提高多語生活服務需求", accent: T.c.orange, fill: T.c.orangePale });
  addSectionLabel(slide, pptx, "投資含義", { x: 0.76, y: 3.66, w: 1.25 });
  addProcess(slide, pptx, [
    { title: "人數上升", sub: "更多跨語言需求" },
    { title: "供給分散", sub: "店鋪與服務者未數位化" },
    { title: "不確定性高", sub: "價格、取消、場所、可接待性" },
    { title: "平台價值", sub: "把可服務性變成可搜尋、可預約" },
  ], { x: 0.76, y: 4.18, w: 11.75, h: 1.28 });
  addCallout(slide, pptx, "需求不是單純『翻譯』問題，而是供給能否承諾、履約與保障。", { x: 2.02, y: 5.79, w: 9.2, h: 0.65 });
}

// 04 預約現狀
{
  const slide = slideBase(4, { source: "來源：NeeDo 團隊對店鋪與服務者的商談觀察（S7）；行業描述屬質性洞察" });
  addBody(slide, "典型流程（以高協調度的出張／風俗相關場景為例）", { x: 0.76, y: 1.52, w: 6.9, h: 0.3, size: 14.5, bold: true });
  addProcess(slide, pptx, [
    { title: "客人電話", sub: "詢問空檔與條件" },
    { title: "店鋪聯絡", sub: "用LINE／電話找服務者" },
    { title: "服務者確認", sub: "行程與移動時間" },
    { title: "再次回覆", sub: "與客人確認預約" },
    { title: "人工說明", sub: "場所、規則與費用" },
  ], { x: 0.76, y: 2.08, w: 11.82, h: 1.32 });
  const rows = [
    ["變更", "技師臨時取消", "重新找人＋重新聯絡客人＋重算移動"],
    ["擴店", "新增分店／合作服務者", "排班與通訊錄複雜度成倍增加"],
    ["跨語言", "非日語客戶詢問", "人工作業更慢，部分店鋪直接拒絕"],
    ["場所", "店內／飯店／其他地點", "規則與可用性需逐單確認"],
  ];
  addMetricTable(slide, pptx, { x: 0.78, y: 3.82, w: 11.72, rows, headers: ["觸發事件", "第一層麻煩", "連鎖成本"], colWidths: [0.16, 0.28, 0.56] });
  addCallout(slide, pptx, "一次行程變更，可能讓店鋪與中介的人力、時間成本同步翻倍。", { x: 2.05, y: 6.1, w: 9.1, h: 0.62, accent: T.c.risk, fill: T.c.riskPale });
}

// 05 真正瓶頸
{
  const slide = slideBase(5);
  slide.addImage({ data: networkSvg(), x: 0.75, y: 1.52, w: 7.0, h: 2.3 });
  const labels = [[1.05,2.33,"客人"],[2.25,1.72,"店鋪"],[2.28,3.05,"中介"],[3.87,2.35,"NeeDo"],[5.24,1.72,"服務者"],[5.35,3.05,"場所"],[6.55,2.35,"履約"]];
  labels.forEach(([x,y,t]) => addBody(slide, t, { x, y, w: 0.65, h: 0.2, size: 9.5, bold: true, align: "center", color: t === "NeeDo" ? T.c.white : T.c.ink }));
  addCard(slide, pptx, { x: 8.12, y: 1.52, w: 4.15, h: 2.32, fill: T.c.mist });
  addBody(slide, "真正瓶頸", { x: 8.42, y: 1.86, w: 1.5, h: 0.25, size: 13, bold: true, color: T.c.data });
  addBody(slide, "不是預約入口，而是店鋪、中介、服務者、客人與場所之間的即時協調。", { x: 8.42, y: 2.32, w: 3.45, h: 0.92, size: 17, bold: true });
  addSectionLabel(slide, pptx, "另一個被忽略的風險", { x: 0.78, y: 4.28, w: 2.02, accent: T.c.orange });
  addCard(slide, pptx, { x: 0.78, y: 4.85, w: 11.48, h: 1.38, fill: T.c.orangePale, line: T.c.orange });
  addBody(slide, "防止高消費場所資訊不透明與事後爭議", { x: 1.08, y: 5.12, w: 4.05, h: 0.31, size: 16, bold: true, color: T.c.risk });
  addBody(slide, "NeeDo點單系統把含稅價格、可選項、追加確認、即時累計與明細帳單放進同一流程，可用於キャバクラ等高消費場景。", { x: 5.26, y: 5.0, w: 6.55, h: 0.74, size: 12.5, color: T.c.ink });
  note(slide, "目前為本地／靜態可操作原型；正式商用需接支付、權限、審計與監管要求。", 5.26, 5.82, 6.55, 0.3, T.c.risk);
}

// 06 角色痛點
{
  const slide = slideBase(6);
  const roles = [
    ["店鋪", "排班、空檔、取消、場所、說明全部人工"],
    ["中介", "逐一聯絡兩端；每次變更重做一次流程"],
    ["服務者", "隱私暴露、行程衝突、移動與收入不可預測"],
    ["客人", "看不到即時可用性、總價、取消與保障"],
    ["場所", "可否接待、時間與規則未與交易同步"],
    ["平台", "若只有流量入口，無法控制履約與歸因"],
  ];
  roles.forEach(([r,t],i)=>{
    const col=i%3,row=Math.floor(i/3),x=0.76+col*4.02,y=1.58+row*2.28;
    addCard(slide,pptx,{x,y,w:3.72,h:1.92,fill:i===5?T.c.mist:T.c.white});
    addPill(slide,pptx,r,{x:x+0.2,y:y+0.2,w:0.86,fill:i===5?T.c.dark:T.c.mist,color:i===5?T.c.white:T.c.dark,border:i===5?T.c.dark:T.c.line});
    addBody(slide,t,{x:x+0.2,y:y+0.78,w:3.25,h:0.72,size:12.3,bold:true});
  });
  addCallout(slide,pptx,"NeeDo的核心價值：讓所有角色共享同一個可更新、可追蹤、可結算的事實。",{x:1.62,y:6.31,w:10.0,h:0.58});
}

// 07 外國客阻力
{
  const slide = slideBase(7, { source: "來源：NeeDo 商談觀察與產品假設（S7）；屬待量化驗證的市場問題" });
  addSectionLabel(slide,pptx,"外國客的實際旅程",{x:0.76,y:1.5,w:1.65});
  addProcess(slide,pptx,[
    {title:"找到店鋪",sub:"資訊分散、搜尋詞不一致"},
    {title:"詢問可否接待",sub:"部分店鋪不提供外語預約"},
    {title:"理解規則",sub:"價格、場所、取消條款不清"},
    {title:"等待人工回覆",sub:"時差與電話門檻"},
    {title:"承擔不確定性",sub:"臨時取消或無法溝通"},
  ],{x:0.76,y:2.05,w:11.82,h:1.32,accent:T.c.orange});
  const blockers=[
    ["語言", "不支援日語以外的預約與說明"],
    ["信任", "價格與額外費用難以預先確認"],
    ["可用性", "電話後仍需等待店鋪逐一確認"],
    ["保障", "取消、改約與爭議缺乏標準化"],
  ];
  blockers.forEach(([a,b],i)=>{
    const x=0.78+i*3.0;
    addCard(slide,pptx,{x,y:3.85,w:2.72,h:1.62,fill:i%2?T.c.white:T.c.riskPale,line:i%2?T.c.line:T.c.orange});
    addBody(slide,a,{x:x+0.2,y:4.15,w:0.8,h:0.24,size:13,bold:true,color:T.c.risk});
    addBody(slide,b,{x:x+0.2,y:4.56,w:2.28,h:0.48,size:11.2,bold:true});
  });
  addCallout(slide,pptx,"多語介面只是第一步；真正的外國人友好，是讓供給、價格與履約承諾都可被確認。",{x:1.52,y:5.92,w:10.2,h:0.68});
}

// 08 市場機會
{
  const slide = slideBase(8, { source: "來源：JNTO、出入國在留管理廳、警察廳；市場層級為NeeDo策略框架（S1–S3）" });
  const rings=[
    {x:0.83,y:1.57,w:5.25,h:5.0,color:T.c.mist,title:"生活服務基礎設施",sub:"跨業態、跨城市的預約與履約網路"},
    {x:1.45,y:2.16,w:4.0,h:3.82,color:"DCECE4",title:"高摩擦本地服務",sub:"按摩、出張、到店、夜間與高消費場景"},
    {x:2.1,y:2.79,w:2.7,h:2.55,color:"C4DED1",title:"第一楔子",sub:"電話／LINE人工協調最深的店鋪"},
  ];
  rings.forEach((r)=>{
    slide.addShape(pptx.ShapeType.ellipse,{x:r.x,y:r.y,w:r.w,h:r.h,fill:{color:r.color,transparency:8},line:{color:T.c.data,transparency:55,width:1}});
  });
  rings.forEach((r)=>{
    addBody(slide,r.title,{x:r.x+0.55,y:r.y+0.38,w:r.w-1.1,h:0.28,size:r.w>5?14:r.w>3?13:12,bold:true,align:"center",color:T.c.dark});
    addBody(slide,r.sub,{x:r.x+0.55,y:r.y+r.h-0.78,w:r.w-1.1,h:0.38,size:9.8,align:"center",color:T.c.muted});
  });
  addCard(slide,pptx,{x:6.62,y:1.57,w:5.62,h:5.0,fill:T.c.white});
  addBody(slide,"由下而上的進場邏輯",{x:6.96,y:1.92,w:2.7,h:0.28,size:15,bold:true});
  addMetricTable(slide,pptx,{x:6.95,y:2.52,w:4.95,headers:["層級","驗證指標","擴張門檻"],colWidths:[0.27,0.38,0.35],rows:[
    ["第一城市", "付費店數／留存", "形成供需密度"],
    ["第二業態", "排班節省時間", "流程可複製"],
    ["外國客", "轉換／取消／NPS", "多語履約穩定"],
    ["CPS", "可歸因GMV", "佣金結算可信"],
    ["跨城市", "單城回本期", "渠道與供給可複製"],
  ]});
  addCallout(slide,pptx,"供給側參考（非TAM、類別可能交疊）：接待飲食59,695；深夜酒類258,163；性風俗特殊營業34,861（獨立監管）。",{x:6.98,y:5.46,w:4.9,h:0.78});
}

// 09 合規分層
{
  const slide=slideBase(9,{source:"來源：厚生勞動省資格制度、警察廳業態統計（S3、S4）；實際營業須逐業態取得法律意見"});
  const cols=[
    {x:0.78,title:"近期核心",accent:T.c.data,items:["一般按摩／美容／到店服務","出張型生活服務","餐飲與高消費場所點單","合規店鋪SaaS與排班"]},
    {x:4.78,title:"條件式擴展",accent:T.c.orange,items:["有資格要求的按摩等服務","酒店／場所聯合預約","跨店供給池與外部服務者","支付、保險與身份驗證"]},
    {x:8.78,title:"獨立監管市場",accent:T.c.risk,items:["成人性服務相關業態","依所在地、營業類型分層","現行條款禁止；未納入核心收入","須獨立法務、審核與風控"]},
  ];
  cols.forEach((c,i)=>{
    addCard(slide,pptx,{x:c.x,y:1.57,w:3.55,h:4.72,fill:i===0?T.c.mist:i===1?T.c.orangePale:T.c.riskPale,line:c.accent});
    addPill(slide,pptx,c.title,{x:c.x+0.24,y:1.85,w:1.45,fill:c.accent,color:T.c.white,border:c.accent});
    c.items.forEach((item,j)=>{
      slide.addShape(pptx.ShapeType.ellipse,{x:c.x+0.28,y:2.64+j*0.72,w:0.18,h:0.18,fill:{color:c.accent},line:{transparency:100}});
      addBody(slide,item,{x:c.x+0.58,y:2.53+j*0.72,w:2.55,h:0.42,size:11.2,bold:j===0});
    });
  });
  addCallout(slide,pptx,"投資模型的核心情境不依賴成人性服務收入；該市場僅作為未來獨立評估的受監管選項。",{x:1.5,y:6.45,w:10.25,h:0.48,accent:T.c.risk,fill:T.c.riskPale});
}

// 10 產品總覽
{
  const slide=slideBase(10);
  addCard(slide,pptx,{x:4.88,y:2.15,w:3.55,h:2.25,fill:T.c.dark,line:T.c.dark});
  addBody(slide,"NeeDo",{x:5.65,y:2.63,w:2.0,h:0.45,size:25,bold:true,color:T.c.white,align:"center"});
  addBody(slide,"可履約的服務交易核心",{x:5.35,y:3.31,w:2.62,h:0.26,size:11.5,bold:true,color:T.c.mist,align:"center"});
  const modules=[
    [0.75,1.63,"多語預約","把需求變成可確認訂單"],
    [0.75,4.12,"透明點單","含稅價格、追加確認、明細"],
    [9.03,1.63,"AI排班","人、時間、技能、距離與場所"],
    [9.03,4.12,"CPS增長","達人內容到歸因與佣金"],
    [4.88,5.22,"結算與風控","權益、退款、爭議、審計"],
  ];
  modules.forEach(([x,y,t,s],i)=>{
    addCard(slide,pptx,{x,y,w:i===4?3.55:3.45,h:1.45,fill:i===4?T.c.orangePale:T.c.white,line:i===4?T.c.orange:T.c.line});
    addBody(slide,t,{x:x+0.22,y:y+0.3,w:(i===4?3.1:3.0),h:0.28,size:15,bold:true,color:i===4?T.c.risk:T.c.dark,align:"center"});
    addBody(slide,s,{x:x+0.22,y:y+0.79,w:(i===4?3.1:3.0),h:0.3,size:10,color:T.c.muted,align:"center"});
    const tx=i===4?6.65: i<2?4.88:8.43;
    const ty=i===4?4.4:y+0.58;
    slide.addShape(pptx.ShapeType.line,{x:Math.min(x+3.45,tx),y:ty,w:Math.abs(tx-(x+3.45)),h:0,line:{color:T.c.green,width:1.6,beginArrowType:i<2?"none":"triangle",endArrowType:i<2?"triangle":"none"}});
  });
}

// 11 履約閉環
{
  const slide=slideBase(11);
  addProcess(slide,pptx,[
    {title:"發現",sub:"搜尋／達人／連結／QR"},
    {title:"選擇",sub:"服務者、時間、場所、項目"},
    {title:"確認",sub:"可用性、總價、規則"},
    {title:"調度",sub:"排班、替補、移動、通知"},
    {title:"履約",sub:"到店／上門／場所協同"},
    {title:"結算",sub:"付款、退款、佣金、對帳"},
  ],{x:0.72,y:1.76,w:11.88,h:1.42});
  slide.addShape(pptx.ShapeType.arc,{x:1.38,y:3.6,w:10.55,h:2.62,adjustPoint:0.25,rotate:180,fill:{color:T.c.white,transparency:100},line:{color:T.c.data,width:2.2,beginArrowType:"none",endArrowType:"triangle"}});
  addCard(slide,pptx,{x:4.12,y:3.7,w:5.1,h:1.58,fill:T.c.mist});
  addBody(slide,"每一個節點都產生可驗證資料",{x:4.52,y:4.02,w:4.3,h:0.3,size:16,bold:true,align:"center"});
  addBody(slide,"需求 → 承諾 → 變更 → 完單 → 評價 → 佣金",{x:4.42,y:4.54,w:4.5,h:0.25,size:11.5,color:T.c.data,bold:true,align:"center"});
  addCallout(slide,pptx,"從『有人打電話協調』變成『系統知道為什麼成功、失敗或需要替補』。",{x:2.1,y:5.84,w:9.15,h:0.64});
}

// 12 AI排班
{
  const slide=slideBase(12);
  addCard(slide,pptx,{x:0.75,y:1.55,w:5.0,h:4.95,fill:T.c.white});
  addBody(slide,"排班輸入",{x:1.05,y:1.92,w:1.2,h:0.26,size:14,bold:true,color:T.c.data});
  const inputs=["服務者技能與可用時段","店鋪與場所規則","客人時間／地點偏好","移動時間與連續行程","取消風險與替補優先序"];
  inputs.forEach((t,i)=>{
    addPill(slide,pptx,t,{x:1.05,y:2.45+i*0.64,w:3.94,fill:i===3?T.c.orangePale:T.c.mist,color:i===3?T.c.risk:T.c.dark,border:i===3?T.c.orange:T.c.line});
  });
  addCard(slide,pptx,{x:6.18,y:1.55,w:6.15,h:4.95,fill:T.c.mist});
  addBody(slide,"AI輸出不是一張靜態班表",{x:6.55,y:1.92,w:3.75,h:0.28,size:15,bold:true});
  addProcess(slide,pptx,[
    {title:"建議班表",sub:"滿足技能與工時"},
    {title:"衝突警示",sub:"重疊與不可達"},
    {title:"替補排序",sub:"內部優先、外部補位"},
  ],{x:6.55,y:2.46,w:5.4,h:1.28,number:false});
  addProcess(slide,pptx,[
    {title:"即時重排",sub:"變更後局部更新"},
    {title:"人機共決",sub:"店鋪可覆核與鎖定"},
    {title:"原因可見",sub:"保留決策與操作紀錄"},
  ],{x:6.55,y:4.08,w:5.4,h:1.28,number:false,accent:T.c.orange});
  addCallout(slide,pptx,"目標不是取代店長，而是把店長從反覆打電話中解放。",{x:3.05,y:6.05,w:7.25,h:0.6});
}

// 13 供給池
{
  const slide=slideBase(13);
  addSectionLabel(slide,pptx,"人員不足時",{x:0.76,y:1.5,w:1.28,accent:T.c.risk});
  const layers=[
    {y:2.02,title:"店內服務者",sub:"先用已簽約、熟悉規則的人員",color:T.c.dark,w:4.0},
    {y:3.12,title:"同集團／合作店",sub:"在權限與利益分配下共享空檔",color:T.c.data,w:5.6},
    {y:4.22,title:"外部認證服務者",sub:"身份、資格、技能、評價與保險條件",color:T.c.green,w:7.2},
    {y:5.32,title:"跨城市供給網路",sub:"形成供給密度後擴展至更大範圍",color:T.c.orange,w:8.8},
  ];
  layers.forEach((l,i)=>{
    const x=0.82+(8.8-l.w)/2;
    slide.addShape(pptx.ShapeType.roundRect,{x,y:l.y,w:l.w,h:0.78,rectRadius:0.2,fill:{color:l.color,transparency:i===3?5:0},line:{transparency:100}});
    addBody(slide,l.title,{x:x+0.25,y:l.y+0.14,w:1.75,h:0.22,size:12,bold:true,color:T.c.white});
    addBody(slide,l.sub,{x:x+2.05,y:l.y+0.14,w:l.w-2.3,h:0.32,size:10,color:T.c.white,align:"right"});
  });
  addCard(slide,pptx,{x:9.65,y:1.9,w:2.62,h:4.55,fill:T.c.mist});
  addBody(slide,"調配原則",{x:10.02,y:2.24,w:1.8,h:0.28,size:14,bold:true,align:"center"});
  ["規則與資格先行","店內資源優先","成本與移動可見","需人工覆核的例外","收入與責任可追蹤"].forEach((t,i)=>{
    slide.addShape(pptx.ShapeType.ellipse,{x:10.03,y:2.91+i*0.57,w:0.17,h:0.17,fill:{color:i===3?T.c.orange:T.c.data},line:{transparency:100}});
    addBody(slide,t,{x:10.3,y:2.79+i*0.57,w:1.55,h:0.32,size:10.2,bold:true});
  });
}

// 14 隱私與跳單
{
  const slide=slideBase(14);
  addCard(slide,pptx,{x:0.76,y:1.55,w:5.38,h:4.85,fill:T.c.riskPale,line:T.c.risk});
  addBody(slide,"平台外聯絡的負循環",{x:1.08,y:1.93,w:2.3,h:0.28,size:15,bold:true,color:T.c.risk});
  addProcess(slide,pptx,[
    {title:"交換私人聯絡",sub:"跳過店鋪或中介"},
    {title:"平台失去紀錄",sub:"無法確認責任與價格"},
    {title:"隱私與安全風險",sub:"騷擾、糾紛與追責困難"},
  ],{x:1.08,y:2.55,w:4.72,h:1.42,accent:T.c.risk});
  addBody(slide,"結果：店鋪失去抽成，服務者失去保障，客人失去申訴依據。",{x:1.12,y:4.57,w:4.55,h:0.66,size:12.3,bold:true});
  addCard(slide,pptx,{x:6.5,y:1.55,w:5.82,h:4.85,fill:T.c.mist,line:T.c.data});
  addBody(slide,"NeeDo的正向設計",{x:6.84,y:1.93,w:2.3,h:0.28,size:15,bold:true,color:T.c.dark});
  const protections=[
    ["代理聯絡與遮罩", "在需要時隱藏私人電話與ID"],
    ["平台內權益", "退款、改約、點數與保障僅在平台內生效"],
    ["可追蹤溝通", "保留必要紀錄，同時實施最小化存取"],
    ["合理利益分配", "讓店鋪、中介、服務者都有留在平台內的動機"],
  ];
  protections.forEach(([a,b],i)=>{
    addPill(slide,pptx,a,{x:6.86,y:2.5+i*0.75,w:1.58});
    addBody(slide,b,{x:8.62,y:2.5+i*0.75,w:3.15,h:0.37,size:10.6,bold:true});
  });
  addCallout(slide,pptx,"反跳單不是靠封鎖，而是讓平台內交易比平台外交易更安全、更省事、更有價值。",{x:1.58,y:6.56,w:10.25,h:0.42});
}

// 15 透明點單
{
  const slide=slideBase(15,{source:"來源：NeeDo 點單原型（S7）；目前尚未接真實支付、後端審計或監管流程"});
  addCard(slide,pptx,{x:0.78,y:1.5,w:4.4,h:5.35,fill:T.c.warmWhite});
  addBody(slide,"客人端即時帳單",{x:1.12,y:1.86,w:2.1,h:0.27,size:15,bold:true});
  const orderRows=[["入場費（含稅）","¥6,600"],["飲品套餐","¥4,400"],["指名服務","¥3,300"],["追加項目（待確認）","¥2,200"]];
  orderRows.forEach(([a,b],i)=>{
    addBody(slide,a,{x:1.12,y:2.48+i*0.56,w:2.0,h:0.22,size:10.8,color:i===3?T.c.risk:T.c.ink,bold:i===3});
    addBody(slide,b,{x:3.46,y:2.48+i*0.56,w:1.1,h:0.22,size:10.8,bold:true,align:"right",color:i===3?T.c.risk:T.c.ink});
    slide.addShape(pptx.ShapeType.line,{x:1.12,y:2.83+i*0.56,w:3.45,h:0,line:{color:T.c.line,width:0.7}});
  });
  addBody(slide,"目前累計",{x:1.12,y:5.0,w:1.3,h:0.24,size:12,bold:true});
  addBody(slide,"¥16,500",{x:3.1,y:4.88,w:1.45,h:0.38,size:21,bold:true,align:"right",color:T.c.dark});
  addPill(slide,pptx,"確認追加",{x:1.1,y:5.65,w:1.42,fill:T.c.dark,color:T.c.white,border:T.c.dark});
  addPill(slide,pptx,"拒絕追加",{x:2.72,y:5.65,w:1.42,fill:T.c.white,color:T.c.risk,border:T.c.risk});
  addCard(slide,pptx,{x:5.58,y:1.5,w:6.72,h:5.35,fill:T.c.mist});
  addBody(slide,"透明化的五個產品規則",{x:5.96,y:1.86,w:3.2,h:0.28,size:15,bold:true});
  const rules=[
    ["01","含稅價格先顯示","避免基礎費用與稅金事後出現"],
    ["02","所有項目可選","預設不勾選，不以口頭默認"],
    ["03","追加需再次確認","客人能接受或拒絕每次變更"],
    ["04","總額即時更新","消費過程中持續看得到累計"],
    ["05","明細可追蹤","為結算、退款與爭議保留證據"],
  ];
  rules.forEach(([n,a,b],i)=>{
    slide.addShape(pptx.ShapeType.ellipse,{x:5.98,y:2.46+i*0.74,w:0.42,h:0.42,fill:{color:i===2?T.c.orange:T.c.data},line:{transparency:100}});
    addBody(slide,n,{x:5.98,y:2.56+i*0.74,w:0.42,h:0.16,size:8.5,bold:true,color:T.c.white,align:"center"});
    addBody(slide,a,{x:6.6,y:2.43+i*0.74,w:1.65,h:0.22,size:11,bold:true});
    addBody(slide,b,{x:8.28,y:2.43+i*0.74,w:3.42,h:0.35,size:10,color:T.c.muted});
  });
}

// 16 CPS 引擎
{
  const slide=slideBase(16,{source:"來源：NeeDo CPS 可操作原型（S7）；尚無真實歸因GMV與佣金收入"});
  addBody(slide,"服務與達人的有機融合",{x:0.78,y:1.52,w:3.2,h:0.34,size:17,bold:true,color:T.c.dark});
  addProcess(slide,pptx,[
    {title:"達人內容",sub:"影片、貼文、直播、推薦"},
    {title:"專屬入口",sub:"連結、代碼、QR、落地頁"},
    {title:"服務預約",sub:"選人、選時、選場所"},
    {title:"真實履約",sub:"排班、替補、完單"},
    {title:"CPS結算",sub:"退款風險後計佣"},
  ],{x:0.78,y:2.16,w:11.72,h:1.42,accent:T.c.data});
  addCard(slide,pptx,{x:0.82,y:4.08,w:5.55,h:2.1,fill:T.c.mist});
  addBody(slide,"對達人",{x:1.16,y:4.43,w:1.1,h:0.25,size:13,bold:true,color:T.c.data});
  addBody(slide,"不只帶流量，而是推廣有庫存、有時間、有履約能力的服務；收入與真實完單綁定。",{x:1.16,y:4.92,w:4.72,h:0.67,size:12.2,bold:true});
  addCard(slide,pptx,{x:6.78,y:4.08,w:5.55,h:2.1,fill:T.c.orangePale,line:T.c.orange});
  addBody(slide,"對店鋪",{x:7.12,y:4.43,w:1.1,h:0.25,size:13,bold:true,color:T.c.risk});
  addBody(slide,"把分散的KOL合作從『人工對帳』轉為可歸因訂單、可退單修正、可結算佣金。",{x:7.12,y:4.92,w:4.72,h:0.67,size:12.2,bold:true});
  addCallout(slide,pptx,"AI排班提升履約效率；CPS擴大可歸因需求——兩個引擎相互增強。",{x:2.15,y:6.45,w:9.0,h:0.44});
}

// 17 CPS 歸因
{
  const slide=slideBase(17,{source:"來源：NeeDo CPS 產品設計與原型（S7）；流程為目標架構"});
  const phases=[
    ["流量",["內容ID","達人ID","入口ID"]],
    ["轉換",["預約ID","服務／店鋪","優惠與價格"]],
    ["履約",["確認／取消","替補與改約","完單狀態"]],
    ["風險",["退款","爭議","無效與作弊"]],
    ["結算",["可佣金GMV","分佣規則","對帳與付款"]],
  ];
  phases.forEach(([title,items],i)=>{
    const x=0.76+i*2.42;
    addCard(slide,pptx,{x,y:1.58,w:2.18,h:3.86,fill:i===4?T.c.dark:i===3?T.c.riskPale:T.c.white,line:i===3?T.c.risk:i===4?T.c.dark:T.c.line});
    addPill(slide,pptx,title,{x:x+0.26,y:1.88,w:0.92,fill:i===4?T.c.white:i===3?T.c.risk:T.c.mist,color:i===4?T.c.dark:i===3?T.c.white:T.c.dark,border:i===4?T.c.white:i===3?T.c.risk:T.c.line});
    items.forEach((t,j)=>{
      slide.addShape(pptx.ShapeType.ellipse,{x:x+0.3,y:2.77+j*0.7,w:0.17,h:0.17,fill:{color:i===4?T.c.white:i===3?T.c.risk:T.c.data},line:{transparency:100}});
      addBody(slide,t,{x:x+0.6,y:2.64+j*0.7,w:1.22,h:0.34,size:10.2,bold:true,color:i===4?T.c.white:T.c.ink});
    });
    if(i<4) slide.addShape(pptx.ShapeType.chevron,{x:x+2.13,y:3.27,w:0.32,h:0.34,fill:{color:T.c.green},line:{transparency:100}});
  });
  addCallout(slide,pptx,"佣金只在『可歸因、已履約、通過退款與風險窗口』後確認。",{x:2.45,y:5.92,w:8.4,h:0.68});
  note(slide,"正式商用前需補齊後端事件、反作弊、退款回沖、權限、稅務與佣金付款流程。",3.06,6.7,7.2,0.22,T.c.risk);
}

// 18 產品成熟度
{
  const slide=slideBase(18,{source:"來源：NeeDo 目前產品與代碼庫盤點（S7）；截至2026-08-23"});
  const stages=[
    {title:"已可操作",accent:T.c.data,items:["多端高保真流程","商戶排班與調度介面","透明點單本地／靜態原型","CPS本地狀態原型"]},
    {title:"本輪融資後",accent:T.c.orange,items:["核心後端與資料庫正式化","事件歸因與佣金結算","支付、退款、權限與審計","首批付費店鋪與留存驗證"]},
    {title:"尚未宣稱",accent:T.c.risk,items:["尚無100家正式簽約","尚無歸因GMV／CPS真實收入","尚無跨城市規模化履約","成人性服務未納入核心產品"]},
  ];
  stages.forEach((s,i)=>{
    const x=0.76+i*4.02;
    addCard(slide,pptx,{x,y:1.58,w:3.7,h:4.7,fill:i===0?T.c.mist:i===1?T.c.orangePale:T.c.riskPale,line:s.accent});
    addPill(slide,pptx,s.title,{x:x+0.25,y:1.88,w:1.28,fill:s.accent,color:T.c.white,border:s.accent});
    s.items.forEach((t,j)=>{
      slide.addShape(pptx.ShapeType.ellipse,{x:x+0.3,y:2.75+j*0.7,w:0.18,h:0.18,fill:{color:s.accent},line:{transparency:100}});
      addBody(slide,t,{x:x+0.62,y:2.62+j*0.7,w:2.58,h:0.36,size:11,bold:true});
    });
  });
  addCallout(slide,pptx,"目前最重要的商業任務不是增加更多功能，而是把意向轉成付費、使用、留存與可量化節省。",{x:1.35,y:6.48,w:10.65,h:0.46});
}

// 19 商業驗證
{
  const slide=slideBase(19,{source:"來源：NeeDo 團隊商談紀錄（S7）；100+為使用意向，非簽約／收入／活躍店鋪"});
  addStat(slide,pptx,{x:0.78,y:1.58,w:4.1,h:2.0,value:"100+",label:"表達使用意向的店鋪",sub:"尚未等同正式簽約、付費或活躍使用"});
  addCard(slide,pptx,{x:5.28,y:1.58,w:7.0,h:2.0,fill:T.c.mist});
  addBody(slide,"已驗證的是『問題強度』，下一步要驗證『付費強度』。",{x:5.72,y:1.94,w:6.05,h:0.48,size:18,bold:true});
  addBody(slide,"本輪融資把商談意向推進為標準化試點：簽約 → 上線 → 使用 → 完單 → 留存 → 擴店。",{x:5.72,y:2.72,w:5.95,h:0.43,size:12.2,color:T.c.muted,bold:true});
  addSectionLabel(slide,pptx,"試點漏斗",{x:0.78,y:4.02,w:1.12});
  addProcess(slide,pptx,[
    {title:"使用意向",sub:"100+店鋪"},
    {title:"試點簽約",sub:"明確責任與驗收"},
    {title:"完成導入",sub:"班表、服務、規則、權限"},
    {title:"首筆完單",sub:"真實訂單與履約事件"},
    {title:"月度留存",sub:"持續使用與續費"},
    {title:"擴店／推薦",sub:"可複製的渠道證據"},
  ],{x:0.78,y:4.58,w:11.72,h:1.42});
  addCallout(slide,pptx,"對外披露原則：意向、簽約、付費、活躍與收入五個口徑分開報告。",{x:2.4,y:6.34,w:8.52,h:0.48,accent:T.c.orange,fill:T.c.orangePale});
}

// 20 GTM
{
  const slide=slideBase(20);
  addCard(slide,pptx,{x:0.78,y:1.52,w:7.15,h:5.1,fill:T.c.white});
  addBody(slide,"密度優先的四階段進場",{x:1.12,y:1.88,w:2.65,h:0.28,size:15,bold:true});
  const gtm=[
    ["01","高痛點店鋪","以商談意向池轉試點；先證明節省人時"],
    ["02","同城供給密度","串聯合作店與外部服務者，縮短替補時間"],
    ["03","外國客需求","多語搜尋、規則說明、支付與客服"],
    ["04","達人CPS增長","讓內容帶來可歸因完單，而非單純曝光"],
  ];
  gtm.forEach(([n,a,b],i)=>{
    slide.addShape(pptx.ShapeType.ellipse,{x:1.12,y:2.55+i*0.78,w:0.46,h:0.46,fill:{color:i===3?T.c.orange:T.c.data},line:{transparency:100}});
    addBody(slide,n,{x:1.12,y:2.67+i*0.78,w:0.46,h:0.16,size:8.8,bold:true,color:T.c.white,align:"center"});
    addBody(slide,a,{x:1.82,y:2.52+i*0.78,w:1.45,h:0.22,size:11.5,bold:true});
    addBody(slide,b,{x:3.35,y:2.5+i*0.78,w:3.98,h:0.4,size:10.4,color:T.c.muted});
  });
  addCard(slide,pptx,{x:8.35,y:1.52,w:3.95,h:5.1,fill:T.c.mist});
  addBody(slide,"每城先看四個數字",{x:8.72,y:1.88,w:2.9,h:0.28,size:15,bold:true,align:"center"});
  const kpis=[["付費店鋪","密度與續費"],["每店完單","使用深度"],["替補成功","履約韌性"],["店鋪回本期","渠道效率"]];
  kpis.forEach(([a,b],i)=>{
    addStat(slide,pptx,{x:8.76+(i%2)*1.62,y:2.48+Math.floor(i/2)*1.52,w:1.46,h:1.25,value:["#","單","%","月"][i],label:a,sub:b,accent:i===3?T.c.orange:T.c.data,fill:T.c.white});
  });
  addCallout(slide,pptx,"不以全國曝光為先，而以一個城市內『可接單、可替補、可履約』為先。",{x:2.05,y:6.48,w:9.2,h:0.42});
}

// 21 商業模式
{
  const slide=slideBase(21,{source:"來源：NeeDo 財務模型V2.2（S5）；CPS費率尚待商業驗證"});
  const models=[
    ["店鋪SaaS","¥9,800／店／月","穩定基礎收入；Booking免費期不免月費",T.c.data],
    ["Booking平台費","¥500／收費完單","新店前三個月免費；之後隨完單增加",T.c.dark],
    ["增值收入","會員／Dou+／排名／S2B2C","模型於第2–3年逐步啟用",T.c.green],
    ["CPS佣金","按可歸因完單結算","費率與會計口徑尚待試點確認",T.c.orange],
  ];
  models.forEach(([a,b,c,d],i)=>{
    const x=0.78+(i%2)*6.0,y=1.56+Math.floor(i/2)*2.28;
    addCard(slide,pptx,{x,y,w:5.65,h:1.94,fill:i===3?T.c.orangePale:i===0?T.c.mist:T.c.white,line:i===3?T.c.orange:T.c.line});
    slide.addShape(pptx.ShapeType.ellipse,{x:x+0.28,y:y+0.3,w:0.45,h:0.45,fill:{color:d},line:{transparency:100}});
    addBody(slide,a,{x:x+0.94,y:y+0.26,w:1.6,h:0.26,size:14,bold:true,color:d});
    addBody(slide,b,{x:x+0.28,y:y+0.95,w:5.0,h:0.3,size:15,bold:true});
    addBody(slide,c,{x:x+0.28,y:y+1.42,w:5.0,h:0.24,size:9.8,color:T.c.muted});
  });
  addCallout(slide,pptx,"收入線很多，但共用同一個底層資產：已確認、可完成、可結算的服務交易。",{x:1.72,y:6.18,w:9.9,h:0.68});
}

// 22 單位經濟
{
  const slide=slideBase(22,{source:"來源：NeeDo 財務模型V2.2參數（S5）；簡化毛貢獻未含固定人力、店鋪獲客與稅務"});
  addStat(slide,pptx,{x:0.76,y:1.56,w:2.8,h:1.42,value:"¥9,800",label:"店鋪月費",sub:"最低合同期6個月"});
  addStat(slide,pptx,{x:3.78,y:1.56,w:2.8,h:1.42,value:"¥500",label:"Booking平台費",sub:"新店前三個月免費"});
  addStat(slide,pptx,{x:6.8,y:1.56,w:2.8,h:1.42,value:"約¥340",label:"單筆簡化毛貢獻",sub:"¥500－結算／風險／返還／雲成本",accent:T.c.dark});
  addStat(slide,pptx,{x:9.82,y:1.56,w:2.45,h:1.42,value:"68%",label:"簡化貢獻率",sub:"僅交易變動成本口徑",accent:T.c.orange,fill:T.c.orangePale});
  addCard(slide,pptx,{x:0.78,y:3.43,w:6.05,h:2.62,fill:T.c.white});
  addBody(slide,"店鋪獲客與回收",{x:1.12,y:3.78,w:2.2,h:0.28,size:15,bold:true});
  addMetricTable(slide,pptx,{x:1.12,y:4.3,w:5.35,headers:["渠道","獲店成本","僅SaaS毛收入回收"],colWidths:[0.33,0.28,0.39],rows:[
    ["廣告／活動", "¥15,000", "約1.5個月"],
    ["介紹／營業", "¥30,000", "約3.1個月"],
  ],highlightCol:2});
  note(slide,"回收期為簡化口徑：未扣帳戶雲成本、客服、人力與折扣；Booking收入可縮短回收。",1.12,5.52,5.35,0.3,T.c.risk);
  addCard(slide,pptx,{x:7.15,y:3.43,w:5.16,h:2.62,fill:T.c.mist});
  addBody(slide,"經濟模型的三個改善槓桿",{x:7.52,y:3.78,w:3.4,h:0.28,size:15,bold:true});
  [["提高每店完單","交易毛貢獻增加"],["降低月度流失","延長SaaS與交易LTV"],["自然／口碑占比上升","降低新增店鋪CAC"]].forEach(([a,b],i)=>{
    addPill(slide,pptx,a,{x:7.52,y:4.4+i*0.55,w:1.55});
    addBody(slide,b,{x:9.27,y:4.42+i*0.55,w:2.42,h:0.28,size:10.7,bold:true});
  });
  addCallout(slide,pptx,"關鍵不是單次下載，而是店鋪持續排班、持續完單、持續留在同一履約網路。",{x:1.88,y:6.43,w:9.58,h:0.47});
}

// 23 一般方案
{
  const s=scenarios.general;
  const slide=slideBase(23,{source:"來源：NeeDo 三年財務模型V2.2 一般方案（原高速增長方案）（S5）"});
  addBar(slide,{labels:["第1年","第2年","第3年"],series:[{name:"營收（百萬日圓）",values:s.revenueM.map(v=>Math.round(v))},{name:"營業利益（百萬日圓）",values:s.profitM.map(v=>Math.round(v))}],x:0.72,y:1.58,w:7.0,h:3.55,colors:[T.c.data,T.c.dark],showLegend:true});
  addCard(slide,pptx,{x:8.05,y:1.58,w:4.2,h:3.55,fill:T.c.mist});
  addBody(slide,"第3年目標",{x:8.43,y:1.94,w:1.6,h:0.25,size:14,bold:true,color:T.c.data});
  [["6,000店","活躍店鋪"],["638.6萬單","年度完單"],["¥4.16B","年度營收"],["56.5%","營業利益率"]].forEach(([a,b],i)=>{
    addBody(slide,a,{x:8.43,y:2.5+i*0.65,w:1.5,h:0.28,size:17,bold:true,color:i===3?T.c.orange:T.c.dark});
    addBody(slide,b,{x:10.1,y:2.57+i*0.65,w:1.55,h:0.22,size:10.5,bold:true,color:T.c.muted});
  });
  addMetricTable(slide,pptx,{x:0.78,y:5.28,w:11.46,headers:["一般方案","第1年","第2年","第3年"],colWidths:[0.28,0.24,0.24,0.24],highlightCol:3,rows:[
    ["活躍店鋪",num(s.stores[0]),num(s.stores[1]),num(s.stores[2])],
    ["年度營收",moneyM(s.revenueM[0]),moneyB(s.revenueM[1]),moneyB(s.revenueM[2])],
    ["營業利益率",pct(s.margin[0]),pct(s.margin[1]),pct(s.margin[2])],
  ]});
}

// 24 激進方案
{
  const s=scenarios.aggressive;
  const slide=slideBase(24,{source:"來源：NeeDo 激進情境敏感度模型（S6）；非承諾性預測"});
  addBar(slide,{labels:["第1年","第2年","第3年"],series:[{name:"營收（百萬日圓）",values:s.revenueM.map(v=>Math.round(v))},{name:"營業利益（百萬日圓）",values:s.profitM.map(v=>Math.round(v))}],x:0.72,y:1.58,w:7.0,h:3.55,colors:[T.c.orange,T.c.risk],showLegend:true});
  addCard(slide,pptx,{x:8.05,y:1.58,w:4.2,h:3.55,fill:T.c.orangePale,line:T.c.orange});
  addBody(slide,"第3年挑戰",{x:8.43,y:1.94,w:1.6,h:0.25,size:14,bold:true,color:T.c.risk});
  [["10,000店","活躍店鋪"],["1,523.7萬單","年度完單"],["¥8.91B","年度營收"],["52.9%","營業利益率"]].forEach(([a,b],i)=>{
    addBody(slide,a,{x:8.43,y:2.5+i*0.65,w:1.6,h:0.28,size:17,bold:true,color:T.c.risk});
    addBody(slide,b,{x:10.12,y:2.57+i*0.65,w:1.55,h:0.22,size:10.5,bold:true,color:T.c.muted});
  });
  addMetricTable(slide,pptx,{x:0.78,y:5.28,w:11.46,headers:["激進方案","第1年","第2年","第3年"],colWidths:[0.28,0.24,0.24,0.24],highlightCol:3,rows:[
    ["活躍店鋪",num(s.stores[0]),num(s.stores[1]),num(s.stores[2])],
    ["年度營收",moneyM(s.revenueM[0]),moneyB(s.revenueM[1]),moneyB(s.revenueM[2])],
    ["營業利益率",pct(s.margin[0]),pct(s.margin[1]),pct(s.margin[2])],
  ]});
}

// 25 資金用途
{
  const slide=slideBase(25);
  addBar(slide,{labels:["產品與工程","市場與店鋪導入","客服／安全／合規","營運資金"],series:[{name:"資金配置（百萬日圓）",values:[80,60,30,30]}],x:0.76,y:1.62,w:5.6,h:4.35,colors:[T.c.data],showLegend:false,maxVal:90});
  addCard(slide,pptx,{x:6.72,y:1.62,w:5.55,h:4.35,fill:T.c.mist});
  addBody(slide,"18個月里程碑",{x:7.08,y:1.98,w:2.2,h:0.28,size:15,bold:true});
  const ms=[
    ["M0–3","核心後端、資料模型、權限與支付／結算設計"],
    ["M4–6","意向店鋪轉試點；首批付費、完單與留存"],
    ["M7–12","AI調度實數據；CPS事件歸因與佣金試點"],
    ["M13–18","跨店供給池、第二城市與可複製GTM"],
  ];
  ms.forEach(([m,t],i)=>{
    addPill(slide,pptx,m,{x:7.08,y:2.57+i*0.68,w:0.88,fill:i===3?T.c.orange:T.c.white,color:i===3?T.c.white:T.c.dark,border:i===3?T.c.orange:T.c.line});
    addBody(slide,t,{x:8.18,y:2.55+i*0.68,w:3.55,h:0.4,size:10.7,bold:true});
  });
  addCallout(slide,pptx,"配置為管理層建議，可在投資條款與實際招募節奏確定後調整。",{x:6.96,y:5.45,w:5.05,h:0.48,accent:T.c.orange,fill:T.c.orangePale});
  note(slide,"資金用途：¥80M＋¥60M＋¥30M＋¥30M＝¥200M。",0.92,6.15,4.9,0.24,T.c.data);
}

// 26 投資條件與回報
{
  const slide=slideBase(26,{source:"回報示例為算術情境，未計後續稀釋、優先權、稅務、匯率或退出機率；不構成回報承諾"});
  addStat(slide,pptx,{x:0.76,y:1.56,w:2.55,h:1.42,value:"¥200M",label:"本輪融資",sub:"Pre-A"});
  addStat(slide,pptx,{x:3.55,y:1.56,w:2.55,h:1.42,value:"10%",label:"出讓股權",sub:"交割後口徑"});
  addStat(slide,pptx,{x:6.34,y:1.56,w:2.55,h:1.42,value:"¥1.8B",label:"投前估值",sub:"Pre-money"});
  addStat(slide,pptx,{x:9.13,y:1.56,w:3.1,h:1.42,value:"¥2.0B",label:"投後估值",sub:"Post-money",accent:T.c.orange,fill:T.c.orangePale});
  addBody(slide,"若投資人持股在退出時仍為10%：",{x:0.78,y:3.44,w:3.7,h:0.28,size:14,bold:true});
  addMetricTable(slide,pptx,{x:0.78,y:3.92,w:7.18,headers:["公司退出股權價值","投資人10%價值","對¥200M倍數"],colWidths:[0.36,0.34,0.30],highlightCol:2,rows:[
    ["¥10B", "¥1B", "5×"],
    ["¥30B", "¥3B", "15×"],
    ["¥50B", "¥5B", "25×"],
  ]});
  addCard(slide,pptx,{x:8.34,y:3.44,w:3.94,h:2.37,fill:T.c.mist});
  addBody(slide,"潛在退出路徑",{x:8.72,y:3.8,w:2.0,h:0.25,size:14,bold:true});
  [["策略併購","大型預約／支付／HR／旅遊平台"],["產業整合","店鋪SaaS或服務供給網路"],["資本市場","在多城市密度與可持續利潤後"]].forEach(([a,b],i)=>{
    addPill(slide,pptx,a,{x:8.72,y:4.32+i*0.47,w:0.92});
    addBody(slide,b,{x:9.82,y:4.31+i*0.47,w:1.98,h:0.28,size:9.3,bold:true});
  });
  addCallout(slide,pptx,"本輪投資的核心風險回報：在真實付費與留存尚未完成前入場，以資本換取早期定價與網路密度的上行。",{x:1.15,y:6.15,w:11.0,h:0.66,accent:T.c.orange,fill:T.c.orangePale});
}

// 27 保守情境
{
  const s=scenarios.conservative;
  const slide=slideBase(27,{source:"來源：NeeDo 三年財務模型V2.2 保守方案（S5）；附錄情境"});
  addBar(slide,{labels:["第1年","第2年","第3年"],series:[{name:"營收（百萬日圓）",values:s.revenueM.map(v=>Math.round(v))},{name:"營業利益（百萬日圓）",values:s.profitM.map(v=>Math.round(v))}],x:0.72,y:1.58,w:7.0,h:4.25,colors:[T.c.muted,T.c.data],showLegend:true});
  addCard(slide,pptx,{x:8.05,y:1.58,w:4.2,h:4.25,fill:T.c.warmWhite});
  addBody(slide,"第3年",{x:8.43,y:1.94,w:1.2,h:0.25,size:14,bold:true,color:T.c.muted});
  [["2,000店","活躍店鋪"],["82.0萬單","年度完單"],["¥643M","年度營收"],["38.5%","營業利益率"],["¥471M","期末現金"]].forEach(([a,b],i)=>{
    addBody(slide,a,{x:8.43,y:2.48+i*0.58,w:1.55,h:0.28,size:16,bold:true,color:T.c.dark});
    addBody(slide,b,{x:10.12,y:2.55+i*0.58,w:1.55,h:0.22,size:10.3,bold:true,color:T.c.muted});
  });
  addCallout(slide,pptx,"保守情境在第11個月後維持月度營業利益為正，最低現金約¥145M。",{x:1.75,y:6.15,w:9.75,h:0.64});
}

// 28 假設差異
{
  const slide=slideBase(28,{source:"來源：NeeDo V2.2 與激進情境敏感度模型（S5、S6）"});
  addMetricTable(slide,pptx,{x:0.72,y:1.55,w:11.88,headers:["核心假設","保守","一般","激進"],colWidths:[0.34,0.22,0.22,0.22],highlightCol:2,rows:[
    ["第3年活躍店鋪", "2,000", "6,000", "10,000"],
    ["每技師周均完單", "1.0", "2.0", "3.0"],
    ["最低合同期後月流失", "1.0%", "0.8%", "0.5%"],
    ["第3年外國用戶", "104,578", "1,045,785", "1,800,000"],
    ["第3年年均使用次數", "1.0", "2.0", "2.5"],
    ["第3年研發團隊", "10人", "15人", "25人"],
    ["首次持續月度盈利", "M11", "M9", "M10"],
    ["最低現金", "¥145M", "¥90M", "¥36M"],
  ]});
  addCallout(slide,pptx,"激進方案不是單純把收入放大：它同時提高人員、雲資源、行銷、BD、客服與管理成本。",{x:1.45,y:6.24,w:10.42,h:0.6,accent:T.c.orange,fill:T.c.orangePale});
}

// 29 現金與轉正
{
  const slide=slideBase(29,{source:"來源：NeeDo 三情境36個月財務模型（S5、S6）；每點為季度末現金"});
  const labels=["M3","M6","M9","M12","M15","M18","M21","M24","M27","M30","M33","M36"];
  addLineChart(slide,{labels,series:[
    {name:"保守",values:scenarios.conservative.cashQuarterM.map(v=>Math.round(v))},
    {name:"一般",values:scenarios.general.cashQuarterM.map(v=>Math.round(v))},
    {name:"激進",values:scenarios.aggressive.cashQuarterM.map(v=>Math.round(v))},
  ],x:0.72,y:1.55,w:8.15,h:4.65,colors:[T.c.muted,T.c.data,T.c.orange],showLegend:true});
  addCard(slide,pptx,{x:9.18,y:1.55,w:3.1,h:4.65,fill:T.c.mist});
  addBody(slide,"風險窗口",{x:9.52,y:1.92,w:1.5,h:0.25,size:14,bold:true});
  const riskRows=[
    ["保守","M10","¥145M","M11"],
    ["一般","M8","¥90M","M9"],
    ["激進","M9","¥36M","M10"],
  ];
  addMetricTable(slide,pptx,{x:9.5,y:2.5,w:2.45,headers:["情境","低點","現金","轉正"],colWidths:[0.27,0.22,0.29,0.22],rows:riskRows});
  addBody(slide,"最低現金仍為正，但激進方案緩衝明顯較薄；需以店鋪簽約、完單與招聘節奏設立觸發式支出。",{x:9.5,y:4.8,w:2.45,h:0.88,size:10.5,bold:true,color:T.c.risk});
  addCallout(slide,pptx,"管理原則：每月以現金低點、付費店鋪與完單密度決定是否解鎖下一批增長預算。",{x:1.42,y:6.39,w:10.4,h:0.48});
}

// 30 來源
{
  const slide=slideBase(30,{source:"來源清單同時輸出至 source-manifest.json"});
  addMetricTable(slide,pptx,{x:0.7,y:1.5,w:11.92,headers:["編號","來源","本簡報使用範圍"],colWidths:[0.08,0.45,0.47],rows:sources.map(s=>[s.id,s.title,s.used])});
  addCard(slide,pptx,{x:0.72,y:5.73,w:11.88,h:0.84,fill:T.c.mist});
  addBody(slide,"市場與法規資料採用官方來源；產品成熟度、意向店鋪與財務預測屬內部資料，需在投資盡調時提供原始證據。",{x:1.05,y:5.98,w:11.2,h:0.34,size:11.2,bold:true,align:"center"});
  note(slide,"所有外部資料抓取／核對日期：2026-08-23。",0.78,6.75,3.8,0.2,T.c.muted);
}

// 31 合規風險
{
  const slide=slideBase(31,{source:"來源：厚生勞動省、警察廳與NeeDo風控設計（S3、S4、S7）"});
  const rows=[
    ["資格與業態", "服務者無必要資格／店鋪業態不適用", "分類、證照、有效期與地域規則；高風險業態獨立准入"],
    ["消費透明", "追加費用與總價爭議", "含稅標價、逐項確認、即時總額、明細與審計"],
    ["隱私安全", "私下交換聯絡、騷擾與資料濫用", "代理聯絡、最小權限、保留期限、申訴與封禁"],
    ["履約風險", "取消、失聯、遲到、場所不符", "風險準備、替補、改約、場所規則與事件紀錄"],
    ["CPS合規", "虛假歸因、退單後佣金、廣告標示", "事件防作弊、退款回沖、佣金窗口、標示與稅務"],
    ["成人市場", "地方法規與營業類型複雜", "現行條款禁止；未來須獨立產品、法務與監管框架"],
  ];
  addMetricTable(slide,pptx,{x:0.7,y:1.5,w:11.92,headers:["風險域","主要風險","產品／營運控制"],colWidths:[0.16,0.31,0.53],rows});
  addCallout(slide,pptx,"合規不能在交易完成後補救；它必須在上架、預約、調度、點單、退款與結算每一層被執行。",{x:1.55,y:6.1,w:10.18,h:0.7,accent:T.c.risk,fill:T.c.riskPale});
}

// 32 路線圖
{
  const slide=slideBase(32);
  const road=[
    {q:"0–3月",title:"正式底座",items:["真實後端／資料庫","身份、角色、權限","支付與事件模型"]},
    {q:"4–6月",title:"付費試點",items:["意向店轉簽約","AI排班實用性","首筆完單與留存"]},
    {q:"7–12月",title:"雙引擎",items:["跨店供給池","CPS歸因與結算","多語交易與客服"]},
    {q:"13–18月",title:"可複製增長",items:["第二城市","渠道回本可見","擴店與達人網路"]},
  ];
  road.forEach((r,i)=>{
    const x=0.74+i*3.08;
    addCard(slide,pptx,{x,y:1.64,w:2.8,h:4.76,fill:i===3?T.c.orangePale:i===0?T.c.mist:T.c.white,line:i===3?T.c.orange:T.c.line});
    addPill(slide,pptx,r.q,{x:x+0.24,y:1.94,w:0.92,fill:i===3?T.c.orange:T.c.dark,color:T.c.white,border:i===3?T.c.orange:T.c.dark});
    addBody(slide,r.title,{x:x+0.24,y:2.58,w:2.3,h:0.3,size:15,bold:true,color:i===3?T.c.risk:T.c.dark});
    r.items.forEach((t,j)=>{
      slide.addShape(pptx.ShapeType.ellipse,{x:x+0.3,y:3.36+j*0.68,w:0.17,h:0.17,fill:{color:i===3?T.c.orange:T.c.data},line:{transparency:100}});
      addBody(slide,t,{x:x+0.58,y:3.24+j*0.68,w:1.82,h:0.36,size:10.8,bold:true});
    });
    if(i<3) slide.addShape(pptx.ShapeType.chevron,{x:x+2.75,y:3.75,w:0.38,h:0.42,fill:{color:T.c.green},line:{transparency:100}});
  });
  addCallout(slide,pptx,"每一階段都有可驗收的真實數據；未通過付費與留存，不提前解鎖爆發式擴張。",{x:1.55,y:6.55,w:10.15,h:0.36});
}

// 33 盡調清單
{
  const slide=slideBase(33);
  const checks=[
    ["商業",["100+意向清單與證據","試點合同與付費轉化","店鋪留存、完單、擴店"]],
    ["產品",["原型功能與真實後端邊界","AI排班效果基準","CPS事件、退款與結算"]],
    ["財務",["三情境模型與公式","CAC、毛貢獻與現金低點","收入確認與佣金口徑"]],
    ["合規",["資格與業態准入","隱私、支付、廣告與稅務","成人市場獨立隔離"]],
  ];
  checks.forEach(([title,items],i)=>{
    const x=0.74+i*3.08;
    addCard(slide,pptx,{x,y:1.57,w:2.8,h:4.92,fill:i%2?T.c.white:T.c.mist});
    addPill(slide,pptx,title,{x:x+0.24,y:1.9,w:0.9,fill:i===3?T.c.risk:T.c.dark,color:T.c.white,border:i===3?T.c.risk:T.c.dark});
    items.forEach((t,j)=>{
      slide.addShape(pptx.ShapeType.roundRect,{x:x+0.26,y:2.75+j*0.92,w:0.3,h:0.3,rectRadius:0.05,fill:{color:T.c.white},line:{color:i===3?T.c.risk:T.c.data,width:1.2}});
      addBody(slide,t,{x:x+0.72,y:2.69+j*0.92,w:1.72,h:0.48,size:10.5,bold:true});
    });
  });
  addCallout(slide,pptx,"我們願意把『已證明、待證明、未納入』三種狀態清楚分開，讓投資決策建立在同一事實基礎上。",{x:1.4,y:6.61,w:10.5,h:0.28});
}

// 34 收尾
{
  const slide=slideBase(34,{ribbon:false,tint:T.c.warmWhite});
  slide.addImage({data:organicRibbon({color:T.c.mist,opacity:0.98,flip:true}),x:0,y:3.03,w:13.333,h:4.25});
  slide.addText("NeeDo",{x:0.76,y:0.58,w:2.2,h:0.4,fontFace:T.font,fontSize:22,bold:true,color:T.c.dark,margin:0});
  slide.addText("讓服務被看見、被選擇、\n被完成、被分配",{x:0.76,y:1.54,w:7.0,h:1.22,fontFace:T.font,fontSize:31,bold:true,color:T.c.ink,margin:0,fit:"shrink"});
  addCallout(slide,pptx,"本輪：融資 2億日圓｜出讓 10% 股權｜Pre-A",{x:0.82,y:3.74,w:5.75,h:0.76,accent:T.c.dark,fill:T.c.white});
  addBody(slide,"把日本服務業最昂貴的人工協調，變成可計算、可追蹤、可規模化的履約網路。",{x:0.84,y:4.9,w:6.4,h:0.7,size:15,bold:true,color:T.c.dark});
  addCard(slide,pptx,{x:8.45,y:1.3,w:3.52,h:3.75,fill:T.c.white,line:T.c.data});
  addBody(slide,"下一步",{x:8.86,y:1.72,w:1.2,h:0.28,size:14,bold:true,color:T.c.data});
  [["01","產品與資料室展示"],["02","試點店鋪證據核對"],["03","模型與敏感度討論"],["04","條款與18個月里程碑"]].forEach(([n,t],i)=>{
    slide.addShape(pptx.ShapeType.ellipse,{x:8.88,y:2.33+i*0.58,w:0.34,h:0.34,fill:{color:i===3?T.c.orange:T.c.data},line:{transparency:100}});
    addBody(slide,n,{x:8.88,y:2.42+i*0.58,w:0.34,h:0.14,size:8,bold:true,color:T.c.white,align:"center"});
    addBody(slide,t,{x:9.48,y:2.3+i*0.58,w:1.95,h:0.3,size:10.5,bold:true});
  });
  slide.addText("機密｜僅供合格投資人討論｜2026年8月",{x:0.82,y:6.67,w:4.2,h:0.22,fontFace:T.font,fontSize:9.2,color:T.c.muted,margin:0});
}

if (pptx._slides.length !== 34) {
  throw new Error(`預期34頁，實際${pptx._slides.length}頁`);
}

const pptxPath = path.join(outDir, "NeeDo_海外投資人路演_BP_繁中母版_2026-08-23.pptx");
const manifestPath = path.join(outDir, "source-manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  deck: path.basename(pptxPath),
  language: "繁體中文",
  financing,
  disclosures: [
    "100+店鋪為使用意向，非簽約、付費或活躍店鋪。",
    "CPS與透明點單為可操作原型，尚無真實歸因GMV或CPS收入。",
    "成人性服務相關業態未納入核心財務模型，現行條款禁止。",
    "財務預測不構成回報承諾。",
  ],
  sources,
  slideTitles,
}, null, 2));

await pptx.writeFile({ fileName: pptxPath });
console.log(JSON.stringify({ pptxPath, manifestPath, slides: pptx._slides.length }, null, 2));
