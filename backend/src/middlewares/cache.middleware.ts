import type { RequestHandler } from "express";
import type { AppConfig } from "../config/env";

const CACHEABLE_READ_PATTERNS = [
  /^\/categories$/,
  /^\/services$/,
  /^\/services\/[^/]+$/,
  /^\/home\/recommendations$/,
  /^\/search$/,
  /^\/shops\/[^/]+$/,
  /^\/technicians\/[^/]+$/,
  /^\/profiles\/customers\/[^/]+$/
];

const toApiPath = (config: AppConfig, path: string): string =>
  path.startsWith(config.API_PREFIX) ? path.slice(config.API_PREFIX.length) || "/" : path;

export const createCacheHeadersMiddleware = (config: AppConfig): RequestHandler => {
  return (request, response, next) => {
    const apiPath = toApiPath(config, request.path);
    const isCacheableRead =
      request.method === "GET" && CACHEABLE_READ_PATTERNS.some((pattern) => pattern.test(apiPath));

    if (isCacheableRead && config.CACHE_PUBLIC_MAX_AGE_SECONDS > 0) {
      response.setHeader(
        "Cache-Control",
        `public, max-age=${config.CACHE_PUBLIC_MAX_AGE_SECONDS}, stale-while-revalidate=${config.CACHE_STALE_WHILE_REVALIDATE_SECONDS}`
      );
    } else {
      response.setHeader("Cache-Control", "no-store");
    }

    next();
  };
};
