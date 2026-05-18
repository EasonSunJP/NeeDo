export type NavigationReturnState = {
  returnTo?: string;
  returnState?: unknown;
};

type RouteLocationLike = {
  hash?: string;
  pathname: string;
  search?: string;
};

function normalizeInternalRoute(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const route = value.trim();

  if (!route.startsWith("/") || route.startsWith("//") || route.includes("://")) {
    return null;
  }

  return route;
}

function getReturnState(value: unknown) {
  return value && typeof value === "object" ? value as NavigationReturnState : null;
}

export function buildCurrentRoute(location: RouteLocationLike) {
  return `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`;
}

export function withReturnTo(route: string, returnTo: string) {
  const safeReturnTo = normalizeInternalRoute(returnTo);

  if (!safeReturnTo) {
    return route;
  }

  const [pathAndSearch, hash = ""] = route.split("#");
  const separator = pathAndSearch.includes("?") ? "&" : "?";

  return `${pathAndSearch}${separator}returnTo=${encodeURIComponent(safeReturnTo)}${hash ? `#${hash}` : ""}`;
}

export function readNavigationReturnTarget(search: string, state: unknown) {
  const returnState = getReturnState(state);
  const queryReturnTo = new URLSearchParams(search).get("returnTo");
  const target = normalizeInternalRoute(returnState?.returnTo) ?? normalizeInternalRoute(queryReturnTo);

  if (!target) {
    return null;
  }

  return {
    state: returnState?.returnState,
    to: target
  };
}
