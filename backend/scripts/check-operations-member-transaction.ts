import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { OperationsMemberService } from "../src/services/operations-member.service";
import { OperationsMemberRepository } from "../src/repositories/operations-member.repository";
import { prisma } from "../src/prisma/client";
import { compare } from "bcryptjs";

async function main() {
  const email = `operations-qa-${randomUUID()}@example.test`;
  const rollback = new Error("QA_ROLLBACK");
  try {
    await prisma.$transaction(async (tx) => {
      const actor = await tx.user.findFirstOrThrow({ where: { deletedAt: null, userRoles: { some: { deletedAt: null, role: { code: "admin" } } } }, select: { id: true, email: true } });
      const repository = new OperationsMemberRepository({ $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient);
      const password = `${randomUUID()}Aa@1`;
      const created = await new OperationsMemberService(repository).create({ username: "Operations transaction QA", email, password, reason: "Transactional acceptance; rollback after verification" }, {
        userId: actor.id, email: actor.email, roles: ["admin"], permissions: ["user:create", "user:assign-role"], currentIdentityType: "platform", currentIdentityScopeType: "global", currentIdentityScopeId: null, accessTokenJti: "transaction-qa", accessTokenExpiresAt: 1
      }, { ip: "127.0.0.1" });
      assert.match(created.needoId, /^needo\d{10}$/);
      const user = await tx.user.findUniqueOrThrow({ where: { email }, include: { identities: { include: { publicIdentifier: true } }, userRoles: { include: { role: true } } } });
      assert.equal(await compare(password, user.passwordHash!), true);
      assert.equal(user.primaryIdentityType, "NEEDO");
      assert.equal(user.identities[0].type, "platform");
      assert.equal(user.identities[0].publicIdentifier?.loginAllowed, true);
      assert.equal(user.userRoles[0].role.code, "operator");
      const audit = await tx.auditLog.findFirstOrThrow({ where: { targetType: "User", targetId: user.id, action: "user.operations_member.create" } });
      assert.equal(audit.actorId, actor.id);
      assert.ok(!JSON.stringify(audit.metadata).includes(password));
      assert.equal(await tx.user.count({ where: { id: user.id, isActive: true, deletedAt: null, userRoles: { some: { deletedAt: null, role: { code: "operator", deletedAt: null } } } } }), 1);
      await assert.rejects(repository.createWithAudit({ username: "Duplicate QA", email, passwordHash: user.passwordHash!, reason: "Duplicate email verification", actorId: actor.id, ip: "127.0.0.1" }), { statusCode: 409 });
      console.log("PASS: real MySQL account, NEEDO identifier, operator role, password hash, group predicate, audit and duplicate-email rejection");
      throw rollback;
    }, { timeout: 30_000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await prisma.user.count({ where: { email } }), 0);
  console.log("PASS: transaction rolled back; no QA account persisted");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Acceptance failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
