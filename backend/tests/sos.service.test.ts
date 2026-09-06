import { sosReadScope, assertSosSender } from "../src/services/sos.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
const now = new Date("2026-09-06T01:00:00Z");
const actor = (type: string, extra = {}) =>
  ({
    userId: 1,
    currentIdentityId: 10,
    currentIdentityType: type,
    permissions: ["sos:create", "sos:list", "sos:resolve"],
    ...extra
  }) as AuthenticatedAccessContext;
describe("SOS sender authority", () => {
  test("customer ownership and current identity required", () => {
    expect(assertSosSender(actor("customer"), { customerUserId: 1, technicianUserId: 2 })).toBe(
      "customer"
    );
    expect(() =>
      assertSosSender(actor("technician"), { customerUserId: 1, technicianUserId: 2 })
    ).toThrow();
    expect(() =>
      assertSosSender(actor("merchant_owner"), { customerUserId: 1, technicianUserId: 1 })
    ).toThrow();
    expect(() =>
      assertSosSender(actor("customer", { isReadOnlyMerchantPreview: true }), {
        customerUserId: 1,
        technicianUserId: 1
      })
    ).toThrow();
  });
  test("merchant selected shop limits scope, customer cannot read even with aggregated permissions", () => {
    expect(
      sosReadScope(
        actor("merchant_owner", {
          currentIdentityScopeType: "merchant_account",
          currentIdentityScopeId: 7,
          selectedMerchantShopId: 22
        })
      )
    ).toEqual({ shopId: 22 });
    expect(() => sosReadScope(actor("customer"))).toThrow();
    expect(sosReadScope(actor("platform_admin", { currentIdentityScopeType: "global" }))).toEqual(
      {}
    );
  });
});

