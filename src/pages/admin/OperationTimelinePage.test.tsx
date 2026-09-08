// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { OperationTimelinePage } from "./OperationTimelinePage";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const api = vi.hoisted(() => ({
  list: vi.fn(),
  createManual: vi.fn(),
  edit: vi.fn(),
}));
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
vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    hasPermission: (code: string) => code === "backoffice:releases:write",
  }),
}));
beforeEach(() => vi.clearAllMocks());
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
        origin: "manual",
        lockVersion: 1,
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
    expect(api.list).toHaveBeenLastCalledWith(
      2,
      10,
      {},
      expect.any(AbortSignal),
    );
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
it("searches an inclusive custom period", async () => {
  api.list.mockResolvedValue({ total: 0, page: 1, page_size: 10, list: [] });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const set = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  try {
    await act(async () => root.render(<OperationTimelinePage />));
    set(container.querySelector('input[aria-label="开始日期"]')!, "2026-09-01");
    set(container.querySelector('input[aria-label="结束日期"]')!, "2026-09-07");
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "搜索")!
        .click(),
    );
    expect(api.list).toHaveBeenLastCalledWith(
      1,
      10,
      { from: "2026-09-01", to: "2026-09-07" },
      expect.any(AbortSignal),
    );
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
it("adds and edits manual publication records with reasons", async () => {
  const release = {
    id: 8,
    deploymentId: "ed27a5b5-46ed-4b8d-b6d9-58e98fe55456",
    version: "v1",
    sourceRevision: null,
    previousRevision: null,
    environment: "local",
    publishedAt: "2026-09-06T18:00:00.000Z",
    kind: "release",
    changes: ["初始说明"],
    origin: "manual",
    lockVersion: 1,
  };
  api.list.mockResolvedValue({
    total: 1,
    page: 1,
    page_size: 10,
    list: [release],
  });
  api.createManual.mockResolvedValue(release);
  api.edit.mockResolvedValue({ ...release, version: "v2", lockVersion: 2 });
  vi.stubGlobal("crypto", {
    randomUUID: () => "ed27a5b5-46ed-4b8d-b6d9-58e98fe55457",
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const fill = (
    element: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ) => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
      element,
      value,
    );
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };
  try {
    await act(async () => root.render(<OperationTimelinePage />));
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "手动添加")!
        .click(),
    );
    const createForm =
      container.querySelector<HTMLFormElement>("#release-editor")!;
    const createInputs = createForm.querySelectorAll<HTMLInputElement>("input");
    const createTextareas =
      createForm.querySelectorAll<HTMLTextAreaElement>("textarea");
    fill(createInputs[0], "v2026.09.07");
    fill(createInputs[1], "2026-09-07T03:00");
    fill(createTextareas[0], "修复时间线\n补齐发布记录");
    fill(createTextareas[1], "补录发布回执");
    await act(async () =>
      createForm.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    expect(api.createManual).toHaveBeenCalledWith(
      expect.objectContaining({
        version: "v2026.09.07",
        publishedAt: "2026-09-06T18:00:00.000Z",
        changes: ["修复时间线", "补齐发布记录"],
        reason: "补录发布回执",
      }),
    );
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "修改")!
        .click(),
    );
    const editForm =
      container.querySelector<HTMLFormElement>("#release-editor")!;
    const editInputs = editForm.querySelectorAll<HTMLInputElement>("input");
    const editTextareas =
      editForm.querySelectorAll<HTMLTextAreaElement>("textarea");
    fill(editInputs[0], "v2");
    fill(editTextareas[0], "更正说明");
    fill(editTextareas[1], "原说明不完整");
    await act(async () =>
      editForm.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    expect(api.edit).toHaveBeenCalledWith(8, {
      version: "v2",
      changes: ["更正说明"],
      reason: "原说明不完整",
      expectedVersion: 1,
    });
  } finally {
    vi.unstubAllGlobals();
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
  const app = readFileSync(`${process.cwd()}/src/App.tsx`, "utf8");
  expect(app).toContain(
    'path="/admin/operation-timeline" element={protectPermission("admin", "backoffice:dashboard:read", <OperationTimelinePage />)}',
  );
});
