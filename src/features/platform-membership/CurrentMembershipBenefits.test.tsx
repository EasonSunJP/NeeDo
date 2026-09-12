// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentMembershipBenefits } from "./CurrentMembershipBenefits";
import type { CurrentMembershipBenefitsPayload } from "./currentMembershipBenefitsApi";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const payload: CurrentMembershipBenefitsPayload = {
  tierCode: "gold",
  tierVersionPublicId: "tier-gold-v3",
  expiresAt: null,
  list: [
    {
      code: "ndp_experience",
      configuredEnabled: true,
      globallyEnabled: true,
      effective: true,
      deliveryCapability: "available",
      name: "NDP消费经验",
      description: "每次消费获得经验"
    },
    {
      code: "support_service",
      configuredEnabled: true,
      globallyEnabled: true,
      effective: false,
      deliveryCapability: "unavailable",
      name: "专属客服",
      description: "会员专属客服"
    },
    {
      code: "birthday_gift",
      configuredEnabled: true,
      globallyEnabled: false,
      effective: false,
      deliveryCapability: "unavailable",
      name: "生日礼",
      description: "生日礼品"
    },
    {
      code: "traceless_recall",
      configuredEnabled: true,
      globallyEnabled: true,
      effective: false,
      deliveryCapability: "unavailable",
      name: "聊天无痕撤回",
      description: "双方聊天窗口均不保留消息已撤回提示"
    }
  ]
};

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
          <CurrentMembershipBenefits language="zh" load={async () => payload} />
          <LocationProbe />
        </MemoryRouter>
      )
    );
    await act(async () => Promise.resolve());
  }

  async function click(element: Element | null | undefined) {
    await act(async () => element?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
  }

  it("starts collapsed and shows the effective benefit count over the total", async () => {
    await renderBenefits();

    const entry = container.querySelector<HTMLAnchorElement>('a[href="/me/benefits"]');

    expect(entry).not.toBeNull();
    expect(entry?.getAttribute("aria-label")).toBe("NeeDo会员权益");
    expect(container.textContent).toContain("NeeDo会员权益");
    expect(container.textContent).toContain("1/4已开启");
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
