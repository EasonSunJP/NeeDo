const W = 13.333;
const H = 7.5;

export const BUSINESS_PAGE_RANGE = Object.freeze({ first: 19, last: 26, count: 8 });

export const FUNDING_ALLOCATION = Object.freeze([
  Object.freeze({ name: "產品／工程", value: 80_000_000 }),
  Object.freeze({ name: "市場／店鋪導入", value: 60_000_000 }),
  Object.freeze({ name: "客服／安全／合規", value: 30_000_000 }),
  Object.freeze({ name: "營運資金", value: 30_000_000 }),
]);

export const CITY_VALIDATION_METRICS = Object.freeze([
  "意向 → 上線轉換率",
  "可服務時段覆蓋率",
  "履約完成率",
  "跨店調度成功率",
]);

export function buildScenarioSeries(scenario) {
  return {
    labels: ["Y1", "Y2", "Y3"],
    stores: scenario.stores,
    orders: scenario.orders,
    revenueM: scenario.revenueM,
    profitM: scenario.profitM,
    margin: scenario.margin,
  };
}

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
    fit: "shrink",
    ...options,
  });
}

function addBase(slide, deck, theme, slideMeta, kicker, { page = slideMeta.page } = {}) {
  const dark = slideMeta.mode === "dark";
  const base = dark ? theme.addDarkBase : theme.addLightBase;
  base(slide, deck, { title: slideMeta.title, page, kicker });
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

function addProtectedOddPageNumber(slide, theme, page) {
  const protectedText = page === 25 ? "２５" : `\u2060${page}`;
  addText(slide, theme, protectedText, {
    x: 11.94,
    y: 0.34,
    w: 0.72,
    h: 0.18,
    fontSize: 9,
    color: theme.colors.dataGreen,
    align: "right",
    objectName: `Page ${page} protected number`,
  });
}

function addPill(slide, deck, theme, text, {
  x,
  y,
  w,
  h = 0.38,
  fill = theme.colors.mist,
  line = theme.colors.sage,
  color = theme.colors.deepForest,
  fontSize = 10,
  dark = false,
} = {}) {
  slide.addShape(deck.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.12,
    fill: { color: fill, transparency: dark ? 10 : 0 },
    line: { color: line, width: 0.7, transparency: dark ? 36 : 10 },
    objectName: `Label: ${text}`,
  });
  addText(slide, theme, text, {
    x: x + 0.1,
    y: y + 0.09,
    w: w - 0.2,
    h: h - 0.17,
    fontSize,
    bold: true,
    color: dark ? theme.colors.darkText : color,
    align: "center",
    valign: "mid",
    objectName: `Label text: ${text}`,
  });
}

function addMiniMetric(slide, deck, theme, {
  x,
  y,
  w,
  value,
  label,
  detail = "",
  accent = theme.colors.dataGreen,
  dark = false,
} = {}) {
  const foreground = dark ? theme.colors.darkText : theme.colors.deepForest;
  const muted = dark ? theme.colors.darkMuted : theme.colors.muted;
  slide.addShape(deck.ShapeType.ellipse, {
    x,
    y: y + 0.08,
    w: 0.12,
    h: 0.12,
    fill: { color: accent },
    line: { color: accent, transparency: 100 },
    objectName: `Metric marker: ${label}`,
  });
  addText(slide, theme, value, {
    x: x + 0.24,
    y,
    w: w - 0.24,
    h: 0.5,
    fontSize: 28,
    bold: true,
    color: accent,
    objectName: `Metric value: ${label}`,
  });
  addText(slide, theme, label, {
    x: x + 0.24,
    y: y + 0.59,
    w: w - 0.24,
    h: 0.26,
    fontSize: 12,
    bold: true,
    color: foreground,
    objectName: `Metric label: ${label}`,
  });
  if (detail) {
    addText(slide, theme, detail, {
      x: x + 0.24,
      y: y + 0.91,
      w: w - 0.24,
      h: 0.3,
      fontSize: 9.2,
      color: muted,
      breakLine: true,
      objectName: `Metric detail: ${label}`,
    });
  }
}

function formatInteger(value) {
  return value.toLocaleString("zh-TW");
}

function formatMillion(value) {
  return `${value.toLocaleString("zh-TW", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}M`;
}

