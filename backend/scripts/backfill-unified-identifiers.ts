import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  IdentifierAllocator,
  formatPersonId,
  type PersonAliasIdentifierKind,
  type PublicIdentifierCreateInput
} from "../src/services/public-identifier.service";
import { identifierNumberPartSchema } from "../src/validators/public-identifier.validator";

export type UnifiedIdentifierPrimaryKind = "U" | "NEEDO";
export type UnifiedIdentifierAliasKind = PersonAliasIdentifierKind;
export type UnifiedIdentifierBackfillMode = "dry-run" | "apply";

export interface UnifiedIdentifierSnapshot {
  publicId: string;
  numberPart: string;
  kind:
    | UnifiedIdentifierPrimaryKind
    | UnifiedIdentifierAliasKind
    | "SHOP"
    | "OWNER"
    | "CUSTOMER_SUPPORT";
  status?: "ACTIVE" | "DISABLED" | "TOMBSTONED";
  deletedAt?: Date | null;
}

export interface UnifiedIdentifierIdentitySnapshot {
  id: number;
  type: string;
  scopeType: string | null;
  scopeId: number | null;
  isDefault: boolean;
  isActive: boolean;
  publicIdentifier: UnifiedIdentifierSnapshot | null;
}

export interface UnifiedIdentifierRoleAssignmentSnapshot {
  code: string;
  scopeType: string | null;
  scopeId: number | null;
}

export interface UnifiedIdentifierUserSnapshot {
  id: number;
  email: string;
  needoId: string;
  accountNo: string | null;
  primaryIdentityType: UnifiedIdentifierPrimaryKind | null;
  identities: UnifiedIdentifierIdentitySnapshot[];
  roleAssignments: UnifiedIdentifierRoleAssignmentSnapshot[];
  hasActiveTechnicianProfile: boolean;
  ownedMerchantAccountIds: number[];
}

export interface UnifiedIdentifierShopSnapshot {
  id: number;
  shopNo: string | null;
  publicIdentifier: UnifiedIdentifierSnapshot | null;
  customerSupportAccount: {
    id: number;
    type: "SHOP" | "NEEDO_OFFICIAL";
    isActive?: boolean;
    deletedAt?: Date | null;
    publicIdentifier: UnifiedIdentifierSnapshot | null;
  } | null;
}

export interface UnifiedIdentifierMerchantSnapshot {
  id: number;
  ownerNo: string | null;
  publicIdentifier: UnifiedIdentifierSnapshot | null;
}

export interface UnifiedIdentifierBackfillBatch {
  users: UnifiedIdentifierUserSnapshot[];
  shops: UnifiedIdentifierShopSnapshot[];
  merchantAccounts: UnifiedIdentifierMerchantSnapshot[];
}

export type UnifiedIdentifierBackfillOperation =
  | {
      type: "ASSIGN_PRIMARY";
      userId: number;
      identityId: number | null;
      primaryKind: UnifiedIdentifierPrimaryKind;
      existingNumberPart?: string;
      createIdentity?: {
        type: "customer" | "platform";
      };
    }
  | {
      type: "ASSIGN_ALIAS";
      userId: number;
      identityId: number | null;
      aliasKind: UnifiedIdentifierAliasKind;
      createIdentity?: {
        type: string;
        scopeType: string;
        scopeId: number | null;
      };
    }
  | {
      type: "ASSIGN_MERCHANT";
      merchantAccountId: number;
      existingNumberPart?: string;
    }
  | {
      type: "ASSIGN_SHOP_SUPPORT";
      shopId: number;
      existingNumberPart?: string;
    };

export interface UnifiedIdentifierBackfillIssue {
  entity: "User" | "Shop" | "MerchantAccount";
  entityId: number;
  code: string;
  reason: string;
}

export interface UnifiedIdentifierBackfillPlan {
  operations: UnifiedIdentifierBackfillOperation[];
  issues: UnifiedIdentifierBackfillIssue[];
}

export interface UnifiedIdentifierBackfillRuntime {
  scan(batchSize: number): AsyncIterable<UnifiedIdentifierBackfillBatch>;
  applyOperations(operations: readonly UnifiedIdentifierBackfillOperation[]): Promise<number>;
}

export interface UnifiedIdentifierBackfillOptions {
  mode: UnifiedIdentifierBackfillMode;
  batchSize: number;
}

interface UnifiedIdentifierBackfillCounts {
  batches: number;
  users: number;
  shops: number;
  merchantAccounts: number;
  pendingOperations: number;
  pendingByType: Record<UnifiedIdentifierBackfillOperation["type"], number>;
}

export interface UnifiedIdentifierBackfillReport {
  generatedAt: string;
  mode: UnifiedIdentifierBackfillMode;
  batchSize: number;
  plannedOperations: number;
  mutatedRows: number;
  before: UnifiedIdentifierBackfillCounts;
  after: UnifiedIdentifierBackfillCounts;
  issues: UnifiedIdentifierBackfillIssue[];
}

interface PlanSummary {
  counts: UnifiedIdentifierBackfillCounts;
  issues: UnifiedIdentifierBackfillIssue[];
}

const PLATFORM_ROLE_CODES = new Set(["admin", "operator", "finance", "support"]);
const OFFICIAL_ACCOUNT_EMAIL_SUFFIX = "@lifedance.com";
const PLATFORM_IDENTITY_TYPES = new Set([
  "platform",
  "platform_admin",
  "admin",
  "operator",
  "finance",
  "support"
]);
const CUSTOMER_IDENTITY_TYPES = new Set(["customer", "user", "u"]);
const TECHNICIAN_IDENTITY_TYPES = new Set(["technician", "service", "s"]);
const MERCHANT_IDENTITY_TYPES = new Set([
  "merchant",
  "merchant_owner",
  "merchant_staff",
  "business",
  "b"
]);
const OWNER_IDENTITY_TYPES = new Set(["merchant_organization", "owner", "o"]);
const MERCHANT_SCOPE_TYPES = new Set(["merchant", "merchant_account"]);
const PUBLIC_IDENTIFIER_PREFIXES: Readonly<Record<UnifiedIdentifierSnapshot["kind"], string>> = {
  U: "u",
  NEEDO: "needo",
  S: "s",
  B: "b",
  O: "o",
  SHOP: "shop",
  OWNER: "owner",
  CUSTOMER_SUPPORT: "cs"
};

