import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const timelineSource = readFileSync(new URL("./OperationTimelinePage.tsx", import.meta.url), "utf8");

describe("operations timeline production capability gate", () => {
  it("does not present sample operations history as persisted records", () => {
    expect(timelineSource).not.toContain("../../data/mock");
    expect(timelineSource).not.toContain("operationTimeline");
    expect(timelineSource).not.toContain("sortedTimeline");
  });

  it("states the persistence, workflow, permission, and export prerequisites", () => {
    expect(timelineSource).toContain("正式运营时间线尚未启用");
    expect(timelineSource).toContain("OperationEvent 与 OperationalIncident 表和 migration");
    expect(timelineSource).toContain("创建、指派、跟进、解决与归档状态机 API");
    expect(timelineSource).toContain("跨城市 RBAC 与不可变审计链路");
    expect(timelineSource).toContain("服务端筛选、分页、聚合与导出合同");
    expect(timelineSource).toContain("当前不会展示模拟运营记录、负责人、城市、优先级或处理状态");
  });
});
