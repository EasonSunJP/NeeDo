import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("three-month simulation IM persistence", () => {
  const seedSource = readFileSync(
    resolve(__dirname, "../scripts/seed-three-month-simulation.ts"),
    "utf8"
  );
  const checkSource = readFileSync(
    resolve(__dirname, "../scripts/check-three-month-simulation.ts"),
    "utf8"
  );

  it("writes deterministic conversations, participants, contacts and messages to Prisma", () => {
    expect(seedSource).toContain("ConversationType.DIRECT");
    expect(seedSource).toContain("MessageType.TEXT");
    expect(seedSource).toContain("plan.conversations");
    expect(seedSource).toContain("plan.contacts");
    expect(seedSource).toContain("plan.messages");
    expect(seedSource).toContain('"lifedance_customer_service_seed"');
    expect(seedSource).toContain('"lifedance_staff_seed"');
    expect(seedSource).toContain('type === "admin"');
    expect(seedSource).toContain('"staff_operations"');
    expect(seedSource).toContain("lastReadAt");
    expect(seedSource).toContain("isPinned");
    expect(seedSource).toContain("isMuted");
    expect(seedSource).toContain("ConversationAccessPolicy.FRIENDSHIP_REQUIRED");
    expect(seedSource).toContain("friendshipPairKey");
    expect(seedSource).toContain("ownerIdentityId:");
    expect(seedSource).toContain("contactIdentityId:");
    expect(seedSource).toContain("identityId: firstIdentityId");
    expect(seedSource).toContain("identityId: secondIdentityId");
    expect(seedSource).toContain("senderIdentityId:");
    expect(seedSource).toContain("authorIdentityId:");
    expect(seedSource).toContain("followerIdentityId:");
    expect(seedSource).toContain("followingIdentityId:");
    expect(seedSource).toContain("recipientIdentityId:");
    expect(seedSource).toContain("actorIdentityId:");
    expect(seedSource).toContain("preserveExistingPasswords");
    expect(seedSource).toContain("existingPasswordsByEmail");
  });

  it("removes dependent reactions, user deletions and sync directives before replacing simulated IM", () => {
    const reactionCleanupIndex = seedSource.indexOf("messageReaction.deleteMany");
    const userDeletionCleanupIndex = seedSource.indexOf("messageUserDeletion.deleteMany");
    const deletionSyncCleanupIndex = seedSource.indexOf("imDeletionSync.deleteMany");
    const messageCleanupIndex = seedSource.indexOf("message.deleteMany");
    const conversationCleanupIndex = seedSource.indexOf("conversation.deleteMany");

    expect(reactionCleanupIndex).toBeGreaterThan(-1);
    expect(userDeletionCleanupIndex).toBeGreaterThan(reactionCleanupIndex);
    expect(messageCleanupIndex).toBeGreaterThan(userDeletionCleanupIndex);
    expect(deletionSyncCleanupIndex).toBeGreaterThan(userDeletionCleanupIndex);
    expect(conversationCleanupIndex).toBeGreaterThan(deletionSyncCleanupIndex);
  });

  it("keeps the shared formal customer preview account usable with profile and wallet data", () => {
    expect(seedSource).toContain('email: "customer@example.com"');
    expect(seedSource).toContain("previewCustomerProfile");
    expect(seedSource).toContain("previewCustomerWallet");
    expect(seedSource).toContain("const previewCustomerAccount = socialPlan.accounts.find(");
    expect(seedSource).toContain('account.email === "customer@example.com"');
    expect(seedSource).toContain(
      "const previewCustomerDisplayName = previewCustomerAccount.displayName;"
    );
    expect(seedSource).toContain("userExperienceAccount.upsert");
    expect(seedSource).toContain("experienceEligibleUsers");
  });

  it("links the fixed technician and merchant test accounts to the shared customer", () => {
    expect(seedSource).toContain('"technician@example.com"');
    expect(seedSource).toContain('"merchant@example.com"');
    expect(seedSource).toContain("fixedPreviewConversations");
    expect(seedSource).toContain("fixedPreviewContacts");
    expect(checkSource).toContain("fixedRealtimeContacts");
    expect(checkSource).toContain("fixedRealtimeConversations");
    expect(checkSource).toContain("activeExperienceAccounts");
  });

  it("keeps the focused customer-100 account linked to an expanded real IM dataset", () => {
    expect(seedSource).toContain('conversation.firstKey === "customer-100"');
    expect(checkSource).toContain('"sim.customer.100@needo.local"');
    expect(checkSource).toContain("focusedCustomerConversations");
    expect(checkSource).toContain("focusedCustomerContacts");
    expect(checkSource).toContain("focusedCustomerMessages");
  });

  it("makes the verification command reject missing persisted IM data", () => {
    expect(checkSource).toContain("simulationConversations");
    expect(checkSource).toContain("simulationMessages");
    expect(checkSource).toContain("simulationContacts");
    expect(checkSource).toContain("simulationContactSources");
    expect(checkSource).toContain("plan.conversations.length");
    expect(checkSource).toContain("plan.messages.length");
    expect(checkSource).toContain("plan.contacts.length");
    expect(checkSource).toContain("lifeDanceStaffConversations");
    expect(checkSource).toContain("lifeDanceStaffMessages");
    expect(checkSource).toContain("lifeDanceStaffContacts");
    expect(checkSource).toContain("staffOperations");
  });
});
