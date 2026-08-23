const W = 13.333;
const H = 7.5;

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

function addBase(slide, deck, theme, slideMeta, kicker) {
  const dark = slideMeta.mode === "dark";
  const base = dark ? theme.addDarkBase : theme.addLightBase;
  base(slide, deck, { title: slideMeta.title, page: slideMeta.page, kicker });
}

function addPill(slide, deck, theme, text, {
  x,
  y,
  w,
  h = 0.38,
  fill = theme.colors.mist,
  line = theme.colors.sage,
  color = theme.colors.deepForest,
  fontSize = 10.5,
  dark = false,
} = {}) {
  slide.addShape(deck.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.12,
    fill: { color: fill, transparency: dark ? 12 : 0 },
    line: { color: line, width: 0.7, transparency: dark ? 38 : 10 },
    objectName: `Label: ${text}`,
  });
  addText(slide, theme, text, {
    x: x + 0.09,
    y: y + 0.09,
    w: w - 0.18,
    h: h - 0.17,
    fontSize,
    bold: true,
    color: dark ? theme.colors.darkText : color,
    align: "center",
    valign: "mid",
    objectName: `Label text: ${text}`,
  });
}

function addModuleNode(slide, deck, theme, {
  x,
  y,
  w,
  h,
  title,
  detail,
  accent = theme.colors.sage,
  dark = false,
} = {}) {
  slide.addShape(deck.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.18,
    fill: { color: dark ? theme.colors.deepForest : theme.colors.white, transparency: dark ? 7 : 1 },
    line: { color: accent, width: 0.9, transparency: dark ? 34 : 12 },
    shadow: { type: "outer", color: theme.colors.nightForest, opacity: 0.11, blur: 1.2, angle: 45, distance: 1 },
    objectName: `Module: ${title}`,
  });
  slide.addShape(deck.ShapeType.ellipse, {
    x: x + 0.2,
    y: y + 0.2,
    w: 0.13,
    h: 0.13,
    fill: { color: accent },
    line: { color: accent, transparency: 100 },
    objectName: `Module marker: ${title}`,
  });
  addText(slide, theme, title, {
    x: x + 0.45,
    y: y + 0.17,
    w: w - 0.65,
    h: 0.28,
    fontSize: 14.5,
    bold: true,
    color: dark ? theme.colors.darkText : theme.colors.deepForest,
    objectName: `Module title: ${title}`,
  });
  addText(slide, theme, detail, {
    x: x + 0.22,
    y: y + 0.57,
    w: w - 0.44,
    h: h - 0.75,
    fontSize: 10.5,
    color: dark ? theme.colors.darkMuted : theme.colors.muted,
    align: "center",
    valign: "mid",
    breakLine: true,
    objectName: `Module detail: ${title}`,
  });
}

function buildPlatformOverview(ctx) {
  const { deck, theme, components, content } = ctx;
  const slideMeta = meta(content, 10);
  const slide = deck.addSlide(theme.masters.dark);
  addBase(slide, deck, theme, slideMeta, "平台作業系統");

  const center = { x: 5.08, y: 2.58, w: 3.18, h: 1.75 };
  const centerPoint = { x: center.x + center.w / 2, y: center.y + center.h / 2 };
  const modules = [
    { x: 0.86, y: 1.78, w: 3.18, h: 1.22, title: "多語預約", detail: "需求、服務、時間與場所進入同一訂單", accent: theme.colors.sage },
    { x: 9.28, y: 1.78, w: 3.18, h: 1.22, title: "AI 排班", detail: "技能、空檔、距離與場所限制共同計算", accent: "8FC3A8" },
    { x: 1.1, y: 4.76, w: 3.18, h: 1.22, title: "透明點單", detail: "選項、確認、累計與明細留在交易內", accent: theme.colors.orange },
    { x: 9.04, y: 4.76, w: 3.18, h: 1.22, title: "CPS 增長", detail: "內容來源連接可履約服務與合格結算", accent: theme.colors.sage },
    { x: 5.0, y: 5.34, w: 3.34, h: 1.0, title: "保障／支付／結算", detail: "退款、權益、爭議、分配與審計", accent: theme.colors.orange },
  ];

  modules.forEach(({ x, y, w, h }, index) => {
    const target = { x: x + w / 2, y: y + h / 2 };
    if (index < 2) {
      slide.addShape(deck.ShapeType.line, {
        x: Math.min(target.x, centerPoint.x),
        y: Math.min(target.y, centerPoint.y),
        w: Math.abs(centerPoint.x - target.x),
        h: Math.abs(centerPoint.y - target.y),
        line: { color: theme.colors.sage, transparency: 54, width: 1.2 },
        objectName: `Platform connector ${index + 1}`,
      });
    } else if (index < 4) {
      slide.addShape(deck.ShapeType.line, {
        x: Math.min(target.x, centerPoint.x),
        y: Math.min(target.y, centerPoint.y),
        w: Math.abs(centerPoint.x - target.x),
        h: Math.abs(centerPoint.y - target.y),
        line: { color: theme.colors.sage, transparency: 54, width: 1.2 },
        objectName: `Platform connector ${index + 1}`,
      });
    } else {
      slide.addShape(deck.ShapeType.line, {
        x: centerPoint.x,
        y: center.y + center.h,
        w: 0,
        h: y - (center.y + center.h),
        line: { color: theme.colors.orange, transparency: 42, width: 1.35 },
        objectName: "Platform connector 5",
      });
    }
  });

  slide.addShape(deck.ShapeType.ellipse, {
    x: center.x,
    y: center.y,
    w: center.w,
    h: center.h,
    fill: { color: theme.colors.sage, transparency: 9 },
    line: { color: theme.colors.darkText, transparency: 48, width: 1.2 },
    shadow: { type: "outer", color: "000000", opacity: 0.22, blur: 1.8, angle: 45, distance: 1 },
    objectName: "NeeDo platform core",
  });
  addText(slide, theme, "NeeDo", {
    x: 5.67,
    y: 2.96,
    w: 2.0,
    h: 0.42,
    fontSize: 27,
    bold: true,
    color: theme.colors.white,
    align: "center",
    objectName: "NeeDo core label",
  });
  addText(slide, theme, "協調 × 履約基礎設施", {
    x: 5.48,
    y: 3.51,
    w: 2.38,
    h: 0.27,
    fontSize: 12,
    bold: true,
    color: theme.colors.darkText,
    align: "center",
    objectName: "NeeDo core definition",
  });
  modules.forEach((module) => addModuleNode(slide, deck, theme, { ...module, dark: true }));

  components.addDisclosure(slide, deck, {
    x: 0.86,
    y: 6.55,
    w: 11.36,
    h: 0.42,
    text: "平台定位是協調與履約基礎設施；目前為可操作原型，正式後端、交易與商業證據仍待驗證。",
    dark: true,
  });
  addSourceLine(slide, components, "資料：S5、S7｜所有模組標籤、流程與披露均為原生 PowerPoint 元素。", { dark: true });
  addNotes(slide, slideMeta);
}