const emptyOperationCounts = (): UnifiedIdentifierBackfillCounts["pendingByType"] => ({
  ASSIGN_PRIMARY: 0,
  ASSIGN_ALIAS: 0,
  ASSIGN_MERCHANT: 0,
  ASSIGN_SHOP_SUPPORT: 0
});

const activeIdentities = (
  user: UnifiedIdentifierUserSnapshot
): UnifiedIdentifierIdentitySnapshot[] => user.identities.filter((identity) => identity.isActive);

const issue = (
  entity: UnifiedIdentifierBackfillIssue["entity"],
  entityId: number,
  code: string,
  reason: string
): UnifiedIdentifierBackfillIssue => ({ entity, entityId, code, reason });

const distinct = <T>(values: T[]): T[] => [...new Set(values)];

const hasInvalidIdentifierFormat = (identifier: UnifiedIdentifierSnapshot): boolean =>
  !identifierNumberPartSchema.safeParse(identifier.numberPart).success ||
  identifier.publicId !== `${PUBLIC_IDENTIFIER_PREFIXES[identifier.kind]}${identifier.numberPart}`;

const hasPlatformCompanySignal = (user: UnifiedIdentifierUserSnapshot): boolean =>
  user.roleAssignments.some(
    (assignment) =>
      PLATFORM_ROLE_CODES.has(assignment.code) &&
      (assignment.scopeType === null || assignment.scopeType === "global")
  ) || activeIdentities(user).some((identity) => PLATFORM_IDENTITY_TYPES.has(identity.type));

const hasOfficialAccountEmail = (user: UnifiedIdentifierUserSnapshot): boolean =>
  user.email.trim().toLowerCase().endsWith(OFFICIAL_ACCOUNT_EMAIL_SUFFIX);

const findExistingPersonnelIdentifier = (
  user: UnifiedIdentifierUserSnapshot,
  kinds: ReadonlySet<string>
): Array<{ identity: UnifiedIdentifierIdentitySnapshot; identifier: UnifiedIdentifierSnapshot }> =>
  activeIdentities(user).flatMap((identity) =>
    identity.publicIdentifier && kinds.has(identity.publicIdentifier.kind)
      ? [{ identity, identifier: identity.publicIdentifier }]
      : []
  );

const chooseSinglePrimaryIdentity = (
  user: UnifiedIdentifierUserSnapshot,
  primaryKind: UnifiedIdentifierPrimaryKind
): UnifiedIdentifierIdentitySnapshot | null => {
  const identities = activeIdentities(user);
  const preferredTypes =
    primaryKind === "NEEDO" ? PLATFORM_IDENTITY_TYPES : CUSTOMER_IDENTITY_TYPES;
  const preferred = identities.filter((identity) => preferredTypes.has(identity.type));
  if (preferred.length === 1) return preferred[0] ?? null;
  return null;
};

const validateKnownPersonnelNumber = (
  user: UnifiedIdentifierUserSnapshot,
  issues: UnifiedIdentifierBackfillIssue[]
): string | undefined => {
  const personnelKinds = new Set(["U", "NEEDO", "S", "B", "O"]);
  const knownNumbers = distinct([
    ...(user.accountNo ? [user.accountNo] : []),
    ...activeIdentities(user).flatMap((identity) =>
      identity.publicIdentifier && personnelKinds.has(identity.publicIdentifier.kind)
        ? [identity.publicIdentifier.numberPart]
        : []
    )
  ]);

  if (
    knownNumbers.some((numberPart) => !identifierNumberPartSchema.safeParse(numberPart).success)
  ) {
    issues.push(
      issue(
        "User",
        user.id,
        "INVALID_ACCOUNT_NUMBER",
        "A persisted account number is not exactly ten digits."
      )
    );
    return undefined;
  }
  if (knownNumbers.length > 1) {
    issues.push(
      issue(
        "User",
        user.id,
        "PERSONNEL_NUMBER_CONFLICT",
        "Personnel identifiers do not share one account number."
      )
    );
    return undefined;
  }
  return knownNumbers[0];
};

