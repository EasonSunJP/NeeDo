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
});
