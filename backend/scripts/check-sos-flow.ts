import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import type { SosStore } from "../src/services/sos.service";
import { requireSafeExchangeClaimFlowEnvironment } from "./support/exchange-claim-flow-safety";

async function main() {
  const target = requireSafeExchangeClaimFlowEnvironment(process.env.ENV_FILE);
  process.env.ENV_FILE = target.envFile;
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  const { SosRepository } = await import("../src/repositories/sos.repository");
  const { SosService } = await import("../src/services/sos.service");
  const marker = `sos-check-${randomUUID()}`;
  let orderId: number | undefined;
  const userIds: number[] = [];
  const shopIds: number[] = [];
  try {
    const permissions = await prisma.permission.count({
      where: { code: { in: ["sos:create", "sos:list", "sos:resolve"] }, deletedAt: null }
    });
    assert.equal(permissions, 3, "Apply the additive SOS migration before running this checker");
    const fixture = await prisma.$transaction(async (tx) => {
      const shop = await tx.shop.create({ data: { name: marker, city: "Test", address: marker } });
      const foreign = await tx.shop.create({
        data: { name: `${marker}-foreign`, city: "Test", address: marker }
      });
      const actor = async (
        type: string,
        roleCode: string,
        scopeType = "global",
        scopeId: number | null = null
      ) => {
        const user = await tx.user.create({
          data: {
            needoId: `sos${randomUUID().replaceAll("-", "").slice(0, 20)}`,
            email: `${marker}-${type}@needo.test`,
            username: marker,
            isTestAccount: true
          }
        });
        const identity = await tx.userIdentity.create({
          data: { userId: user.id, type, scopeType, scopeId }
        });
        const role = await tx.role.findUniqueOrThrow({ where: { code: roleCode } });
        await tx.userRole.create({
          data: { userId: user.id, roleId: role.id, scopeType, scopeId }
        });
        return {
          userId: user.id,
          currentIdentityId: identity.id,
          currentIdentityType: type,
          currentIdentityScopeType: scopeType,
          currentIdentityScopeId: scopeId,
          permissions: ["sos:create", "sos:list", "sos:resolve"],
          roles: [roleCode],
          email: user.email,
          accessTokenJti: marker,
          accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 60
        } satisfies AuthenticatedAccessContext;
      };
      const customer = await actor("customer", "customer");
      const technician = await actor("technician", "technician");
      const ops = await actor("platform_admin", "operator");
      const merchant = await actor("merchant_staff", "merchant_staff", "shop", shop.id);
      const profile = await tx.technicianProfile.create({
        data: { userId: technician.userId, displayName: marker, city: "Test", shopId: shop.id }
      });
      const now = new Date();
      const endsAt = new Date(now.getTime() + 3600000);
      const slot = await tx.scheduleSlot.create({
        data: { shopId: shop.id, technicianProfileId: profile.id, startsAt: now, endsAt }
      });
      const booking = await tx.bookingOrder.create({
        data: {
          orderNo: marker.slice(0, 40),
          customerUserId: customer.userId,
          shopId: shop.id,
          technicianProfileId: profile.id,
          scheduleSlotId: slot.id,
          status: "CONFIRMED",
          priceAmount: 0,
          serviceNameSnapshot: marker,
          startsAt: now,
          endsAt
        }
      });
      await tx.orderServiceSession.create({
        data: {
          bookingOrderId: booking.id,
          verificationHash: marker,
          startedAt: new Date(now.getTime() - 1000),
          endedAt: now
        }
      });
      return { customer, technician, ops, merchant, shop, foreign, booking, now };
    });
    orderId = fixture.booking.id;
    userIds.push(
      fixture.customer.userId,
      fixture.technician.userId,
      fixture.ops.userId,
      fixture.merchant.userId
    );
    shopIds.push(fixture.shop.id, fixture.foreign.id);
    const published: { recipientIdentityId?: number; type: string }[] = [];
    const gateway = {
      publish: (event: { recipientIdentityId?: number; type: string }) => {
        published.push(event);
      },
      subscribe: () => () => undefined
    };
    const repository = new SosRepository();
    let clock = fixture.now;
    const service = new SosService(repository, gateway, () => clock);
    const context = { ip: "127.0.0.1" };
    const sends = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        service.send(orderId!, `${marker}-${index}`, fixture.customer, context)
      )
    );
    assert.equal(
      new Set(sends.map((result) => result.alert.id)).size,
      1,
      "Concurrent sends must merge"
    );
    assert.equal(await prisma.sosAlert.count({ where: { orderId } }), 1);
    assert.equal(await prisma.sosCommand.count({ where: { orderId } }), 6);
    assert.equal((await service.count(fixture.merchant)).pending, 1);
    const otherIdentity = await prisma.userIdentity.create({
      data: {
        userId: fixture.merchant.userId,
        type: "merchant_staff",
        scopeType: "shop",
        scopeId: fixture.foreign.id
      }
    });
    const otherMerchant = {
      ...fixture.merchant,
      currentIdentityId: otherIdentity.id,
      currentIdentityScopeId: fixture.foreign.id
    };
    await assert.rejects(() => service.count(otherMerchant), /forbidden/);
    const merchantRole = await prisma.role.findUniqueOrThrow({ where: { code: "merchant_staff" } });
    await prisma.userRole.create({
      data: {
        userId: otherMerchant.userId,
        roleId: merchantRole.id,
        scopeType: "shop",
        scopeId: fixture.foreign.id
      }
    });
    assert.equal((await service.count(otherMerchant)).pending, 0);
    await assert.rejects(
      () => service.resolve(sends[0].alert.id, otherMerchant, context),
      /not_found/
    );
    assert.equal(await prisma.sosAlert.count({ where: { shopId: fixture.foreign.id } }), 0);
    const resolved = await Promise.all([
      service.resolve(sends[0].alert.id, fixture.merchant, context),
      service.resolve(sends[0].alert.id, fixture.ops, context)
    ]);
    assert.equal(resolved.filter((result) => !result.replayed).length, 1);
    const repeated = await service.send(orderId, `${marker}-0`, fixture.customer, context);
    assert.equal(repeated.alert.id, sends[0].alert.id);
    assert.equal(repeated.replayed, true);
    const again = await service.send(orderId, `${marker}-again`, fixture.customer, context);
    assert.notEqual(again.alert.id, sends[0].alert.id);
    const technician = await service.send(orderId, `${marker}-tech`, fixture.technician, context);
    assert.equal(technician.alert.senderType, "technician");
    assert.equal((await service.count(fixture.merchant)).pending, 2);
    const auditBefore = await prisma.auditLog.count({
      where: { targetType: "SosAlert", actorId: { in: userIds } }
    });
    class FailingAuditRepository extends SosRepository {
      override transaction<T>(work: (store: SosStore) => Promise<T>): Promise<T> {
        return super.transaction((store) =>
          work(
            new Proxy(store, {
              get(target, key) {
                if (key === "audit")
                  return async () => {
                    throw new Error("intentional audit rollback");
                  };
                const value = Reflect.get(target, key);
                return typeof value === "function" ? value.bind(target) : value;
              }
            })
          )
        );
      }
    }
    const failing = new SosService(new FailingAuditRepository(), gateway, () => clock);
    await assert.rejects(
      () => failing.resolve(again.alert.id, fixture.ops, context),
      /intentional audit rollback/
    );
    assert.equal((await repository.alert(again.alert.id, {}))?.status, "pending");
    assert.equal(
      await prisma.auditLog.count({ where: { targetType: "SosAlert", actorId: { in: userIds } } }),
      auditBefore
    );
    await service.resolve(technician.alert.id, fixture.ops, context);
    const alertsBefore = await prisma.sosAlert.count({ where: { orderId } });
    const commandsBefore = await prisma.sosCommand.count({ where: { orderId } });
    await assert.rejects(
      () => failing.send(orderId!, `${marker}-rollback`, fixture.technician, context),
      /intentional audit rollback/
    );
    assert.equal(await prisma.sosAlert.count({ where: { orderId } }), alertsBefore);
    assert.equal(await prisma.sosCommand.count({ where: { orderId } }), commandsBefore);
    clock = new Date(fixture.now.getTime() + 600000);
    assert.equal((await service.availability(orderId, fixture.customer)).canSend, true);
    assert.equal((await service.availability(orderId, fixture.customer)).expiresAt, null);
    assert.equal(
      (await service.send(orderId, `${marker}-0`, fixture.customer, context)).alert.id,
      sends[0].alert.id
    );
    const late = await service.send(orderId, `${marker}-after-end`, fixture.technician, context);
    assert.equal(late.replayed, false);
    await service.resolve(again.alert.id, fixture.ops, context);
    await prisma.orderServiceSession.deleteMany({ where: { bookingOrderId: orderId } });
    for (const status of ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"] as const) {
      await prisma.bookingOrder.update({ where: { id: orderId }, data: { status } });
      assert.equal((await service.availability(orderId, fixture.customer)).canSend, true);
      const result = await service.send(orderId, `${marker}-${status}`, fixture.customer, context);
      assert.equal(result.replayed, false);
      await service.resolve(result.alert.id, fixture.ops, context);
    }
    assert(
      published.some((event) => event.recipientIdentityId === fixture.merchant.currentIdentityId)
    );
    assert(published.some((event) => event.recipientIdentityId === fixture.ops.currentIdentityId));
    assert(!published.some((event) => event.recipientIdentityId === otherIdentity.id));
    console.log(
      JSON.stringify({
        target: target.maskedDatabaseTarget,
        concurrentSenders: 6,
        alerts: await prisma.sosAlert.count({ where: { orderId } }),
        commands: await prisma.sosCommand.count({ where: { orderId } }),
        atomicAuditRollback: true,
        bothSenderTypes: true,
        scopeIsolation: true,
        unrestrictedByServiceTime: true,
        pendingConfirmedCancelledCompleted: true,
        permanentReplay: true
      })
    );
  } finally {
    if (orderId)
      await prisma.$transaction(async (tx) => {
        await tx.auditLog.deleteMany({
          where: { targetType: "SosAlert", actorId: { in: userIds } }
        });
        await tx.sosCommand.deleteMany({ where: { orderId } });
        await tx.sosAlert.deleteMany({ where: { orderId } });
        await tx.orderServiceSession.deleteMany({ where: { bookingOrderId: orderId } });
        await tx.bookingOrder.delete({ where: { id: orderId } });
        await tx.scheduleSlot.deleteMany({ where: { shopId: { in: shopIds } } });
        await tx.technicianProfile.deleteMany({ where: { userId: { in: userIds } } });
        await tx.userRole.deleteMany({ where: { userId: { in: userIds } } });
        await tx.userIdentity.deleteMany({ where: { userId: { in: userIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
        await tx.shop.deleteMany({ where: { id: { in: shopIds } } });
      });
    if (orderId) {
      assert.equal(await prisma.sosAlert.count({ where: { orderId } }), 0);
      assert.equal(await prisma.sosCommand.count({ where: { orderId } }), 0);
      assert.equal(await prisma.user.count({ where: { id: { in: userIds } } }), 0);
      console.log(JSON.stringify({ cleanup: "verified", marker }));
    }
    await disconnectPrisma();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "SOS checker failed");
  process.exitCode = 1;
});
