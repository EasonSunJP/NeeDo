import { describe, expect, it } from "vitest";
import {
  buildNeedoPostTags,
  extractNeedoRemarkTags,
  findNeedoPost,
  getNeedoFeedPosts,
  stripNeedoRemarkTags,
  submitNeedoDemandApplication,
} from "./NeedoExchangePage";
import source from "./NeedoExchangePage.tsx?raw";

describe("NeedoExchangePage formal entry", () => {
  it("does not expose locally generated exchange records", () => {
    expect(getNeedoFeedPosts("user")).toEqual([]);
    expect(getNeedoFeedPosts("merchant")).toEqual([]);
    expect(findNeedoPost("user", "unknown")).toBeNull();
  });

  it("rejects local-only mutations while the formal API is unavailable", () => {
    expect(() => submitNeedoDemandApplication("user", "unknown")).toThrow("error.feature_unavailable");
  });

  it("mounts the formal Exchange feed and contains no disabled-gate copy or mock identity generation", () => {
    expect(source).toContain("<ExchangeFeedPage context={context} />");
    expect(source).not.toContain("正式需求与情报功能尚未启用");
    expect(source).not.toContain("当前不会展示或创建模拟需求");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("hashSystemId");
    expect(source).not.toContain("getSeedPosts");
    expect(source).not.toContain("getExtraPosts");
  });

  it("extracts only explicit remark hashtags", () => {
    const remark = "肩颈、足部都可以约 #肩颈调理 20:30 后还有空档，#双人护理，会员 8 折 #中文OK";

    expect(extractNeedoRemarkTags(remark)).toEqual(["肩颈调理", "双人护理", "中文OK"]);
    expect(stripNeedoRemarkTags(remark)).toBe("肩颈、足部都可以约 20:30 后还有空档，会员 8 折");
    expect(buildNeedoPostTags(["不应沿用"], "#标题不是标签", remark)).toEqual(["肩颈调理", "双人护理", "中文OK"]);
  });
});
