const W = 13.333;
const H = 7.5;

const formatHundredMillion = (value) => `${(value / 100_000_000).toLocaleString("zh-TW", { maximumFractionDigits: 2 })}億`;
const formatJpyHundredMillion = (value) => `${formatHundredMillion(value)}日圓`;
const formatPercent = (value) => `${(value * 100).toLocaleString("zh-TW", { maximumFractionDigits: 1 })}%`;
const formatTenThousand = (value) => `${(value / 10_000).toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}萬`;

function meta(content, page) {
  const value = content[page - 1];
  if (!value || value.page !== page) {
    throw new Error(`Missing approved premium content for slide ${page}`);
  }
  return value;
}

function addText(slide, theme, text, options = {}) {
  slide.addText(text, {
    fontFace: theme.font,
    fontSize: theme.type.body,
    color: theme.colors.ink,
    margin: 0,
    breakLine: false,
    fit: "shrink",
    ...options,
  });
}

function addPill(slide, deck, theme, text, {
  x,
  y,
  w,
  h = 0.38,
  fill = theme.colors.white,
  line = theme.colors.line,
  color = theme.colors.deepForest,
  fontSize = 10.5,
  bold = true,
} = {}) {
  slide.addShape(deck.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.12,
    fill: { color: fill, transparency: fill === theme.colors.white ? 5 : 0 },
    line: { color: line, width: 0.65, transparency: 12 },
    objectName: `Label: ${text}`,
  });
  addText(slide, theme, text, {
    x: x + 0.08,
    y: y + 0.08,
    w: w - 0.16,
    h: h - 0.15,
    fontSize,
    bold,
    color,
    align: "center",
    valign: "mid",
    objectName: `Label text: ${text}`,
  });
}

function addSourceLine(slide, components, text, { dark = false } = {}) {
  components.addSource(slide, {
    text,
    x: 0.64,
    y: 7.12,
    w: 11.95,
    h: 0.18,
    dark,
  });
}

function addNotes(slide, slideMeta) {
  slide.addNotes(`page=${slideMeta.page}; mode=${slideMeta.mode}; source=${slideMeta.source}; title=${slideMeta.title}`);
}

function addBoundedBase(slide, deck, theme, options, dark = false) {
  const addBase = dark ? theme.addDarkBase : theme.addLightBase;
  addBase(slide, deck, options);

  // Keep the approved ambient-node motif while satisfying the checkpoint's
  // strict no-object-outside-slide requirement.
  for (const object of slide._slideObjects ?? []) {
    if (object.options?.objectName?.endsWith("ambient halo")) {
      object.options.x = 11.63;
      object.options.y = 0;
      object.options.w = 1.7;
      object.options.h = 1.7;
    }
    if (object.options?.objectName?.endsWith("glass node")) {
      object.options.x = 12.25;
      object.options.y = 6.42;
      object.options.w = 1.08;
      object.options.h = 1.08;
    }
  }
}

function buildCover(ctx) {
  const { deck, theme, content, data, assets } = ctx;
  const slideMeta = meta(content, 1);
  const slide = deck.addSlide(theme.masters.light);
  slide.background = { color: theme.colors.white };

  slide.addImage({
    path: assets.cover,
    x: 6.38,
    y: 0,
    w: W - 6.38,
    h: H,
    sizing: { type: "cover", w: W - 6.38, h: H },
    objectName: "Cover network background",
  });
  slide.addShape(deck.ShapeType.rect, {
    x: 5.86,
    y: 0,
    w: 1.65,
    h: H,
    fill: { color: theme.colors.white, transparency: 13 },
    line: { color: theme.colors.white, transparency: 100 },
    objectName: "Cover image soft edge",
  });
  slide.addShape(deck.ShapeType.ellipse, {
    x: 0.68,
    y: 0.64,
    w: 0.18,
    h: 0.18,
    fill: { color: theme.colors.sage },
    line: { color: theme.colors.sage, transparency: 100 },
    objectName: "NeeDo cover marker",
  });
  addText(slide, theme, "NeeDo｜海外投資人路演", {
    x: 1.02,
    y: 0.65,
    w: 3.9,
    h: 0.24,
    fontSize: 11,
    bold: true,
    color: theme.colors.dataGreen,
    charSpacing: 0.7,
    objectName: "Cover kicker",
  });
  addText(slide, theme, slideMeta.title, {
    x: 0.68,
    y: 1.55,
    w: 5.35,
    h: 2.08,
    fontSize: 39,
    bold: true,
    color: theme.colors.ink,
    breakLine: true,
    valign: "mid",
    objectName: "Cover title",
  });
  addText(slide, theme, "把需求、供給、場所與服務者連成\n透明、可追蹤、可規模化的履約網路。", {
    x: 0.7,
    y: 4.03,
    w: 4.85,
    h: 0.88,
    fontSize: 17,
    color: theme.colors.muted,
    breakLine: true,
    objectName: "Cover statement",
  });
  slide.addShape(deck.ShapeType.roundRect, {
    x: 0.7,
    y: 5.5,
    w: 4.88,
    h: 0.66,
    rectRadius: 0.18,
    fill: { color: theme.colors.mist },
    line: { color: theme.colors.sage, transparency: 42, width: 0.75 },
    objectName: "Native financing row",
  });
  addText(slide, theme, `${data.financing.round}　｜　${formatJpyHundredMillion(data.financing.amountJpy)}　｜　出讓 ${formatPercent(data.financing.equity)}`, {
    x: 0.96,
    y: 5.7,
    w: 4.36,
    h: 0.24,
    fontSize: 15.5,
    bold: true,
    color: theme.colors.deepForest,
    objectName: "Financing terms",
  });
  addText(slide, theme, "01", {
    x: 0.7,
    y: 6.82,
    w: 0.5,
    h: 0.2,
    fontSize: 9.5,
    bold: true,
    color: theme.colors.dataGreen,
    objectName: "Page number",
  });
  addNotes(slide, slideMeta);
}

