import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode, type UIEventHandler } from "react";
import { cn } from "../../lib/utils";

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? Boolean(target.closest("button,a,input,textarea,select,label,[role='button'],[data-no-drag-scroll='true']"))
    : false;
}

export function HorizontalScrollArea({
  ariaLabel = "横向滚动内容",
  children,
  className,
  onScroll
}: {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  onScroll?: UIEventHandler<HTMLDivElement>;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);
  const draggedRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const scrollElement = scrollRef.current;

    if (scrollElement && pointerIdRef.current !== null && scrollElement.hasPointerCapture(pointerIdRef.current)) {
      scrollElement.releasePointerCapture(pointerIdRef.current);
    }

    pointerIdRef.current = null;
    setDragging(false);

    if (draggedRef.current) {
      window.setTimeout(() => {
        draggedRef.current = false;
      }, 0);
    }

    event.currentTarget.classList.remove("is-dragging");
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const scrollElement = scrollRef.current;

    if (
      event.button !== 0 ||
      !scrollElement ||
      isInteractiveTarget(event.target) ||
      scrollElement.scrollWidth <= scrollElement.clientWidth
    ) {
      return;
    }

    pointerIdRef.current = event.pointerId;
    startXRef.current = event.clientX;
    startScrollLeftRef.current = scrollElement.scrollLeft;
    draggedRef.current = false;
    setDragging(true);
    scrollElement.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("is-dragging");
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const scrollElement = scrollRef.current;

    if (!scrollElement || pointerIdRef.current !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - startXRef.current;

    if (Math.abs(deltaX) > 4) {
      draggedRef.current = true;
    }

    scrollElement.scrollLeft = startScrollLeftRef.current - deltaX;

    if (draggedRef.current) {
      event.preventDefault();
    }
  };

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!draggedRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      aria-label={ariaLabel}
      className={cn("horizontal-scroll-area overflow-x-auto", dragging && "is-dragging", className)}
      onClickCapture={handleClickCapture}
      onPointerCancel={finishDrag}
      onPointerDown={handlePointerDown}
      onPointerLeave={(event) => {
        if (pointerIdRef.current === event.pointerId) {
          finishDrag(event);
        }
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onScroll={onScroll}
      ref={scrollRef}
      role="region"
      tabIndex={0}
    >
      {children}
    </div>
  );
}
