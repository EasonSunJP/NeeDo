/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FavoriteTimelineRow } from "./FavoriteTimelineRow";
import type { UnifiedFavoriteItem } from "./model";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item: UnifiedFavoriteItem = {
  key: "shop:shop0000000001",
  type: "shop",
  itemKey: "shop:shop0000000001",
  title: "StagingTest",
  summary: "东京店铺",
  imageUrl: null,
  detailPath: "/stores/shop0000000001",
  favoritedAt: "2026-09-20T10:00:00.000Z",
  activityAt: "2026-09-20T10:00:00.000Z",
  pinnedAt: null,
  reaction: null,
  canForward: true,
  canDelete: true,
};

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("FavoriteTimelineRow", () => {
  it("uses the shared swipe actions and chat action sheet", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(
      <MemoryRouter>
        <FavoriteTimelineRow
          busy={false}
          item={item}
          language="zh"
          onDelete={vi.fn()}
          onForward={vi.fn()}
          onMultiSelect={vi.fn()}
          onPin={vi.fn()}
          onReact={vi.fn()}
        />
      </MemoryRouter>,
    ));

    expect(container.querySelector('[data-swipe-action-key="pin"]')?.textContent).toContain("置顶");
    expect(container.querySelector('[data-swipe-action-key="delete"]')?.textContent).toContain("删除");

    const row = container.querySelector<HTMLElement>('[data-favorite-row="shop:shop0000000001"]')!;
    await act(async () => {
      row.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 20, clientY: 20 }));
      vi.advanceTimersByTime(380);
    });
    expect(document.body.textContent).toContain("信息置顶");
    expect(document.body.textContent).toContain("多选");
    await act(async () => root.unmount());
  });
});