function buildValidation(ctx) {
  const { deck, theme, components, content } = ctx;
  const slideMeta = meta(content, 19);
  const slide = deck.addSlide(theme.masters.dark);
  addBase(slide, deck, theme, slideMeta, "商業驗證訊號");

  addText(slide, theme, "100+", {
    x: 0.8,
    y: 1.68,
    w: 4.0,
    h: 1.2,
    fontSize: 70,
    bold: true,
    color: theme.colors.sage,
    objectName: "Intent hero number",
  });
  addText(slide, theme, "使用意向", {
    x: 4.48,
    y: 2.12,
    w: 2.4,
    h: 0.46,
    fontSize: 24,
    bold: true,
    color: theme.colors.darkText,
    objectName: "Intent hero label",
  });
  addText(slide, theme, "商談訊號｜截至 2026-08-23", {
    x: 0.83,
    y: 3.06,
    w: 3.9,
    h: 0.28,
    fontSize: 12,
    bold: true,
    color: theme.colors.darkMuted,
    objectName: "Intent evidence date",
  });

  slide.addShape(deck.ShapeType.roundRect, {
    x: 7.2,
    y: 1.58,
    w: 5.08,
    h: 2.23,
    rectRadius: 0.2,
    fill: { color: theme.colors.deepForest, transparency: 5 },
    line: { color: theme.colors.sage, transparency: 35, width: 0.9 },
    objectName: "Validation boundary panel",
  });
  addText(slide, theme, "這個數字不等於", {
    x: 7.56,
    y: 1.92,
    w: 2.4,
    h: 0.31,
    fontSize: 16,
    bold: true,
    color: theme.colors.sage,
    objectName: "Validation boundary heading",
  });
  const boundaries = ["已簽約", "已付費", "收入／GMV", "活躍店鋪"];
  boundaries.forEach((label, index) => {
    const x = 7.56 + (index % 2) * 2.18;
    const y = 2.52 + Math.floor(index / 2) * 0.62;
    slide.addShape(deck.ShapeType.ellipse, {
      x,
      y: y + 0.05,
      w: 0.13,
      h: 0.13,
      fill: { color: theme.colors.orange },
      line: { color: theme.colors.orange, transparency: 100 },
      objectName: `Non-proof marker ${index + 1}`,
    });
    addText(slide, theme, label, {
      x: x + 0.25,
      y,
      w: 1.64,
      h: 0.24,
      fontSize: 12.5,
      bold: true,
      color: theme.colors.darkText,
      objectName: `Non-proof label ${index + 1}`,
    });
  });

  addText(slide, theme, "融資後的驗證鏈", {
    x: 0.82,
    y: 4.25,
    w: 2.5,
    h: 0.34,
    fontSize: 17,
    bold: true,
    color: theme.colors.sage,
    objectName: "Evidence chain heading",
  });
  const evidence = ["CRM", "合約", "收款", "上線／履約日誌"];
  evidence.forEach((label, index) => {
    const x = 0.83 + index * 2.93;
    if (index < evidence.length - 1) {
      slide.addShape(deck.ShapeType.line, {
        x: x + 2.18,
        y: 5.36,
        w: 0.72,
        h: 0,
        line: { color: theme.colors.sage, width: 1.3, endArrowType: "triangle", transparency: 20 },
        objectName: `Evidence connector ${index + 1}`,
      });
    }
    slide.addShape(deck.ShapeType.ellipse, {
      x,
      y: 4.83,
      w: 2.18,
      h: 1.05,
      fill: { color: index === 3 ? theme.colors.sage : theme.colors.deepForest, transparency: index === 3 ? 4 : 8 },
      line: { color: index === 3 ? theme.colors.darkText : theme.colors.sage, transparency: 35, width: 0.85 },
      objectName: `Evidence stage ${index + 1}: ${label}`,
    });
    addText(slide, theme, label, {
      x: x + 0.18,
      y: 5.17,
      w: 1.82,
      h: 0.28,
      fontSize: 13,
      bold: true,
      color: theme.colors.darkText,
      align: "center",
      objectName: `Evidence stage label ${index + 1}`,
    });
  });
  components.addDisclosure(slide, deck, {
    x: 0.82,
    y: 6.34,
    w: 11.48,
    h: 0.52,
    text: "100+ 僅為店鋪使用意向；現階段不得解讀為已簽約、已付費、活躍店鋪、收入或 GMV。",
    tone: "risk",
    dark: true,
  });
  addSourceLine(slide, components, "資料：S7 NeeDo 產品原型與商談紀錄｜後續須以 CRM、合約、收款與上線／履約日誌逐項驗證。", { dark: true });
  addNotes(slide, slideMeta);
}

