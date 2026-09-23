import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContentMediaRepository } from "../src/repositories/content-media.repository";
import { ContentMediaPurgeService } from "../src/services/content-media-purge.service";
import { ContentMediaFileStorage } from "../src/services/content-media.storage";
import { ContentMediaPurgeWorker } from "../src/workers/content-media-purge.worker";
import { validPng } from "./fixtures/content-images";

const now = new Date("2026-09-23T06:00:00Z");
const checksum = "a".repeat(64);
const candidate = { id: 81, checksumSha256: checksum, url: `/media/content/${checksum}.png` };
const dueWhere = {
  usageType: "exchange_demand_cover_pending", deletedAt: null, purgedAt: null,
  AND: [{ OR: [
    { purgeAt: { lte: now } },
    { purgeAt: null, createdAt: { lte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }
  ] }], exchangeDemandCover: null
};

function repositoryFixture() {
  const mediaAsset = {
    findMany: jest.fn<Promise<typeof candidate[]>, [{ where: { id: { gt: number } } }]>().mockResolvedValue([candidate]),
    findFirst: jest.fn(async () => null as { id: number } | null),
    updateMany: jest.fn(async () => ({ count: 1 })),
    count: jest.fn(async () => 0)
  };
  const auditLog = { create: jest.fn<Promise<{ id: number }>, [{ data: { action: string } }]>().mockResolvedValue({ id: 9 }) };
  const client = { mediaAsset, auditLog, $transaction: jest.fn(async (fn) => fn({ mediaAsset, auditLog })) };
  const query = jest.fn(async (sql: string) => sql.includes("GET_LOCK") ? [{ acquired: 1 }] : [{ released: 1 }]);
  const repository = new ContentMediaRepository(client as never, async () => ({ query, end: jest.fn(), destroy: jest.fn() }));
  return { repository, client, mediaAsset, auditLog, query };
}

describe("pending content-media purge repository", () => {
  it("selects only expired active unbound pending covers or durable purge retries in a bounded batch", async () => {
    const { repository, mediaAsset } = repositoryFixture();
    await repository.listDuePendingCovers({ now, limit: 50 });
    expect(mediaAsset.findMany).toHaveBeenCalledWith({
      where: { ...dueWhere, id: { gt: 0 }, checksumSha256: { not: null }, OR: [
        { entityType: "exchange_demand_cover_pending", isActive: true },
        { entityType: "exchange_demand_cover_purging", isActive: false }
      ] },
      orderBy: { id: "asc" }, take: 50,
      select: { id: true, checksumSha256: true, url: true }
    });
  });

  it("conditionally retires only due active unbound media and commits its purge-start audit", async () => {
    const { repository, mediaAsset, auditLog } = repositoryFixture();
    expect(await repository.claimPendingCoverPurge(candidate, now)).toBe(true);
    expect(mediaAsset.updateMany).toHaveBeenCalledWith({
      where: { ...dueWhere, ...candidate, entityType: "exchange_demand_cover_pending", isActive: true },
      data: { entityType: "exchange_demand_cover_purging", isActive: false, updatedAt: now }
    });
    expect(auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "exchange.demand_cover.purge_started", actorId: null, targetId: 81 }) });
  });

  it.each([
    ["claimed by publication", { entityType: "exchange_demand_cover_pending", isActive: true }],
    ["not yet due", { AND: dueWhere.AND }],
    ["already purged", { purgedAt: null }],
    ["deleted", { deletedAt: null }],
    ["bound to a demand", { exchangeDemandCover: null }]
  ])("does not purge a candidate that is %s", async (_reason, predicate) => {
    const { repository, mediaAsset, auditLog } = repositoryFixture();
    mediaAsset.updateMany.mockResolvedValue({ count: 0 });
    expect(await repository.claimPendingCoverPurge(candidate, now)).toBe(false);
    expect(auditLog.create).not.toHaveBeenCalled();
    expect(mediaAsset.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining(predicate) }));
    expect(mediaAsset.findFirst).toHaveBeenCalledWith({ where: {
      ...dueWhere, ...candidate, entityType: "exchange_demand_cover_purging", isActive: false
    }, select: { id: true } });
  });

  it("resumes an interrupted durable claim without duplicating its start audit", async () => {
    const { repository, mediaAsset, auditLog } = repositoryFixture();
    mediaAsset.updateMany.mockResolvedValue({ count: 0 });
    mediaAsset.findFirst.mockResolvedValue({ id: 81 });
    expect(await repository.claimPendingCoverPurge(candidate, now)).toBe(true);
    expect(auditLog.create).not.toHaveBeenCalled();
  });

  it("protects both active URL/checksum references and any bound demand even if its media is inactive", async () => {
    const { repository, mediaAsset } = repositoryFixture();
    mediaAsset.count.mockResolvedValue(1);
    expect(await repository.hasContentMediaReferences(candidate)).toBe(true);
    expect(mediaAsset.count).toHaveBeenCalledWith({ where: {
      AND: [
        { OR: [{ url: candidate.url }, { checksumSha256: checksum }] },
        { OR: [{ isActive: true, deletedAt: null, purgedAt: null }, { exchangeDemandCover: { isNot: null } }] }
      ]
    } });
  });

  it("marks completed claims purged with one audit and is idempotent", async () => {
    const { repository, mediaAsset, auditLog } = repositoryFixture();
    await repository.completePendingCoverPurge(candidate, now);
    mediaAsset.updateMany.mockResolvedValue({ count: 0 });
    await repository.completePendingCoverPurge(candidate, now);
    expect(mediaAsset.updateMany).toHaveBeenCalledWith({ where: {
      ...dueWhere, ...candidate, entityType: "exchange_demand_cover_purging", isActive: false
    }, data: { purgedAt: now, deletedAt: now, updatedAt: now } });
    expect(auditLog.create).toHaveBeenCalledTimes(1);
    expect(auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "exchange.demand_cover.purged", targetId: 81 }) });
  });

  it("advances beyond a full failed batch and wraps for later retries", async () => {
    const f = repositoryFixture();
    const firstPage = Array.from({ length: 50 }, (_, index) => ({ ...candidate, id: index + 1 }));
    const last = { id: 51, checksumSha256: "b".repeat(64), url: `/media/content/${"b".repeat(64)}.png` };
    f.mediaAsset.findMany.mockImplementation(async ({ where }) =>
      where.id?.gt === 51 ? [] : where.id?.gt === 50 ? [last] : firstPage
    );
    const storage = { delete: jest.fn(async (key: string) => {
      if (key.startsWith(checksum)) throw new Error("storage failure");
    }) };
    const service = new ContentMediaPurgeService(f.repository, storage);
    expect(await service.purgeDue({ now })).toEqual({ purged: 0, failed: 50 });
    expect(await service.purgeDue({ now })).toEqual({ purged: 1, failed: 0 });
    expect(await service.purgeDue({ now })).toEqual({ purged: 0, failed: 50 });
  });
});