function buildInvestmentThesis(ctx) {
  const { deck, theme, components, content, data } = ctx;
  const slideMeta = meta(content, 2);
  const slide = deck.addSlide(theme.masters.dark);
  addBoundedBase(slide, deck, theme, { page: 2, kicker: "投資命題" }, true);

  addText(slide, theme, slideMeta.title, {
    x: 0.68,
    y: 0.88,
    w: 10.75,
    h: 1.14,
    fontSize: 40,
    bold: true,
    color: theme.colors.darkText,
    breakLine: true,
    objectName: "Investment thesis conclusion",
  });

  const judgments = [
    { n: "01", x: 0.76, y: 2.55, w: 4.85, title: "需求持續擴張", body: "訪日與在留外國人同步增加，跨語言生活服務需求更頻繁。" },
    { n: "02", x: 6.35, y: 2.27, w: 5.6, title: "供給仍然分散", body: "電話、LINE、場所與人員空檔分散在多個角色手中。" },
    { n: "03", x: 1.55, y: 4.65, w: 4.95, title: "履約可以被計算", body: "統一預約事實、調度、價格與事件後，成功與取消都可追蹤。" },
    { n: "04", x: 7.15, y: 4.38, w: 4.7, title: "本輪用資金驗證商業化", body: `Pre-money ${formatHundredMillion(data.financing.preMoney)}｜Post-money ${formatHundredMillion(data.financing.postMoney)}；估值與回報均為情境，不是承諾。` },
  ];
  judgments.forEach(({ n, x, y, w, title, body }, index) => {
    addText(slide, theme, n, {
      x,
      y,
      w: 0.55,
      h: 0.34,
      fontSize: 15,
      bold: true,
      color: index === 3 ? theme.colors.orange : theme.colors.sage,
      objectName: `Judgment ${n} number`,
    });
    slide.addShape(deck.ShapeType.ellipse, {
      x: x + 0.68,
      y: y + 0.11,
      w: 0.1,
      h: 0.1,
      fill: { color: index === 3 ? theme.colors.orange : theme.colors.sage },
      line: { transparency: 100 },
      objectName: `Judgment ${n} marker`,
    });
    addText(slide, theme, title, {
      x: x + 0.98,
      y: y - 0.02,
      w: w - 0.98,
      h: 0.34,
      fontSize: 19,
      bold: true,
      color: theme.colors.darkText,
      objectName: `Judgment ${n} title`,
    });
    addText(slide, theme, body, {
      x: x + 0.98,
      y: y + 0.5,
      w: w - 0.98,
      h: 0.65,
      fontSize: 13.2,
      color: theme.colors.darkMuted,
      breakLine: true,
      objectName: `Judgment ${n} body`,
    });
  });
  addSourceLine(slide, components, "資料：S5 NeeDo 三年財務模型 V2.2；S7 NeeDo 產品原型與商談紀錄｜財務與回報為情境分析，不構成回報承諾。", { dark: true });
  addNotes(slide, slideMeta);
}

