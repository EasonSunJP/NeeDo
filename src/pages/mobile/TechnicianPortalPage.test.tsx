import { describe, expect, it } from "vitest";
import source from "./TechnicianPortalPage.tsx?raw";

describe("TechnicianPortalPage profile card", () => {
  it("keeps the info/data tabs and places privacy plus tags in the info card", () => {
    const cardStart = source.indexOf('data-testid="technician-info-card"');
    const cardEnd = source.indexOf('{activeMeTab === "data"', cardStart);
    const cardSource = source.slice(cardStart, cardEnd);

    expect(source).toContain('{ label: "信息卡", value: "info" }');
    expect(source).toContain('{ label: "数据中心", value: "data" }');
    expect(cardSource).toContain('ariaLabel="开启隐私模式"');
    expect(cardSource).toContain('data-testid="technician-privacy-options"');
    expect(cardSource).toContain("absolute right-0 top-[calc(100%+8px)]");
    expect(cardSource).toContain("flex h-36 min-w-0 flex-1 flex-col");
    expect(cardSource).toContain("mt-auto rounded-[18px]");
    expect(cardSource).toContain("z-[90]");
    expect(cardSource).toContain("profilePrivacyMenuOpen");
    expect(cardSource).toContain("profilePrivacyOptions.map");
    expect(cardSource).toContain("ProfilePrivacyInfoButton");
    expect(cardSource).not.toContain("评分 {technicianRating}");
    expect(cardSource).toContain("服务评分");
    expect(source).not.toContain('title="信息卡设置"');
    expect(source).not.toContain("公开主页、头像轮播和补充资料仍在设置页维护");
    expect(source).toContain("对所有人不可见");
    expect(source).toContain("对好友可见");
    expect(source).toContain("对好友以及关联人可见");
    expect(source).toContain('description: "仅本人可见"');
    expect(source).toContain('description: "仅好友可以看到该账号信息"');
    expect(source).toContain('description: "仅好友以及关联店铺和介绍关系中的关联人可见"');
    expect(source).not.toContain("仅好友关系中的用户可以看到这张信息卡。");
    expect(source).not.toContain("好友和订单、店铺、介绍关系中的关联人可以看到。");

    const basicInfoIndex = cardSource.indexOf("基础信息");
    const introIndex = cardSource.indexOf("自我介绍");
    const tagsIndex = cardSource.indexOf('data-testid="technician-info-tags"');

    expect(basicInfoIndex).toBeGreaterThan(-1);
    expect(introIndex).toBeGreaterThan(basicInfoIndex);
    expect(tagsIndex).toBeGreaterThan(introIndex);
  });
});