function buildFulfillmentLoop(ctx) {
  const { deck, theme, components, content } = ctx;
  const slideMeta = meta(content, 11);
  const slide = deck.addSlide(theme.masters.light);
  addBase(slide, deck, theme, slideMeta, "六階段履約閉環");

  slide.addShape(deck.ShapeType.circularArrow, {
    x: 3.72,
    y: 1.45,
    w: 5.88,
    h: 5.22,
    rotate: 18,
    fill: { color: theme.colors.mist, transparency: 18 },
    line: { color: theme.colors.sage, transparency: 38, width: 1.1 },
    objectName: "Native six-stage fulfillment loop",
  });
  slide.addShape(deck.ShapeType.ellipse, {
    x: 5.17,
    y: 2.78,
    w: 2.98,
    h: 2.38,
    fill: { color: theme.colors.deepForest },
    line: { color: theme.colors.sage, width: 1.1 },
    objectName: "Fulfillment event core",
  });
  addText(slide, theme, "一筆交易", {
    x: 5.7,
    y: 3.36,
    w: 1.92,
    h: 0.38,
    fontSize: 24,
    bold: true,
    color: theme.colors.white,
    align: "center",
    objectName: "Fulfillment core title",
  });
  addText(slide, theme, "同一可驗證事件鏈", {
    x: 5.48,
    y: 4.02,
    w: 2.35,
    h: 0.26,
    fontSize: 11.5,
    bold: true,
    color: theme.colors.darkMuted,
    align: "center",
    objectName: "Fulfillment core detail",
  });

  const stages = [
    ["01", "探索／內容", "搜尋・內容・入口", 1.0, 1.7],
    ["02", "選擇", "服務・人・時間・場所", 4.72, 1.45],
    ["03", "預約／確認", "可用性・價格・規則", 9.08, 1.73],
    ["04", "調整／履約", "改約・替補・完單", 9.27, 4.82],
    ["05", "保障／支付", "支付・退款・爭議", 4.72, 5.32],
    ["06", "歸因／結算", "來源・權益・佣金", 0.82, 4.82],
  ];
  stages.forEach(([number, title, detail, x, y], index) => {
    const accent = index === 4 ? theme.colors.orange : theme.colors.dataGreen;
    slide.addShape(deck.ShapeType.ellipse, {
      x,
      y,
      w: 2.54,
      h: 1.08,
      fill: { color: index === 4 ? theme.colors.orangePale : theme.colors.white },
      line: { color: accent, width: 0.9 },
      shadow: { type: "outer", color: theme.colors.deepForest, opacity: 0.08, blur: 1, angle: 45, distance: 1 },
      objectName: `Fulfillment stage ${number}: ${title}`,
    });
    addText(slide, theme, number, {
      x: x + 0.2,
      y: y + 0.18,
      w: 0.34,
      h: 0.22,
      fontSize: 10,
      bold: true,
      color: accent,
      objectName: `Fulfillment stage number ${number}`,
    });
    addText(slide, theme, title, {
      x: x + 0.62,
      y: y + 0.16,
      w: 1.67,
      h: 0.28,
      fontSize: 13,
      bold: true,
      color: theme.colors.deepForest,
      objectName: `Fulfillment stage title ${number}`,
    });
    addText(slide, theme, detail, {
      x: x + 0.24,
      y: y + 0.61,
      w: 2.04,
      h: 0.22,
      fontSize: 9.7,
      color: theme.colors.muted,
      align: "center",
      objectName: `Fulfillment stage detail ${number}`,
    });
  });

  addText(slide, theme, "成功、取消、替補、退款與佣金都能回到同一筆可追蹤交易。", {
    x: 3.12,
    y: 6.58,
    w: 7.1,
    h: 0.3,
    fontSize: 14,
    bold: true,
    color: theme.colors.dataGreen,
    align: "center",
    objectName: "Fulfillment loop conclusion",
  });
  addSourceLine(slide, components, "資料：S5、S7｜流程為產品事件架構，不代表已量化的轉換、SLA 或生產力結果。 ");
  addNotes(slide, slideMeta);
}

