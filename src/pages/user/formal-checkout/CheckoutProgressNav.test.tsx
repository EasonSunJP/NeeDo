// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckoutProgressNav, checkoutProgressPath, resolveActiveCheckoutStep } from "./CheckoutProgressNav";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("formal checkout progress navigation", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("uses the approved rounded arrow paths", () => {
    expect(checkoutProgressPath(true)).toBe("M18 4H117C125 4 132 7 138 12L151 25C156 30 156 38 151 43L138 56C132 61 125 64 117 64H18C10 64 4 58 4 50V18C4 10 10 4 18 4Z");
    expect(checkoutProgressPath(false)).toBe("M20 4H117C125 4 132 7 138 12L151 25C156 30 156 38 151 43L138 56C132 61 125 64 117 64H20C14 64 9 61 6 56L0 34L6 12C9 7 14 4 20 4Z");
  });

  it("selects the last section that reaches the content viewport midpoint", () => {
    expect(resolveActiveCheckoutStep({ progressBottom: 180, sectionTops: [210, 560, 910], viewportHeight: 900 })).toBe(0);
    expect(resolveActiveCheckoutStep({ progressBottom: 180, sectionTops: [80, 520, 910], viewportHeight: 900 })).toBe(1);
    expect(resolveActiveCheckoutStep({ progressBottom: 180, sectionTops: [20, 200, 500, 539, 900], viewportHeight: 900 })).toBe(3);
  });

  it("renders current and completed arrows as active while exposing one current step", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <CheckoutProgressNav
          activeIndex={2}
          containerRef={{ current: null }}
          fulfillmentMode="store"
          onSelect={vi.fn()}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons).toHaveLength(6);
    expect(buttons.filter((button) => button.dataset.active === "true")).toHaveLength(3);
    expect(buttons[2]?.getAttribute("aria-current")).toBe("step");
    expect(buttons[3]?.getAttribute("aria-current")).toBeNull();
    expect(container.textContent).toContain("到店服务");
  });
});
