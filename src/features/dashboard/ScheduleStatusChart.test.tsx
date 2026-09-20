import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { ScheduleStatusChart } from "./ScheduleStatusChart";

describe("ScheduleStatusChart", () => {
  it("renders booked and available bars with an attendance line", () => {
    const markup = renderToStaticMarkup(<I18nProvider><ScheduleStatusChart
      buckets={[
        { key: "2026-08-24", label: "8/24", scheduleAvailableHours: 6, scheduleBookedHours: 2, scheduleAttendanceCount: 3 },
        { key: "2026-08-25", label: "8/25", scheduleAvailableHours: 4, scheduleBookedHours: 6, scheduleAttendanceCount: 5 }
      ]}
      description="空闲、已预约和出勤趋势"
      title="排班状态"
    /></I18nProvider>);

    expect(markup.match(/data-schedule-status-bar="booked"/g)).toHaveLength(2);
    expect(markup.match(/data-schedule-status-bar="available"/g)).toHaveLength(2);
    expect(markup).toContain('data-schedule-attendance-line="true"');
    expect(markup.match(/data-schedule-attendance-point="true"/g)).toHaveLength(2);
    expect(markup).toMatch(/出勤人数|Staff on duty/);
  });
});