const planPrimaryIdentifier = (
  user: UnifiedIdentifierUserSnapshot,
  operations: UnifiedIdentifierBackfillOperation[],
  issues: UnifiedIdentifierBackfillIssue[]
): { primaryKind: UnifiedIdentifierPrimaryKind; knownNumberPart?: string } | null => {
  const platformCompany = hasPlatformCompanySignal(user);
  if (user.primaryIdentityType === "U" && hasOfficialAccountEmail(user)) {
    issues.push(
      issue(
        "User",
        user.id,
        "PRIMARY_KIND_CONFLICT",
        "An official lifedance.com account cannot use a U primary identifier."
      )
    );
    return null;
  }
  const primaryKind: UnifiedIdentifierPrimaryKind =
    user.primaryIdentityType ?? (platformCompany ? "NEEDO" : "U");
  const primaryIdentifiers = findExistingPersonnelIdentifier(user, new Set(["U", "NEEDO"]));
  if (primaryIdentifiers.length > 1) {
    issues.push(
      issue(
        "User",
        user.id,
        "MULTIPLE_PRIMARY_IDENTIFIERS",
        "More than one active U/NEEDO public identifier exists."
      )
    );
    return null;
  }
  if (primaryIdentifiers[0] && primaryIdentifiers[0].identifier.kind !== primaryKind) {
    issues.push(
      issue(
        "User",
        user.id,
        "PRIMARY_KIND_CONFLICT",
        "The persisted primary public identifier conflicts with the authoritative primary kind."
      )
    );
    return null;
  }

  const knownNumberPart = validateKnownPersonnelNumber(user, issues);
  if (issues.some((entry) => entry.entity === "User" && entry.entityId === user.id)) return null;

  const existingPrimary = primaryIdentifiers[0];
  const primaryIdentity =
    existingPrimary?.identity ?? chooseSinglePrimaryIdentity(user, primaryKind);
  const primaryIdentityTypes =
    primaryKind === "NEEDO" ? PLATFORM_IDENTITY_TYPES : CUSTOMER_IDENTITY_TYPES;
  const primaryIdentityCandidates = activeIdentities(user).filter((identity) =>
    primaryIdentityTypes.has(identity.type)
  );
  const createIdentity =
    !existingPrimary && primaryIdentityCandidates.length === 0
      ? { type: primaryKind === "NEEDO" ? ("platform" as const) : ("customer" as const) }
      : undefined;
  if (!primaryIdentity && !createIdentity) {
    issues.push(
      issue(
        "User",
        user.id,
        "AMBIGUOUS_PRIMARY_IDENTITY",
        "Exactly one authoritative active primary identity could not be selected."
      )
    );
    return null;
  }

  const primaryComplete =
    primaryIdentity !== null &&
    user.accountNo !== null &&
    user.primaryIdentityType === primaryKind &&
    existingPrimary?.identity.id === primaryIdentity.id &&
    existingPrimary.identifier.numberPart === user.accountNo &&
    user.needoId === existingPrimary.identifier.publicId &&
    primaryIdentity.isDefault;
  if (!primaryComplete) {
    operations.push({
      type: "ASSIGN_PRIMARY",
      userId: user.id,
      identityId: primaryIdentity?.id ?? null,
      primaryKind,
      ...(knownNumberPart ? { existingNumberPart: knownNumberPart } : {}),
      ...(createIdentity ? { createIdentity } : {})
    });
  }

  return { primaryKind, ...(knownNumberPart ? { knownNumberPart } : {}) };
};

const validateOrPlanAlias = (
  user: UnifiedIdentifierUserSnapshot,
  aliasKind: UnifiedIdentifierAliasKind,
  identity: UnifiedIdentifierIdentitySnapshot | null,
  knownNumberPart: string | undefined,
  operations: UnifiedIdentifierBackfillOperation[],
  issues: UnifiedIdentifierBackfillIssue[],
  createIdentity?: Extract<
    UnifiedIdentifierBackfillOperation,
    { type: "ASSIGN_ALIAS" }
  >["createIdentity"]
): void => {
  const existing = findExistingPersonnelIdentifier(user, new Set([aliasKind]));
  if (existing.length > 1) {
    issues.push(
      issue(
        "User",
        user.id,
        `MULTIPLE_${aliasKind}_IDENTIFIERS`,
        `More than one active ${aliasKind} identifier exists.`
      )
    );
    return;
  }
  if (existing[0]) {
    if (knownNumberPart && existing[0].identifier.numberPart !== knownNumberPart) {
      issues.push(
        issue(
          "User",
          user.id,
          `${aliasKind}_NUMBER_CONFLICT`,
          `${aliasKind} does not reuse the account number.`
        )
      );
    }
    return;
  }
  if (!identity && !createIdentity) {
    issues.push(
      issue(
        "User",
        user.id,
        `${aliasKind}_IDENTITY_MISSING`,
        `A real active identity target for ${aliasKind} was not found.`
      )
    );
    return;
  }
  operations.push({
    type: "ASSIGN_ALIAS",
    userId: user.id,
    identityId: identity?.id ?? null,
    aliasKind,
    ...(createIdentity ? { createIdentity } : {})
  });
};

const planPersonnelAliases = (
  user: UnifiedIdentifierUserSnapshot,
  knownNumberPart: string | undefined,
  operations: UnifiedIdentifierBackfillOperation[],
  issues: UnifiedIdentifierBackfillIssue[]
): void => {
  const identities = activeIdentities(user);
  const technicianIdentities = identities.filter((identity) =>
    TECHNICIAN_IDENTITY_TYPES.has(identity.type)
  );
  if (user.hasActiveTechnicianProfile) {
    validateOrPlanAlias(
      user,
      "S",
      technicianIdentities.length === 1 ? (technicianIdentities[0] ?? null) : null,
      knownNumberPart,
      operations,
      issues
    );
  }

  const hasShopRole = user.roleAssignments.some(
    (assignment) =>
      (assignment.code === "merchant_owner" || assignment.code === "merchant_staff") &&
      assignment.scopeType === "shop" &&
      assignment.scopeId !== null
  );
  const businessCandidates = identities
    .filter(
      (identity) =>
        MERCHANT_IDENTITY_TYPES.has(identity.type) &&
        identity.scopeType === "shop" &&
        identity.scopeId !== null
    )
    .sort((left, right) => left.id - right.id);
  const hasBusinessRelationship = hasShopRole || businessCandidates.length > 0;
  const existingBusiness = findExistingPersonnelIdentifier(user, new Set(["B"]))[0]?.identity;
  const businessIdentity = existingBusiness ?? businessCandidates[0] ?? null;
  if (hasBusinessRelationship) {
    validateOrPlanAlias(user, "B", businessIdentity, knownNumberPart, operations, issues);
  }

  const hasMerchantRole = user.roleAssignments.some(
    (assignment) =>
      assignment.code === "merchant_owner" &&
      assignment.scopeType !== null &&
      MERCHANT_SCOPE_TYPES.has(assignment.scopeType) &&
      assignment.scopeId !== null
  );
  if (user.ownedMerchantAccountIds.length > 0 || hasMerchantRole) {
    const existingOwner = findExistingPersonnelIdentifier(user, new Set(["O"]))[0]?.identity;
    const ownerCandidate = identities.find(
      (identity) =>
        identity.id !== businessIdentity?.id &&
        (OWNER_IDENTITY_TYPES.has(identity.type) ||
          (identity.type === "merchant_owner" &&
            identity.scopeType !== null &&
            (MERCHANT_SCOPE_TYPES.has(identity.scopeType) || identity.scopeType === "global")))
    );
    validateOrPlanAlias(
      user,
      "O",
      existingOwner ?? ownerCandidate ?? null,
      knownNumberPart,
      operations,
      issues,
      existingOwner || ownerCandidate
        ? undefined
        : { type: "merchant_organization", scopeType: "global", scopeId: null }
    );
  }
};

