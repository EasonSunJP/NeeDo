// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
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
      root.render(<CurrentMembershipBenefits language="zh" load={async () => payload} />)
    );
    await act(async () => Promise.resolve());
  }

  async function click(element: Element | null | undefined) {
    await act(async () => element?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  }

  it("starts collapsed and shows the effective benefit count over the total", async () => {
    await renderBenefits();

    const toggle = container.querySelector<HTMLButtonElement>('button[aria-expanded="false"]');

    expect(toggle).not.toBeNull();
    expect(toggle?.textContent).toContain("会员权益");
    expect(toggle?.textContent).toContain("1/4已开启");
    expect(container.textContent).not.toContain("NDP消费经验");
  });

  it("renders active, unavailable and globally disabled states honestly", async () => {
    await renderBenefits();
    await click(container.querySelector('button[aria-expanded="false"]'));

    expect(container.textContent).toContain("可使用");
    expect(container.textContent).toContain("能力未接通");
    expect(container.textContent).toContain("未启用");
    expect(container.textContent).toContain("聊天无痕撤回");
    expect(container.textContent).toContain("双方聊天窗口均不保留消息已撤回提示");
    expect(container.textContent).not.toContain("已发放");
  });

  it("opens an explanation only and exposes no fulfillment control", async () => {
    await renderBenefits();
    await click(container.querySelector('button[aria-expanded="false"]'));

    const tracelessRecall = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("聊天无痕撤回")
    );
    await click(tracelessRecall);

    expect(document.body.textContent).toContain("该权益已包含在会员配置中，但对应服务能力尚未接通");
    expect(document.body.textContent).not.toMatch(/领取|发放|开始聊天/);
  });

  it("collapses the expanded list from a plain-text action", async () => {
    await renderBenefits();
    await click(container.querySelector('button[aria-expanded="false"]'));

    const collapse = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "收起"
    );

    expect(collapse).not.toBeUndefined();
    expect(collapse?.className).not.toMatch(/rounded|border|bg-/);
    await click(collapse);
    expect(container.querySelector('button[aria-expanded="false"]')).not.toBeNull();
    expect(container.textContent).not.toContain("NDP消费经验");
  });
});