function buildDemand(ctx) {
  const { deck, theme, components, content, data } = ctx;
  const slideMeta = meta(content, 3);
  const slide = deck.addSlide(theme.masters.light);
  addBoundedBase(slide, deck, theme, { title: slideMeta.title, page: 3, kicker: "需求擴張" });

  addText(slide, theme, "訪日外客", {
    x: 0.78,
    y: 1.7,
    w: 2.4,
    h: 0.3,
    fontSize: 15,
    bold: true,
    color: theme.colors.muted,
    objectName: "Visitor metric label",
  });
  addText(slide, theme, formatTenThousand(data.market.visitors2025), {
    x: 0.76,
    y: 2.08,
    w: 5.2,
    h: 0.86,
    fontSize: 62,
    bold: true,
    color: theme.colors.dataGreen,
    objectName: "Visitors 2025",
  });
  addText(slide, theme, `2025年｜+${data.market.visitorsGrowth}%`, {
    x: 0.8,
    y: 3.13,
    w: 3.7,
    h: 0.34,
    fontSize: 20,
    bold: true,
    color: theme.colors.deepForest,
    objectName: "Visitor growth",
  });

  slide.addShape(deck.ShapeType.arc, {
    x: 5.45,
    y: 1.66,
    w: 1.72,
    h: 2.3,
    adjustPoint: 0.25,
    rotate: 8,
    fill: { color: theme.colors.mist, transparency: 100 },
    line: { color: theme.colors.sage, transparency: 38, width: 1.8 },
    objectName: "Demand connector arc",
  });

  addText(slide, theme, "在留外國人", {
    x: 7.2,
    y: 2.15,
    w: 2.5,
    h: 0.3,
    fontSize: 15,
    bold: true,
    color: theme.colors.muted,
    objectName: "Resident metric label",
  });
  addText(slide, theme, formatTenThousand(data.market.foreignResidents2025), {
    x: 7.17,
    y: 2.53,
    w: 4.7,
    h: 0.82,
    fontSize: 59,
    bold: true,
    color: theme.colors.deepForest,
    objectName: "Foreign residents 2025",
  });
  addText(slide, theme, `2025年末｜+${data.market.foreignResidentsGrowth}%`, {
    x: 7.2,
    y: 3.57,
    w: 3.7,
    h: 0.34,
    fontSize: 20,
    bold: true,
    color: theme.colors.dataGreen,
    objectName: "Resident growth",
  });

  slide.addShape(deck.ShapeType.roundRect, {
    x: 0.76,
    y: 5.2,
    w: 11.85,
    h: 1.08,
    rectRadius: 0.16,
    fill: { color: theme.colors.mist },
    line: { color: theme.colors.sage, transparency: 55, width: 0.75 },
    objectName: "Demand implication",
  });
  addText(slide, theme, "需求增加不只需要多語入口，更需要可確認價格、接待條件、場所與改約保障的履約系統。", {
    x: 1.08,
    y: 5.53,
    w: 11.15,
    h: 0.4,
    fontSize: 20,
    bold: true,
    color: theme.colors.deepForest,
    align: "center",
    objectName: "Demand implication text",
  });
  addSourceLine(slide, components, "資料：S1 JNTO｜2025年訪日外客數；S2 出入國在留管理廳｜2025年末在留外國人數。");
  addNotes(slide, slideMeta);
}

function buildTraditionalCoordination(ctx) {
  const { deck, theme, components, content } = ctx;
  const slideMeta = meta(content, 4);
  const slide = deck.addSlide(theme.masters.light);
  addBoundedBase(slide, deck, theme, { title: slideMeta.title, page: 4, kicker: "人工協調流程" });

  const stages = [
    ["01", "客人來電"],
    ["02", "店鋪接單"],
    ["03", "LINE／電話\n詢問服務者"],
    ["04", "空檔確認"],
    ["05", "店鋪再確認"],
    ["06", "說明系統／場所"],
  ];
  const startX = 0.72;
  stages.forEach(([n, label], index) => {
    const x = startX + index * 2.06;
    if (index < stages.length - 1) {
      slide.addShape(deck.ShapeType.line, {
        x: x + 1.28,
        y: 2.48,
        w: 0.82,
        h: 0,
        line: { color: theme.colors.sage, transparency: 25, width: 1.5, endArrowType: "triangle" },
        objectName: `Timeline connector ${n}`,
      });
    }
    slide.addShape(deck.ShapeType.ellipse, {
      x,
      y: 2.14,
      w: 0.68,
      h: 0.68,
      fill: { color: index === 2 || index === 4 ? theme.colors.deepForest : theme.colors.mist },
      line: { color: theme.colors.sage, width: 1 },
      objectName: `Timeline step ${n}`,
    });
    addText(slide, theme, n, {
      x,
      y: 2.34,
      w: 0.68,
      h: 0.2,
      fontSize: 10,
      bold: true,
      color: index === 2 || index === 4 ? theme.colors.white : theme.colors.deepForest,
      align: "center",
      objectName: `Timeline number ${n}`,
    });
    addText(slide, theme, label, {
      x: x - 0.08,
      y: 3.05,
      w: 1.45,
      h: 0.55,
      fontSize: 12.2,
      bold: true,
      color: theme.colors.ink,
      align: "center",
      breakLine: true,
      objectName: `Timeline label ${n}`,
    });
  });

  addText(slide, theme, "這種預約表單與人工確認方式多年來大致未變；這是團隊商談觀察，不主張精確歷史年份。", {
    x: 0.78,
    y: 4.0,
    w: 6.2,
    h: 0.58,
    fontSize: 13.5,
    color: theme.colors.muted,
    breakLine: true,
    objectName: "Coordination history qualification",
  });
  addPill(slide, deck, theme, "外語溝通落差", { x: 0.78, y: 4.82, w: 2.0, fill: theme.colors.orangePale, line: theme.colors.orange, color: theme.colors.risk });
  addPill(slide, deck, theme, "任意取消／救濟弱", { x: 3.02, y: 4.82, w: 2.25, fill: theme.colors.orangePale, line: theme.colors.orange, color: theme.colors.risk });

  slide.addShape(deck.ShapeType.roundRect, {
    x: 7.5,
    y: 4.0,
    w: 4.8,
    h: 1.48,
    rectRadius: 0.16,
    fill: { color: theme.colors.deepForest },
    line: { color: theme.colors.deepForest, transparency: 100 },
    shadow: { type: "outer", color: theme.colors.deepForest, opacity: 0.14, blur: 1.6, angle: 45, distance: 1 },
    objectName: "Restart callout",
  });
  addText(slide, theme, "變更一次＝流程重做一次", {
    x: 7.82,
    y: 4.43,
    w: 4.16,
    h: 0.54,
    fontSize: 26,
    bold: true,
    color: theme.colors.white,
    align: "center",
    objectName: "Restart callout text",
  });
  addSourceLine(slide, components, "資料：S7 NeeDo 產品原型與商談紀錄｜流程與摩擦為團隊觀察，待正式交易數據驗證。 ");
  addNotes(slide, slideMeta);
}