function buildScheduling(ctx) {
  const { deck, theme, components, content, assets } = ctx;
  const slideMeta = meta(content, 12);
  const slide = deck.addSlide(theme.masters.light);
  addBase(slide, deck, theme, slideMeta, "AI 排班空間");

  const imageW = 7.73;
  slide.addShape(deck.ShapeType.roundRect, {
    x: 0.64,
    y: 1.45,
    w: imageW,
    h: 5.24,
    rectRadius: 0.2,
    fill: { color: theme.colors.white },
    line: { color: theme.colors.line, width: 0.8 },
    objectName: "Scheduling image frame",
  });
  slide.addImage({
    path: assets.scheduling,
    x: 0.64,
    y: 1.45,
    w: imageW,
    h: 5.24,
    sizing: { type: "cover", w: imageW, h: 5.24 },
    objectName: "AI scheduling-space visual",
  });
  addPill(slide, deck, theme, "視覺隱喻｜非系統截圖", {
    x: 0.92,
    y: 1.75,
    w: 1.95,
    fill: theme.colors.white,
    line: theme.colors.sage,
    fontSize: 9.5,
  });

  addText(slide, theme, "三項能力輸出", {
    x: 8.82,
    y: 1.62,
    w: 1.55,
    h: 0.35,
    fontSize: 17,
    bold: true,
    color: theme.colors.dataGreen,
    objectName: "Scheduling capability heading",
  });
  addPill(slide, deck, theme, "能力描述，不是量化 KPI", {
    x: 10.48,
    y: 1.61,
    w: 1.96,
    fill: theme.colors.orangePale,
    line: theme.colors.orange,
    color: theme.colors.risk,
    fontSize: 8.8,
  });
  const capabilities = [
    ["01", "變更後可重新計算", "局部改約或取消時，重新檢查衝突、移動與場所限制。"],
    ["02", "候選者可被優先排序", "依技能、可用時段、距離、資格與替補規則提出順序。"],
    ["03", "跨供給協調派遣", "在授權邊界內協調店內、合作店與外部認證供給。"],
  ];
  capabilities.forEach(([number, title, detail], index) => {
    const y = 2.28 + index * 1.34;
    slide.addShape(deck.ShapeType.ellipse, {
      x: 8.8,
      y,
      w: 0.54,
      h: 0.54,
      fill: { color: index === 2 ? theme.colors.orange : theme.colors.deepForest },
      line: { color: index === 2 ? theme.colors.orange : theme.colors.deepForest, transparency: 100 },
      objectName: `Scheduling capability marker ${number}`,
    });
    addText(slide, theme, number, {
      x: 8.9,
      y: y + 0.17,
      w: 0.34,
      h: 0.17,
      fontSize: 9,
      bold: true,
      color: theme.colors.white,
      align: "center",
      objectName: `Scheduling capability number ${number}`,
    });
    addText(slide, theme, title, {
      x: 9.58,
      y: y - 0.01,
      w: 2.85,
      h: 0.3,
      fontSize: 14,
      bold: true,
      color: theme.colors.deepForest,
      objectName: `Scheduling capability title ${number}`,
    });
    addText(slide, theme, detail, {
      x: 9.58,
      y: y + 0.43,
      w: 2.77,
      h: 0.55,
      fontSize: 10.5,
      color: theme.colors.muted,
      breakLine: true,
      objectName: `Scheduling capability detail ${number}`,
    });
  });
  components.addDisclosure(slide, deck, {
    x: 8.8,
    y: 6.24,
    w: 3.62,
    h: 0.5,
    text: "正式商用仍需真實排班資料、權限控制與人工覆核。",
  });
  addSourceLine(slide, components, "資料：S7 NeeDo 產品原型｜AI 圖僅表達可重排的時間與供給空間。 ");
  addNotes(slide, slideMeta);
}

