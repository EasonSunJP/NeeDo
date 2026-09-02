/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { entityEngagementApi, type EntityFavoriteState } from "../../features/entity-engagement/api";
import { EntitySearchCardActions, formatEntityEngagementCount } from "./EntitySearchCardActions";

const target = { targetType: "technician" as const, publicId: "s0000000021" };

describe("EntitySearchCardActions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await act(async () => root.unmount());
    container.remove();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("formats the exact compact count rule without a 99k cap", () => {
    expect(formatEntityEngagementCount(0)).toBe("0");
    expect(formatEntityEngagementCount(999)).toBe("999");
    expect(formatEntityEngagementCount(1_000)).toBe("1k");
    expect(formatEntityEngagementCount(1_999)).toBe("1k");
    expect(formatEntityEngagementCount(100_000)).toBe("100k");
  });

  it("optimistically toggles favorite, serializes rapid clicks, and accepts the server result", async () => {
    let resolveFavorite: ((state: EntityFavoriteState) => void) | undefined;
    const request = new Promise<EntityFavoriteState>((resolve) => {
      resolveFavorite = resolve;
    });
    const setFavorite = vi.spyOn(entityEngagementApi, "setFavorite").mockReturnValue(request);
    const onFavoriteChange = vi.fn();

    await act(async () => {
      root.render(
        <EntitySearchCardActions
          favoriteCount={154}
          isFavorited={false}
          onFavoriteChange={onFavoriteChange}
          onSystemShare={vi.fn(async () => undefined)}
          publicId={target.publicId}
          shareCount={8}
          targetLabel="技师 Mika"
          targetType={target.targetType}
        />
      );
    });

    const favorite = container.querySelector<HTMLButtonElement>('button[aria-label="收藏 技师 Mika"]');
    expect(favorite).not.toBeNull();

    await act(async () => {
      favorite?.click();
      favorite?.click();
    });

    expect(setFavorite).toHaveBeenCalledTimes(1);
    expect(onFavoriteChange).toHaveBeenCalledWith({
      ...target,
      favoriteCount: 155,
      isFavorited: true
    });
    expect(favorite?.disabled).toBe(true);

    await act(async () => {
      resolveFavorite?.({ ...target, favoriteCount: 160, isFavorited: true });
      await request;
    });

    expect(onFavoriteChange).toHaveBeenLastCalledWith({
      ...target,
      favoriteCount: 160,
      isFavorited: true
    });
  });

  it("rolls an optimistic favorite failure back and isolates action clicks from the card", async () => {
    vi.spyOn(entityEngagementApi, "setFavorite").mockRejectedValue(new Error("error.network"));
    const onFavoriteChange = vi.fn();
    const onCardClick = vi.fn();

    await act(async () => {
      root.render(
        <div onClick={onCardClick}>
          <EntitySearchCardActions
            favoriteCount={7}
            isFavorited={false}
            onFavoriteChange={onFavoriteChange}
            onSystemShare={vi.fn(async () => undefined)}
            publicId={target.publicId}
            shareCount={2}
            targetLabel="技师 Mika"
            targetType={target.targetType}
          />
        </div>
      );
    });

    const favorite = container.querySelector<HTMLButtonElement>('button[aria-label="收藏 技师 Mika"]');
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    await act(async () => {
      favorite?.dispatchEvent(event);
      await Promise.resolve();
    });

    expect(event.defaultPrevented).toBe(true);
    expect(onCardClick).not.toHaveBeenCalled();
    expect(onFavoriteChange).toHaveBeenNthCalledWith(1, {
      ...target,
      favoriteCount: 8,
      isFavorited: true
    });
    expect(onFavoriteChange).toHaveBeenNthCalledWith(2, {
      ...target,
      favoriteCount: 7,
      isFavorited: false
    });
  });

  it("serializes the system-share operation and exposes compact authoritative counts", async () => {
    let resolveShare: (() => void) | undefined;
    const request = new Promise<void>((resolve) => {
      resolveShare = resolve;
    });
    const onSystemShare = vi.fn(() => request);

    await act(async () => {
      root.render(
        <EntitySearchCardActions
          favoriteCount={1_999}
          isFavorited
          onFavoriteChange={vi.fn()}
          onSystemShare={onSystemShare}
          publicId="shop0000000217"
          shareCount={100_000}
          targetLabel="店铺 LifeDance"
          targetType="shop"
        />
      );
    });

    const unfavorite = container.querySelector<HTMLButtonElement>('button[aria-label="取消收藏 店铺 LifeDance"]');
    const share = container.querySelector<HTMLButtonElement>('button[aria-label="分享 店铺 LifeDance"]');
    expect(unfavorite?.textContent).toContain("1k");
    expect(share?.textContent).toContain("100k");

    await act(async () => {
      share?.click();
      share?.click();
    });

    expect(onSystemShare).toHaveBeenCalledTimes(1);
    expect(share?.disabled).toBe(true);

    await act(async () => {
      resolveShare?.();
      await request;
    });
  });
});
