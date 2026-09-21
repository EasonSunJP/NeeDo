// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { workStatusApi, type WorkStatusSnapshot } from "./api";
import { useWorkStatus } from "./hooks";
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  workStatusApi: { snapshot: vi.fn() },
}));
vi.mock("./refresh", () => ({ subscribeWorkStatusRefresh: () => () => {} }));
it("preserves newer server versions across delayed PATCH and GET responses", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const base: WorkStatusSnapshot = {
    technicianProfileId: 1,
    status: "on_duty",
    version: 4,
    syncedAt: null,
    currentShop: null,
    month: { lateCount: 1, earlyLeaveCount: 0, from: "", to: "" },
  };
  vi.mocked(workStatusApi.snapshot).mockResolvedValue(base);
  let hook!: ReturnType<typeof useWorkStatus>;
  function Probe() {
    hook = useWorkStatus({ scope: "technician" });
    return <span>{hook.snapshot?.version}</span>;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Probe />));
    await act(async () =>
      hook.accept({ ...base, version: 3, status: "resting" }),
    );
    expect(container.textContent).toBe("4");
    let finish!: (value: WorkStatusSnapshot) => void;
    vi.mocked(workStatusApi.snapshot).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let reload!: Promise<void>;
    await act(async () => {
      reload = hook.reload();
    });
    await act(async () =>
      hook.accept({ ...base, version: 5, status: "off_duty" }),
    );
    await act(async () => {
      finish({ ...base, version: 6 });
      await reload;
    });
    expect(container.textContent).toBe("6");
  } finally {
    await act(async () => root.unmount());
  }
});
