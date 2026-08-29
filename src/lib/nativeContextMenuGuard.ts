export function installNativeContextMenuGuard(
  target: Document | HTMLElement = document,
) {
  const preventNativeContextMenu = (event: Event) => {
    event.preventDefault();
  };

  target.addEventListener("contextmenu", preventNativeContextMenu);

  return () => {
    target.removeEventListener("contextmenu", preventNativeContextMenu);
  };
}
