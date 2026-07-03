import {
  useEffect,
  useRef,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { ImRoleType } from "../../features/im/model";
import { useImStore } from "../../features/im/store";
import { useSocial } from "../../features/social/context";
import type { SocialPortalScope } from "../../features/social/types";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import { getClientThemeClassName, useClientTheme, type ClientTheme } from "../../theme/ClientThemeProvider";
import { NotificationBadge } from "../ui/NotificationBadge";
import { ClientEdgeMask } from "./ClientEdgeMask";
import { MobileNavIcon } from "./MobileNavIcon";
import { merchantNavItems, technicianNavItems, userNavItems } from "./navItems";
import { SpecialBlackFlatIcon, type SpecialBlackFlatIconName } from "./SpecialBlackIcon";

export interface MobileNavItem {
  label: string;
  to: string;
  icon: string;
  featured?: boolean;
  end?: boolean;
  notificationCount?: number;
}

type PageDragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollTop: number;
  scrollTarget: Element;
  captureTarget: HTMLElement;
  captured: boolean;
};

type ClientPortalRole = ImRoleType & SocialPortalScope;

type NavigationNotificationCounts = {
  contacts: number;
  messages: number;
  moments: number;
};

function getClientPortalRole(pathname: string): ClientPortalRole {
  if (pathname === "/merchant" || pathname.startsWith("/merchant/") || pathname === "/shop" || pathname.startsWith("/shop/")) {
    return "merchant";
  }

  if (pathname === "/technician" || pathname.startsWith("/technician/")) {
    return "technician";
  }

  return "user";
}

function getRolePathPrefix(role: ClientPortalRole) {
  return role === "user" ? "" : `/${role}`;
}

function normalizeNavPath(path: string) {
  return path.split(/[?#]/)[0] ?? path;
}

function normalizeNotificationCount(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value ?? 0));
}

function getNavItemNotificationCount(
  item: MobileNavItem,
  role: ClientPortalRole,
  counts: NavigationNotificationCounts
) {
  const explicitCount = normalizeNotificationCount(item.notificationCount);

  if (explicitCount > 0) {
    return explicitCount;
  }

  const path = normalizeNavPath(item.to);
  const prefix = getRolePathPrefix(role);

  if (path === `${prefix}/moments`) {
    return counts.moments;
  }

  if (path === `${prefix}/messages`) {
    return counts.messages;
  }

  if (path === `${prefix}/contacts`) {
    return counts.contacts;
  }

  return 0;
}

function getNavAriaLabel(label: string, notificationCount: number) {
  return notificationCount > 0 ? `${label}，${notificationCount} 条新提醒` : label;
}

function getSpecialBlackNavIconName(icon: string): SpecialBlackFlatIconName {
  if (icon === "home") {
    return "home";
  }

  if (icon === "needo") {
    return "plus-circle";
  }

  if (icon === "message") {
    return "chat";
  }

  if (icon === "contacts" || icon === "me" || icon === "customers") {
    return "contacts";
  }

  if (icon === "schedule" || icon === "booking") {
    return "calendar";
  }

  if (icon === "store" || icon === "categories") {
    return "store";
  }

  if (icon === "staff") {
    return "technician";
  }

  if (icon === "orders" || icon === "tasks" || icon === "jobs") {
    return "feed";
  }

  if (icon === "moments") {
    return "feed";
  }

  return "feed";
}

function getSpecialBlackNavLabel(item: MobileNavItem) {
  return item.label;
}

function NeedoFeaturedNavButton({ className }: { className?: string }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn("client-featured-nav-image", className)}
      draggable={false}
      src="/icons/needo-green-button-light.png"
    />
  );
}

function shouldIgnorePageDrag(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return true;
  }

  return Boolean(
    target.closest(
      "input, select, textarea, option, nav, [contenteditable='true'], [data-page-drag-ignore='true'], [data-scroll-drag-ignore='true']"
    )
  );
}

function resolveVerticalScrollTarget(target: EventTarget | null) {
  let element = target instanceof HTMLElement ? target : null;

  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    const canScroll = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;

    if (canScroll) {
      return element;
    }

    element = element.parentElement;
  }

  return document.scrollingElement ?? document.documentElement;
}

function getDefaultNavItems(pathname: string) {
  if (pathname.startsWith("/merchant-admin") || pathname.startsWith("/admin")) {
    return [];
  }

  if (pathname.startsWith("/merchant") || pathname.startsWith("/shop")) {
    return merchantNavItems;
  }

  if (pathname.startsWith("/technician")) {
    return technicianNavItems;
  }

  return userNavItems;
}

