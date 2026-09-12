// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import { useCoreReadQuery } from "./hooks";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ load }: { load: () => Promise<{ title: string }> }) {
  const query = useCoreReadQuery(load, [load], { key: "cards:test" });
  return <output>{query.loading ? "loading" : query.data?.title ?? query.error}</output>;
}

function RefreshingProbe({ load, revision }: { load: () => Promise<{ bookings: number }>; revision: number }) {
  const query = useCoreReadQuery(load, [load, revision], {
    force: revision > 0,
    key: "merchant:home:store-7",
    scope: "account:9"
  });
  return <output>{query.loading ? "loading" : query.data?.bookings ?? query.error}</output>;
}

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
    }
  }
  throw lastError;
}

describe("useCoreReadQuery persistent cache", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    await persistentResourceCache.clearScope("public");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps cached information cards visible across route remounts", async () => {
    const load = vi.fn(async () => ({ title: "cached card" }));
    await act(async () => root.render(<Probe load={load} />));
    await waitFor(() => expect(container.textContent).toBe("cached card"));

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<Probe load={load} />));

    expect(container.textContent).toBe("cached card");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("settles the merchant home query when realtime revisions repeat during its initial request", async () => {
    let resolveServer!: (value: { bookings: number }) => void;
    const server = new Promise<{ bookings: number }>((resolve) => {
      resolveServer = resolve;
    });
    const load = vi.fn(() => server);

    await act(async () => root.render(<RefreshingProbe load={load} revision={1} />));
    await act(async () => root.render(<RefreshingProbe load={load} revision={2} />));
    await act(async () => root.render(<RefreshingProbe load={load} revision={3} />));
    await waitFor(() => expect(load).toHaveBeenCalled());

    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => resolveServer({ bookings: 5 }));
    await waitFor(() => expect(container.textContent).toBe("5"));
  });
});
