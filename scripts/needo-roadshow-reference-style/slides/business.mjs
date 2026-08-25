import { economics, financing, scenarios } from "../../needo-roadshow/data.mjs";

function addFooter(ctx, slide, page, { statementY = 6.05, tone = "neutral" } = {}) {
  const item = ctx.content[page - 1];
  ctx.components.addCard(slide, ctx.deck, {
    x: 0.55, y: statementY, w: 12.2, h: 0.48,
    body: item.statement,
    bodySize: 9.1,
    fill: ctx.theme.colors.white,
    line: ctx.theme.colors.paleGreen,
    shadow: false,
  });
  if (item.disclosure) {
    ctx.components.addDisclosure(slide, ctx.deck, {
      text: item.disclosure,
      x: 0.55, y: 6.6, w: 12.2, h: 0.39, tone,
    });
  }
  ctx.components.addSource(slide, { text: `資料來源：${item.source}` });
}

function scenarioTable(ctx, slide, scenario, { x, y, color }) {
  const { components, deck, theme } = ctx;
  components.addCard(slide, deck, {
    x, y, w: 3.42, h: 3.95,
    title: scenario.label,
    body: "",
    fill: theme.colors.white,
    line: color,
    titleColor: color,
    titleSize: 17,
  });
  const rows = [
    ["期末店鋪", scenario.stores.map((v) => v.toLocaleString("zh-TW"))],
    ["完成訂單", scenario.orders.map((v) => `${(v / 10000).toFixed(1)}萬`)],
    ["營收 MJPY", scenario.revenueM.map((v) => v.toFixed(1))],
    ["營業利潤 MJPY", scenario.profitM.map((v) => (v < 0 ? `-${Math.abs(v).toFixed(1)}` : v.toFixed(1)))],
    ["利潤率", scenario.margin.map((v) => `${v.toFixed(1)}%`)],
  ];
  slide.addText("指標", { x: x + 0.2, y: y + 0.72, w: 0.94, h: 0.22, fontFace: theme.fontFace, fontSize: 9.5, bold: true, color: theme.colors.muted, margin: 0 });
  ["Y1", "Y2", "Y3"].forEach((label, index) => {
    slide.addText(label, { x: x + 1.15 + index * 0.68, y: y + 0.72, w: 0.64, h: 0.22, fontFace: "Arial", fontSize: 9.5, bold: true, color, align: "right", margin: 0 });
  });
  rows.forEach(([label, values], rowIndex) => {
    const rowY = y + 1.1 + rowIndex * 0.53;
    slide.addText(label, { x: x + 0.2, y: rowY, w: 0.92, h: 0.18, fontFace: theme.fontFace, fontSize: 8.4, color: theme.colors.muted, margin: 0, fit: "shrink" });
    values.forEach((value, index) => {
      slide.addText(String(value), { x: x + 1.15 + index * 0.68, y: rowY, w: 0.64, h: 0.18, fontFace: "Arial", fontSize: 8.5, bold: rowIndex === 3, color: rowIndex === 3 && String(value).startsWith("-") ? theme.colors.risk : theme.colors.text, align: "right", margin: 0, fit: "shrink" });
    });
  });
}

