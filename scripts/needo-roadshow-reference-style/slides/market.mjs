import { market } from "../../needo-roadshow/data.mjs";

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

function addArrow(ctx, slide, x, y, w = 0.38) {
  slide.addShape(ctx.deck.ShapeType.chevron, {
    x, y, w, h: 0.34,
    fill: { color: ctx.theme.colors.mint, transparency: 10 },
    line: { color: ctx.theme.colors.mint, transparency: 100 },
  });
}

export function buildMarketSlides(ctx, through = 34) {
  const { deck, components, assets, theme } = ctx;
  const C = theme.colors;

  if (through >= 1) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 1, section: "", backgroundImage: assets.cover });
    slide.addText("日本高摩擦服務業的\nAI 調度與達人成交基礎設施", {
      x: 0.62, y: 1.43, w: 5.25, h: 1.55,
      fontFace: theme.fontFace, fontSize: 34, bold: true, color: C.text,
      margin: 0, breakLine: false, fit: "shrink",
    });
    slide.addText("NeeDo 海外投資人 Pre-A 融資簡報", {
      x: 0.65, y: 3.15, w: 4.7, h: 0.34,
      fontFace: theme.fontFace, fontSize: 16, bold: true, color: C.deepGreen,
      margin: 0, fit: "shrink",
    });
    components.addPill(slide, deck, { x: 0.65, y: 3.72, w: 1.45, text: "融資 2 億日圓", fill: C.mist });
    components.addPill(slide, deck, { x: 2.26, y: 3.72, w: 1.25, text: "出讓 10%", fill: C.mist });
    components.addPill(slide, deck, { x: 3.67, y: 3.72, w: 1.05, text: "Pre-A", fill: C.mist });
    slide.addText("讓服務被看見、被選擇、被完成、被分配", {
      x: 0.65, y: 5.77, w: 4.9, h: 0.32,
      fontFace: theme.fontFace, fontSize: 14, bold: true, color: C.green,
      margin: 0, fit: "shrink",
    });
    slide.addText("2026 年｜僅供投資人討論", {
      x: 0.65, y: 6.18, w: 3.2, h: 0.2,
      fontFace: theme.fontFace, fontSize: 9.5, color: C.muted,
      margin: 0,
    });
  }

  if (through >= 2) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 2, backgroundImage: assets.market });
    components.addTitle(slide, { title: "2 億日圓，建立日本服務業的履約與增長雙引擎", w: 6.2, size: 28 });
    components.addCard(slide, deck, {
      x: 0.55, y: 1.63, w: 5.0, h: 3.65,
      title: "本輪融資摘要",
      body: "前 A 輪｜出讓 10% 股權\n投前估值 18 億日圓｜投後估值 20 億日圓\n\n收入核心\n固定 SaaS 月費＋每筆完成預約費\nCPS 與增值服務待真實交易驗證\n\n融資目標\n正式產品化、供給密度、商業驗證與合規安全",
      titleSize: 19, bodySize: 13,
    });
    components.addHeroNumber(slide, { x: 0.82, y: 5.15, w: 2.0, value: "100+", label: "店鋪使用意向", detail: "非簽約／非營收" });
    components.addHeroNumber(slide, { x: 3.18, y: 5.15, w: 2.0, value: "6,000", label: "一般方案 Y3 店鋪", detail: "模型預測" });
    addFooter(ctx, slide, 2, { statementY: 6.35, tone: "risk" });
  }

  if (through >= 3) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 3, backgroundImage: assets.supply });
    components.addTitle(slide, { title: "需求側正在放大，供給側卻仍高度分散", w: 5.1, size: 29 });
    components.addHeroNumber(slide, {
      x: 0.65, y: 2.05, w: 2.2, value: "4,268萬", label: "2025 年訪日外客", detail: "年增 15.8%｜官方統計",
    });
    components.addHeroNumber(slide, {
      x: 3.03, y: 2.05, w: 2.2, value: "412.5萬", label: "2025 年末在留外國人", detail: "年增 9.5%｜官方統計",
    });
    components.addCard(slide, deck, {
      x: 0.65, y: 3.62, w: 4.75, h: 1.65,
      title: "為什麼是現在？",
      body: "生活成本與副業需求推動服務者增加；傳統中介成本上升，店鋪需要更靈活的供給、排班與履約工具。",
      titleSize: 17, bodySize: 12.3,
    });
    addFooter(ctx, slide, 3);
  }

  if (through >= 4) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 4 });
    components.addTitle(slide, { title: "預約形式多年未變，一次改動就觸發整條人工鏈", w: 10.8 });
    const steps = [
      ["客人致電", "詢問時間與服務"],
      ["店鋪記錄", "紙張／LINE／記憶"],
      ["聯絡服務者", "逐一確認空檔"],
      ["確認場所", "店內／飯店／上門"],
      ["回覆客人", "重新說明規則"],
      ["變更重來", "人力與時間翻倍"],
    ];
    steps.forEach(([title, detail], index) => {
      const x = 0.58 + index * 2.08;
      components.addFlowStep(slide, deck, { x, y: 2.05, w: 1.72, h: 1.12, index: index + 1, title, detail });
      if (index < steps.length - 1) addArrow(ctx, slide, x + 1.78, 2.44, 0.25);
    });
    components.addCard(slide, deck, {
      x: 1.05, y: 3.63, w: 11.2, h: 1.55,
      title: "人工協調的真正成本",
      body: "形成一有變動，店鋪或中介必須重新聯絡客人、服務者與場所；取消、遲到、延長和替補都會造成重複回撥與資訊不一致。",
      fill: C.mist, line: C.mint, titleColor: C.deepGreen, bodyColor: C.text, titleSize: 18, bodySize: 13.5, align: "center",
    });
    addFooter(ctx, slide, 4);
  }

  if (through >= 5) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 5, backgroundImage: assets.coordination });
    components.addTitle(slide, { title: "真正瓶頸不是入口，而是五方即時協調", w: 5.2, size: 29 });
    components.addCard(slide, deck, {
      x: 0.58, y: 2.05, w: 4.55, h: 1.42,
      title: "同一筆預約，需要同一個事實來源",
      body: "店鋪、中介、服務者、客人與場所必須共享時間、價格、變更、取消與履約狀態。",
      titleSize: 16.5, bodySize: 11.8,
    });
    components.addCard(slide, deck, {
      x: 0.58, y: 3.72, w: 4.55, h: 1.52,
      title: "高消費場所也必須先選擇、再確認",
      body: "數位點單、明細價格、追加前確認與完整帳單，降低超額消費與帳單爭議。",
      fill: C.softOrange, line: C.orange, titleColor: C.risk, bodyColor: C.text, titleSize: 16.5, bodySize: 11.8,
    });
    addFooter(ctx, slide, 5, { tone: "risk" });
  }

  if (through >= 6) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 6 });
    components.addTitle(slide, { title: "每一個角色，都在為同一筆預約重複付出", w: 10.5 });
    const cards = [
      ["店鋪", "人工排班、回撥、改約、場所協調與費用說明"],
      ["中介", "逐單聯絡客人與服務者，變更時成本成倍增加"],
      ["服務者", "多平台查看、行程衝突、收入與安全資訊分散"],
      ["客人", "語言障礙、價格不透明、取消與履約缺乏保障"],
    ];
    cards.forEach(([title, body], index) => {
      components.addCard(slide, deck, {
        x: 0.58 + index * 3.14, y: 1.93, w: 2.72, h: 2.55,
        title, body, titleSize: 18, bodySize: 12.6,
        fill: index === 1 ? C.mist : C.white,
      });
      components.addPill(slide, deck, {
        x: 1.15 + index * 3.14, y: 4.08, w: 1.58,
        text: ["降低操作成本", "只處理例外", "保護時間與隱私", "獲得可預期體驗"][index],
      });
    });
    components.addCard(slide, deck, {
      x: 2.0, y: 4.88, w: 9.35, h: 0.86,
      body: "NeeDo 的價值不是再增加一個入口，而是把重複確認、行程變更與責任分配變成可計算、可追蹤的事件。",
      bodySize: 13.2, fill: C.mist, line: C.mint, bodyColor: C.deepGreen, align: "center", shadow: false,
    });
    addFooter(ctx, slide, 6);
  }

  if (through >= 7) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 7 });
    components.addTitle(slide, { title: "外國客不是沒有需求，而是被不確定性擋在門外", w: 10.8 });
    const funnel = [
      ["找到店鋪", "網站與社群資訊分散", 9.8, C.deepGreen],
      ["確認可接待", "部分店鋪拒絕外國人", 8.4, C.green],
      ["完成預約", "只支援日語／電話", 7.0, C.mint],
      ["安心履約", "價格、場所與取消不透明", 5.6, "B9DCC7"],
    ];
    funnel.forEach(([title, detail, w, color], index) => {
      const x = 0.72 + (9.8 - w) / 2;
      const y = 1.86 + index * 0.82;
      slide.addShape(deck.ShapeType.roundRect, {
        x, y, w, h: 0.58,
        fill: { color }, line: { color, transparency: 100 },
      });
      slide.addText(`${index + 1}  ${title}｜${detail}`, {
        x: x + 0.2, y: y + 0.17, w: w - 0.4, h: 0.2,
        fontFace: theme.fontFace, fontSize: 12, bold: true,
        color: index < 3 ? C.white : C.deepGreen,
        align: "center", margin: 0, fit: "shrink",
      });
    });
    components.addHeroNumber(slide, { x: 10.55, y: 2.0, w: 2.0, value: "4,268萬", label: "訪日外客", detail: "2025 年" });
    components.addHeroNumber(slide, { x: 10.55, y: 3.54, w: 2.0, value: "412.5萬", label: "在留外國人", detail: "2025 年末" });
    addFooter(ctx, slide, 7);
  }

  if (through >= 8) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 8 });
    components.addTitle(slide, { title: "先解決高摩擦服務，再擴展為生活服務基礎設施", w: 10.8 });
    const layers = [
      ["首發核心", "按摩、美容、上門與高協調度非性服務", 8.6, C.deepGreen],
      ["鄰接市場", "飯店、餐飲、夜間與其他派遣型服務", 7.2, C.green],
      ["未來獨立評估", "受特殊監管成人向市場，不進核心模型", 5.8, C.mint],
    ];
    layers.forEach(([title, body, w, color], index) => {
      const x = 0.72 + (8.6 - w) / 2;
      const y = 1.92 + index * 1.18;
      components.addCard(slide, deck, {
        x, y, w, h: 0.86,
        title, body, fill: index === 2 ? C.mist : C.white, line: color,
        titleColor: color, titleSize: 15, bodySize: 10.5, shadow: false,
      });
    });
    components.addHeroNumber(slide, { x: 9.6, y: 1.95, w: 2.4, value: market.receptionVenues.toLocaleString("zh-TW"), label: "接待飲食營業" });
    components.addHeroNumber(slide, { x: 9.6, y: 3.42, w: 2.4, value: market.lateNightAlcoholVenues.toLocaleString("zh-TW"), label: "深夜酒類營業" });
    components.addHeroNumber(slide, { x: 9.6, y: 4.86, w: 2.4, value: market.dispatchAdultBusinesses.toLocaleString("zh-TW"), label: "派遣型特殊營業", detail: "只作市場分層參考" });
    addFooter(ctx, slide, 8, { tone: "risk" });
  }

  if (through >= 9) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 9 });
    components.addTitle(slide, { title: "高需求市場必須以合規分層進入", w: 9.8 });
    const zones = [
      ["近期核心", "一般按摩、美容、生活服務與合規店鋪 SaaS", C.deepGreen, C.white],
      ["條件式進入", "有資格要求、派遣責任或場所規則的鄰接服務", C.green, C.white],
      ["獨立監管市場", "成人性服務現行條款禁止；未來另行產品、法務與監管評估", C.softOrange, C.risk],
    ];
    zones.forEach(([title, body, fill, color], index) => {
      components.addCard(slide, deck, {
        x: 0.68 + index * 4.19, y: 1.82, w: 3.75, h: 3.78,
        title, body, fill, line: index === 2 ? C.orange : fill,
        titleColor: color, bodyColor: color, titleSize: 20, bodySize: 13.5,
      });
      components.addPill(slide, deck, {
        x: 1.48 + index * 4.19, y: 4.85, w: 2.15,
        text: ["納入核心模型", "按資格與規則開放", "不納入核心模型"][index],
        fill: index === 2 ? C.white : C.mist,
        color: index === 2 ? C.risk : C.deepGreen,
      });
    });
    addFooter(ctx, slide, 9, { tone: "risk" });
  }
}
