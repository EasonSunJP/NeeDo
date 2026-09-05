import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import type { PrismaClient } from "@prisma/client";

const rollback = new Error("merchant notice acceptance rollback");

async function main(): Promise<void> {
  const envFile = process.env.ENV_FILE;
  if (!envFile) throw new Error("ENV_FILE is required for local merchant notice acceptance");
  const loaded = loadDotenv({ path: envFile, override: true });
  if (loaded.error) throw loaded.error;
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["development", "test"].includes(process.env.NODE_ENV ?? "") ||
    !["local", "test"].includes(process.env.DEPLOY_ENV ?? "") ||
    !["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname) ||
    !/(?:dev|test|local)/i.test(databaseUrl.pathname) ||
    /prod|staging/i.test(databaseUrl.pathname)
  )
    throw new Error("Merchant notice checker requires an explicitly local non-production database");

  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  const { OfficialNoticeRepository } =
    await import("../src/repositories/official-notice.repository");
  const { OfficialNoticeService } = await import("../src/services/official-notice.service");
  const { merchantNoticeCreateBodySchema } =
    await import("../src/validators/official-notice.validator");
  const marker = `merchant-notice-check-${randomUUID()}`;
  const cardPrefix = `MNC-${randomUUID().slice(0, 18)}`;
  const technicianRoleCode = `TECH_${randomUUID().slice(0, 12)}`;
  const now = new Date();
  const scheduledAt = new Date(now.getTime() + 3_600_000).toISOString();
  let report: Record<string, unknown> | undefined;

  try {
    const columns = await prisma.$queryRaw<
      Array<{
        COLUMN_NAME: string;
        COLUMN_TYPE: string;
        IS_NULLABLE: string;
        COLUMN_DEFAULT: string | null;
      }>
    >`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'official_notices'
        AND COLUMN_NAME IN ('issuer_type', 'issuer_shop_id', 'created_by_identity_id')
      ORDER BY COLUMN_NAME`;
    assert.deepEqual(columns, [
      {
        COLUMN_NAME: "created_by_identity_id",
        COLUMN_TYPE: "int",
        IS_NULLABLE: "YES",
        COLUMN_DEFAULT: null
      },
      {
        COLUMN_NAME: "issuer_shop_id",
        COLUMN_TYPE: "int",
        IS_NULLABLE: "YES",
        COLUMN_DEFAULT: null
      },
      {
        COLUMN_NAME: "issuer_type",
        COLUMN_TYPE: "enum('platform','shop')",
        IS_NULLABLE: "NO",
        COLUMN_DEFAULT: "platform"
      }
    ]);
    const constraints = await prisma.$queryRaw<Array<{ CONSTRAINT_NAME: string }>>`
      SELECT CONSTRAINT_NAME
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'official_notices'
        AND CONSTRAINT_NAME IN (
          'official_notices_issuer_scope_check',
          'official_notices_issuer_shop_id_fkey',
          'official_notices_created_by_identity_id_fkey'
        )
      ORDER BY CONSTRAINT_NAME`;
    assert.deepEqual(
      constraints.map((item) => item.CONSTRAINT_NAME),
      [
        "official_notices_created_by_identity_id_fkey",
        "official_notices_issuer_scope_check",
        "official_notices_issuer_shop_id_fkey"
      ]
    );
    const indexes = await prisma.$queryRaw<Array<{ INDEX_NAME: string }>>`
      SELECT DISTINCT INDEX_NAME
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'official_notices'
        AND INDEX_NAME IN (
          'official_notices_issuer_scope_created_at_idx',
          'official_notices_issuer_shop_id_idx',
          'official_notices_created_by_identity_id_idx'
        )
      ORDER BY INDEX_NAME`;
    assert.deepEqual(
      indexes.map((item) => item.INDEX_NAME),
      [
        "official_notices_created_by_identity_id_idx",
        "official_notices_issuer_scope_created_at_idx",
        "official_notices_issuer_shop_id_idx"
      ]
    );
    const permissionCodes = [
      "merchant-admin:notice:read",
      "merchant-admin:notice:create",
      "merchant-admin:notice:review",
      "merchant-admin:notice:send"
    ];
    const permissions = await prisma.permission.count({
      where: {
        code: { in: permissionCodes },
        deletedAt: null
      }
    });
    assert.equal(permissions, 4, "all merchant notice permissions must exist");
    const roleGrants = await prisma.rolePermission.findMany({
      where: {
        deletedAt: null,
        role: { code: { in: ["merchant_owner", "merchant_staff"] }, deletedAt: null },
        permission: { code: { in: permissionCodes }, deletedAt: null }
      },
      select: { role: { select: { code: true } }, permission: { select: { code: true } } },
      orderBy: [{ role: { code: "asc" } }, { permission: { code: "asc" } }]
    });
    assert.deepEqual(
      roleGrants.map((grant) => `${grant.role.code}:${grant.permission.code}`),
      ["merchant_owner", "merchant_staff"].flatMap((roleCode) =>
        [...permissionCodes]
          .sort()
          .map((permissionCode) => `${roleCode}:${permissionCode}`)
      )
    );
    const databaseStructure = true;
    const permissionGrants = true;

    await prisma.$transaction(
      async (tx) => {
        const transactionClient = new Proxy(tx, {
          get(target, property) {
            if (property === "$transaction")
              return (operation: (client: typeof tx) => Promise<unknown>) => operation(tx);
            return Reflect.get(target, property);
          }
        }) as unknown as PrismaClient;
        const repository = new OfficialNoticeRepository(transactionClient);
        const service = new OfficialNoticeService(repository, { now: () => now });
        const shopOne = await tx.shop.create({
          data: {
            name: `${marker}-shop-one`,
            city: "Tokyo",
            address: "Local rollback fixture",
            status: "published",
            createdAt: now,
            updatedAt: now
          }
        });
        const shopTwo = await tx.shop.create({
          data: {
            name: `${marker}-shop-two`,
            city: "Tokyo",
            address: "Local rollback fixture",
            status: "published",
            createdAt: now,
            updatedAt: now
          }
        });
        let sequence = 0;
        const createUser = async () => {
          sequence += 1;
          const digits = `${Date.now() % 100000000}${sequence.toString().padStart(2, "0")}`.slice(-10);
          return tx.user.create({
            data: {
              needoId: `n${digits}`,
              email: `${marker}-${sequence}@example.test`,
              username: `${marker}-${sequence}`,
              isTestAccount: true,
              createdAt: now,
              updatedAt: now
            }
          });
        };
        const createIdentity = (
          userId: number,
          type: string,
          scopeType: string | null = "global",
          scopeId: number | null = null
        ) =>
          tx.userIdentity.create({
            data: {
              userId,
              type,
              scopeType,
              scopeId,
              displayName: `${marker}-${userId}-${type}`,
              activeKey: `${marker}:identity:${userId}:${type}:${scopeType}:${scopeId ?? "none"}`,
              isActive: true,
              isDefault: type === "merchant_owner",
              createdAt: now,
              updatedAt: now
            }
          });
        const createEmployee = async (
          shopId: number,
          userId: number,
          technicianShopAffiliationId?: number
        ) =>
          tx.shopEmployee.create({
            data: {
              shopId,
              userId,
              status: "ACTIVE",
              startsAt: new Date(now.getTime() - 60_000),
              activeKey: `${marker}:employee:${shopId}:${userId}`,
              technicianShopAffiliationId,
              createdAt: now,
              updatedAt: now
            }
          });

        const publisherOne = await createUser();
        const publisherOneIdentity = await createIdentity(
          publisherOne.id,
          "merchant_owner",
          "shop",
          shopOne.id
        );
        await createEmployee(shopOne.id, publisherOne.id);
        const publisherTwo = await createUser();
        const publisherTwoIdentity = await createIdentity(
          publisherTwo.id,
          "merchant_owner",
          "shop",
          shopTwo.id
        );
        const publisherTwoEmployee = await createEmployee(shopTwo.id, publisherTwo.id);

        const cardholder = await createUser();
        const cardholderIdentity = await createIdentity(cardholder.id, "customer");
        const cardholderProfile = await tx.customerProfile.create({
          data: {
            userId: cardholder.id,
            displayName: `${marker}-cardholder`,
            createdAt: now,
            updatedAt: now
          }
        });
        const membership = await tx.shopCustomerMembership.create({
          data: {
            shopId: shopOne.id,
            customerProfileId: cardholderProfile.id,
            status: "ACTIVE",
            activeKey: `${marker}:membership:valid`,
            startedAt: new Date(now.getTime() - 60_000),
            createdAt: now,
            updatedAt: now
          }
        });
        await tx.shopMembershipCard.create({
          data: {
            membershipId: membership.id,
            cardNo: `${cardPrefix}-valid`,
            name: "Valid card",
            type: "BENEFIT",
            status: "ACTIVE",
            issuedAt: new Date(now.getTime() - 60_000),
            expiresAt: new Date(now.getTime() + 60_000),
            createdAt: now,
            updatedAt: now
          }
        });

        const noCardholder = await createUser();
        await createIdentity(noCardholder.id, "customer");
        const noCardProfile = await tx.customerProfile.create({
          data: {
            userId: noCardholder.id,
            displayName: `${marker}-no-card`,
            createdAt: now,
            updatedAt: now
          }
        });
        await tx.shopCustomerMembership.create({
          data: {
            shopId: shopOne.id,
            customerProfileId: noCardProfile.id,
            status: "ACTIVE",
            activeKey: `${marker}:membership:no-card`,
            startedAt: new Date(now.getTime() - 60_000),
            createdAt: now,
            updatedAt: now
          }
        });

        const foreignCardholder = await createUser();
        await createIdentity(foreignCardholder.id, "customer");
        const foreignCardProfile = await tx.customerProfile.create({
          data: {
            userId: foreignCardholder.id,
            displayName: `${marker}-foreign-card`,
            createdAt: now,
            updatedAt: now
          }
        });
        const foreignMembership = await tx.shopCustomerMembership.create({
          data: {
            shopId: shopTwo.id,
            customerProfileId: foreignCardProfile.id,
            status: "ACTIVE",
            activeKey: `${marker}:membership:foreign-card`,
            startedAt: new Date(now.getTime() - 60_000),
            createdAt: now,
            updatedAt: now
          }
        });
        await tx.shopMembershipCard.create({
          data: {
            membershipId: foreignMembership.id,
            cardNo: `${cardPrefix}-foreign`,
            name: "Foreign shop card",
            type: "BENEFIT",
            status: "ACTIVE",
            issuedAt: new Date(now.getTime() - 60_000),
            expiresAt: new Date(now.getTime() + 60_000),
            createdAt: now,
            updatedAt: now
          }
        });

        const expiredCardholder = await createUser();
        await createIdentity(expiredCardholder.id, "customer");
        const expiredProfile = await tx.customerProfile.create({
          data: {
            userId: expiredCardholder.id,
            displayName: `${marker}-expired`,
            createdAt: now,
            updatedAt: now
          }
        });
        const expiredMembership = await tx.shopCustomerMembership.create({
          data: {
            shopId: shopOne.id,
            customerProfileId: expiredProfile.id,
            status: "ACTIVE",
            activeKey: `${marker}:membership:expired`,
            startedAt: new Date(now.getTime() - 120_000),
            createdAt: now,
            updatedAt: now
          }
        });
        await tx.shopMembershipCard.create({
          data: {
            membershipId: expiredMembership.id,
            cardNo: `${cardPrefix}-expired`,
            name: "Expired card",
            type: "BENEFIT",
            status: "ACTIVE",
            issuedAt: new Date(now.getTime() - 120_000),
            expiresAt: new Date(now.getTime() - 60_000),
            createdAt: now,
            updatedAt: now
          }
        });

        const employee = await createUser();
        const employeeIdentities = await Promise.all([
          createIdentity(employee.id, "merchant_staff", "shop", shopOne.id),
          createIdentity(employee.id, "customer")
        ]);
        const employeeRow = await createEmployee(shopOne.id, employee.id);

        const endedEmployee = await createUser();
        await createIdentity(endedEmployee.id, "merchant_staff", "shop", shopOne.id);
        await tx.shopEmployee.create({
          data: {
            shopId: shopOne.id,
            userId: endedEmployee.id,
            status: "ENDED",
            startsAt: new Date(now.getTime() - 120_000),
            endsAt: new Date(now.getTime() - 60_000),
            createdAt: now,
            updatedAt: now
          }
        });

        const technician = await createUser();
        const technicianIdentities = await Promise.all([
          createIdentity(technician.id, "technician"),
          createIdentity(technician.id, "customer")
        ]);
        const technicianProfile = await tx.technicianProfile.create({
          data: {
            userId: technician.id,
            displayName: `${marker}-technician`,
            city: "Tokyo",
            createdAt: now,
            updatedAt: now
          }
        });
        const affiliation = await tx.technicianShopAffiliation.create({
          data: {
            technicianProfileId: technicianProfile.id,
            shopId: shopOne.id,
            relationshipType: "PARTNER",
            workStatus: "ACTIVE",
            startsAt: new Date(now.getTime() - 60_000),
            activeKey: `${marker}:affiliation`,
            createdAt: now,
            updatedAt: now
          }
        });
        const technicianEmployee = await createEmployee(
          shopOne.id,
          technician.id,
          affiliation.id
        );
        const technicianRole = await tx.shopEmployeeRole.create({
          data: {
            shopId: shopOne.id,
            code: technicianRoleCode,
            nameZhHans: "技师",
            nameZhHant: "技師",
            nameJa: "技術者",
            nameEn: "Technician",
            nameKo: "기술자",
            isTechnicianRole: true,
            activeKey: `${marker}:role`,
            createdAt: now,
            updatedAt: now
          }
        });
        await tx.shopEmployeeRoleAssignment.create({
          data: {
            shopEmployeeId: technicianEmployee.id,
            shopEmployeeRoleId: technicianRole.id,
            startsAt: new Date(now.getTime() - 60_000),
            activeKey: `${marker}:assignment`,
            createdAt: now,
            updatedAt: now
          }
        });

        const createExcludedTechnician = async (
          suffix: string,
          affiliationShopId: number,
          assignmentEndsAt?: Date
        ) => {
          const user = await createUser();
          const identity = await createIdentity(user.id, "technician");
          const profile = await tx.technicianProfile.create({
            data: {
              userId: user.id,
              displayName: `${marker}-${suffix}`,
              city: "Tokyo",
              createdAt: now,
              updatedAt: now
            }
          });
          const excludedAffiliation = await tx.technicianShopAffiliation.create({
            data: {
              technicianProfileId: profile.id,
              shopId: affiliationShopId,
              relationshipType: "PARTNER",
              workStatus: "ACTIVE",
              startsAt: new Date(now.getTime() - 120_000),
              activeKey: `${marker}:affiliation:${suffix}`,
              createdAt: now,
              updatedAt: now
            }
          });
          const excludedEmployee = await createEmployee(
            shopOne.id,
            user.id,
            excludedAffiliation.id
          );
          if (suffix !== "missing-role") {
            await tx.shopEmployeeRoleAssignment.create({
              data: {
                shopEmployeeId: excludedEmployee.id,
                shopEmployeeRoleId: technicianRole.id,
                startsAt: new Date(now.getTime() - 120_000),
                endsAt: assignmentEndsAt,
                activeKey: assignmentEndsAt ? null : `${marker}:assignment:${suffix}`,
                createdAt: now,
                updatedAt: now
              }
            });
          }
          return identity;
        };
        const excludedTechnicianIdentities = await Promise.all([
          createExcludedTechnician("missing-role", shopOne.id),
          createExcludedTechnician(
            "expired-role",
            shopOne.id,
            new Date(now.getTime() - 60_000)
          ),
          createExcludedTechnician("mismatched-affiliation", shopTwo.id)
        ]);

        const actorOne = {
          userId: publisherOne.id,
          currentIdentityId: publisherOneIdentity.id,
          currentIdentityType: "merchant_owner",
          currentIdentityScopeType: "shop",
          currentIdentityScopeId: shopOne.id
        } as Parameters<typeof service.createAndPlanMerchant>[0];
        const actorTwo = {
          userId: publisherTwo.id,
          currentIdentityId: publisherTwoIdentity.id,
          currentIdentityType: "merchant_owner",
          currentIdentityScopeType: "shop",
          currentIdentityScopeId: shopTwo.id
        } as Parameters<typeof service.createAndPlanMerchant>[0];
        const context = { ip: "127.0.0.1", userAgent: marker };
        const create = (actor: typeof actorOne, audience: string, suffix: string) =>
          service.createAndPlanMerchant(
            actor,
            context,
            merchantNoticeCreateBodySchema.parse({
              sourceLocale: "ja",
              level: "important",
              title: `${marker}-${suffix}`,
              summary: marker,
              blocks: [{ id: "p-1", type: "paragraph", content: marker }],
              audience: { type: audience },
              sendMode: "scheduled",
              scheduledAt,
              idempotencyKey: `${marker}-${suffix}`
            })
          );

        const cardNotice = await create(actorOne, "shop_card_holders", "cardholders");
        const employeeNotice = await create(actorOne, "shop_employees", "employees");
        const technicianNotice = await create(actorOne, "shop_technicians", "technicians");
        const audienceIds = async (noticePublicId: string) => {
          const notice = await tx.officialNotice.findUniqueOrThrow({
            where: { publicId: noticePublicId },
            select: { id: true }
          });
          return (
            await tx.noticeAudience.findMany({
              where: { noticeId: notice.id },
              orderBy: { recipientIdentityId: "asc" },
              select: { recipientIdentityId: true }
            })
          ).map((item) => item.recipientIdentityId);
        };
        assert.deepEqual(await audienceIds(cardNotice.publicId), [cardholderIdentity.id]);
        assert.deepEqual(
          await audienceIds(employeeNotice.publicId),
          [
            publisherOneIdentity.id,
            ...employeeIdentities.map((item) => item.id),
            ...technicianIdentities.map((item) => item.id),
            ...excludedTechnicianIdentities.map((item) => item.id)
          ].sort((left, right) => left - right)
        );
        assert.deepEqual(
          await audienceIds(technicianNotice.publicId),
          technicianIdentities.map((item) => item.id).sort((left, right) => left - right)
        );

        const frozenBefore = await audienceIds(cardNotice.publicId);
        await tx.shopCustomerMembership.update({
          where: { id: membership.id },
          data: { status: "ENDED", endedAt: now, activeKey: null, updatedAt: now }
        });
        await tx.shopEmployee.update({
          where: { id: employeeRow.id },
          data: { status: "ENDED", endsAt: now, activeKey: null, updatedAt: now }
        });
        assert.deepEqual(await audienceIds(cardNotice.publicId), frozenBefore);
        assert.equal(
          (await service.createAndPlanMerchant(
            actorOne,
            context,
            merchantNoticeCreateBodySchema.parse({
              sourceLocale: "ja",
              level: "important",
              title: `${marker}-employees`,
              summary: marker,
              blocks: [{ id: "p-1", type: "paragraph", content: marker }],
              audience: { type: "shop_employees" },
              sendMode: "scheduled",
              scheduledAt,
              idempotencyKey: `${marker}-employees`
            })
          )).publicId,
          employeeNotice.publicId
        );
        await assert.rejects(
          service.createAndPlanMerchant(
            actorTwo,
            context,
            merchantNoticeCreateBodySchema.parse({
              sourceLocale: "ja",
              level: "important",
              title: `${marker}-employees`,
              summary: marker,
              blocks: [{ id: "p-1", type: "paragraph", content: marker }],
              audience: { type: "shop_employees" },
              sendMode: "scheduled",
              scheduledAt,
              idempotencyKey: `${marker}-employees`
            })
          ),
          /idempotency_key_reused/
        );

        const shopTwoNotice = await create(actorTwo, "shop_employees", "shop-two");
        await assert.rejects(
          create(actorTwo, "shop_technicians", "empty-technicians"),
          /audience_empty/
        );
        const shopOnePage = await service.listMerchant(actorOne, { page: 1, pageSize: 100 });
        assert.ok(shopOnePage.list.some((item) => item.publicId === employeeNotice.publicId));
        assert.ok(!shopOnePage.list.some((item) => item.publicId === shopTwoNotice.publicId));
        const platformPage = await service.listBackoffice(
          { userId: publisherOne.id } as Parameters<typeof service.listBackoffice>[0],
          { page: 1, pageSize: 100 }
        );
        assert.ok(!platformPage.list.some((item) => item.publicId === employeeNotice.publicId));
        await assert.rejects(
          service.cancelMerchant(actorTwo, context, employeeNotice.publicId, {
            expectedLockVersion: employeeNotice.lockVersion,
            reason: "wrong shop",
            idempotencyKey: `${marker}-wrong-shop-cancel`
          }),
          /not_found/
        );
        assert.equal(
          (
            await service.cancelMerchant(actorOne, context, employeeNotice.publicId, {
              expectedLockVersion: employeeNotice.lockVersion,
              reason: "same shop",
              idempotencyKey: `${marker}-same-shop-cancel`
            })
          ).status,
          "cancelled"
        );
        await tx.shopEmployee.update({
          where: { id: publisherTwoEmployee.id },
          data: { status: "ENDED", endsAt: now, activeKey: null, updatedAt: now }
        });
        await assert.rejects(
          service.cancelMerchant(actorTwo, context, shopTwoNotice.publicId, {
            expectedLockVersion: shopTwoNotice.lockVersion,
            reason: "inactive publisher",
            idempotencyKey: `${marker}-inactive-publisher-cancel`
          }),
          /identity\.forbidden/
        );

        report = {
          databaseStructure,
          permissionGrants,
          negativeAudienceMatrix: true,
          inactivePublisherLifecycle: true,
          cardholderEligibility: true,
          employeeEligibility: true,
          technicianEligibility: true,
          frozenAudience: true,
          crossShopIsolation: true,
          platformManagementIsolation: true,
          scopeBoundIdempotency: true
        };
        throw rollback;
      },
      { timeout: 120_000 }
    );
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    try {
      assert.equal(
        await prisma.user.count({ where: { email: { startsWith: marker } } }),
        0,
        "user fixtures must roll back"
      );
      assert.equal(
        await prisma.shop.count({ where: { name: { startsWith: marker } } }),
        0,
        "shop fixtures must roll back"
      );
      assert.equal(
        await prisma.officialNotice.count({ where: { idempotencyKey: { startsWith: marker } } }),
        0,
        "notice fixtures must roll back"
      );
    } finally {
      await disconnectPrisma();
    }
  }
  assert.ok(report, "checker must finish every merchant notice assertion");
  process.stdout.write(`${JSON.stringify({ ...report, rolledBack: true }, null, 2)}\n`);
}

if (require.main === module)
  void main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Merchant notice acceptance failed"}\n`
    );
    process.exitCode = 1;
  });