const planMerchantIdentifier = (
  merchant: UnifiedIdentifierMerchantSnapshot,
  operations: UnifiedIdentifierBackfillOperation[],
  issues: UnifiedIdentifierBackfillIssue[]
): void => {
  if (merchant.publicIdentifier && merchant.publicIdentifier.kind !== "OWNER") {
    issues.push(
      issue(
        "MerchantAccount",
        merchant.id,
        "MERCHANT_IDENTIFIER_KIND_CONFLICT",
        "MerchantAccount must use an OWNER public identifier."
      )
    );
    return;
  }
  const knownNumbers = distinct(
    [merchant.ownerNo, merchant.publicIdentifier?.numberPart].filter((value): value is string =>
      Boolean(value)
    )
  );
  if (knownNumbers.length > 1) {
    issues.push(
      issue(
        "MerchantAccount",
        merchant.id,
        "MERCHANT_NUMBER_CONFLICT",
        "ownerNo and OWNER public identifier do not match."
      )
    );
    return;
  }
  if (merchant.ownerNo && merchant.publicIdentifier) return;
  operations.push({
    type: "ASSIGN_MERCHANT",
    merchantAccountId: merchant.id,
    ...(knownNumbers[0] ? { existingNumberPart: knownNumbers[0] } : {})
  });
};

const planShopSupportIdentifier = (
  shop: UnifiedIdentifierShopSnapshot,
  operations: UnifiedIdentifierBackfillOperation[],
  issues: UnifiedIdentifierBackfillIssue[]
): void => {
  if (shop.publicIdentifier && shop.publicIdentifier.kind !== "SHOP") {
    issues.push(
      issue(
        "Shop",
        shop.id,
        "SHOP_IDENTIFIER_KIND_CONFLICT",
        "Shop must use a SHOP public identifier."
      )
    );
    return;
  }
  const support = shop.customerSupportAccount;
  if (support?.type === "NEEDO_OFFICIAL") {
    issues.push(
      issue(
        "Shop",
        shop.id,
        "SHOP_SUPPORT_TYPE_CONFLICT",
        "A Shop cannot use the NeeDo official support account."
      )
    );
    return;
  }
  if (support?.publicIdentifier && support.publicIdentifier.kind !== "CUSTOMER_SUPPORT") {
    issues.push(
      issue(
        "Shop",
        shop.id,
        "SUPPORT_IDENTIFIER_KIND_CONFLICT",
        "Shop support must use a CUSTOMER_SUPPORT public identifier."
      )
    );
    return;
  }
  const knownNumbers = distinct(
    [shop.shopNo, shop.publicIdentifier?.numberPart, support?.publicIdentifier?.numberPart].filter(
      (value): value is string => Boolean(value)
    )
  );
  if (knownNumbers.length > 1) {
    issues.push(
      issue(
        "Shop",
        shop.id,
        "SHOP_SUPPORT_NUMBER_CONFLICT",
        "shopNo, SHOP ID, and Customer Support ID must share one number."
      )
    );
    return;
  }
  if (shop.shopNo && shop.publicIdentifier && support?.publicIdentifier) return;
  operations.push({
    type: "ASSIGN_SHOP_SUPPORT",
    shopId: shop.id,
    ...(knownNumbers[0] ? { existingNumberPart: knownNumbers[0] } : {})
  });
};