function buildCapacityFunnel(ctx) {
  const { deck, theme, components, content } = ctx;
  const slideMeta = meta(content, 13);
  const slide = deck.addSlide(theme.masters.light);
  addBase(slide, deck, theme, slideMeta, "供給分層與控制");

  addText(slide, theme, "先近後遠、先受控後擴展", {
    x: 0.84,
    y: 1.52,
    w: 3.7,
    h: 0.38,
    fontSize: 18,
    bold: true,
    color: theme.colors.dataGreen,
    objectName: "Capacity order principle",
  });
  const layers = [
    { x: 0.92, y: 2.06, w: 7.55, fill: theme.colors.deepForest, number: "01", title: "店內服務者容量", detail: "既有雇用／契約、熟悉店鋪與場所規則的人員優先" },
    { x: 1.43, y: 3.27, w: 6.55, fill: theme.colors.dataGreen, number: "02", title: "合作店容量", detail: "在權限、空檔與利益分配規則下共享可用供給" },
    { x: 1.95, y: 4.48, w: 5.5, fill: theme.colors.sage, number: "03", title: "外部服務者容量", detail: "僅納入已完成身份、資格、技能與責任邊界審核者" },
  ];
  layers.forEach(({ x, y, w, fill, number, title, detail }, index) => {
    slide.addShape(deck.ShapeType.roundRect, {
      x,
      y,
      w,
      h: 0.9,
      rectRadius: 0.18,
      fill: { color: fill },
      line: { color: fill, transparency: 100 },
      shadow: { type: "outer", color: theme.colors.deepForest, opacity: 0.09, blur: 1, angle: 45, distance: 1 },
      objectName: `Capacity layer ${number}`,
    });
    addText(slide, theme, number, {
      x: x + 0.22,
      y: y + 0.25,
      w: 0.38,
      h: 0.2,
      fontSize: 10,
      bold: true,
      color: theme.colors.white,
      objectName: `Capacity layer number ${number}`,
    });
    addText(slide, theme, title, {
      x: x + 0.76,
      y: y + 0.18,
      w: 2.22,
      h: 0.27,
      fontSize: 14,
      bold: true,
      color: theme.colors.white,
      objectName: `Capacity layer title ${number}`,
    });
    addText(slide, theme, detail, {
      x: x + 3.08,
      y: y + 0.18,
      w: w - 3.38,
      h: 0.4,
      fontSize: index === 2 ? 9.5 : 10,
      color: theme.colors.white,
      align: "right",
      breakLine: true,
      objectName: `Capacity layer detail ${number}`,
    });
    if (index < layers.length - 1) {
      slide.addShape(deck.ShapeType.chevron, {
        x: x + w / 2 - 0.19,
        y: y + 0.94,
        w: 0.38,
        h: 0.22,
        rotate: 90,
        fill: { color: theme.colors.sage },
        line: { color: theme.colors.sage, transparency: 100 },
        objectName: `Capacity progression ${number}`,
      });
    }
  });

  slide.addShape(deck.ShapeType.roundRect, {
    x: 8.88,
    y: 1.65,
    w: 3.62,
    h: 4.93,
    rectRadius: 0.2,
    fill: { color: theme.colors.mist },
    line: { color: theme.colors.sage, width: 0.9 },
    objectName: "Capacity allocation control panel",
  });
  addText(slide, theme, "容量不足", {
    x: 9.22,
    y: 2.0,
    w: 1.4,
    h: 0.3,
    fontSize: 14,
    bold: true,
    color: theme.colors.risk,
    objectName: "Capacity shortage trigger",
  });
  slide.addShape(deck.ShapeType.line, {
    x: 9.32,
    y: 2.54,
    w: 0,
    h: 2.75,
    line: { color: theme.colors.dataGreen, width: 2, endArrowType: "triangle" },
    objectName: "Capacity allocation control spine",
  });
  const controls = [
    ["AI 自動分配建議", "依限制與優先序提出候選組合"],
    ["例外與原因可見", "不足、衝突與成本條件保留記錄"],
    ["最終確認／鎖定", "店鋪或授權角色保留覆核與控制"],
  ];
  controls.forEach(([title, detail], index) => {
    const y = 2.42 + index * 1.22;
    slide.addShape(deck.ShapeType.ellipse, {
      x: 9.1,
      y,
      w: 0.44,
      h: 0.44,
      fill: { color: index === 2 ? theme.colors.orange : theme.colors.deepForest },
      line: { color: theme.colors.white, width: 0.8 },
      objectName: `Capacity control marker ${index + 1}`,
    });
    addText(slide, theme, title, {
      x: 9.78,
      y: y - 0.01,
      w: 2.23,
      h: 0.28,
      fontSize: 12.5,
      bold: true,
      color: index === 2 ? theme.colors.risk : theme.colors.deepForest,
      objectName: `Capacity control title ${index + 1}`,
    });
    addText(slide, theme, detail, {
      x: 9.78,
      y: y + 0.37,
      w: 2.23,
      h: 0.42,
      fontSize: 9.8,
      color: theme.colors.muted,
      breakLine: true,
      objectName: `Capacity control detail ${index + 1}`,
    });
  });
  components.addDisclosure(slide, deck, {
    x: 0.92,
    y: 6.18,
    w: 7.55,
    h: 0.46,
    text: "外部供給僅在合規審核、權限與責任邊界清楚後啟用；不表示開放未受控或未具資格的供給。",
    tone: "risk",
  });
  addSourceLine(slide, components, "資料：S4、S7｜此頁描述供給搜尋與控制邏輯，不是自動派遣績效聲明。 ");
  addNotes(slide, slideMeta);
}

function addLoopNode(slide, deck, theme, text, { x, y, risk = false } = {}) {
  const fill = risk ? theme.colors.orangePale : theme.colors.white;
  const line = risk ? theme.colors.risk : theme.colors.dataGreen;
  slide.addShape(deck.ShapeType.ellipse, {
    x,
    y,
    w: 1.42,
    h: 0.72,
    fill: { color: fill },
    line: { color: line, width: 0.8 },
    objectName: `Loop node: ${text}`,
  });
  addText(slide, theme, text, {
    x: x + 0.15,
    y: y + 0.22,
    w: 1.12,
    h: 0.23,
    fontSize: 10.3,
    bold: true,
    color: risk ? theme.colors.risk : theme.colors.deepForest,
    align: "center",
    objectName: `Loop node text: ${text}`,
  });
}

