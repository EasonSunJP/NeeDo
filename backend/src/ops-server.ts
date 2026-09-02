import { startApiServer } from "./api-server";
import { createOpsApp } from "./apps/ops-app";

startApiServer(createOpsApp);