function buildFivePartyNetwork(ctx) {
  const { deck, theme, components, content, assets } = ctx;
  const slideMeta = meta(content, 5);
  const slide = deck.addSlide(theme.masters.light);
  addBoundedBase(slide, deck, theme, { title: slideMeta.title, page: 5, kicker: "五方瓶頸" });

  slide.addImage({
    path: assets.coordination,
    x: 0.66,
    y: 1.52,
    w: 7.35,
    h: 4.65,
    sizing: { type: "cover", w: 7.35, h: 4.65 },
    transparency: 5,
    objectName: "Five-party coordination background",
  });
  slide.addShape(deck.ShapeType.roundRect, {
    x: 3.1,
    y: 3.0,
    w: 1.48,
    h: 0.5,
    rectRadius: 0.14,
    fill: { color: theme.colors.deepForest, transparency: 2 },
    line: { color: theme.colors.sage, width: 0.8 },
    objectName: "NeeDo center label",
  });
  addText(slide, theme, "同一筆預約事實", {
    x: 3.23,
    y: 3.14,
    w: 1.22,
    h: 0.19,
    fontSize: 10,
    bold: true,
    color: theme.colors.white,
    align: "center",
    objectName: "NeeDo center label text",
  });
  addPill(slide, deck, theme, "店鋪", { x: 1.25, y: 2.0, w: 0.96 });
  addPill(slide, deck, theme, "中介", { x: 5.15, y: 1.78, w: 0.96 });
  addPill(slide, deck, theme, "服務者", { x: 6.52, y: 3.08, w: 1.18 });
  addPill(slide, deck, theme, "客人", { x: 1.08, y: 5.07, w: 0.96 });
  addPill(slide, deck, theme, "場所", { x: 5.35, y: 5.33, w: 0.96 });

  addText(slide, theme, "瓶頸不是入口", {
    x: 8.55,
    y: 1.78,
    w: 3.6,
    h: 0.36,
    fontSize: 15,
    bold: true,
    color: theme.colors.dataGreen,
    objectName: "Bottleneck eyebrow",
  });
  addText(slide, theme, "而是即時協調\n＋透明、可選擇的消費", {
    x: 8.52,
    y: 2.28,
    w: 3.85,
    h: 1.14,
    fontSize: 26,
    bold: true,
    color: theme.colors.deepForest,
    breakLine: true,
    objectName: "Bottleneck conclusion",
  });
  addText(slide, theme, "NeeDo 的透明點單可用於高消費場所：先選項、再確認、顯示含稅總額與追加明細。此處是產品使用情境，不代表目前已有相關收入。", {
    x: 8.55,
    y: 4.05,
    w: 3.75,
    h: 1.28,
    fontSize: 13.2,
    color: theme.colors.muted,
    breakLine: true,
    objectName: "Transparent ordering use case",
  });
  components.addDisclosure(slide, deck, {
    x: 8.52,
    y: 5.62,
    w: 3.82,
    h: 0.64,
    text: "產品原型情境｜尚無真實歸因 GMV 或透明點單收入。",
  });
  addSourceLine(slide, components, "資料：S7 NeeDo 產品原型與商談紀錄｜AI圖僅作五方網路視覺隱喻；標籤與結論均為原生元素。 ");
  addNotes(slide, slideMeta);
}

