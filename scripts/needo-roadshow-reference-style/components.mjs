import PptxGenJS from "pptxgenjs";

import { THEME } from "./theme.mjs";

const C = THEME.colors;

function cloneSeries(series) {
  return series.map((item) => ({
    ...item,
    labels: [...item.labels],
    values: [...item.values],
  }));
}

export function createDeck() {
  const deck = new PptxGenJS();
  deck.layout = "LAYOUT_WIDE";
  deck.author = "LifeDance Co., Ltd.";
  deck.company = "LifeDance Co., Ltd.";
  deck.subject = "NeeDo 海外投資人路演";
  deck.title = "NeeDo 海外投資人路演 BP｜參考風格精緻版";
  deck.lang = "zh-TW";
  deck.theme = {
    headFontFace: THEME.fontFace,
    bodyFontFace: THEME.fontFace,
    lang: "zh-TW",
  };
  return deck;
}

export function addLogo(slide, { x = 0.55, y = 0.25, color = C.deepGreen } = {}) {
  slide.addText("NeeDo", {
    x, y, w: 1.45, h: 0.3,
    fontFace: "Arial",
    fontSize: 18,
    bold: true,
    color,
    margin: 0,
    fit: "shrink",
    objectName: "NeeDo wordmark",
  });
  return slide;
}

export function addBase(slide, deck, {
  page,
  section = "NeeDo｜海外投資人路演",
  background = C.warmWhite,
  backgroundImage = null,
  showLogo = true,
  pageColor = C.green,
} = {}) {
  slide.background = { color: background };
  if (backgroundImage) {
    slide.addImage({
      path: backgroundImage,
      x: 0,
      y: 0,
      w: THEME.size.width,
      h: THEME.size.height,
      objectName: "Reference-style 3D scene",
    });
  }
  if (showLogo) addLogo(slide);
  if (section) {
    slide.addText(section, {
      x: 2.05, y: 0.31, w: 4.8, h: 0.16,
      fontFace: THEME.fontFace,
      fontSize: 8.8,
      bold: true,
      color: C.green,
      margin: 0,
      fit: "shrink",
      objectName: "Section label",
    });
  }
  if (page !== undefined && page !== null) {
    slide.addText(String(page).padStart(2, "0"), {
      x: 12.18, y: 0.29, w: 0.56, h: 0.17,
      fontFace: "Arial",
      fontSize: 9,
      bold: true,
      align: "right",
      color: pageColor,
      margin: 0,
      objectName: "Page number",
    });
  }
  return slide;
}

export function addTitle(slide, {
  title,
  subtitle = "",
  x = 0.55,
  y = 0.75,
  w = 7.1,
  h = 0.72,
  color = C.text,
  size = 31,
} = {}) {
  slide.addText(title, {
    x, y, w, h,
    fontFace: THEME.fontFace,
    fontSize: size,
    bold: true,
    color,
    margin: 0,
    breakLine: false,
    fit: "shrink",
    objectName: "Slide title",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x, y: y + h + 0.06, w, h: 0.32,
      fontFace: THEME.fontFace,
      fontSize: 13.5,
      color: C.deepGreen,
      margin: 0,
      fit: "shrink",
      objectName: "Slide subtitle",
    });
  }
  return slide;
}

export function addCard(slide, deck, {
  x, y, w, h,
  title = "",
  body = "",
  fill = C.white,
  line = C.paleGreen,
  titleColor = C.text,
  bodyColor = C.muted,
  shadow = true,
  titleSize = 16,
  bodySize = 11.5,
  align = "left",
} = {}) {
  slide.addShape(deck.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: fill },
    line: { color: line, width: 0.8 },
    ...(shadow ? {
      shadow: {
        type: "outer",
        color: "76837D",
        opacity: 0.12,
        blur: 1.6,
        angle: 45,
        distance: 1,
      },
    } : {}),
    objectName: title ? `Card: ${title}` : "Rounded card",
  });
  if (title) {
    slide.addText(title, {
      x: x + 0.22, y: y + 0.18, w: w - 0.44, h: 0.34,
      fontFace: THEME.fontFace,
      fontSize: titleSize,
      bold: true,
      color: titleColor,
      align,
      margin: 0,
      fit: "shrink",
      objectName: "Card title",
    });
  }
  if (body) {
    const bodyOnly = !title;
    slide.addText(body, {
      x: x + 0.22,
      y: y + (title ? 0.66 : 0.12),
      w: w - 0.44,
      h: Math.max(0.12, h - (title ? 0.84 : 0.24)),
      fontFace: THEME.fontFace,
      fontSize: bodySize,
      color: bodyColor,
      breakLine: false,
      valign: bodyOnly ? "mid" : "top",
      align,
      margin: 0,
      fit: "shrink",
      objectName: "Card body",
    });
  }
  return slide;
}

