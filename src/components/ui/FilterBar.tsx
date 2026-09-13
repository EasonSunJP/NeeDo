import { Button } from "./Button";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterDefinition {
  label: string;
  options: FilterOption[];
  value?: string;
  onChange?: (value: string) => void;
}

export function FilterBar({
  searchPlaceholder = "搜索订单、客户、门店",
  filters = [],
  actions = false,
  searchLabel = searchPlaceholder,
  searchValue,
  onSearchChange,
  onSearchSubmit
}: {
  searchPlaceholder?: string;
  filters?: FilterDefinition[];
  actions?: boolean;
  searchLabel?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: () => void;
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-3 shadow-panel">
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex h-10 items-center gap-2 rounded-lg border border-line bg-paper px-3 text-sm">
            {onSearchSubmit ? (
              <button aria-label="提交搜索" className="text-ink/45" onClick={onSearchSubmit} type="button">⌕</button>
            ) : (
              <span className="text-ink/45">⌕</span>
            )}
            <input
              aria-label={searchLabel}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink/40"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(event) => onSearchChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSearchSubmit?.();
                }
              }}
            />
          </div>
          {filters.slice(0, 3).map((filter) => (
            <select
              aria-label={filter.label}
              className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none"
              key={filter.label}
              value={filter.value}
              onChange={(event) => filter.onChange?.(event.target.value)}
            >
              <option value="">{filter.label}</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ))}
        </div>
        {actions && (
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end 2xl:shrink-0">
            <Button className="w-full whitespace-nowrap sm:w-auto" variant="secondary" size="sm">
              批量操作
            </Button>
            <Button className="w-full whitespace-nowrap sm:w-auto" variant="secondary" size="sm">
              导出 CSV
            </Button>
            <Button className="w-full whitespace-nowrap sm:w-auto" variant="secondary" size="sm">
              导出 Excel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
