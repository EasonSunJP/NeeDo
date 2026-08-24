import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const timelineSource = readFileSync(new URL("./OperationTimelinePage.tsx", import.meta.url), "utf8");
const exchangeSource = readFileSync(new URL("./NeedoExchangeAdminPage.tsx", import.meta.url), "utf8");

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

describe("NeeDo exchange administration production capability gate", () => {
  it("does not build demand or information records from the demo feed", () => {
    expect(exchangeSource).not.toContain("../../data/mock");
    expect(exchangeSource).not.toContain("../mobile/NeedoExchangePage");
    expect(exchangeSource).not.toContain("getNeedoFeedPosts");
    expect(exchangeSource).not.toContain("buildPhone");
  });

  it("states the persisted exchange lifecycle prerequisites", () => {
    expect(exchangeSource).toContain("正式需求与情报中心尚未启用");
    expect(exchangeSource).toContain("ExchangePost、Demand、Offer 与 ExchangeReply 表和 migration");
    expect(exchangeSource).toContain("创建、审核、发布、过期、驳回与撤回状态机 API");
    expect(exchangeSource).toContain("发布身份、联系方式脱敏与范围 RBAC");
    expect(exchangeSource).toContain("匹配、预约、支付、审计、分页与导出合同");
    expect(exchangeSource).toContain("当前不会展示模拟需求、情报、发布主体、联系方式、互动或支付履约数据");
  });
});
