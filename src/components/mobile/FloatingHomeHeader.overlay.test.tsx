// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { FloatingHomeHeader, floatingHeaderGlassPanelClassName } from "./FloatingHomeHeader";
import { MemoryRouter } from "react-router-dom";
import { AppTopBar } from "../client-ui/AppScaffold";

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

it("anchors page alerts below the fixed app header without clipping or changing its panel", () => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    <MemoryRouter>
      <AppTopBar fixed title="申请店铺身份" overlay={<div role="alert">请完整填写银行账户资料</div>} />
    </MemoryRouter>
  );
  const alert = host.querySelector('[role="alert"]');
  const frame = alert?.closest(".client-floating-header-host");
  const panel = frame?.querySelector(".client-floating-header-glass-frame");
  expect(alert).not.toBeNull();
  expect(frame?.classList.contains("fixed")).toBe(true);
  expect(panel?.contains(alert!)).toBe(false);
  expect(panel!.compareDocumentPosition(alert!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
