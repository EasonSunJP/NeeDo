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
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas: {
      ApiError: {
        type: "object",
        required: ["code", "message", "data"],
        properties: {
          code: { type: "integer" },
          message: { type: "string" },
          data: { type: "null" }
        }
      },
      TokenPair: {
        type: "object",
        required: ["accessToken", "refreshToken", "expiresIn"],
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          expiresIn: { type: "integer", enum: [900] }
        }
      },
      RefreshTokenResponse: {
        type: "object",
        required: ["accessToken", "expiresIn"],
        properties: {
          accessToken: { type: "string" },
          expiresIn: { type: "integer", enum: [900] }
        }
      },
      AuthMe: {
        type: "object",
        required: [
          "id",
          "email",
          "username",
          "avatarUrl",
          "isActive",
          "currentIdentity",
          "identities",
          "roles",
          "permissions",
          "menus"
        ],
        properties: {
          id: { type: "integer" },
          email: { type: "string", format: "email" },
          username: { type: "string" },
          avatarUrl: { type: ["string", "null"] },
          isActive: { type: "boolean" },
          currentIdentity: { $ref: "#/components/schemas/AuthIdentity" },
          identities: {
            type: "array",
            items: { $ref: "#/components/schemas/AuthIdentity" }
          },
          roles: { type: "array", items: { type: "string" } },
          permissions: { type: "array", items: { type: "string" } },
          menus: { type: "array", items: { type: "string" } }
        }
      },
      AuthIdentity: {
        type: "object",
        required: ["id", "type", "scopeType", "scopeId"],
        properties: {
          id: { type: "integer" },
          type: { type: "string" },
          scopeType: { type: ["string", "null"] },
          scopeId: { type: ["integer", "null"] }
        }
      },
      Permission: {
        type: "object",
        required: [
          "id",
          "name",
          "code",
          "type",
          "module",
          "description",
          "isSystem",
          "createdAt",
          "updatedAt",
          "deletedAt"
        ],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          code: { type: "string" },
          type: { type: "string", enum: ["api", "menu", "page", "button"] },
          module: { type: "string" },
          description: { type: ["string", "null"] },
          isSystem: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          deletedAt: { type: ["string", "null"], format: "date-time" }
        }
      },
      Role: {
        type: "object",
        required: [
          "id",
          "name",
          "code",
          "description",
          "isSystem",
          "createdAt",
          "updatedAt",
          "deletedAt",
          "permissions"
        ],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          code: { type: "string" },
          description: { type: ["string", "null"] },
          isSystem: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          deletedAt: { type: ["string", "null"], format: "date-time" },
          permissions: {
            type: "array",
            items: { $ref: "#/components/schemas/Permission" }
          }
        }
      },
      User: {
        type: "object",
        required: [
          "id",
          "email",
          "phone",
          "username",
          "avatarUrl",
          "isActive",
          "lastLoginAt",
          "createdAt",
          "updatedAt",
          "deletedAt",
          "identities",
          "roleAssignments",
          "roles"
        ],
        properties: {
          id: { type: "integer" },
          email: { type: "string", format: "email" },
          phone: { type: ["string", "null"] },
          username: { type: "string" },
          avatarUrl: { type: ["string", "null"] },
          isActive: { type: "boolean" },
          lastLoginAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          deletedAt: { type: ["string", "null"], format: "date-time" },
          identities: {
            type: "array",
            items: { $ref: "#/components/schemas/AuthIdentity" }
          },
          roleAssignments: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "roleId", "code", "name", "scopeType", "scopeId"],
              properties: {
                id: { type: "integer" },
                roleId: { type: "integer" },
                code: { type: "string" },
                name: { type: "string" },
                scopeType: { type: ["string", "null"] },
                scopeId: { type: ["integer", "null"] }
              }
            }
          },
          roles: { type: "array", items: { type: "string" } }
        }
      },
      PermissionTree: {
        type: "object",
        required: ["modules"],
        properties: {
          modules: {
            type: "array",
            items: {
              type: "object",
              required: ["module", "children"],
              properties: {
                module: { type: "string" },
                children: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["type", "permissions"],
                    properties: {
                      type: { type: "string" },
                      permissions: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Permission" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      ReviewSummary: {
        type: "object",
        required: ["ratingAverage", "reviewCount", "latestReviewAt", "highlights"],
        properties: {
          ratingAverage: { type: "string", example: "4.80" },
          reviewCount: { type: "integer" },
          latestReviewAt: { type: ["string", "null"], format: "date-time" },
          highlights: { type: "array", items: { type: "string" } }
        }
      },
      MediaAsset: {
        type: "object",
        required: ["id", "url", "mimeType", "usageType", "width", "height", "altText", "sortOrder"],
        properties: {
          id: { type: "integer" },
          url: { type: "string" },
          mimeType: { type: "string" },
          usageType: { type: "string" },
          width: { type: ["integer", "null"] },
          height: { type: ["integer", "null"] },
          altText: { type: ["string", "null"] },
          sortOrder: { type: "integer" }
        }
      },
      Category: {
        type: "object",
        required: [
          "id",
          "code",
          "name",
          "nameJa",
          "nameEn",
          "parentId",
          "iconUrl",
          "sortOrder",
          "isActive",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          code: { type: "string" },
          name: { type: "string" },
          nameJa: { type: ["string", "null"] },
          nameEn: { type: ["string", "null"] },
          parentId: { type: ["integer", "null"] },
          iconUrl: { type: ["string", "null"] },
          sortOrder: { type: "integer" },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      ShopCard: {
        type: "object",
        required: ["id", "name", "city", "address", "coverUrl", "reviewSummary"],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          city: { type: "string" },
          address: { type: "string" },
          coverUrl: { type: ["string", "null"] },
          reviewSummary: { $ref: "#/components/schemas/ReviewSummary" }
        }
      },
      TechnicianCard: {
        type: "object",
        required: ["id", "displayName", "city", "avatarUrl", "reviewSummary"],
        properties: {
          id: { type: "integer" },
          displayName: { type: "string" },
          city: { type: "string" },
          avatarUrl: { type: ["string", "null"] },
          reviewSummary: { $ref: "#/components/schemas/ReviewSummary" }
        }
      },
      ServiceCard: {
        type: "object",
        required: [
          "id",
          "name",
          "description",
          "category",
          "shop",
          "technician",
          "city",
          "priceAmount",
          "currency",
          "durationMinutes",
          "coverUrl",
          "reviewSummary"
        ],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          category: { $ref: "#/components/schemas/Category" },
          shop: { $ref: "#/components/schemas/ShopCard" },
          technician: {
            anyOf: [{ $ref: "#/components/schemas/TechnicianCard" }, { type: "null" }]
          },
          city: { type: "string" },
          priceAmount: { type: "string", example: "8800.00" },
          currency: { type: "string", example: "JPY" },
          durationMinutes: { type: "integer" },
          coverUrl: { type: ["string", "null"] },
          reviewSummary: { $ref: "#/components/schemas/ReviewSummary" }
        }
      },
      ServiceDetail: {
        allOf: [
          { $ref: "#/components/schemas/ServiceCard" },
          {
            type: "object",
            required: ["serviceMode", "mediaAssets", "createdAt", "updatedAt"],
            properties: {
              serviceMode: { type: "string" },
              mediaAssets: { type: "array", items: { $ref: "#/components/schemas/MediaAsset" } },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" }
            }
          }
        ]
      },
      ShopDetail: {
        allOf: [
          { $ref: "#/components/schemas/ShopCard" },
          {
            type: "object",
            required: [
              "description",
              "phone",
              "latitude",
              "longitude",
              "mediaAssets",
              "services",
              "technicians",
              "createdAt",
              "updatedAt"
            ],
            properties: {
              description: { type: ["string", "null"] },
              phone: { type: ["string", "null"] },
              latitude: { type: ["string", "null"] },
              longitude: { type: ["string", "null"] },
              mediaAssets: { type: "array", items: { $ref: "#/components/schemas/MediaAsset" } },
              services: { type: "array", items: { $ref: "#/components/schemas/ServiceCard" } },
              technicians: {
                type: "array",
                items: { $ref: "#/components/schemas/TechnicianCard" }
              },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" }
            }
          }
        ]
      },
      TechnicianDetail: {
        allOf: [
          { $ref: "#/components/schemas/TechnicianCard" },
          {
            type: "object",
            required: [
              "bio",
              "serviceArea",
              "yearsExperience",
              "mediaAssets",
              "services",
              "createdAt",
              "updatedAt"
            ],
            properties: {
              bio: { type: ["string", "null"] },
              serviceArea: { type: ["string", "null"] },
              yearsExperience: { type: "integer" },
              mediaAssets: { type: "array", items: { $ref: "#/components/schemas/MediaAsset" } },
              services: { type: "array", items: { $ref: "#/components/schemas/ServiceCard" } },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" }
            }
          }
        ]
      },
      CustomerProfile: {
        type: "object",
        required: [
          "id",
          "displayName",
          "city",
          "bio",
          "avatarUrl",
          "membershipLevel",
          "reviewSummary",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          displayName: { type: "string" },
          city: { type: ["string", "null"] },
          bio: { type: ["string", "null"] },
          avatarUrl: { type: ["string", "null"] },
          membershipLevel: { type: "string" },
          reviewSummary: { $ref: "#/components/schemas/ReviewSummary" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      HomeRecommendations: {
        type: "object",
        required: ["categories", "services", "shops", "technicians"],
        properties: {
          categories: { type: "array", items: { $ref: "#/components/schemas/Category" } },
          services: { type: "array", items: { $ref: "#/components/schemas/ServiceCard" } },
          shops: { type: "array", items: { $ref: "#/components/schemas/ShopCard" } },
          technicians: { type: "array", items: { $ref: "#/components/schemas/TechnicianCard" } }
        }
      },
      ScheduleSlot: {
        type: "object",
        required: [
          "id",
          "serviceId",
          "shopId",
          "technicianProfileId",
          "startsAt",
          "endsAt",
          "capacity",
          "bookedCount",
          "status",
          "serviceName",
          "shopName",
          "technicianName",
          "priceAmount",
          "currency",
          "durationMinutes"
        ],
        properties: {
          id: { type: "integer" },
          serviceId: { type: "integer" },
          shopId: { type: "integer" },
          technicianProfileId: { type: ["integer", "null"] },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          capacity: { type: "integer" },
          bookedCount: { type: "integer" },
          status: { type: "string", enum: ["available", "booked", "blocked"] },
          serviceName: { type: "string" },
          shopName: { type: "string" },
          technicianName: { type: ["string", "null"] },
          priceAmount: { type: "string", example: "8800.00" },
          currency: { type: "string", example: "JPY" },
          durationMinutes: { type: "integer" }
        }
      },
      OrderStatusHistory: {
        type: "object",
        required: [
          "id",
          "orderId",
          "fromStatus",
          "toStatus",
          "actorUserId",
          "reason",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          orderId: { type: "integer" },
          fromStatus: {
            type: ["string", "null"],
            enum: ["pending", "confirmed", "inService", "completed", "cancelled", null]
          },
          toStatus: {
            type: "string",
            enum: ["pending", "confirmed", "inService", "completed", "cancelled"]
          },
          actorUserId: { type: ["integer", "null"] },
          reason: { type: ["string", "null"] },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      BookingOrder: {
        type: "object",
        required: [
          "id",
          "orderNo",
          "orderType",
          "status",
          "paymentStatus",
          "customerUserId",
          "serviceId",
          "shopId",
          "technicianProfileId",
          "scheduleSlotId",
          "fulfillmentMode",
          "serviceName",
          "shopName",
          "technicianName",
          "priceAmount",
          "currency",
          "startsAt",
          "endsAt",
          "note",
          "cancelReason",
          "createdAt",
          "updatedAt",
          "statusHistory"
        ],
        properties: {
          id: { type: "integer" },
          orderNo: { type: "string" },
          orderType: { type: "string", enum: ["booking", "request"] },
          status: {
            type: "string",
            enum: ["pending", "confirmed", "inService", "completed", "cancelled"]
          },
          paymentStatus: { type: "string", enum: ["unpaid"] },
          customerUserId: { type: "integer" },
          serviceId: { type: "integer" },
          shopId: { type: "integer" },
          technicianProfileId: { type: ["integer", "null"] },
          scheduleSlotId: { type: "integer" },
          fulfillmentMode: { type: "string", enum: ["home", "store"] },
          serviceName: { type: "string" },
          shopName: { type: "string" },
          technicianName: { type: ["string", "null"] },
          priceAmount: { type: "string", example: "8800.00" },
          currency: { type: "string", example: "JPY" },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          note: { type: ["string", "null"] },
          cancelReason: { type: ["string", "null"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          statusHistory: {
            type: "array",
            items: { $ref: "#/components/schemas/OrderStatusHistory" }
          }
        }
      }
    }
  },
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
    },
    [`${config.API_PREFIX}/auth/login`]: {
      post: {
        tags: ["Auth"],
        summary: "Email and password login",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 1, maxLength: 128 }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "JWT token pair",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/TokenPair" }
                  }
                }
              }
            }
          },
          "401": { description: "Invalid credentials" },
          "429": { description: "Account locked" }
        }
      }
    },
    [`${config.API_PREFIX}/auth/otp/send`]: {
      post: {
        tags: ["Auth"],
        summary: "Send email OTP",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: {
                  email: { type: "string", format: "email" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "OTP delivery accepted",
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
                      required: ["expiresIn", "cooldownSeconds"],
                      properties: {
                        expiresIn: { type: "integer", enum: [600] },
                        cooldownSeconds: { type: "integer", enum: [60] }
                      }
                    }
                  }
                }
              }
            }
          },
          "429": { description: "OTP cooldown active" },
          "502": { description: "OTP delivery failed" }
        }
      }
    },
    [`${config.API_PREFIX}/auth/otp/verify`]: {
      post: {
        tags: ["Auth"],
        summary: "Verify email OTP",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "otp"],
                properties: {
                  email: { type: "string", format: "email" },
                  otp: { type: "string", pattern: "^\\d{6}$" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "JWT token pair",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/TokenPair" }
                  }
                }
              }
            }
          },
          "401": { description: "Invalid or expired OTP" }
        }
      }
    },
    [`${config.API_PREFIX}/auth/refresh`]: {
      post: {
        tags: ["Auth"],
        summary: "Refresh access token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: {
                  refreshToken: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "New access token",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/RefreshTokenResponse" }
                  }
                }
              }
            }
          },
          "401": { description: "Refresh token invalid or expired" }
        }
      }
    },
    [`${config.API_PREFIX}/auth/logout`]: {
      post: {
        tags: ["Auth"],
        summary: "Logout and revoke current session",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: {
                  refreshToken: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Session revoked",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { type: "object" }
                  }
                }
              }
            }
          },
          "401": { description: "Token invalid, expired, or blacklisted" },
          "403": { description: "Missing auth logout permission" }
        }
      }
    },
    [`${config.API_PREFIX}/auth/me`]: {
      get: {
        tags: ["Auth"],
        summary: "Current authenticated user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Current user, identity, roles, permissions, and menus",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/AuthMe" }
                  }
                }
              }
            }
          },
          "401": { description: "Access token invalid, expired, or blacklisted" },
          "403": { description: "Missing auth me permission" }
        }
      }
    },
    [`${config.API_PREFIX}/permissions`]: {
      get: {
        tags: ["RBAC"],
        summary: "Paginated permission list",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Paginated permissions",
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
                      required: ["list", "total", "page", "page_size"],
                      properties: {
                        list: {
                          type: "array",
                          items: { $ref: "#/components/schemas/Permission" }
                        },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        page_size: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          },
          "403": { description: "Missing permission:list permission" }
        }
      },
      post: {
        tags: ["RBAC"],
        summary: "Create permission",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "code", "type", "module"],
                properties: {
                  name: { type: "string" },
                  code: { type: "string" },
                  type: { type: "string", enum: ["api", "menu", "page", "button"] },
                  module: { type: "string" },
                  description: { type: ["string", "null"] }
                }
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Permission created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/Permission" }
                  }
                }
              }
            }
          },
          "409": { description: "Permission code exists" }
        }
      }
    },
    [`${config.API_PREFIX}/permissions/tree`]: {
      get: {
        tags: ["RBAC"],
        summary: "Permission tree grouped by module and type",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Permission tree",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/PermissionTree" }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/permissions/{id}`]: {
      get: {
        tags: ["RBAC"],
        summary: "Permission detail",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Permission detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/Permission" }
                  }
                }
              }
            }
          },
          "404": { description: "Permission not found" }
        }
      },
      patch: {
        tags: ["RBAC"],
        summary: "Update permission",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Permission updated" },
          "403": { description: "System permission protected" },
          "404": { description: "Permission not found" }
        }
      },
      delete: {
        tags: ["RBAC"],
        summary: "Soft delete permission",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Permission soft deleted" },
          "403": { description: "System permission protected" },
          "404": { description: "Permission not found" }
        }
      }
    },
    [`${config.API_PREFIX}/roles`]: {
      get: {
        tags: ["RBAC"],
        summary: "Paginated role list",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Paginated roles",
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
                      required: ["list", "total", "page", "page_size"],
                      properties: {
                        list: { type: "array", items: { $ref: "#/components/schemas/Role" } },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        page_size: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ["RBAC"],
        summary: "Create role",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Role created" },
          "409": { description: "Role code exists" }
        }
      }
    },
    [`${config.API_PREFIX}/roles/{id}`]: {
      get: {
        tags: ["RBAC"],
        summary: "Role detail",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Role detail" },
          "404": { description: "Role not found" }
        }
      },
      patch: {
        tags: ["RBAC"],
        summary: "Update role",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Role updated" },
          "403": { description: "System role protected" },
          "404": { description: "Role not found" }
        }
      },
      delete: {
        tags: ["RBAC"],
        summary: "Soft delete role",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Role soft deleted" },
          "403": { description: "System role protected" },
          "404": { description: "Role not found" }
        }
      }
    },
    [`${config.API_PREFIX}/roles/{id}/permissions`]: {
      put: {
        tags: ["RBAC"],
        summary: "Assign role permissions",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["permissionIds"],
                properties: {
                  permissionIds: { type: "array", items: { type: "integer" } }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Role permissions assigned" },
          "404": { description: "Role or permission not found" }
        }
      }
    },
    [`${config.API_PREFIX}/users`]: {
      get: {
        tags: ["User Management"],
        summary: "Paginated user list",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Paginated users",
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
                      required: ["list", "total", "page", "page_size"],
                      properties: {
                        list: { type: "array", items: { $ref: "#/components/schemas/User" } },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        page_size: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ["User Management"],
        summary: "Create user",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "User created" },
          "409": { description: "Email or phone already exists" }
        }
      }
    },
    [`${config.API_PREFIX}/users/{id}`]: {
      get: {
        tags: ["User Management"],
        summary: "User detail",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "User detail without password hash" },
          "404": { description: "User not found" }
        }
      },
      patch: {
        tags: ["User Management"],
        summary: "Update user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "User updated" },
          "409": { description: "Email or phone already exists" }
        }
      },
      delete: {
        tags: ["User Management"],
        summary: "Soft delete user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "User soft deleted" },
          "403": { description: "Self or super admin deletion blocked" }
        }
      }
    },
    [`${config.API_PREFIX}/users/{id}/enable`]: {
      post: {
        tags: ["User Management"],
        summary: "Enable user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "User enabled" },
          "404": { description: "User not found" }
        }
      }
    },
    [`${config.API_PREFIX}/users/{id}/disable`]: {
      post: {
        tags: ["User Management"],
        summary: "Disable user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "User disabled" },
          "403": { description: "Self disable blocked" },
          "404": { description: "User not found" }
        }
      }
    },
    [`${config.API_PREFIX}/users/{id}/roles`]: {
      put: {
        tags: ["User Management"],
        summary: "Assign user roles",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["roles"],
                properties: {
                  roles: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["roleId"],
                      properties: {
                        roleId: { type: "integer" },
                        scopeType: { type: ["string", "null"] },
                        scopeId: { type: ["integer", "null"] }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "User roles assigned" },
          "403": { description: "Current admin final admin role removal blocked" },
          "404": { description: "User or role not found" }
        }
      }
    },
    [`${config.API_PREFIX}/categories`]: {
      get: {
        tags: ["Core Read"],
        summary: "Paginated public category list",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "parentId", in: "query", schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": {
            description: "Paginated categories",
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
                      required: ["list", "total", "page", "page_size"],
                      properties: {
                        list: { type: "array", items: { $ref: "#/components/schemas/Category" } },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        page_size: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/services`]: {
      get: {
        tags: ["Core Read"],
        summary: "Paginated public service list",
        parameters: [
          { name: "keyword", in: "query", schema: { type: "string", maxLength: 100 } },
          { name: "categoryId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "shopId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "technicianId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "city", in: "query", schema: { type: "string", maxLength: 100 } },
          { name: "minPrice", in: "query", schema: { type: "number", minimum: 0 } },
          { name: "maxPrice", in: "query", schema: { type: "number", minimum: 0 } },
          {
            name: "sort",
            in: "query",
            schema: {
              type: "string",
              enum: ["recommended", "rating_desc", "price_asc", "price_desc", "newest"]
            }
          },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": {
            description: "Paginated services",
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
                      required: ["list", "total", "page", "page_size"],
                      properties: {
                        list: {
                          type: "array",
                          items: { $ref: "#/components/schemas/ServiceCard" }
                        },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        page_size: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/services/{id}`]: {
      get: {
        tags: ["Core Read"],
        summary: "Public service detail",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Service detail" },
          "404": { description: "Service not found" }
        }
      }
    },
    [`${config.API_PREFIX}/home/recommendations`]: {
      get: {
        tags: ["Core Read"],
        summary: "Home recommendation rows",
        parameters: [
          { name: "city", in: "query", schema: { type: "string", maxLength: 100 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 20 } }
        ],
        responses: {
          "200": {
            description: "Recommended categories, services, shops, and technicians",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/HomeRecommendations" }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/search`]: {
      get: {
        tags: ["Core Read"],
        summary: "Public service search",
        responses: {
          "200": { description: "Paginated service search results" }
        }
      }
    },
    [`${config.API_PREFIX}/shops/{id}`]: {
      get: {
        tags: ["Core Read"],
        summary: "Public shop detail",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Shop detail" },
          "404": { description: "Shop not found" }
        }
      }
    },
    [`${config.API_PREFIX}/technicians/{id}`]: {
      get: {
        tags: ["Core Read"],
        summary: "Public technician detail",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Technician detail" },
          "404": { description: "Technician not found" }
        }
      }
    },
    [`${config.API_PREFIX}/profiles/customers/{id}`]: {
      get: {
        tags: ["Core Read"],
        summary: "Public customer profile",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Customer profile without account credentials" },
          "404": { description: "Customer profile not found" }
        }
      }
    },
    [`${config.API_PREFIX}/schedule/availability`]: {
      get: {
        tags: ["Booking"],
        summary: "Paginated available schedule slots",
        parameters: [
          { name: "serviceId", in: "query", required: true, schema: { type: "integer", minimum: 1 } },
          { name: "shopId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "technicianId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "from", in: "query", required: true, schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", required: true, schema: { type: "string", format: "date-time" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": {
            description: "Available slots",
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
                      required: ["list", "total", "page", "page_size"],
                      properties: {
                        list: { type: "array", items: { $ref: "#/components/schemas/ScheduleSlot" } },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        page_size: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/bookings`]: {
      post: {
        tags: ["Booking"],
        summary: "Create a free Booking order from an available schedule slot",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["serviceId", "scheduleSlotId", "fulfillmentMode"],
                properties: {
                  serviceId: { type: "integer", minimum: 1 },
                  scheduleSlotId: { type: "integer", minimum: 1 },
                  orderType: { type: "string", enum: ["booking"] },
                  fulfillmentMode: { type: "string", enum: ["home", "store"] },
                  note: { type: "string", maxLength: 500 }
                }
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Booking order created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/BookingOrder" }
                  }
                }
              }
            }
          },
          "409": { description: "Slot unavailable or already booked" }
        }
      }
    },
    [`${config.API_PREFIX}/orders`]: {
      get: {
        tags: ["Booking"],
        summary: "Paginated Booking order list",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["pending", "confirmed", "inService", "completed", "cancelled"]
            }
          }
        ],
        responses: {
          "200": {
            description: "Paginated orders",
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
                      required: ["list", "total", "page", "page_size"],
                      properties: {
                        list: { type: "array", items: { $ref: "#/components/schemas/BookingOrder" } },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        page_size: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/orders/{id}`]: {
      get: {
        tags: ["Booking"],
        summary: "Booking order detail with status history",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
        responses: {
          "200": { description: "Booking order detail" },
          "404": { description: "Order not found" }
        }
      }
    },
    [`${config.API_PREFIX}/orders/{id}/confirm`]: {
      post: {
        tags: ["Booking"],
        summary: "Confirm a pending Booking order",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
        responses: {
          "200": { description: "Order confirmed" },
          "409": { description: "Invalid state transition" }
        }
      }
    },
    [`${config.API_PREFIX}/orders/{id}/cancel`]: {
      post: {
        tags: ["Booking"],
        summary: "Cancel a pending or confirmed Booking order",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string", maxLength: 500 }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Order cancelled" },
          "409": { description: "Invalid state transition" }
        }
      }
    },
    [`${config.API_PREFIX}/orders/{id}/start`]: {
      post: {
        tags: ["Booking"],
        summary: "Start service for a confirmed Booking order",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
        responses: {
          "200": { description: "Order moved to inService" },
          "409": { description: "Invalid state transition" }
        }
      }
    },
    [`${config.API_PREFIX}/orders/{id}/complete`]: {
      post: {
        tags: ["Booking"],
        summary: "Complete an inService Booking order",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
        responses: {
          "200": { description: "Order completed" },
          "409": { description: "Invalid state transition" }
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
