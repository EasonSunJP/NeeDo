// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardTestBadge } from "./DashboardTestBadge";

describe("DashboardTestBadge", () => {
  it("renders one red noninteractive TEST label with an accessible explanation", () => {
    const markup = renderToStaticMarkup(
      <DashboardTestBadge ariaLabel="排行榜数据来自测试订单" />
    );

    expect(markup).toContain('data-dashboard-test-badge="true"');
    expect(markup).toContain('aria-label="排行榜数据来自测试订单"');
    expect(markup).toContain("border-coral/40");
    expect(markup).toContain("bg-coral/10");
    expect(markup).toContain("text-coral");
    expect(markup).toContain(">TEST</span>");
    expect(markup).not.toContain("<button");
  });
});
