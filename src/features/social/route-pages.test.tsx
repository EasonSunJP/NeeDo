/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialComposerPage, SocialLegacyReplyRedirectPage } from "./route-pages";

const fullComposerRender = vi.hoisted(() => vi.fn());

vi.mock("./pages/SocialComposerPage", () => ({
  SocialComposerPage: () => {
    fullComposerRender();
    return <div>full composer</div>;
  }
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function LocationProbe() {
  const location = useLocation();
  return <output data-pathname={location.pathname} data-state={JSON.stringify(location.state)} />;
}

afterEach(() => {
  document.body.replaceChildren();
  fullComposerRender.mockClear();
});

async function renderRoute(initialEntry: string, routePath: string, page: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={page} path={routePath} />
          <Route element={<LocationProbe />} path="*" />
        </Routes>
      </MemoryRouter>
    );
    await Promise.resolve();
  });

  return { container, root };
}

describe("Social reply compatibility routes", () => {
  it("redirects the historical compose query before the lazy full composer renders", async () => {
    const { container, root } = await renderRoute(
      "/moments/compose?replyToPostId=700",
      "/moments/compose",
      <SocialComposerPage />
    );

    const probe = container.querySelector("output");
    expect(probe?.getAttribute("data-pathname")).toBe("/moments/posts/700");
    expect(JSON.parse(probe?.getAttribute("data-state") ?? "null")).toEqual({ focusSocialReply: true });
    expect(fullComposerRender).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("redirects the historical replies path to the canonical post detail route", async () => {
    const { container, root } = await renderRoute(
      "/technician/moments/posts/701/replies",
      "/technician/moments/posts/:postId/replies",
      <SocialLegacyReplyRedirectPage />
    );

    const probe = container.querySelector("output");
    expect(probe?.getAttribute("data-pathname")).toBe("/technician/moments/posts/701");
    expect(JSON.parse(probe?.getAttribute("data-state") ?? "null")).toEqual({ focusSocialReply: true });
    expect(fullComposerRender).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
