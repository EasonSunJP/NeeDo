import { startApiServer } from "./api-server";
import { createMerchantApp } from "./apps/merchant-app";

startApiServer(createMerchantApp);
