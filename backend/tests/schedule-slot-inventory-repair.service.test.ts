import {
  ScheduleSlotInventoryRepairService,
  assertScheduleSlotRepairDatabaseTarget,
  parseScheduleSlotRepairCommand
} from "../src/services/schedule-slot-inventory-repair.service";
import { digestScheduleSlotRepairPlan, type ScheduleSlotRepairPlan } from "../src/domain/schedule-slot-inventory-repair";

const plan: ScheduleSlotRepairPlan = {
  entries: [
    {
      slotId: 100,
      kind: "repair_remove",
      reasons: ["service_deleted"],
      replacement: null,
      candidateCount: 0,
      original: {
        availabilityId: 200,
        serviceId: 10,
        technicianServiceId: null,
        shopId: 3,
        technicianProfileId: 5,
        startsAt: "2026-09-12T01:00:00.000Z",
        endsAt: "2026-09-12T02:00:00.000Z",
        capacity: 1,
        status: "AVAILABLE"
      }
    }
  ],
  summary: { scanned: 1, current: 0, stale: 1, protected: 0, replace: 0, remove: 1 }
};

const makeRepository = () => ({
  findAuthorizedActor: jest.fn(async () => ({ id: 7, email: "admin@needo.local" })),
  buildPlan: jest.fn(async () => plan),
  applyPlan: jest.fn(async () => ({ batchId: "batch-1", replaced: 0, removed: 1 })),
  rollbackBatch: jest.fn(async () => ({ batchId: "batch-1", restored: 1, replacementsRemoved: 0 }))
});

describe("ScheduleSlotInventoryRepairService", () => {
  it("parses exactly one explicit preview, apply, or rollback mode", () => {
    expect(parseScheduleSlotRepairCommand(["--preview", "--actor-email", "admin@needo.local"])).toEqual({
      mode: "preview",
      actorEmail: "admin@needo.local"
    });
    expect(
      parseScheduleSlotRepairCommand([
        "--apply",
        "--plan-digest",
        "a".repeat(64),
        "--actor-email",
        "admin@needo.local"
      ])
    ).toEqual({ mode: "apply", actorEmail: "admin@needo.local", planDigest: "a".repeat(64) });
    expect(
      parseScheduleSlotRepairCommand([
        "--rollback",
        "batch-1",
        "--actor-email",
        "admin@needo.local"
      ])
    ).toEqual({ mode: "rollback", actorEmail: "admin@needo.local", batchId: "batch-1" });
    expect(() =>
      parseScheduleSlotRepairCommand(["--preview", "--apply", "--actor-email", "admin@needo.local"])
    ).toThrow("exactly one mode");
    expect(() =>
      parseScheduleSlotRepairCommand(["--apply", "--actor-email", "admin@needo.local"])
    ).toThrow("64-character plan digest");
  });

  it("rejects production, remote, and non-local-purpose database targets", () => {
    expect(() =>
      assertScheduleSlotRepairDatabaseTarget({
        envFile: ".env",
        nodeEnvironment: "production",
        deployEnvironment: "prod",
        databaseUrl: "mysql://user:secret@127.0.0.1:3307/needo_dev"
      })
    ).toThrow("rejects production and staging");
    expect(() =>
      assertScheduleSlotRepairDatabaseTarget({
        envFile: ".env",
        nodeEnvironment: "development",
        deployEnvironment: "local",
        databaseUrl: "mysql://user:secret@db.example.com/needo_dev"
      })
    ).toThrow("local MySQL host");
    expect(() =>
      assertScheduleSlotRepairDatabaseTarget({
        envFile: ".env",
        nodeEnvironment: "development",
        deployEnvironment: "local",
        databaseUrl: "mysql://user:secret@127.0.0.1:3307/needo"
      })
    ).toThrow("needo_dev or needo_test");
  });

  it("returns a masked local target", () => {
    expect(
      assertScheduleSlotRepairDatabaseTarget({
        envFile: ".env.dev",
        nodeEnvironment: "development",
        deployEnvironment: "local",
        databaseUrl: "mysql://user:secret@127.0.0.1:3307/needo_dev"
      })
    ).toEqual({
      envFile: ".env.dev",
      databaseName: "needo_dev",
      maskedDatabaseTarget: "mysql://127.0.0.1:3307/needo_dev"
    });
  });

  it("keeps preview read-only and reports a stable digest", async () => {
    const repository = makeRepository();
    const service = new ScheduleSlotInventoryRepairService(repository);

    await expect(service.preview("admin@needo.local", new Date("2026-09-11T00:00:00.000Z"))).resolves.toEqual({
      actor: { id: 7, email: "admin@needo.local" },
      plan,
      planDigest: digestScheduleSlotRepairPlan(plan)
    });
    expect(repository.applyPlan).not.toHaveBeenCalled();
    expect(repository.rollbackBatch).not.toHaveBeenCalled();
  });

  it("rejects an unauthorized actor before reading or writing inventory", async () => {
    const repository = makeRepository();
    repository.findAuthorizedActor.mockResolvedValueOnce(null as never);
    const service = new ScheduleSlotInventoryRepairService(repository);

    await expect(service.preview("staff@needo.local", new Date())).rejects.toThrow(
      "active administrator with schedule:slots:write"
    );
    expect(repository.buildPlan).not.toHaveBeenCalled();
  });

  it("rejects apply when the supplied preview digest has drifted", async () => {
    const repository = makeRepository();
    const service = new ScheduleSlotInventoryRepairService(repository);

    await expect(
      service.apply("admin@needo.local", "0".repeat(64), new Date("2026-09-11T00:00:00.000Z"))
    ).rejects.toThrow("plan digest does not match");
    expect(repository.applyPlan).not.toHaveBeenCalled();
  });

  it("applies exactly the previewed plan and delegates rollback to the audited batch", async () => {
    const repository = makeRepository();
    const service = new ScheduleSlotInventoryRepairService(repository);
    const digest = digestScheduleSlotRepairPlan(plan);

    await expect(
      service.apply("admin@needo.local", digest, new Date("2026-09-11T00:00:00.000Z"))
    ).resolves.toEqual({ batchId: "batch-1", replaced: 0, removed: 1 });
    expect(repository.applyPlan).toHaveBeenCalledWith({
      actorId: 7,
      now: new Date("2026-09-11T00:00:00.000Z"),
      plan,
      planDigest: digest
    });

    await expect(service.rollback("admin@needo.local", "batch-1", new Date())).resolves.toEqual({
      batchId: "batch-1",
      restored: 1,
      replacementsRemoved: 0
    });
    expect(repository.rollbackBatch).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 7, batchId: "batch-1" })
    );
  });
});
