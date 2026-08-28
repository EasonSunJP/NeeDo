import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("affiliate alliance schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

  it("adds alliance as a separate wallet owner", () => {
    expect(schema).toMatch(/enum WalletOwnerType[\s\S]*ALLIANCE\s+@map\("alliance"\)/);
  });

  it("defines versioned, soft-deletable alliance and membership records", () => {
    expect(schema).toMatch(
      /enum AffiliateAllianceStatus[\s\S]*ACTIVE[\s\S]*SUSPENDED[\s\S]*CLOSED/
    );
    expect(schema).toMatch(
      /enum AffiliateAllianceMemberRole[\s\S]*OWNER[\s\S]*PARTNER[\s\S]*SUBORDINATE/
    );

    for (const model of ["AffiliateAlliance", "AffiliateAllianceMember"]) {
      expect(schema).toMatch(
        new RegExp(
          `model ${model} \\{[\\s\\S]*id\\s+Int[\\s\\S]*version\\s+Int[\\s\\S]*createdAt[\\s\\S]*updatedAt[\\s\\S]*deletedAt`
        )
      );
    }

    expect(schema).toMatch(
      /model AffiliateAlliance[\s\S]*ownerUserId\s+Int[\s\S]*defaultPromoterShareBps\s+Int/
    );
    expect(schema).toMatch(
      /model AffiliateAllianceMember[\s\S]*parentMemberId\s+Int\?[\s\S]*promoterShareBpsOverride\s+Int\?[\s\S]*activeKey\s+String\?[\s\S]*@unique/
    );
  });

  it("stores the five explicit member permissions", () => {
    expect(schema).toMatch(
      /model AffiliateAlliancePermission[\s\S]*id\s+Int[\s\S]*memberId\s+Int[\s\S]*@unique[\s\S]*canClaimTasks\s+Boolean[\s\S]*canViewAllianceOverview\s+Boolean[\s\S]*canViewMemberDetails\s+Boolean[\s\S]*canManageOwnSubordinates\s+Boolean[\s\S]*canViewAllianceWallet\s+Boolean[\s\S]*createdAt[\s\S]*updatedAt[\s\S]*deletedAt/
    );
  });

  it("indexes alliance ownership, memberships, hierarchy, and soft deletion", () => {
    expect(schema).toMatch(
      /model AffiliateAlliance[\s\S]*@@index\(\[ownerUserId\]\)[\s\S]*@@index\(\[status\]\)[\s\S]*@@index\(\[deletedAt\]\)/
    );
    expect(schema).toMatch(
      /model AffiliateAllianceMember[\s\S]*@@index\(\[allianceId, role\]\)[\s\S]*@@index\(\[userId\]\)[\s\S]*@@index\(\[parentMemberId\]\)[\s\S]*@@index\(\[deletedAt\]\)/
    );
    expect(schema).toMatch(
      /model AffiliateAlliancePermission[\s\S]*@@index\(\[deletedAt\]\)/
    );
    expect(schema).toMatch(/ownedAffiliateAlliances\s+AffiliateAlliance\[\]/);
    expect(schema).toMatch(/affiliateAllianceMemberships\s+AffiliateAllianceMember\[\]/);
  });

  it("defines durable versioned alliance invitations and their state machine", () => {
    expect(schema).toMatch(
      /enum AffiliateAllianceInvitationRole[\s\S]*PARTNER\s+@map\("partner"\)[\s\S]*SUBORDINATE\s+@map\("subordinate"\)/
    );
    expect(schema).toMatch(
      /enum AffiliateAllianceInvitationStatus[\s\S]*PENDING\s+@map\("pending"\)[\s\S]*ACCEPTED\s+@map\("accepted"\)[\s\S]*REJECTED\s+@map\("rejected"\)[\s\S]*EXPIRED\s+@map\("expired"\)/
    );
    expect(schema).toMatch(
      /model AffiliateAllianceInvitation \{[\s\S]*id\s+Int[\s\S]*allianceId\s+Int[\s\S]*inviterMemberId\s+Int[\s\S]*inviteeUserId\s+Int[\s\S]*role\s+AffiliateAllianceInvitationRole[\s\S]*proposedParentMemberId\s+Int\?[\s\S]*status\s+AffiliateAllianceInvitationStatus[\s\S]*pendingKey\s+String\?[\s\S]*@unique[\s\S]*expiresAt\s+DateTime[\s\S]*respondedAt\s+DateTime\?[\s\S]*expiredAt\s+DateTime\?[\s\S]*version\s+Int[\s\S]*createdAt[\s\S]*updatedAt[\s\S]*deletedAt/
    );
  });

  it("indexes invitation owner, recipient, expiry, parent, and soft deletion queries", () => {
    expect(schema).toMatch(
      /model AffiliateAllianceInvitation[\s\S]*@@index\(\[allianceId, status, createdAt\]\)[\s\S]*@@index\(\[inviteeUserId, status, createdAt\]\)[\s\S]*@@index\(\[status, expiresAt, id\]\)[\s\S]*@@index\(\[inviterMemberId\]\)[\s\S]*@@index\(\[proposedParentMemberId\]\)[\s\S]*@@index\(\[deletedAt\]\)/
    );
    expect(schema).toMatch(/affiliateAllianceInvitations\s+AffiliateAllianceInvitation\[\]/);
    expect(schema).toMatch(/sentAffiliateAllianceInvitations\s+AffiliateAllianceInvitation\[\]/);
    expect(schema).toMatch(/parentedAffiliateAllianceInvitations\s+AffiliateAllianceInvitation\[\]/);
    expect(schema).toMatch(/receivedAffiliateAllianceInvitations\s+AffiliateAllianceInvitation\[\]/);
  });
});
