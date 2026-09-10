const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { planContactGraph } = require('./staging-contact-graph.cjs');
(async () => {
  const [mode, path, sha256, expectedPlan] = process.argv.slice(2);
  if (!['plan','apply'].includes(mode) || !path || !/^[a-f0-9]{64}$/.test(sha256 || '')) throw Error('invalid_arguments');
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== 'mysql' || url.pathname !== '/needo_staging') throw Error('staging_only');
  const raw = fs.readFileSync(path);
  if (createHash('sha256').update(raw).digest('hex') !== sha256) throw Error('bundle_hash_mismatch');
  const bundle = JSON.parse(raw);
  if (bundle.users.length !== 251 || bundle.contacts.length > 10000) throw Error('unexpected_batch_size');
  const db = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL), log: [] });
  try {
    const summary = await db.$transaction(async tx => {
      const users = await tx.user.findMany({ where: { accountNo: { in: bundle.users.map(u => u.accountNo) } }, select: { id: true, accountNo: true, email: true, isTestAccount: true, isActive: true, deletedAt: true, identities: { select: { id: true, type: true, scopeType: true, isActive: true, deletedAt: true, publicIdentifier: { select: { publicId: true } } } } } });
      const ids = users.flatMap(u => u.identities.map(i => i.id));
      const existing = await tx.contact.findMany({ where: { ownerIdentityId: { in: ids }, contactIdentityId: { in: ids } } });
      const plan = planContactGraph(bundle,users,existing);
      if (mode === 'apply') {
        if (plan.digest !== expectedPlan) throw Error('plan_changed');
        const actor = await tx.user.findFirst({ where: { email: process.env.ADMIN_DEFAULT_EMAIL, isActive: true, deletedAt: null }, select: { id: true } });
        if (!actor) throw Error('audit_actor_missing');
        for (const data of plan.additions) {
          const row = await tx.contact.create({data});
          await tx.auditLog.create({data:{actorId:actor.id,action:'staging.contact_graph.import',targetType:'Contact',targetId:row.id,metadata:{bundleSha256:sha256,planDigest:plan.digest,ownerIdentityId:data.ownerIdentityId,contactIdentityId:data.contactIdentityId}}});
        }
        const after = await tx.contact.findMany({where:{ownerIdentityId:{in:ids},contactIdentityId:{in:ids}}});
        if (planContactGraph(bundle,users,after).additions.length !== 0) throw Error('verification_failed');
      }
      return {mode,users:users.length,sourceContacts:bundle.contacts.length,additions:plan.additions.length,preserved:plan.preserved,planDigest:plan.digest,bundleSha256:sha256};
    },{timeout:120000,isolationLevel:'Serializable'});
    console.log(JSON.stringify(summary));
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
