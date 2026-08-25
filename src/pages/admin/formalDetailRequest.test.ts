import { describe, expect, it } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import {
  createFormalDetailRequestCoordinator,
  runFormalDetailMutationSequence
} from "./formalDetailRequest";

type Deferred<T> = {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function requestHarness() {
  const pending = new Map<number, Deferred<string>>();
  const events: string[] = [];
  const coordinator = createFormalDetailRequestCoordinator<string>({
    onError: (error, id) => events.push(`error:${id}:${error instanceof Error ? error.message : String(error)}`),
    onFinally: (id) => events.push(`finally:${id}`),
    onStart: (id) => events.push(`start:${id}`),
    onSuccess: (detail, id) => events.push(`success:${id}:${detail}`),
    request: (id) => {
      const request = deferred<string>();
      pending.set(id, request);
      return request.promise;
    }
  });
  return { coordinator, events, pending };
}

describe("formal detail request coordinator", () => {
  it("applies only the latest selected detail when A resolves after B", async () => {
    const { coordinator, events, pending } = requestHarness();

    const loadA = coordinator.load(1);
    const loadB = coordinator.load(2);
    pending.get(2)?.resolve("detail-B");
    await loadB;
    pending.get(1)?.resolve("detail-A");
    await loadA;

    expect(events).toEqual(["start:1", "start:2", "success:2:detail-B", "finally:2"]);
    expect(coordinator.getSelectedId()).toBe(2);
  });

  it("blocks success, error, and finally writes after close invalidation or disposal", async () => {
    const invalidated = requestHarness();
    const invalidatedLoad = invalidated.coordinator.load(11);
    invalidated.coordinator.invalidate();
    invalidated.pending.get(11)?.resolve("late-success");
    await invalidatedLoad;
    expect(invalidated.events).toEqual(["start:11"]);
    expect(invalidated.coordinator.getSelectedId()).toBeNull();

    const disposed = requestHarness();
    const disposedLoad = disposed.coordinator.load(12);
    disposed.coordinator.dispose();
    disposed.pending.get(12)?.reject(new Error("late-error"));
    await disposedLoad;
    expect(disposed.events).toEqual(["start:12"]);
    expect(disposed.coordinator.getSelectedId()).toBeNull();
  });

  it("can reactivate after an effect cleanup without reviving the disposed request", async () => {
    const { coordinator, events, pending } = requestHarness();
    const disposedLoad = coordinator.load(21);
    coordinator.dispose();
    coordinator.activate();
    const activeLoad = coordinator.load(22);

    pending.get(21)?.resolve("disposed-detail");
    pending.get(22)?.resolve("active-detail");
    await Promise.all([disposedLoad, activeLoad]);

    expect(events).toEqual(["start:21", "start:22", "success:22:active-detail", "finally:22"]);
    expect(coordinator.getSelectedId()).toBe(22);
  });

  it.each([403, 404])("keeps selection after %s and retries the same ID without fallback", async (status) => {
    const requestedIds: number[] = [];
    const states: string[] = [];
    let attempt = 0;
    const coordinator = createFormalDetailRequestCoordinator<string>({
      onError: (error) => states.push(`error:${error instanceof Error ? error.message : String(error)}`),
      onFinally: () => states.push("finally"),
      onStart: () => states.push("start"),
      onSuccess: (detail) => states.push(`success:${detail}`),
      request: async (id) => {
        requestedIds.push(id);
        attempt += 1;
        if (attempt === 1) throw new ApiClientError(`backend-${status}`, status, status);
        return "formal-detail";
      }
    });

    await coordinator.load(44);
    expect(coordinator.getSelectedId()).toBe(44);
    expect(states).toEqual(["start", `error:backend-${status}`, "finally"]);

    await coordinator.retry();
    expect(requestedIds).toEqual([44, 44]);
    expect(coordinator.getSelectedId()).toBe(44);
    expect(states).toEqual(["start", `error:backend-${status}`, "finally", "start", "success:formal-detail", "finally"]);
  });

  it("starts by clearing old detail and error while keeping the ID-driven drawer selected on failure", async () => {
    const request = deferred<string>();
    const state: { detail: string | null; error: string; loading: boolean; selectedId: number | null } = {
      detail: "old-detail",
      error: "old-error",
      loading: false,
      selectedId: 71
    };
    const coordinator = createFormalDetailRequestCoordinator<string>({
      onError: (error) => { state.error = error instanceof Error ? error.message : String(error); },
      onFinally: () => { state.loading = false; },
      onStart: () => { state.detail = null; state.error = ""; state.loading = true; },
      onSuccess: (detail) => { state.detail = detail; },
      request: () => request.promise
    });

    const load = coordinator.load(71);
    expect(state).toEqual({ detail: null, error: "", loading: true, selectedId: 71 });
    request.reject(new ApiClientError("backend-forbidden", 403, 403));
    await load;

    expect(state).toEqual({ detail: null, error: "backend-forbidden", loading: false, selectedId: 71 });
    expect(coordinator.getSelectedId()).toBe(71);
  });
});

describe("formal detail mutation sequence", () => {
  it("refreshes the list before the still-current detail after a successful write", async () => {
    const order: string[] = [];
    await runFormalDetailMutationSequence({
      isDetailCurrent: () => true,
      mutate: async () => { order.push("mutation"); },
      refreshDetail: async () => { order.push("detail"); },
      refreshList: async () => { order.push("list"); }
    });
    expect(order).toEqual(["mutation", "list", "detail"]);
  });

  it("does not refresh or clear page-owned draft and selection after a failed write", async () => {
    const state = { draft: "edited-name", selectedId: 91 };
    const order: string[] = [];
    await expect(runFormalDetailMutationSequence({
      isDetailCurrent: () => true,
      mutate: async () => { order.push("mutation"); throw new Error("write-failed"); },
      refreshDetail: async () => { order.push("detail"); },
      refreshList: async () => { order.push("list"); }
    })).rejects.toThrow("write-failed");
    expect(order).toEqual(["mutation"]);
    expect(state).toEqual({ draft: "edited-name", selectedId: 91 });
  });
});
