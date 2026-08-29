const IM_NEAR_BOTTOM_THRESHOLD_PX = 120;

type ObserveImLatestPositionOptions = {
  onVisibilityChange: (visible: boolean) => void;
  root: HTMLElement;
  target: HTMLElement;
};

export function observeImLatestPosition({
  onVisibilityChange,
  root,
  target
}: ObserveImLatestPositionOptions): () => void {
  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(
      ([entry]) => onVisibilityChange(Boolean(entry?.isIntersecting)),
      { root, threshold: 0.01 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }

  const update = () => {
    const remaining = root.scrollHeight - root.scrollTop - root.clientHeight;
    onVisibilityChange(remaining < IM_NEAR_BOTTOM_THRESHOLD_PX);
  };

  root.addEventListener("scroll", update, { passive: true });
  update();

  return () => root.removeEventListener("scroll", update);
}

export function getImReturnScrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}
