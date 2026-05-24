import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
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

export default defineConfig({
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
    port: 5180
  },
  preview: {
    port: 5180
  },
  test: {
    exclude: ["backend/**", "dist/**", "node_modules/**", "**/node_modules/**", ".codex-*/**"]
  }
});