import {
  SosService,
  type SosAlert,
  type SosRepositoryPort,
  type SosStore,
  type SosOrder
} from "../src/services/sos.service";
function lifecycleFixture() {
  let clock = now;
  let alert: SosAlert | null = null;
  const commands = new Map<string, { orderId: number; alert: SosAlert }>();
  const audit = jest.fn(async () => undefined);
  const store = {
    authorize: jest.fn(async () => undefined),
    lockOrder: jest.fn(async () => undefined),
    order: jest.fn(
      async (): Promise<SosOrder> => ({
        id: 5,
        shopId: 22,
        customerUserId: 1,
        technicianUserId: 2,
        session: { startedAt: new Date(now.getTime() - 1000), endedAt: now }
      })
    ),
    active: jest.fn(async () => (alert?.status === "pending" ? alert : null)),
    command: jest.fn(async (_id: number, key: string) => {
      const c = commands.get(key);
      return c ? { ...c, alert: alert?.id === c.alert.id ? alert : c.alert } : null;
    }),
    bindCommand: jest.fn(async (_id: number, key: string, orderId: number) => {
      commands.set(key, { orderId, alert: alert! });
    }),
    create: jest.fn(async () => {
      alert = {
        id: (alert?.id ?? 0) + 1,
        orderId: 5,
        orderNo: "SOS-5",
        shopId: 22,
        shopName: "Shop",
        serviceName: "Service",
        senderName: "Customer",
        senderType: "customer",
        status: "pending",
        createdAt: clock.toISOString(),
        resolvedAt: null,
        resolvedByName: null
      };
      return alert;
    }),
    alert: jest.fn(async () => alert),
    resolve: jest.fn(async () => {
      alert = {
        ...alert!,
        status: "resolved",
        resolvedAt: clock.toISOString(),
        resolvedByName: "Operator"
      };
      return alert;
    }),
    audit,
    list: jest.fn(async () => ({
      list: alert ? [alert] : [],
      total: alert ? 1 : 0,
      page: 1,
      page_size: 20
    })),
    count: jest.fn(async () => (alert?.status === "pending" ? 1 : 0))
  } satisfies SosStore;
  const repository = {
    ...store,
    transaction: async <T>(work: (s: SosStore) => Promise<T>) => work(store),
    recipients: jest.fn(async () => [{ id: 30, userId: 3 }])
  } satisfies SosRepositoryPort;
  const gateway = { publish: jest.fn(), subscribe: jest.fn(() => () => undefined) };
  return {
    service: new SosService(repository, gateway, () => clock),
    store,
    audit,
    gateway,
    repository,
    setClock: (date: Date) => {
      clock = date;
    }
  };
}
describe("SOS commands and durable lifecycle", () => {
  test.each([
    null,
    { startedAt: null, endedAt: null },
    { startedAt: new Date(now.getTime() + 86400000), endedAt: null },
    { startedAt: new Date(now.getTime() - 172800000), endedAt: new Date(now.getTime() - 86400000) }
  ])("availability and sending do not depend on service start or end %p", async (session) => {
    const f = lifecycleFixture();
    f.store.order.mockResolvedValue({
      id: 5,
      shopId: 22,
      customerUserId: 1,
      technicianUserId: 2,
      session
    });
    expect(await f.service.availability(5, actor("customer"))).toEqual({
      canSend: true,
      expiresAt: null,
      serverNow: now.toISOString(),
      activeAlertId: null
    });
    expect(
      (await f.service.send(5, "key-always", actor("customer"), { ip: "127.0.0.1" })).replayed
    ).toBe(false);
  });
  const customer = actor("customer");
  const admin = actor("platform_admin", { currentIdentityScopeType: "global" });
  const context = { ip: "127.0.0.1" };
  test("new keys merge while pending, opening list is read-only, resolve is explicitly idempotent", async () => {
    const f = lifecycleFixture();
    const first = await f.service.send(5, "key-first", customer, context);
    const second = await f.service.send(5, "key-second", customer, context);
    expect(second).toEqual({ alert: first.alert, replayed: true });
    expect(f.store.create).toHaveBeenCalledTimes(1);
    await f.service.list({ page: 1, page_size: 20 }, admin);
    expect(f.store.resolve).not.toHaveBeenCalled();
    await f.service.resolve(first.alert.id, admin, context);
    expect((await f.service.resolve(first.alert.id, admin, context)).replayed).toBe(true);
    expect(f.audit).toHaveBeenCalledTimes(2);
    expect(f.gateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIdentityId: 30, payload: {}, type: "sos.created" })
    );
  });
  test("retry after resolution keeps original, fresh key remains allowed long after service end", async () => {
    const f = lifecycleFixture();
    const first = await f.service.send(5, "key-first", customer, context);
    await f.service.resolve(first.alert.id, admin, context);
    f.setClock(new Date(now.getTime() + 600000));
    expect((await f.service.send(5, "key-first", customer, context)).replayed).toBe(true);
    expect((await f.service.send(5, "key-new", customer, context)).replayed).toBe(false);
    expect(f.store.create).toHaveBeenCalledTimes(2);
  });
  test("new key after resolve creates another alert", async () => {
    const f = lifecycleFixture();
    const first = await f.service.send(5, "key-first", customer, context);
    await f.service.resolve(first.alert.id, admin, context);
    const next = await f.service.send(5, "key-new", customer, context);
    expect(next.alert.id).not.toBe(first.alert.id);
    expect(next.replayed).toBe(false);
  });
  test("unavailable order, foreign alert and authorization failures do not write", async () => {
    const f = lifecycleFixture();
    f.store.order.mockResolvedValueOnce(null as never);
    await expect(f.service.send(5, "key-first", customer, context)).rejects.toThrow("not_found");
    f.store.alert.mockResolvedValueOnce(null);
    await expect(f.service.resolve(99, admin, context)).rejects.toThrow("not_found");
    expect(f.audit).not.toHaveBeenCalled();
  });
  test("failed persistence/audit never publishes success invalidation", async () => {
    const f = lifecycleFixture();
    f.audit.mockRejectedValueOnce(new Error("audit failure"));
    await expect(f.service.send(5, "key-first", customer, context)).rejects.toThrow(
      "audit failure"
    );
    expect(f.gateway.publish).not.toHaveBeenCalled();
  });
  test("SSE outage does not turn committed SOS into failure", async () => {
    const f = lifecycleFixture();
    f.repository.recipients.mockRejectedValueOnce(new Error("outage"));
    expect((await f.service.send(5, "key-first", customer, context)).replayed).toBe(false);
  });
});