function buildProtectionLoops(ctx) {
  const { deck, theme, components, content } = ctx;
  const slideMeta = meta(content, 14);
  const slide = deck.addSlide(theme.masters.light);
  addBase(slide, deck, theme, slideMeta, "平台外 vs 平台內");

  slide.addShape(deck.ShapeType.circularArrow, {
    x: 0.78,
    y: 1.62,
    w: 5.38,
    h: 4.75,
    rotate: 28,
    fill: { color: theme.colors.orangePale, transparency: 10 },
    line: { color: theme.colors.risk, transparency: 35, width: 1.15 },
    objectName: "Platform-outside negative loop",
  });
  slide.addShape(deck.ShapeType.circularArrow, {
    x: 7.18,
    y: 1.62,
    w: 5.38,
    h: 4.75,
    rotate: 28,
    fill: { color: theme.colors.mist, transparency: 10 },
    line: { color: theme.colors.dataGreen, transparency: 30, width: 1.15 },
    objectName: "Platform-inside protected loop",
  });
  addText(slide, theme, "平台外｜負循環", {
    x: 2.08,
    y: 1.77,
    w: 2.3,
    h: 0.35,
    fontSize: 18,
    bold: true,
    color: theme.colors.risk,
    align: "center",
    objectName: "Negative loop title",
  });
  addText(slide, theme, "平台內｜受保護的正循環", {
    x: 8.17,
    y: 1.77,
    w: 3.35,
    h: 0.35,
    fontSize: 18,
    bold: true,
    color: theme.colors.dataGreen,
    align: "center",
    objectName: "Positive loop title",
  });

  [
    ["私人聯絡", 1.14, 2.33],
    ["跳單", 4.31, 2.6],
    ["隱私流失", 4.08, 5.05],
    ["人工重新聯絡", 1.17, 4.92],
  ].forEach(([text, x, y]) => addLoopNode(slide, deck, theme, text, { x, y, risk: true }));
  [
    ["平台訊息", 7.54, 2.33],
    ["受保護身份", 10.7, 2.6],
    ["變更可追蹤", 10.48, 5.05],
    ["權益／誘因設計", 7.57, 4.92],
  ].forEach(([text, x, y]) => addLoopNode(slide, deck, theme, text, { x, y }));

  addText(slide, theme, "責任、價格與改約依據逐步消失", {
    x: 1.85,
    y: 3.52,
    w: 3.2,
    h: 0.62,
    fontSize: 16,
    bold: true,
    color: theme.colors.risk,
    align: "center",
    valign: "mid",
    breakLine: true,
    objectName: "Negative loop center",
  });
  addText(slide, theme, "交易留在可審計的權限與事件中", {
    x: 8.15,
    y: 3.52,
    w: 3.22,
    h: 0.62,
    fontSize: 16,
    bold: true,
    color: theme.colors.deepForest,
    align: "center",
    valign: "mid",
    breakLine: true,
    objectName: "Positive loop center",
  });
  addText(slide, theme, "反跳單不是封鎖聯絡，而是讓平台內交易更安全、更省事、更有價值。", {
    x: 2.0,
    y: 6.57,
    w: 9.32,
    h: 0.3,
    fontSize: 14,
    bold: true,
    color: theme.colors.dataGreen,
    align: "center",
    objectName: "Protection loop conclusion",
  });
  addSourceLine(slide, components, "資料：S5、S7｜隱私按角色最小化呈現；平台保留必要事件紀錄作為爭議處理依據。 ");
  addNotes(slide, slideMeta);
}

function buildTransparentOrdering(ctx) {
  const { deck, theme, components, content, assets } = ctx;
  const slideMeta = meta(content, 15);
  const slide = deck.addSlide(theme.masters.light);
  addBase(slide, deck, theme, slideMeta, "透明消費與確認");

  slide.addImage({
    path: assets.ordering,
    x: 0.64,
    y: 1.45,
    w: 7.62,
    h: 5.42,
    sizing: { type: "cover", w: 7.62, h: 5.42 },
    objectName: "Transparent-ordering visual metaphor",
  });
  slide.addShape(deck.ShapeType.roundRect, {
    x: 0.96,
    y: 1.82,
    w: 2.78,
    h: 0.88,
    rectRadius: 0.17,
    fill: { color: theme.colors.white, transparency: 12 },
    line: { color: theme.colors.sage, transparency: 30, width: 0.8 },
    objectName: "Ordering image native caption",
  });
  addText(slide, theme, "高消費場景也能先選、再確認、持續看總額", {
    x: 1.18,
    y: 2.05,
    w: 2.34,
    h: 0.42,
    fontSize: 13,
    bold: true,
    color: theme.colors.deepForest,
    breakLine: true,
    objectName: "Ordering image native statement",
  });

  slide.addShape(deck.ShapeType.roundRect, {
    x: 7.72,
    y: 1.38,
    w: 4.72,
    h: 5.5,
    rectRadius: 0.2,
    fill: { color: theme.colors.white, transparency: 4 },
    line: { color: theme.colors.sage, width: 0.95 },
    shadow: { type: "outer", color: theme.colors.deepForest, opacity: 0.12, blur: 1.4, angle: 45, distance: 1 },
    objectName: "Native transparent bill panel",
  });
  addText(slide, theme, "客人端｜選擇與帳單", {
    x: 8.08,
    y: 1.74,
    w: 2.7,
    h: 0.31,
    fontSize: 16,
    bold: true,
    color: theme.colors.deepForest,
    objectName: "Bill panel title",
  });
  addPill(slide, deck, theme, "含稅／可確認", {
    x: 10.73,
    y: 1.7,
    w: 1.25,
    fill: theme.colors.mist,
    line: theme.colors.sage,
    fontSize: 9,
  });
  const rows = [
    ["基本項目", "已確認", theme.colors.dataGreen],
    ["服務／飲品選項", "可選", theme.colors.dataGreen],
    ["追加項目", "待確認", theme.colors.orange],
    ["稅與必要費用", "含稅顯示", theme.colors.dataGreen],
  ];
  rows.forEach(([label, status, accent], index) => {
    const y = 2.42 + index * 0.69;
    addText(slide, theme, label, {
      x: 8.1,
      y,
      w: 2.25,
      h: 0.25,
      fontSize: 11.5,
      bold: index === 2,
      color: index === 2 ? theme.colors.risk : theme.colors.ink,
      objectName: `Bill row ${index + 1}`,
    });
    addPill(slide, deck, theme, status, {
      x: 10.67,
      y: y - 0.06,
      w: 1.15,
      h: 0.34,
      fill: accent === theme.colors.orange ? theme.colors.orangePale : theme.colors.mist,
      line: accent,
      color: accent === theme.colors.orange ? theme.colors.risk : theme.colors.deepForest,
      fontSize: 9.2,
    });
    slide.addShape(deck.ShapeType.line, {
      x: 8.1,
      y: y + 0.42,
      w: 3.72,
      h: 0,
      line: { color: theme.colors.line, width: 0.65 },
      objectName: `Bill row divider ${index + 1}`,
    });
  });
  addText(slide, theme, "目前累計", {
    x: 8.1,
    y: 5.38,
    w: 1.3,
    h: 0.25,
    fontSize: 12,
    bold: true,
    color: theme.colors.deepForest,
    objectName: "Running total label",
  });
  addText(slide, theme, "每次確認後即時更新", {
    x: 9.35,
    y: 5.34,
    w: 2.48,
    h: 0.31,
    fontSize: 14.5,
    bold: true,
    color: theme.colors.dataGreen,
    align: "right",
    objectName: "Running total behavior",
  });
  addPill(slide, deck, theme, "確認追加", {
    x: 8.08,
    y: 6.03,
    w: 1.55,
    fill: theme.colors.deepForest,
    line: theme.colors.deepForest,
    color: theme.colors.white,
    fontSize: 10.5,
  });
  addPill(slide, deck, theme, "拒絕追加", {
    x: 9.87,
    y: 6.03,
    w: 1.55,
    fill: theme.colors.white,
    line: theme.colors.risk,
    color: theme.colors.risk,
    fontSize: 10.5,
  });
  components.addDisclosure(slide, deck, {
    x: 0.92,
    y: 6.25,
    w: 6.1,
    h: 0.5,
    text: "可操作原型｜目前尚無可歸因 GMV、透明點單收入或正式支付／審計證據。",
    tone: "risk",
  });
  addSourceLine(slide, components, "資料：S3、S7｜AI 圖只作透明消費隱喻；帳單、狀態、按鈕與披露均為原生元素。 ");
  addNotes(slide, slideMeta);
}

