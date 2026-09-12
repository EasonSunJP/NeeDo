import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScheduleCacheRefreshIndicator } from "./ScheduleCacheRefreshIndicator";

describe("ScheduleCacheRefreshIndicator", () => {
  it("renders a centered 50 percent opacity status layer that never blocks interaction", () => {
    const html = renderToStaticMarkup(<ScheduleCacheRefreshIndicator label="加载正式排班中" />);

    expect(html).toContain('role="status"');
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("opacity-50");
    expect(html).toContain("fixed inset-0");
    expect(html.match(/schedule-cache-refresh-dot/g)).toHaveLength(12);
  });
});