function buildResponsibilityChain(ctx) {
  const { deck, theme, components, content } = ctx;
  const slideMeta = meta(content, 6);
  const slide = deck.addSlide(theme.masters.light);
  addBoundedBase(slide, deck, theme, { title: slideMeta.title, page: 6, kicker: "責任鏈" });

  slide.addShape(deck.ShapeType.circularArrow, {
    x: 1.15,
    y: 1.52,
    w: 5.35,
    h: 4.9,
    rotate: 20,
    fill: { color: theme.colors.mist, transparency: 22 },
    line: { color: theme.colors.sage, transparency: 46, width: 1.1 },
    objectName: "Circular responsibility chain",
  });
  slide.addShape(deck.ShapeType.ellipse, {
    x: 2.78,
    y: 2.98,
    w: 2.05,
    h: 1.72,
    fill: { color: theme.colors.deepForest },
    line: { color: theme.colors.sage, width: 1.1 },
    objectName: "Schedule change center",
  });
  addText(slide, theme, "一次\n排程變更", {
    x: 3.12,
    y: 3.43,
    w: 1.35,
    h: 0.75,
    fontSize: 22,
    bold: true,
    color: theme.colors.white,
    align: "center",
    breakLine: true,
    objectName: "Schedule change center text",
  });
  const nodes = [
    ["客人", 1.28, 1.68],
    ["店鋪", 3.3, 1.35],
    ["中介", 5.35, 2.0],
    ["服務者", 5.27, 4.68],
    ["場所", 3.05, 5.62],
    ["客服／系統", 1.12, 4.4],
  ];
  nodes.forEach(([label, x, y], index) => {
    slide.addShape(deck.ShapeType.ellipse, {
      x,
      y,
      w: 1.24,
      h: 0.76,
      fill: { color: index % 2 ? theme.colors.white : theme.colors.mist },
      line: { color: theme.colors.sage, width: 0.8 },
      shadow: { type: "outer", color: theme.colors.deepForest, opacity: 0.08, blur: 1, angle: 45, distance: 1 },
      objectName: `Responsibility node: ${label}`,
    });
    addText(slide, theme, label, {
      x: x + 0.12,
      y: y + 0.24,
      w: 1,
      h: 0.22,
      fontSize: 11,
      bold: true,
      color: theme.colors.deepForest,
      align: "center",
      objectName: `Responsibility node text: ${label}`,
    });
  });

  addText(slide, theme, "重複發生的成本", {
    x: 7.35,
    y: 1.73,
    w: 3.0,
    h: 0.38,
    fontSize: 16,
    bold: true,
    color: theme.colors.dataGreen,
    objectName: "Duplicated cost eyebrow",
  });
  addText(slide, theme, "找人 → 回撥 → 重排\n→ 移動 → 再說明費用", {
    x: 7.32,
    y: 2.25,
    w: 4.75,
    h: 1.04,
    fontSize: 26,
    bold: true,
    color: theme.colors.deepForest,
    breakLine: true,
    objectName: "Duplicated labor chain",
  });
  const frictions = [
    ["隱私與外洩", "角色間反覆傳遞聯絡資訊，難以落實最小權限。"],
    ["跳單與責任", "平台外聯絡使價格、取消與爭議缺少同一事件紀錄。"],
    ["資源難擴張", "新增外部服務者時，資格、距離、空檔與場所規則更難同步。"],
  ];
  frictions.forEach(([title, body], index) => {
    const y = 3.75 + index * 0.82;
    addText(slide, theme, `${String(index + 1).padStart(2, "0")}  ${title}`, {
      x: 7.35,
      y,
      w: 1.95,
      h: 0.26,
      fontSize: 12.5,
      bold: true,
      color: index === 1 ? theme.colors.risk : theme.colors.deepForest,
      objectName: `Responsibility friction ${index + 1}`,
    });
    addText(slide, theme, body, {
      x: 9.28,
      y: y - 0.02,
      w: 3.02,
      h: 0.48,
      fontSize: 10.8,
      color: theme.colors.muted,
      breakLine: true,
      objectName: `Responsibility friction detail ${index + 1}`,
    });
  });
  addSourceLine(slide, components, "資料：S7 NeeDo 產品原型與商談紀錄｜此頁描述重複勞動與治理摩擦，不代表已量化的人力成本。 ");
  addNotes(slide, slideMeta);
}

