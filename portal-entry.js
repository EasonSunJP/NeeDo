const hashRoute = document.querySelector('meta[name="needo-hash"]')?.getAttribute("content")?.trim() || "#/";
const htmlTitle = document.querySelector('meta[name="needo-title"]')?.getAttribute("content")?.trim();
const portalTitles = {
  user: "NeeDo 用户端",
  business: "NeeDoAfirieito",
  businessAdmin: "NDA管理后台",
  merchant: "NeeDo 商户端",
  technician: "NeeDo 技师端",
  admin: "NeeDo 运营后台",
  merchantAdmin: "NeeDo 商户后台"
};
const directPortalEntries = [
  { fileName: "store-admin.html", prefixes: ["/merchant-admin", "/login/merchant-admin"] },
  { fileName: "afirieito-admin.html", prefixes: ["/NDA-admin", "/nda-admin", "/afirieito-admin", "/CPS-admin", "/cps-admin", "/business-admin", "/login/NDA-admin", "/login/nda-admin", "/login/afirieito-admin", "/login/CPS-admin", "/login/cps-admin", "/login/business-admin"] },
  { fileName: "afirieito.html", prefixes: ["/afirieito", "/login/afirieito", "/business", "/cps", "/login/business", "/login/cps"] },
  { fileName: "merchant.html", prefixes: ["/merchant", "/login/merchant"] },
  { fileName: "technician.html", prefixes: ["/technician", "/login/technician"] },
  { fileName: "pf-admin.html", prefixes: ["/admin", "/login/admin"] },
  { fileName: "user.html", prefixes: ["/user", "/login/user"] }
];

