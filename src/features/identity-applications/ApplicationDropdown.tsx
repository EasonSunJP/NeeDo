import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../../lib/utils";

export function ApplicationDropdown({ label, value, onChange, options, placeholder = "", maxVisibleOptions = 10 }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
  maxVisibleOptions?: number;
}) {
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [menuHeight, setMenuHeight] = useState(maxVisibleOptions * 44 + 14);
  const list = useRef<HTMLDivElement>(null);
  const selected = options.findIndex(option => option.value === value);
  const [active, setActive] = useState(Math.max(0, selected));

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = rect.width / (trigger.current?.offsetWidth || rect.width || 1);
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const desired = Math.min(maxVisibleOptions, options.length) * 44 + 14;
      const belowSpace = (bottom - rect.bottom - 16) / scale;
      const aboveSpace = (rect.top - top - 16) / scale;
      const flip = belowSpace < desired && aboveSpace > belowSpace;
      setAbove(flip);
      setMenuHeight(Math.max(58, Math.min(desired, flip ? aboveSpace : belowSpace)));
    };
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false);
    };
    reposition();
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, maxVisibleOptions, options.length]);

  useEffect(() => {
    const panel = list.current;
    const option = panel?.children[active] as HTMLElement | undefined;
    if (!open || !panel || !option) return;
    const top = option.offsetTop;
    if (top < panel.scrollTop) panel.scrollTop = top;
    else if (top + option.offsetHeight > panel.scrollTop + panel.clientHeight) panel.scrollTop = top + option.offsetHeight - panel.clientHeight;
  }, [open, active]);

  const choose = (index: number) => {
    onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  };

  return <div className={cn("relative", open && "z-[125]")} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} ref={wrapper}>
    <button aria-activedescendant={open ? `${id}-${active}` : undefined} aria-controls={open ? id : undefined} aria-expanded={open} aria-haspopup="listbox" aria-label={label} className="flex min-h-12 w-full items-center justify-between rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-4 text-left text-[15px] font-semibold text-[color:var(--client-text)] outline-none focus:border-[color:var(--client-primary)]" onClick={() => { setActive(Math.max(0, selected)); setOpen(!open); }} onKeyDown={(event) => {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        setOpen(true);
        setActive(event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : !open ? Math.max(0, selected) : (active + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
      } else if (open && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        choose(active);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }} ref={trigger} role="combobox" type="button">
      <span data-no-i18n>{options[selected]?.label ?? placeholder}</span>
      <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open ? <div aria-label={label} className={cn("absolute inset-x-0 z-[120] overflow-y-auto overscroll-contain touch-pan-y rounded-[18px] border border-[color:var(--client-line)] p-1.5 shadow-xl", above ? "bottom-full mb-2" : "top-full mt-2")} data-no-i18n id={id} ref={list} role="listbox" style={{ maxHeight: menuHeight, backgroundColor: "var(--client-bg, #ffffff)", backgroundImage: "linear-gradient(var(--client-surface), var(--client-surface))", scrollbarGutter: "stable" }}>
      {options.map((option, index) => <button aria-selected={index === selected} className={cn("block h-11 w-full shrink-0 truncate rounded-xl px-4 py-2 text-left text-[15px] font-semibold", index === active ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" : "text-[color:var(--client-text)]")} data-value={option.value} id={`${id}-${index}`} key={option.value} onClick={() => choose(index)} onPointerMove={(event) => { if (event.pointerType !== "touch") setActive(index); }} role="option" tabIndex={-1} type="button">{option.label}</button>)}
    </div> : null}
  </div>;
}
