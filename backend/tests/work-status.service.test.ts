import { WorkStatusService } from "../src/services/work-status.service";
import type { WorkStatusRepository } from "../src/repositories/work-status.repository";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
const actor = {
  userId: 7,
  currentIdentityId: 9,
  currentIdentityType: "technician",
  currentIdentityScopeType: "technician_profile",
  currentIdentityScopeId: 12
} as AuthenticatedAccessContext;
it("rejects early leave without writing any event and exposes confirmation reason", async () => {
  const unit = {
    assertScope: jest.fn(),
    lock: jest.fn(),
    receipt: jest.fn().mockResolvedValue(null),
    state: jest.fn().mockResolvedValue({ version: 0, status: "on_duty" }),
    activeService: jest.fn().mockResolvedValue(null),
    obligations: jest.fn().mockResolvedValue([
      {
        id: 1,
        basis: "shift",
        shopId: 4,
        startsAt: new Date("2026-09-06T00:00Z"),
        endsAt: new Date("2026-09-06T09:00Z")
      },
      {
        id: 2,
        basis: "booking",
        shopId: 4,
        startsAt: new Date("2026-09-06T06:00Z"),
        endsAt: new Date("2026-09-06T07:00Z"),
        status: "CONFIRMED",
        orderNo: "ND2",
        serviceName: "Massage"
      }
    ]),
    append: jest.fn()
  };
  const repo = {
    transaction: async (fn: (v: unknown) => unknown) => fn(unit)
  } as unknown as WorkStatusRepository;
  const service = new WorkStatusService(repo, () => new Date("2026-09-06T05:00Z"));
  await expect(
    service.change(actor, { status: "off_duty", expectedVersion: 0, idempotencyKey: "leave" })
  ).rejects.toMatchObject({
    statusCode: 409,
    data: {
      reason: "early_leave_confirmation_required",
      affectedOrders: [
        {
          id: 2,
          orderNo: "ND2",
          serviceName: "Massage",
          startsAt: "2026-09-06T06:00:00.000Z",
          endsAt: "2026-09-06T07:00:00.000Z"
        }
      ]
    }
  });
  expect(unit.append).not.toHaveBeenCalled();
});
it("blocks manual transitions during formal active service", async () => {
  const unit = {
    assertScope: jest.fn(),
    lock: jest.fn(),
    receipt: jest.fn().mockResolvedValue(null),
    state: jest.fn().mockResolvedValue({ version: 2, status: "on_duty" }),
    activeService: jest.fn().mockResolvedValue({ id: 9 }),
    append: jest.fn()
  };
  const repo = {
    transaction: async (fn: (v: unknown) => unknown) => fn(unit)
  } as unknown as WorkStatusRepository;
  await expect(
    new WorkStatusService(repo).change(actor, {
      status: "resting",
      expectedVersion: 2,
      idempotencyKey: "rest"
    })
  ).rejects.toMatchObject({ data: { reason: "active_service_conflict" } });
  expect(unit.append).not.toHaveBeenCalled();
});

function detectorFixture(obligations: unknown[], history: unknown[] = []) {
  const incidents = new Map<string, Record<string, unknown>>();
  const append = jest.fn(async (data: Record<string, unknown>) => data);
  const unit = {
    assertScope: jest.fn(),
    lock: jest.fn(),
    epoch: jest.fn(async () => ({ activatedAt: new Date("2026-09-01T00:00Z") })),
    obligations: jest.fn(async () => obligations),
    history: jest.fn(async () => [...history]),
    pendingIncidents: jest.fn(async () => [] as unknown[]),
    countEvents: jest.fn(async () => append.mock.calls.length),
    incident: jest.fn(async (key: string) => incidents.get(key) ?? null),
    createIncident: jest.fn(async (data: Record<string, unknown>) => {
      const row = { ...data, id: String(incidents.size + 1), events: [] };
      incidents.set(String(data.incidentKey), row);
      return row;
    }),
    append,
    audit: jest.fn()
  };
  const repository = {
    transaction: async (fn: (unit: unknown) => unknown) => fn(unit)
  } as unknown as WorkStatusRepository;
  return {
    service: new WorkStatusService(repository, () => new Date("2026-09-07T01:00Z")),
    unit,
    incidents
  };
}

