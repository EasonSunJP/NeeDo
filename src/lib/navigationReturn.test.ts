import { describe, expect, it } from "vitest";
import { buildCurrentRoute, readNavigationReturnTarget, withReturnTo } from "./navigationReturn";

describe("navigation return helpers", () => {
  it("appends a safe internal return target to a route", () => {
    expect(withReturnTo("/merchant-admin/orders/ord-1", "/merchant-admin/dispatch-center/schedule?mode=auto")).toBe(
      "/merchant-admin/orders/ord-1?returnTo=%2Fmerchant-admin%2Fdispatch-center%2Fschedule%3Fmode%3Dauto"
    );
  });

  it("prefers state return targets and preserves return state", () => {
    const target = readNavigationReturnTarget("?returnTo=%2Fmerchant-admin%2Fdispatch-center%2Fcurrent", {
      returnState: { reopenScheduleDetail: true },
      returnTo: "/merchant-admin/dispatch-center/schedule?mode=auto"
    });

    expect(target).toEqual({
      state: { reopenScheduleDetail: true },
      to: "/merchant-admin/dispatch-center/schedule?mode=auto"
    });
  });

  it("rejects external return targets", () => {
    expect(withReturnTo("/merchant-admin/orders/ord-1", "https://example.com")).toBe("/merchant-admin/orders/ord-1");
    expect(readNavigationReturnTarget("?returnTo=https%3A%2F%2Fexample.com", null)).toBeNull();
  });

  it("builds the current app route from location parts", () => {
    expect(buildCurrentRoute({ hash: "#section", pathname: "/merchant-admin/dispatch-center/schedule", search: "?mode=auto" })).toBe(
      "/merchant-admin/dispatch-center/schedule?mode=auto#section"
    );
  });
});
