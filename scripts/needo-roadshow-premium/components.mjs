import { THEME } from "./theme.mjs";

function chartSeries(series) {
  return series.map((item) => ({
    ...item,
    labels: Array.isArray(item.labels) ? [...item.labels] : item.labels,
    values: Array.isArray(item.values) ? [...item.values] : item.values,
  }));
}

function chartPalette(colors) {
  return colors ? [...colors] : [THEME.colors.dataGreen, THEME.colors.sage, THEME.colors.orange];
}

export function addHeroNumber(slide, deck, {
  x = 0.72,
  y = 1.6,
  w = 4.6,
  h = 1.55,
  value = "",
  label = "",
  detail = "",
  accent = THEME.colors.dataGreen,
  color = THEME.colors.ink,
  muted = THEME.colors.muted,
  dark = false,
} = {}) {
  const textColor = dark ? THEME.colors.darkText : color;
  const mutedColor = dark ? THEME.colors.darkMuted : muted;
  slide.addShape(deck.ShapeType.ellipse, {
    x,
    y: y + 0.1,
    w: 0.14,
    h: 0.14,
    fill: { color: accent },
    line: { color: accent, transparency: 100 },
    objectName: "Hero number marker",
  });
  slide.addText(String(value), {
    x: x + 0.28,
    y,
    w: w - 0.28,
    h: h * 0.58,
    fontFace: THEME.font,
    fontSize: THEME.type.hero,
    bold: true,
    color: accent,
    margin: 0,
    fit: "shrink",
    objectName: "Hero number",
  });
  if (label) {
    slide.addText(label, {
      x: x + 0.28,
      y: y + h * 0.62,
      w: w - 0.28,
      h: 0.3,
      fontFace: THEME.font,
      fontSize: 16,
      bold: true,
      color: textColor,
      margin: 0,
      fit: "shrink",
      objectName: "Hero number label",
    });
  }
  if (detail) {
    slide.addText(detail, {
      x: x + 0.28,
      y: y + h * 0.84,
      w: w - 0.28,
      h: 0.22,
      fontFace: THEME.font,
      fontSize: 10.5,
      color: mutedColor,
      margin: 0,
      fit: "shrink",
      objectName: "Hero number detail",
    });
  }
  return slide;
}

export function addInsight(slide, deck, {
  x = 8.35,
  y = 1.72,
  w = 4.2,
  h = 1.46,
  text = "",
  eyebrow = "",
  accent = THEME.colors.dataGreen,
  fill = THEME.colors.white,
  color = THEME.colors.ink,
  dark = false,
} = {}) {
  const insightFill = dark ? THEME.colors.deepForest : fill;
  const insightColor = dark ? THEME.colors.darkText : color;
  slide.addShape(deck.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.16,
    fill: { color: insightFill, transparency: dark ? 10 : 0 },
    line: { color: dark ? THEME.colors.sage : THEME.colors.line, width: 0.8, transparency: dark ? 48 : 0 },
    shadow: {
      type: "outer",
      color: dark ? THEME.colors.nightForest : THEME.colors.deepForest,
      opacity: dark ? 0.13 : 0.09,
      blur: 1.4,
      angle: 45,
      distance: 1,
    },
    objectName: "Investor insight",
  });
  slide.addShape(deck.ShapeType.ellipse, {
    x: x + 0.2,
    y: y + 0.2,
    w: 0.12,
    h: 0.12,
    fill: { color: accent },
    line: { color: accent, transparency: 100 },
    objectName: "Insight marker",
  });
  if (eyebrow) {
    slide.addText(eyebrow, {
      x: x + 0.42,
      y: y + 0.16,
      w: w - 0.64,
      h: 0.2,
      fontFace: THEME.font,
      fontSize: 9.5,
      bold: true,
      color: accent,
      margin: 0,
      fit: "shrink",
      objectName: "Insight eyebrow",
    });
  }
  slide.addText(text, {
    x: x + 0.2,
    y: y + (eyebrow ? 0.5 : 0.42),
    w: w - 0.4,
    h: h - (eyebrow ? 0.66 : 0.58),
    fontFace: THEME.font,
    fontSize: 15,
    bold: true,
    color: insightColor,
    valign: "mid",
    margin: 0,
    fit: "shrink",
    objectName: "Insight statement",
  });
  return slide;
}

export function addSource(slide, source, options = {}) {
  const settings = typeof source === "object" && source !== null ? source : { ...options, text: source };
  const {
    text = "",
    x = THEME.margin.x,
    y = 7.12,
    w = 9.7,
    h = 0.16,
    color = THEME.colors.muted,
    dark = false,
  } = settings;
  slide.addText(text, {
    x,
    y,
    w,
    h,
    fontFace: THEME.font,
    fontSize: THEME.type.source,
    color: dark ? THEME.colors.darkMuted : color,
    margin: 0,
    fit: "shrink",
    objectName: "Source note",
  });
  return slide;
}

