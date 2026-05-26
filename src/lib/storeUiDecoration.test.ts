import { describe, expect, it } from "vitest";
import {
  getDefaultStoreUiDecoration,
  getStoreCardDecorationConfig,
  getStoreDecorationBlockConfig,
  normalizeStoreUiDecoration
} from "./storeUiDecoration";

describe("storeUiDecoration", () => {
  it("keeps all known UI decoration blocks and cards", () => {
    const decoration = getDefaultStoreUiDecoration();

    expect(decoration.blocks.map((block) => block.id)).toEqual(["hero", "booking", "menu", "technicians", "gallery"]);
    expect(decoration.cards.map((card) => card.id)).toEqual(["store", "package", "technician"]);
  });

  it("normalizes persisted store UI decoration before frontend consumption", () => {
    const decoration = normalizeStoreUiDecoration({
      blocks: [
        { id: "booking", name: "隐藏预约", area: "详情页预约区", style: "菜单", color: "#123abc", visible: false },
        { id: "unknown", name: "未知区块", area: "无", style: "图文", color: "#000000", visible: true } as never
      ],
      cards: [
        { id: "package", name: "套餐卡", coverHeight: "999", tagStyle: "实心", cta: "马上约" },
        { id: "store", name: "", coverHeight: "bad", tagStyle: "错误" as never, cta: "" }
      ]
    });

    expect(decoration.blocks.find((block) => block.id === "booking")).toMatchObject({
      name: "隐藏预约",
      style: "菜单",
      color: "#123abc",
      visible: false
    });
    expect(decoration.blocks).toHaveLength(5);
    expect(decoration.cards.find((card) => card.id === "package")).toMatchObject({
      coverHeight: "220",
      tagStyle: "实心",
      cta: "马上约"
    });
    expect(decoration.cards.find((card) => card.id === "store")).toMatchObject({
      name: "附近可预约店铺卡",
      coverHeight: "220",
      tagStyle: "实心",
      cta: "查看详情"
    });
  });

  it("preserves the persisted block order for frontend previews", () => {
    const decoration = normalizeStoreUiDecoration({
      blocks: [
        { id: "menu", name: "服务套餐菜单", area: "详情页中段", style: "菜单", color: "#8d7aff", visible: true },
        { id: "hero", name: "店铺首屏图文", area: "详情页顶部", style: "图文", color: "#2f9d86", visible: true }
      ]
    });

    expect(decoration.blocks.map((block) => block.id)).toEqual(["menu", "hero", "booking", "technicians", "gallery"]);
  });

  it("resolves block and card config from a store snapshot", () => {
    const store = {
      uiDecoration: normalizeStoreUiDecoration({
        blocks: [{ id: "gallery", name: "环境照片", area: "图片区", style: "照片墙", color: "#fefefe", visible: false }],
        cards: [{ id: "technician", name: "员工卡", coverHeight: "160", tagStyle: "描边", cta: "看员工" }]
      })
    };

    expect(getStoreDecorationBlockConfig(store, "gallery").visible).toBe(false);
    expect(getStoreCardDecorationConfig(store, "technician")).toMatchObject({
      coverHeight: "160",
      tagStyle: "描边",
      cta: "看员工"
    });
  });
});
