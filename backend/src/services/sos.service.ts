import { randomUUID } from "node:crypto";
import type { AuthenticatedAccessContext, AuthRequestContext } from "./auth.service";
import { FORMAL_MERCHANT_IDENTITY_TYPES, requireMerchantShopId } from "./merchant-shop-scope";
import type { RealtimeEventGatewayPort } from "./realtime-event.gateway";
import { AppError } from "../utils/app-error";

export interface SosAlert {
  id: number;
  orderId: number;
  orderNo: string;
  shopId: number;
  shopName: string;
  serviceName: string;
  senderName: string;
  senderType: "customer" | "technician";
  status: "pending" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
}
export interface SosOrder {
  id: number;
  shopId: number;
  customerUserId: number;
  technicianUserId: number | null;
  session: { startedAt: Date | null; endedAt: Date | null } | null;
}
export interface SosScope {
  shopId?: number;
}
export interface SosQuery {
  status?: "pending" | "resolved";
  page: number;
  page_size: number;
}
export interface SosStore {
  lockOrder(id: number): Promise<void>;
  order(id: number): Promise<SosOrder | null>;
  authorize(actor: AuthenticatedAccessContext, permission: string, scope?: SosScope): Promise<void>;
  active(orderId: number, identityId: number): Promise<SosAlert | null>;
  command(identityId: number, key: string): Promise<{ orderId: number; alert: SosAlert } | null>;
  bindCommand(identityId: number, key: string, orderId: number, alertId: number): Promise<void>;
  create(
    order: SosOrder,
    actor: AuthenticatedAccessContext,
    senderType: "customer" | "technician",
    now: Date
  ): Promise<SosAlert>;
  alert(id: number, scope: SosScope): Promise<SosAlert | null>;
  resolve(id: number, actor: AuthenticatedAccessContext, now: Date): Promise<SosAlert>;
  audit(
    action: string,
    alertId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<void>;
  list(
    scope: SosScope,
    query: SosQuery
  ): Promise<{ list: SosAlert[]; total: number; page: number; page_size: number }>;
  count(scope: SosScope): Promise<number>;
}
export interface SosRepositoryPort extends SosStore {
  transaction<T>(work: (store: SosStore) => Promise<T>): Promise<T>;
  recipients(shopId: number): Promise<{ id: number; userId: number }[]>;
}
export const sosError = (statusCode: number, message: string) =>
  new AppError({
    statusCode,
    code: statusCode === 403 ? 40301 : statusCode === 404 ? 40401 : 40901,
    message: `error.sos.${message}`
  });
export function assertSosSender(
  actor: AuthenticatedAccessContext,
  order: Pick<SosOrder, "customerUserId" | "technicianUserId">
): "customer" | "technician" {
  if (actor.isReadOnlyMerchantPreview || !actor.currentIdentityId) throw sosError(403, "forbidden");
  if (
    ["customer", "user", "u"].includes(actor.currentIdentityType ?? "") &&
    actor.userId === order.customerUserId
  )
    return "customer";
  if (
    ["technician", "s"].includes(actor.currentIdentityType ?? "") &&
    actor.userId === order.technicianUserId
  )
    return "technician";
  throw sosError(403, "forbidden");
}
export function sosReadScope(actor: AuthenticatedAccessContext): SosScope {
  if (!actor.currentIdentityId || actor.isReadOnlyMerchantPreview) throw sosError(403, "forbidden");
  if (FORMAL_MERCHANT_IDENTITY_TYPES.has(actor.currentIdentityType ?? ""))
    return { shopId: requireMerchantShopId(actor) };
  if (
    ["platform", "platform_admin", "admin", "operator", "support"].includes(
      actor.currentIdentityType ?? ""
    )
  ) {
    if (actor.currentIdentityScopeType === "shop" && actor.currentIdentityScopeId)
      return { shopId: actor.currentIdentityScopeId };
    if (actor.currentIdentityScopeType === "global" && !actor.currentIdentityScopeId) return {};
  }
  throw sosError(403, "forbidden");
}
export class SosService {
  constructor(
    private readonly repository: SosRepositoryPort,
    private readonly gateway: RealtimeEventGatewayPort,
    private readonly now: () => Date = () => new Date()
  ) {}
  async availability(orderId: number, actor: AuthenticatedAccessContext) {
    await this.repository.authorize(actor, "sos:create");
    const order = await this.repository.order(orderId);
    if (!order) throw sosError(404, "not_found");
    assertSosSender(actor, order);
    const active = await this.repository.active(orderId, actor.currentIdentityId!);
    return {
      canSend: true,
      serverNow: this.now().toISOString(),
      expiresAt: null,
      activeAlertId: active?.id ?? null
    };
  }
  async send(
    orderId: number,
    key: string,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ) {
    const result = await this.repository.transaction(async (store) => {
      await store.authorize(actor, "sos:create");
      await store.lockOrder(orderId);
      const order = await store.order(orderId);
      if (!order) throw sosError(404, "not_found");
      const senderType = assertSosSender(actor, order);
      const replay = await store.command(actor.currentIdentityId!, key);
      if (replay) {
        if (replay.orderId !== orderId) throw sosError(409, "idempotency_conflict");
        return { alert: replay.alert, replayed: true };
      }
      const now = this.now();
      const active = await store.active(orderId, actor.currentIdentityId!);
      const alert = active ?? (await store.create(order, actor, senderType, now));
      await store.bindCommand(actor.currentIdentityId!, key, orderId, alert.id);
      if (!active) await store.audit("sos.created", alert.id, actor, context);
      return { alert, replayed: Boolean(active) };
    });
    if (!result.replayed) await this.invalidate("sos.created", result.alert.shopId);
    return result;
  }
  async list(query: SosQuery, actor: AuthenticatedAccessContext) {
    const scope = sosReadScope(actor);
    await this.repository.authorize(actor, "sos:list", scope);
    return this.repository.list(scope, query);
  }
  async count(actor: AuthenticatedAccessContext) {
    const scope = sosReadScope(actor);
    await this.repository.authorize(actor, "sos:list", scope);
    return { pending: await this.repository.count(scope) };
  }
  async resolve(alertId: number, actor: AuthenticatedAccessContext, context: AuthRequestContext) {
    const scope = sosReadScope(actor);
    const result = await this.repository.transaction(async (store) => {
      await store.authorize(actor, "sos:resolve", scope);
      const initial = await store.alert(alertId, scope);
      if (!initial) throw sosError(404, "not_found");
      await store.lockOrder(initial.orderId);
      const alert = await store.alert(alertId, scope);
      if (!alert) throw sosError(404, "not_found");
      if (alert.status === "resolved") return { alert, replayed: true };
      const resolved = await store.resolve(alertId, actor, this.now());
      await store.audit("sos.resolved", alertId, actor, context);
      return { alert: resolved, replayed: false };
    });
    if (!result.replayed) await this.invalidate("sos.resolved", result.alert.shopId);
    return result;
  }
  private async invalidate(type: string, shopId: number) {
    try {
      for (const recipient of await this.repository.recipients(shopId))
        this.gateway.publish({
          id: randomUUID(),
          type,
          recipientUserId: recipient.userId,
          recipientIdentityId: recipient.id,
          payload: {},
          createdAt: this.now().toISOString()
        });
    } catch {
      /* Durable state is authoritative; clients recover through polling. */
    }
  }
}
