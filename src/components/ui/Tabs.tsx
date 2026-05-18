import { cn } from "../../lib/utils";

export function Tabs({
  items,
  active,
  onChange
}: {
  items: string[];
  active: string;
  onChange: (item: string) => void;
}) {
  return (
    <div className="scrollbar-none flex gap-2 overflow-x-auto">
      {items.map((item) => (
        <button
          className={cn(
            "focus-ring h-9 shrink-0 rounded-lg border px-3 text-sm font-semibold transition",
            item === active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/65 hover:text-ink"
          )}
          key={item}
          onClick={() => onChange(item)}
          type="button"
        >
          {item}
        </button>
      ))}
    </div>
  );
}
