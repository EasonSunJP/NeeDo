import type { BackofficeActivityAccount, BackofficeAuditEventPayload } from "../services/backoffice.service";
import type { BackofficeManagedUserDetailQuery } from "../validators/backoffice.validator";

/** Project the persisted account origin into the log without inserting synthetic audit rows. */
export function accountLogPagination(account: BackofficeActivityAccount, query: Partial<BackofficeManagedUserDetailQuery>) {
  const createdAt = new Date(account.createdAt).getTime();
  const included = (!query.audit_from || createdAt >= new Date(query.audit_from).getTime())
    && (!query.audit_to || createdAt < new Date(query.audit_to).getTime());
  const extraTotal = included ? 1 : 0;
  const page = query.audit_page ?? 1;
  const size = query.audit_page_size ?? 10;
  const origin: BackofficeAuditEventPayload[] = included && page === 1 ? [{
    id: `account-created-${account.id}`, action: "account.created", actorName: account.displayName,
    actorAvatarUrl: account.avatarUrl, createdAt: account.createdAt, metadata: null
  }] : [];
  return { extraTotal, origin, skip: Math.max(0, (page - 1) * size - extraTotal), take: size - origin.length };
}