export function buildBusinessSlides(ctx, through = 34) {
  const { deck, components, assets, theme } = ctx;
  const C = theme.colors;

  if (through >= 19) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 19, backgroundImage: assets.market });
    components.addTitle(slide, { title: "商業驗證：超過 100 家店鋪表達使用意向", w: 6.25, size: 29 });
    components.addHeroNumber(slide, { x: 0.68, y: 2.0, w: 3.4, h: 1.35, value: "100+", label: "店鋪使用意向", detail: "公司商談紀錄｜截至 2026-08-23", valueSize: 62 });
    components.addCard(slide, deck, {
      x: 0.68, y: 3.72, w: 4.7, h: 1.42,
      title: "下一步驗證",
      body: "CRM 名單 → 試點邀請 → 正式合約 → 收款 → 激活 → 首單 → 留存",
      titleSize: 17, bodySize: 12.5, fill: C.white,
    });
    components.addPill(slide, deck, { x: 0.9, y: 5.42, w: 4.25, text: "使用意向 ≠ 簽約 ≠ 付費 ≠ 營收 ≠ GMV", fill: C.softOrange, line: C.orange, color: C.risk, size: 11.4 });
    addFooter(ctx, slide, 19, { tone: "risk" });
  }

  if (through >= 20) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 20, backgroundImage: assets.roadmap });
    components.addTitle(slide, { title: "從單城供需密度開始，驗證後再複製", w: 5.35, size: 30 });
    components.addCard(slide, deck, {
      x: 0.62, y: 1.72, w: 4.25, h: 1.42,
      title: "東京核心試點",
      body: "優先聚焦高密度商圈、飯店與上門需求；以店鋪激活、首單、響應、履約與復購作為擴張閘門。",
      titleSize: 17, bodySize: 11.8,
    });
    const stages = ["意向轉試點", "單城訂單密度", "第二業態", "第二城市"];
    stages.forEach((text, index) => {
      components.addPill(slide, deck, {
        x: 0.62 + (index % 2) * 2.15,
        y: 3.48 + Math.floor(index / 2) * 0.64,
        w: 1.95, h: 0.44, text, fill: C.white, size: 10.5,
      });
    });
    components.addPill(slide, deck, { x: 0.9, y: 5.15, w: 3.72, text: "未過 KPI 不擴張，不以預算時間自動釋放", fill: C.softOrange, line: C.orange, color: C.risk, size: 10.7 });
    addFooter(ctx, slide, 20);
  }

  if (through >= 21) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 21 });
    components.addTitle(slide, { title: "多元收入，但只有一個核心：可完成的服務交易", w: 10.8 });
    const center = { x: 6.65, y: 3.45 };
    slide.addShape(deck.ShapeType.ellipse, {
      x: 5.45, y: 2.25, w: 2.4, h: 2.4,
      fill: { color: C.deepGreen }, line: { color: C.mint, width: 1.5 },
      shadow: { type: "outer", color: "76837D", opacity: 0.12, blur: 1.6, angle: 45, distance: 1 },
    });
    slide.addText("完成履約\n交易核心", {
      x: 5.85, y: 3.04, w: 1.6, h: 0.66,
      fontFace: theme.fontFace, fontSize: 18, bold: true, color: C.white,
      align: "center", margin: 0, fit: "shrink",
    });
    const nodes = [
      [1.0, 1.85, "SaaS 月費", "¥9,800／店／月"],
      [1.05, 4.55, "預約平台費", "¥500／完成單"],
      [9.85, 1.85, "介紹成功報酬", "¥30,000／店"],
      [9.75, 4.55, "CPS／增值服務", "待真實歸因驗證"],
    ];
    nodes.forEach(([x, y, title, detail], index) => {
      components.addOrbitNode(slide, deck, { x, y, diameter: 1.2, label: title, accent: index === 3 ? C.orange : C.green, center });
      slide.addText(detail, { x: x - 0.2, y: y + 1.32, w: 1.6, h: 0.22, fontFace: theme.fontFace, fontSize: 9.2, color: index === 3 ? C.risk : C.muted, align: "center", margin: 0, fit: "shrink" });
    });
    addFooter(ctx, slide, 21, { tone: "risk" });
  }

  if (through >= 22) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 22 });
    components.addTitle(slide, { title: "低門檻 SaaS 建立關係，交易收入放大價值", y: 0.82, w: 10.5, h: 0.56, size: 27 });
    const hero = [
      ["¥9,800", "每店每月 SaaS", "最低 6 個月", C.deepGreen],
      ["¥500", "每筆完成預約費", "前 3 個月只免此費", C.green],
      ["約¥340", "簡化單筆貢獻", "支付／準備／獎勵／雲端後", C.mint],
      ["68%", "簡化貢獻率", "340 ÷ 500", C.orange],
    ];
    hero.forEach(([value, label, detail, color], index) => {
      components.addCard(slide, deck, { x: 0.65 + index * 3.14, y: 1.7, w: 2.72, h: 1.55, fill: index === 3 ? C.softOrange : C.white, line: color });
      components.addHeroNumber(slide, { x: 0.87 + index * 3.14, y: 1.95, w: 2.3, h: 0.98, value, label, detail, accent: color, valueSize: 33 });
    });
    components.addCard(slide, deck, {
      x: 0.68, y: 3.72, w: 5.85, h: 1.65,
      title: "付費獲客 CAC 回收",
      body: `CAC ¥${economics.paidStoreCac.toLocaleString("zh-TW")} ÷ SaaS ¥${economics.storeSaasMonthly.toLocaleString("zh-TW")} ＝ 約 1.53 個月`,
      titleSize: 16, bodySize: 15, fill: C.mist, line: C.mint, bodyColor: C.deepGreen, align: "center",
    });
    components.addCard(slide, deck, {
      x: 6.82, y: 3.72, w: 5.85, h: 1.65,
      title: "介紹成功報酬回收",
      body: `成功報酬 ¥${economics.referralSuccessFee.toLocaleString("zh-TW")} ÷ SaaS ¥${economics.storeSaasMonthly.toLocaleString("zh-TW")} ＝ 約 3.06 個月`,
      titleSize: 16, bodySize: 15, fill: C.white, line: C.green, bodyColor: C.deepGreen, align: "center",
    });
    addFooter(ctx, slide, 22, { tone: "risk" });
  }

  if (through >= 23) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 23 });
    components.addTitle(slide, { title: "一般方案：三年形成 6,000 店的高密度履約網路", w: 9.2 });
    components.addNativeColumnChart(slide, deck, {
      series: [
        { name: "營業收入（MJPY）", labels: ["Y1", "Y2", "Y3"], values: scenarios.general.revenueM },
        { name: "營業利潤（MJPY）", labels: ["Y1", "Y2", "Y3"], values: scenarios.general.profitM },
      ],
      x: 0.65, y: 1.55, w: 8.22, h: 4.18,
      colors: [C.green, C.text], altText: "一般方案三年營收與營業利潤",
    });
    scenarioTable(ctx, slide, scenarios.general, { x: 9.18, y: 1.58, color: C.green });
    components.addPill(slide, deck, { x: 9.52, y: 5.67, w: 2.72, text: "Y3 利潤 23.52 億日圓", fill: C.mist, size: 11.5 });
    addFooter(ctx, slide, 23, { tone: "risk" });
  }

  if (through >= 24) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 24 });
    components.addTitle(slide, { title: "激進方案：三年挑戰 10,000 店", y: 0.82, w: 8.5, h: 0.56, size: 29 });
    components.addPill(slide, deck, { x: 9.15, y: 0.88, w: 2.75, h: 0.3, text: "資源與渠道更快到位", fill: C.softOrange, line: C.orange, color: C.risk, size: 10.4 });
    components.addNativeColumnChart(slide, deck, {
      series: [
        { name: "營業收入（MJPY）", labels: ["Y1", "Y2", "Y3"], values: scenarios.aggressive.revenueM },
        { name: "營業利潤（MJPY）", labels: ["Y1", "Y2", "Y3"], values: scenarios.aggressive.profitM },
      ],
      x: 0.65, y: 1.55, w: 8.22, h: 4.18,
      colors: [C.orange, "6C7B74"], altText: "激進方案三年營收與營業利潤",
    });
    scenarioTable(ctx, slide, scenarios.aggressive, { x: 9.18, y: 1.58, color: C.orange });
    components.addPill(slide, deck, { x: 9.52, y: 5.67, w: 2.72, text: "Y3 利潤 47.13 億日圓", fill: C.softOrange, line: C.orange, color: C.risk, size: 11.5 });
    addFooter(ctx, slide, 24);
  }

  if (through >= 25) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 25 });
    components.addTitle(slide, { title: "2 億日圓，轉化為正式產品、城市供給與商業驗證", w: 10.5 });
    slide.addChart(deck.ChartType.doughnut, [{
      name: "資金配置",
      labels: ["產品與工程", "市場／店鋪導入", "客服／安全／合規", "營運資金"],
      values: [80, 60, 30, 30],
    }], {
      x: 0.65, y: 1.55, w: 4.6, h: 4.55,
      holeSize: 58,
      chartColors: [C.deepGreen, C.green, C.mint, C.orange],
      showLegend: false,
      showTitle: false,
      showPercent: false,
      showValue: false,
      showBorder: false,
      objectName: "Native funding doughnut",
      altText: "2億日圓資金配置",
    });
    slide.addText("¥200M", { x: 1.9, y: 3.27, w: 2.1, h: 0.55, fontFace: "Arial", fontSize: 31, bold: true, color: C.deepGreen, align: "center", margin: 0 });
    const allocations = [
      ["80M｜40%", "產品與工程", "正式後端、AI排班、CPS歸因與結算"],
      ["60M｜30%", "市場／店鋪導入", "單城供給密度、BD與合作渠道"],
      ["30M｜15%", "客服／安全／合規", "風控、eKYC、法務、監控與保險"],
      ["30M｜15%", "營運資金", "公司運營與里程碑緩衝"],
    ];
    allocations.forEach(([value, title, body], index) => {
      components.addCard(slide, deck, { x: 5.55, y: 1.58 + index * 1.08, w: 6.95, h: 0.84, title: `${value}｜${title}`, body, titleSize: 14, bodySize: 10.2, shadow: false, fill: index === 3 ? C.softOrange : C.white, line: index === 3 ? C.orange : C.paleGreen });
    });
    components.addPill(slide, deck, { x: 6.25, y: 5.73, w: 5.55, h: 0.3, text: "18 個月：從可操作原型走到可複製的單城模型", fill: C.mist, size: 11.2 });
    addFooter(ctx, slide, 25);
  }

  if (through >= 26) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 26 });
    slide.addText("本輪 Pre-A 融資條件", {
      x: 0.55, y: 0.82, w: 5.7, h: 0.5,
      fontFace: theme.fontFace, fontSize: 28, bold: true,
      color: C.text, margin: 0,
      objectName: "Slide title",
    });
    components.addPill(slide, deck, { x: 9.15, y: 0.88, w: 2.75, h: 0.3, text: "投前 18 億｜投後 20 億", fill: C.mist, size: 10.4 });
    const terms = [
      ["¥200M", "本輪融資"],
      ["10%", "出讓股權"],
      ["¥1.8B", "投前估值"],
      ["¥2.0B", "投後估值"],
    ];
    terms.forEach(([value, label], index) => {
      components.addCard(slide, deck, { x: 0.66 + index * 3.15, y: 1.72, w: 2.72, h: 1.45, fill: index === 0 ? C.mist : C.white, line: index === 1 ? C.orange : C.paleGreen, shadow: false });
      components.addHeroNumber(slide, { x: 0.9 + index * 3.15, y: 1.97, w: 2.2, value, label, accent: index === 1 ? C.orange : C.green, valueSize: 35 });
    });
    components.addCard(slide, deck, {
      x: 0.68, y: 3.68, w: 5.85, h: 1.62,
      title: "一般方案",
      body: "Y3：6,000 店｜營收 41.63 億日圓｜營業利潤 23.52 億日圓",
      titleSize: 17, bodySize: 14, fill: C.mist, line: C.mint, bodyColor: C.deepGreen, align: "center", shadow: false,
    });
    components.addCard(slide, deck, {
      x: 6.82, y: 3.68, w: 5.85, h: 1.62,
      title: "激進方案",
      body: "Y3：10,000 店｜營收 89.07 億日圓｜營業利潤 47.13 億日圓",
      titleSize: 17, bodySize: 14, fill: C.softOrange, line: C.orange, titleColor: C.risk, bodyColor: C.text, align: "center", shadow: false,
    });
    components.addPill(slide, deck, { x: 3.95, y: 5.55, w: 5.45, text: `${financing.round}｜最終交易條件以正式協議為準`, fill: C.white, line: C.mint, size: 11.5 });
    addFooter(ctx, slide, 26, { tone: "risk" });
  }
}
