/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImMessageMultiSelectCircle, ImMessageMultiSelectOverlay } from "./ImMessageMultiSelectOverlay";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function renderOverlay(overrides: Partial<Parameters<typeof ImMessageMultiSelectOverlay>[0]> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const props: Parameters<typeof ImMessageMultiSelectOverlay>[0] = {
    deleteConfirmationOpen: false,
    language: "zh",
    notice: null,
    onCancel: vi.fn(),
    onConfirmDelete: vi.fn(),
    onCopy: vi.fn(),
    onDelete: vi.fn(),
    onDismissDeleteConfirmation: vi.fn(),
    onFavorite: vi.fn(),
    onForward: vi.fn(),
    onSelectToPoint: vi.fn(),
    pendingAction: null,
    selectedCount: 0,
    ...overrides,
  };
  await act(async () => root.render(<ImMessageMultiSelectOverlay {...props} />));
  return { container, props, root };
}

describe("ImMessageMultiSelectOverlay", () => {
  it("renders fixed upper/lower range controls and exactly four glass-bar actions", async () => {
    const { container, props, root } = await renderOverlay({ selectedCount: 2 });
    const rangeButtons = container.querySelectorAll<HTMLButtonElement>('[data-im-multiselect-range]');
    const bar = container.querySelector<HTMLElement>('[data-im-multiselect-action-bar]');
    const actions = bar?.querySelectorAll<HTMLButtonElement>("button") ?? [];

    expect(rangeButtons).toHaveLength(2);
    expect(rangeButtons[0]?.className).toContain("fixed");
    expect(rangeButtons[1]?.className).toContain("fixed");
    expect(bar?.classList.contains("client-liquid-glass-surface")).toBe(true);
    expect(bar?.className).toContain("fixed");
    expect([...actions].map((button) => button.textContent?.trim())).toEqual(["转发", "复制", "收藏", "删除"]);
    expect([...container.querySelectorAll('[data-im-multiselect-control="true"]')].length).toBeGreaterThanOrEqual(7);

    vi.spyOn(rangeButtons[0]!, "getBoundingClientRect").mockReturnValue(new DOMRect(8, 80, 96, 44));
    await act(async () => rangeButtons[0]?.click());
    expect(props.onSelectToPoint).toHaveBeenCalledWith(102);
    await act(async () => root.unmount());
  });

  it("disables all actions at zero selection and while an action is pending", async () => {
    const zero = await renderOverlay();
    expect([...zero.container.querySelectorAll<HTMLButtonElement>('[data-im-multiselect-action-bar] button')].every((button) => button.disabled)).toBe(true);
    await act(async () => zero.root.unmount());

    const pending = await renderOverlay({ pendingAction: "copy", selectedCount: 3 });
    expect([...pending.container.querySelectorAll<HTMLButtonElement>('[data-im-multiselect-action-bar] button')].every((button) => button.disabled)).toBe(true);
    await act(async () => pending.root.unmount());
  });

  it("shows the 100-message overflow notice without hiding the selected count", async () => {
    const { container, root } = await renderOverlay({ notice: "最多选择100条信息", selectedCount: 100 });
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain("已选择 100 条信息");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("最多选择100条信息");
    await act(async () => root.unmount());
  });

  it("keeps delete confirmation controls inside the multiselect control boundary", async () => {
    const { container, root } = await renderOverlay({ deleteConfirmationOpen: true, selectedCount: 3 });
    expect(container.textContent).toContain("将从你的聊天记录中删除 3 条信息，不影响对方。");
    const confirm = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "删除");
    expect(confirm?.dataset.imMultiselectControl).toBe("true");
    await act(async () => root.unmount());
  });
});

describe("ImMessageMultiSelectCircle", () => {
  it("has checkbox semantics and is the explicit row toggle", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onToggle = vi.fn();
    await act(async () => root.render(<ImMessageMultiSelectCircle checked label="选择消息" onToggle={onToggle} />));
    const checkbox = container.querySelector<HTMLButtonElement>('[role="checkbox"]');
    expect(checkbox?.getAttribute("aria-checked")).toBe("true");
    expect(checkbox?.dataset.imMultiselectControl).toBe("true");
    await act(async () => checkbox?.click());
    expect(onToggle).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });
});