export function addHeroNumber(slide, {
  x, y, w = 2.7, h = 1.1,
  value,
  label,
  detail = "",
  accent = C.green,
  valueSize = 43,
} = {}) {
  slide.addText(String(value), {
    x, y, w, h: h * 0.58,
    fontFace: "Arial",
    fontSize: valueSize,
    bold: true,
    color: accent,
    margin: 0,
    fit: "shrink",
    objectName: "Hero number",
  });
  slide.addText(label, {
    x, y: y + h * 0.6, w, h: 0.25,
    fontFace: THEME.fontFace,
    fontSize: 12.5,
    bold: true,
    color: C.text,
    margin: 0,
    fit: "shrink",
    objectName: "Hero label",
  });
  if (detail) {
    slide.addText(detail, {
      x, y: y + h * 0.84, w, h: 0.18,
      fontFace: THEME.fontFace,
      fontSize: 8.8,
      color: C.muted,
      margin: 0,
      fit: "shrink",
      objectName: "Hero detail",
    });
  }
  return slide;
}

export function addPill(slide, deck, {
  x, y, w, h = 0.34,
  text,
  fill = C.mist,
  color = C.deepGreen,
  line = C.paleGreen,
  size = 10.5,
} = {}) {
  slide.addShape(deck.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: fill },
    line: { color: line, width: 0.7 },
    objectName: `Pill: ${text}`,
  });
  slide.addText(text, {
    x: x + 0.1, y: y + 0.07, w: w - 0.2, h: h - 0.12,
    fontFace: THEME.fontFace,
    fontSize: size,
    bold: true,
    color,
    align: "center",
    margin: 0,
    fit: "shrink",
    objectName: "Pill label",
  });
  return slide;
}

export function addSource(slide, {
  text,
  x = 0.55,
  y = 7.17,
  w = 10.9,
  h = 0.15,
} = {}) {
  slide.addText(text, {
    x, y, w, h,
    fontFace: THEME.fontFace,
    fontSize: 8.2,
    color: C.muted,
    margin: 0,
    fit: "shrink",
    objectName: "Source note",
  });
  return slide;
}

export function addDisclosure(slide, deck, {
  text,
  x = 0.55,
  y = 6.67,
  w = 12.2,
  h = 0.38,
  tone = "neutral",
} = {}) {
  const risk = tone === "risk";
  slide.addShape(deck.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: risk ? C.softOrange : C.mist },
    line: { color: risk ? C.orange : C.paleGreen, width: 0.6 },
    objectName: risk ? "Risk disclosure" : "Disclosure",
  });
  slide.addText(text, {
    x: x + 0.14, y: y + 0.06, w: w - 0.28, h: h - 0.10,
    fontFace: THEME.fontFace,
    fontSize: 8.7,
    bold: risk,
    color: risk ? C.risk : C.deepGreen,
    margin: 0,
    fit: "shrink",
    objectName: "Disclosure text",
  });
  return slide;
}

export function addNativeColumnChart(slide, deck, {
  series,
  x, y, w, h,
  colors = [C.green, C.text],
  showLegend = true,
  valueFormatCode = "0.0",
  altText = "NeeDo native column chart",
} = {}) {
  slide.addChart(deck.ChartType.bar, cloneSeries(series), {
    x, y, w, h,
    barDir: "col",
    grouping: "clustered",
    chartColors: [...colors],
    showTitle: false,
    showLegend,
    legendPos: "b",
    legendFontFace: THEME.fontFace,
    legendFontSize: 9,
    legendColor: C.muted,
    showValue: false,
    showCatName: false,
    dataLabelFormatCode: valueFormatCode,
    catAxisLabelFontFace: THEME.fontFace,
    catAxisLabelFontSize: 9,
    catAxisLabelColor: C.muted,
    valAxisLabelFontFace: "Arial",
    valAxisLabelFontSize: 8,
    valAxisLabelColor: C.muted,
    valGridLine: { color: C.paleGreen, width: 0.6 },
    catGridLine: { style: "none" },
    showBorder: false,
    objectName: "Native column chart",
    altText,
  });
  return slide;
}

