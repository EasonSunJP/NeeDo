// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CurrentMembershipBenefits } from "./CurrentMembershipBenefits";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CurrentMembershipBenefits", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderBenefits() {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/me"]}>
          <CurrentMembershipBenefits language="zh" />
          <LocationProbe />
        </MemoryRouter>
      )
    );
  }

  async function click(element: Element | null | undefined) {
    await act(async () => element?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
  }

  it("starts collapsed without a trailing status badge", async () => {
    await renderBenefits();

    const entry = container.querySelector<HTMLAnchorElement>('a[href="/me/benefits"]');

    expect(entry).not.toBeNull();
    expect(entry?.getAttribute("aria-label")).toBe("NeeDo会员权益");
    expect(container.textContent).toContain("NeeDo会员权益");
    expect(container.textContent).not.toContain("1/4已开启");
    expect(container.textContent).not.toContain("…");
    expect(container.textContent).not.toContain("按当前会员类型显示配置与实际可用状态");
    expect(container.querySelector('[aria-label="查看NeeDo会员权益说明"]')).not.toBeNull();
    expect(container.textContent).not.toContain("NDP消费经验");
  });

  it("navigates to the dedicated benefits route instead of opening a dialog over personal center", async () => {
    await renderBenefits();
    await click(container.querySelector('a[href="/me/benefits"]'));

    expect(container.querySelector('[role="dialog"][aria-label="NeeDo会员权益详情"]')).toBeNull();
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/me/benefits");
  });
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}
