import { createHash } from "node:crypto";

export type IdentityApplicationType = "technician" | "merchant";
export type IdentityApplicationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "withdrawn";

export interface IdentityApplicationTransitionInput {
  current: IdentityApplicationStatus;
  next: IdentityApplicationStatus;
  rejectionReason?: string;
}

const ACTIVE_STATUSES = new Set<IdentityApplicationStatus>(["draft", "submitted", "under_review"]);

const ALLOWED_TRANSITIONS: Readonly<
  Record<IdentityApplicationStatus, IdentityApplicationStatus[]>
> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["under_review", "approved", "rejected", "withdrawn"],
  under_review: ["approved", "rejected", "withdrawn"],
  approved: [],
  rejected: ["draft"],
  withdrawn: []
};

const canonicalizeSnapshot = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeSnapshot);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeSnapshot(entry)])
    );
  }

  return value;
};

export class IdentityApplicationPolicyService {
  public assertTransition(input: IdentityApplicationTransitionInput): void {
    if (!ALLOWED_TRANSITIONS[input.current].includes(input.next)) {
      throw new Error("error.identity_application.invalid_transition");
    }
    if (input.next === "rejected" && !input.rejectionReason?.trim()) {
      throw new Error("error.identity_application.rejection_reason_required");
    }
  }

  public assertEditable(status: IdentityApplicationStatus): void {
    if (status !== "draft" && status !== "rejected") {
      throw new Error("error.identity_application.submitted_snapshot_locked");
    }
  }

  public buildActiveKey(
    userId: number,
    type: IdentityApplicationType,
    status: IdentityApplicationStatus
  ): string | null {
    return ACTIVE_STATUSES.has(status) ? `${userId}:${type}` : null;
  }

  public assertVersion(expectedVersion: number, actualVersion: number): void {
    if (expectedVersion !== actualVersion) {
      throw new Error("error.identity_application.version_conflict");
    }
  }

  public calculatePurgeAt(closedAt: Date): Date {
    return new Date(closedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  }

  public hashSnapshot(snapshot: unknown): string {
    return createHash("sha256")
      .update(JSON.stringify(canonicalizeSnapshot(snapshot)))
      .digest("hex");
  }
}
