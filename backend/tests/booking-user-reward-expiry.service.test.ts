import { BookingUserRewardExpiryRepository } from "../src/repositories/booking-user-reward-expiry.repository";
import {
  BookingUserRewardExpiryService,
  type BookingUserRewardExpiryRecord,
  type BookingUserRewardExpiryRepositoryPort
} from "../src/services/booking-user-reward-expiry.service";

const now = new Date("2026-09-05T00:00:00.000Z");

const makeRecord = (
  id: number,
  overrides: Partial<BookingUserRewardExpiryRecord> = {}
): BookingUserRewardExpiryRecord => ({
  id,
  bookingOrderId: 100 + id,
  userRewardStatus: "pending",
  userRewardDeadlineAt: new Date("2026-09-04T23:59:59.000Z"),
  ...overrides
});

const createRepository = (records: BookingUserRewardExpiryRecord[]) => {
  const repository: BookingUserRewardExpiryRepositoryPort = {
    listExpiryCandidateIds: jest.fn(async ({ afterId, batchSize }) =>
      records
        .filter(
          (record) =>
            record.id > afterId &&
            record.userRewardStatus === "pending" &&
            record.userRewardDeadlineAt !== null &&
            record.userRewardDeadlineAt <= now
        )
        .sort((left, right) => left.id - right.id)
        .slice(0, batchSize)
        .map((record) => record.id)
    ),
    runInTransaction: jest.fn(async (handler) => handler(repository, {})),
    lockReward: jest.fn(async (id) => records.find((record) => record.id === id) ?? null),
    expireReward: jest.fn(async (input) => {
      const record = records.find((candidate) => candidate.id === input.id);
      if (
        !record ||
        record.userRewardStatus !== "pending" ||
        record.userRewardDeadlineAt?.getTime() !== input.expectedDeadlineAt.getTime()
      ) {
        return false;
      }
      record.userRewardStatus = "expired";
      return true;
    }),
    createAuditLog: jest.fn(async () => undefined)
  };

  return repository;
};

describe("BookingUserRewardExpiryService", () => {
  it("expires only still-pending due rewards in a bounded ID page", async () => {
    const records = [
      makeRecord(1),
      makeRecord(2, { userRewardStatus: "paid" }),
      makeRecord(3, { userRewardDeadlineAt: new Date("2026-09-06T00:00:00.000Z") })
    ];
    const repository = createRepository(records);
    const service = new BookingUserRewardExpiryService(repository);

    await expect(service.expireDue({ now, batchSize: 2 })).resolves.toEqual({
      scanned: 1,
      expired: 1,
      failed: 0
    });
    expect(repository.listExpiryCandidateIds).toHaveBeenCalledWith({
      now,
      batchSize: 2,
      afterId: 0
    });
    expect(records[0]?.userRewardStatus).toBe("expired");
    expect(records[1]?.userRewardStatus).toBe("paid");
    expect(records[2]?.userRewardStatus).toBe("pending");
    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "booking.user_reward.expired", financialId: 1 })
    );
  });

  it("rechecks a locked row so a concurrent paid winner remains paid", async () => {
    const record = makeRecord(1);
    const repository = createRepository([record]);
    (repository.lockReward as jest.Mock).mockImplementationOnce(async () => {
      record.userRewardStatus = "paid";
      return record;
    });
    const service = new BookingUserRewardExpiryService(repository);

    await expect(service.expireDue({ now, batchSize: 100 })).resolves.toEqual({
      scanned: 1,
      expired: 0,
      failed: 0
    });
    expect(repository.expireReward).not.toHaveBeenCalled();
    expect(record.userRewardStatus).toBe("paid");
  });

  it("reports one candidate failure and continues the rest of the batch", async () => {
    const records = [makeRecord(1), makeRecord(2)];
    const repository = createRepository(records);
    (repository.lockReward as jest.Mock).mockImplementation(async (id: number) => {
      if (id === 1) throw new Error("database failure");
      return records[1];
    });
    const reportFailure = jest.fn();
    const service = new BookingUserRewardExpiryService(repository, reportFailure);

    await expect(service.expireDue({ now, batchSize: 100 })).resolves.toEqual({
      scanned: 2,
      expired: 1,
      failed: 1
    });
    expect(reportFailure).toHaveBeenCalledWith({
      financialId: 1,
      code: 50001,
      message: "error.internal_server_error"
    });
    expect(records[1]?.userRewardStatus).toBe("expired");
  });

  it("advances a stable ID cursor and resets after reaching the end", async () => {
    const repository = createRepository([makeRecord(1), makeRecord(2), makeRecord(3)]);
    const service = new BookingUserRewardExpiryService(repository);

    await service.expireDue({ now, batchSize: 2 });
    await service.expireDue({ now, batchSize: 2 });
    await service.expireDue({ now, batchSize: 2 });

    expect(repository.listExpiryCandidateIds).toHaveBeenNthCalledWith(1, {
      now,
      batchSize: 2,
      afterId: 0
    });
    expect(repository.listExpiryCandidateIds).toHaveBeenNthCalledWith(2, {
      now,
      batchSize: 2,
      afterId: 2
    });
    expect(repository.listExpiryCandidateIds).toHaveBeenNthCalledWith(3, {
      now,
      batchSize: 2,
      afterId: 3
    });
    expect(repository.listExpiryCandidateIds).toHaveBeenNthCalledWith(4, {
      now,
      batchSize: 2,
      afterId: 0
    });
  });

  it("uses the reward deadline index shape and guarded pending-to-expired update", async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 11 }]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new BookingUserRewardExpiryRepository({
      orderFinancial: { findMany, updateMany }
    } as never);

    await expect(
      repository.listExpiryCandidateIds({ now, batchSize: 100, afterId: 10 })
    ).resolves.toEqual([11]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        id: { gt: 10 },
        userRewardStatus: "PENDING",
        userRewardDeadlineAt: { lte: now },
        deletedAt: null
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 100
    });
    await expect(
      repository.expireReward({ id: 11, expectedDeadlineAt: now })
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 11,
        userRewardStatus: "PENDING",
        userRewardDeadlineAt: now,
        deletedAt: null
      },
      data: {
        userRewardStatus: "EXPIRED",
        userRewardNdp: 0,
        userRewardGrantedAt: null
      }
    });
  });
});
