import { startApiServer } from "./api-server";
import { createMerchantApp } from "./apps/merchant-app";
import { env } from "./config/env";

startApiServer(createMerchantApp, { ...env, SERVICE_NAME: "needo-merchant-api" });
