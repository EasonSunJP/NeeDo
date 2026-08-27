import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";

const MESSAGE_BATCH_SIZE = 500;
const FRONTEND_SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const IDENTIFIER_SNAPSHOT_KEYS = new Set([
  "needoid",
  "systemid",
  "useridlabel",
  "publicid",
  "senderneedoid",
  "recipientneedoid"
]);
const PUBLIC_IDENTIFIER_PATTERN = /^(?:n|u|s|b|o|needo|shop|owner|cs)\d{1,10}$/i;

type CountOnly<T extends { count: unknown }> = Pick<T, "count">;

export interface UnifiedIdentityAuditClient {
  user: CountOnly<PrismaClient["user"]>;
  userIdentity: Pick<PrismaClient["userIdentity"], "count" | "groupBy">;
  customerProfile: CountOnly<PrismaClient["customerProfile"]>;
  technicianProfile: CountOnly<PrismaClient["technicianProfile"]>;
  shop: CountOnly<PrismaClient["shop"]>;
  merchantAccount: CountOnly<PrismaClient["merchantAccount"]>;
  contact: CountOnly<PrismaClient["contact"]>;
  friendRequest: CountOnly<PrismaClient["friendRequest"]>;
  conversationParticipant: CountOnly<PrismaClient["conversationParticipant"]>;
  message: Pick<PrismaClient["message"], "count" | "findMany">;
  socialPost: CountOnly<PrismaClient["socialPost"]>;
  follow: CountOnly<PrismaClient["follow"]>;
  notification: CountOnly<PrismaClient["notification"]>;
  bookingOrder: CountOnly<PrismaClient["bookingOrder"]>;
  wallet: CountOnly<PrismaClient["wallet"]>;
  ledgerTransaction: CountOnly<PrismaClient["ledgerTransaction"]>;
}

export interface UnifiedIdentityAuditOptions {
  frontendSystemIdReferences?: number;
}

export interface UnresolvedOwnershipSummary {
  model: string;
  relation: string;
  recordCount: number;
  targetHint: "U_OR_NEEDO" | "S" | "B" | "O" | "IDENTITY_CONTEXT_REQUIRED";
  reason: string;
}

export interface UnifiedIdentityCutoverAuditReport {
  generatedAt: string;
  mode: "read_only";
  legacyIdentifierCounts: {
    userNeedoId: number;
    frontendSystemIdReferences: number;
    persistedMessageIdentifierSnapshots: number;
  };
  modelCoverage: Record<string, number>;
  identityTypeCounts: Record<string, number>;
  unresolvedOwnership: UnresolvedOwnershipSummary[];
  mutatedRows: 0;
}

interface OwnershipCount {
  model: string;
  relation: string;
  recordCount: number;
  targetHint: UnresolvedOwnershipSummary["targetHint"];
  reason: string;
}

const countModelCoverage = async (
  client: UnifiedIdentityAuditClient
): Promise<Record<string, number>> => ({
  User: await client.user.count(),
  UserIdentity: await client.userIdentity.count(),
  CustomerProfile: await client.customerProfile.count(),
  TechnicianProfile: await client.technicianProfile.count(),
  Shop: await client.shop.count(),
  MerchantAccount: await client.merchantAccount.count(),
  Contact: await client.contact.count(),
  FriendRequest: await client.friendRequest.count(),
  ConversationParticipant: await client.conversationParticipant.count(),
  Message: await client.message.count(),
  SocialPost: await client.socialPost.count(),
  Follow: await client.follow.count(),
  Notification: await client.notification.count(),
  BookingOrder: await client.bookingOrder.count(),
  Wallet: await client.wallet.count(),
  LedgerTransaction: await client.ledgerTransaction.count()
});

const countIdentityTypes = async (
  client: UnifiedIdentityAuditClient
): Promise<Record<string, number>> => {
  const rows = await client.userIdentity.groupBy({
    by: ["type"],
    where: { isActive: true, deletedAt: null },
    _count: { _all: true }
  });

  return Object.fromEntries(rows.map((row) => [row.type, row._count._all]));
};

const containsIdentifierSnapshot = (value: unknown, parentKey?: string): boolean => {
  if (typeof value === "string") {
    return (
      (parentKey !== undefined && IDENTIFIER_SNAPSHOT_KEYS.has(parentKey.toLowerCase())) ||
      PUBLIC_IDENTIFIER_PATTERN.test(value)
    );
  }

  if (Array.isArray(value)) {
    return value.some((entry) => containsIdentifierSnapshot(entry, parentKey));
  }

  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([key, entry]) => containsIdentifierSnapshot(entry, key));
  }

  return false;
};

