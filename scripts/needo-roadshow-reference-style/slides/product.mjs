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

export function buildProductSlides(ctx, through = 34) {
  const { deck, components, assets, theme } = ctx;
  const C = theme.colors;

  if (through >= 10) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 10, backgroundImage: assets.market });
    components.addTitle(slide, { title: "NeeDo：把預約、履約、調度、透明點單與 CPS 放進同一平台", w: 6.25, size: 27 });
    const modules = ["多語預約", "AI 排班", "店鋪／服務者 IM", "透明點單", "CPS 歸因與結算"];
    modules.forEach((text, index) => {
      components.addPill(slide, deck, {
        x: 0.65 + (index % 2) * 2.35,
        y: 2.25 + Math.floor(index / 2) * 0.62,
        w: index === 4 ? 4.15 : 2.08,
        h: 0.42,
        text,
        fill: index === 4 ? C.softOrange : C.white,
        color: index === 4 ? C.risk : C.deepGreen,
        line: index === 4 ? C.orange : C.paleGreen,
        size: 11.3,
      });
    });
    components.addCard(slide, deck, {
      x: 0.65, y: 4.38, w: 4.15, h: 1.1,
      body: "一個訂單 ID 串連需求、供給、場所、變更、履約、退款與佣金狀態。",
      bodySize: 13, fill: C.mist, line: C.mint, bodyColor: C.deepGreen, align: "center", shadow: false,
    });
    addFooter(ctx, slide, 10, { tone: "risk" });
  }

  if (through >= 11) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 11, backgroundImage: assets.dualEngine });
    components.addTitle(slide, { title: "Booking 做流量底盤，Request 做高價值即時需求", w: 6.1, size: 29 });
    components.addCard(slide, deck, {
      x: 0.62, y: 1.72, w: 2.65, h: 1.38,
      title: "Booking 普通預約",
      body: "計畫型需求\n選擇時間 → 接單確認 → 完成履約",
      titleColor: C.deepGreen, titleSize: 16, bodySize: 11.5,
    });
    components.addCard(slide, deck, {
      x: 10.05, y: 1.72, w: 2.65, h: 1.38,
      title: "Request 急速發單",
      body: "即時型需求\n廣播需求 → 搶單確認 → 完成履約",
      fill: C.softOrange, line: C.orange, titleColor: C.risk, bodyColor: C.text, titleSize: 16, bodySize: 11.5,
    });
    components.addPill(slide, deck, { x: 4.56, y: 5.15, w: 4.2, text: "統一進入履約、積分、風控與審計帳本", fill: C.white, line: C.mint, size: 12 });
    addFooter(ctx, slide, 11);
  }

  if (through >= 12) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 12, backgroundImage: assets.scheduling });
    components.addTitle(slide, { title: "AI 排班：把臨時變更變成可計算決策", w: 5.4, size: 30 });
    const checks = [
      "技能與資格匹配",
      "可用時段與衝突",
      "場所規則與移動時間",
      "內外部資源優先序",
      "局部重排與替補",
      "人工覆核與稽核紀錄",
    ];
    checks.forEach((text, index) => {
      components.addPill(slide, deck, {
        x: 0.62 + (index % 2) * 2.28,
        y: 2.0 + Math.floor(index / 2) * 0.62,
        w: 2.05, h: 0.42, text, fill: C.white, size: 10.7,
      });
    });
    components.addCard(slide, deck, {
      x: 0.62, y: 4.18, w: 4.35, h: 1.06,
      body: "目標：中介不再逐單找人，而是只處理系統標記的例外。",
      bodySize: 13.5, fill: C.mist, line: C.mint, bodyColor: C.deepGreen, align: "center", shadow: false,
    });
    addFooter(ctx, slide, 12);
  }

  if (through >= 13) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 13 });
    components.addTitle(slide, { title: "人員不足時，AI 依規則擴展可用供給池", w: 10.3 });
    slide.addImage({ path: assets.scheduling, x: 7.55, y: 1.45, w: 5.15, h: 2.9, objectName: "Scheduling resource pools" });
    const pools = [
      ["第一層｜店內服務者", "優先使用既有排班、技能與責任邊界清楚的人員。", C.deepGreen],
      ["第二層｜合作店資源", "在店鋪規則、資格與收益分配已確認時調配。", C.green],
      ["第三層｜外部服務者", "僅在 eKYC、資格、距離、責任與保險條件通過時啟用。", C.mint],
    ];
    pools.forEach(([title, body, color], index) => {
      components.addCard(slide, deck, {
        x: 0.65, y: 1.62 + index * 1.25, w: 6.25, h: 0.96,
        title, body, fill: index === 2 ? C.mist : C.white, line: color,
        titleColor: color, titleSize: 15, bodySize: 10.8, shadow: false,
      });
    });
    components.addPill(slide, deck, { x: 8.28, y: 4.72, w: 3.8, text: "資格 × 時間 × 距離 × 店鋪規則", fill: C.mist, size: 11.8 });
    addFooter(ctx, slide, 13);
  }

  if (through >= 14) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 14 });
    components.addTitle(slide, { title: "平台內完成交易，才能同時保護隱私與店鋪權益", w: 10.4 });
    components.addCard(slide, deck, {
      x: 0.72, y: 1.78, w: 5.7, h: 3.7,
      title: "平台外負循環",
      body: "交換私人 LINE／電話\n↓\n跳過店鋪或中介\n↓\n價格與責任失去紀錄\n↓\n爭議、退款與隱私難以處理",
      fill: C.softOrange, line: C.orange, titleColor: C.risk, bodyColor: C.text, titleSize: 20, bodySize: 16, align: "center",
    });
    components.addCard(slide, deck, {
      x: 6.92, y: 1.78, w: 5.7, h: 3.7,
      title: "平台內正循環",
      body: "角色權限與匿名溝通\n↓\n預約、變更與價格可追蹤\n↓\n履約、退款與分潤可審計\n↓\n店鋪、服務者與客人都獲得保障",
      fill: C.mist, line: C.mint, titleColor: C.deepGreen, bodyColor: C.text, titleSize: 20, bodySize: 16, align: "center",
    });
    addFooter(ctx, slide, 14);
  }

  if (through >= 15) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 15, backgroundImage: assets.ordering });
    components.addTitle(slide, { title: "透明點單：先選、再確認、全程看總額", w: 5.4, size: 30 });
    const items = [
      ["1", "服務與指名費事前可見"],
      ["2", "延長與追加消費需明確確認"],
      ["3", "即時累計含稅總額"],
      ["4", "完成後保留逐項明細"],
    ];
    items.forEach(([n, text], index) => {
      components.addFlowStep(slide, deck, {
        x: 0.62, y: 1.92 + index * 0.76, w: 4.2, h: 0.62,
        index: Number(n), title: text, detail: "", accent: index === 1 ? C.orange : C.green,
      });
    });
    components.addPill(slide, deck, { x: 0.95, y: 5.18, w: 3.55, text: "降低誤導消費、超額收費與帳單爭議", fill: C.white, line: C.orange, color: C.risk, size: 11.4 });
    addFooter(ctx, slide, 15, { tone: "risk" });
  }

  if (through >= 16) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 16, backgroundImage: assets.dualEngine });
    components.addTitle(slide, { title: "AI 提高履約效率，CPS 放大可歸因增長", w: 5.55, size: 29 });
    components.addCard(slide, deck, {
      x: 0.62, y: 1.78, w: 2.85, h: 1.5,
      title: "履約引擎",
      body: "排班、調度、替補、場所、透明點單與風控",
      titleColor: C.deepGreen, titleSize: 17, bodySize: 11.5,
    });
    components.addCard(slide, deck, {
      x: 9.86, y: 1.78, w: 2.85, h: 1.5,
      title: "增長引擎",
      body: "服務上架、達人選擇、推廣、歸因、結算與稽核",
      fill: C.softOrange, line: C.orange, titleColor: C.risk, bodyColor: C.text, titleSize: 17, bodySize: 11.5,
    });
    components.addPill(slide, deck, { x: 4.35, y: 5.22, w: 4.65, text: "每一次增長都必須回到真實履約與退款風控", fill: C.white, line: C.mint, size: 11.8 });
    addFooter(ctx, slide, 16, { tone: "risk" });
  }

  if (through >= 17) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 17, backgroundImage: assets.cps });
    components.addTitle(slide, { title: "從內容到佣金，CPS 讓每一筆增長可追蹤、可歸因", w: 5.5, size: 28 });
    const flow = ["服務上架", "達人選擇", "專屬連結／碼", "預約", "完成履約", "退款風控", "佣金結算"];
    flow.forEach((text, index) => {
      components.addPill(slide, deck, {
        x: 0.62 + (index % 2) * 2.15,
        y: 1.88 + Math.floor(index / 2) * 0.58,
        w: index === 6 ? 4.0 : 1.9,
        text,
        fill: index === 5 ? C.softOrange : C.white,
        line: index === 5 ? C.orange : C.paleGreen,
        color: index === 5 ? C.risk : C.deepGreen,
        size: 10.3,
      });
    });
    components.addCard(slide, deck, {
      x: 0.62, y: 4.72, w: 4.05, h: 0.78,
      body: "只有真實完成且通過退款與風控條件的訂單，才進入佣金結算。",
      bodySize: 11.5, fill: C.mist, line: C.mint, bodyColor: C.deepGreen, align: "center", shadow: false,
    });
    addFooter(ctx, slide, 17, { tone: "risk" });
  }

  if (through >= 18) {
    const slide = deck.addSlide();
    components.addBase(slide, deck, { page: 18 });
    components.addTitle(slide, { title: "核心體驗已可操作；正式後端與商業數據由本輪完成", w: 10.8 });
    const columns = [
      ["已可操作", ["預約與排班流程", "三端高保真產品", "透明點單原型", "CPS 推廣流程"], C.deepGreen, C.white],
      ["本輪完成", ["正式後端與資料庫", "Auth／RBAC／審計", "支付、退款與結算", "真實歸因與營運指標"], C.green, C.white],
      ["尚未宣稱", ["付費店鋪規模", "真實 GMV／CPS 收入", "CAC 與留存已驗證", "成人向業態商用"], C.softOrange, C.risk],
    ];
    columns.forEach(([title, items, fill, color], index) => {
      components.addCard(slide, deck, {
        x: 0.66 + index * 4.18, y: 1.74, w: 3.76, h: 3.98,
        title, body: items.map((item) => `✓ ${item}`).join("\n\n"),
        fill, line: index === 2 ? C.orange : fill,
        titleColor: color, bodyColor: color, titleSize: 20, bodySize: 13.5,
      });
    });
    addFooter(ctx, slide, 18, { tone: "risk" });
  }
}
