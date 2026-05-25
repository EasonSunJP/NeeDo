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
      RealtimeParticipant: {
        type: "object",
        required: ["userId", "username", "avatarUrl"],
        properties: {
          userId: { type: "integer" },
          username: { type: "string" },
          avatarUrl: { type: ["string", "null"] }
        }
      },
      RealtimeMessage: {
        type: "object",
        required: [
          "id",
          "conversationId",
          "senderUserId",
          "type",
          "content",
          "metadata",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          conversationId: { type: "integer" },
          senderUserId: { type: ["integer", "null"] },
          type: { type: "string", enum: ["text", "system", "orderStatus"] },
          content: { type: ["string", "null"] },
          metadata: {},
          createdAt: { type: "string", format: "date-time" }
        }
      },
      RealtimeConversation: {
        type: "object",
        required: [
          "id",
          "type",
          "title",
          "participants",
          "lastMessage",
          "unreadCount",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          type: { type: "string", enum: ["direct", "group"] },
          title: { type: ["string", "null"] },
          participants: {
            type: "array",
            items: { $ref: "#/components/schemas/RealtimeParticipant" }
          },
          lastMessage: {
            anyOf: [{ $ref: "#/components/schemas/RealtimeMessage" }, { type: "null" }]
          },
          unreadCount: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      RealtimeContact: {
        type: "object",
        required: ["id", "ownerUserId", "contactUserId", "nickname", "source", "createdAt"],
        properties: {
          id: { type: "integer" },
          ownerUserId: { type: "integer" },
          contactUserId: { type: "integer" },
          nickname: { type: ["string", "null"] },
          source: { type: "string" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      FriendRequest: {
        type: "object",
        required: [
          "id",
          "requesterUserId",
          "targetUserId",
          "status",
          "message",
          "respondedAt",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          requesterUserId: { type: "integer" },
          targetUserId: { type: "integer" },
          status: { type: "string", enum: ["pending", "accepted", "rejected"] },
          message: { type: ["string", "null"] },
          respondedAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      SocialPost: {
        type: "object",
        required: ["id", "authorUserId", "content", "media", "visibility", "createdAt"],
        properties: {
          id: { type: "integer" },
          authorUserId: { type: "integer" },
          content: { type: "string" },
          media: {},
          visibility: { type: "string", enum: ["public", "followers"] },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      Follow: {
        type: "object",
        required: ["id", "followerUserId", "followingUserId", "createdAt"],
        properties: {
          id: { type: "integer" },
          followerUserId: { type: "integer" },
          followingUserId: { type: "integer" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      Notification: {
        type: "object",
        required: [
          "id",
          "recipientUserId",
          "actorUserId",
          "type",
          "title",
          "body",
          "payload",
          "readAt",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          recipientUserId: { type: "integer" },
          actorUserId: { type: ["integer", "null"] },
          type: { type: "string", enum: ["orderStatus", "friendRequest", "system", "social"] },
          title: { type: "string" },
          body: { type: "string" },
          payload: {},
          readAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      RealtimeUnreadCounts: {
        type: "object",
        required: ["conversations", "notifications", "friendRequests", "total"],
        properties: {
          conversations: { type: "integer" },
          notifications: { type: "integer" },
          friendRequests: { type: "integer" },
          total: { type: "integer" }
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
        required: ["id", "orderId", "fromStatus", "toStatus", "actorUserId", "reason", "createdAt"],
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
      },
      Wallet: {
        type: "object",
        required: [
          "id",
          "ownerType",
          "ownerId",
          "currency",
          "availableBalance",
          "frozenBalance",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          ownerType: { type: "string", enum: ["user", "shop", "platform"] },
          ownerId: { type: "integer" },
          currency: { type: "string", enum: ["NDP"] },
          availableBalance: { type: "integer" },
          frozenBalance: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      WalletLedger: {
        type: "object",
        required: [
          "id",
          "transactionId",
          "walletId",
          "direction",
          "amount",
          "availableDelta",
          "frozenDelta",
          "availableBalanceAfter",
          "frozenBalanceAfter",
          "reason",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          transactionId: { type: "integer" },
          walletId: { type: "integer" },
          direction: {
            type: "string",
            enum: ["available_credit", "available_debit", "freeze", "unfreeze", "frozen_debit"]
          },
          amount: { type: "integer" },
          availableDelta: { type: "integer" },
          frozenDelta: { type: "integer" },
          availableBalanceAfter: { type: "integer" },
          frozenBalanceAfter: { type: "integer" },
          reason: { type: "string" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      LedgerTransaction: {
        type: "object",
        required: [
          "id",
          "transactionNo",
          "idempotencyKey",
          "type",
          "status",
          "referenceType",
          "referenceId",
          "actorUserId",
          "amount",
          "currency",
          "metadata",
          "createdAt",
          "updatedAt",
          "entries"
        ],
        properties: {
          id: { type: "integer" },
          transactionNo: { type: "string" },
          idempotencyKey: { type: "string" },
          type: {
            type: "string",
            enum: [
              "booking_accept_freeze",
              "booking_cancel_unfreeze",
              "booking_complete_settlement",
              "booking_merchant_cancel_compensation",
              "seed_credit"
            ]
          },
          status: { type: "string", enum: ["applied"] },
          referenceType: { type: "string" },
          referenceId: { type: "integer" },
          actorUserId: { type: ["integer", "null"] },
          amount: { type: "integer" },
          currency: { type: "string", enum: ["NDP"] },
          metadata: {},
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          entries: { type: "array", items: { $ref: "#/components/schemas/WalletLedger" } }
        }
      },
      FinanceReconciliation: {
        type: "object",
        required: [
          "id",
          "transactionId",
          "transactionNo",
          "referenceType",
          "referenceId",
          "status",
          "currency",
          "expectedAmount",
          "actualAmount",
          "differenceAmount",
          "exportedAt",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          transactionId: { type: "integer" },
          transactionNo: { type: "string" },
          referenceType: { type: "string" },
          referenceId: { type: "integer" },
          status: { type: "string", enum: ["pending", "exported"] },
          currency: { type: "string", enum: ["NDP"] },
          expectedAmount: { type: "integer" },
          actualAmount: { type: "integer" },
          differenceAmount: { type: "integer" },
          exportedAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      FinanceReconciliationExport: {
        type: "object",
        required: ["filename", "contentType", "csv"],
        properties: {
          filename: { type: "string" },
          contentType: { type: "string", enum: ["text/csv"] },
          csv: { type: "string" }
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
    [`${config.API_PREFIX}/auth/test-login`]: {
      post: {
        tags: ["Auth"],
        summary: "Temporary non-production test login",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["portal"],
                properties: {
                  portal: {
                    type: "string",
                    enum: ["user", "merchant", "technician", "business", "admin"]
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "JWT token pair issued for a real seeded account",
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
          "403": { description: "Test login disabled" }
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
          {
            name: "serviceId",
            in: "query",
            required: true,
            schema: { type: "integer", minimum: 1 }
          },
          { name: "shopId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "technicianId", in: "query", schema: { type: "integer", minimum: 1 } },
          {
            name: "from",
            in: "query",
            required: true,
            schema: { type: "string", format: "date-time" }
          },
          {
            name: "to",
            in: "query",
            required: true,
            schema: { type: "string", format: "date-time" }
          },
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
                        list: {
                          type: "array",
                          items: { $ref: "#/components/schemas/ScheduleSlot" }
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
                        list: {
                          type: "array",
                          items: { $ref: "#/components/schemas/BookingOrder" }
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
    [`${config.API_PREFIX}/orders/{id}`]: {
      get: {
        tags: ["Booking"],
        summary: "Booking order detail with status history",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
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
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
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
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
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
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
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
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Order completed" },
          "409": { description: "Invalid state transition" }
        }
      }
    },
    [`${config.API_PREFIX}/wallets/me`]: {
      get: {
        tags: ["Ledger"],
        summary: "Current user's NDP wallet",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Wallet balance",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/Wallet" }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/wallets/{id}/ledger`]: {
      get: {
        tags: ["Ledger"],
        summary: "Paginated wallet ledger entries",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated wallet ledger entries" }
        }
      }
    },
    [`${config.API_PREFIX}/finance/ledger/transactions`]: {
      get: {
        tags: ["Finance"],
        summary: "Paginated NDP ledger transactions",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "type", in: "query", schema: { type: "string" } },
          { name: "referenceType", in: "query", schema: { type: "string", maxLength: 80 } },
          { name: "referenceId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated ledger transactions" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/dashboard`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Operations dashboard from real database aggregates",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Operations dashboard payload" },
          "403": { description: "Missing backoffice dashboard permission" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/orders`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Paginated real booking orders for operations admin",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated backoffice orders" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/schedule`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Paginated real schedule slots for operations admin",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated backoffice schedule slots" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/finance/settlements`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Paginated real finance reconciliation rows for operations admin",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated backoffice finance settlements" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/finance/settlements/export`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Export operations finance settlements as CSV content",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "CSV export payload" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/technicians`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Paginated real technician profiles for operations admin",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated backoffice technicians" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/shops`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Paginated real shops for operations admin",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated backoffice shops" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/dashboard`]: {
      get: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Merchant dashboard scoped to the authenticated shop",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Merchant dashboard payload" },
          "403": { description: "Missing merchant scope or permission" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/orders`]: {
      get: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Paginated real booking orders scoped to the authenticated shop",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated merchant orders" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/schedule`]: {
      get: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Paginated real schedule slots scoped to the authenticated shop",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated merchant schedule slots" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/finance/settlements`]: {
      get: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Paginated real finance reconciliation rows scoped to the authenticated shop",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated merchant finance settlements" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/finance/settlements/export`]: {
      get: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Export merchant finance settlements as CSV content",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "CSV export payload" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/technicians`]: {
      get: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Paginated real technician profiles scoped to the authenticated shop",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated merchant technicians" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shop`]: {
      get: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Current authenticated shop profile",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Current merchant shop payload" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Paginated IM conversations with unread counts",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated conversations" }
        }
      },
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Create a direct or group conversation",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["participantUserIds"],
                properties: {
                  type: { type: "string", enum: ["direct", "group"], default: "direct" },
                  title: { type: "string", maxLength: 120 },
                  participantUserIds: {
                    type: "array",
                    minItems: 1,
                    maxItems: 50,
                    items: { type: "integer", minimum: 1 }
                  }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Created conversation" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}/messages`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Cursor-paginated IM message history",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "conversationId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          },
          { name: "beforeId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Message history page with nextCursor" }
        }
      },
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Send an IM message",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "conversationId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["content"],
                properties: {
                  type: {
                    type: "string",
                    enum: ["text", "system", "orderStatus"],
                    default: "text"
                  },
                  content: { type: "string", minLength: 1, maxLength: 4000 },
                  metadata: { type: "object", additionalProperties: true }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Created message" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}/read`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Mark a conversation as read for the current user",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "conversationId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        responses: {
          "200": { description: "Conversation read state" }
        }
      }
    },
    [`${config.API_PREFIX}/im/contacts`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Paginated contacts",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated contacts" }
        }
      }
    },
    [`${config.API_PREFIX}/im/friend-requests`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Paginated friend requests",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["pending", "accepted", "rejected"] }
          },
          {
            name: "direction",
            in: "query",
            schema: { type: "string", enum: ["incoming", "outgoing", "all"] }
          }
        ],
        responses: {
          "200": { description: "Paginated friend requests" }
        }
      },
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Create a friend request",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["targetUserId"],
                properties: {
                  targetUserId: { type: "integer", minimum: 1 },
                  message: { type: "string", maxLength: 300 }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Created friend request" }
        }
      }
    },
    [`${config.API_PREFIX}/im/friend-requests/{id}/accept`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Accept a friend request and create reciprocal contacts",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Accepted friend request" }
        }
      }
    },
    [`${config.API_PREFIX}/im/friend-requests/{id}/reject`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Reject a friend request",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Rejected friend request" }
        }
      }
    },
    [`${config.API_PREFIX}/social/posts`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Paginated social posts",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "authorUserId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated social posts" }
        }
      },
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Create a basic social post",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["content"],
                properties: {
                  content: { type: "string", minLength: 1, maxLength: 5000 },
                  media: { type: "array", maxItems: 12, items: { type: "object" } },
                  visibility: { type: "string", enum: ["public", "followers"], default: "public" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Created social post" }
        }
      }
    },
    [`${config.API_PREFIX}/social/follows`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Follow a user",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["targetUserId"],
                properties: {
                  targetUserId: { type: "integer", minimum: 1 }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Created follow" }
        }
      }
    },
    [`${config.API_PREFIX}/social/follows/{targetUserId}`]: {
      delete: {
        tags: ["Step 13 Realtime"],
        summary: "Unfollow a user",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "targetUserId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        responses: {
          "200": { description: "Follow deletion result" }
        }
      }
    },
    [`${config.API_PREFIX}/notifications`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Paginated notifications",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "unreadOnly", in: "query", schema: { type: "boolean" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated notifications" }
        }
      }
    },
    [`${config.API_PREFIX}/notifications/{id}/read`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Mark one notification as read",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Read notification" }
        }
      }
    },
    [`${config.API_PREFIX}/notifications/read-all`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Mark all current-user notifications as read",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Read count" }
        }
      }
    },
    [`${config.API_PREFIX}/realtime/unread-counts`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Unread counts for IM, friend requests, and notifications",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Unread counts" }
        }
      }
    },
    [`${config.API_PREFIX}/realtime/events`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "SSE realtime event stream",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "text/event-stream with retry hints and heartbeat comments" }
        }
      }
    },
    [`${config.API_PREFIX}/finance/reconciliation`]: {
      get: {
        tags: ["Finance"],
        summary: "Paginated NDP finance reconciliation rows",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["pending", "exported"] }
          },
          { name: "referenceType", in: "query", schema: { type: "string", maxLength: 80 } },
          { name: "referenceId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated finance reconciliation rows" }
        }
      }
    },
    [`${config.API_PREFIX}/finance/reconciliation/export`]: {
      get: {
        tags: ["Finance"],
        summary: "Export NDP finance reconciliation CSV content",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "CSV export payload",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/FinanceReconciliationExport" }
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
