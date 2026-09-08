import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { Button } from "../ui/Button";

export const formalTimelinePageSizes = [10, 30, 50, 100] as const;
export type FormalTimelinePageSize = (typeof formalTimelinePageSizes)[number];

interface FormalTimelinePaginationProps {
  ariaLabel: string;
  page: number;
  pageSize: number;
  total: number;
  disabled?: boolean;
  pageSizes?: readonly FormalTimelinePageSize[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: FormalTimelinePageSize) => void;
}

export function FormalTimelinePagination({
  ariaLabel,
  disabled = false,
  pageSizes = formalTimelinePageSizes,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  total,
}: FormalTimelinePaginationProps) {
  const { language } = useOptionalI18n();
  const t = (source: string) => translateText(source, language);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return (
    <nav
      aria-label={t(ariaLabel)}
      style={{ background: "var(--admin-surface, #ffffff)", borderColor: "var(--admin-line, rgba(22,54,48,0.12))" }}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper/70 px-3 py-3"
    >
      <label className="flex items-center gap-2 text-xs font-black text-ink/55">
        <span>{t("每页")}</span>
        <select
          aria-label={t("每页条数")}
          className="h-9 rounded-xl border border-line bg-white px-3 text-sm font-black text-ink outline-none focus:border-moss"
          disabled={disabled}
          onChange={(event) =>
            onPageSizeChange(Number(event.target.value) as FormalTimelinePageSize)
          }
          value={pageSize}
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span>{t("条")}</span>
      </label>
      <div className="flex items-center gap-2">
        <span className="mr-1 text-xs font-black text-ink/50">
          {t("共")} {total} {t("条")} · {safePage}/{totalPages}
        </span>
        <Button
          disabled={disabled || safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          size="sm"
          variant="secondary"
        >
          {t("上一页")}
        </Button>
        <Button
          disabled={disabled || safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          size="sm"
          variant="secondary"
        >
          {t("下一页")}
        </Button>
      </div>
    </nav>
  );
}
