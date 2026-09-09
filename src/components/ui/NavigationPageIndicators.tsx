import { cn } from "../../lib/utils";

export function NavigationPageIndicators({
  activePage,
  ariaLabel,
  className,
  getPageLabel,
  onSelectPage,
  pageCount,
}: {
  activePage: number;
  ariaLabel: string;
  className?: string;
  getPageLabel: (pageNumber: number) => string;
  onSelectPage: (pageIndex: number) => void;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label={ariaLabel}
      className={cn("flex items-center justify-center gap-2", className)}
      data-navigation-page-indicators="true"
    >
      {Array.from({ length: pageCount }, (_, index) => {
        const selected = activePage === index;

        return (
          <button
            aria-current={selected ? "page" : undefined}
            aria-label={getPageLabel(index + 1)}
            className={cn(
              "focus-ring h-1.5 rounded-full border transition-[width,background-color,border-color]",
              selected
                ? "w-5 border-transparent bg-[color:var(--client-primary,#baff43)] shadow-[0_0_8px_color-mix(in_srgb,var(--client-primary,#baff43)_45%,transparent)]"
                : "w-1.5 shadow-[0_0_6px_rgba(0,0,0,0.18)]",
            )}
            data-navigation-page-index={index}
            data-navigation-page-indicator="true"
            data-navigation-page-state={selected ? "active" : "inactive"}
            key={`navigation-page-indicator-${index}`}
            onClick={() => onSelectPage(index)}
            style={selected ? undefined : {
              backgroundColor: "color-mix(in srgb, var(--client-text, #172033) 38%, transparent)",
              borderColor: "color-mix(in srgb, var(--client-text, #172033) 58%, transparent)",
            }}
            type="button"
          />
        );
      })}
    </nav>
  );
}
