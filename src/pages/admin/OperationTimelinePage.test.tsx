// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { OperationTimelinePage } from "./OperationTimelinePage";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../../api/releasePublications", () => ({
  releasePublicationsApi: api,
}));
vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" }),
  useOptionalI18n: () => ({ language: "zh" }),
}));
it("shows publication time and release changes using the User LOG timeline", async () => {
  api.list.mockResolvedValue({
    total: 11,
    page: 1,
    page_size: 10,
    list: [
      {
        id: 1,
        version: "abc123",
        sourceRevision: "a".repeat(40),
        environment: "staging",
        publishedAt: "2026-09-06T18:00:00.000Z",
        kind: "release",
        changes: ["新增排行筛选", "修复时间显示"],
      },
    ],
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<OperationTimelinePage />));
    expect(container.querySelector(".admin-event-timeline")).not.toBeNull();
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-09-06T18:00:00.000Z",
    );
    expect(container.textContent).toContain("03:00:00");
    expect(container.textContent).toContain("新增排行筛选");
    expect(container.textContent).toContain("abc123");
    expect(container.querySelector("textarea")).toBeNull();
    expect(
      [...container.querySelectorAll("button")].some(
        (button) =>
          button.textContent === "新建" || button.textContent === "导出",
      ),
    ).toBe(false);
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "下一页")!
        .click(),
    );
    expect(api.list).toHaveBeenLastCalledWith(2, 10, expect.any(AbortSignal));
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
it("places the operations timeline after official notifications", () => {
  const source = readFileSync(
    `${process.cwd()}/src/components/admin/AdminLayout.tsx`,
    "utf8",
  );
  const platform = source.slice(
    source.indexOf('key: "platform"'),
    source.indexOf('key: "users"'),
  );
  expect(platform.indexOf('label: "运营时间线"')).toBeGreaterThan(
    platform.indexOf('label: "官方通知"'),
  );
});
