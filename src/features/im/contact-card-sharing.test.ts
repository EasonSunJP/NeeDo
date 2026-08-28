import { describe, expect, it } from "vitest";
import type { ContactRelation, ImUser } from "./model";
import { buildShareableCardUsers, getShareableCardCaptionPrefix } from "./contact-card-sharing";

function activeContactMap(contacts: ContactRelation[]) {
  return new Map(
    contacts
      .filter((contact) => contact.relationStatus === "active" && !contact.isBlocked)
      .map((contact) => [contact.targetUserId, contact])
  );
}

describe("contact-card sharing", () => {
  it("pins the current user's own card first outside merchant scope", () => {
    const currentUser = makeUser({ id: "1", accountId: "u1234567890", userIdLabel: "u1234567890" });
    const users = buildShareableCardUsers({
      activeContactByUserId: activeContactMap([]),
      currentUserId: currentUser.id,
      scope: "user",
      users: [currentUser]
    });

    expect(users[0]?.id).toBe(currentUser.id);
    expect(getShareableCardCaptionPrefix("user", users[0]!, currentUser.id, currentUser)).toBe("我的名片");
  });

  it("pins the current account store card before a merchant personal operator card", () => {
    const storeUser = makeUser({
      id: "2",
      accountId: "b1234567890",
      nickname: "测试店铺",
      profileKind: "store",
      entityType: "shop",
      entityId: "12",
      userIdLabel: "b1234567890"
    });
    const operatorUser = makeUser({
      id: "im-merchant-personal-operator",
      nickname: "门店值班账号",
      accountId: storeUser.accountId,
      profileKind: "person",
      entityType: "user",
      entityId: "merchant-operator-1",
      tags: ["本人"],
      userIdLabel: "u1234567890"
    });
    const users = [operatorUser, storeUser];
    const shareableUsers = buildShareableCardUsers({
      activeContactByUserId: activeContactMap([]),
      currentUserId: operatorUser.id,
      scope: "merchant",
      users
    });

    expect(shareableUsers[0]?.id).toBe(storeUser.id);
    expect(shareableUsers[1]?.id).toBe(operatorUser.id);
    expect(getShareableCardCaptionPrefix("merchant", shareableUsers[0]!, operatorUser.id, operatorUser)).toBe("当前店铺名片");
    expect(getShareableCardCaptionPrefix("merchant", shareableUsers[1]!, operatorUser.id, operatorUser)).toBe("我的名片");
  });
});

function makeUser(overrides: Partial<ImUser> & Pick<ImUser, "id" | "accountId" | "userIdLabel">): ImUser {
  return {
    id: overrides.id,
    accountId: overrides.accountId,
    nickname: overrides.nickname ?? "测试账号",
    avatar: "",
    status: "active",
    searchableFields: [],
    sortKey: overrides.nickname ?? "test",
    profileKind: overrides.profileKind ?? "person",
    entityType: overrides.entityType,
    entityId: overrides.entityId,
    tags: overrides.tags ?? [],
    userIdLabel: overrides.userIdLabel,
    canCall: true,
    canVideoCall: true,
  };
}
