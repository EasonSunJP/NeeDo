import type { Express } from "express";
import { createApp, type AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { merchantApiRouteManifest } from "./api-route-manifest";

export const createMerchantApp = (config: AppConfig, dependencies?: AppDependencies): Express =>
  createApp(
    {
      ...config,
      AUTH_TOKEN_AUDIENCE: "needo-merchant-api",
      SERVICE_NAME: "needo-merchant-api"
    },
    dependencies,
    { routeManifest: merchantApiRouteManifest }
  );
