import {
  buildOfficialNoticeRecipientWhere,
  getOfficialNoticeRetryAt
} from "../src/repositories/official-notice.repository";

describe("OfficialNoticeRepository audience resolution", () => {
  it("always filters inactive and soft-deleted users and identities", () => {
    expect(buildOfficialNoticeRecipientWhere({ type: "all" })).toEqual({
      isActive: true,
      deletedAt: null,
      user: { isActive: true, deletedAt: null }
    });
  });

  it("deduplicates identity types without weakening the active-user scope", () => {
    expect(
      buildOfficialNoticeRecipientWhere({
        type: "identity_types",
        identityTypes: ["customer", "technician", "customer"]
      })
    ).toEqual({
      isActive: true,
      deletedAt: null,
      user: { isActive: true, deletedAt: null },
      type: { in: ["customer", "technician"] }
    });
  });

  it("deduplicates exact user targets and still resolves their active identities", () => {
    expect(buildOfficialNoticeRecipientWhere({
      type: "exact_users",
      needoIds: ["u0000000009", "u0000000002", "u0000000009"]
    })).toEqual({
      isActive: true,
      deletedAt: null,
      user: {
        isActive: true,
        deletedAt: null,
        needoId: { in: ["u0000000009", "u0000000002"] }
      }
    });
  });

  it("schedules bounded automatic retries and leaves exhausted failures for manual retry", () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    expect(getOfficialNoticeRetryAt(1, 3, now)).toEqual(new Date("2026-09-02T12:01:00.000Z"));
    expect(getOfficialNoticeRetryAt(2, 3, now)).toEqual(new Date("2026-09-02T12:01:00.000Z"));
    expect(getOfficialNoticeRetryAt(3, 3, now)).toBeNull();
  });
});
