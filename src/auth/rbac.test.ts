import { describe, expect, it } from "vitest";
import {
  buildAuthSessionFromMe,
  canAccessFeatureFromSession,
  canUseUserSessionForClientPortal,
  canAccessPortalFromSession,
  hasPermissionInSession,
  type AuthMePayload
} from "./rbac";

const baseMe = {
  id: 1,
  email: "admin@example.com",
  username: "Admin",
  avatarUrl: null,
  isActive: true,
  currentIdentity: {
    id: 1,
    type: "platform",
    scopeType: "global",
    scopeId: null
  },
  identities: [
    {
      id: 1,
      type: "platform",
      scopeType: "global",
      scopeId: null
    }
  ],
  roles: ["admin"],
  permissions: ["page:dashboard", "page:user-management", "button:user:create"],
  menus: ["menu:dashboard", "menu:user-management"]
} satisfies AuthMePayload;

describe("frontend RBAC session helpers", () => {
  it("derives admin portal access from the real /auth/me identity and roles", () => {
    const session = buildAuthSessionFromMe(baseMe, "admin", "password");

    expect(session.allowedPortals).toEqual(["admin"]);
    expect(canAccessPortalFromSession(session, "admin")).toBe(true);
    expect(canAccessPortalFromSession(session, "merchant")).toBe(false);
  });

  it("lets the shared test admin account enter the user portal when it has a customer identity", () => {
    const session = buildAuthSessionFromMe(
      {
        ...baseMe,
        identities: [
          ...baseMe.identities,
          { id: 2, type: "customer", scopeType: "customer_profile", scopeId: 10 }
        ],
        roles: ["admin", "customer"],
        permissions: [...baseMe.permissions, "page:client-app"],
        menus: [...baseMe.menus, "menu:client-app"]
      },
      "user",
      "password"
    );

    expect(session.portal).toBe("user");
    expect(session.allowedPortals).toEqual(["admin", "user"]);
    expect(canAccessPortalFromSession(session, "user")).toBe(true);
  });

  it("maps formal numeric scoped identities to the local client entity ids", () => {
    const session = buildAuthSessionFromMe(
      {
        ...baseMe,
        currentIdentity: { id: 2, type: "customer", scopeType: "customer_profile", scopeId: 3 },
        identities: [
          { id: 2, type: "customer", scopeType: "customer_profile", scopeId: 3 },
          { id: 3, type: "merchant_owner", scopeType: "store", scopeId: 2 },
          { id: 4, type: "technician", scopeType: "technician_profile", scopeId: 4 }
        ],
        roles: ["customer", "merchant_owner", "technician"],
        permissions: ["page:client-app", "page:merchant-app", "page:technician-app"],
        menus: ["menu:client-app", "menu:merchant-app", "menu:technician-app"]
      },
      "user",
      "password"
    );

    expect(session.linkedCustomerId).toBe("cus-3");
    expect(session.linkedStoreId).toBe("store-2");
    expect(session.linkedTechnicianId).toBe("tech-4");
  });

  it("lets a signed-in user bootstrap non-admin client portals without granting admin access", () => {
    const session = buildAuthSessionFromMe(
      {
        ...baseMe,
        currentIdentity: { id: 2, type: "customer", scopeType: "customer_profile", scopeId: 10 },
        identities: [{ id: 2, type: "customer", scopeType: "customer_profile", scopeId: 10 }],
        roles: ["customer"],
        permissions: ["page:client-app"],
        menus: ["menu:client-app"]
      },
      "user",
      "password"
    );

    expect(session.allowedPortals).toEqual(["user"]);
    expect(canUseUserSessionForClientPortal(session, "merchant")).toBe(true);
    expect(canUseUserSessionForClientPortal(session, "technician")).toBe(true);
    expect(canUseUserSessionForClientPortal(session, "business")).toBe(true);
    expect(canUseUserSessionForClientPortal(session, "admin")).toBe(false);
  });

  it("keeps merchant client feature entries visible for a user-bootstrapped merchant portal", () => {
    const session = buildAuthSessionFromMe(
      {
        ...baseMe,
        currentIdentity: { id: 2, type: "customer", scopeType: "customer_profile", scopeId: 10 },
        identities: [{ id: 2, type: "customer", scopeType: "customer_profile", scopeId: 10 }],
        roles: ["customer"],
        permissions: ["page:client-app"],
        menus: ["menu:client-app"]
      },
      "user",
      "password"
    );

    expect(canAccessFeatureFromSession(session, "merchant", "shop.member.view", true)).toBe(true);
    expect(canAccessFeatureFromSession(session, "merchant", "store.dine-in.order.view", true)).toBe(true);
    expect(canAccessFeatureFromSession(session, "merchant", "store.dine-in.menu.view", true)).toBe(true);
    expect(canAccessFeatureFromSession(session, "merchant", "store.dine-in.floor.view", true)).toBe(true);
    expect(canAccessFeatureFromSession(session, "merchant", "admin:dangerous", false)).toBe(false);
    expect(canAccessFeatureFromSession(session, "admin", "page:user-management", true)).toBe(false);
  });

  it("keeps the shared legacy test account on user by default while allowing merchant, technician, and Afirieito switches", () => {
    const session = buildAuthSessionFromMe(
      {
        ...baseMe,
        currentIdentity: { id: 2, type: "customer", scopeType: "customer_profile", scopeId: 10 },
        identities: [
          { id: 2, type: "customer", scopeType: "customer_profile", scopeId: 10 },
          { id: 3, type: "merchant_owner", scopeType: "store", scopeId: 20 },
          { id: 4, type: "technician", scopeType: "technician_profile", scopeId: 30 },
          { id: 5, type: "scout", scopeType: "global", scopeId: null }
        ],
        roles: ["customer", "merchant_owner", "technician", "scout"],
        permissions: ["page:client-app", "page:merchant-app", "page:technician-app", "page:business-app"],
        menus: ["menu:client-app", "menu:merchant-app", "menu:technician-app", "menu:business-app"]
      },
      "user",
      "password"
    );

    expect(session.portal).toBe("user");
    expect(session.allowedPortals).toEqual(["user", "merchant", "technician", "business"]);
    expect(canAccessPortalFromSession(session, "merchant")).toBe(true);
    expect(canAccessPortalFromSession(session, "technician")).toBe(true);
    expect(canAccessPortalFromSession(session, "business")).toBe(true);
  });

  it("keeps a legacy account inside Afirieito when the login starts from the promotion entry", () => {
    const session = buildAuthSessionFromMe(
      {
        ...baseMe,
        currentIdentity: { id: 2, type: "customer", scopeType: "customer_profile", scopeId: 10 },
        identities: [
          { id: 2, type: "customer", scopeType: "customer_profile", scopeId: 10 },
          { id: 3, type: "merchant_owner", scopeType: "store", scopeId: 20 },
          { id: 4, type: "technician", scopeType: "technician_profile", scopeId: 30 },
          { id: 5, type: "scout", scopeType: "global", scopeId: null }
        ],
        roles: ["customer", "merchant_owner", "technician", "scout"],
        permissions: ["page:client-app", "page:merchant-app", "page:technician-app", "page:business-app"],
        menus: ["menu:client-app", "menu:merchant-app", "menu:technician-app", "menu:business-app"]
      },
      "business",
      "password"
    );

    expect(session.portal).toBe("business");
  });

  it("checks page and button permissions from the backend permission list", () => {
    const session = buildAuthSessionFromMe(baseMe, "admin", "password");

    expect(hasPermissionInSession(session, "page:user-management")).toBe(true);
    expect(hasPermissionInSession(session, "button:user:delete")).toBe(false);
  });

  it("maps business identities to the existing Afirieito portal without opening admin", () => {
    const session = buildAuthSessionFromMe(
      {
        ...baseMe,
        currentIdentity: { id: 2, type: "scout", scopeType: "global", scopeId: null },
        identities: [{ id: 2, type: "scout", scopeType: "global", scopeId: null }],
        roles: ["scout"],
        permissions: ["page:dashboard"],
        menus: ["menu:dashboard"]
      },
      "business",
      "password"
    );

    expect(session.allowedPortals).toEqual(["business"]);
    expect(canAccessPortalFromSession(session, "business")).toBe(true);
    expect(canAccessPortalFromSession(session, "admin")).toBe(false);
  });
});