function buildCityDensity(ctx) {
  const { deck, theme, components, content } = ctx;
  const slideMeta = meta(content, 20);
  const slide = deck.addSlide(theme.masters.light);
  addBase(slide, deck, theme, slideMeta, "城市密度增長階梯");

  addPill(slide, deck, theme, "融資後要驗證的進場順序", {
    x: 0.78,
    y: 1.5,
    w: 2.55,
    fill: theme.colors.orangePale,
    line: theme.colors.orange,
    color: theme.colors.risk,
  });
  const steps = [
    ["01", "一座城市／一個高摩擦用例", "集中商談、導入與履約支援", 0.78, 4.78, 2.75],
    ["02", "建立密集本地供給", "店鋪、服務者、場所與時段", 3.64, 4.0, 2.72],
    ["03", "形成可複製打法", "導入、排班、履約、留存證據", 6.48, 3.2, 2.68],
    ["04", "第二城市／鄰接業態", "用已驗證門檻決定擴張", 9.28, 2.4, 3.0],
  ];
  steps.forEach(([number, title, detail, x, y, w], index) => {
    if (index < steps.length - 1) {
      slide.addShape(deck.ShapeType.line, {
        x: x + w - 0.08,
        y: y + 0.56,
        w: 0.45,
        h: -0.82,
        line: { color: theme.colors.dataGreen, width: 1.25, endArrowType: "triangle", transparency: 16 },
        objectName: `Growth step connector ${index + 1}`,
      });
    }
    slide.addShape(deck.ShapeType.roundRect, {
      x,
      y,
      w,
      h: 1.23,
      rectRadius: 0.18,
      fill: { color: index === 3 ? theme.colors.deepForest : index === 2 ? "D7E8DF" : theme.colors.mist },
      line: { color: index === 3 ? theme.colors.deepForest : theme.colors.sage, width: 0.85 },
      shadow: { type: "outer", color: theme.colors.deepForest, opacity: 0.08, blur: 1, angle: 45, distance: 1 },
      objectName: `Growth step ${number}`,
    });
    addText(slide, theme, number, {
      x: x + 0.22,
      y: y + 0.18,
      w: 0.35,
      h: 0.22,
      fontSize: 9.5,
      bold: true,
      color: index === 3 ? theme.colors.sage : theme.colors.dataGreen,
      objectName: `Growth step number ${number}`,
    });
    addText(slide, theme, title, {
      x: x + 0.66,
      y: y + 0.16,
      w: w - 0.86,
      h: 0.42,
      fontSize: 13,
      bold: true,
      color: index === 3 ? theme.colors.white : theme.colors.deepForest,
      breakLine: true,
      objectName: `Growth step title ${number}`,
    });
    addText(slide, theme, detail, {
      x: x + 0.22,
      y: y + 0.76,
      w: w - 0.44,
      h: 0.28,
      fontSize: 9.7,
      color: index === 3 ? theme.colors.darkMuted : theme.colors.muted,
      align: "center",
      objectName: `Growth step detail ${number}`,
    });
  });

  addText(slide, theme, "每座城市的四個驗證門檻", {
    x: 0.82,
    y: 2.15,
    w: 3.1,
    h: 0.36,
    fontSize: 17,
    bold: true,
    color: theme.colors.dataGreen,
    objectName: "City validation metric heading",
  });
  CITY_VALIDATION_METRICS.forEach((label, index) => {
    const x = 0.82 + (index % 2) * 2.9;
    const y = 2.72 + Math.floor(index / 2) * 0.62;
    addPill(slide, deck, theme, label, {
      x,
      y,
      w: 2.62,
      h: 0.45,
      fill: theme.colors.white,
      line: theme.colors.sage,
      fontSize: 10,
    });
  });
  components.addDisclosure(slide, deck, {
    x: 7.2,
    y: 6.05,
    w: 5.08,
    h: 0.58,
    text: "四項均為融資後待驗證指標；本頁沒有宣稱任何既有 KPI 數值。",
  });
  addSourceLine(slide, components, "資料：S5、S7｜城市擴張順序與驗證門檻為管理方案，不是已達成的城市 KPI。 ");
  addNotes(slide, slideMeta);
}

