import { describe, expect, it } from "vitest";
import {
  detectStorePresentationIndustry,
  getDefaultStorePresentationConfig,
  getStorePresentationConfig,
  normalizeStorePresentationConfig
} from "./storePresentation";

describe("storePresentation", () => {
  it("detects the store detail presentation industry from store tags", () => {
    expect(detectStorePresentationIndustry({ tags: ["美甲", "当日可约"] })).toBe("beauty");
    expect(detectStorePresentationIndustry({ tags: ["居酒屋", "包间"] })).toBe("dining");
    expect(detectStorePresentationIndustry({ tags: ["家庭保洁", "修水管"] })).toBe("cleaning");
    expect(detectStorePresentationIndustry({ tags: ["肩颈调理"] })).toBe("massage");
  });

  it("normalizes persisted frontend copy for live store detail consumption", () => {
    const presentation = normalizeStorePresentationConfig(
      {
        subtitle: " 后台改过的首屏说明 ",
        favoriteCount: 12.4,
        station: "",
        paymentMethods: ["PayPay", "PayPay", "现金", ""],
        equipment: [],
        offers: [
          {
            id: "custom-offer",
            title: "后台情报",
            benefit: "首单减 ¥500",
            conditions: "",
            applicable: "全店项目",
            validUntil: "",
            stackingRule: "不可叠加"
          }
        ]
      },
      "massage"
    );

    expect(presentation.subtitle).toBe("后台改过的首屏说明");
    expect(presentation.favoriteCount).toBe(12);
    expect(presentation.station).toBe(getDefaultStorePresentationConfig("massage").station);
    expect(presentation.paymentMethods).toEqual(["PayPay", "现金"]);
    expect(presentation.equipment).toEqual([]);
    expect(presentation.offers[0]).toMatchObject({
      id: "custom-offer",
      title: "后台情报",
      benefit: "首单减 ¥500",
      applicable: "全店项目",
      stackingRule: "不可叠加"
    });
    expect(presentation.offers[0].conditions).toBe(getDefaultStorePresentationConfig("massage").offers[0].conditions);
  });

  it("resolves a store snapshot into the copy that frontend pages render", () => {
    const presentation = getStorePresentationConfig({
      tags: ["美甲"],
      presentation: {
        subtitle: "手机端也能改的前台文案",
        favoriteCount: 88,
        distance: "距测试站 1 分钟",
        station: "测试站",
        access: "测试路线",
        seatLabel: "座位",
        menuLabel: "菜单",
        peopleLabel: "人数",
        paymentMethods: ["平台预付"],
        equipment: ["Wifi"],
        parking: "无",
        routeGuide: "到店按门铃",
        seatFilters: ["全部"],
        offers: getDefaultStorePresentationConfig("beauty").offers
      }
    });

    expect(presentation.subtitle).toBe("手机端也能改的前台文案");
    expect(presentation.station).toBe("测试站");
    expect(presentation.paymentMethods).toEqual(["平台预付"]);
  });
});
