import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type { AuthenticatedAccessContext, AuthRequestContext } from "../services/auth.service";
import { FORMAL_MERCHANT_IDENTITY_TYPES } from "../services/merchant-shop-scope";
import {
  sosError,
  sosReadScope,
  type SosAlert,
  type SosOrder,
  type SosQuery,
  type SosScope,
  type SosStore,
  type SosRepositoryPort
} from "../services/sos.service";
const include = {
  order: {
    select: {
      orderNo: true,
      serviceNameSnapshot: true,
      service: { select: { name: true } },
      technicianService: { select: { name: true } }
    }
  },
  shop: { select: { name: true } },
  sender: { select: { username: true } },
  senderIdentity: { select: { displayName: true } },
  resolvedBy: { select: { username: true } }
} satisfies Prisma.SosAlertInclude;
type Row = Prisma.SosAlertGetPayload<{ include: typeof include }>;
const dto = (row: Row): SosAlert => ({
  id: row.id,
  orderId: row.orderId,
  orderNo: row.order.orderNo,
  shopId: row.shopId,
  shopName: row.shop.name,
  serviceName:
    row.order.serviceNameSnapshot ??
    row.order.service?.name ??
    row.order.technicianService?.name ??
    "",
  senderName: row.senderIdentity.displayName ?? row.sender.username,
  senderType: row.senderType as SosAlert["senderType"],
  status: row.status as SosAlert["status"],
  createdAt: row.createdAt.toISOString(),
  resolvedAt: row.resolvedAt?.toISOString() ?? null,
  resolvedByName: row.resolvedBy?.username ?? null
});
class PrismaSosStore implements SosStore {
  constructor(protected readonly db: Prisma.TransactionClient) {}
  async lockOrder(id: number) {
    await this.db
      .$queryRaw`SELECT id FROM booking_orders WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
  }
  async order(id: number): Promise<SosOrder | null> {
    const row = await this.db.bookingOrder.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        shopId: true,
        customerUserId: true,
        technicianProfile: { select: { userId: true, deletedAt: true } },
        serviceSession: { select: { startedAt: true, endedAt: true, deletedAt: true } }
      }
    });
    if (!row) return null;
    return {
      id: row.id,
      shopId: row.shopId,
      customerUserId: row.customerUserId,
      technicianUserId:
        row.technicianProfile?.deletedAt === null ? row.technicianProfile.userId : null,
      session: row.serviceSession?.deletedAt === null ? row.serviceSession : null
    };
  }
  async authorize(actor: AuthenticatedAccessContext, permission: string, scope?: SosScope) {
    if (
      actor.isReadOnlyMerchantPreview ||
      !actor.currentIdentityId ||
      !actor.permissions.includes(permission)
    )
      throw sosError(403, "forbidden");
    const identity = await this.db.userIdentity.findFirst({
      where: {
        id: actor.currentIdentityId,
        userId: actor.userId,
        type: actor.currentIdentityType,
        isActive: true,
        deletedAt: null,
        user: { isActive: true, deletedAt: null }
      }
    });
    if (
      !identity ||
      identity.scopeType !== (actor.currentIdentityScopeType ?? null) ||
      identity.scopeId !== (actor.currentIdentityScopeId ?? null)
    )
      throw sosError(403, "forbidden");
    const permissionGrant = await this.db.userRole.findFirst({
      where: {
        userId: actor.userId,
        deletedAt: null,
        OR: [
          { scopeType: null, scopeId: null },
          { scopeType: "global", scopeId: null },
          { scopeType: identity.scopeType, scopeId: identity.scopeId },
          ...(scope?.shopId ? [{ scopeType: "shop", scopeId: scope.shopId }] : [])
        ],
        role: {
          deletedAt: null,
          rolePermissions: {
            some: { deletedAt: null, permission: { code: permission, deletedAt: null } }
          }
        }
      }
    });
    if (!permissionGrant) throw sosError(403, "forbidden");
    if (
      scope?.shopId &&
      FORMAL_MERCHANT_IDENTITY_TYPES.has(identity.type) &&
      ["merchant_account", "merchant"].includes(identity.scopeType ?? "")
    ) {
      const membership = await this.db.merchantShopMembership.findFirst({
        where: {
          merchantAccountId: identity.scopeId!,
          shopId: scope.shopId,
          deletedAt: null,
          activeKey: { not: null },
          startsAt: { lte: new Date() },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          merchantAccount: { status: "active", deletedAt: null },
          shop: { deletedAt: null, status: { in: ["active", "published"] } }
        }
      });
      if (!membership) throw sosError(403, "forbidden");
    }
  }
  async active(orderId: number, senderIdentityId: number) {
    const row = await this.db.sosAlert.findFirst({
      where: { orderId, senderIdentityId, status: "pending", deletedAt: null },
      include
    });
    return row ? dto(row) : null;
  }
  async command(senderIdentityId: number, idempotencyKey: string) {
    const row = await this.db.sosCommand.findUnique({
      where: { senderIdentityId_idempotencyKey: { senderIdentityId, idempotencyKey } },
      include: { alert: { include } }
    });
    return row ? { orderId: row.orderId, alert: dto(row.alert) } : null;
  }
  async bindCommand(
    senderIdentityId: number,
    idempotencyKey: string,
    orderId: number,
    alertId: number
  ) {
    await this.db.sosCommand.create({
      data: { senderIdentityId, idempotencyKey, orderId, alertId }
    });
  }
  async create(
    order: SosOrder,
    actor: AuthenticatedAccessContext,
    senderType: "customer" | "technician",
    now: Date
  ) {
    return dto(
      await this.db.sosAlert.create({
        data: {
          orderId: order.id,
          shopId: order.shopId,
          senderUserId: actor.userId,
          senderIdentityId: actor.currentIdentityId!,
          senderType,
          activeKey: `${order.id}:${actor.currentIdentityId}`,
          createdAt: now
        },
        include
      })
    );
  }
  async alert(id: number, scope: SosScope) {
    const row = await this.db.sosAlert.findFirst({
      where: { id, ...scope, deletedAt: null },
      include
    });
    return row ? dto(row) : null;
  }
  async resolve(id: number, actor: AuthenticatedAccessContext, now: Date) {
    return dto(
      await this.db.sosAlert.update({
        where: { id },
        data: {
          status: "resolved",
          activeKey: null,
          resolvedAt: now,
          resolvedByUserId: actor.userId,
          resolvedByIdentityId: actor.currentIdentityId!
        },
        include
      })
    );
  }
  async audit(
    action: string,
    alertId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ) {
    await this.db.auditLog.create({
      data: {
        action,
        targetType: "SosAlert",
        targetId: alertId,
        actorId: actor.userId,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { actorIdentityId: actor.currentIdentityId! }
      }
    });
  }
  async list(scope: SosScope, query: SosQuery) {
    const where = { ...scope, status: query.status, deletedAt: null };
    const [list, total] = await Promise.all([
      this.db.sosAlert.findMany({
        where,
        include,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size
      }),
      this.db.sosAlert.count({ where })
    ]);
    return { list: list.map(dto), total, page: query.page, page_size: query.page_size };
  }
  async count(scope: SosScope) {
    return this.db.sosAlert.count({ where: { ...scope, status: "pending", deletedAt: null } });
  }
}
export class SosRepository extends PrismaSosStore implements SosRepositoryPort {
  constructor(private readonly client: PrismaClient = prisma) {
    super(client);
  }
  async transaction<T>(work: (store: SosStore) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.client.$transaction((tx) => work(new PrismaSosStore(tx)), {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
        });
      } catch (error) {
        if (
          attempt < 3 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2002", "P2034"].includes(error.code)
        )
          continue;
        throw error;
      }
    }
  }
  async recipients(shopId: number) {
    const recipients: { id: number; userId: number }[] = [];
    const now = new Date();
    const memberships = await this.client.merchantShopMembership.findMany({
      where: {
        shopId,
        deletedAt: null,
        activeKey: { not: null },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        merchantAccount: { status: "active", deletedAt: null },
        shop: { deletedAt: null, status: { in: ["active", "published"] } }
      },
      select: { merchantAccountId: true }
    });
    const accountIds = new Set(memberships.map((row) => row.merchantAccountId));
    let cursor = 0;
    for (;;) {
      const identities = await this.client.userIdentity.findMany({
        where: {
          id: { gt: cursor },
          isActive: true,
          deletedAt: null,
          type: {
            in: [
              ...FORMAL_MERCHANT_IDENTITY_TYPES,
              "platform",
              "platform_admin",
              "admin",
              "operator",
              "support"
            ]
          },
          user: { isActive: true, deletedAt: null }
        },
        select: {
          id: true,
          userId: true,
          type: true,
          scopeType: true,
          scopeId: true,
          user: {
            select: {
              userRoles: {
                where: {
                  deletedAt: null,
                  role: {
                    deletedAt: null,
                    rolePermissions: {
                      some: { deletedAt: null, permission: { code: "sos:list", deletedAt: null } }
                    }
                  }
                },
                select: { scopeType: true, scopeId: true }
              }
            }
          }
        },
        orderBy: { id: "asc" },
        take: 100
      });
      if (!identities.length) break;
      for (const identity of identities) {
        const actor = {
          userId: identity.userId,
          currentIdentityId: identity.id,
          currentIdentityType: identity.type,
          currentIdentityScopeType: identity.scopeType,
          currentIdentityScopeId: identity.scopeId,
          selectedMerchantShopId: shopId,
          permissions: ["sos:list"]
        } as AuthenticatedAccessContext;
        try {
          const scope = sosReadScope(actor);
          if (scope.shopId && scope.shopId !== shopId) continue;
          if (
            FORMAL_MERCHANT_IDENTITY_TYPES.has(identity.type) &&
            ["merchant_account", "merchant"].includes(identity.scopeType ?? "") &&
            !accountIds.has(identity.scopeId!)
          )
            continue;
          if (
            !identity.user.userRoles.some(
              (grant) =>
                (!grant.scopeId && (!grant.scopeType || grant.scopeType === "global")) ||
                (grant.scopeType === identity.scopeType && grant.scopeId === identity.scopeId) ||
                (scope.shopId && grant.scopeType === "shop" && grant.scopeId === scope.shopId)
            )
          )
            continue;
          recipients.push({ id: identity.id, userId: identity.userId });
        } catch (error) {
          if (error instanceof Error && "statusCode" in error && error.statusCode === 403) continue;
          throw error;
        }
      }
      cursor = identities[identities.length - 1].id;
    }
    return recipients;
  }
}
