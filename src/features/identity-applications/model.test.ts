import { selectLatestApplication } from "./model";
import type { IdentityApplication } from "./api";
import { describe, expect, it } from "vitest";
import {
  buildIdentityRows,
  getIdentityPortal,
  type IdentityAvailability
} from "./model";

const availability: IdentityAvailability[] = [
  { kind: "customer", state: "active", identityId: 1, applicationId: null, rejectionReason: null },
  { kind: "technician", state: "draft", identityId: null, applicationId: 21, rejectionReason: null },
  { kind: "merchant", state: "pending", identityId: null, applicationId: 22, rejectionReason: null },
  { kind: "affiliate", state: "available_to_apply", identityId: null, applicationId: null, rejectionReason: null }
];

describe("identity application settings model", () => {
  it("keeps customer active and maps ordinary-user rows to application actions", () => {
    expect(buildIdentityRows(availability, "user")).toEqual([
      expect.objectContaining({ kind: "customer", active: true, action: "current" }),
      expect.objectContaining({ kind: "technician", active: false, action: "continue", applicationId: 21 }),
      expect.objectContaining({ kind: "merchant", active: false, action: "pending", applicationId: 22 }),
      expect.objectContaining({ kind: "affiliate", active: false, action: "apply" })
    ]);
  });

  it("allows switching only for server-active identities", () => {
    const rows = buildIdentityRows(
      availability.map((item) =>
        item.kind === "technician" ? { ...item, state: "active" as const, identityId: 2, applicationId: null } : item
      ),
      "user"
    );
    expect(rows.find((row) => row.kind === "technician")).toMatchObject({ action: "switch", identityId: 2 });
    expect(rows.find((row) => row.kind === "merchant")?.action).toBe("pending");
  });

  it("maps backend identity kinds to the four frontend portals", () => {
    expect(getIdentityPortal("customer")).toBe("user");
    expect(getIdentityPortal("technician")).toBe("technician");
    expect(getIdentityPortal("merchant")).toBe("merchant");
    expect(getIdentityPortal("affiliate")).toBe("business");
  });
});

describe("application restoration", () => {
  it("prioritizes the active application over recently purged older decisions", () => {
    const application = (id: number, status: IdentityApplication["status"]) => ({ id, status } as IdentityApplication);
    expect(selectLatestApplication([application(1, "approved"), application(4, "rejected"), application(3, "submitted")])?.id).toBe(3);
    expect(selectLatestApplication([application(1, "approved"), application(4, "rejected")])?.id).toBe(4);
    expect(selectLatestApplication([application(5, "withdrawn")])).toBeNull();
  });
});
