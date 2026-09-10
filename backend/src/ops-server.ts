import { startApiServer } from "./api-server";
import { createOpsApp } from "./apps/ops-app";
import { env } from "./config/env";

startApiServer(createOpsApp, { ...env, SERVICE_NAME: "needo-ops-api" });
