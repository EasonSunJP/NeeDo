import { scenarios, sources } from "../../needo-roadshow/data.mjs";

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

export function buildAppendixSlides(ctx, through = 34) {
  const { deck, components, assets, theme } = ctx;
  const C = theme.colors;

  if (through >= 27) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 27, section: "附錄｜情境與盡調" });
    components.addTitle(slide, { title: "保守情境：較慢擴張仍保留正向現金生成能力", w: 10.5 });
    components.addNativeColumnChart(slide, deck, {
      series: [
        { name: "營業收入（MJPY）", labels: ["Y1", "Y2", "Y3"], values: scenarios.conservative.revenueM },
        { name: "營業利潤（MJPY）", labels: ["Y1", "Y2", "Y3"], values: scenarios.conservative.profitM },
      ],
      x: 0.65, y: 1.55, w: 8.55, h: 4.18,
      colors: [C.conservative, C.green], altText: "保守情境三年營收與營業利潤",
    });
    components.addCard(slide, deck, {
      x: 9.55, y: 1.58, w: 3.0, h: 3.9,
      title: "保守壓力測試",
      body: `期末店鋪\n500 → 1,000 → 2,000\n\nY3 營收\n643.2 MJPY\n\nY3 營業利潤\n247.3 MJPY\n\n最低現金\n144.9 MJPY｜第 10 個月`,
      titleSize: 17, bodySize: 13, fill: C.white, line: C.conservative,
    });
    components.addPill(slide, deck, { x: 9.86, y: 5.67, w: 2.4, text: "僅附錄，不是主情境", fill: C.mist, color: C.muted, size: 10.5 });
    addFooter(ctx, slide, 27);
  }

  if (through >= 28) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 28, section: "附錄｜情境與盡調" });
    components.addTitle(slide, { title: "三種情境的差異，是供給速度、訂單密度與執行資源", y: 0.82, w: 10.8, h: 0.56, size: 26 });
    const rows = [
      ["保守", scenarios.conservative, C.conservative, "低投放、慢激活，作壓力測試"],
      ["一般", scenarios.general, C.green, "以原 V2.2 高速增長作主方案"],
      ["激進", scenarios.aggressive, C.orange, "供給、渠道、研發與客服同步加速"],
    ];
    rows.forEach(([label, scenario, color, note], index) => {
      const y = 1.72 + index * 1.33;
      components.addCard(slide, deck, { x: 0.68, y, w: 12.0, h: 1.0, fill: index === 2 ? C.softOrange : C.white, line: color, shadow: false });
      components.addPill(slide, deck, { x: 0.92, y: y + 0.24, w: 1.05, text: label, fill: color, color: C.white, line: color });
      slide.addText(`${scenario.stores[0].toLocaleString("zh-TW")} → ${scenario.stores[1].toLocaleString("zh-TW")} → ${scenario.stores[2].toLocaleString("zh-TW")} 店`, { x: 2.18, y: y + 0.18, w: 2.7, h: 0.24, fontFace: "Arial", fontSize: 15, bold: true, color, margin: 0 });
      slide.addText(`Y3 營收 ${scenario.revenueM[2].toFixed(1)} MJPY｜Y3 利潤 ${scenario.profitM[2].toFixed(1)} MJPY`, { x: 5.05, y: y + 0.18, w: 3.6, h: 0.24, fontFace: theme.fontFace, fontSize: 11.5, bold: true, color: C.text, margin: 0, fit: "shrink" });
      slide.addText(note, { x: 8.8, y: y + 0.18, w: 3.45, h: 0.45, fontFace: theme.fontFace, fontSize: 10.2, color: C.muted, margin: 0, fit: "shrink" });
    });
    components.addPill(slide, deck, { x: 2.05, y: 5.47, w: 9.25, h: 0.4, text: "三種情境不是三個同時成立的承諾；實際擴張依激活、CAC、復購、取消率、履約與現金狀況逐階段調整。", fill: C.mist, line: C.mint, color: C.deepGreen, size: 10.1 });
    addFooter(ctx, slide, 28);
  }

  if (through >= 29) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 29, section: "附錄｜情境與盡調" });
    components.addTitle(slide, { title: "現金風險集中在前 10 個月，必須以里程碑控制投放", w: 10.8 });
    const quarters = Array.from({ length: 12 }, (_, index) => String(index + 1));
    components.addNativeLineChart(slide, deck, {
      series: [
        { name: "保守", labels: quarters, values: scenarios.conservative.cashQuarterM },
        { name: "一般", labels: quarters, values: scenarios.general.cashQuarterM },
        { name: "激進", labels: quarters, values: scenarios.aggressive.cashQuarterM },
      ],
      x: 0.65, y: 1.48, w: 8.95, h: 4.25,
      colors: [C.conservative, C.green, C.orange], altText: "三情境十二季度期末現金曲線",
    });
    components.addCard(slide, deck, {
      x: 9.88, y: 1.58, w: 2.65, h: 3.95,
      title: "風險窗口",
      body: `保守\n第 ${scenarios.conservative.positiveMonth} 個月轉正\n最低 ${scenarios.conservative.minCashM.toFixed(1)} MJPY\n\n一般\n第 ${scenarios.general.positiveMonth} 個月轉正\n最低 ${scenarios.general.minCashM.toFixed(1)} MJPY\n\n激進\n第 ${scenarios.aggressive.positiveMonth} 個月轉正\n最低 ${scenarios.aggressive.minCashM.toFixed(1)} MJPY`,
      titleSize: 17, bodySize: 12.2, fill: C.softOrange, line: C.orange, titleColor: C.risk, bodyColor: C.text,
    });
    slide.addText("季度（1–12）", { x: 3.75, y: 5.62, w: 2.0, h: 0.18, fontFace: theme.fontFace, fontSize: 8.5, color: C.muted, align: "center", margin: 0 });
    addFooter(ctx, slide, 29);
  }

  if (through >= 30) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 30, section: "附錄｜情境與盡調" });
    components.addTitle(slide, { title: "資料來源分層", y: 0.82, w: 5.2, h: 0.56, size: 29 });
    components.addPill(slide, deck, { x: 4.25, y: 0.88, w: 3.05, h: 0.3, text: "市場｜合規｜內部模型", fill: C.mist, size: 10.4 });
    const groups = [
      ["需求與人口", sources.filter((item) => ["S1", "S2"].includes(item.id)), C.deepGreen],
      ["業態與合規", sources.filter((item) => ["S3", "S4"].includes(item.id)), C.green],
      ["公司內部資料", sources.filter((item) => ["S5", "S6", "S7"].includes(item.id)), C.orange],
    ];
    groups.forEach(([title, items, color], index) => {
      components.addCard(slide, deck, {
        x: 0.65 + index * 4.18, y: 1.58, w: 3.75, h: 4.25,
        title,
        body: items.map((item) => `${item.id}｜${item.title}\n用途：${item.used}\n${item.url}`).join("\n\n"),
        fill: index === 2 ? C.softOrange : C.white,
        line: color,
        titleColor: index === 2 ? C.risk : color,
        bodyColor: C.muted,
        titleSize: 18,
        bodySize: 8.6,
      });
    });
    addFooter(ctx, slide, 30, { tone: "risk" });
  }

  if (through >= 31) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 31, section: "附錄｜情境與盡調" });
    components.addTitle(slide, { title: "合規與風險控制，是產品架構的一部分", w: 10.4 });
    const cards = [
      ["業態分層", "一般服務、資格業態與獨立受監管市場分離"],
      ["身份與資格", "店鋪、服務者、達人 eKYC 與必要資格核驗"],
      ["權限與隱私", "最小權限、匿名溝通、敏感資料分角色呈現"],
      ["價格與同意", "含稅價格、追加確認、退款與取消規則可追蹤"],
      ["履約與安全", "行程、場所、替補、SOS、保險與事故流程"],
      ["審計與爭議", "訂單事件、結算、退款、佣金與操作日誌留痕"],
    ];
    cards.forEach(([title, body], index) => {
      components.addCard(slide, deck, {
        x: 0.66 + (index % 3) * 4.18,
        y: 1.62 + Math.floor(index / 3) * 1.92,
        w: 3.76, h: 1.52,
        title, body,
        fill: index === 5 ? C.softOrange : C.white,
        line: index === 5 ? C.orange : C.paleGreen,
        titleColor: index === 5 ? C.risk : C.deepGreen,
        titleSize: 16.5, bodySize: 11.2,
      });
    });
    addFooter(ctx, slide, 31, { tone: "risk" });
  }

  if (through >= 32) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 32, section: "附錄｜18 個月路線圖", backgroundImage: assets.roadmap });
    components.addTitle(slide, { title: "從可操作原型，到可複製的跨城市履約網路", w: 5.25, size: 29 });
    const milestones = [
      [2.18, 4.52, "01", "正式後端"],
      [3.78, 3.97, "02", "試點激活"],
      [5.28, 3.52, "03", "單城密度"],
      [6.73, 3.06, "04", "AI／CPS驗證"],
      [8.18, 2.55, "05", "第二業態"],
      [9.62, 2.08, "06", "第二城市"],
    ];
    milestones.forEach(([x, y, num, label]) => {
      slide.addShape(deck.ShapeType.ellipse, { x, y, w: 0.52, h: 0.52, fill: { color: C.deepGreen }, line: { color: C.white, width: 1.3 } });
      slide.addText(num, { x: x + 0.08, y: y + 0.17, w: 0.36, h: 0.14, fontFace: "Arial", fontSize: 9, bold: true, color: C.white, align: "center", margin: 0 });
      components.addPill(slide, deck, { x: x - 0.32, y: y + 0.61, w: 1.16, h: 0.32, text: label, fill: C.white, size: 8.5 });
    });
    components.addCard(slide, deck, { x: 0.62, y: 1.75, w: 3.95, h: 1.48, title: "每階段都有驗收閘門", body: "激活、首單、CAC、復購、取消率、履約品質與安全事件未過線，不進入下一階段。", titleSize: 16, bodySize: 11.2 });
    addFooter(ctx, slide, 32);
  }

  if (through >= 33) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 33, section: "附錄｜情境與盡調" });
    components.addTitle(slide, { title: "投資人盡調：主動把已驗證與未驗證項目分開", w: 10.8 });
    const columns = [
      ["公司與治理", ["公司登記／股權結構", "董事與關係人", "法務與會計資料"], C.deepGreen],
      ["產品與技術", ["產品演示與架構", "正式開發計畫", "資安／權限／資料流"], C.green],
      ["商業與驗證", ["100+ 意向原始紀錄", "CRM／合約／收款", "試點 KPI 與留存"], C.mint],
      ["財務與模型", ["V2.2 原始模型", "一般／激進／保守假設", "資金用途與現金曲線"], C.orange],
    ];
    columns.forEach(([title, items, color], index) => {
      components.addCard(slide, deck, {
        x: 0.62 + index * 3.15, y: 1.68, w: 2.78, h: 3.95,
        title, body: items.map((item) => `✓ ${item}`).join("\n\n"),
        fill: index === 3 ? C.softOrange : C.white,
        line: color,
        titleColor: index === 3 ? C.risk : C.deepGreen,
        bodyColor: C.text,
        titleSize: 17, bodySize: 12.2,
      });
    });
    addFooter(ctx, slide, 33);
  }

  if (through >= 34) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 34, section: "", backgroundImage: assets.cover });
    slide.addText("NeeDo", { x: 0.65, y: 1.08, w: 2.6, h: 0.5, fontFace: "Arial", fontSize: 30, bold: true, color: C.deepGreen, margin: 0 });
    slide.addText("讓服務被看見、被選擇、\n被完成、被分配", { x: 0.65, y: 1.78, w: 4.8, h: 1.15, fontFace: theme.fontFace, fontSize: 29, bold: true, color: C.text, margin: 0, fit: "shrink" });
    slide.addText("Pre-A｜融資 2 億日圓｜出讓 10% 股權", { x: 0.65, y: 3.08, w: 4.3, h: 0.32, fontFace: theme.fontFace, fontSize: 15, bold: true, color: C.green, margin: 0 });
    const next = ["產品／資料室演示", "試點店鋪驗證", "模型與敏感度討論", "條款與 18 個月里程碑"];
    next.forEach((text, index) => {
      components.addPill(slide, deck, { x: 0.65, y: 3.76 + index * 0.52, w: 3.85, h: 0.38, text: `${String(index + 1).padStart(2, "0")}  ${text}`, fill: index === 3 ? C.softOrange : C.white, line: index === 3 ? C.orange : C.paleGreen, color: index === 3 ? C.risk : C.deepGreen, size: 10.8 });
    });
    components.addSource(slide, { text: "NeeDo｜僅供投資人討論｜聯絡方式與資料室內容以正式盡調文件為準" });
  }
}