it("rejects starting a work status without an active shop affiliation", async () => {
  const fixture = detectorFixture([]);
  const unit = fixture.unit as typeof fixture.unit & {
    activeService: jest.Mock;
    cas: jest.Mock;
    hasActiveAffiliation: jest.Mock;
    receipt: jest.Mock;
    snapshot: jest.Mock;
    state: jest.Mock;
  };
  Object.assign(unit, {
    receipt: jest.fn().mockResolvedValue(null),
    state: jest.fn().mockResolvedValue({ version: 0, status: "off_duty" }),
    activeService: jest.fn().mockResolvedValue(null),
    hasActiveAffiliation: jest.fn().mockResolvedValue(false),
    cas: jest.fn(),
    snapshot: jest.fn().mockResolvedValue({
      technicianProfileId: 12,
      status: "on_duty",
      version: 1
    })
  });

  await expect(fixture.service.change(actor, {
    status: "on_duty",
    expectedVersion: 0,
    idempotencyKey: "no-shop-on-duty"
  })).rejects.toMatchObject({
    statusCode: 403,
    data: { reason: "shop_required" }
  });
  expect(unit.cas).not.toHaveBeenCalled();
  expect(unit.append).not.toHaveBeenCalled();
});

it("detects a cross-midnight committed shift once while retaining null actual time", async () => {
  const f = detectorFixture([
    {
      id: 1,
      basis: "shift",
      shopId: 3,
      startsAt: new Date("2026-09-06T14:00Z"),
      endsAt: new Date("2026-09-07T03:00Z"),
      actualAt: null
    }
  ]);
  await f.service.inspectTechnician(12);
  await f.service.inspectTechnician(12);
  expect(f.unit.createIncident).toHaveBeenCalledTimes(1);
  expect(f.unit.createIncident).toHaveBeenCalledWith(
    expect.objectContaining({ occurredAt: new Date("2026-09-06T14:00Z"), actualAt: null })
  );
});
it("does not flag pre-activation history or merge separated shifts", async () => {
  const f = detectorFixture(
    [
      {
        id: 1,
        basis: "shift",
        shopId: 3,
        startsAt: new Date("2026-08-31T14:00Z"),
        endsAt: new Date("2026-09-01T03:00Z"),
        actualAt: null
      },
      {
        id: 2,
        basis: "shift",
        shopId: 3,
        startsAt: new Date("2026-09-06T10:00Z"),
        endsAt: new Date("2026-09-06T11:00Z"),
        actualAt: null
      },
      {
        id: 3,
        basis: "shift",
        shopId: 3,
        startsAt: new Date("2026-09-06T14:00Z"),
        endsAt: new Date("2026-09-07T03:00Z"),
        actualAt: null
      }
    ],
    [{ at: new Date("2026-09-06T09:59Z"), toStatus: "on_duty", shopId: 3 }]
  );
  await f.service.inspectTechnician(12);
  expect(f.unit.createIncident).toHaveBeenCalledTimes(1);
  expect(f.unit.createIncident).toHaveBeenCalledWith(
    expect.objectContaining({ availabilityId: 3 })
  );
});
it("resting preserves attendance but does not waive an unstarted booking", async () => {
  const startsAt = new Date("2026-09-06T14:00Z"),
    endsAt = new Date("2026-09-07T03:00Z");
  const f = detectorFixture(
    [
      { id: 1, basis: "shift", shopId: 3, startsAt, endsAt, actualAt: null },
      { id: 5, basis: "booking", shopId: 3, startsAt, endsAt, actualAt: null, status: "CONFIRMED" }
    ],
    [
      { at: new Date("2026-09-06T13:00Z"), toStatus: "on_duty", shopId: 3 },
      { at: new Date("2026-09-06T13:59Z"), toStatus: "resting", shopId: 3 }
    ]
  );
  await f.service.inspectTechnician(12);
  expect(f.unit.createIncident).toHaveBeenCalledTimes(1);
  expect(f.unit.createIncident).toHaveBeenCalledWith(
    expect.objectContaining({ basis: "booking", orderId: 5 })
  );
});