function buildRevenueCore(ctx) {
  const { deck, theme, components, content, data } = ctx;
  const slideMeta = meta(content, 21);
  const slide = deck.addSlide(theme.masters.light);
  addBase(slide, deck, theme, slideMeta, "交易核心與四條收入流", { page: null });

  const center = { x: 4.68, y: 2.35, w: 3.92, h: 2.65 };
  const centerPoint = { x: center.x + center.w / 2, y: center.y + center.h / 2 };
  slide.addShape(deck.ShapeType.ellipse, {
    x: center.x,
    y: center.y,
    w: center.w,
    h: center.h,
    fill: { color: theme.colors.deepForest },
    line: { color: theme.colors.sage, width: 1.15 },
    shadow: { type: "outer", color: theme.colors.deepForest, opacity: 0.14, blur: 1.5, angle: 45, distance: 1 },
    objectName: "Native transaction core",
  });
  addText(slide, theme, "可完成的服務交易", {
    x: 5.27,
    y: 3.05,
    w: 2.74,
    h: 0.43,
    fontSize: 22,
    bold: true,
    color: theme.colors.white,
    align: "center",
    objectName: "Transaction core label",
  });
  addText(slide, theme, "預約・調度・履約・支付・結算事件", {
    x: 5.18,
    y: 3.72,
    w: 2.94,
    h: 0.28,
    fontSize: 10.5,
    bold: true,
    color: theme.colors.darkMuted,
    align: "center",
    objectName: "Transaction core detail",
  });

  const streams = [
    { x: 0.78, y: 1.72, title: "店鋪 SaaS", value: `¥${formatInteger(data.economics.storeSaasMonthly)}／月`, detail: `最低 ${data.economics.minimumContractMonths} 個月；免預約費期仍持續收取`, accent: theme.colors.dataGreen },
    { x: 9.5, y: 1.72, title: "預約費", value: `¥${formatInteger(data.economics.bookingFee)}／單`, detail: `前 ${data.economics.bookingFreeMonths} 個月免預約費；其後按完成交易口徑`, accent: theme.colors.sage },
    { x: 0.78, y: 4.68, title: "成功介紹費", value: `¥${formatInteger(data.economics.referralSuccessFee)}／店`, detail: "成功簽約店鋪的一次性介紹成本／渠道條件", accent: theme.colors.orange },
    { x: 9.5, y: 4.68, title: "未來合格 CPS 結算", value: "原型上行空間", detail: "須先具備真實歸因、完單、退款回沖與合格佣金證據", accent: theme.colors.orange, future: true },
  ];
  streams.forEach((stream, index) => {
    const target = { x: stream.x + 1.53, y: stream.y + 0.78 };
    slide.addShape(deck.ShapeType.line, {
      x: Math.min(target.x, centerPoint.x),
      y: Math.min(target.y, centerPoint.y),
      w: Math.abs(centerPoint.x - target.x),
      h: Math.abs(centerPoint.y - target.y),
      line: { color: stream.accent, transparency: 42, width: 1.15 },
      objectName: `Revenue stream connector ${index + 1}`,
    });
    slide.addShape(deck.ShapeType.roundRect, {
      x: stream.x,
      y: stream.y,
      w: 3.06,
      h: 1.58,
      rectRadius: 0.18,
      fill: { color: stream.future ? theme.colors.orangePale : theme.colors.white },
      line: { color: stream.accent, width: stream.future ? 1.1 : 0.85 },
      shadow: { type: "outer", color: theme.colors.deepForest, opacity: 0.08, blur: 1, angle: 45, distance: 1 },
      objectName: `Revenue stream ${index + 1}: ${stream.title}`,
    });
    addText(slide, theme, stream.title, {
      x: stream.x + 0.22,
      y: stream.y + 0.2,
      w: 2.62,
      h: 0.26,
      fontSize: 12,
      bold: true,
      color: stream.future ? theme.colors.risk : theme.colors.deepForest,
      objectName: `Revenue stream title ${index + 1}`,
    });
    addText(slide, theme, stream.value, {
      x: stream.x + 0.22,
      y: stream.y + 0.61,
      w: 2.62,
      h: 0.34,
      fontSize: stream.future ? 16 : 19,
      bold: true,
      color: stream.accent,
      objectName: `Revenue stream value ${index + 1}`,
    });
    addText(slide, theme, stream.detail, {
      x: stream.x + 0.22,
      y: stream.y + 1.06,
      w: 2.62,
      h: 0.34,
      fontSize: 9.2,
      color: stream.future ? theme.colors.risk : theme.colors.muted,
      breakLine: true,
      objectName: `Revenue stream detail ${index + 1}`,
    });
  });
  components.addDisclosure(slide, deck, {
    x: 4.28,
    y: 5.62,
    w: 4.72,
    h: 0.75,
    text: "CPS 為未來／原型上行空間；目前尚無真實歸因 GMV 或 CPS 收入。成人性服務不進入核心模型。",
    tone: "risk",
  });
  addSourceLine(slide, components, "資料：S5、S7｜四條收入流均圍繞同一交易核心；CPS 尚無真實歸因收入。 ");
  addProtectedOddPageNumber(slide, theme, 21);
  addNotes(slide, slideMeta);
}