function buildForeignCustomerFunnel(ctx) {
  const { deck, theme, components, content } = ctx;
  const slideMeta = meta(content, 7);
  const slide = deck.addSlide(theme.masters.light);
  addBoundedBase(slide, deck, theme, { title: slideMeta.title, page: 7, kicker: "外國客旅程" });

  const segments = [
    { x: 0.76, w: 2.55, fill: theme.colors.deepForest, text: "生活服務需求" },
    { x: 3.07, w: 2.4, fill: theme.colors.dataGreen, text: "搜尋與預約" },
    { x: 5.23, w: 2.25, fill: theme.colors.sage, text: "規則與價格確認" },
    { x: 7.24, w: 2.1, fill: "A7C5B5", text: "可履約服務" },
  ];
  segments.forEach(({ x, w, fill, text }, index) => {
    slide.addShape(deck.ShapeType.chevron, {
      x,
      y: 2.02 + index * 0.12,
      w,
      h: 1.34 - index * 0.08,
      fill: { color: fill },
      line: { color: fill, transparency: 100 },
      objectName: `Funnel segment ${index + 1}`,
    });
    addText(slide, theme, text, {
      x: x + 0.16,
      y: 2.48 + index * 0.12,
      w: w - 0.42,
      h: 0.26,
      fontSize: 13,
      bold: true,
      color: index === 3 ? theme.colors.deepForest : theme.colors.white,
      align: "center",
      objectName: `Funnel segment text ${index + 1}`,
    });
  });
  slide.addShape(deck.ShapeType.ellipse, {
    x: 9.78,
    y: 2.0,
    w: 1.32,
    h: 1.32,
    fill: { color: theme.colors.mist },
    line: { color: theme.colors.sage, width: 1.1 },
    objectName: "Fulfilled customer node",
  });
  addText(slide, theme, "完成\n預約", {
    x: 10.04,
    y: 2.38,
    w: 0.82,
    h: 0.5,
    fontSize: 15,
    bold: true,
    color: theme.colors.deepForest,
    align: "center",
    breakLine: true,
    objectName: "Fulfilled customer node text",
  });

  const exits = [
    ["01", "日語限定預約", 1.08],
    ["02", "可接待條件不清／服務拒否", 3.72],
    ["03", "規則或總價不清", 6.55],
    ["04", "任意取消或救濟不足", 9.35],
  ];
  exits.forEach(([n, label, x], index) => {
    slide.addShape(deck.ShapeType.line, {
      x: x + 0.72,
      y: 3.52,
      w: 0,
      h: 0.72 + index * 0.08,
      line: { color: theme.colors.orange, width: 1.25, endArrowType: "triangle" },
      objectName: `Funnel exit ${n}`,
    });
    addText(slide, theme, n, {
      x,
      y: 4.55 + index * 0.08,
      w: 0.35,
      h: 0.24,
      fontSize: 10,
      bold: true,
      color: theme.colors.risk,
      objectName: `Funnel exit number ${n}`,
    });
    addText(slide, theme, label, {
      x: x + 0.42,
      y: 4.52 + index * 0.08,
      w: 2.3,
      h: 0.58,
      fontSize: 12,
      bold: true,
      color: theme.colors.deepForest,
      breakLine: true,
      objectName: `Funnel exit label ${n}`,
    });
  });
  addText(slide, theme, "這些是團隊觀察到的結構性摩擦，並非所有店鋪或所有外國客都會遇到；多語只是入口，履約保障才決定是否完成。", {
    x: 0.82,
    y: 6.1,
    w: 11.4,
    h: 0.48,
    fontSize: 13.5,
    bold: true,
    color: theme.colors.dataGreen,
    align: "center",
    objectName: "Funnel qualification",
  });
  addSourceLine(slide, components, "資料：S1、S2 宏觀需求；S7 NeeDo 產品原型與商談紀錄｜摩擦描述為結構性觀察，待交易數據驗證。 ");
  addNotes(slide, slideMeta);
}

