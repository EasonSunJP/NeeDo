import { Link } from "react-router-dom";
import { cn } from "../../../lib/utils";
import type { CpsSidebarPage } from "./cpsSidebarMenus";

export function CpsSidebarSubItem({
  active,
  item,
  onNavigate
}: {
  active: boolean;
  item: CpsSidebarPage;
  onNavigate: () => void;
}) {
  return (
    <Link className={cn("cps-sidebar-sub-item", active && "is-active")} onClick={onNavigate} to={item.path}>
      <span className="cps-sidebar-sub-dot" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