export const buildUnifiedIdentifierBackfillPlan = (
  batch: UnifiedIdentifierBackfillBatch
): UnifiedIdentifierBackfillPlan => {
  const operations: UnifiedIdentifierBackfillOperation[] = [];
  const issues: UnifiedIdentifierBackfillIssue[] = [];

  for (const user of batch.users) {
    const malformedIdentifier = activeIdentities(user).find(
      (identity) =>
        identity.publicIdentifier && hasInvalidIdentifierFormat(identity.publicIdentifier)
    );
    if (malformedIdentifier) {
      issues.push(
        issue(
          "User",
          user.id,
          "IDENTIFIER_FORMAT_CONFLICT",
          "A persisted public identifier does not match its approved kind and ten-digit number."
        )
      );
      continue;
    }
    const inactiveIdentifier = activeIdentities(user).find(
      (identity) =>
        identity.publicIdentifier &&
        (identity.publicIdentifier.status === "DISABLED" ||
          identity.publicIdentifier.status === "TOMBSTONED" ||
          identity.publicIdentifier.deletedAt != null)
    );
    if (inactiveIdentifier) {
      issues.push(
        issue(
          "User",
          user.id,
          "INACTIVE_PUBLIC_IDENTIFIER",
          "A disabled, tombstoned, or soft-deleted identifier cannot be reused."
        )
      );
      continue;
    }
    const primary = planPrimaryIdentifier(user, operations, issues);
    if (primary) planPersonnelAliases(user, primary.knownNumberPart, operations, issues);
  }
  for (const merchant of batch.merchantAccounts) {
    if (merchant.publicIdentifier && hasInvalidIdentifierFormat(merchant.publicIdentifier)) {
      issues.push(
        issue(
          "MerchantAccount",
          merchant.id,
          "IDENTIFIER_FORMAT_CONFLICT",
          "A persisted public identifier does not match its approved kind and ten-digit number."
        )
      );
      continue;
    }
    if (
      merchant.publicIdentifier &&
      (merchant.publicIdentifier.status === "DISABLED" ||
        merchant.publicIdentifier.status === "TOMBSTONED" ||
        merchant.publicIdentifier.deletedAt != null)
    ) {
      issues.push(
        issue(
          "MerchantAccount",
          merchant.id,
          "INACTIVE_PUBLIC_IDENTIFIER",
          "A disabled, tombstoned, or soft-deleted identifier cannot be reused."
        )
      );
      continue;
    }
    planMerchantIdentifier(merchant, operations, issues);
  }
  for (const shop of batch.shops) {
    if (
      shop.customerSupportAccount &&
      (shop.customerSupportAccount.isActive === false ||
        shop.customerSupportAccount.deletedAt != null)
    ) {
      issues.push(
        issue(
          "Shop",
          shop.id,
          "INACTIVE_SUPPORT_ACCOUNT",
          "A disabled or soft-deleted Shop support account cannot be revived by the backfill."
        )
      );
      continue;
    }
    const publicIdentifiers = [
      shop.publicIdentifier,
      shop.customerSupportAccount?.publicIdentifier
    ].filter(
      (identifier): identifier is UnifiedIdentifierSnapshot =>
        identifier !== null && identifier !== undefined
    );
    if (publicIdentifiers.some(hasInvalidIdentifierFormat)) {
      issues.push(
        issue(
          "Shop",
          shop.id,
          "IDENTIFIER_FORMAT_CONFLICT",
          "A persisted Shop/CS identifier does not match its approved kind and ten-digit number."
        )
      );
      continue;
    }
    if (
      publicIdentifiers.some(
        (identifier) =>
          identifier.status === "DISABLED" ||
          identifier.status === "TOMBSTONED" ||
          identifier.deletedAt != null
      )
    ) {
      issues.push(
        issue(
          "Shop",
          shop.id,
          "INACTIVE_PUBLIC_IDENTIFIER",
          "A disabled, tombstoned, or soft-deleted Shop/CS identifier cannot be reused."
        )
      );
      continue;
    }
    planShopSupportIdentifier(shop, operations, issues);
  }

  return { operations, issues };
};

export class UnifiedIdentifierBackfillBlockedError extends Error {
  public constructor(public readonly report: UnifiedIdentifierBackfillReport) {
    super("Unified identifier backfill is blocked by unresolved ownership or inconsistent data.");
    this.name = "UnifiedIdentifierBackfillBlockedError";
  }
}

const summarizeRuntime = async (
  runtime: UnifiedIdentifierBackfillRuntime,
  batchSize: number
): Promise<PlanSummary> => {
  const counts: UnifiedIdentifierBackfillCounts = {
    batches: 0,
    users: 0,
    shops: 0,
    merchantAccounts: 0,
    pendingOperations: 0,
    pendingByType: emptyOperationCounts()
  };
  const issues: UnifiedIdentifierBackfillIssue[] = [];

  for await (const batch of runtime.scan(batchSize)) {
    counts.batches += 1;
    counts.users += batch.users.length;
    counts.shops += batch.shops.length;
    counts.merchantAccounts += batch.merchantAccounts.length;
    const plan = buildUnifiedIdentifierBackfillPlan(batch);
    counts.pendingOperations += plan.operations.length;
    for (const operation of plan.operations) counts.pendingByType[operation.type] += 1;
    issues.push(...plan.issues);
  }

  return { counts, issues };
};

const createReport = (
  options: UnifiedIdentifierBackfillOptions,
  before: PlanSummary,
  after: PlanSummary,
  mutatedRows: number
): UnifiedIdentifierBackfillReport => {
  const issues = [...before.issues, ...after.issues].filter(
    (entry, index, entries) =>
      entries.findIndex(
        (candidate) =>
          candidate.entity === entry.entity &&
          candidate.entityId === entry.entityId &&
          candidate.code === entry.code
      ) === index
  );
  return {
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    batchSize: options.batchSize,
    plannedOperations: before.counts.pendingOperations,
    mutatedRows,
    before: before.counts,
    after: after.counts,
    issues
  };
};

export const runUnifiedIdentifierBackfill = async (
  runtime: UnifiedIdentifierBackfillRuntime,
  options: UnifiedIdentifierBackfillOptions
): Promise<UnifiedIdentifierBackfillReport> => {
  const before = await summarizeRuntime(runtime, options.batchSize);
  if (before.issues.length > 0) {
    const report = createReport(options, before, before, 0);
    throw new UnifiedIdentifierBackfillBlockedError(report);
  }

  if (options.mode === "dry-run") return createReport(options, before, before, 0);

  let mutatedRows = 0;
  for await (const batch of runtime.scan(options.batchSize)) {
    const plan = buildUnifiedIdentifierBackfillPlan(batch);
    if (plan.issues.length > 0) {
      const blocked: PlanSummary = { counts: before.counts, issues: plan.issues };
      throw new UnifiedIdentifierBackfillBlockedError(
        createReport(options, before, blocked, mutatedRows)
      );
    }
    if (plan.operations.length > 0) {
      mutatedRows += await runtime.applyOperations(plan.operations);
    }
  }

  const after = await summarizeRuntime(runtime, options.batchSize);
  const report = createReport(options, before, after, mutatedRows);
  if (after.issues.length > 0 || after.counts.pendingOperations > 0) {
    throw new UnifiedIdentifierBackfillBlockedError(report);
  }
  return report;
};

export interface ParsedUnifiedIdentifierBackfillArgs {
  mode: UnifiedIdentifierBackfillMode;
  batchSize: number;
  confirmation: string | null;
  expectedDatabase: string | null;
}

const argumentValue = (args: string[], name: string): string | null =>
  args.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;

