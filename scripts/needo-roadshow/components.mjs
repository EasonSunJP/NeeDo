import { T, organicRibbon } from "./theme.mjs";

export function addBackground(slide, pptx, { ribbon = true, flip = false, tint = T.c.white } = {}) {
  slide.background = { color: tint };
  if (ribbon) {
    slide.addImage({ data: organicRibbon({ color: T.c.mist, opacity: 0.82, flip }), x: 0, y: 5.1, w: 13.333, h: 2.4 });
  }
  slide.addShape(pptx.ShapeType.ellipse, { x: 11.65, y: -0.55, w: 2.25, h: 2.25, fill: { color: T.c.mist, transparency: 36 }, line: { transparency: 100 } });
}

export function addHeader(slide, pptx, title, page, kicker = "NeeDo 海外投資人路演") {
  slide.addText(kicker, { x: T.m.x, y: 0.31, w: 5.5, h: 0.22, fontFace: T.font, fontSize: 9, color: T.c.data, bold: true, charSpacing: 1.2, margin: 0 });
  slide.addText(title, { x: T.m.x, y: 0.66, w: 11.55, h: 0.73, fontFace: T.font, fontSize: T.fs.title, color: T.c.ink, bold: true, margin: 0, breakLine: false, fit: "shrink" });
  slide.addText(String(page).padStart(2, "0"), { x: 12.12, y: 0.33, w: 0.55, h: 0.22, fontFace: T.font, fontSize: 9, color: T.c.muted, align: "right", margin: 0 });
}

export function addFooter(slide, source = "", confidentiality = "機密｜僅供合格投資人討論") {
  slide.addText(source, { x: T.m.x, y: 7.13, w: 9.8, h: 0.18, fontFace: T.font, fontSize: T.fs.micro, color: T.c.muted, margin: 0, fit: "shrink" });
  slide.addText(confidentiality, { x: 10.35, y: 7.13, w: 2.35, h: 0.18, fontFace: T.font, fontSize: T.fs.micro, color: T.c.muted, align: "right", margin: 0 });
}

export function addCard(slide, pptx, { x, y, w, h, fill = T.c.white, line = T.c.line, radius = 0.14, shadow = true }) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: radius,
    fill: { color: fill },
    line: { color: line, width: 0.8 },
    shadow: shadow ? { type: "outer", color: "AFC2B8", opacity: 0.13, blur: 1.5, angle: 45, distance: 1 } : undefined,
  });
}

export function addPill(slide, pptx, text, { x, y, w, fill = T.c.mist, color = T.c.dark, border = T.c.line } = {}) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 0.34, rectRadius: 0.17, fill: { color: fill }, line: { color: border, width: 0.6 } });
  slide.addText(text, { x: x + 0.08, y: y + 0.04, w: w - 0.16, h: 0.2, fontFace: T.font, fontSize: 9.5, color, bold: true, align: "center", margin: 0, fit: "shrink" });
}

export function addStat(slide, pptx, { x, y, w, h = 1.25, value, label, sub = "", accent = T.c.data, fill = T.c.white }) {
  addCard(slide, pptx, { x, y, w, h, fill });
  slide.addShape(pptx.ShapeType.ellipse, { x: x + 0.2, y: y + 0.19, w: 0.15, h: 0.15, fill: { color: accent }, line: { transparency: 100 } });
  slide.addText(value, { x: x + 0.2, y: y + 0.39, w: w - 0.4, h: 0.39, fontFace: T.font, fontSize: T.fs.stat, color: accent, bold: true, margin: 0, fit: "shrink" });
  slide.addText(label, { x: x + 0.2, y: y + 0.86, w: w - 0.4, h: 0.22, fontFace: T.font, fontSize: 11.5, color: T.c.ink, bold: true, margin: 0, fit: "shrink" });
  if (sub) slide.addText(sub, { x: x + 0.2, y: y + 1.08, w: w - 0.4, h: 0.16, fontFace: T.font, fontSize: 8.8, color: T.c.muted, margin: 0, fit: "shrink" });
}

export function addBody(slide, text, { x, y, w, h, size = T.fs.body, color = T.c.ink, bold = false, align = "left", valign = "top", bullet = false } = {}) {
  slide.addText(text, { x, y, w, h, fontFace: T.font, fontSize: size, color, bold, align, valign, margin: 0, breakLine: false, fit: "shrink", bullet: bullet ? { indent: size * 1.2 } : undefined, paraSpaceAfterPt: bullet ? 7 : 0 });
}

