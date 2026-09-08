const { createHash } = require('node:crypto');

function planContactGraph(bundle, users, existing) {
  if (bundle.version !== 1 || !Array.isArray(bundle.users) || !Array.isArray(bundle.contacts)) throw Error('invalid_bundle');
  const byAccount = new Map(users.map(user => [user.accountNo, user]));
  for (const source of bundle.users) {
    const target = byAccount.get(source.accountNo);
    if (!target || target.email !== source.email || !target.isTestAccount || !target.isActive || target.deletedAt) throw Error('account_batch_mismatch');
  }
  const allowed = new Set(bundle.users.map(user => user.accountNo));
  const resolve = (account, type, scopeType, publicId) => {
    if (!allowed.has(account)) throw Error('outside_account_batch');
    const user = byAccount.get(account);
    const identities = user.identities.filter(identity => identity.type === type && identity.scopeType === scopeType && identity.isActive && !identity.deletedAt && (!publicId || identity.publicIdentifier?.publicId === publicId));
    if (identities.length !== 1) throw Error('identity_mapping_ambiguous_or_missing');
    return { userId: user.id, identityId: identities[0].id };
  };
  const occupied = new Set(existing.map(row => `${row.ownerIdentityId}:${row.contactIdentityId}`));
  const planned = new Map();
  let preserved = 0;
  for (const edge of bundle.contacts) {
    if (!edge.ownerIdentityActive || edge.ownerIdentityDeleted || !edge.targetIdentityActive || edge.targetIdentityDeleted || edge.blockedAt) continue;
    const owner = resolve(edge.ownerAccountNo, edge.ownerType, edge.ownerScopeType, edge.ownerPublicId);
    const target = resolve(edge.targetAccountNo, edge.targetType, edge.targetScopeType, edge.targetPublicId);
    const key = `${owner.identityId}:${target.identityId}`;
    if (occupied.has(key)) { preserved += 1; continue; }
    if (owner.identityId === target.identityId) throw Error('self_contact');
    planned.set(key, { ownerUserId: owner.userId, ownerIdentityId: owner.identityId, contactUserId: target.userId, contactIdentityId: target.identityId, nickname: edge.nickname, source: 'staging_test_account_sync' });
  }
  const additions = [...planned.values()].sort((a,b) => a.ownerIdentityId - b.ownerIdentityId || a.contactIdentityId - b.contactIdentityId);
  return { additions, preserved, digest: createHash('sha256').update(JSON.stringify(additions)).digest('hex') };
}
module.exports = { planContactGraph };
