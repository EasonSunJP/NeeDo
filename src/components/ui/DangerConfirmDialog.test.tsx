// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DangerConfirmDialog } from "./DangerConfirmDialog";

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "zh", setLanguage: vi.fn() })
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("DangerConfirmDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders the shared red warning treatment and confirms explicitly", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    act(() => {
      root.render(
        <DangerConfirmDialog
          confirmLabel="确定取消预约"
          description="强制取消预约可能引起用户差评，并会降低接单率数值。是否真的要取消此预约？"
          onCancel={onCancel}
          onConfirm={onConfirm}
          open
          title="强制取消预约"
        />
      );
    });

    const dialog = container.querySelector<HTMLElement>('[role="alertdialog"]');
    const buttons = Array.from(container.querySelectorAll("button"));

    expect(dialog?.textContent).toContain("强制取消预约");
    expect(dialog?.textContent).toContain("降低接单率数值");
    expect(dialog?.className).toContain("danger-confirm-dialog");
    expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog?.getAttribute("aria-describedby")).toBeTruthy();
    expect(container.querySelector("section")?.className).toContain("border-red");

    act(() => buttons.find((button) => button.textContent === "取消")?.click());
    act(() => buttons.find((button) => button.textContent === "确定取消预约")?.click());

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("locks dismissal while a destructive action is pending and exposes errors", () => {
    const onCancel = vi.fn();

    act(() => {
      root.render(
        <DangerConfirmDialog
          error="预约取消失败，请稍后重试"
          onCancel={onCancel}
          onConfirm={vi.fn()}
          open
          pending
          title="强制取消预约"
        />
      );
    });

    const pendingButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "正在取消预约");
    expect(pendingButton?.disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("预约取消失败，请稍后重试");

    act(() => container.querySelector<HTMLElement>('[role="alertdialog"]')?.click());
    expect(onCancel).not.toHaveBeenCalled();
  });
});
