// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Drawer } from "./Drawer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function renderDrawer(open: boolean) {
  await act(async () => {
    root.render(
      <Drawer onClose={vi.fn()} open={open} title={open ? "员工详细信息卡" : "客户正式档案"}>
        资料
      </Drawer>,
    );
  });
}

describe("Drawer", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("clips a closed panel outside the viewport and removes it from the accessibility tree", async () => {
    await renderDrawer(false);

    const frame = container.firstElementChild;
    const panel = container.querySelector("aside");

    expect(frame?.className).toContain("overflow-hidden");
    expect(panel?.getAttribute("aria-hidden")).toBe("true");
    expect(panel?.className).toContain("translate-x-full");
  });

  it("keeps an open panel visible and accessible", async () => {
    await renderDrawer(true);

    const panel = container.querySelector("aside");
    expect(panel?.getAttribute("aria-hidden")).toBe("false");
    expect(panel?.className).toContain("translate-x-0");
  });
});