function buildCpsEngines(ctx) {
  const { deck, theme, components, content, assets } = ctx;
  const slideMeta = meta(content, 16);
  const slide = deck.addSlide(theme.masters.dark);
  addBase(slide, deck, theme, slideMeta, "雙引擎");

  slide.addImage({
    path: assets.cps,
    x: 6.18,
    y: 1.34,
    w: 6.53,
    h: 5.7,
    sizing: { type: "cover", w: 6.53, h: 5.7 },
    transparency: 9,
    objectName: "CPS-loop visual metaphor",
  });
  slide.addShape(deck.ShapeType.rect, {
    x: 5.7,
    y: 1.34,
    w: 1.28,
    h: 5.7,
    fill: { color: theme.colors.nightForest, transparency: 18 },
    line: { color: theme.colors.nightForest, transparency: 100 },
    objectName: "CPS image soft edge",
  });
  addText(slide, theme, "供給可履約，內容才值得被放大；\n可歸因需求，又反向形成排班訊號。", {
    x: 0.82,
    y: 1.55,
    w: 4.68,
    h: 0.88,
    fontSize: 20,
    bold: true,
    color: theme.colors.darkText,
    breakLine: true,
    objectName: "CPS dual-engine statement",
  });

  const engines = [
    { x: 0.9, y: 3.02, title: "AI 排班引擎", detail: "把技能、時間、距離與場所限制轉成可覆核的供給建議", accent: theme.colors.sage },
    { x: 3.72, y: 4.76, title: "CPS 歸因引擎", detail: "把內容、達人、預約與符合資格的結算連成事件鏈", accent: theme.colors.orange },
  ];
  engines.forEach(({ x, y, title, detail, accent }) => {
    slide.addShape(deck.ShapeType.ellipse, {
      x,
      y,
      w: 2.66,
      h: 1.52,
      fill: { color: theme.colors.deepForest, transparency: 5 },
      line: { color: accent, width: 1.1 },
      shadow: { type: "outer", color: "000000", opacity: 0.2, blur: 1.4, angle: 45, distance: 1 },
      objectName: title,
    });
    addText(slide, theme, title, {
      x: x + 0.31,
      y: y + 0.3,
      w: 2.04,
      h: 0.3,
      fontSize: 15,
      bold: true,
      color: theme.colors.darkText,
      align: "center",
      objectName: `${title} label`,
    });
    addText(slide, theme, detail, {
      x: x + 0.31,
      y: y + 0.77,
      w: 2.04,
      h: 0.43,
      fontSize: 9.5,
      color: theme.colors.darkMuted,
      align: "center",
      breakLine: true,
      objectName: `${title} detail`,
    });
  });
  slide.addShape(deck.ShapeType.line, {
    x: 3.2,
    y: 3.54,
    w: 1.46,
    h: 1.62,
    line: { color: theme.colors.sage, width: 1.35, endArrowType: "triangle" },
    objectName: "Scheduling reinforces CPS",
  });
  slide.addShape(deck.ShapeType.line, {
    x: 2.83,
    y: 4.15,
    w: 1.55,
    h: 1.24,
    line: { color: theme.colors.orange, width: 1.35, beginArrowType: "triangle" },
    objectName: "CPS reinforces scheduling",
  });
  addText(slide, theme, "供給可信度", {
    x: 3.72,
    y: 3.63,
    w: 1.15,
    h: 0.2,
    fontSize: 9,
    bold: true,
    color: theme.colors.sage,
    rotate: 46,
    objectName: "Scheduling to CPS label",
  });
  addText(slide, theme, "需求訊號", {
    x: 2.98,
    y: 4.72,
    w: 1.05,
    h: 0.2,
    fontSize: 9,
    bold: true,
    color: theme.colors.orange,
    rotate: -39,
    objectName: "CPS to scheduling label",
  });
  components.addDisclosure(slide, deck, {
    x: 0.86,
    y: 6.44,
    w: 5.2,
    h: 0.5,
    text: "目前未宣稱 CPS 牽引力；尚無真實歸因 GMV、CPS 收入或佣金結算證據。",
    tone: "risk",
    dark: true,
  });
  addSourceLine(slide, components, "資料：S5、S7｜AI 圖只作成長環背景；雙引擎標籤與因果說明均為原生元素。", { dark: true });
  addNotes(slide, slideMeta);
}