function buildUnitEconomics(ctx) {
  const { deck, theme, components, content, data } = ctx;
  const slideMeta = meta(content, 22);
  const slide = deck.addSlide(theme.masters.light);
  addBase(slide, deck, theme, slideMeta, "單位經濟｜模型算術");

  const economics = data.economics;
  const contributionRate = economics.simplifiedOrderContribution / economics.bookingFee;
  const paidPayback = economics.paidStoreCac / economics.storeSaasMonthly;
  const referralPayback = economics.referralSuccessFee / economics.storeSaasMonthly;
  const metrics = [
    [`¥${formatInteger(economics.storeSaasMonthly)}`, "店鋪 SaaS／月", `最低 ${economics.minimumContractMonths} 個月`],
    [`¥${formatInteger(economics.bookingFee)}`, "預約費／單", `前 ${economics.bookingFreeMonths} 個月免預約費`],
    [`約 ¥${formatInteger(economics.simplifiedOrderContribution)}`, "簡化單筆貢獻", "支付、獎勵、風險準備、雲端後"],
    [`${Math.round(contributionRate * 100)}%`, "簡化貢獻率", `${economics.simplifiedOrderContribution} ÷ ${economics.bookingFee}`],
  ];
  metrics.forEach(([value, label, detail], index) => {
    addMiniMetric(slide, deck, theme, {
      x: 0.76 + index * 3.05,
      y: 1.62,
      w: 2.65,
      value,
      label,
      detail,
      accent: index === 2 || index === 3 ? theme.colors.dataGreen : theme.colors.deepForest,
    });
  });
  addPill(slide, deck, theme, "免預約費期間，¥9,800／月 SaaS 仍持續收取", {
    x: 7.96,
    y: 3.12,
    w: 4.52,
    h: 0.46,
    fill: theme.colors.mist,
    line: theme.colors.sage,
    fontSize: 10.5,
  });

  addText(slide, theme, "兩條獲店渠道的簡化回收算術", {
    x: 0.78,
    y: 3.58,
    w: 3.9,
    h: 0.36,
    fontSize: 17,
    bold: true,
    color: theme.colors.dataGreen,
    objectName: "CAC payback heading",
  });
  const paybacks = [
    { x: 0.78, title: "付費獲店 CAC", cost: economics.paidStoreCac, months: paidPayback, accent: theme.colors.dataGreen },
    { x: 6.76, title: "成功介紹費", cost: economics.referralSuccessFee, months: referralPayback, accent: theme.colors.orange },
  ];
  paybacks.forEach(({ x, title, cost, months, accent }, index) => {
    slide.addShape(deck.ShapeType.roundRect, {
      x,
      y: 4.14,
      w: 5.42,
      h: 1.58,
      rectRadius: 0.18,
      fill: { color: index === 1 ? theme.colors.orangePale : theme.colors.white },
      line: { color: accent, width: 0.9 },
      objectName: `CAC payback ${index + 1}`,
    });
    addText(slide, theme, title, {
      x: x + 0.28,
      y: 4.42,
      w: 1.62,
      h: 0.3,
      fontSize: 13,
      bold: true,
      color: index === 1 ? theme.colors.risk : theme.colors.deepForest,
      objectName: `CAC payback title ${index + 1}`,
    });
    addText(slide, theme, `¥${formatInteger(cost)} ÷ ¥${formatInteger(economics.storeSaasMonthly)} =`, {
      x: x + 1.82,
      y: 4.43,
      w: 2.38,
      h: 0.3,
      fontSize: 13.5,
      bold: true,
      color: theme.colors.muted,
      align: "right",
      objectName: `CAC payback formula ${index + 1}`,
    });
    addText(slide, theme, `${months.toFixed(2)} 個月`, {
      x: x + 4.24,
      y: 4.34,
      w: 0.9,
      h: 0.45,
      fontSize: 20,
      bold: true,
      color: accent,
      align: "right",
      objectName: `CAC payback result ${index + 1}`,
    });
    addText(slide, theme, "只用 SaaS 月費做簡化分母；不是已觀察回收期。", {
      x: x + 0.28,
      y: 5.14,
      w: 4.86,
      h: 0.27,
      fontSize: 9.7,
      color: index === 1 ? theme.colors.risk : theme.colors.muted,
      align: "center",
      objectName: `CAC payback qualification ${index + 1}`,
    });
  });
  components.addDisclosure(slide, deck, {
    x: 0.78,
    y: 6.14,
    w: 11.4,
    h: 0.64,
    text: "模型算術，不是已觀察回收期或保證；實際留存、付款、雲端、退款與風險數據必須持續校準。成人性服務不進核心模型。",
    tone: "risk",
  });
  addSourceLine(slide, components, "資料：S5 NeeDo 三年財務模型 V2.2｜¥340 = ¥500 − 3%支付 − ¥30風險準備 − ¥100獎勵 − ¥15雲端。 ");
  addNotes(slide, slideMeta);
}

function addScenarioChart(slide, deck, theme, scenario, colors, name) {
  const series = buildScenarioSeries(scenario);
  slide.addChart(deck.ChartType.bar, [
    { name: "營收（M日圓）", labels: series.labels, values: series.revenueM },
    { name: "營業利益（M日圓）", labels: series.labels, values: series.profitM },
  ], {
    x: 0.72,
    y: 1.62,
    w: 8.18,
    h: 4.18,
    altText: `${name} Y1–Y3 revenue and operating-profit chart`,
    objectName: `${name} native scenario chart`,
    chartColors: [...colors],
    showTitle: false,
    showLegend: true,
    legendPos: "b",
    legendColor: theme.colors.muted,
    legendFontFace: theme.font,
    legendFontSize: 10,
    showValue: true,
    showLabel: false,
    dataLabelPosition: "outEnd",
    dataLabelColor: theme.colors.ink,
    dataLabelFontFace: theme.font,
    dataLabelFontSize: 9,
    dataLabelFormatCode: "0.000\"M\"",
    catAxisLabelFontFace: theme.font,
    catAxisLabelFontSize: 11,
    catAxisLabelColor: theme.colors.muted,
    valAxisLabelFontFace: theme.font,
    valAxisLabelFontSize: 9,
    valAxisLabelColor: theme.colors.muted,
    valGridLine: { color: theme.colors.line, width: 0.6 },
    catGridLine: { style: "none" },
  });
  return series;
}

