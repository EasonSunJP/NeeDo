// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentMembershipBenefitsPage } from "./CurrentMembershipBenefitsPage";
import type { CurrentMembershipBenefitsPayload } from "./currentMembershipBenefitsApi";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../components/mobile/MobileShell", () => ({
  MobileShell: ({ children, showBottomNav }: { children: ReactNode; showBottomNav?: boolean }) => (
    <div data-bottom-nav={showBottomNav === false ? "hidden" : "visible"}>{children}</div>
  )
}));
vi.mock("../../components/mobile/MobileFullscreenPage", () => ({
  MobileFullscreenPage: ({ children }: { children: ReactNode }) => (
    <div data-testid="mobile-fullscreen-page">{children}</div>
  )
}));
vi.mock("../../i18n/I18nProvider", () => ({ useOptionalI18n: () => ({ language: "zh" }) }));

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
      code: "birthday_gift",
      configuredEnabled: true,
      globallyEnabled: false,
      effective: false,
      deliveryCapability: "unavailable",
      name: "生日礼",
      description: "生日礼品"
    }
  ]
};

describe("CurrentMembershipBenefitsPage", () => {
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

  it("renders as a fullscreen page with title-side info and icon-only visible state", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/me/benefits"]}>
          <CurrentMembershipBenefitsPage load={async () => payload} />
        </MemoryRouter>
      );
    });
    await act(async () => Promise.resolve());

    expect(container.querySelector('[data-testid="mobile-fullscreen-page"]')).not.toBeNull();
    expect(container.querySelector('[data-bottom-nav="hidden"]')).not.toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe("NeeDo会员权益");
    expect(container.querySelector('[aria-label="查看NeeDo会员权益说明"]')).not.toBeNull();
    expect(container.textContent).not.toContain("按当前会员类型显示配置与实际可用状态");
    expect(container.textContent).toContain("NDP消费经验");
    expect(container.textContent).toContain("生日礼");
    expect(container.textContent).not.toContain("可使用");
    expect(container.textContent).not.toContain("未启用");
    expect(container.textContent).not.toContain("能力未接通");
    expect(container.querySelectorAll('[data-testid="membership-benefit-state-icon"]')).toHaveLength(2);
  });
});