export function addSectionLabel(slide, pptx, text, { x, y, w = 1.55, accent = T.c.data } = {}) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 0.36, rectRadius: 0.18, fill: { color: accent }, line: { transparency: 100 } });
  slide.addText(text, { x: x + 0.08, y: y + 0.065, w: w - 0.16, h: 0.18, fontFace: T.font, fontSize: 9.5, color: T.c.white, bold: true, align: "center", margin: 0, fit: "shrink" });
}

export function addProcess(slide, pptx, items, { x, y, w, h = 1.1, accent = T.c.data, number = true } = {}) {
  const gap = 0.16;
  const itemW = (w - gap * (items.length - 1)) / items.length;
  items.forEach((item, index) => {
    const ix = x + index * (itemW + gap);
    addCard(slide, pptx, { x: ix, y, w: itemW, h, fill: index === 0 ? T.c.mist : T.c.white, shadow: false });
    if (number) {
      slide.addShape(pptx.ShapeType.ellipse, { x: ix + 0.16, y: y + 0.15, w: 0.31, h: 0.31, fill: { color: accent }, line: { transparency: 100 } });
      slide.addText(String(index + 1), { x: ix + 0.16, y: y + 0.195, w: 0.31, h: 0.16, fontFace: T.font, fontSize: 9, bold: true, color: T.c.white, align: "center", margin: 0 });
    }
    slide.addText(item.title, { x: ix + 0.17, y: y + 0.54, w: itemW - 0.34, h: 0.22, fontFace: T.font, fontSize: 11, bold: true, color: T.c.ink, align: "center", margin: 0, fit: "shrink" });
    if (item.sub) slide.addText(item.sub, { x: ix + 0.17, y: y + 0.81, w: itemW - 0.34, h: 0.18, fontFace: T.font, fontSize: 8.5, color: T.c.muted, align: "center", margin: 0, fit: "shrink" });
    if (index < items.length - 1) {
      slide.addShape(pptx.ShapeType.chevron, { x: ix + itemW - 0.01, y: y + 0.43, w: gap + 0.04, h: 0.24, fill: { color: T.c.green, transparency: 15 }, line: { transparency: 100 } });
    }
  });
}

export function addMetricTable(slide, pptx, { x, y, w, rows, headers, colWidths, highlightCol = -1 }) {
  const rowH = 0.46;
  const totalH = rowH * (rows.length + 1);
  addCard(slide, pptx, { x, y, w, h: totalH, fill: T.c.white, shadow: false });
  let cx = x;
  headers.forEach((header, i) => {
    const cw = colWidths[i] * w;
    slide.addShape(pptx.ShapeType.rect, { x: cx, y, w: cw, h: rowH, fill: { color: i === highlightCol ? T.c.dark : T.c.mist }, line: { color: T.c.line, width: 0.5 } });
    slide.addText(header, { x: cx + 0.06, y: y + 0.12, w: cw - 0.12, h: 0.18, fontFace: T.font, fontSize: 9.5, bold: true, color: i === highlightCol ? T.c.white : T.c.dark, align: i === 0 ? "left" : "right", margin: 0, fit: "shrink" });
    cx += cw;
  });
  rows.forEach((row, ri) => {
    cx = x;
    row.forEach((cell, ci) => {
      const cw = colWidths[ci] * w;
      slide.addShape(pptx.ShapeType.rect, { x: cx, y: y + rowH * (ri + 1), w: cw, h: rowH, fill: { color: ci === highlightCol ? T.c.pale : ri % 2 ? T.c.warmWhite : T.c.white }, line: { color: T.c.line, width: 0.45 } });
      slide.addText(String(cell), { x: cx + 0.06, y: y + rowH * (ri + 1) + 0.12, w: cw - 0.12, h: 0.18, fontFace: T.font, fontSize: 9.5, color: ci === 0 ? T.c.ink : T.c.dark, bold: ci === highlightCol || ci === 0, align: ci === 0 ? "left" : "right", margin: 0, fit: "shrink" });
      cx += cw;
    });
  });
}

export function addCallout(slide, pptx, text, { x, y, w, h = 0.72, accent = T.c.dark, fill = T.c.mist } = {}) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.16, fill: { color: fill }, line: { color: accent, width: 1.1 } });
  slide.addText(text, { x: x + 0.18, y: y + 0.16, w: w - 0.36, h: h - 0.28, fontFace: T.font, fontSize: 12.5, color: accent, bold: true, align: "center", valign: "mid", margin: 0, fit: "shrink" });
}