function buildMarketMap(ctx) {
  const { deck, theme, components, content, data } = ctx;
  const slideMeta = meta(content, 8);
  const slide = deck.addSlide(theme.masters.light);
  addBoundedBase(slide, deck, theme, { title: slideMeta.title, page: 8, kicker: "三層市場地圖" });

  slide.addShape(deck.ShapeType.roundRect, {
    x: 0.68,
    y: 1.52,
    w: 7.32,
    h: 4.95,
    rectRadius: 0.2,
    fill: { color: theme.colors.mist, transparency: 20 },
    line: { color: theme.colors.sage, transparency: 38, width: 1 },
    objectName: "Broad lifestyle infrastructure market",
  });
  addText(slide, theme, "03　生活服務基礎設施", {
    x: 0.98,
    y: 1.84,
    w: 3.7,
    h: 0.3,
    fontSize: 17,
    bold: true,
    color: theme.colors.dataGreen,
    objectName: "Market layer 3 label",
  });
  addText(slide, theme, "多城市、多業態、需求／供給／場所／履約事件連接", {
    x: 0.98,
    y: 2.25,
    w: 5.9,
    h: 0.34,
    fontSize: 12.5,
    color: theme.colors.muted,
    objectName: "Market layer 3 detail",
  });
  slide.addShape(deck.ShapeType.roundRect, {
    x: 1.38,
    y: 2.72,
    w: 5.95,
    h: 3.15,
    rectRadius: 0.18,
    fill: { color: "D8E9E0", transparency: 6 },
    line: { color: theme.colors.dataGreen, transparency: 28, width: 1 },
    objectName: "Adjacent appointment dispatch market",
  });
  addText(slide, theme, "02　鄰接預約／派遣服務", {
    x: 1.7,
    y: 3.05,
    w: 3.8,
    h: 0.3,
    fontSize: 18,
    bold: true,
    color: theme.colors.deepForest,
    objectName: "Market layer 2 label",
  });
  addText(slide, theme, "資格、場所與調度控制完成後，再複製到更多生活服務。", {
    x: 1.7,
    y: 3.48,
    w: 4.7,
    h: 0.38,
    fontSize: 12.5,
    color: theme.colors.muted,
    objectName: "Market layer 2 detail",
  });
  slide.addShape(deck.ShapeType.roundRect, {
    x: 2.17,
    y: 4.18,
    w: 4.25,
    h: 1.2,
    rectRadius: 0.17,
    fill: { color: theme.colors.deepForest },
    line: { color: theme.colors.deepForest, transparency: 100 },
    objectName: "Current core market",
  });
  addText(slide, theme, "01　近期可服務核心", {
    x: 2.48,
    y: 4.48,
    w: 2.4,
    h: 0.28,
    fontSize: 18,
    bold: true,
    color: theme.colors.white,
    objectName: "Market layer 1 label",
  });
  addText(slide, theme, "高摩擦的一般按摩、美容、餐飲與合規店鋪 SaaS", {
    x: 2.48,
    y: 4.87,
    w: 3.5,
    h: 0.3,
    fontSize: 11.5,
    color: theme.colors.darkMuted,
    objectName: "Market layer 1 detail",
  });

  addText(slide, theme, "官方供給側脈絡", {
    x: 8.55,
    y: 1.68,
    w: 2.8,
    h: 0.32,
    fontSize: 16,
    bold: true,
    color: theme.colors.dataGreen,
    objectName: "Supply-side context title",
  });
  const metrics = [
    [data.market.receptionVenues.toLocaleString("zh-TW"), "接待飲食營業據點"],
    [data.market.lateNightAlcoholVenues.toLocaleString("zh-TW"), "深夜酒類營業據點"],
    [data.market.adultSpecialBusinesses.toLocaleString("zh-TW"), "性風俗特殊營業據點"],
  ];
  metrics.forEach(([value, label], index) => {
    const y = 2.22 + index * 1.22;
    addText(slide, theme, value, {
      x: 8.52,
      y,
      w: 2.4,
      h: 0.5,
      fontSize: 28,
      bold: true,
      color: index === 2 ? theme.colors.risk : theme.colors.deepForest,
      objectName: `Supply metric ${index + 1}`,
    });
    addText(slide, theme, label, {
      x: 10.95,
      y: y + 0.13,
      w: 1.65,
      h: 0.3,
      fontSize: 10.5,
      bold: true,
      color: theme.colors.muted,
      objectName: `Supply metric label ${index + 1}`,
    });
  });
  components.addDisclosure(slide, deck, {
    x: 8.5,
    y: 5.82,
    w: 4.1,
    h: 0.62,
    text: "供給統計為廣義受監管市場脈絡，類別可能交疊；不等於 NeeDo 當前可服務市場，也不進入核心財務模型。",
    tone: "risk",
  });
  addSourceLine(slide, components, "資料：S3 警察廳｜令和7年風俗關係事犯等統計；S1、S2 需求背景。 ");
  addNotes(slide, slideMeta);
}

