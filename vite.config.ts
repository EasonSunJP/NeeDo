import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import { loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

type PortalDevRequest = {
  headers: Record<string, string | string[] | undefined>;
  url?: string;
};

const portalRouteHtmlEntries = [
  { fileName: "/store-admin.html", prefixes: ["/merchant-admin", "/login/merchant-admin"] },
  { fileName: "/merchant.html", prefixes: ["/shop"] },
  { fileName: "/afirieito-admin.html", prefixes: ["/NDA-admin", "/nda-admin", "/afirieito-admin", "/CPS-admin", "/cps-admin", "/business-admin", "/login/NDA-admin", "/login/nda-admin", "/login/afirieito-admin", "/login/CPS-admin", "/login/cps-admin", "/login/business-admin"] },
  { fileName: "/afirieito.html", prefixes: ["/afirieito", "/login/afirieito", "/business", "/cps", "/login/business", "/login/cps"] },
  { fileName: "/pf-admin.html", prefixes: ["/admin", "/login/admin"] }
] as const;

type EnvMap = Record<string, string | undefined>;

export const defaultNeedoApiProxyTarget = "http://127.0.0.1:3000";
export const defaultLegacyAuthProxyPrefix = "/legacy-auth";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeProxyPrefix(value: string) {
  const normalized = value.trim().replace(/^\/+|\/+$/g, "");

  return normalized ? `/${normalized}` : defaultLegacyAuthProxyPrefix;
}

function stripApiPrefix(value: string) {
  return trimTrailingSlash(value).replace(/\/api\/v[0-9]+$/, "");
}

export function resolveNeedoApiProxyTarget(env: EnvMap) {
  const explicitTarget = env.NEEDO_API_PROXY_TARGET?.trim() || env.VITE_API_PROXY_TARGET?.trim();
  if (explicitTarget) {
    return stripApiPrefix(explicitTarget);
  }

  const apiBaseUrl = env.VITE_API_BASE_URL?.trim();
  const target = apiBaseUrl && /^https?:\/\//i.test(apiBaseUrl) ? apiBaseUrl : defaultNeedoApiProxyTarget;

  return stripApiPrefix(target);
}

export function createNeedoApiProxyConfig(target: string): Record<string, ProxyOptions> {
  return {
    "/api/v1": {
      changeOrigin: true,
      secure: false,
      target
    }
  };
}

export function resolveLegacyAuthProxyTarget(env: EnvMap) {
  const explicitTarget = env.NEEDO_LEGACY_AUTH_PROXY_TARGET?.trim() || env.VITE_LEGACY_AUTH_PROXY_TARGET?.trim();

  return explicitTarget ? trimTrailingSlash(explicitTarget) : null;
}

export function resolveLegacyAuthProxyPrefix(env: EnvMap) {
  const configuredBase = env.VITE_LEGACY_AUTH_BASE_URL?.trim();

  if (configuredBase && !/^https?:\/\//i.test(configuredBase)) {
    return normalizeProxyPrefix(configuredBase);
  }

  return defaultLegacyAuthProxyPrefix;
}

export function createLegacyAuthProxyConfig(
  target: string | null,
  prefix = defaultLegacyAuthProxyPrefix
): Record<string, ProxyOptions> {
  if (!target) {
    return {};
  }

  const normalizedPrefix = normalizeProxyPrefix(prefix);
  const rewritePattern = new RegExp(`^${escapeRegExp(normalizedPrefix)}`);

  return {
    [normalizedPrefix]: {
      changeOrigin: true,
      rewrite: (path) => path.replace(rewritePattern, "") || "/",
      secure: false,
      target
    }
  };
}

function getRequestHeader(headers: PortalDevRequest["headers"], name: string) {
  const value = headers[name] ?? headers[name.toLowerCase()];

  return Array.isArray(value) ? value.join(",") : value ?? "";
}

function acceptsHtml(req: PortalDevRequest) {
  const accept = getRequestHeader(req.headers, "accept");

  return !accept || accept.includes("text/html") || accept.includes("*/*");
}

function resolvePortalEntryPath(pathname: string) {
  return portalRouteHtmlEntries.find((entry) =>
    entry.prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  )?.fileName;
}

function rewritePortalEntryRequest(req: PortalDevRequest, _res: unknown, next: () => void) {
  if (!req.url || !acceptsHtml(req)) {
    next();
    return;
  }

  const queryIndex = req.url.indexOf("?");
  const pathname = queryIndex >= 0 ? req.url.slice(0, queryIndex) : req.url;
  const search = queryIndex >= 0 ? req.url.slice(queryIndex) : "";
  const entryPath = resolvePortalEntryPath(pathname);

  if (entryPath) {
    req.url = `${entryPath}${search}`;
  }

  next();
}

function needoPortalEntryFallbackPlugin(): Plugin {
  return {
    name: "needo-portal-entry-fallback",
    configureServer(server) {
      server.middlewares.use(rewritePortalEntryRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewritePortalEntryRequest);
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiProxy = {
    ...createNeedoApiProxyConfig(resolveNeedoApiProxyTarget(env)),
    ...createLegacyAuthProxyConfig(resolveLegacyAuthProxyTarget(env), resolveLegacyAuthProxyPrefix(env))
  };

  return {
    base: "./",
    plugins: [needoPortalEntryFallbackPlugin(), react()],
    build: {
      chunkSizeWarningLimit: 3600,
      rollupOptions: {
        input: {
          index: "index.html",
          user: "user.html",
          afirieito: "afirieito.html",
          afirieitoAdmin: "afirieito-admin.html",
          technician: "technician.html",
          merchant: "merchant.html",
          pfAdmin: "pf-admin.html",
          storeAdmin: "store-admin.html"
        },
        output: {
          manualChunks(id) {
            const normalizedId = id.split("\\").join("/");

            if (normalizedId.includes("node_modules/react")) {
              return "vendor-react";
            }

            if (normalizedId.includes("node_modules/react-router")) {
              return "vendor-router";
            }

            if (normalizedId.includes("node_modules")) {
              return "vendor";
            }

            if (normalizedId.includes("/src/i18n/")) {
              return "i18n";
            }
          }
        }
      }
    },
    server: {
      port: 5180,
      proxy: apiProxy
    },
    preview: {
      port: 5180,
      proxy: apiProxy
    },
    test: {
      exclude: ["backend/**", "dist/**", "node_modules/**", "**/node_modules/**", ".codex-*/**"]
    }
  };
});