describe("pending content-media physical cleanup", () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "needo-cover-purge-")); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  async function fixture() {
    const storage = new ContentMediaFileStorage(directory);
    const stored = await storage.save({ bytes: validPng, mimeType: "image/png" });
    const asset = { id: 81, checksumSha256: stored.checksumSha256, url: `/media/content/${stored.fileKey}` };
    const fixture = repositoryFixture();
    fixture.mediaAsset.findMany.mockResolvedValue([asset]);
    const remove = jest.spyOn(storage, "delete");
    return { ...fixture, storage, asset, stored, remove, service: new ContentMediaPurgeService(fixture.repository, storage) };
  }

  it("deletes the last reference only after the conditional claim commits and before releasing the checksum lock", async () => {
    const f = await fixture();
    const events: string[] = [];
    f.client.$transaction.mockImplementation(async (operation) => {
      const result = await operation({ mediaAsset: f.mediaAsset, auditLog: f.auditLog });
      events.push("commit"); return result;
    });
    f.query.mockImplementation(async (sql) => { events.push(sql.includes("GET_LOCK") ? "lock" : "unlock"); return sql.includes("GET_LOCK") ? [{ acquired: 1 }] : [{ released: 1 }]; });
    f.remove.mockRestore();
    jest.spyOn(f.storage, "delete").mockImplementation(async (key) => { events.push("delete"); return ContentMediaFileStorage.prototype.delete.call(f.storage, key); });
    expect(await f.service.purgeDue({ now })).toEqual({ purged: 1, failed: 0 });
    expect(events).toEqual(["lock", "commit", "delete", "commit", "unlock"]);
    await expect(f.storage.read(f.stored.fileKey)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves shared files but completes the abandoned pending row", async () => {
    const f = await fixture();
    f.mediaAsset.count.mockResolvedValue(1);
    expect(await f.service.purgeDue({ now })).toEqual({ purged: 1, failed: 0 });
    expect(f.remove).not.toHaveBeenCalled();
    await expect(f.storage.read(f.stored.fileKey)).resolves.toEqual(validPng);
  });

  it("never deletes when publication wins the conditional claim", async () => {
    const f = await fixture();
    f.mediaAsset.updateMany.mockResolvedValue({ count: 0 });
    expect(await f.service.purgeDue({ now })).toEqual({ purged: 0, failed: 0 });
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.mediaAsset.count).not.toHaveBeenCalled();
  });

  it.each(["delete", "complete"])("retries %s failure idempotently without reopening publication", async (phase) => {
    const f = await fixture();
    if (phase === "delete") f.remove.mockRejectedValueOnce(new Error("storage unavailable"));
    else f.mediaAsset.updateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error("database unavailable"));
    expect(await f.service.purgeDue({ now })).toEqual({ purged: 0, failed: 1 });
    f.mediaAsset.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    f.mediaAsset.findFirst.mockResolvedValue({ id: 81 });
    expect(await f.service.purgeDue({ now })).toEqual({ purged: 1, failed: 0 });
    await expect(f.storage.read(f.stored.fileKey)).rejects.toMatchObject({ code: "ENOENT" });
    expect(f.auditLog.create.mock.calls.filter(([input]) => input.data.action === "exchange.demand_cover.purge_started")).toHaveLength(1);
  });
});

describe("ContentMediaPurgeWorker", () => {
  it("does not overlap and drains its active run before stopping", async () => {
    let finish!: (result: { purged: number; failed: number }) => void;
    const purgeDue = jest.fn(() => new Promise<{ purged: number; failed: number }>((resolve) => { finish = resolve; }));
    const worker = new ContentMediaPurgeWorker({ purgeDue }, { info: jest.fn(), error: jest.fn() });
    const first = worker.runOnce();
    const second = worker.runOnce();
    let stopped = false;
    const stopping = worker.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    expect(purgeDue).toHaveBeenCalledTimes(1);
    finish({ purged: 1, failed: 0 });
    await Promise.all([first, second, stopping]);
    expect(stopped).toBe(true);
  });
});