export function addNativeBarChart(slide, deck, {
  series = [],
  x = 0.72,
  y = 1.62,
  w = 8.7,
  h = 4.75,
  colors,
  altText = "NeeDo data bar chart",
  showLegend = series.length > 1,
  showValue = true,
  valueFormatCode = "0",
  dark = false,
} = {}) {
  slide.addChart(deck.ChartType.bar, chartSeries(series), {
    x,
    y,
    w,
    h,
    altText,
    objectName: "Native bar chart",
    chartColors: chartPalette(colors),
    showTitle: false,
    showLegend,
    legendPos: "b",
    legendColor: dark ? THEME.colors.darkMuted : THEME.colors.muted,
    legendFontFace: THEME.font,
    legendFontSize: 10,
    showValue,
    showLabel: false,
    dataLabelPosition: "outEnd",
    dataLabelColor: dark ? THEME.colors.darkText : THEME.colors.ink,
    dataLabelFormatCode: valueFormatCode,
    catAxisLabelFontFace: THEME.font,
    catAxisLabelFontSize: 10,
    catAxisLabelColor: dark ? THEME.colors.darkMuted : THEME.colors.muted,
    valAxisLabelFontFace: THEME.font,
    valAxisLabelFontSize: 9.5,
    valAxisLabelColor: dark ? THEME.colors.darkMuted : THEME.colors.muted,
    valGridLine: { color: dark ? THEME.colors.deepForest : THEME.colors.line, width: 0.6 },
    catGridLine: { style: "none" },
  });
  return slide;
}

export function addNativeLineChart(slide, deck, {
  series = [],
  x = 0.72,
  y = 1.62,
  w = 8.7,
  h = 4.75,
  colors,
  altText = "NeeDo data line chart",
  showLegend = series.length > 1,
  showValue = false,
  valueFormatCode = "0",
  dark = false,
} = {}) {
  slide.addChart(deck.ChartType.line, chartSeries(series), {
    x,
    y,
    w,
    h,
    altText,
    objectName: "Native line chart",
    chartColors: chartPalette(colors),
    showTitle: false,
    showLegend,
    legendPos: "b",
    legendColor: dark ? THEME.colors.darkMuted : THEME.colors.muted,
    legendFontFace: THEME.font,
    legendFontSize: 10,
    showValue,
    dataLabelColor: dark ? THEME.colors.darkText : THEME.colors.ink,
    dataLabelPosition: "t",
    dataLabelFormatCode: valueFormatCode,
    lineDataSymbol: "circle",
    lineDataSymbolSize: 5,
    lineSize: 2.25,
    catAxisLabelFontFace: THEME.font,
    catAxisLabelFontSize: 10,
    catAxisLabelColor: dark ? THEME.colors.darkMuted : THEME.colors.muted,
    valAxisLabelFontFace: THEME.font,
    valAxisLabelFontSize: 9.5,
    valAxisLabelColor: dark ? THEME.colors.darkMuted : THEME.colors.muted,
    valGridLine: { color: dark ? THEME.colors.deepForest : THEME.colors.line, width: 0.6 },
    catGridLine: { style: "none" },
  });
  return slide;
}

export function addOrbitNode(slide, deck, {
  x = 5.72,
  y = 2.72,
  diameter = 1.2,
  label = "",
  fill = THEME.colors.deepForest,
  color = THEME.colors.white,
  line = THEME.colors.sage,
  connectorFrom,
  dark = false,
} = {}) {
  if (connectorFrom) {
    slide.addShape(deck.ShapeType.line, {
      x: connectorFrom.x,
      y: connectorFrom.y,
      w: x + diameter / 2 - connectorFrom.x,
      h: y + diameter / 2 - connectorFrom.y,
      line: { color: dark ? THEME.colors.sage : THEME.colors.dataGreen, transparency: 38, width: 1.2 },
      objectName: "Orbit connector",
    });
  }
  slide.addShape(deck.ShapeType.ellipse, {
    x,
    y,
    w: diameter,
    h: diameter,
    fill: { color: fill, transparency: dark ? 4 : 0 },
    line: { color: line, width: 1.1 },
    shadow: {
      type: "outer",
      color: THEME.colors.nightForest,
      opacity: 0.12,
      blur: 1.2,
      angle: 45,
      distance: 1,
    },
    objectName: label ? `Orbit node: ${label}` : "Orbit node",
  });
  if (label) {
    slide.addText(label, {
      x: x + 0.12,
      y: y + diameter * 0.37,
      w: diameter - 0.24,
      h: diameter * 0.25,
      fontFace: THEME.font,
      fontSize: Math.max(9, Math.min(15, diameter * 10)),
      bold: true,
      color,
      align: "center",
      valign: "mid",
      margin: 0,
      fit: "shrink",
      objectName: "Orbit node label",
    });
  }
  return slide;
}

export function addDisclosure(slide, deck, {
  x = 0.72,
  y = 6.46,
  w = 6.2,
  h = 0.42,
  text = "",
  tone = "neutral",
  dark = false,
} = {}) {
  const isRisk = tone === "risk";
  const accent = isRisk ? THEME.colors.risk : dark ? THEME.colors.sage : THEME.colors.dataGreen;
  const fill = dark ? THEME.colors.deepForest : isRisk ? THEME.colors.orangePale : THEME.colors.mist;
  const color = dark ? THEME.colors.darkText : isRisk ? THEME.colors.risk : THEME.colors.deepForest;
  slide.addShape(deck.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.12,
    fill: { color: fill, transparency: dark ? 8 : 0 },
    line: { color: accent, width: 0.65, transparency: dark ? 44 : 16 },
    objectName: isRisk ? "Risk disclosure" : "Disclosure",
  });
  slide.addText(text, {
    x: x + 0.14,
    y: y + 0.09,
    w: w - 0.28,
    h: h - 0.17,
    fontFace: THEME.font,
    fontSize: 9.5,
    color,
    margin: 0,
    fit: "shrink",
    objectName: "Disclosure text",
  });
  return slide;
}
