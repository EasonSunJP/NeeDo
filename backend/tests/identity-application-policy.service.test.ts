import {
  IdentityApplicationPolicyService,
  type IdentityApplicationStatus
} from "../src/services/identity-application-policy.service";

describe("IdentityApplicationPolicyService", () => {
  const policy = new IdentityApplicationPolicyService();

  it.each<[IdentityApplicationStatus, IdentityApplicationStatus]>([
    ["draft", "submitted"],
    ["draft", "withdrawn"],
    ["submitted", "under_review"],
    ["submitted", "approved"],
    ["submitted", "rejected"],
    ["submitted", "withdrawn"],
    ["under_review", "approved"],
    ["under_review", "rejected"],
    ["under_review", "withdrawn"],
    ["rejected", "draft"]
  ])("allows %s to transition to %s", (current, next) => {
    expect(() =>
      policy.assertTransition({
        current,
        next,
        rejectionReason: next === "rejected" ? "资料无法确认" : undefined
      })
    ).not.toThrow();
  });

  it.each<[IdentityApplicationStatus, IdentityApplicationStatus]>([
    ["draft", "approved"],
    ["submitted", "draft"],
    ["approved", "draft"],
    ["approved", "rejected"],
    ["withdrawn", "submitted"]
  ])("rejects invalid %s to %s transitions", (current, next) => {
    expect(() => policy.assertTransition({ current, next })).toThrow(
      "error.identity_application.invalid_transition"
    );
  });

  it("requires a meaningful rejection reason", () => {
    expect(() =>
      policy.assertTransition({
        current: "under_review",
        next: "rejected",
        rejectionReason: "   "
      })
    ).toThrow("error.identity_application.rejection_reason_required");
  });

  it.each(["draft", "rejected"] as const)("allows editing %s applications", (status) => {
    expect(() => policy.assertEditable(status)).not.toThrow();
  });

  it.each(["submitted", "under_review", "approved", "withdrawn"] as const)(
    "locks %s application snapshots",
    (status) => {
      expect(() => policy.assertEditable(status)).toThrow(
        "error.identity_application.submitted_snapshot_locked"
      );
    }
  );

  it("uses one deterministic active key only while an application is active", () => {
    expect(policy.buildActiveKey(42, "technician", "draft")).toBe("42:technician");
    expect(policy.buildActiveKey(42, "technician", "submitted")).toBe("42:technician");
    expect(policy.buildActiveKey(42, "technician", "under_review")).toBe("42:technician");
    expect(policy.buildActiveKey(42, "technician", "approved")).toBeNull();
    expect(policy.buildActiveKey(42, "technician", "rejected")).toBeNull();
    expect(policy.buildActiveKey(42, "technician", "withdrawn")).toBeNull();
  });

  it("rejects stale optimistic versions", () => {
    expect(() => policy.assertVersion(4, 5)).toThrow(
      "error.identity_application.version_conflict"
    );
    expect(() => policy.assertVersion(5, 5)).not.toThrow();
  });

  it("sets the purge boundary to exactly thirty days after closure", () => {
    expect(policy.calculatePurgeAt(new Date("2026-08-26T03:15:00.000Z"))).toEqual(
      new Date("2026-09-25T03:15:00.000Z")
    );
  });

  it("hashes equivalent snapshots identically regardless of object key order", () => {
    expect(
      policy.hashSnapshot({
        targetShopId: 7,
        profile: { city: "東京", skills: ["整体", "按摩"] }
      })
    ).toBe(
      policy.hashSnapshot({
        profile: { skills: ["整体", "按摩"], city: "東京" },
        targetShopId: 7
      })
    );
    expect(policy.hashSnapshot({ name: "A" })).not.toBe(policy.hashSnapshot({ name: "B" }));
  });
});
