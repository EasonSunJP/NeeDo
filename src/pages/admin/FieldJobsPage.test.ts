import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./FieldJobsPage.tsx", import.meta.url), "utf8");

describe("FieldJobsPage production capability gate", () => {
  it("does not expose demo jobs or browser-local technician overlays", () => {
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("useEntityStore");
    expect(source).not.toContain("DataTable");
    expect(source).not.toContain('"派工"');
    expect(source).not.toContain('"拍照上传"');
    expect(source).not.toContain('"完工确认"');
  });

  it("lists the exact formal prerequisites before activation", () => {
    expect(source).toContain("正式上门工单功能尚未启用");
    expect(source).toContain("FieldJob 表与 migration");
    expect(source).toContain("派工、改派和状态机 API");
    expect(source).toContain("照片、异常、导航与审计链路");
    expect(source).toContain("当前不会展示模拟地址、报价、技师或工单状态");
  });
});
