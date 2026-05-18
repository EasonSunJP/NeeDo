import { describe, expect, it } from "vitest";
import { customers, demoTechnicianAvatar, technicians } from "../../data/mock";
import { getMerchantCustomerConversationId, getTechnicianStoreConversationId, getTechnicianSupportConversationId } from "../../lib/messageCenter";
import { syncImDatabaseWithAccountEntities } from "./account-sync";
import { makeScopedImDatabase } from "./seed";

describe("scoped im seed", () => {
  it("keeps customer and technician avatars distinct in demo accounts", () => {
    const accountAvatars = [...customers.map((customer) => customer.avatar), ...technicians.map((technician) => technician.avatar)];
    const noah = customers.find((customer) => customer.name === "Noah Chen");

    expect(technicians[0]?.avatar).toBe(demoTechnicianAvatar);
    expect(noah?.avatar).not.toBe(technicians[0]?.avatar);
    expect(new Set(accountAvatars).size).toBe(accountAvatars.length);
  });

  it("builds merchant conversations with legacy-compatible ids", () => {
    const database = makeScopedImDatabase("merchant");

    expect(database.currentUserId).toBe("im-merchant-self");
    expect(database.conversations.some((conversation) => conversation.id === getMerchantCustomerConversationId("cus-1"))).toBe(true);
    expect(database.conversations.some((conversation) => conversation.id === "merchant-support")).toBe(true);
  });

  it("does not seed contact-list captions with order or acceptance metrics", () => {
    const merchantDatabase = makeScopedImDatabase("merchant");
    const technicianDatabase = makeScopedImDatabase("technician");
    const metricPattern = /\d+\s*单|活跃分|%\s*接单|接单率|最近下单/;

    expect(merchantDatabase.contacts.map((contact) => contact.description ?? "").filter(Boolean).join(" ")).not.toMatch(metricPattern);
    expect(technicianDatabase.contacts.map((contact) => contact.description ?? "").filter(Boolean).join(" ")).not.toMatch(metricPattern);
    expect(merchantDatabase.users.map((user) => user.signature ?? "").filter(Boolean).join(" ")).not.toMatch(metricPattern);
    expect(technicianDatabase.users.map((user) => user.signature ?? "").filter(Boolean).join(" ")).not.toMatch(metricPattern);
  });

  it("builds technician conversations with shared store and support channels", () => {
    const database = makeScopedImDatabase("technician");

    expect(database.currentUserId).toBe("im-technician-self");
    expect(database.conversations.some((conversation) => conversation.id === getTechnicianStoreConversationId())).toBe(true);
    expect(database.conversations.some((conversation) => conversation.id === getTechnicianSupportConversationId())).toBe(true);
  });

  it("attaches unified entity metadata to the user scope seed", () => {
    const database = makeScopedImDatabase("user");
    const currentUser = database.users.find((user) => user.id === database.currentUserId);
    const technicianUser = database.users.find((user) => user.id === "im-tech-1");
    const storeUser = database.users.find((user) => user.id === "im-store-1");

    expect(currentUser?.nickname).toBe(customers[0]?.nickname);
    expect(currentUser?.avatar).toBe(customers[0]?.avatar);
    expect(currentUser?.entityType).toBe("user");
    expect(currentUser?.entityId).toBe(customers[0]?.id);
    expect(technicianUser?.entityType).toBe("technician");
    expect(technicianUser?.entityId).toBe("tech-1");
    expect(storeUser?.entityType).toBe("shop");
    expect(storeUser?.entityId).toBe("store-1");
  });

  it("repairs stale persisted current-account names in user IM data", () => {
    const database = makeScopedImDatabase("user");
    const currentUser = database.users.find((user) => user.id === database.currentUserId)!;
    const selfGroupMessage = database.messages.find((message) => message.senderId === database.currentUserId && message.ext?.groupSenderName);

    currentUser.nickname = "林 夏子";
    currentUser.avatar = "https://example.com/stale-avatar.jpg";

    if (selfGroupMessage?.ext) {
      selfGroupMessage.ext.groupSenderName = "林 夏子";
    }

    const { database: syncedDatabase, changed } = syncImDatabaseWithAccountEntities("user", database);
    const syncedUser = syncedDatabase.users.find((user) => user.id === syncedDatabase.currentUserId);
    const syncedSelfGroupMessage = syncedDatabase.messages.find((message) => message.id === selfGroupMessage?.id);

    expect(changed).toBe(true);
    expect(syncedUser?.nickname).toBe(customers[0]?.nickname);
    expect(syncedUser?.avatar).toBe(customers[0]?.avatar);
    expect(syncedSelfGroupMessage?.ext?.groupSenderName).toBe(customers[0]?.nickname);
  });
});
