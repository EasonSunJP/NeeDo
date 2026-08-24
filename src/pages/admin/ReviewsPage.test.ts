import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ReviewsPage.tsx", import.meta.url), "utf8");

describe("ReviewsPage production capability gate", () => {
  it("does not present legacy review fixtures or invented review metrics", () => {
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("useEntityStore");
    expect(source).not.toContain('"4.72"');
    expect(source).not.toContain('"128"');
    expect(source).not.toContain('"17"');
    expect(source).not.toContain('"6"');
  });

  it("keeps the route honest until the formal review contract is available", () => {
    expect(source).toContain("正式评价功能尚未启用");
    expect(source).toContain("当前不会展示模拟评分、评价内容、回复状态或风控预警");
    expect(source).toContain("Review 表与 migration");
    expect(source).toContain("分页、搜索与 RBAC API");
    expect(source).toContain("评价回复和风控审计日志");
  });
});