const countPersistedMessageIdentifierSnapshots = async (
  client: UnifiedIdentityAuditClient
): Promise<number> => {
  let cursorId: number | undefined;
  let snapshotCount = 0;

  while (true) {
    const rows = await client.message.findMany({
      select: { id: true, metadata: true },
      orderBy: { id: "asc" },
      take: MESSAGE_BATCH_SIZE,
      ...(cursorId === undefined ? {} : { cursor: { id: cursorId }, skip: 1 })
    });

    snapshotCount += rows.filter((row) => containsIdentifierSnapshot(row.metadata)).length;

    if (rows.length < MESSAGE_BATCH_SIZE) {
      break;
    }

    cursorId = rows.at(-1)?.id;
    if (cursorId === undefined) {
      break;
    }
  }

  return snapshotCount;
};

const readOwnershipCounts = async (
  client: UnifiedIdentityAuditClient,
  modelCoverage: Record<string, number>
): Promise<OwnershipCount[]> => {
  const shopOwners = await client.shop.count({ where: { ownerUserId: { not: null } } });
  const merchantOwners = await client.merchantAccount.count({
    where: { ownerUserId: { not: null } }
  });
  const messageSenders = await client.message.count({
    where: { senderUserId: { not: null } }
  });
  const notificationActors = await client.notification.count({
    where: { actorUserId: { not: null } }
  });
  const userWallets = await client.wallet.count({ where: { ownerType: "USER" } });
  const ledgerActors = await client.ledgerTransaction.count({
    where: { actorUserId: { not: null } }
  });

  return [
    {
      model: "User",
      relation: "primaryIdentity",
      recordCount: modelCoverage.User,
      targetHint: "U_OR_NEEDO",
      reason: "The legacy account has no authoritative flag that distinguishes U from NEEDO."
    },
    {
      model: "UserIdentity",
      relation: "type",
      recordCount: modelCoverage.UserIdentity,
      targetHint: "IDENTITY_CONTEXT_REQUIRED",
      reason: "Legacy free-form identity types must be mapped to the approved U/NEEDO/S/B/O set."
    },
    {
      model: "CustomerProfile",
      relation: "userId",
      recordCount: modelCoverage.CustomerProfile,
      targetHint: "U_OR_NEEDO",
      reason: "Profile ownership is account-level and has no identity foreign key."
    },
    {
      model: "TechnicianProfile",
      relation: "userId",
      recordCount: modelCoverage.TechnicianProfile,
      targetHint: "S",
      reason: "Profile ownership is account-level and has no S identity foreign key."
    },
    {
      model: "Shop",
      relation: "ownerUserId",
      recordCount: shopOwners,
      targetHint: "O",
      reason: "Shop ownership points to an account rather than an O identity."
    },
    {
      model: "MerchantAccount",
      relation: "ownerUserId",
      recordCount: merchantOwners,
      targetHint: "O",
      reason: "Merchant ownership points to an account rather than an O identity."
    },
    {
      model: "Contact",
      relation: "ownerUserId",
      recordCount: modelCoverage.Contact,
      targetHint: "IDENTITY_CONTEXT_REQUIRED",
      reason: "The owner identity used when the contact was created was not persisted."
    },
    {
      model: "Contact",
      relation: "contactUserId",
      recordCount: modelCoverage.Contact,
      targetHint: "IDENTITY_CONTEXT_REQUIRED",
      reason: "The contacted identity was not persisted."
    },
    {
      model: "FriendRequest",
      relation: "requesterUserId,targetUserId",
      recordCount: modelCoverage.FriendRequest,
      targetHint: "IDENTITY_CONTEXT_REQUIRED",
      reason: "Friend applications currently identify both sides only by account."
    },
    {
      model: "ConversationParticipant",
      relation: "userId",
      recordCount: modelCoverage.ConversationParticipant,
      targetHint: "IDENTITY_CONTEXT_REQUIRED",
      reason: "Conversation participation does not record the active identity."
    },
    {
      model: "Message",
      relation: "senderUserId",
      recordCount: messageSenders,
      targetHint: "IDENTITY_CONTEXT_REQUIRED",
      reason: "Message sender identity cannot be derived safely from account ownership alone."
    },
    {
      model: "SocialPost",
      relation: "authorUserId",
      recordCount: modelCoverage.SocialPost,
      targetHint: "IDENTITY_CONTEXT_REQUIRED",
      reason: "Social posts do not persist which identity authored the post."
    },
    {
      model: "Follow",
      relation: "followerUserId,followingUserId",
      recordCount: modelCoverage.Follow,
      targetHint: "IDENTITY_CONTEXT_REQUIRED",
      reason: "Both sides of a follow relation are account-level."
    },
    {
      model: "Notification",
      relation: "recipientUserId",
      recordCount: modelCoverage.Notification,
      targetHint: "IDENTITY_CONTEXT_REQUIRED",
      reason: "Notification delivery ownership is account-level."
    },
    {
      model: "Notification",
      relation: "actorUserId",
      recordCount: notificationActors,
      targetHint: "IDENTITY_CONTEXT_REQUIRED",
      reason: "Notification actor identity was not persisted."
    },
    {
      model: "BookingOrder",
      relation: "customerUserId",
      recordCount: modelCoverage.BookingOrder,
      targetHint: "U_OR_NEEDO",
      reason:
        "Order customer ownership is account-level and must be attached to the primary identity."
    },
    {
      model: "Wallet",
      relation: "ownerId",
      recordCount: userWallets,
      targetHint: "IDENTITY_CONTEXT_REQUIRED",
      reason: "USER wallets are account-level while NDP must be isolated per identity."
    },
    {
      model: "LedgerTransaction",
      relation: "actorUserId",
      recordCount: ledgerActors,
      targetHint: "IDENTITY_CONTEXT_REQUIRED",
      reason: "Ledger actor identity is not persisted separately from the login account."
    }
  ];
};

