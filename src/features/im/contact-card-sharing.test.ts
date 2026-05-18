import { describe, expect, it } from "vitest";
import type { ContactRelation } from "./model";
import { buildShareableCardUsers, getShareableCardCaptionPrefix } from "./contact-card-sharing";
import { makeScopedImDatabase } from "./seed";

function activeContactMap(contacts: ContactRelation[]) {
  return new Map(
    contacts
      .filter((contact) => contact.relationStatus === "active" && !contact.isBlocked)
      .map((contact) => [contact.targetUserId, contact])
  );
}

describe("contact-card sharing", () => {
  it("pins the current user's own card first outside merchant scope", () => {
    const database = makeScopedImDatabase("user");
    const users = buildShareableCardUsers({
      activeContactByUserId: activeContactMap(database.contacts),
      currentUserId: database.currentUserId,
      scope: "user",
      users: database.users
    });
    const currentUser = database.users.find((user) => user.id === database.currentUserId);

    expect(users[0]?.id).toBe(database.currentUserId);
    expect(getShareableCardCaptionPrefix("user", users[0]!, database.currentUserId, currentUser)).toBe("我的名片");
  });

  it("pins the current account store card before a merchant personal operator card", () => {
    const database = makeScopedImDatabase("merchant");
    const storeUser = database.users.find((user) => user.id === database.currentUserId)!;
    const operatorUser = {
      ...storeUser,
      id: "im-merchant-personal-operator",
      nickname: "门店值班账号",
      profileKind: "person" as const,
      entityType: "user" as const,
      entityId: "merchant-operator-1",
      tags: ["本人"]
    };
    const users = [operatorUser, ...database.users];
    const shareableUsers = buildShareableCardUsers({
      activeContactByUserId: activeContactMap(database.contacts),
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
