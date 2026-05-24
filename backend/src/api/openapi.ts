import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import type { AppConfig } from "../config/env";

type OpenApiDocument = Record<string, unknown>;

export const createOpenApiDocument = (config: AppConfig): OpenApiDocument => ({
  openapi: "3.1.0",
  info: {
    title: "NeeDo Backend API",
    version: "0.1.0"
  },
  servers: [
    {
      url: config.API_PREFIX
    }
  ],
  paths: {
    [`${config.API_PREFIX}/health`]: {
      get: {
        tags: ["System"],
        summary: "Backend health check",
        responses: {
          "200": {
            description: "Backend is ready to accept requests",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: {
                      type: "object",
                      required: ["status", "service", "timestamp", "dependencies"],
                      properties: {
                        status: { type: "string", enum: ["ok", "degraded"] },
                        service: { type: "string" },
                        timestamp: { type: "string", format: "date-time" },
                        dependencies: {
                          type: "object",
                          required: ["redis"],
                          properties: {
                            redis: {
                              type: "object",
                              required: ["status"],
                              properties: {
                                status: { type: "string", enum: ["ok", "error"] },
                                latencyMs: { type: "number" },
                                message: { type: "string" }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
});

export const createOpenApiRoutes = (config: AppConfig): Router => {
  const router = Router();
  const document = createOpenApiDocument(config);

  router.get("/openapi.json", (_request, response) => {
    response.status(200).json(document);
  });
  router.use("/docs", swaggerUi.serve, swaggerUi.setup(document));

  return router;
};