function addScenarioTable(slide, deck, theme, series, { accent, risk = false } = {}) {
  slide.addShape(deck.ShapeType.roundRect, {
    x: 9.14,
    y: 1.58,
    w: 3.46,
    h: 4.31,
    rectRadius: 0.18,
    fill: { color: risk ? theme.colors.orangePale : theme.colors.white },
    line: { color: accent, width: 0.9 },
    objectName: "Scenario annual data table",
  });
  addText(slide, theme, "年度模型明細", {
    x: 9.46,
    y: 1.89,
    w: 1.84,
    h: 0.3,
    fontSize: 14,
    bold: true,
    color: risk ? theme.colors.risk : theme.colors.deepForest,
    objectName: "Scenario table heading",
  });
  addText(slide, theme, "Y1　　　 Y2　　　 Y3", {
    x: 10.18,
    y: 2.39,
    w: 2.05,
    h: 0.24,
    fontSize: 9.5,
    bold: true,
    color: accent,
    align: "right",
    objectName: "Scenario table year header",
  });
  const rows = [
    ["店鋪", series.stores.map(formatInteger)],
    ["訂單", series.orders.map(formatInteger)],
    ["營收 M", series.revenueM.map((value) => value.toFixed(3))],
    ["營業利益 M", series.profitM.map((value) => value.toFixed(3))],
    ["利益率", series.margin.map((value) => `${value.toFixed(1)}%`)],
  ];
  rows.forEach(([label, values], index) => {
    const y = 2.82 + index * 0.58;
    addText(slide, theme, label, {
      x: 9.46,
      y,
      w: 0.84,
      h: 0.23,
      fontSize: 9.3,
      bold: true,
      color: index === 3 && values[0].startsWith("-") ? theme.colors.risk : theme.colors.muted,
      objectName: `Scenario row label ${index + 1}`,
    });
    addText(slide, theme, values.join("　"), {
      x: 10.22,
      y,
      w: 2.0,
      h: 0.24,
      fontSize: index === 1 ? 8.2 : 8.8,
      bold: index === 3 && values[0].startsWith("-"),
      color: index === 3 && values[0].startsWith("-") ? theme.colors.risk : theme.colors.ink,
      align: "right",
      objectName: `Scenario row values ${index + 1}`,
    });
    slide.addShape(deck.ShapeType.line, {
      x: 9.46,
      y: y + 0.36,
      w: 2.76,
      h: 0,
      line: { color: theme.colors.line, width: 0.55 },
      objectName: `Scenario row divider ${index + 1}`,
    });
  });
}

function buildGeneralScenario(ctx) {
  const { deck, theme, components, content, data } = ctx;
  const slideMeta = meta(content, 23);
  const slide = deck.addSlide(theme.masters.light);
  addBase(slide, deck, theme, slideMeta, "一般模型情境｜非承諾", { page: null });

  const series = addScenarioChart(slide, deck, theme, data.scenarios.general, [theme.colors.dataGreen, theme.colors.sage], "General");
  addScenarioTable(slide, deck, theme, series, { accent: theme.colors.dataGreen });
  addText(slide, theme, "Y1 營業利益為負值，模型於擴張早期仍承擔投入與現金風險。", {
    x: 0.82,
    y: 5.98,
    w: 7.9,
    h: 0.32,
    fontSize: 13.5,
    bold: true,
    color: theme.colors.risk,
    objectName: "General Y1 loss callout",
  });
  components.addDisclosure(slide, deck, {
    x: 0.82,
    y: 6.4,
    w: 11.5,
    h: 0.43,
    text: "一般模型情境／不構成業績承諾；成人性服務相關業態排除在核心模型之外。",
    tone: "risk",
  });
  addSourceLine(slide, components, "資料：S5 NeeDo 三年財務模型 V2.2｜圖表與明細均保留 Y1／Y2／Y3 原始模型值。 ");
  addProtectedOddPageNumber(slide, theme, 23);
  addNotes(slide, slideMeta);
}

function buildAggressiveScenario(ctx) {
  const { deck, theme, components, content, data } = ctx;
  const slideMeta = meta(content, 24);
  const slide = deck.addSlide(theme.masters.light);
  addBase(slide, deck, theme, slideMeta, "資源／渠道敏感度｜非目標保證");

  const colors = [theme.colors.orange, "B86F4B"];
  const series = addScenarioChart(slide, deck, theme, data.scenarios.aggressive, colors, "Aggressive");
  addScenarioTable(slide, deck, theme, series, { accent: theme.colors.orange, risk: true });
  addPill(slide, deck, theme, "低飽和橙＝資源／渠道更快到位的敏感度", {
    x: 0.82,
    y: 5.95,
    w: 4.22,
    h: 0.42,
    fill: theme.colors.orangePale,
    line: theme.colors.orange,
    color: theme.colors.risk,
  });
  components.addDisclosure(slide, deck, {
    x: 5.38,
    y: 5.92,
    w: 6.92,
    h: 0.86,
    text: "資源／渠道敏感度，不是目標、估值或回報保證；實際結果取決於供給拓展、渠道效率、留存、支付、退款與執行。成人性服務不進核心模型。",
    tone: "risk",
  });
  addSourceLine(slide, components, "資料：S6 NeeDo 激進情境敏感度模型｜圖表與明細均保留 Y1／Y2／Y3 原始模型值。 ");
  addNotes(slide, slideMeta);
}

