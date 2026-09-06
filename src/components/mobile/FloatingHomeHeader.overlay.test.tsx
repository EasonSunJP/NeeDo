// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { FloatingHomeHeader, floatingHeaderGlassPanelClassName } from "./FloatingHomeHeader";

it("keeps the expanded search menu outside the clipped glass panel", () => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    <FloatingHomeHeader panelClassName={floatingHeaderGlassPanelClassName} overlay={<div data-search-menu="true">tags</div>}>
      <button>all</button>
    </FloatingHomeHeader>
  );
  const menu = host.querySelector("[data-search-menu]");
  expect(menu).not.toBeNull();
  expect(menu?.closest(".overflow-hidden")).toBeNull();
  expect(menu?.closest(".client-floating-header-host")).not.toBeNull();
});
