import { cn } from "../../../lib/utils";

export function CpsSidebarCollapseButton({
  collapsed,
  onToggle
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button className="cps-sidebar-collapse-button" onClick={onToggle} title={collapsed ? "展开侧边栏" : "收起侧边栏"} type="button">
      <svg aria-hidden="true" className={cn("cps-sidebar-collapse-icon", collapsed && "is-collapsed")} fill="none" viewBox="0 0 24 24">
        <path d="M5 6h14M5 12h14M5 18h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <path d="m14 9-3 3 3 3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
      <span className="cps-sidebar-collapse-label">{collapsed ? "展开菜单" : "收起菜单"}</span>
    </button>
  );
}
