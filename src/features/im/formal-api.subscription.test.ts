import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormalRealtimeEvent } from "../realtime/api";
import type { ImStoreUpdate } from "./model";

const mocked = vi.hoisted(() => ({
  onEvent: undefined as ((event: FormalRealtimeEvent) => void) | undefined,
  unsubscribe: vi.fn(),
}));

vi.mock("../realtime/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../realtime/api")>();
  return {
    ...actual,
    subscribeRealtimeEvents: vi.fn((options: { onEvent: (event: FormalRealtimeEvent) => void }) => {
      mocked.onEvent = options.onEvent;
      return mocked.unsubscribe;
    }),
  };
});

import { subscribeFormalImUpdates } from "./formal-api";

afterEach(() => {
  mocked.onEvent = undefined;
  mocked.unsubscribe.mockClear();
  vi.clearAllMocks();
});

describe("formal IM realtime subscription lifecycle", () => {
  it("catches up on every shared connection marker, including for a late subscriber", () => {
    const updates: ImStoreUpdate[] = [];
    const unsubscribe = subscribeFormalImUpdates((update) => updates.push(update));

    mocked.onEvent?.({ id: "connected-1", payload: {}, type: "connected" });
    expect(updates).toEqual([{ type: "reconnected" }]);

    mocked.onEvent?.({ id: "connected-2", payload: {}, type: "connected" });
    expect(updates).toEqual([{ type: "reconnected" }, { type: "reconnected" }]);

    unsubscribe();
    expect(mocked.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