const liquidGlassBottomEdgeMaskStyle = {
  "--client-edge-mask-bottom-mid-opacity": "0.18",
  "--client-edge-mask-bottom-mid-stop": "40%",
  "--client-edge-mask-bottom-strong-opacity": "0.34",
  "--client-edge-mask-bottom-strong-stop": "78%",
  "--client-edge-mask-bottom-end-opacity": "0.44"
} as CSSProperties;
const darkLiquidGlassNavThemes = new Set<ClientTheme>(["dark-green", "black-gold", "vital-mono", "cool-black-gray", "special-black", "neon-pink"]);

export function MobileShell({
  children,
  dark = false,
  navItems,
  className,
  navPanelStyle = "default",
  showBottomNav = true,
  showTopEdgeMask = true
}: {
  children: ReactNode;
  dark?: boolean;
  navItems?: MobileNavItem[];
  className?: string;
  navPanelStyle?: "default" | "plain";
  showBottomNav?: boolean;
  showTopEdgeMask?: boolean;
}) {
  const location = useLocation();
  const { isNight, theme } = useClientTheme();
  const { language } = useI18n();
  const bottomEdgeMaskStyle = {
    ...liquidGlassBottomEdgeMaskStyle,
    ...(isNight || darkLiquidGlassNavThemes.has(theme) ? { "--client-edge-mask-rgb": "0 0 0" } : null)
  } as CSSProperties;
  const portalRole = getClientPortalRole(location.pathname);
  const imStore = useImStore(portalRole);
  const social = useSocial();
  const resolvedNavItems = navItems ?? getDefaultNavItems(location.pathname);
  const isSpecialBlack = theme === "special-black";
  const displayedNavItems = showBottomNav ? resolvedNavItems : [];
  const featuredItem = displayedNavItems.find((item) => item.featured);
  const normalItems = displayedNavItems.filter((item) => !item.featured);
  const splitIndex = featuredItem ? Math.floor(normalItems.length / 2) : normalItems.length;
  const pageDragSessionRef = useRef<PageDragSession | null>(null);
  const suppressClickUntilRef = useRef(0);
  const originalUserSelectRef = useRef<string | null>(null);
  const visibleItems = featuredItem
    ? [...normalItems.slice(0, splitIndex), null, ...normalItems.slice(splitIndex)]
    : normalItems;
  const socialActorKey = social.getActorForScope(portalRole);
  const navNotificationCounts: NavigationNotificationCounts = {
    contacts: imStore.friendRequests.filter((request) => request.status === "pending").length,
    messages: imStore.conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
    moments: social.getUnreadNotificationCount(socialActorKey)
  };
  const featuredItemNotificationCount = featuredItem
    ? getNavItemNotificationCount(featuredItem, portalRole, navNotificationCounts)
    : 0;

  useEffect(() => {
    return () => {
      if (originalUserSelectRef.current !== null) {
        document.body.style.userSelect = originalUserSelectRef.current;
        originalUserSelectRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let frame = 0;

    const resetHorizontalScroll = () => {
      const scrollingElement = document.scrollingElement ?? document.documentElement;
      const hasHorizontalOffset = window.scrollX !== 0 || scrollingElement.scrollLeft !== 0 || document.body.scrollLeft !== 0;

      if (!hasHorizontalOffset) {
        return;
      }

      scrollingElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
      window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
    };

    const scheduleReset = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        resetHorizontalScroll();
      });
    };

    resetHorizontalScroll();
    window.addEventListener("scroll", scheduleReset, { passive: true });
    window.addEventListener("resize", scheduleReset);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      window.removeEventListener("scroll", scheduleReset);
      window.removeEventListener("resize", scheduleReset);
    };
  }, [location.hash, location.pathname, location.search]);

  const restorePageDragStyles = () => {
    if (originalUserSelectRef.current === null) {
      return;
    }

    document.body.style.userSelect = originalUserSelectRef.current;
    originalUserSelectRef.current = null;
  };

  const stopPageDrag = (pointerId: number) => {
    const dragSession = pageDragSessionRef.current;

    if (!dragSession || dragSession.pointerId !== pointerId) {
      return;
    }

    try {
      dragSession.captureTarget.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture is best-effort; some browser targets cannot release it.
    }

    if (dragSession.captured) {
      suppressClickUntilRef.current = Date.now() + 180;
    }

    restorePageDragStyles();
    pageDragSessionRef.current = null;
  };

  const handlePagePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || shouldIgnorePageDrag(event.target)) {
      return;
    }

    const scrollTarget = resolveVerticalScrollTarget(event.target);

    pageDragSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollTop: scrollTarget.scrollTop,
      scrollTarget,
      captureTarget: event.currentTarget,
      captured: false
    };
  };

  const handlePagePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const dragSession = pageDragSessionRef.current;

    if (!dragSession || dragSession.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragSession.startX;
    const deltaY = event.clientY - dragSession.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!dragSession.captured) {
      if (absX > absY && absX > 8) {
        pageDragSessionRef.current = null;
        return;
      }

      if (absY <= 8) {
        return;
      }

      try {
        dragSession.captureTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort; scrolling still works without it.
      }

      dragSession.captured = true;
      originalUserSelectRef.current = document.body.style.userSelect;
      document.body.style.userSelect = "none";
    }

    dragSession.scrollTarget.scrollTop = dragSession.startScrollTop - deltaY;
    event.preventDefault();
  };

  const handlePagePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    stopPageDrag(event.pointerId);
  };

  const handlePagePointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    stopPageDrag(event.pointerId);
  };

  const handlePageClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (suppressClickUntilRef.current <= Date.now()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const handlePageDragStartCapture = (event: ReactDragEvent<HTMLElement>) => {
    if (!pageDragSessionRef.current) {
      return;
    }

    event.preventDefault();
  };

  return (
    <div
      className={cn(
        "client-shell min-h-[100dvh] w-full max-w-full overflow-x-hidden [overflow-x:clip]",
        showBottomNav && "safe-shell-bottom",
        isNight ? "client-theme-night bg-ink text-white" : "client-theme-day bg-paper text-ink",
        getClientThemeClassName(theme),
        className
      )}
    >
      <main
        className="safe-main-top mx-auto min-h-[100dvh] w-full max-w-full overflow-x-hidden [container-type:inline-size] [overflow-x:clip] min-[1601px]:max-w-[1600px]"
        onClickCapture={handlePageClickCapture}
        onDragStartCapture={handlePageDragStartCapture}
        onPointerCancel={handlePagePointerCancel}
        onPointerDown={handlePagePointerDown}
        onPointerMove={handlePagePointerMove}
        onPointerUp={handlePagePointerUp}
      >
        {children}
      </main>
      {displayedNavItems.length > 0 && !isSpecialBlack ? (
        <>
          {showTopEdgeMask ? <ClientEdgeMask edge="top" /> : null}
          <ClientEdgeMask edge="bottom" style={bottomEdgeMaskStyle} />
        </>
      ) : null}
      {displayedNavItems.length > 0 && isSpecialBlack ? (
        <nav
          className="safe-nav-bottom special-black-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-[120] mx-auto w-full px-0 pb-0 pt-0"
          style={{ maxWidth: "var(--client-bottom-nav-max-width, 430px)" }}
        >
          <div className="special-black-bottom-nav-panel pointer-events-auto relative mx-auto h-[124px] overflow-visible px-2 pt-[48px]">
            <span aria-hidden="true" className="special-black-bottom-nav-backplate absolute inset-x-[-2px] bottom-0 h-[112px]" />
            <span aria-hidden="true" className="special-black-bottom-nav-center-glow absolute left-1/2 top-[-18px] h-[112px] w-[150px] -translate-x-1/2" />
            <img
              alt=""
              aria-hidden="true"
              className="special-black-bottom-nav-dock absolute inset-x-0 bottom-0 h-[112px] w-full select-none object-fill"
              draggable={false}
              src="/icons/special-black/nav-dock.png"
            />
            {featuredItem ? (
              <NavLink
                aria-label={getNavAriaLabel(featuredItem.label, featuredItemNotificationCount)}
                className="focus-ring special-black-featured-nav-link absolute left-1/2 top-[-18px] z-20 flex h-[88px] w-[88px] -translate-x-1/2 items-center justify-center rounded-full"
                to={featuredItem.to}
              >
                <NeedoFeaturedNavButton className="special-black-featured-nav-image h-[88px] w-[88px]" />
                {featuredItemNotificationCount > 0 ? (
                  <span className="special-black-bottom-nav-badge absolute right-[7px] top-[8px] grid h-[20px] min-w-[20px] place-items-center rounded-full px-1 text-center text-[11px] font-black leading-none text-white">
                    {featuredItemNotificationCount}
                  </span>
                ) : null}
              </NavLink>
            ) : null}
            <div
              className="relative z-10 grid h-full items-start gap-1 px-1"
              style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}
            >
              {visibleItems.map((item, index) => {
                if (!item) {
                  return <span aria-hidden="true" className="min-h-[70px]" key={`special-black-space-${index}`} />;
                }

                const notificationCount = getNavItemNotificationCount(item, portalRole, navNotificationCounts);
                const label = translateText(getSpecialBlackNavLabel(item), language);

                return (
                  <NavLink
                    aria-label={getNavAriaLabel(label, notificationCount)}
                    className={({ isActive }) =>
                      cn(
                        "focus-ring special-black-bottom-nav-item relative flex min-h-[70px] flex-col items-center justify-start gap-[7px] rounded-[18px] pt-[4px] text-center transition",
                        isActive
                          ? "special-black-bottom-nav-item-active opacity-100"
                          : "opacity-78 hover:opacity-92"
                      )
                    }
                    end={item.end ?? (item.to === "/" || item.to === "/merchant" || item.to === "/technician")}
                    key={item.to}
                    to={item.to}
                  >
                    {({ isActive }) => (
                      <>
                        <SpecialBlackFlatIcon
                          className={cn(
                            "special-black-bottom-nav-flat-icon h-[30px] w-[30px] transition",
                            item.icon === "home" && "h-[34px] w-[34px]",
                            item.icon === "moments" && "h-[31px] w-[31px]",
                            item.icon === "contacts" && "h-[31px] w-[31px]",
                            isActive ? "special-black-bottom-nav-flat-icon-active scale-105" : "scale-100"
                          )}
                          name={getSpecialBlackNavIconName(item.icon)}
                        />
                        <span className="special-black-bottom-nav-label max-w-full truncate text-[11px] font-black leading-none">
                          {label}
                        </span>
                        {notificationCount > 0 ? (
                          <span className="special-black-bottom-nav-badge absolute right-[15px] top-[0px] grid h-[20px] min-w-[20px] place-items-center rounded-full px-1 text-center text-[11px] font-black leading-none text-white">
                            {notificationCount > 99 ? "99+" : notificationCount}
                          </span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        </nav>
      ) : null}
      {displayedNavItems.length > 0 && !isSpecialBlack ? (
        <nav
          className={cn(
            "safe-nav-bottom client-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-[100] mx-auto w-full pt-2",
            "border-t border-transparent bg-transparent text-[color:var(--client-text)] shadow-none"
          )}
          style={{
            maxWidth: "var(--client-bottom-nav-max-width, 880px)",
            paddingLeft: "var(--client-bottom-nav-inline-gap, 12px)",
            paddingRight: "var(--client-bottom-nav-inline-gap, 12px)"
          }}
        >
          {featuredItem && (
            <NavLink
              aria-label={getNavAriaLabel(featuredItem.label, featuredItemNotificationCount)}
              className={() =>
                cn(
                  "client-featured-nav focus-ring pointer-events-auto absolute -top-8 left-1/2 z-20 flex h-[88px] w-[88px] -translate-x-1/2 items-center justify-center transition",
                  featuredItem.icon === "needo" && "client-featured-nav--image"
                )
              }
              to={featuredItem.to}
            >
              {featuredItem.icon === "needo" ? (
                <NeedoFeaturedNavButton />
              ) : (
                <>
                  <span className="mobile-nav-icon relative z-10 grid h-7 w-7 place-items-center">
                    <MobileNavIcon name={featuredItem.icon} />
                    {featuredItemNotificationCount > 0 ? (
                      <NotificationBadge className="absolute -right-2 -top-2 z-20" count={featuredItemNotificationCount} size="sm" />
                    ) : null}
                  </span>
                  <span className="relative z-10 -mt-0.5">{featuredItem.label}</span>
                </>
              )}
            </NavLink>
          )}
          <div
            data-nav-panel-style={navPanelStyle}
            data-client-bottom-nav-panel="true"
            className="client-liquid-glass-nav pointer-events-none grid gap-1 overflow-hidden rounded-[28px] border p-1.5 backdrop-blur-2xl"
            style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}
          >
            {visibleItems.map((item, index) => {
              if (!item) {
                return <span aria-hidden="true" key={`needo-space-${index}`} />;
              }

              const notificationCount = getNavItemNotificationCount(item, portalRole, navNotificationCounts);

              return (
                <NavLink
                  aria-label={getNavAriaLabel(item.label, notificationCount)}
                  className={({ isActive }) =>
                    cn(
                      "focus-ring pointer-events-auto flex min-h-[50px] flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-bold transition",
                      isActive
                        ? "text-[color:var(--client-primary)]"
                        : "text-[color:var(--client-muted)] hover:bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] hover:text-[color:var(--client-text)]"
                    )
                  }
                  end={item.end ?? (item.to === "/" || item.to === "/merchant" || item.to === "/technician")}
                  key={item.to}
                  to={item.to}
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          "mobile-nav-icon relative grid h-6 w-6 place-items-center rounded-full transition",
                          isActive
                            ? "text-[color:var(--client-primary)]"
                            : "text-current"
                        )}
                      >
                        <MobileNavIcon name={item.icon} />
                        {notificationCount > 0 ? (
                          <NotificationBadge className="absolute -right-2 -top-2 z-20" count={notificationCount} size="sm" />
                        ) : null}
                      </span>
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
