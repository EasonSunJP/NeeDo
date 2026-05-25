import { describe, expect, it } from "vitest";
import {
  buildAuthSessionFromMe,
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
