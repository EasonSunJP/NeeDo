import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { requireSafeExchangeClaimFlowEnvironment } from "./support/exchange-claim-flow-safety";
async function main() {
  const target = requireSafeExchangeClaimFlowEnvironment(process.env.ENV_FILE);
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  const { WorkStatusRepository } = await import("../src/repositories/work-status.repository");
  const { WorkStatusService } = await import("../src/services/work-status.service");
  const marker = `work-${randomUUID()}`,
    rollback = new Error("work-status-check-rollback");
  try {
    try {
      await prisma.$transaction(
        async (tx) => {
          const epoch = await tx.technicianAttendanceEpoch.findUniqueOrThrow({ where: { id: 1 } });
          const startsAt = new Date(Math.max(Date.now(), epoch.activatedAt.getTime()) + 86400000),
            endsAt = new Date(startsAt.getTime() + 8 * 3600000);
          let now = new Date(startsAt.getTime() - 1000);
          const shop = await tx.shop.create({
            data: { name: marker, city: "Test", address: marker }
          });
          const foreign = await tx.shop.create({
            data: { name: `${marker}-foreign`, city: "Test", address: marker }
          });
          const user = await tx.user.create({
            data: {
              needoId: marker.slice(0, 30),
              email: `${marker}@needo.test`,
              username: marker,
              isTestAccount: true
            }
          });
          const profile = await tx.technicianProfile.create({
            data: { userId: user.id, displayName: marker, city: "Test", shopId: shop.id }
          });
          const identity = await tx.userIdentity.create({
            data: {
              userId: user.id,
              type: "technician",
              scopeType: "technician_profile",
              scopeId: profile.id
            }
          });
          await tx.technicianShopAffiliation.create({
            data: {
              technicianProfileId: profile.id,
              shopId: shop.id,
              relationshipType: "EXCLUSIVE",
              workStatus: "ACTIVE",
              startsAt: epoch.activatedAt
            }
          });
          const shift = await tx.availability.create({
            data: {
              shopId: shop.id,
              technicianProfileId: profile.id,
              sourceType: "SHOP",
              startsAt,
              endsAt
            }
          });
          await tx.availability.create({
            data: {
              shopId: foreign.id,
              technicianProfileId: profile.id,
              sourceType: "TECHNICIAN",
              startsAt,
              endsAt
            }
          });
          const slot = await tx.scheduleSlot.create({
            data: {
              shopId: shop.id,
              technicianProfileId: profile.id,
              availabilityId: shift.id,
              startsAt,
              endsAt
            }
          });
          await tx.bookingOrder.create({
            data: {
              orderNo: marker.slice(0, 40),
              customerUserId: user.id,
              shopId: shop.id,
              technicianProfileId: profile.id,
              scheduleSlotId: slot.id,
              status: "CONFIRMED",
              startsAt,
              endsAt,
              priceAmount: 0,
              serviceNameSnapshot: marker
            }
          });
          await tx.bookingOrder.create({
            data: {
              orderNo: marker.slice(0, 32) + "-later",
              customerUserId: user.id,
              shopId: shop.id,
              technicianProfileId: profile.id,
              scheduleSlotId: slot.id,
              status: "CONFIRMED",
              startsAt: new Date(startsAt.getTime() + 2 * 3600000),
              endsAt: new Date(startsAt.getTime() + 3 * 3600000),
              priceAmount: 0,
              serviceNameSnapshot: "Upcoming appointment"
            }
          });
          const repository = new WorkStatusRepository({
            $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx)
          } as unknown as PrismaClient);
          const service = new WorkStatusService(repository, () => now);
          const actor = {
            userId: user.id,
            email: user.email,
            currentIdentityId: identity.id,
            currentIdentityType: "technician",
            currentIdentityScopeType: "technician_profile",
            currentIdentityScopeId: profile.id,
            roles: ["technician"],
            permissions: [],
            accessTokenJti: marker,
            accessTokenExpiresAt: Math.floor(endsAt.getTime() / 1000)
          } satisfies AuthenticatedAccessContext;
          const ops = {
            ...actor,
            currentIdentityType: "platform_admin",
            currentIdentityScopeType: "global",
            currentIdentityScopeId: null
          };
          const merchant = {
            ...actor,
            currentIdentityType: "merchant_staff",
            currentIdentityScopeType: "shop",
            currentIdentityScopeId: shop.id
          };
          assert.equal((await service.snapshot(actor, "technician")).status, "unsynced");
          await service.inspectTechnician(profile.id);
          assert.equal((await service.snapshot(actor, "technician")).month.lateCount, 0);
          now = startsAt;
          await service.inspectTechnician(profile.id);
          assert.equal((await service.snapshot(actor, "technician")).month.lateCount, 0);
          now = new Date(startsAt.getTime() + 1000);
          await service.inspectTechnician(profile.id);
          await service.inspectTechnician(profile.id);
          assert.equal((await service.snapshot(actor, "technician")).month.lateCount, 2);
          const arrived = await service.change(actor, {
            status: "on_duty",
            expectedVersion: 0,
            idempotencyKey: "arrival",
            shopId: shop.id
          });
          assert.equal(arrived.status, "on_duty");
          assert.equal(arrived.version, 1);
          assert.equal(arrived.month.lateCount, 2);
          assert.deepEqual(
            await service.change(actor, {
              status: "on_duty",
              expectedVersion: 0,
              idempotencyKey: "arrival",
              shopId: shop.id
            }),
            arrived
          );
          await assert.rejects(
            service.change(actor, {
              status: "resting",
              expectedVersion: 0,
              idempotencyKey: "arrival"
            }),
            (error) => (error as { statusCode: number }).statusCode === 409
          );
          await assert.rejects(
            service.change(actor, {
              status: "resting",
              expectedVersion: 0,
              idempotencyKey: "stale"
            }),
            (error) => (error as { statusCode: number }).statusCode === 409
          );
          const late = await service.events(actor, "technician", undefined, {
            page: 1,
            page_size: 1,
            incidentsOnly: true
          });
          assert.equal(late.total, 2);
          assert.equal(late.list.length, 1);
          const page2 = await service.events(actor, "technician", undefined, {
            page: 2,
            page_size: 1,
            incidentsOnly: true
          });
          assert.notEqual(page2.list[0]!.id, late.list[0]!.id);
          assert.equal(
            [late.list[0]!, page2.list[0]!].find((e) => e.basis === "shift")!.delaySeconds,
            1
          );
          assert.equal(
            (
              await service.events(merchant, "merchant", profile.id, {
                page: 1,
                page_size: 20,
                kind: "late"
              })
            ).total,
            (await service.snapshot(merchant, "merchant", profile.id)).month.lateCount
          );
          assert.equal((await service.snapshot(ops, "operations", profile.id)).status, "on_duty");
          await assert.rejects(
            service.snapshot(
              { ...merchant, currentIdentityScopeId: foreign.id },
              "merchant",
              profile.id
            ),
            (error) => (error as { statusCode: number }).statusCode === 404
          );
          await assert.rejects(
            service.change(actor, {
              status: "off_duty",
              expectedVersion: 1,
              idempotencyKey: "leave"
            }),
            (error) =>
              (error as { data: { reason: string } }).data.reason ===
              "early_leave_confirmation_required"
          );
          const left = await service.change(actor, {
            status: "off_duty",
            expectedVersion: 1,
            idempotencyKey: "leave",
            confirmEarlyLeave: true,
            reason: "appointment",
            shopId: shop.id
          });
          assert.equal(left.month.earlyLeaveCount, 1);
          const persistedEarly = await service.events(merchant, "merchant", profile.id, {
            page: 1,
            page_size: 20,
            kind: "early_leave"
          });
          assert.equal(persistedEarly.total, 1);
          assert.equal(persistedEarly.list[0]!.affectedOrders.length, 2);
          assert.equal(
            (
              await service.events(ops, "operations", profile.id, {
                page: 1,
                page_size: 20,
                kind: "early_leave"
              })
            ).list[0]!.affectedOrders.length,
            2
          );
          const comment = await service.comment(merchant, "merchant", profile.id, {
            message: "Checked",
            idempotencyKey: "comment"
          });
          assert.equal(
            (
              await service.comment(merchant, "merchant", profile.id, {
                message: "Checked",
                idempotencyKey: "comment"
              })
            ).id,
            comment.id
          );
          for (let i = 0; i < 22; i++)
            await service.comment(actor, "technician", undefined, {
              message: `Record ${i}`,
              idempotencyKey: `record-${i}`
            });
          const all = await service.events(actor, "technician", undefined, {
            page: 1,
            page_size: 20
          });
          const next = await service.events(actor, "technician", undefined, {
            page: 2,
            page_size: 20
          });
          assert.equal(all.list.length + next.list.length, all.total);
          const from = startsAt.toISOString(),
            to = new Date(startsAt.getTime() + 1000).toISOString();
          assert.equal(
            (
              await service.events(actor, "technician", undefined, {
                page: 1,
                page_size: 20,
                incidentsOnly: true,
                from,
                to
              })
            ).total,
            2
          );
          assert.ok(
            (await tx.auditLog.count({
              where: { targetType: "TechnicianProfile", targetId: profile.id }
            })) > 0
          );
          throw rollback;
        },
        { timeout: 60000 }
      );
    } catch (error) {
      if (error !== rollback) throw error;
    }
    assert.equal(await prisma.user.count({ where: { email: `${marker}@needo.test` } }), 0);
    assert.equal(await prisma.shop.count({ where: { name: { startsWith: marker } } }), 0);
    console.log(
      JSON.stringify({
        status: "passed",
        target: target.maskedDatabaseTarget,
        checks: [
          "unsynced",
          "zero-grace",
          "personal-availability-excluded",
          "worker-idempotency",
          "arrival-resolution",
          "CAS",
          "command-replay",
          "early-leave-preview",
          "stable-count",
          "JST-month",
          "pagination",
          "half-open-range",
          "merchant-isolation",
          "operations-alias",
          "comments",
          "audit",
          "rollback"
        ]
      })
    );
  } finally {
    await disconnectPrisma();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