function buildCpsAttribution(ctx) {
  const { deck, theme, components, content } = ctx;
  const slideMeta = meta(content, 17);
  const slide = deck.addSlide(theme.masters.light);
  addBase(slide, deck, theme, slideMeta, "CPS 事件歸因");

  const stages = [
    { title: "內容", detail: "內容 ID／入口", fill: theme.colors.mist },
    { title: "達人", detail: "達人 ID／關係", fill: theme.colors.white },
    { title: "預約", detail: "服務／店鋪／訂單", fill: theme.colors.mist },
    { title: "已履約交易", detail: "完成狀態與金額", fill: theme.colors.white },
    { title: "退款／風險閘門", detail: "退款・爭議・無效・作弊", fill: theme.colors.orangePale, risk: true },
    { title: "合格佣金結算", detail: "規則・對帳・付款", fill: theme.colors.deepForest, final: true },
  ];
  const startX = 0.62;
  const gap = 0.2;
  const stageW = 1.92;
  stages.forEach((stage, index) => {
    const x = startX + index * (stageW + gap);
    if (index < stages.length - 1) {
      slide.addShape(deck.ShapeType.line, {
        x: x + stageW,
        y: 3.65,
        w: gap,
        h: 0,
        line: { color: index === 3 ? theme.colors.orange : theme.colors.dataGreen, width: 1.4, endArrowType: "triangle" },
        objectName: `Attribution connector ${index + 1}`,
      });
    }
  });
  stages.forEach((stage, index) => {
    const x = startX + index * (stageW + gap);
    const lineColor = stage.risk ? theme.colors.risk : stage.final ? theme.colors.deepForest : theme.colors.sage;
    slide.addShape(deck.ShapeType.roundRect, {
      x,
      y: stage.risk ? 2.27 : 2.48,
      w: stageW,
      h: stage.risk ? 2.76 : 2.34,
      rectRadius: 0.18,
      fill: { color: stage.fill },
      line: { color: lineColor, width: stage.risk ? 1.35 : 0.9 },
      shadow: { type: "outer", color: theme.colors.deepForest, opacity: 0.08, blur: 1, angle: 45, distance: 1 },
      objectName: `Attribution stage ${index + 1}: ${stage.title}`,
    });
    addText(slide, theme, String(index + 1).padStart(2, "0"), {
      x: x + 0.21,
      y: stage.risk ? 2.56 : 2.75,
      w: 0.4,
      h: 0.22,
      fontSize: 9.5,
      bold: true,
      color: stage.final ? theme.colors.sage : lineColor,
      objectName: `Attribution stage number ${index + 1}`,
    });
    addText(slide, theme, stage.title, {
      x: x + 0.22,
      y: stage.risk ? 3.02 : 3.19,
      w: 1.48,
      h: 0.55,
      fontSize: stage.risk ? 13 : 13.5,
      bold: true,
      color: stage.final ? theme.colors.white : stage.risk ? theme.colors.risk : theme.colors.deepForest,
      align: "center",
      valign: "mid",
      breakLine: true,
      objectName: `Attribution stage title ${index + 1}`,
    });
    addText(slide, theme, stage.detail, {
      x: x + 0.2,
      y: stage.risk ? 4.03 : 4.05,
      w: 1.52,
      h: 0.46,
      fontSize: 9.4,
      color: stage.final ? theme.colors.darkMuted : stage.risk ? theme.colors.risk : theme.colors.muted,
      align: "center",
      breakLine: true,
      objectName: `Attribution stage detail ${index + 1}`,
    });
  });
  addPill(slide, deck, theme, "先通過退款與風險窗口", {
    x: 8.87,
    y: 1.64,
    w: 2.15,
    fill: theme.colors.orangePale,
    line: theme.colors.risk,
    color: theme.colors.risk,
    fontSize: 10,
  });
  addText(slide, theme, "只有已完成且符合資格的交易才進入佣金結算。", {
    x: 2.62,
    y: 5.62,
    w: 8.08,
    h: 0.5,
    fontSize: 21,
    bold: true,
    color: theme.colors.deepForest,
    align: "center",
    objectName: "CPS eligibility rule",
  });
  components.addDisclosure(slide, deck, {
    x: 2.45,
    y: 6.28,
    w: 8.43,
    h: 0.48,
    text: "目前為事件與原型流程；尚無真實歸因 GMV、CPS 收入、反作弊或正式付款證據。",
    tone: "risk",
  });
  addSourceLine(slide, components, "資料：S5、S7｜正式商用前須補齊後端事件、退款回沖、權限、稅務與佣金付款。 ");
  addNotes(slide, slideMeta);
}

