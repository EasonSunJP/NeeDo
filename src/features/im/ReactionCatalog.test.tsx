/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReactionCatalog } from "./ReactionCatalog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

describe("ReactionCatalog", () => {
  it("renders one mixed recent row with the more button last when compact", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onExpandedChange = vi.fn();

    await act(async () => {
      root.render(
        <ReactionCatalog
          expanded={false}
          onExpandedChange={onExpandedChange}
          onSelect={vi.fn()}
          recentValues={["Thanks", "😂", "OK"]}
          visibleRecentCount={3}
        />
      );
    });

    const common = container.querySelector('[data-im-reaction-section="common"]');
    expect(
      [...(common?.querySelectorAll<HTMLElement>("[data-im-reaction-value]") ?? [])].map(
        (item) => item.dataset.imReactionValue
      )
    ).toEqual(["Thanks", "😂", "OK"]);
    expect(common?.lastElementChild?.getAttribute("aria-label")).toBe("展开更多回复");
    expect(container.querySelectorAll("[data-im-reaction-heading]")).toHaveLength(0);

    await act(async () => {
      (common?.lastElementChild as HTMLButtonElement | null)?.click();
    });
    expect(onExpandedChange).toHaveBeenCalledWith(true);

    await act(async () => root.unmount());
  });

  it("renders common, judgement, and general sections in the approved order", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ReactionCatalog
          expanded
          onSelect={vi.fn()}
          recentValues={["Thanks", "😂", "OK"]}
        />
      );
    });

    expect(
      [...container.querySelectorAll("[data-im-reaction-heading]")].map((heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["常用表情", "判断表情", "一般表情"]);
    expect(
      [...container.querySelectorAll('[data-im-reaction-section="judgement"] img')].map(
        (image) => image.getAttribute("alt")
      )
    ).toEqual(["OK", "NO", "Pending", "+1", "Done", "Cool", "Good", "Thanks"]);
    expect(
      container.querySelector('[data-im-reaction-section="general"] [data-im-reaction-category="judgement"]')
    ).toBeNull();

    await act(async () => root.unmount());
  });

  it("keeps selected values enabled and natively disables only their occupied categories", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onSelect = vi.fn();

    await act(async () => {
      root.render(
        <ReactionCatalog
          expanded
          onSelect={onSelect}
          recentValues={["OK", "😂"]}
          selectedEmoji="😂"
          selectedJudgement="OK"
        />
      );
    });

    const buttons = [...container.querySelectorAll<HTMLButtonElement>("[data-im-reaction-value]")];
    expect(buttons.filter((button) => button.dataset.imReactionValue === "OK").every((button) => !button.disabled)).toBe(true);
    expect(buttons.filter((button) => button.dataset.imReactionValue === "😂").every((button) => !button.disabled)).toBe(true);
    expect(buttons.filter((button) => button.dataset.imReactionValue === "NO").every((button) => button.disabled)).toBe(true);
    expect(buttons.filter((button) => button.dataset.imReactionValue === "👍").every((button) => button.disabled)).toBe(true);

    await act(async () => {
      buttons.find((button) => button.dataset.imReactionValue === "NO")?.click();
      buttons.find((button) => button.dataset.imReactionValue === "OK")?.click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("OK");

    await act(async () => root.unmount());
  });
});
