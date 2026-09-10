import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";

export function TimelineBubbleDisclosure({ children, maxLines }: { children: ReactNode; maxLines: number }) {
  const { language } = useOptionalI18n();
  const id = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [maxHeight, setMaxHeight] = useState(maxLines * 20);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(content).lineHeight) || 20;
      const limit = lineHeight * maxLines;
      setMaxHeight(limit);
      setOverflowing(content.scrollHeight > limit + 0.5);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(content);
    return () => observer?.disconnect();
  }, [children, maxLines]);

  return <>
    <div id={id} className="contact-event-bubble-content overflow-hidden text-[13px] leading-5" style={{ maxHeight: expanded ? undefined : maxHeight }}>
      <div ref={contentRef} className="flow-root leading-5">{children}</div>
    </div>
    {overflowing ? <button type="button" aria-controls={id} aria-expanded={expanded}
      className="mt-2 rounded px-1 py-1 text-xs font-bold text-[color:var(--client-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
      onClick={() => setExpanded((value) => !value)}>{translateText(expanded ? "收起" : "展开", language)}</button> : null}
  </>;
}