export const parseUnifiedIdentifierBackfillArgs = (
  args: string[]
): ParsedUnifiedIdentifierBackfillArgs => {
  const dryRun = args.includes("--dry-run");
  const apply = args.includes("--apply");
  if (dryRun === apply) throw new Error("Choose exactly one mode: --dry-run or --apply.");

  const batchSizeValue = argumentValue(args, "--batch-size") ?? "100";
  const batchSize = Number(batchSizeValue);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("--batch-size must be an integer from 1 through 500.");
  }

  const confirmation = argumentValue(args, "--confirm");
  const expectedDatabase = argumentValue(args, "--expected-database");
  if (apply && confirmation !== "BACKFILL_UNIFIED_IDENTIFIERS") {
    throw new Error("--apply requires --confirm=BACKFILL_UNIFIED_IDENTIFIERS.");
  }
  if (apply && !expectedDatabase) {
    throw new Error("--apply requires --expected-database=<exact_database_name>.");
  }

  return {
    mode: dryRun ? "dry-run" : "apply",
    batchSize,
    confirmation,
    expectedDatabase
  };
};

const assertCondition: (condition: unknown, message: string) => asserts condition = (
  condition,
  message
) => {
  if (!condition) throw new Error(message);
};

export const assertSafeUnifiedIdentifierBackfillApply = (
  runtimeEnv: NodeJS.ProcessEnv,
  input: { expectedDatabase: string }
): void => {
  assertCondition(
    runtimeEnv.NODE_ENV !== "production" && runtimeEnv.DEPLOY_ENV !== "prod",
    "production apply is forbidden"
  );
  assertCondition(
    runtimeEnv.NODE_ENV === "development" || runtimeEnv.NODE_ENV === "test",
    "apply requires NODE_ENV=development or test"
  );
  assertCondition(
    runtimeEnv.DEPLOY_ENV === "local" || runtimeEnv.DEPLOY_ENV === "test",
    "apply requires DEPLOY_ENV=local or test"
  );
  assertCondition(runtimeEnv.DATABASE_URL, "DATABASE_URL is required");
  const databaseUrl = new URL(runtimeEnv.DATABASE_URL);
  assertCondition(databaseUrl.protocol === "mysql:", "apply requires a MySQL DATABASE_URL");
  const databaseName = databaseUrl.pathname.replace(/^\/+/, "");
  assertCondition(
    databaseName === input.expectedDatabase,
    `target database mismatch: expected ${input.expectedDatabase}, received ${databaseName}`
  );
};

export class PrismaUnifiedIdentifierBackfillRuntime implements UnifiedIdentifierBackfillRuntime {
  public constructor(private readonly client: PrismaClient) {}

