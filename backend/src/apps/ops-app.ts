import type { Express } from "express";
import { createApp, type AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { opsApiRouteManifest } from "./api-route-manifest";

export const createOpsApp = (config: AppConfig, dependencies?: AppDependencies): Express =>
  createApp(
    {
      ...config,
      AUTH_TOKEN_AUDIENCE: "needo-ops-api",
      SERVICE_NAME: "needo-ops-api"
    },
    dependencies,
    { routeManifest: opsApiRouteManifest }
  );
