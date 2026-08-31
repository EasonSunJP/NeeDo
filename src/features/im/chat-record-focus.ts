export function restoreImChatRecordFocus(
  openerId?: string,
  options: { maxFrames?: number } = {},
) {
  const maxFrames = options.maxFrames ?? 24;
  let frame = 0;
  let frameCount = 0;
  let stopped = false;

  const observer = new MutationObserver(() => attempt());
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
  const findTarget = () => openerId
    ? document.getElementById(openerId)
    : document.querySelector<HTMLElement>("main h1, h1, main");
  const attempt = () => {
    if (stopped) return;
    const target = findTarget();
    if (target) {
      if (!openerId && target.tabIndex < 0) target.tabIndex = -1;
      target.focus();
      cleanup();
      return;
    }
    frameCount += 1;
    if (frameCount >= maxFrames) {
      cleanup();
      return;
    }
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; attempt(); });
  };

  observer.observe(document.body, { childList: true, subtree: true });
  frame = requestAnimationFrame(() => { frame = 0; attempt(); });
  return cleanup;
}
