// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormalTimelinePagination } from "./FormalTimelinePagination";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "zh", setLanguage: vi.fn() }),
}));

let container: HTMLDivElement;
let root: Root;

describe("FormalTimelinePagination", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("offers the formal page sizes and moves to the next server page", async () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    await act(async () => {
      root.render(
        <FormalTimelinePagination
          ariaLabel="用户动态翻页"
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          page={2}
          pageSize={30}
          total={126}
        />,
      );
    });

    const select = container.querySelector<HTMLSelectElement>("select")!;
    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe(
      "用户动态翻页",
    );
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "10",
      "30",
      "50",
      "100",
    ]);
    await act(async () => {
      select.value = "50";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onPageSizeChange).toHaveBeenCalledWith(50);

    const next = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "下一页",
    )!;
    await act(async () => next.click());
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
