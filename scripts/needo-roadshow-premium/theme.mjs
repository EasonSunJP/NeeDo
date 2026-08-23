import PptxGenJS from "pptxgenjs";

const colors = Object.freeze({
  white: "FFFFFF",
  coolWhite: "F7FAF8",
  mist: "E7F1EC",
  sage: "72A58B",
  brandGreen: "72A58B",
  green: "4F896D",
  dataGreen: "4F896D",
  deepForest: "173C2E",
  nightForest: "102D23",
  ink: "1F3029",
  muted: "6C7B74",
  line: "D5E4DC",
  darkText: "ECF5F0",
  darkMuted: "A8BDB3",
  orange: "D8946B",
  orangePale: "F7E9E0",
  risk: "A75852",
});

export const THEME = Object.freeze({
  font: "Arial Unicode MS",
  colors,
  layout: Object.freeze({ name: "LAYOUT_WIDE", width: 13.333, height: 7.5 }),
  masters: Object.freeze({ light: "NEEDO_PREMIUM_LIGHT", dark: "NEEDO_PREMIUM_DARK" }),
  type: Object.freeze({
    hero: 64,
    chapter: 40,
    title: 30,
    section: 20,
    body: 15,
    source: 10,
  }),
  margin: Object.freeze({ x: 0.64, top: 0.46, bottom: 0.42 }),
});

export const DARK_PAGES = Object.freeze([2, 10, 16, 19, 26, 31, 34]);

export const LAYOUT_FAMILIES = Object.freeze([
  "ai-hero-split",
  "hero-number-evidence",
  "asymmetric-40-60",
  "native-chart-with-insight",
  "central-orbit-or-flow",
  "dark-conclusion-stage",
  "scenario-rail",
  "milestone-timeline",
]);

function masterDefinition(title, background) {
  return {
    title,
    background: { color: background },
    margin: 0,
    objects: [],
  };
}

export function createDeck() {
  const deck = new PptxGenJS();
  deck.layout = THEME.layout.name;
  deck.author = "NeeDo";
  deck.company = "NeeDo";
  deck.subject = "NeeDo overseas investor roadshow";
  deck.title = "NeeDo 海外投資人路演";
  deck.theme = {
    headFontFace: THEME.font,
    bodyFontFace: THEME.font,
  };
  deck.defineSlideMaster(masterDefinition(THEME.masters.light, THEME.colors.coolWhite));
  deck.defineSlideMaster(masterDefinition(THEME.masters.dark, THEME.colors.nightForest));
  return deck;
}

function addBase(slide, deck, {
  title,
  page,
  kicker,
  dark,
} = {}) {
  const background = dark ? THEME.colors.nightForest : THEME.colors.coolWhite;
  const foreground = dark ? THEME.colors.darkText : THEME.colors.ink;
  const secondary = dark ? THEME.colors.darkMuted : THEME.colors.dataGreen;
  const halo = dark ? THEME.colors.deepForest : THEME.colors.mist;

  slide.background = { color: background };
  slide.addShape(deck.ShapeType.ellipse, {
    x: 11.63,
    y: 0,
    w: 1.7,
    h: 1.7,
    fill: { color: halo, transparency: dark ? 18 : 8 },
    line: { color: halo, transparency: 100 },
    objectName: dark ? "Dark ambient halo" : "Light ambient halo",
  });
  slide.addShape(deck.ShapeType.ellipse, {
    x: 12.25,
    y: 6.42,
    w: 1.08,
    h: 1.08,
    fill: { color: dark ? THEME.colors.sage : THEME.colors.white, transparency: dark ? 78 : 24 },
    line: { color: secondary, transparency: 74, width: 0.6 },
    objectName: dark ? "Dark glass node" : "Light glass node",
  });

  if (kicker) {
    slide.addText(kicker, {
      x: THEME.margin.x,
      y: 0.32,
      w: 5.8,
      h: 0.2,
      fontFace: THEME.font,
      fontSize: 9.5,
      color: secondary,
      bold: true,
      charSpacing: 1.1,
      margin: 0,
      fit: "shrink",
      objectName: "Section kicker",
    });
  }
  if (title) {
    slide.addText(title, {
      x: THEME.margin.x,
      y: kicker ? 0.66 : 0.54,
      w: 10.9,
      h: 0.62,
      fontFace: THEME.font,
      fontSize: THEME.type.title,
      color: foreground,
      bold: true,
      margin: 0,
      fit: "shrink",
      objectName: "Slide title",
    });
  }
  if (page !== undefined && page !== null) {
    slide.addText(String(page).padStart(2, "0"), {
      x: 12.08,
      y: 0.34,
      w: 0.58,
      h: 0.18,
      fontFace: THEME.font,
      fontSize: 9,
      color: secondary,
      align: "right",
      margin: 0,
      objectName: "Page number",
    });
  }
  return slide;
}

export function addLightBase(slide, deck, options = {}) {
  return addBase(slide, deck, { ...options, dark: false });
}

export function addDarkBase(slide, deck, options = {}) {
  return addBase(slide, deck, { ...options, dark: true });
}
