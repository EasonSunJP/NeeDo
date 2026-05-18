import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../auth/AuthProvider";
import { businessCpsDashboard, businessCpsPromoters } from "../../../features/business-cps/model";
import { cn, yen } from "../../../lib/utils";
import "../../../styles/cps/cpsSidebar.css";
import { CpsSidebarCollapseButton } from "./CpsSidebarCollapseButton";
import { CpsSidebarMenuItem } from "./CpsSidebarMenuItem";
import { CpsSidebarSubItem } from "./CpsSidebarSubItem";
import { cpsSidebarMenus, findCpsSidebarMenuByPath } from "./cpsSidebarMenus";

const collapsedStorageKey = "afirieito_sidebar_collapsed";
const expandedStorageKey = "afirieito_sidebar_expanded_keys";

function GearIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M11.2 4h1.6l.7 2.2c.5.1 1 .3 1.5.6l2-.9 1.1 1.1-1 2c.3.5.5 1 .6 1.5l2.2.7v1.6l-2.2.7c-.1.5-.3 1-.6 1.5l1 2-1.1 1.1-2-.9c-.5.3-1 .5-1.5.6l-.7 2.2h-1.6l-.7-2.2c-.5-.1-1-.3-1.5-.6l-2 .9L5.9 17l1-2c-.3-.5-.5-1-.6-1.5l-2.2-.7v-1.6l2.2-.7c.1-.5.3-1 .6-1.5l-1-2L7 5.9l2 .9c.5-.3 1-.5 1.5-.6L11.2 4Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M10 6H6.8A2.8 2.8 0 0 0 4 8.8v6.4A2.8 2.8 0 0 0 6.8 18H10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      <path d="M14 8.5 17.5 12 14 15.5M9 12h8.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
    </svg>
  );
}

function readExpandedKeys() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(expandedStorageKey) ?? "[]");

    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function getInitialCpsSidebarCollapsed() {
  if (typeof window === "undefined") {
    return false;
  }

  const stored = window.localStorage.getItem(collapsedStorageKey);

  if (stored === "true") {
    return true;
  }

  if (stored === "false") {
    return false;
  }

  return window.matchMedia("(max-width: 1180px)").matches;
}

export function writeCpsSidebarCollapsed(collapsed: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(collapsedStorageKey, collapsed ? "true" : "false");
}

export function CpsSidebar({
  collapsed,
  onCloseMobile,
  onCollapsedChange
}: {
  collapsed: boolean;
  onCloseMobile: () => void;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, session } = useAuth();
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const activeMatch = useMemo(() => findCpsSidebarMenuByPath(location.pathname), [location.pathname]);
  const activeMenuKey = activeMatch?.menu.key;
  const activePageKey = activeMatch?.page?.key;
  const routeParentKey = activeMatch?.parent?.key ?? null;
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
    const keys = new Set(readExpandedKeys());

    if (routeParentKey) {
      keys.add(routeParentKey);
    }

    if (!keys.size) {
      keys.add("analytics");
    }

    return keys;
  });

  useEffect(() => {
    if (!routeParentKey) {
      return;
    }

    setExpandedKeys((current) => {
      if (current.has(routeParentKey)) {
        return current;
      }

      const next = new Set(current);
      next.add(routeParentKey);
      return next;
    });
  }, [routeParentKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(expandedStorageKey, JSON.stringify([...expandedKeys]));
  }, [expandedKeys]);

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  const toggleMenu = (key: string) => {
    if (collapsed) {
      onCollapsedChange(false);
      setExpandedKeys((current) => new Set(current).add(key));
      return;
    }

    setExpandedKeys((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  };

  const handleLogout = () => {
    setAccountMenuOpen(false);
    onCloseMobile();
    logout();
    navigate("/login/afirieito?redirect=/NDA-admin", { replace: true });
  };

  return (
    <aside className={cn("cps-admin-sidebar admin-sidebar", collapsed && "is-collapsed")} aria-label="NDA管理后台导航">
      <div className="cps-sidebar-inner">
        <div className="cps-sidebar-brand-row" ref={accountMenuRef}>
          <Link className="cps-sidebar-brand" onClick={onCloseMobile} to="/NDA-admin/statistics" title="NDA管理后台">
            <span className="cps-sidebar-logo" aria-hidden="true">N</span>
            <span className="cps-sidebar-brand-copy">
              <span>NeeDoAfirieito</span>
              <strong>NDA管理后台</strong>
            </span>
          </Link>
          <button
            aria-expanded={accountMenuOpen}
            aria-label="账号设置"
            className="cps-sidebar-account-button"
            onClick={() => setAccountMenuOpen((current) => !current)}
            title="账号设置"
            type="button"
          >
            <GearIcon />
          </button>
          {accountMenuOpen ? (
            <div className="cps-sidebar-account-popover">
              <div className="cps-sidebar-account-header">
                <span>当前账号</span>
                <strong>{session?.email ?? "afirieito@needo.jp"}</strong>
              </div>
              <Link className="cps-sidebar-account-action" onClick={() => setAccountMenuOpen(false)} to="/NDA-admin/account">
                账户设置
              </Link>
              <button className="cps-sidebar-account-action is-danger" onClick={handleLogout} type="button">
                <LogoutIcon />
                <span>退出登录</span>
              </button>
            </div>
          ) : null}
        </div>

        <div className="cps-sidebar-status">
          <div>
            <span>推广者</span>
            <strong>{businessCpsPromoters.length}</strong>
          </div>
          <div>
            <span>佣金</span>
            <strong>{yen(businessCpsDashboard.commissionSpend)}</strong>
          </div>
        </div>

        <nav className="cps-sidebar-nav" aria-label="NDA管理后台菜单">
          {cpsSidebarMenus.map((item) => {
            const isExpanded = expandedKeys.has(item.key);
            const isActive = activeMenuKey === item.key;

            return (
              <div className="cps-sidebar-menu-group" key={item.key}>
                <CpsSidebarMenuItem
                  active={isActive}
                  collapsed={collapsed}
                  expanded={isExpanded}
                  item={item}
                  onLeafNavigate={onCloseMobile}
                  onToggle={() => toggleMenu(item.key)}
                />
                {item.children?.length ? (
                  <div className={cn("cps-sidebar-submenu", isExpanded && !collapsed && "is-expanded")}>
                    {item.children.map((child) => (
                      <CpsSidebarSubItem active={activePageKey === child.key} item={child} key={child.key} onNavigate={onCloseMobile} />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="cps-sidebar-footer">
          <div className="cps-sidebar-sync">
            <span>同步中</span>
            <strong>Afirieito 独立系统</strong>
          </div>
          <CpsSidebarCollapseButton collapsed={collapsed} onToggle={() => onCollapsedChange(!collapsed)} />
        </div>
      </div>
    </aside>
  );
}