function buildFunding(ctx) {
  const { deck, theme, components, content, data } = ctx;
  const slideMeta = meta(content, 25);
  const slide = deck.addSlide(theme.masters.light);
  addBase(slide, deck, theme, slideMeta, "資金用途與 18 個月里程碑", { page: null });

  const total = FUNDING_ALLOCATION.reduce((sum, item) => sum + item.value, 0);
  if (total !== data.financing.amountJpy) {
    throw new Error(`Funding allocation ${total} does not equal financing ${data.financing.amountJpy}`);
  }
  slide.addChart(deck.ChartType.doughnut, [{
    name: "資金用途（M日圓）",
    labels: FUNDING_ALLOCATION.map(({ name }) => name),
    values: FUNDING_ALLOCATION.map(({ value }) => value / 1_000_000),
  }], {
    x: 0.62,
    y: 1.45,
    w: 5.0,
    h: 4.85,
    altText: "JPY 200M approved funding allocation doughnut chart",
    objectName: "Native funding allocation doughnut",
    chartColors: [theme.colors.deepForest, theme.colors.dataGreen, theme.colors.sage, theme.colors.orange],
    holeSize: 68,
    showTitle: false,
    showLegend: true,
    legendPos: "b",
    legendColor: theme.colors.muted,
    legendFontFace: theme.font,
    legendFontSize: 9,
    showCategoryName: true,
    showValue: true,
    dataLabelPosition: "bestFit",
    dataLabelColor: theme.colors.darkText,
    dataLabelFontFace: theme.font,
    dataLabelFontSize: 9,
    dataLabelFormatCode: "0\"M\"",
  });
  slide.addShape(deck.ShapeType.ellipse, {
    x: 2.02,
    y: 2.78,
    w: 2.18,
    h: 1.72,
    fill: { color: theme.colors.coolWhite, transparency: 2 },
    line: { color: theme.colors.coolWhite, transparency: 100 },
    objectName: "Funding total center",
  });
  addText(slide, theme, "¥200M", {
    x: 2.34,
    y: 3.15,
    w: 1.56,
    h: 0.5,
    fontSize: 29,
    bold: true,
    color: theme.colors.deepForest,
    align: "center",
    objectName: "Funding total",
  });
  addText(slide, theme, "管理層配置提案", {
    x: 2.26,
    y: 3.8,
    w: 1.72,
    h: 0.24,
    fontSize: 9.5,
    bold: true,
    color: theme.colors.muted,
    align: "center",
    objectName: "Funding proposal qualifier",
  });

  const milestones = [
    ["M0–3", "後端／資料／RBAC", "支付與結算設計"],
    ["M4–6", "意向店 → 試點", "首批付費／完單／留存證據"],
    ["M7–12", "真實 AI 調度資料", "CPS 歸因／佣金試點"],
    ["M13–18", "跨店供給池\n第二城市", "可複製 GTM"],
  ];
  slide.addShape(deck.ShapeType.line, {
    x: 6.06,
    y: 3.66,
    w: 6.1,
    h: 0,
    line: { color: theme.colors.dataGreen, width: 1.65, endArrowType: "triangle" },
    objectName: "Native 18-month milestone timeline",
  });
  milestones.forEach(([period, title, detail], index) => {
    const x = 5.98 + index * 1.67;
    const y = index % 2 === 0 ? 1.62 : 4.02;
    const accent = index === 2 ? theme.colors.orange : theme.colors.dataGreen;
    slide.addShape(deck.ShapeType.ellipse, {
      x: x + 0.56,
      y: 3.43,
      w: 0.48,
      h: 0.48,
      fill: { color: accent },
      line: { color: theme.colors.white, width: 0.8 },
      objectName: `Milestone node ${index + 1}`,
    });
    slide.addShape(deck.ShapeType.roundRect, {
      x,
      y,
      w: 1.62,
      h: 1.48,
      rectRadius: 0.16,
      fill: { color: index === 2 ? theme.colors.orangePale : theme.colors.white },
      line: { color: accent, width: 0.8 },
      objectName: `Milestone card ${index + 1}`,
    });
    addText(slide, theme, period, {
      x: x + 0.18,
      y: y + 0.18,
      w: 1.26,
      h: 0.24,
      fontSize: 10,
      bold: true,
      color: accent,
      align: "center",
      objectName: `Milestone period ${index + 1}`,
    });
    addText(slide, theme, title, {
      x: x + 0.14,
      y: y + 0.55,
      w: 1.34,
      h: 0.4,
      fontSize: 10.2,
      bold: true,
      color: index === 2 ? theme.colors.risk : theme.colors.deepForest,
      align: "center",
      breakLine: true,
      objectName: `Milestone title ${index + 1}`,
    });
    addText(slide, theme, detail, {
      x: x + 0.14,
      y: y + 1.03,
      w: 1.34,
      h: 0.28,
      fontSize: 8.3,
      color: index === 2 ? theme.colors.risk : theme.colors.muted,
      align: "center",
      breakLine: true,
      objectName: `Milestone detail ${index + 1}`,
    });
  });
  components.addDisclosure(slide, deck, {
    x: 5.98,
    y: 5.92,
    w: 6.48,
    h: 0.65,
    text: "資金配置為管理層提案，可依試點證據與實際執行調整；里程碑不是收入或估值承諾。",
  });
  addSourceLine(slide, components, "資料：S5、S7｜配置合計 ¥200M；產品／工程 80M、導入 60M、客服／安全／合規 30M、營運資金 30M。 ");
  addProtectedOddPageNumber(slide, theme, 25);
  addNotes(slide, slideMeta);
}

