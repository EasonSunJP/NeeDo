import { cn } from "../../lib/utils";

export const mobileDetailCardClassName = "rounded-[28px] border border-line bg-white p-4 shadow-panel";
export const mobileDetailInnerCardClassName = "rounded-[18px] bg-paper p-3";

export function ServiceFlowSection({
  flow,
  className,
  title = "服务流程"
}: {
  flow: string[];
  className?: string;
  title?: string;
}) {
  if (flow.length === 0) {
    return null;
  }

  return (
    <section className={cn(mobileDetailCardClassName, className)}>
      <h2 className="font-black">{title}</h2>
      <div className="mt-3 space-y-2">
        {flow.map((step, index) => (
          <div className={cn(mobileDetailInnerCardClassName, "flex items-center gap-3")} key={`${step}-${index}`}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color:var(--client-primary)] text-xs font-black text-[color:var(--client-needo-text)] shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_28%,transparent)]">
              {index + 1}
            </span>
            <p className="min-w-0 flex-1 text-sm font-bold leading-6 text-ink/70">{step}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