function buildMaturityLadder(ctx) {
  const { deck, theme, components, content } = ctx;
  const slideMeta = meta(content, 18);
  const slide = deck.addSlide(theme.masters.light);
  addBase(slide, deck, theme, slideMeta, "產品與證據邊界");

  const levels = [
    {
      x: 0.72, y: 3.68, w: 3.58, h: 2.7,
      title: "已可操作",
      qualifier: "現況｜前端與核心原型",
      accent: theme.colors.dataGreen,
      fill: theme.colors.mist,
      items: ["多端高保真前端流程", "商戶排班與調度介面", "透明點單可操作原型", "CPS 本地事件原型"],
    },
    {
      x: 4.48, y: 2.68, w: 3.76, h: 3.7,
      title: "本輪完成",
      qualifier: "交付門檻｜不是現況聲明",
      accent: theme.colors.orange,
      fill: theme.colors.orangePale,
      items: ["正式後端與資料庫", "支付、退款、權限與審計", "事件歸因與佣金結算", "試點量測與商業化驗證"],
    },
    {
      x: 8.42, y: 1.68, w: 4.18, h: 4.7,
      title: "未宣稱",
      qualifier: "商業與規模證據邊界",
      accent: theme.colors.risk,
      fill: "F8ECE8",
      items: ["100+ 僅為店鋪使用意向；非簽約／付費／活躍", "尚無真實歸因 GMV 或 CPS 收入", "尚無跨城市規模化履約", "尚無量化轉換、SLA 或生產力成果"],
    },
  ];
  levels.forEach((level, index) => {
    slide.addShape(deck.ShapeType.roundRect, {
      x: level.x,
      y: level.y,
      w: level.w,
      h: level.h,
      rectRadius: 0.2,
      fill: { color: level.fill },
      line: { color: level.accent, width: index === 2 ? 1.2 : 0.9 },
      shadow: { type: "outer", color: theme.colors.deepForest, opacity: 0.08, blur: 1.2, angle: 45, distance: 1 },
      objectName: `Maturity level ${index + 1}: ${level.title}`,
    });
    addText(slide, theme, String(index + 1).padStart(2, "0"), {
      x: level.x + 0.28,
      y: level.y + 0.28,
      w: 0.48,
      h: 0.24,
      fontSize: 10,
      bold: true,
      color: level.accent,
      objectName: `Maturity level number ${index + 1}`,
    });
    addText(slide, theme, level.title, {
      x: level.x + 0.83,
      y: level.y + 0.22,
      w: level.w - 1.12,
      h: 0.38,
      fontSize: 20,
      bold: true,
      color: index === 2 ? theme.colors.risk : theme.colors.deepForest,
      objectName: `Maturity level title ${index + 1}`,
    });
    addText(slide, theme, level.qualifier, {
      x: level.x + 0.29,
      y: level.y + (index === 0 ? 0.78 : 0.86),
      w: level.w - 0.58,
      h: 0.25,
      fontSize: 10,
      bold: true,
      color: level.accent,
      objectName: `Maturity level qualifier ${index + 1}`,
    });
    level.items.forEach((item, itemIndex) => {
      const itemY = level.y + (index === 0 ? 1.2 : 1.35)
        + itemIndex * (index === 0 ? 0.38 : index === 2 ? 0.73 : 0.57);
      slide.addShape(deck.ShapeType.ellipse, {
        x: level.x + 0.3,
        y: itemY + 0.04,
        w: 0.14,
        h: 0.14,
        fill: { color: level.accent },
        line: { color: level.accent, transparency: 100 },
        objectName: `Maturity item marker ${index + 1}-${itemIndex + 1}`,
      });
      addText(slide, theme, item, {
        x: level.x + 0.58,
        y: itemY,
        w: level.w - 0.9,
        h: index === 2 && itemIndex === 0 ? 0.55 : 0.35,
        fontSize: index === 2 ? 10.2 : 10.7,
        bold: index === 2 && itemIndex === 0,
        color: index === 2 ? theme.colors.risk : theme.colors.ink,
        breakLine: true,
        objectName: `Maturity item ${index + 1}-${itemIndex + 1}`,
      });
    });
  });
  addText(slide, theme, "成熟度不是功能數量，而是可操作、可交付與可證明之間的清楚邊界。", {
    x: 0.82,
    y: 1.58,
    w: 6.9,
    h: 0.56,
    fontSize: 19,
    bold: true,
    color: theme.colors.dataGreen,
    objectName: "Maturity ladder conclusion",
  });
  components.addDisclosure(slide, deck, {
    x: 0.82,
    y: 6.56,
    w: 11.78,
    h: 0.4,
    text: "100+ 只代表使用意向；不得解讀為已簽約、已付費、活躍店鋪、GMV 或收入。",
    tone: "risk",
  });
  addSourceLine(slide, components, "資料：S5、S7｜產品與代碼庫盤點截至 2026-08-23；商業證據仍須以 CRM、合約、收款與日誌驗證。 ");
  addNotes(slide, slideMeta);
}

export function buildProductSlides(ctx) {
  const builders = [
    buildPlatformOverview,
    buildFulfillmentLoop,
    buildScheduling,
    buildCapacityFunnel,
    buildProtectionLoops,
    buildTransparentOrdering,
    buildCpsEngines,
    buildCpsAttribution,
    buildMaturityLadder,
  ];
  builders.forEach((builder) => builder(ctx));
}

export const PRODUCT_PAGE_RANGE = Object.freeze({ first: 10, last: 18, count: 9, width: W, height: H });
