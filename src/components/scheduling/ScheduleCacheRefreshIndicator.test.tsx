import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScheduleCacheRefreshIndicator } from "./ScheduleCacheRefreshIndicator";

describe("ScheduleCacheRefreshIndicator", () => {
  it("renders a rotating status layer that never blocks interaction", () => {
    const html = renderToStaticMarkup(<ScheduleCacheRefreshIndicator label="加载正式排班中" />);

    expect(html).toContain('role="status"');
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("fixed inset-0");
    expect(html).toContain("schedule-cache-refresh-dots");
    expect(html).toContain('aria-label="加载正式排班中"');
    expect(html.match(/class="schedule-cache-refresh-dot"/g)).toHaveLength(12);
  });
});
