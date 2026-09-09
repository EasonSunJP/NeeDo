// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDispatchCycleDraft } from "../../dispatch-center/store";
import { StepModeSelection } from "./StepModeSelection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("mobile scheduling mode actions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("pins save and next actions to the shared bottom-navigation frame on mobile only", async () => {
    const cycle = createDispatchCycleDraft("store-bottom-actions");
    const renderSurface = async (surface: "desktop" | "mobile") => {
      await act(async () => {
        root.render(
          <StepModeSelection
            cycle={cycle}
            onCycleChange={vi.fn()}
            onMessage={vi.fn()}
            surface={surface}
          />
        );
      });
    };

    await renderSurface("mobile");

    const actions = container.querySelector<HTMLElement>(
      '[data-schedule-wizard-bottom-actions="true"]'
    )!;
    expect(actions.className).toContain("fixed");
    expect(actions.className).toContain("schedule-wizard-floating-frame");
    expect(actions.style.maxWidth).toBe("var(--client-bottom-nav-max-width, 880px)");
    expect(actions.style.paddingLeft).toBe("var(--client-bottom-nav-inline-gap, 12px)");
    expect(actions.parentElement?.className).toContain(
      "pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]"
    );
    expect(actions.firstElementChild?.className).toContain("schedule-wizard-floating-actions");
    expect(actions.firstElementChild?.className).not.toContain("schedule-wizard-action-dock");
    expect([...actions.querySelectorAll("button")].map((button) => button.textContent?.trim()))
      .toEqual(["保存草稿", "下一步：规则设定"]);

    await renderSurface("desktop");

    expect(container.querySelector<HTMLElement>(
      '[data-schedule-wizard-bottom-actions="true"]'
    )?.className).not.toContain("fixed");
  });
});
