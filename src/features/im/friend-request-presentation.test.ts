import { describe, expect, it } from "vitest";
import type { DirectoryProfile, FriendRequest } from "./model";
import {
  getFriendRequestLabel,
  isActiveFriendRequest,
  resolveDirectoryProfileActions,
} from "./pages";
import {
  getImRoleConfig,
  resolveImContactInformationPath,
} from "./role-config";

const pendingRequest: FriendRequest = {
  id: "51",
  fromUserId: "1",
  toUserId: "2",
  source: "formal_api",
  requestMessage: "",
  status: "pending",
  createdAt: "2026-08-30T00:00:00.000Z",
  expiresAt: "2026-09-02T00:00:00.000Z",
};

const profile: DirectoryProfile = {
  user: {
    id: "2",
    accountId: "n0000000002",
    nickname: "松本 琴音",
    avatar: "/avatar.png",
    status: "active",
    searchableFields: ["松本 琴音"],
    sortKey: "松本 琴音",
    profileKind: "person",
    source: "formal_api",
    tags: [],
    userIdLabel: "u5314672018",
    canCall: true,
    canVideoCall: true,
  },
  identityCard: {
    entityType: "account",
    displayName: "松本 琴音",
    verified: false,
    creditReviewCount: 0,
    languages: [],
  },
  relationship: "none",
};

describe("friend request presentation", () => {
  it("shows directional lifecycle labels", () => {
    const activeNowMs = Date.parse("2026-09-01T00:00:00.000Z");
    expect(getFriendRequestLabel(pendingRequest, "1", activeNowMs)).toBe("等待对方验证");
    expect(getFriendRequestLabel(pendingRequest, "2", activeNowMs)).toBe("待处理");
    expect(
      getFriendRequestLabel({ ...pendingRequest, status: "rejected" }, "1"),
    ).toBe("被拒绝");
    expect(
      getFriendRequestLabel({ ...pendingRequest, status: "rejected" }, "2"),
    ).toBe("已拒绝");
    expect(
      getFriendRequestLabel({ ...pendingRequest, status: "accepted" }, "1"),
    ).toBe("成功添加");
    expect(
      getFriendRequestLabel({ ...pendingRequest, status: "expired" }, "2"),
    ).toBe("已过期");
  });

  it("expires a stale pending request at the exact 72-hour boundary", () => {
    expect(
      getFriendRequestLabel(
        pendingRequest,
        "2",
        Date.parse(pendingRequest.expiresAt),
      ),
    ).toBe("已过期");
  });

  it("resolves profile actions from the server relationship", () => {
    const activeNowMs = Date.parse("2026-09-01T00:00:00.000Z");
    expect(resolveDirectoryProfileActions(profile, null, "1")).toEqual([
      "cancel",
      "send_request",
    ]);
    expect(
      resolveDirectoryProfileActions(
        { ...profile, relationship: "incoming_pending" },
        pendingRequest,
        "2",
        activeNowMs,
      ),
    ).toEqual(["reject", "accept"]);
    expect(
      resolveDirectoryProfileActions(
        { ...profile, relationship: "outgoing_pending" },
        pendingRequest,
        "1",
        activeNowMs,
      ),
    ).toEqual(["waiting"]);
    expect(
      resolveDirectoryProfileActions(
        { ...profile, relationship: "friend" },
        null,
        "1",
      ),
    ).toEqual([]);
    expect(
      resolveDirectoryProfileActions(
        { ...profile, relationship: "self" },
        null,
        "1",
      ),
    ).toEqual([]);
  });

  it("keeps an active incoming request actionable over a stale friend relationship", () => {
    expect(
      resolveDirectoryProfileActions(
        { ...profile, relationship: "friend" },
        pendingRequest,
        "2",
        Date.parse("2026-08-31T00:00:00.000Z"),
      ),
    ).toEqual(["reject", "accept"]);
  });

  it("keeps an active outgoing request waiting over a stale friend relationship", () => {
    expect(
      resolveDirectoryProfileActions(
        { ...profile, relationship: "friend" },
        pendingRequest,
        "1",
        Date.parse("2026-08-31T00:00:00.000Z"),
      ),
    ).toEqual(["waiting"]);
  });

  it("keeps the current account actionless even when a pending request is present", () => {
    expect(
      resolveDirectoryProfileActions(
        { ...profile, relationship: "self" },
        pendingRequest,
        "2",
        Date.parse("2026-08-31T00:00:00.000Z"),
      ),
    ).toEqual([]);
  });

  it("does not let an expired request override a real friend relationship", () => {
    const nowMs = Date.parse(pendingRequest.expiresAt);

    expect(isActiveFriendRequest(pendingRequest, nowMs)).toBe(false);
    expect(
      resolveDirectoryProfileActions(
        { ...profile, relationship: "friend" },
        pendingRequest,
        "2",
        nowMs,
      ),
    ).toEqual([]);
  });

  it("builds a scoped directory profile route before contact-id routes", () => {
    expect(getImRoleConfig("user").routes.directoryProfile("167")).toBe(
      "/contacts/directory/167",
    );
    expect(getImRoleConfig("merchant").routes.directoryProfile("167")).toBe(
      "/merchant/contacts/directory/167",
    );
    expect(getImRoleConfig("technician").routes.directoryProfile("167")).toBe(
      "/technician/contacts/directory/167",
    );
  });

  it("routes each identifiable avatar to that account's scoped contact information", () => {
    expect(resolveImContactInformationPath("user", profile.user)).toBe(
      "/contacts/directory/2",
    );
    expect(resolveImContactInformationPath("merchant", profile.user)).toBe(
      "/merchant/contacts/directory/2",
    );
    expect(resolveImContactInformationPath("technician", profile.user)).toBe(
      "/technician/contacts/directory/2",
    );
  });

  it("does not reveal unknown or privacy-hidden group identities", () => {
    expect(resolveImContactInformationPath("user", undefined)).toBeUndefined();
    expect(resolveImContactInformationPath("user", profile.user, true)).toBeUndefined();
  });
});
