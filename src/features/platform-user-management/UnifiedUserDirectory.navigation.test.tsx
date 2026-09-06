// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { UnifiedUserDirectory } from "./UnifiedUserDirectory";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const listUsers = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({ platformUserManagementApi: { listUsers } }));
vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "zh" }),
}));
vi.mock("./UnifiedUserTable", () => ({
  UnifiedUserTable: ({ onSelect }: { onSelect(id: number): void }) => (
    <button onClick={() => onSelect(41)}>Loaded user row</button>
  ),
}));
function Screen() {
  const [params, setParams] = useSearchParams();
  const change = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  return (
    <>
      <UnifiedUserDirectory
        scope="operations"
        onSelect={(id) => change("detailUserId", String(id))}
      />
      <button onClick={() => change("detailUserId")}>Close drawer</button>
      <button onClick={() => change("page", "3")}>Change list page</button>
    </>
  );
}
const container = document.createElement("div");
const root = createRoot(container);
afterEach(async () => {
  await act(async () => root.render(null));
  vi.clearAllMocks();
});
it("keeps the loaded table mounted and does not refetch on drawer open/close, while list pagination still fetches", async () => {
  listUsers.mockResolvedValue({
    list: [{ id: 41 }],
    total: 80,
    page: 2,
    page_size: 20,
  });
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/admin/users?page=2&city=Tokyo"]}>
        <Screen />
      </MemoryRouter>,
    ),
  );
  const row = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === "Loaded user row",
  )!;
  expect(listUsers).toHaveBeenCalledTimes(1);
  const searchInput = container.querySelector<HTMLInputElement>('input[placeholder]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(searchInput, "unsaved search");
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => row.click());
  expect(searchInput.value).toBe("unsaved search");
  expect(listUsers).toHaveBeenCalledTimes(1);
  expect(container.contains(row)).toBe(true);
  await act(async () =>
    Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent === "Close drawer")!
      .click(),
  );
  expect(listUsers).toHaveBeenCalledTimes(1);
  expect(container.contains(row)).toBe(true);
  await act(async () =>
    Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent === "Change list page")!
      .click(),
  );
  expect(listUsers).toHaveBeenCalledTimes(2);
  expect(listUsers).toHaveBeenLastCalledWith(
    "operations",
    expect.objectContaining({ page: 3, city: "Tokyo" }),
  );
});
