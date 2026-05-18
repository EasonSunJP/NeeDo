import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { cn } from "../../lib/utils";
import { merchantPrimaryModules, type MerchantPrimaryModule } from "./merchantModules";

function chunkModules(modules: MerchantPrimaryModule[], size: number) {
  const chunks: MerchantPrimaryModule[][] = [];

  for (let index = 0; index < modules.length; index += size) {
    chunks.push(modules.slice(index, index + size));
  }

  return chunks;
}

function MerchantPrimaryIcon({ icon }: { icon: MerchantPrimaryModule["icon"] }) {
  if (icon === "calendar") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <rect height="15" rx="3" stroke="currentColor" strokeWidth="1.9" width="16" x="4" y="5" />
        <path d="M8 3.5v4M16 3.5v4M4 9.5h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (icon === "shield") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M12 4.2c2.1 1.7 4.6 2.5 7.2 2.5v4.6c0 4.4-2.7 7.3-7.2 8.9-4.5-1.6-7.2-4.5-7.2-8.9V6.7c2.6 0 5.1-.8 7.2-2.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="m9.2 12.2 2 2 3.8-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (icon === "heart") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M12 19.2s-6.8-4.3-8.6-8.3C2 7.8 4 5.2 7 5.2c1.8 0 3.2.8 5 2.9 1.8-2.1 3.2-2.9 5-2.9 3 0 5 2.6 3.6 5.7-1.8 4-8.6 8.3-8.6 8.3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "order") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M8 4.5h8M8 8h8M7 3h10a2 2 0 0 1 2 2v14l-3.5-2-3.5 2-3.5-2-3.5 2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (icon === "menu") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.1" />
      </svg>
    );
  }

  if (icon === "floor") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M4.5 7.5h6v5h-6v-5ZM13.5 5h6v7.5h-6V5ZM4.5 15h6v4h-6v-4ZM13.5 15h6v4h-6v-4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="m12 4 1.1 3.4L16.5 8l-3.4 1.1L12 12.5l-1.1-3.4L7.5 8l3.4-1.1L12 4ZM18.5 14l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1ZM6 14l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7L6 14Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

export function MerchantPrimaryNavCarousel({
  activeModule,
  className,
  modules = merchantPrimaryModules
}: {
  activeModule?: MerchantPrimaryModule["key"];
  className?: string;
  modules?: MerchantPrimaryModule[];
}) {
  const { canAccessFeature } = useAuth();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState(0);
  const visibleModules = useMemo(
    () => modules.filter((module) => !module.permission || canAccessFeature("merchant", module.permission)),
    [canAccessFeature, modules]
  );
  const pages = useMemo(() => chunkModules(visibleModules, 4), [visibleModules]);

  return (
    <section className={cn("rounded-[28px] border border-line bg-white p-3 shadow-panel", className)}>
      <div
        className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain md:grid md:grid-cols-7 md:gap-2 md:overflow-visible"
        data-scroll-drag-ignore="true"
        onScroll={() => {
          const viewport = viewportRef.current;

          if (!viewport || pages.length <= 1) {
            return;
          }

          const nextPage = Math.round(viewport.scrollLeft / Math.max(1, viewport.clientWidth));
          setActivePage(Math.min(Math.max(nextPage, 0), pages.length - 1));
        }}
        ref={viewportRef}
      >
        {pages.map((page, pageIndex) => (
          <div className="grid min-w-full snap-start grid-cols-4 gap-2 md:contents" key={`merchant-primary-page-${pageIndex}`}>
            {page.map((module) => (
              <Link
                className={cn(
                  "grid min-h-[82px] grid-rows-[34px,1fr] items-start justify-items-center gap-1.5 rounded-[18px] border px-2 py-3 text-center transition",
                  activeModule === module.key
                    ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]"
                    : "border-line bg-white text-[color:var(--client-text)] hover:border-[color:var(--client-primary)]"
                )}
                key={module.key}
                to={module.route}
              >
                <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[13px] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]">
                  <MerchantPrimaryIcon icon={module.icon} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-black leading-4">{module.labelZh}</span>
                  <span className="mt-1 hidden truncate text-[10px] font-bold text-ink/38 sm:block">{module.labelJa}</span>
                </span>
              </Link>
            ))}
            {page.length < 4 ? (
              Array.from({ length: 4 - page.length }).map((_, index) => (
                <div
                  aria-hidden="true"
                  className="min-h-[82px] rounded-[18px] border border-dashed border-line bg-paper/50 md:hidden"
                  key={`merchant-primary-empty-${pageIndex}-${index}`}
                />
              ))
            ) : null}
          </div>
        ))}
      </div>
      {pages.length > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-2 md:hidden">
          {pages.map((_, index) => (
            <button
              aria-label={`切换到第 ${index + 1} 页`}
              className={cn("h-1.5 rounded-full transition", activePage === index ? "w-5 bg-[color:var(--client-primary)]" : "w-1.5 bg-ink/18")}
              key={`merchant-primary-dot-${index}`}
              onClick={() => {
                const viewport = viewportRef.current;
                viewport?.scrollTo({ left: viewport.clientWidth * index, behavior: "smooth" });
                setActivePage(index);
              }}
              type="button"
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