function normalizePathname(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function resolveDirectPortalEntry(pathname = window.location.pathname) {
  const normalizedPathname = normalizePathname(pathname);

  return directPortalEntries.find((entry) =>
    entry.prefixes.some((prefix) => normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`))
  );
}

const directPortalEntry = resolveDirectPortalEntry();
const fileName = directPortalEntry?.fileName || window.location.pathname.split("/").pop() || "index.html";
const normalizedHash = hashRoute.startsWith("#") ? hashRoute : `#${hashRoute}`;

function redirectToDist() {
  const target = new URL(`./dist/${fileName}`, window.location.href);
  target.hash = (window.location.hash || normalizedHash).slice(1);
  window.location.replace(target.href);
}

function isLocalHttpOrigin() {
  return (
    window.location.protocol === "http:" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "::1")
  );
}

function resolveEntryFileNameFromHash() {
  const currentFileName = window.location.pathname.split("/").pop();

  if (currentFileName && currentFileName.endsWith(".html")) {
    return currentFileName;
  }

  try {
    const raw = (window.location.hash || normalizedHash).replace(/^#/, "") || "/";
    const normalizedPath = raw.startsWith("/") ? raw : `/${raw}`;
    const hashPathname = new URL(normalizedPath, "https://needo.local").pathname;

    return resolveDirectPortalEntry(hashPathname)?.fileName || fileName;
  } catch {
    return fileName;
  }
}

function redirectLocalDistEntryToDevSource() {
  if (!isLocalHttpOrigin() || !normalizePathname(window.location.pathname).startsWith("/dist")) {
    return false;
  }

  const target = new URL(`/${resolveEntryFileNameFromHash()}`, window.location.href);
  target.hash = (window.location.hash || normalizedHash).slice(1);
  window.location.replace(target.href);
  return true;
}

function isViteDevRuntime() {
  if (window.__vite_plugin_react_preamble_installed__) {
    return true;
  }

  return Array.from(document.querySelectorAll('script[type="module"]')).some((script) => {
    const source = script.getAttribute("src") || "";
    return source === "/@vite/client" || source.startsWith("/@vite/client?");
  });
}

function isBuiltDistHtml() {
  return Array.from(document.querySelectorAll('script[type="module"]')).some((script) => {
    const source = script.getAttribute("src") || "";
    return /(^|\/)assets\/portal-entry-[^/]+\.js($|\?)/.test(source);
  });
}

function resolveDocumentTitle(candidateHash) {
  try {
    const raw = (candidateHash || normalizedHash).replace(/^#/, "") || "/";
    const normalizedPath = raw.startsWith("/") ? raw : `/${raw}`;
    const target = new URL(normalizedPath, "https://needo.local");
    const pathname = target.pathname;
    const redirect = target.searchParams.get("redirect") || "";

    if (pathname.startsWith("/merchant-admin") || redirect.startsWith("/merchant-admin")) {
      return portalTitles.merchantAdmin;
    }

    if (pathname.startsWith("/admin") || pathname.startsWith("/login/admin")) {
      return portalTitles.admin;
    }

    if (
      pathname.startsWith("/NDA-admin") ||
      pathname.startsWith("/nda-admin") ||
      pathname.startsWith("/afirieito-admin") ||
      pathname.startsWith("/CPS-admin") ||
      pathname.startsWith("/cps-admin") ||
      pathname.startsWith("/business-admin") ||
      pathname.startsWith("/login/NDA-admin") ||
      pathname.startsWith("/login/nda-admin") ||
      pathname.startsWith("/login/afirieito-admin") ||
      pathname.startsWith("/login/CPS-admin") ||
      pathname.startsWith("/login/cps-admin") ||
      pathname.startsWith("/login/business-admin")
    ) {
      return portalTitles.businessAdmin;
    }

    if (pathname.startsWith("/afirieito") || pathname.startsWith("/business") || pathname.startsWith("/cps") || pathname.startsWith("/login/afirieito") || pathname.startsWith("/login/business") || pathname.startsWith("/login/cps")) {
      return portalTitles.business;
    }

    if (pathname.startsWith("/technician") || pathname.startsWith("/login/technician")) {
      return portalTitles.technician;
    }

    if (pathname.startsWith("/merchant") || pathname.startsWith("/login/merchant")) {
      return portalTitles.merchant;
    }

    return portalTitles.user;
  } catch {
    return htmlTitle || portalTitles.user;
  }
}

function resolveDirectRouteHash() {
  const pathname = window.location.pathname;

  if (
    pathname === "/" ||
    pathname.endsWith(".html") ||
    pathname.startsWith("/dist") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/images")
  ) {
    return normalizedHash;
  }

  if (
    pathname === "/NDA-admin" ||
    pathname.startsWith("/NDA-admin/") ||
    pathname === "/nda-admin" ||
    pathname.startsWith("/nda-admin/") ||
    pathname === "/afirieito-admin" ||
    pathname.startsWith("/afirieito-admin/") ||
    pathname === "/CPS-admin" ||
    pathname.startsWith("/CPS-admin/") ||
    pathname === "/cps-admin" ||
    pathname.startsWith("/cps-admin/") ||
    pathname === "/business-admin" ||
    pathname.startsWith("/business-admin/")
  ) {
    const normalizedAdminPath = pathname.replace(/^\/(?:nda-admin|afirieito-admin|cps-admin|business-admin|CPS-admin)/i, "/NDA-admin");
    return `#${normalizedAdminPath}${window.location.search || ""}`;
  }

  if (pathname === "/afirieito" || pathname.startsWith("/afirieito/")) {
    return `#${pathname}${window.location.search || ""}`;
  }

  if (pathname === "/cps" || pathname.startsWith("/cps/")) {
    return `#/afirieito${pathname.slice("/cps".length)}${window.location.search || ""}`;
  }

  if (pathname === "/business" || pathname.startsWith("/business/")) {
    return `#/afirieito${pathname.slice("/business".length)}${window.location.search || ""}`;
  }

  if (pathname === "/login/afirieito" || pathname.startsWith("/login/afirieito/")) {
    return `#${pathname}${window.location.search || ""}`;
  }

  if (pathname === "/login/business" || pathname.startsWith("/login/business/")) {
    return `#/login/afirieito${pathname.slice("/login/business".length)}${window.location.search || ""}`;
  }

  if (pathname === "/login/cps" || pathname.startsWith("/login/cps/")) {
    return `#/login/afirieito${pathname.slice("/login/cps".length)}${window.location.search || ""}`;
  }

  if (
    pathname.startsWith("/merchant") ||
    pathname.startsWith("/technician") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/merchant-admin") ||
    pathname.startsWith("/NDA-admin") ||
    pathname.startsWith("/nda-admin") ||
    pathname.startsWith("/afirieito-admin") ||
    pathname.startsWith("/CPS-admin") ||
    pathname.startsWith("/cps-admin") ||
    pathname.startsWith("/scan") ||
    pathname.startsWith("/q") ||
    pathname.startsWith("/dine") ||
    pathname.startsWith("/business") ||
    pathname.startsWith("/afirieito") ||
    pathname.startsWith("/cps") ||
    pathname.startsWith("/reviews") ||
    pathname.startsWith("/login")
  ) {
    return `#${pathname}${window.location.search || ""}`;
  }

  return normalizedHash;
}

function canonicalizeDirectPortalEntry() {
  if (!directPortalEntry || window.location.protocol === "file:" || window.location.pathname.endsWith(".html")) {
    return false;
  }

  if (isViteDevRuntime()) {
    return false;
  }

  const target = new URL(`/${directPortalEntry.fileName}`, window.location.href);
  const directHash = window.location.hash || resolveDirectRouteHash();
  target.hash = directHash.slice(1);
  window.location.replace(target.href);
  return true;
}

function syncDocumentTitle() {
  document.title = resolveDocumentTitle(window.location.hash);
}

const isFileSourceHtml = window.location.protocol === "file:" && !window.location.pathname.includes("/dist/");
const builtDistHtml = isBuiltDistHtml();
const viteDevRuntime = isViteDevRuntime();
const shouldRedirectToDist = isFileSourceHtml || (window.location.protocol !== "file:" && !viteDevRuntime && !builtDistHtml);

if (redirectLocalDistEntryToDevSource()) {
  // Vite dev serves source HTML entries. Opening /dist/*.html directly loads a built shell without mounting React.
} else if (canonicalizeDirectPortalEntry()) {
  // Safari desktop web apps keep the current URL, so direct routes must land on the matching HTML entry first.
} else if (shouldRedirectToDist) {
  redirectToDist();
} else {
  syncDocumentTitle();
  window.addEventListener("hashchange", syncDocumentTitle);

  if (!window.location.hash) {
    const target = new URL(window.location.href);
    const directHash = resolveDirectRouteHash();
    if (directHash !== normalizedHash) {
      target.search = "";
    }
    target.hash = directHash.slice(1);
    window.history.replaceState(null, "", target.href);
    syncDocumentTitle();
  }

  if (window.location.protocol !== "file:") {
    import("./src/main.tsx").catch(() => {
      if (!isBuiltDistHtml()) {
        redirectToDist();
      }
    });
  }
}
