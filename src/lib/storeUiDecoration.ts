import type {
  Store,
  StoreCardDecorationConfig,
  StoreCardDecorationId,
  StoreCardTagStyle,
  StoreDecorationBlockConfig,
  StoreDecorationBlockId,
  StoreDecorationBlockStyle,
  StoreUiDecorationConfig
} from "../types/domain";

const blockStyleSet = new Set<StoreDecorationBlockStyle>(["横滑", "图文", "菜单", "照片墙"]);
const cardTagStyleSet = new Set<StoreCardTagStyle>(["实心", "描边"]);

export const defaultStoreDecorationBlocks: StoreDecorationBlockConfig[] = [
  { id: "hero", name: "店铺首屏图文", area: "详情页顶部", style: "图文", color: "#2f9d86", visible: true },
  { id: "booking", name: "最近两周预约模块", area: "详情页预约区", style: "横滑", color: "#e3b84f", visible: true },
  { id: "menu", name: "服务套餐菜单", area: "详情页中段", style: "菜单", color: "#8d7aff", visible: true },
  { id: "gallery", name: "店铺照片墙", area: "详情页图片区", style: "照片墙", color: "#ef7e68", visible: true }
];

export const defaultStoreCardConfigs: StoreCardDecorationConfig[] = [
  { id: "store", name: "附近可预约店铺卡", coverHeight: "220", tagStyle: "实心", cta: "查看详情" },
  { id: "package", name: "服务套餐卡", coverHeight: "140", tagStyle: "描边", cta: "继续预约" },
  { id: "technician", name: "店铺员工信息卡", coverHeight: "180", tagStyle: "实心", cta: "查看员工" }
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeColor(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
}

function normalizeCoverHeight(value: unknown, fallback: string) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.min(220, Math.max(140, Math.round(value))));
  }

  if (typeof value !== "string") {
    return fallback;
  }

  const numeric = Number.parseInt(value, 10);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return String(Math.min(220, Math.max(140, numeric)));
}

function normalizeBlock(base: StoreDecorationBlockConfig, raw?: Partial<StoreDecorationBlockConfig>): StoreDecorationBlockConfig {
  return {
    id: base.id,
    name: normalizeString(raw?.name, base.name),
    area: normalizeString(raw?.area, base.area),
    style: raw?.style && blockStyleSet.has(raw.style) ? raw.style : base.style,
    color: normalizeColor(raw?.color, base.color),
    visible: normalizeBoolean(raw?.visible, base.visible)
  };
}

function normalizeCard(base: StoreCardDecorationConfig, raw?: Partial<StoreCardDecorationConfig>): StoreCardDecorationConfig {
  return {
    id: base.id,
    name: normalizeString(raw?.name, base.name),
    coverHeight: normalizeCoverHeight(raw?.coverHeight, base.coverHeight),
    tagStyle: raw?.tagStyle && cardTagStyleSet.has(raw.tagStyle) ? raw.tagStyle : base.tagStyle,
    cta: normalizeString(raw?.cta, base.cta)
  };
}

export function getDefaultStoreUiDecoration(): StoreUiDecorationConfig {
  return {
    blocks: clone(defaultStoreDecorationBlocks),
    cards: clone(defaultStoreCardConfigs)
  };
}

export function normalizeStoreUiDecoration(raw?: Partial<StoreUiDecorationConfig> | null): StoreUiDecorationConfig {
  const defaults = getDefaultStoreUiDecoration();
  const rawBlocks = Array.isArray(raw?.blocks) ? raw.blocks : [];
  const rawCards = Array.isArray(raw?.cards) ? raw.cards : [];
  const normalizedBlocks = defaults.blocks.map((base) => {
    const matched = rawBlocks.find((item) => item && typeof item === "object" && item.id === base.id);
    return normalizeBlock(base, matched);
  });
  const rawBlockOrder = rawBlocks
    .filter((item): item is StoreDecorationBlockConfig => Boolean(item && typeof item === "object" && defaultStoreDecorationBlocks.some((base) => base.id === item.id)))
    .map((item) => item.id);

  return {
    blocks: [
      ...rawBlockOrder
        .map((id) => normalizedBlocks.find((block) => block.id === id))
        .filter((block): block is StoreDecorationBlockConfig => Boolean(block)),
      ...normalizedBlocks.filter((block) => !rawBlockOrder.includes(block.id))
    ],
    cards: defaults.cards.map((base) => {
      const matched = rawCards.find((item) => item && typeof item === "object" && item.id === base.id);
      return normalizeCard(base, matched);
    })
  };
}

export function getStoreUiDecoration(store?: Pick<Store, "uiDecoration"> | null) {
  return normalizeStoreUiDecoration(store?.uiDecoration);
}

export function getStoreDecorationBlockConfig(store: Pick<Store, "uiDecoration"> | null | undefined, blockId: StoreDecorationBlockId) {
  const decoration = getStoreUiDecoration(store);
  return decoration.blocks.find((block) => block.id === blockId) ?? defaultStoreDecorationBlocks.find((block) => block.id === blockId)!;
}

export function isStoreDecorationBlockVisible(store: Pick<Store, "uiDecoration"> | null | undefined, blockId: StoreDecorationBlockId) {
  return getStoreDecorationBlockConfig(store, blockId).visible;
}

export function getStoreCardDecorationConfig(store: Pick<Store, "uiDecoration"> | null | undefined, cardId: StoreCardDecorationId) {
  const decoration = getStoreUiDecoration(store);
  return decoration.cards.find((card) => card.id === cardId) ?? defaultStoreCardConfigs.find((card) => card.id === cardId)!;
}
