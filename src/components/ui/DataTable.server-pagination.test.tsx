// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DataTable } from "./DataTable";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

describe("DataTable server pagination mode", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders the supplied server page without local pagination, filtering, or sorting controls", async () => {
    const rows = [{ id: 1, name: "B" }, { id: 2, name: "A" }];

    await act(async () => {
      root.render(
        <DataTable
          columns={[
            { key: "id", title: "ID", render: (row) => row.id },
            { key: "name", title: "名称", render: (row) => row.name }
          ]}
          pageSize={1}
          paginationMode="server"
          rows={rows}
        />
      );
    });

    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(container.querySelector('[aria-label="ID 排序与筛选"]')).toBeNull();
    expect(container.querySelector('[aria-label="名称 排序与筛选"]')).toBeNull();
    expect(container.querySelector(".data-table-footer")).toBeNull();
  });

  it("preserves the existing client pagination and column controls by default", async () => {
    await act(async () => {
      root.render(
        <DataTable
          columns={[{ key: "name", title: "名称", render: (row) => row.name }]}
          pageSize={1}
          rows={[{ name: "B" }, { name: "A" }]}
        />
      );
    });

    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(container.querySelector('[aria-label="名称 排序与筛选"]')).not.toBeNull();
    expect(container.querySelector(".data-table-footer")).not.toBeNull();
  });
});