export const auditUnifiedIdentityCutover = async (
  client: UnifiedIdentityAuditClient,
  options: UnifiedIdentityAuditOptions = {}
): Promise<UnifiedIdentityCutoverAuditReport> => {
  const modelCoverage = await countModelCoverage(client);
  const userNeedoId = await client.user.count({
    where: {
      needoId: { startsWith: "n" },
      NOT: { needoId: { startsWith: "needo" } }
    }
  });
  const identityTypeCounts = await countIdentityTypes(client);
  const persistedMessageIdentifierSnapshots =
    await countPersistedMessageIdentifierSnapshots(client);
  const ownershipCounts = await readOwnershipCounts(client, modelCoverage);

  return {
    generatedAt: new Date().toISOString(),
    mode: "read_only",
    legacyIdentifierCounts: {
      userNeedoId,
      frontendSystemIdReferences: options.frontendSystemIdReferences ?? 0,
      persistedMessageIdentifierSnapshots
    },
    modelCoverage,
    identityTypeCounts,
    unresolvedOwnership: ownershipCounts.filter((entry) => entry.recordCount > 0),
    mutatedRows: 0
  };
};

const listSourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(entryPath)));
    } else if (entry.isFile() && FRONTEND_SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
};

export const countFrontendSystemIdReferences = async (sourceRoot: string): Promise<number> => {
  const sourceFiles = await listSourceFiles(sourceRoot);
  let count = 0;

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, "utf8");
    count += source.match(/\bsystemId\b/g)?.length ?? 0;
  }

  return count;
};

export const formatUnifiedIdentityAuditMarkdown = (
  report: UnifiedIdentityCutoverAuditReport
): string => {
  const coverageRows = Object.entries(report.modelCoverage)
    .map(([model, count]) => `| ${model} | ${count} |`)
    .join("\n");
  const unresolvedRows = report.unresolvedOwnership
    .map(
      (entry) =>
        `| ${entry.model} | ${entry.relation} | ${entry.recordCount} | ${entry.targetHint} |`
    )
    .join("\n");

  return [
    "# Unified Identity Cutover Read-only Audit",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Mode: ${report.mode}`,
    `- Mutated rows: ${report.mutatedRows}`,
    `- Legacy User.needoId rows: ${report.legacyIdentifierCounts.userNeedoId}`,
    `- Frontend systemId references: ${report.legacyIdentifierCounts.frontendSystemIdReferences}`,
    `- Message identifier snapshots: ${report.legacyIdentifierCounts.persistedMessageIdentifierSnapshots}`,
    "",
    "## Model coverage",
    "",
    "| Model | Rows |",
    "| --- | ---: |",
    coverageRows,
    "",
    "## Ownership requiring cutover mapping",
    "",
    "| Model | Legacy relation | Rows | Target hint |",
    "| --- | --- | ---: | --- |",
    unresolvedRows || "| None | None | 0 | None |"
  ].join("\n");
};

const main = async (): Promise<void> => {
  if (!process.argv.includes("--dry-run")) {
    throw new Error("Unified identity cutover audit requires the --dry-run guard.");
  }

  const [{ prisma, disconnectPrisma }] = await Promise.all([import("../src/prisma/client")]);

  try {
    const frontendSystemIdReferences = await countFrontendSystemIdReferences(
      resolve(__dirname, "../../src")
    );
    const report = await auditUnifiedIdentityCutover(prisma, {
      frontendSystemIdReferences
    });

    console.log(JSON.stringify(report, null, 2));
    console.log("\n--- MARKDOWN SUMMARY ---\n");
    console.log(formatUnifiedIdentityAuditMarkdown(report));
  } finally {
    await disconnectPrisma();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