it("a later global off-duty at another affiliated shop invalidates earlier presence", async () => {
  const f = detectorFixture(
    [
      {
        id: 1,
        basis: "shift",
        shopId: 3,
        startsAt: new Date("2026-09-06T14:00Z"),
        endsAt: new Date("2026-09-07T03:00Z"),
        actualAt: null
      }
    ],
    [
      { at: new Date("2026-09-06T13:00Z"), toStatus: "on_duty", shopId: 3 },
      { at: new Date("2026-09-06T13:30Z"), toStatus: "off_duty", shopId: 4 }
    ]
  );
  await f.service.inspectTechnician(12);
  expect(f.unit.createIncident).toHaveBeenCalledTimes(1);
});
it("resolves saved pending booking incidents after the live plan is moved", async () => {
  const f = detectorFixture([]);
  const unit = f.unit as typeof f.unit & { pendingIncidents: () => Promise<unknown[]> };
  unit.pendingIncidents = jest.fn(async () => [
    {
      id: "saved",
      basis: "booking",
      shopId: 3,
      orderId: 8,
      plannedAt: new Date("2026-09-06T09:00Z"),
      plannedEndAt: new Date("2026-09-06T11:00Z"),
      order: { serviceSession: { startedAt: new Date("2026-09-06T10:00Z") } },
      availability: null
    }
  ]);
  await f.service.inspectTechnician(12);
  expect(f.unit.append).toHaveBeenCalledWith(
    expect.objectContaining({ incidentId: "saved", actualAt: new Date("2026-09-06T10:00Z") })
  );
});
it("cancellation before the deadline is excluded while deadline-then-cancel remains late", async () => {
  const startsAt = new Date("2026-09-06T14:00Z"),
    endsAt = new Date("2026-09-07T03:00Z");
  const f = detectorFixture([
    {
      id: 1,
      basis: "booking",
      shopId: 3,
      startsAt,
      endsAt,
      actualAt: null,
      status: "CANCELLED",
      cancelledAt: new Date("2026-09-06T13:59Z")
    },
    {
      id: 2,
      basis: "booking",
      shopId: 3,
      startsAt,
      endsAt,
      actualAt: null,
      status: "CANCELLED",
      cancelledAt: new Date("2026-09-06T14:00:01Z")
    }
  ]);
  await f.service.inspectTechnician(12);
  expect(f.unit.createIncident).toHaveBeenCalledTimes(1);
  expect(f.unit.createIncident).toHaveBeenCalledWith(expect.objectContaining({ orderId: 2 }));
});
it("publishes identity-scoped work-status invalidation for each authorized portal recipient", async () => {
  const repository = {
    recipients: jest.fn(async () => [
      { userId: 1, id: 11 },
      { userId: 2, id: 22 },
      { userId: 3, id: 33 }
    ])
  } as unknown as WorkStatusRepository;
  const gateway = { publish: jest.fn(), subscribe: jest.fn() };
  await new WorkStatusService(
    repository,
    () => new Date("2026-09-07T01:00Z"),
    gateway
  ).notifyTechnician(12);
  expect(gateway.publish).toHaveBeenCalledTimes(3);
  expect(gateway.publish.mock.calls.map(([event]) => event.recipientIdentityId)).toEqual([
    11, 22, 33
  ]);
  for (const [event] of gateway.publish.mock.calls)
    expect(event).toMatchObject({
      type: "technician.work_status.changed",
      payload: { technicianProfileId: 12 }
    });
});
it("resolves saved shift incident against its original boundary after a moved shift", async () => {
  const f = detectorFixture(
    [],
    [{ at: new Date("2026-09-06T10:00Z"), toStatus: "on_duty", shopId: 3 }]
  );
  f.unit.pendingIncidents = jest.fn(async () => [
    {
      id: "moved",
      basis: "shift",
      shopId: 3,
      orderId: null,
      plannedAt: new Date("2026-09-06T09:00Z"),
      plannedEndAt: new Date("2026-09-06T09:30Z"),
      order: null,
      availability: { endsAt: new Date("2026-09-06T11:00Z") }
    }
  ]);
  await f.service.inspectTechnician(12);
  expect(f.unit.append).toHaveBeenCalledWith(
    expect.objectContaining({ incidentId: "moved", actualAt: new Date("2026-09-06T10:00Z") })
  );
});