function buildRegulatoryZones(ctx) {
  const { deck, theme, components, content } = ctx;
  const slideMeta = meta(content, 9);
  const slide = deck.addSlide(theme.masters.light);
  addBoundedBase(slide, deck, theme, { title: slideMeta.title, page: 9, kicker: "監管分區" });

  slide.addShape(deck.ShapeType.roundRect, {
    x: 0.72,
    y: 1.55,
    w: 5.15,
    h: 4.9,
    rectRadius: 0.22,
    fill: { color: theme.colors.deepForest },
    line: { color: theme.colors.deepForest, transparency: 100 },
    objectName: "Regulatory zone permitted core",
  });
  addText(slide, theme, "01", {
    x: 1.08,
    y: 1.95,
    w: 0.55,
    h: 0.4,
    fontSize: 18,
    bold: true,
    color: theme.colors.sage,
    objectName: "Zone 1 number",
  });
  addText(slide, theme, "現在允許的核心", {
    x: 1.08,
    y: 2.52,
    w: 3.7,
    h: 0.48,
    fontSize: 27,
    bold: true,
    color: theme.colors.white,
    objectName: "Zone 1 title",
  });
  addText(slide, theme, "一般按摩、美容、餐飲\n合規店鋪 SaaS\n預約、排班、履約、透明價格", {
    x: 1.1,
    y: 3.37,
    w: 3.95,
    h: 1.22,
    fontSize: 16,
    bold: true,
    color: theme.colors.darkText,
    breakLine: true,
    objectName: "Zone 1 scope",
  });
  addText(slide, theme, "核心財務模型", {
    x: 1.1,
    y: 5.5,
    w: 2.4,
    h: 0.28,
    fontSize: 13,
    bold: true,
    color: theme.colors.sage,
    objectName: "Zone 1 model status",
  });

  slide.addShape(deck.ShapeType.roundRect, {
    x: 6.16,
    y: 2.02,
    w: 3.65,
    h: 3.96,
    rectRadius: 0.2,
    fill: { color: theme.colors.mist },
    line: { color: theme.colors.sage, width: 1 },
    objectName: "Regulatory zone conditional expansion",
  });
  addText(slide, theme, "02", {
    x: 6.48,
    y: 2.36,
    w: 0.55,
    h: 0.36,
    fontSize: 16,
    bold: true,
    color: theme.colors.dataGreen,
    objectName: "Zone 2 number",
  });
  addText(slide, theme, "控制後條件式擴展", {
    x: 6.48,
    y: 2.88,
    w: 2.8,
    h: 0.42,
    fontSize: 21,
    bold: true,
    color: theme.colors.deepForest,
    objectName: "Zone 2 title",
  });
  addText(slide, theme, "須確認資格、場所與業態規則\n建立准入、權限、支付、審計與爭議流程\n逐業態取得獨立法務意見", {
    x: 6.48,
    y: 3.63,
    w: 2.85,
    h: 1.4,
    fontSize: 13.2,
    color: theme.colors.ink,
    breakLine: true,
    objectName: "Zone 2 controls",
  });
  addText(slide, theme, "未通過控制，不進入產品與模型", {
    x: 6.48,
    y: 5.32,
    w: 2.78,
    h: 0.34,
    fontSize: 11.5,
    bold: true,
    color: theme.colors.dataGreen,
    objectName: "Zone 2 model status",
  });

  slide.addShape(deck.ShapeType.roundRect, {
    x: 10.17,
    y: 2.72,
    w: 2.43,
    h: 2.78,
    rectRadius: 0.18,
    fill: { color: theme.colors.orangePale },
    line: { color: theme.colors.risk, width: 1 },
    objectName: "Regulatory zone prohibited",
  });
  addText(slide, theme, "03", {
    x: 10.47,
    y: 3.03,
    w: 0.48,
    h: 0.3,
    fontSize: 15,
    bold: true,
    color: theme.colors.risk,
    objectName: "Zone 3 number",
  });
  addText(slide, theme, "現行條款禁止", {
    x: 10.47,
    y: 3.52,
    w: 1.75,
    h: 0.34,
    fontSize: 18,
    bold: true,
    color: theme.colors.risk,
    objectName: "Zone 3 title",
  });
  addText(slide, theme, "成人性服務相關業態", {
    x: 10.47,
    y: 4.12,
    w: 1.72,
    h: 0.5,
    fontSize: 12.5,
    bold: true,
    color: theme.colors.ink,
    breakLine: true,
    objectName: "Zone 3 scope",
  });
  addText(slide, theme, "未來僅可作獨立受監管市場評估", {
    x: 10.47,
    y: 4.75,
    w: 1.74,
    h: 0.42,
    fontSize: 10.3,
    color: theme.colors.risk,
    breakLine: true,
    objectName: "Zone 3 future status",
  });
  components.addDisclosure(slide, deck, {
    x: 5.94,
    y: 6.23,
    w: 6.66,
    h: 0.58,
    text: "成人性服務須獨立產品、法務與監管評估；現行禁止，且不納入 NeeDo 當前核心模型。",
    tone: "risk",
  });
  addSourceLine(slide, components, "資料：S3 警察廳相關統計；S4 厚生勞動省資格制度；S5 NeeDo 核心模型。 ");
  addNotes(slide, slideMeta);
}

export function buildMarketSlides(ctx) {
  const builders = [
    buildCover,
    buildInvestmentThesis,
    buildDemand,
    buildTraditionalCoordination,
    buildFivePartyNetwork,
    buildResponsibilityChain,
    buildForeignCustomerFunnel,
    buildMarketMap,
    buildRegulatoryZones,
  ];
  builders.forEach((builder) => builder(ctx));
}
