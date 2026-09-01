// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MembershipSupportEntry } from "./MembershipSupportEntry";
import type { CurrentMembershipBenefitsPayload } from "../platform-membership/currentMembershipBenefitsApi";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const configured: CurrentMembershipBenefitsPayload = {
  tierCode: "black_diamond",
  tierVersionPublicId: "black-v1",
  expiresAt: null,
  list: [
    {
      code: "support_service",
      configuredEnabled: true,
      globallyEnabled: true,
      effective: false,
      deliveryCapability: "unavailable",
      name: "专属客服",
      description: "会员专属客服"
    }
  ]
};

describe("MembershipSupportEntry", () => {
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

  it("renders a gray explanation-only entry without identity or conversation data", async () => {
    await act(async () =>
      root.render(
        <MembershipSupportEntry enabled language="zh" load={async () => configured} />
      )
    );
    await act(async () => Promise.resolve());

    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.getAttribute("aria-disabled")).toBe("true");
    expect(button?.textContent).toContain("NeeDo专属客服（能力未接通）");
    expect(container.querySelector("a")).toBeNull();
    expect(container.innerHTML).not.toMatch(/avatar|userId|conversationId|composer/i);

    await act(async () => button?.click());
    expect(document.body.textContent).toContain("暂时无法发起对话");
    expect(document.body.textContent).not.toContain("发送消息");
  });

  it("hides the entry when the benefit is not configured or the API fails", async () => {
    await act(async () =>
      root.render(
        <MembershipSupportEntry
          enabled
          language="zh"
          load={async () => ({ ...configured, list: [] })}
        />
      )
    );
    await act(async () => Promise.resolve());
    expect(container.textContent).toBe("");

    await act(async () =>
      root.render(
        <MembershipSupportEntry
          enabled
          language="zh"
          load={vi.fn(async () => Promise.reject(new Error("offline")))}
        />
      )
    );
    await act(async () => Promise.resolve());
    expect(container.textContent).toBe("");
  });
});
