/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { IM_JUDGEMENT_REPLIES } from "./reaction-policy";
import { ImReactionValue, JudgementReactionIcon } from "./JudgementReactionIcon";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

describe("JudgementReactionIcon", () => {
  it.each(IM_JUDGEMENT_REPLIES)("renders the dedicated %s SVG", async (value) => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<JudgementReactionIcon value={value} />);
    });

    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toMatch(/(?:\.svg|^data:image\/svg\+xml)/);
    expect(image?.getAttribute("alt")).toBe(value);
    expect(image?.className).toContain("max-h-[26px]");
    expect(container.innerHTML).not.toContain("bg-black");

    await act(async () => root.unmount());
  });

  it("uses SVG for judgement values and literal Unicode for ordinary emoji", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <>
          <ImReactionValue value="Thanks" />
          <ImReactionValue value="😂" />
        </>
      );
    });

    expect(container.querySelector("img")?.getAttribute("alt")).toBe("Thanks");
    expect(container.textContent).toContain("😂");

    await act(async () => root.unmount());
  });
});
