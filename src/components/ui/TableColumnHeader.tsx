import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";

export type TableSortDirection = "asc" | "desc";
export type TableColumnHeaderApplyPayload = {
  searchValue: string;
  selectedValues: string[];
  sortDirection?: TableSortDirection;
};

function normalizeSelectedValues(values: string[], filterOptions: string[]) {
  const availableValues = new Set(filterOptions);
  const selectedValues = new Set(values.filter((value) => availableValues.has(value)));

  return filterOptions.filter((option) => selectedValues.has(option));
}

function areSameSelectedValues(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function TableColumnHeader({
  align = "left",
  className,
  filterOptions,
  isOpen,
  popoverAlign = "left",
  searchValue,
  selectedValues,
  sortDirection,
  style,
  title,
  onClearFilter,
  onApply,
  onOpenChange,
  onSearchChange,
  onSort,
  onToggleAll,
  onToggleValue
}: {
  align?: "left" | "center";
  className?: string;
  filterOptions: string[];
  isOpen: boolean;
  popoverAlign?: "left" | "right";
  searchValue: string;
  selectedValues: string[];
  sortDirection?: TableSortDirection;
  style?: CSSProperties;
  title: string;
  onClearFilter: () => void;
  onApply: (payload: TableColumnHeaderApplyPayload) => void;
  onOpenChange: () => void;
  onSearchChange: (value: string) => void;
  onSort: (direction: TableSortDirection) => void;
  onToggleAll: (visibleOptions: string[]) => void;
  onToggleValue: (value: string) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; maxHeight: number; top: number } | null>(null);
  const [autoApply, setAutoApply] = useState(true);
  const [draftSearchValue, setDraftSearchValue] = useState(searchValue);
  const [draftSelectedValues, setDraftSelectedValues] = useState(selectedValues);
  const [draftSortDirection, setDraftSortDirection] = useState<TableSortDirection | undefined>(sortDirection);
  const selectedSet = useMemo(() => new Set(draftSelectedValues), [draftSelectedValues]);
  const normalizedSearch = draftSearchValue.trim().toLowerCase();
  const visibleOptions = useMemo(
    () => (normalizedSearch ? filterOptions.filter((option) => option.toLowerCase().includes(normalizedSearch)) : filterOptions),
    [filterOptions, normalizedSearch]
  );
  const selectedVisibleCount = visibleOptions.filter((option) => selectedSet.has(option)).length;
  const allVisibleSelected = visibleOptions.length > 0 && selectedVisibleCount === visibleOptions.length;
  const hasFilter = selectedValues.length !== filterOptions.length;
  const appliedSelectedValues = useMemo(() => normalizeSelectedValues(selectedValues, filterOptions), [filterOptions, selectedValues]);
  const normalizedDraftSelectedValues = useMemo(() => normalizeSelectedValues(draftSelectedValues, filterOptions), [draftSelectedValues, filterOptions]);
  const hasManualChanges =
    !autoApply &&
    (draftSearchValue !== searchValue ||
      draftSortDirection !== sortDirection ||
      !areSameSelectedValues(normalizedDraftSelectedValues, appliedSelectedValues));
  const updatePopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger || typeof window === "undefined") {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const popoverWidth = 292;
    const popoverGap = 8;
    const viewportGap = 8;
    const preferredLeft = popoverAlign === "right" ? rect.right - popoverWidth : rect.left;
    const left = Math.max(viewportGap, Math.min(preferredLeft, window.innerWidth - popoverWidth - viewportGap));
    const fixedFooter = document.querySelector(".data-table-footer.is-fixed") as HTMLElement | null;
    const footerRect = fixedFooter?.getBoundingClientRect();
    const bottomLimit = Math.max(160, Math.min(window.innerHeight - viewportGap, footerRect ? footerRect.top - viewportGap : window.innerHeight - viewportGap));
    const preferredMaxHeight = 420;
    const minimumComfortHeight = 220;
    const belowTop = rect.bottom + popoverGap;
    const belowSpace = bottomLimit - belowTop;
    const aboveSpace = rect.top - viewportGap - popoverGap;
    const opensBelow = belowSpace >= minimumComfortHeight || belowSpace >= aboveSpace;
    const maxHeight = Math.max(160, Math.min(preferredMaxHeight, opensBelow ? belowSpace : aboveSpace));
    const top = opensBelow ? Math.max(viewportGap, belowTop) : Math.max(viewportGap, rect.top - popoverGap - maxHeight);

    setPopoverPosition({ left, maxHeight, top });
  }, [popoverAlign]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePopoverPosition();
    }
  }, [isOpen, updatePopoverPosition]);

  useEffect(() => {
    if (!isOpen || autoApply) {
      setDraftSearchValue(searchValue);
      setDraftSelectedValues(selectedValues);
      setDraftSortDirection(sortDirection);
    }
  }, [autoApply, isOpen, searchValue, selectedValues, sortDirection]);

  useEffect(() => {
    if (isOpen) {
      setDraftSearchValue(searchValue);
      setDraftSelectedValues(selectedValues);
      setDraftSortDirection(sortDirection);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, updatePopoverPosition]);

  const commitDraftState = useCallback(
    (nextState?: Partial<TableColumnHeaderApplyPayload>) => {
      onApply({
        searchValue: nextState?.searchValue ?? draftSearchValue,
        selectedValues: normalizeSelectedValues(nextState?.selectedValues ?? draftSelectedValues, filterOptions),
        sortDirection: nextState?.sortDirection ?? draftSortDirection
      });
    },
    [draftSearchValue, draftSelectedValues, draftSortDirection, filterOptions, onApply]
  );

  const handleSearchChange = (value: string) => {
    setDraftSearchValue(value);

    if (autoApply) {
      onSearchChange(value);
    }
  };

  const handleSort = (direction: TableSortDirection) => {
    setDraftSortDirection(direction);

    if (autoApply) {
      onSort(direction);
    }
  };

  const handleToggleValue = (value: string) => {
    const nextValues = selectedSet.has(value) ? draftSelectedValues.filter((item) => item !== value) : [...draftSelectedValues, value];

    setDraftSelectedValues(normalizeSelectedValues(nextValues, filterOptions));

    if (autoApply) {
      onToggleValue(value);
    }
  };

  const handleToggleAll = () => {
    if (visibleOptions.length === 0) {
      return;
    }

    const nextValues = allVisibleSelected
      ? draftSelectedValues.filter((value) => !visibleOptions.includes(value))
      : Array.from(new Set([...draftSelectedValues, ...visibleOptions]));

    setDraftSelectedValues(normalizeSelectedValues(nextValues, filterOptions));

    if (autoApply) {
      onToggleAll(visibleOptions);
    }
  };

  const handleClearFilter = () => {
    setDraftSearchValue("");
    setDraftSelectedValues(filterOptions);
    onClearFilter();
  };

  const handleAutoApplyChange = (checked: boolean) => {
    setAutoApply(checked);

    if (checked) {
      commitDraftState();
    }
  };

  const portalContainer =
    typeof document !== "undefined"
      ? (triggerRef.current?.closest(".admin-shell, .client-shell") as HTMLElement | null) ?? document.body
      : null;

  const popover = isOpen ? (
    <div
      className={cn("needo-table-filter-popover", popoverAlign === "right" && "is-right", "is-floating")}
      data-no-drag-scroll="true"
      onClick={(event) => event.stopPropagation()}
      style={{
        left: popoverPosition?.left ?? -9999,
        maxHeight: popoverPosition?.maxHeight ?? 420,
        position: "fixed",
        top: popoverPosition?.top ?? -9999,
        width: 292
      }}
    >
      <div className="space-y-2">
        <p className="text-xs font-black text-ink/65">排序</p>
        <div className="grid grid-cols-2 gap-2">
          <button className={cn("needo-table-filter-sort-button", draftSortDirection === "asc" && "is-active")} onClick={() => handleSort("asc")} type="button">
            A→Z 升序
          </button>
          <button className={cn("needo-table-filter-sort-button", draftSortDirection === "desc" && "is-active")} onClick={() => handleSort("desc")} type="button">
            Z→A 降序
          </button>
        </div>
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <p className="text-xs font-black text-ink/65">筛选器</p>
        <label className="needo-table-filter-search mt-2">
          <span className="text-ink/45">⌕</span>
          <input
            className="min-w-0 flex-1 bg-transparent text-xs font-bold text-ink outline-none placeholder:text-ink/35"
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="搜索"
            value={draftSearchValue}
          />
        </label>
        <div className="needo-table-filter-option-list mt-2">
          <label className="needo-table-filter-option">
            <input checked={allVisibleSelected} disabled={visibleOptions.length === 0} onChange={handleToggleAll} type="checkbox" />
            <span>（全选）</span>
            <span className="ml-auto text-ink/35">{selectedVisibleCount}/{visibleOptions.length}</span>
          </label>
          {visibleOptions.map((option) => (
            <label className="needo-table-filter-option" key={option}>
              <input checked={selectedSet.has(option)} onChange={() => handleToggleValue(option)} type="checkbox" />
              <span className="min-w-0 truncate">{option}</span>
            </label>
          ))}
          {visibleOptions.length === 0 ? <div className="px-2 py-4 text-center text-xs font-bold text-ink/45">无匹配选项</div> : null}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-ink/60">
            <input checked={autoApply} onChange={(event) => handleAutoApplyChange(event.target.checked)} type="checkbox" />
            自动应用
          </label>
          <div className="flex items-center gap-2">
            {!autoApply ? (
              <button className="needo-table-filter-apply" disabled={!hasManualChanges} onClick={() => commitDraftState()} type="button">
                应用
              </button>
            ) : null}
            <button className="needo-table-filter-clear" onClick={handleClearFilter} type="button">
              清除筛选
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <th className={cn(className, "needo-table-filter-header relative")} data-align={align} data-no-drag-scroll="true" style={style}>
      <div className="needo-table-filter-header-inner">
        <span className="needo-table-filter-title">{title}</span>
        <button
          aria-expanded={isOpen}
          aria-label={`${title} 排列筛选`}
          className={cn("needo-table-filter-trigger", (hasFilter || sortDirection) && "is-active")}
          ref={triggerRef}
          onClick={(event) => {
            event.stopPropagation();
            onOpenChange();
          }}
          type="button"
        >
          <span className={cn("needo-table-filter-sort-glyph", sortDirection === "asc" && "is-asc", sortDirection === "desc" && "is-desc")}>↕</span>
          <span className="needo-table-filter-caret">▾</span>
        </button>
      </div>
      {popover && portalContainer ? createPortal(popover, portalContainer) : null}
    </th>
  );
}
