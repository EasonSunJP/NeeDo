import { isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { HorizontalScrollArea } from "./HorizontalScrollArea";
import { TableColumnHeader, type TableColumnHeaderApplyPayload, type TableSortDirection } from "./TableColumnHeader";

type DataTableSortState = {
  key: string;
  direction: TableSortDirection;
};

type DataTableFilters = Record<string, string[] | undefined>;
type DataTableSearch = Record<string, string | undefined>;
type DataValue = boolean | number | string | null | undefined;

export interface Column<T> {
  key: string;
  title: string;
  render: (row: T) => ReactNode;
  filterValue?: (row: T) => DataValue;
  sortValue?: (row: T) => DataValue;
  width?: string;
}

const dataTableCollator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base"
});

function nodeToText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(nodeToText).filter(Boolean).join(" ");
  }

  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode; label?: ReactNode; title?: ReactNode };

    return nodeToText(props.children ?? props.label ?? props.title ?? "");
  }

  return "";
}

function valueToLabel(value: DataValue) {
  if (value === null || value === undefined || value === "") {
    return "未设置";
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  return String(value);
}

function sortLabels(values: string[]) {
  return [...values].sort((left, right) => dataTableCollator.compare(left, right));
}

function compareDataValues(left: DataValue, right: DataValue, direction: TableSortDirection) {
  const multiplier = direction === "asc" ? 1 : -1;

  if (typeof left === "number" && typeof right === "number") {
    return (left - right) * multiplier;
  }

  return dataTableCollator.compare(valueToLabel(left), valueToLabel(right)) * multiplier;
}

export function DataTable<T>({
  rows,
  columns,
  footerActions,
  footerPlacement = "fixed",
  onView,
  pageSize = 8,
  showFooterActions = footerPlacement === "fixed"
}: {
  rows: T[];
  columns: Array<Column<T>>;
  footerActions?: ReactNode;
  footerPlacement?: "fixed" | "inline";
  onView?: (row: T) => void;
  pageSize?: number;
  showFooterActions?: boolean;
}) {
  const safePageSize = Math.max(1, pageSize);
  const desktopMinWidth = useMemo(
    () =>
      columns.reduce((sum, column) => {
        const numericWidth = column.width?.match(/^(\d+(?:\.\d+)?)px$/)?.[1];

        return sum + (numericWidth ? Number(numericWidth) : 156);
      }, onView ? 176 : 0),
    [columns, onView]
  );
  const shouldFitContainer = !onView && columns.length <= 3 && columns.every((column) => !column.width);
  const desktopTableMinWidth = shouldFitContainer ? "100%" : `max(100%, ${desktopMinWidth}px)`;
  const desktopCellClassName = shouldFitContainer ? "whitespace-normal break-words px-4 py-3 text-ink/80" : "whitespace-nowrap px-4 py-3 text-ink/80";
  const [currentPage, setCurrentPage] = useState(1);
  const [sortState, setSortState] = useState<DataTableSortState | null>(null);
  const [columnFilters, setColumnFilters] = useState<DataTableFilters>({});
  const [columnSearch, setColumnSearch] = useState<DataTableSearch>({});
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null);
  const getColumnLabel = (column: Column<T>, row: T) => valueToLabel(column.filterValue ? column.filterValue(row) : nodeToText(column.render(row)));
  const getColumnSortValue = (column: Column<T>, row: T) => column.sortValue?.(row) ?? column.filterValue?.(row) ?? getColumnLabel(column, row);
  const columnFilterOptions = useMemo(
    () =>
      columns.reduce(
        (options, column) => ({
          ...options,
          [column.key]: sortLabels(Array.from(new Set(rows.map((row) => getColumnLabel(column, row)))))
        }),
        {} as Record<string, string[]>
      ),
    [columns, rows]
  );
  const processedRows = useMemo(() => {
    const filteredRows = rows.filter((row) =>
      columns.every((column) => {
        const selectedValues = columnFilters[column.key];

        return !selectedValues || selectedValues.includes(getColumnLabel(column, row));
      })
    );

    if (!sortState) {
      return filteredRows;
    }

    const sortColumn = columns.find((column) => column.key === sortState.key);

    if (!sortColumn) {
      return filteredRows;
    }

    return filteredRows
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const result = compareDataValues(getColumnSortValue(sortColumn, left.row), getColumnSortValue(sortColumn, right.row), sortState.direction);

        return result || left.index - right.index;
      })
      .map(({ row }) => row);
  }, [columnFilters, columns, rows, sortState]);
  const totalPages = Math.max(1, Math.ceil(processedRows.length / safePageSize));
  const visibleRows = useMemo(() => {
    const start = (currentPage - 1) * safePageSize;

    return processedRows.slice(start, start + safePageSize);
  }, [currentPage, processedRows, safePageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [processedRows.length, safePageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!openFilterColumn) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenFilterColumn(null);
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLElement &&
        !target.closest(".needo-table-filter-popover") &&
        !target.closest(".needo-table-filter-trigger")
      ) {
        setOpenFilterColumn(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openFilterColumn]);

  const getSelectedColumnValues = (columnKey: string) => columnFilters[columnKey] ?? columnFilterOptions[columnKey] ?? [];

  const applyColumnFilter = (columnKey: string, values: string[]) => {
    const options = columnFilterOptions[columnKey] ?? [];
    const nextValues = sortLabels(Array.from(new Set(values.filter((value) => options.includes(value)))));

    setColumnFilters((current) => {
      const next = { ...current };

      if (options.length === 0 || nextValues.length === options.length) {
        delete next[columnKey];
      } else {
        next[columnKey] = nextValues;
      }

      return next;
    });
  };

  const toggleColumnFilterValue = (columnKey: string, value: string) => {
    const selectedValues = getSelectedColumnValues(columnKey);

    applyColumnFilter(
      columnKey,
      selectedValues.includes(value) ? selectedValues.filter((item) => item !== value) : [...selectedValues, value]
    );
  };

  const toggleColumnFilterOptions = (columnKey: string, visibleOptions: string[]) => {
    if (visibleOptions.length === 0) {
      return;
    }

    const selectedValues = getSelectedColumnValues(columnKey);
    const selectedSet = new Set(selectedValues);
    const allVisibleSelected = visibleOptions.every((option) => selectedSet.has(option));

    applyColumnFilter(
      columnKey,
      allVisibleSelected ? selectedValues.filter((value) => !visibleOptions.includes(value)) : Array.from(new Set([...selectedValues, ...visibleOptions]))
    );
  };

  const clearColumnFilter = (columnKey: string) => {
    setColumnFilters((current) => {
      const next = { ...current };

      delete next[columnKey];

      return next;
    });
    setColumnSearch((current) => ({ ...current, [columnKey]: "" }));
    setSortState((current) => (current?.key === columnKey ? null : current));
  };

  const applyColumnState = (columnKey: string, payload: TableColumnHeaderApplyPayload) => {
    setColumnSearch((current) => ({ ...current, [columnKey]: payload.searchValue }));
    applyColumnFilter(columnKey, payload.selectedValues);

    if (payload.sortDirection) {
      setSortState({ key: columnKey, direction: payload.sortDirection });
    }
  };
  const resolvedFooterActions =
    footerActions ??
    (showFooterActions ? (
      <>
        <Button className="w-full whitespace-nowrap sm:w-auto" variant="secondary" size="sm">
          批量操作
        </Button>
        <Button className="w-full whitespace-nowrap sm:w-auto" variant="secondary" size="sm">
          导出 CSV
        </Button>
        <Button className="w-full whitespace-nowrap sm:w-auto" variant="secondary" size="sm">
          导出 Excel
        </Button>
      </>
    ) : null);
  const footer = (
    <div className={`data-table-footer ${footerPlacement === "fixed" ? "is-fixed" : ""}`}>
      {resolvedFooterActions ? <div className="data-table-footer-actions">{resolvedFooterActions}</div> : null}
      <span className="data-table-footer-count">
        共 {processedRows.length} 条，第 {currentPage} / {totalPages} 页，本页 {visibleRows.length} 条
      </span>
      <div className="flex items-center gap-2">
        <Button disabled={currentPage <= 1} variant="secondary" size="sm" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
          上一页
        </Button>
        <span className="rounded-md bg-ink px-3 py-1 text-xs font-semibold text-white">{currentPage}</span>
        <Button disabled={currentPage >= totalPages} variant="secondary" size="sm" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>
          下一页
        </Button>
      </div>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">
      <div className="md:hidden">
        <div className="space-y-3 p-3">
          {visibleRows.map((row, index) => (
            <article
              className={`rounded-lg bg-paper p-3${onView ? " cursor-pointer transition hover:bg-white" : ""}`}
              key={`mobile-${(currentPage - 1) * safePageSize + index}`}
              onClick={onView ? () => onView(row) : undefined}
              onKeyDown={
                onView
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onView(row);
                      }
                    }
                  : undefined
              }
              tabIndex={onView ? 0 : undefined}
            >
              <div className="space-y-2.5">
                {columns.map((column) => (
                  <div className="flex items-start justify-between gap-3" key={column.key}>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/45">{column.title}</span>
                    <div className="min-w-0 flex-1 text-right text-sm text-ink/80">{column.render(row)}</div>
                  </div>
                ))}
              </div>
              {onView ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button size="sm" variant="secondary" onClick={(event) => {
                    event.stopPropagation();
                    onView(row);
                  }}>
                    查看
                  </Button>
                  <Button size="sm" variant="ghost" onClick={(event) => {
                    event.stopPropagation();
                    onView(row);
                  }}>
                    编辑
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>
      <HorizontalScrollArea ariaLabel="数据表横向滚动区域" className={`hidden md:block${shouldFitContainer ? " data-table-fit-scroll-area" : ""}`}>
        <table
          className={`table-sticky w-full min-w-full border-collapse text-left text-sm${shouldFitContainer ? " data-table-fit table-fixed" : ""}`}
          style={{ minWidth: desktopTableMinWidth }}
        >
          <thead className="bg-paper text-xs font-semibold uppercase text-ink/55">
            <tr>
              {columns.map((column, index) => (
                <TableColumnHeader
                  className="border-b border-line px-4 py-3"
                  filterOptions={columnFilterOptions[column.key] ?? []}
                  isOpen={openFilterColumn === column.key}
                  key={column.key}
                  popoverAlign={index >= columns.length - 2 ? "right" : "left"}
                  searchValue={columnSearch[column.key] ?? ""}
                  selectedValues={getSelectedColumnValues(column.key)}
                  sortDirection={sortState?.key === column.key ? sortState.direction : undefined}
                  style={{ width: column.width }}
                  title={column.title}
                  onApply={(payload) => applyColumnState(column.key, payload)}
                  onClearFilter={() => clearColumnFilter(column.key)}
                  onOpenChange={() => setOpenFilterColumn((current) => (current === column.key ? null : column.key))}
                  onSearchChange={(value) => setColumnSearch((current) => ({ ...current, [column.key]: value }))}
                  onSort={(direction) => setSortState({ key: column.key, direction })}
                  onToggleAll={(visibleOptions) => toggleColumnFilterOptions(column.key, visibleOptions)}
                  onToggleValue={(value) => toggleColumnFilterValue(column.key, value)}
                />
              ))}
              {onView && <th className="border-b border-line px-4 py-3">操作</th>}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr
                className={`border-b border-line last:border-b-0 hover:bg-paper/70${onView ? " cursor-pointer" : ""}`}
                key={(currentPage - 1) * safePageSize + index}
                onClick={onView ? () => onView(row) : undefined}
                onKeyDown={
                  onView
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onView(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onView ? 0 : undefined}
              >
                {columns.map((column) => (
                  <td className={desktopCellClassName} key={column.key}>
                    {column.render(row)}
                  </td>
                ))}
                {onView && (
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={(event) => {
                        event.stopPropagation();
                        onView(row);
                      }}>
                        查看
                      </Button>
                      <Button size="sm" variant="ghost" onClick={(event) => {
                        event.stopPropagation();
                        onView(row);
                      }}>
                        编辑
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </HorizontalScrollArea>
      {footerPlacement === "fixed" ? <div className="h-24" aria-hidden="true" /> : null}
      {footer}
    </div>
  );
}
