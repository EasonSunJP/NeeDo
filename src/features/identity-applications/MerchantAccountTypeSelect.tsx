import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import type { BankAccountInput } from "./api";

const options = [
  { value: "ordinary", label: "普通預金" },
  { value: "current", label: "当座預金" },
  { value: "savings", label: "貯蓄預金" },
  { value: "other", label: "その他" }
] as const;

export function MerchantAccountTypeSelect({ value, onChange }: {
  value: BankAccountInput["accountType"];
  onChange: (value: BankAccountInput["accountType"]) => void;
}) {
  const { language } = useI18n();
  const label = translateText("账户类型", language);
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  const [active, setActive] = useState(selected);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect) setAbove(window.innerHeight - rect.bottom < 224 && rect.top > 224);
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
  }, [open]);

  const choose = (index: number) => {
    onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  };

  return <div className="relative" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} ref={wrapper}>
    <button aria-activedescendant={open ? `${id}-${active}` : undefined} aria-controls={open ? id : undefined} aria-expanded={open} aria-haspopup="listbox" aria-label={label} className="flex min-h-12 w-full items-center justify-between rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-4 text-left text-[15px] font-semibold text-[color:var(--client-text)] outline-none focus:border-[color:var(--client-primary)]" onClick={() => { setActive(selected); setOpen(!open); }} onKeyDown={(event) => {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        setOpen(true);
        setActive(event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : !open ? selected : (active + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
      } else if (open && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        choose(active);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }} ref={trigger} role="combobox" type="button">
      <span data-no-i18n>{options[selected].label}</span>
      <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open ? <div aria-label={label} className={cn("absolute inset-x-0 z-[120] max-h-56 overflow-y-auto rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-1.5 shadow-xl", above ? "bottom-full mb-2" : "top-full mt-2")} data-no-i18n id={id} role="listbox">
      {options.map((option, index) => <button aria-selected={index === selected} className={cn("block min-h-11 w-full rounded-xl px-4 py-2 text-left text-[15px] font-semibold", index === active ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" : "text-[color:var(--client-text)]")} id={`${id}-${index}`} key={option.value} onClick={() => choose(index)} onPointerMove={() => setActive(index)} role="option" tabIndex={-1} type="button">{option.label}</button>)}
    </div> : null}
  </div>;
}
