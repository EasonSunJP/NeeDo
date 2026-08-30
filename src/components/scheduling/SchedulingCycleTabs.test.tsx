import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DispatchCycle } from "../../features/dispatch-center/domain";
import { SchedulingCycleTabs } from "./SchedulingCycleTabs";

describe("SchedulingCycleTabs", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows today's date as the start of a newly created cycle", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00+09:00"));

    const markup = renderToStaticMarkup(
      <SchedulingCycleTabs
        activeSlot="builder"
        slots={[
          {
            key: "builder",
            label: "新建周期",
            cycle: { periodEnd: "2026-06-25" } as DispatchCycle,
            onClick: () => undefined
          }
        ]}
        surface="mobile"
      />
    );

    expect(markup).toContain("8月31日~");
    expect(markup).not.toContain("~6月25日");
  });
});