function buildInvestmentTerms(ctx) {
  const { deck, theme, components, content, data } = ctx;
  const slideMeta = meta(content, 26);
  const slide = deck.addSlide(theme.masters.dark);
  addBase(slide, deck, theme, slideMeta, "Pre-A｜投資條件與算術情境");

  const terms = [
    ["¥200M", "本輪融資"],
    ["10%", "出讓股權"],
    ["¥1.8B", "投前估值"],
    ["¥2.0B", "投後估值"],
  ];
  terms.forEach(([value, label], index) => {
    addMiniMetric(slide, deck, theme, {
      x: 0.76 + index * 3.04,
      y: 1.52,
      w: 2.65,
      value,
      label,
      accent: index === 0 || index === 1 ? theme.colors.sage : theme.colors.orange,
      dark: true,
    });
  });
  addPill(slide, deck, theme, data.financing.round, {
    x: 10.86,
    y: 0.73,
    w: 1.32,
    fill: theme.colors.deepForest,
    line: theme.colors.sage,
    dark: true,
  });

  slide.addShape(deck.ShapeType.roundRect, {
    x: 0.78,
    y: 3.14,
    w: 11.5,
    h: 2.43,
    rectRadius: 0.2,
    fill: { color: theme.colors.deepForest, transparency: 5 },
    line: { color: theme.colors.sage, transparency: 38, width: 0.9 },
    objectName: "Return arithmetic scenario table",
  });
  addText(slide, theme, "只作算術情境｜假設退出時投資人仍持有 10%", {
    x: 1.1,
    y: 3.43,
    w: 5.52,
    h: 0.31,
    fontSize: 14,
    bold: true,
    color: theme.colors.sage,
    objectName: "Return arithmetic heading",
  });
  addText(slide, theme, "公司股權價值", {
    x: 1.1,
    y: 4.02,
    w: 2.05,
    h: 0.25,
    fontSize: 10.5,
    bold: true,
    color: theme.colors.darkMuted,
    objectName: "Company value row heading",
  });
  addText(slide, theme, "投資人 10%", {
    x: 1.1,
    y: 4.61,
    w: 2.05,
    h: 0.25,
    fontSize: 10.5,
    bold: true,
    color: theme.colors.darkMuted,
    objectName: "Investor value row heading",
  });
  addText(slide, theme, "投資倍數（¥200M）", {
    x: 1.1,
    y: 5.19,
    w: 2.05,
    h: 0.25,
    fontSize: 10.5,
    bold: true,
    color: theme.colors.darkMuted,
    objectName: "Investor multiple row heading",
  });
  const scenarios = [
    ["¥10B", "¥1B", "5×"],
    ["¥30B", "¥3B", "15×"],
    ["¥50B", "¥5B", "25×"],
  ];
  scenarios.forEach((values, column) => {
    values.forEach((value, row) => {
      addText(slide, theme, value, {
        x: 3.82 + column * 2.62,
        y: 3.97 + row * 0.59,
        w: 1.68,
        h: 0.31,
        fontSize: row === 2 ? 19 : 15,
        bold: true,
        color: row === 2 ? theme.colors.orange : theme.colors.darkText,
        align: "center",
        objectName: `Return arithmetic ${column + 1}-${row + 1}`,
      });
    });
  });
  components.addDisclosure(slide, deck, {
    x: 0.78,
    y: 5.91,
    w: 11.5,
    h: 0.92,
    text: "僅為算術情境，假設退出時 10% 股權仍完整保留；未計後續稀釋、清算優先權、稅、匯率與退出機率。不是估值、退出或回報預測／保證，也不暗示 IPO 必然發生。",
    tone: "risk",
    dark: true,
  });
  addSourceLine(slide, components, "資料：S5、S6｜Pre-A ¥200M for 10%；投前 ¥1.8B、投後 ¥2.0B。回報表只作算術情境。", { dark: true });
  addNotes(slide, slideMeta);
}

export function buildBusinessSlides(ctx) {
  const builders = [
    buildValidation,
    buildCityDensity,
    buildRevenueCore,
    buildUnitEconomics,
    buildGeneralScenario,
    buildAggressiveScenario,
    buildFunding,
    buildInvestmentTerms,
  ];
  builders.forEach((builder) => builder(ctx));
}

export const BUSINESS_SLIDE_BOUNDS = Object.freeze({ width: W, height: H });