export function addNativeLineChart(slide, deck, {
  series,
  x, y, w, h,
  colors = [C.conservative, C.green, C.orange],
  showLegend = true,
  valueFormatCode = "0",
  altText = "NeeDo native line chart",
} = {}) {
  slide.addChart(deck.ChartType.line, cloneSeries(series), {
    x, y, w, h,
    chartColors: [...colors],
    showTitle: false,
    showLegend,
    legendPos: "b",
    legendFontFace: THEME.fontFace,
    legendFontSize: 9,
    legendColor: C.muted,
    showValue: false,
    lineDataSymbol: "circle",
    lineDataSymbolSize: 4,
    lineSize: 2,
    dataLabelFormatCode: valueFormatCode,
    catAxisLabelFontFace: "Arial",
    catAxisLabelFontSize: 8,
    catAxisLabelColor: C.muted,
    valAxisLabelFontFace: "Arial",
    valAxisLabelFontSize: 8,
    valAxisLabelColor: C.muted,
    valGridLine: { color: C.paleGreen, width: 0.6 },
    catGridLine: { style: "none" },
    showBorder: false,
    objectName: "Native line chart",
    altText,
  });
  return slide;
}

export function addFlowStep(slide, deck, {
  x, y, w = 1.55, h = 0.84,
  index,
  title,
  detail = "",
  accent = C.green,
} = {}) {
  slide.addShape(deck.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: C.white },
    line: { color: C.paleGreen, width: 0.8 },
    shadow: { type: "outer", color: "76837D", opacity: 0.1, blur: 1.2, angle: 45, distance: 1 },
    objectName: `Flow step ${index}`,
  });
  slide.addShape(deck.ShapeType.ellipse, {
    x: x + 0.14, y: y + 0.16, w: 0.36, h: 0.36,
    fill: { color: accent },
    line: { color: accent, transparency: 100 },
    objectName: "Flow step number",
  });
  slide.addText(String(index).padStart(2, "0"), {
    x: x + 0.19, y: y + 0.25, w: 0.26, h: 0.13,
    fontFace: "Arial", fontSize: 8.5, bold: true, color: C.white,
    align: "center", margin: 0,
  });
  slide.addText(title, {
    x: x + 0.6, y: y + 0.14, w: w - 0.74, h: 0.24,
    fontFace: THEME.fontFace, fontSize: 12.5, bold: true, color: C.text,
    margin: 0, fit: "shrink",
  });
  if (detail) {
    slide.addText(detail, {
      x: x + 0.6, y: y + 0.46, w: w - 0.74, h: 0.18,
      fontFace: THEME.fontFace, fontSize: 8.8, color: C.muted,
      margin: 0, fit: "shrink",
    });
  }
  return slide;
}

export function addOrbitNode(slide, deck, {
  x, y, diameter = 0.9,
  label,
  fill = C.white,
  accent = C.green,
  center = null,
} = {}) {
  if (center) {
    slide.addShape(deck.ShapeType.line, {
      x: center.x,
      y: center.y,
      w: x + diameter / 2 - center.x,
      h: y + diameter / 2 - center.y,
      line: { color: C.mint, transparency: 25, width: 1.2 },
      objectName: "Orbit connector",
    });
  }
  slide.addShape(deck.ShapeType.ellipse, {
    x, y, w: diameter, h: diameter,
    fill: { color: fill },
    line: { color: accent, width: 1.2 },
    shadow: { type: "outer", color: "76837D", opacity: 0.1, blur: 1.2, angle: 45, distance: 1 },
    objectName: `Orbit node: ${label}`,
  });
  slide.addText(label, {
    x: x + 0.1, y: y + diameter * 0.36, w: diameter - 0.2, h: diameter * 0.25,
    fontFace: THEME.fontFace,
    fontSize: Math.max(8.5, diameter * 10.5),
    bold: true,
    color: C.deepGreen,
    align: "center",
    margin: 0,
    fit: "shrink",
    objectName: "Orbit label",
  });
  return slide;
}