  public async *scan(batchSize: number): AsyncGenerator<UnifiedIdentifierBackfillBatch> {
    let userCursor: number | undefined;
    while (true) {
      const users = await this.client.user.findMany({
        where: { deletedAt: null },
        orderBy: { id: "asc" },
        take: batchSize,
        ...(userCursor === undefined ? {} : { cursor: { id: userCursor }, skip: 1 }),
        select: {
          id: true,
          email: true,
          needoId: true,
          accountNo: true,
          primaryIdentityType: true,
          identities: {
            where: { isActive: true, deletedAt: null },
            orderBy: { id: "asc" },
            select: {
              id: true,
              type: true,
              scopeType: true,
              scopeId: true,
              isDefault: true,
              isActive: true,
              publicIdentifier: {
                select: {
                  publicId: true,
                  numberPart: true,
                  kind: true,
                  status: true,
                  deletedAt: true
                }
              }
            }
          },
          userRoles: {
            where: { deletedAt: null, role: { deletedAt: null } },
            select: {
              scopeType: true,
              scopeId: true,
              role: { select: { code: true } }
            }
          },
          technicianProfile: { select: { deletedAt: true } },
          ownedMerchantAccounts: {
            where: { deletedAt: null },
            select: { id: true }
          }
        }
      });
      if (users.length === 0) break;
      yield {
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          needoId: user.needoId,
          accountNo: user.accountNo,
          primaryIdentityType: user.primaryIdentityType,
          identities: user.identities.map((identity) => ({
            ...identity,
            publicIdentifier: identity.publicIdentifier
              ? { ...identity.publicIdentifier, kind: identity.publicIdentifier.kind }
              : null
          })),
          roleAssignments: user.userRoles.map((assignment) => ({
            code: assignment.role.code,
            scopeType: assignment.scopeType,
            scopeId: assignment.scopeId
          })),
          hasActiveTechnicianProfile: user.technicianProfile?.deletedAt === null,
          ownedMerchantAccountIds: user.ownedMerchantAccounts.map((merchant) => merchant.id)
        })),
        shops: [],
        merchantAccounts: []
      };
      if (users.length < batchSize) break;
      userCursor = users.at(-1)?.id;
    }

    let merchantCursor: number | undefined;
    while (true) {
      const merchantAccounts = await this.client.merchantAccount.findMany({
        where: { deletedAt: null },
        orderBy: { id: "asc" },
        take: batchSize,
        ...(merchantCursor === undefined ? {} : { cursor: { id: merchantCursor }, skip: 1 }),
        select: {
          id: true,
          ownerNo: true,
          publicIdentifier: {
            select: {
              publicId: true,
              numberPart: true,
              kind: true,
              status: true,
              deletedAt: true
            }
          }
        }
      });
      if (merchantAccounts.length === 0) break;
      yield {
        users: [],
        shops: [],
        merchantAccounts: merchantAccounts.map((merchant) => ({
          ...merchant,
          publicIdentifier: merchant.publicIdentifier
            ? { ...merchant.publicIdentifier, kind: merchant.publicIdentifier.kind }
            : null
        }))
      };
      if (merchantAccounts.length < batchSize) break;
      merchantCursor = merchantAccounts.at(-1)?.id;
    }

    let shopCursor: number | undefined;
    while (true) {
      const shops = await this.client.shop.findMany({
        where: { deletedAt: null },
        orderBy: { id: "asc" },
        take: batchSize,
        ...(shopCursor === undefined ? {} : { cursor: { id: shopCursor }, skip: 1 }),
        select: {
          id: true,
          shopNo: true,
          publicIdentifier: {
            select: {
              publicId: true,
              numberPart: true,
              kind: true,
              status: true,
              deletedAt: true
            }
          },
          customerSupportAccount: {
            select: {
              id: true,
              type: true,
              isActive: true,
              deletedAt: true,
              publicIdentifier: {
                select: {
                  publicId: true,
                  numberPart: true,
                  kind: true,
                  status: true,
                  deletedAt: true
                }
              }
            }
          }
        }
      });
      if (shops.length === 0) break;
      yield {
        users: [],
        merchantAccounts: [],
        shops: shops.map((shop) => ({
          ...shop,
          publicIdentifier: shop.publicIdentifier
            ? { ...shop.publicIdentifier, kind: shop.publicIdentifier.kind }
            : null,
          customerSupportAccount: shop.customerSupportAccount
            ? {
                ...shop.customerSupportAccount,
                publicIdentifier: shop.customerSupportAccount.publicIdentifier
                  ? {
                      ...shop.customerSupportAccount.publicIdentifier,
                      kind: shop.customerSupportAccount.publicIdentifier.kind
                    }
                  : null
              }
            : null
        }))
      };
      if (shops.length < batchSize) break;
      shopCursor = shops.at(-1)?.id;
    }
  }

  public async applyOperations(
    operations: readonly UnifiedIdentifierBackfillOperation[]
  ): Promise<number> {
    return this.client.$transaction(async (transaction) => {
      let mutatedRows = 0;
      for (const operation of operations) {
        mutatedRows += await this.applyOperation(transaction, operation);
      }
      return mutatedRows;
    });
  }

  private async applyOperation(
    transaction: Prisma.TransactionClient,
    operation: UnifiedIdentifierBackfillOperation
  ): Promise<number> {
    const { PublicIdentifierRepository } =
      await import("../src/repositories/public-identifier.repository");
    const repository = new PublicIdentifierRepository(transaction);
    const allocator = new IdentifierAllocator(repository);

    if (operation.type === "ASSIGN_PRIMARY") {
      const user = await transaction.user.findFirst({
        where: { id: operation.userId, deletedAt: null },
        select: { accountNo: true, primaryIdentityType: true, username: true }
      });
      if (!user) throw new Error(`Backfill user not found: ${operation.userId}`);
      let identityId = operation.identityId;
      let mutatedRows = 0;
      if (identityId === null && operation.createIdentity?.type === "customer") {
        const customerRole = await transaction.role.findFirst({
          where: { code: "customer", deletedAt: null },
          select: { id: true }
        });
        if (!customerRole) throw new Error("Backfill customer role not found");
        const existingProfile = await transaction.customerProfile.findUnique({
          where: { userId: operation.userId },
          select: { id: true, deletedAt: true }
        });
        const customerProfile = existingProfile
          ? await transaction.customerProfile.update({
              where: { id: existingProfile.id },
              data: { deletedAt: null },
              select: { id: true }
            })
          : await transaction.customerProfile.create({
              data: { userId: operation.userId, displayName: user.username },
              select: { id: true }
            });
        mutatedRows += 1;
        const identity = await transaction.userIdentity.create({
          data: {
            userId: operation.userId,
            type: "customer",
            scopeType: "customer_profile",
            scopeId: customerProfile.id,
            displayName: user.username,
            isDefault: false,
            isActive: true
          },
          select: { id: true }
        });
        identityId = identity.id;
        mutatedRows += 1;
        await transaction.userRole.upsert({
          where: {
            userId_roleId_scopeType_scopeId: {
              userId: operation.userId,
              roleId: customerRole.id,
              scopeType: "customer_profile",
              scopeId: customerProfile.id
            }
          },
          create: {
            userId: operation.userId,
            roleId: customerRole.id,
            scopeType: "customer_profile",
            scopeId: customerProfile.id
          },
          update: { deletedAt: null }
        });
        mutatedRows += 1;
      } else if (identityId === null && operation.createIdentity?.type === "platform") {
        const identity = await transaction.userIdentity.create({
          data: {
            userId: operation.userId,
            type: "platform",
            scopeType: "global",
            scopeId: null,
            displayName: user.username,
            isDefault: false,
            isActive: true
          },
          select: { id: true }
        });
        identityId = identity.id;
        mutatedRows += 1;
      }
      if (identityId === null)
        throw new Error(`Backfill primary identity missing: User ${operation.userId}`);
      const defaultsCleared = await transaction.userIdentity.updateMany({
        where: { userId: operation.userId, isDefault: true, id: { not: identityId } },
        data: { isDefault: false }
      });
      mutatedRows += defaultsCleared.count;
      await transaction.userIdentity.update({
        where: { id: identityId },
        data: { isDefault: true }
      });
      mutatedRows += 1;
      let numberPart = operation.existingNumberPart;
      let identifierCreated = false;
      const existingIdentifier = await transaction.publicIdentifier.findFirst({
        where: { userIdentityId: identityId, deletedAt: null }
      });
      if (existingIdentifier) {
        numberPart = existingIdentifier.numberPart;
      } else if (numberPart) {
        await repository.createIdentifier(
          this.personnelIdentifierInput(operation.primaryKind, numberPart, identityId)
        );
        identifierCreated = true;
      } else {
        const identifier = await allocator.allocate({
          kind: operation.primaryKind,
          userIdentityId: identityId
        });
        numberPart = identifier.numberPart;
        identifierCreated = true;
      }
      if (!numberPart)
        throw new Error(`Backfill number allocation failed: User ${operation.userId}`);
      await transaction.user.update({
        where: { id: operation.userId },
        data: {
          needoId: formatPersonId(operation.primaryKind, numberPart),
          accountNo: numberPart,
          primaryIdentityType: operation.primaryKind
        }
      });
      return mutatedRows + 1 + (identifierCreated ? 1 : 0);
    }

    if (operation.type === "ASSIGN_ALIAS") {
      let identityId = operation.identityId;
      let mutatedRows = 0;
      if (identityId === null && operation.createIdentity) {
        const identity = await transaction.userIdentity.create({
          data: {
            userId: operation.userId,
            type: operation.createIdentity.type,
            activeKey: `unified-public-identifier:${operation.aliasKind.toLowerCase()}:${operation.userId}`,
            scopeType: operation.createIdentity.scopeType,
            scopeId: operation.createIdentity.scopeId,
            isDefault: false,
            isActive: true
          }
        });
        identityId = identity.id;
        mutatedRows += 1;
      }
      if (identityId === null) throw new Error(`Alias identity missing: User ${operation.userId}`);
      await allocator.registerPersonAlias({
        kind: operation.aliasKind,
        userIdentityId: identityId
      });
      return mutatedRows + 1;
    }

    if (operation.type === "ASSIGN_MERCHANT") {
      const merchant = await transaction.merchantAccount.findFirst({
        where: { id: operation.merchantAccountId, deletedAt: null },
        include: { publicIdentifier: true }
      });
      if (!merchant)
        throw new Error(`Backfill MerchantAccount not found: ${operation.merchantAccountId}`);
      let numberPart = merchant.publicIdentifier?.numberPart ?? operation.existingNumberPart;
      let identifierCreated = false;
      if (!merchant.publicIdentifier) {
        if (numberPart) {
          await repository.createIdentifier({
            publicId: `owner${identifierNumberPartSchema.parse(numberPart)}`,
            numberPart,
            kind: "OWNER",
            merchantAccountId: merchant.id,
            loginAllowed: false,
            searchable: false
          });
        } else {
          const identifier = await allocator.allocate({
            kind: "OWNER",
            merchantAccountId: merchant.id
          });
          numberPart = identifier.numberPart;
        }
        identifierCreated = true;
      }
      if (!numberPart)
        throw new Error(`Backfill number allocation failed: Merchant ${merchant.id}`);
      await transaction.merchantAccount.update({
        where: { id: merchant.id },
        data: { ownerNo: numberPart }
      });
      return 1 + (identifierCreated ? 1 : 0);
    }

    const shop = await transaction.shop.findFirst({
      where: { id: operation.shopId, deletedAt: null },
      include: {
        publicIdentifier: true,
        customerSupportAccount: { include: { publicIdentifier: true } }
      }
    });
    if (!shop) throw new Error(`Backfill Shop not found: ${operation.shopId}`);
    let mutatedRows = 0;
    let support = shop.customerSupportAccount;
    if (!support) {
      support = await transaction.customerSupportAccount.create({
        data: {
          shopId: shop.id,
          type: "SHOP",
          displayName: `${shop.name} Customer Support`,
          isActive: true
        },
        include: { publicIdentifier: true }
      });
      mutatedRows += 1;
    }
    const numberPart =
      operation.existingNumberPart ??
      shop.publicIdentifier?.numberPart ??
      support.publicIdentifier?.numberPart;
    if (!numberPart && !shop.publicIdentifier && !support.publicIdentifier) {
      const pair = await allocator.allocateShopSupportPair({
        shopId: shop.id,
        customerSupportAccountId: support.id
      });
      await transaction.shop.update({
        where: { id: shop.id },
        data: { shopNo: pair.shopIdentifier.numberPart }
      });
      return mutatedRows + 3;
    }
    if (!numberPart) throw new Error(`Backfill Shop/CS number is unresolved: Shop ${shop.id}`);
    if (!shop.publicIdentifier) {
      await repository.createIdentifier({
        publicId: `shop${identifierNumberPartSchema.parse(numberPart)}`,
        numberPart,
        kind: "SHOP",
        shopId: shop.id,
        loginAllowed: false,
        searchable: true
      });
      mutatedRows += 1;
    }
    if (!support.publicIdentifier) {
      await repository.createIdentifier({
        publicId: `cs${identifierNumberPartSchema.parse(numberPart)}`,
        numberPart,
        kind: "CUSTOMER_SUPPORT",
        customerSupportAccountId: support.id,
        loginAllowed: false,
        searchable: true
      });
      mutatedRows += 1;
    }
    await transaction.shop.update({ where: { id: shop.id }, data: { shopNo: numberPart } });
    return mutatedRows + 1;
  }

  private personnelIdentifierInput(
    kind: UnifiedIdentifierPrimaryKind,
    numberPart: string,
    userIdentityId: number
  ): PublicIdentifierCreateInput {
    return {
      publicId: formatPersonId(kind, numberPart),
      numberPart: identifierNumberPartSchema.parse(numberPart),
      kind,
      userIdentityId,
      loginAllowed: true,
      searchable: true
    };
  }
}

const loadScriptEnvironment = (): void => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  if (existsSync(envFile)) loadDotenv({ path: envFile });
};

const main = async (): Promise<void> => {
  loadScriptEnvironment();
  const args = parseUnifiedIdentifierBackfillArgs(process.argv.slice(2));
  if (args.mode === "apply") {
    assertSafeUnifiedIdentifierBackfillApply(process.env, {
      expectedDatabase: args.expectedDatabase as string
    });
  }

  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  try {
    const report = await runUnifiedIdentifierBackfill(
      new PrismaUnifiedIdentifierBackfillRuntime(prisma),
      { mode: args.mode, batchSize: args.batchSize }
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    if (error instanceof UnifiedIdentifierBackfillBlockedError) {
      process.stderr.write(`${JSON.stringify(error.report, null, 2)}\n`);
    }
    throw error;
  } finally {
    await disconnectPrisma();
  }
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
