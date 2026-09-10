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
  });

  it("removes dependent message reactions before replacing simulated messages", () => {
    const reactionCleanupIndex = seedSource.indexOf("messageReaction.deleteMany");
    const messageCleanupIndex = seedSource.indexOf("message.deleteMany");

    expect(reactionCleanupIndex).toBeGreaterThan(-1);
    expect(messageCleanupIndex).toBeGreaterThan(reactionCleanupIndex);
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
    expect(seedSource).toContain("ownerIdentityId: getParticipantIdentityId");
    expect(seedSource).toContain("contactIdentityId: getParticipantIdentityId");
    expect(seedSource).toContain('key === fixedMerchantKey');
    expect(seedSource).toContain('? "merchant"');
    expect(seedSource).toContain("`${contact.ownerIdentityId}:${contact.contactIdentityId}`");
    expect(seedSource).toContain('accessPolicy: "BUSINESS_CONTEXT"');
    expect(seedSource).toContain("createdByIdentityId: firstIdentityId");
    expect(seedSource).toContain("identityId: firstIdentityId");
    expect(seedSource).toContain("identityId: secondIdentityId");
    expect(seedSource).toContain("senderIdentityId: getParticipantIdentityId");
    expect(seedSource).toContain("socialIdentityIdByKey");
    expect(seedSource).toContain("authorIdentityId: getRequiredId");
    expect(seedSource).toContain("followerIdentityId: getRequiredId");
    expect(seedSource).toContain("followingIdentityId: getRequiredId");
    expect(seedSource).toContain('recipientIdentityId: getParticipantIdentityId("customer"');
    expect(seedSource).toContain('actorIdentityId: getParticipantIdentityId("shop_owner"');
    expect(checkSource).toContain("fixedRealtimeContacts");
    expect(checkSource).toContain("fixedRealtimeConversations");
    expect(checkSource).toContain("fixedSeedConversations");
    expect(checkSource).toContain("ownerIdentityId: fixedCustomerIdentityId");
    expect(checkSource).toContain("metadata.messageKey.startsWith(counterpart.messagePrefix)");
    expect(checkSource).toContain("activeExperienceAccounts");
    expect(checkSource).toContain("const getRequiredId = <Key, Value>");
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
    expect(checkSource).toContain("plan.conversations.length");
    expect(checkSource).toContain("plan.messages.length");
    expect(checkSource).toContain("plan.contacts.length");
    expect(checkSource).toContain("lifeDanceStaffConversations");
    expect(checkSource).toContain("lifeDanceStaffMessages");
    expect(checkSource).toContain("lifeDanceStaffContacts");
    expect(checkSource).toContain("staffOperations");
  });
});
