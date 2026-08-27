// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { TestOnlyBackendPortalEntries } from "./TestOnlyBackendPortalEntries";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  container?.remove();
  container = null;
  root = null;
});

describe("TestOnlyBackendPortalEntries", () => {
  it("isolates the three temporary backend links and opens them in secure new tabs", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(TestOnlyBackendPortalEntries, { t: (source: string) => source }));
    });

    const links = Array.from(container.querySelectorAll("a"));

    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/store-admin.html#/login/merchant-admin",
      "/pf-admin.html#/login/admin",
      "/afirieito-admin.html#/NDA-admin"
    ]);
    expect(links.every((link) => link.getAttribute("target") === "_blank")).toBe(true);
    expect(
      links.every((link) => {
        const rel = new Set((link.getAttribute("rel") ?? "").split(/\s+/));
        return rel.has("noopener") && rel.has("noreferrer");
      })
    ).toBe(true);
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "进入后台：商户后台",
      "进入后台：运营后台",
      "进入后台：NDA管理后台"
    ]);
  });
});
