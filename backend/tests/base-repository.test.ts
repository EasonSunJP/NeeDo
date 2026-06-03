import {
  BaseRepository,
  type RepositoryDelegate,
  type RepositoryFindManyArgs,
  type RepositoryUpdateArgs
} from "../src/repositories/base.repository";

interface DemoRecord {
  id: string;
  status: string;
  deletedAt: Date | null;
}

describe("BaseRepository", () => {
  it("filters deleted rows when finding a record by id", async () => {
    const record: DemoRecord = { id: "demo_1", status: "active", deletedAt: null };
    const calls: unknown[] = [];
    const delegate: RepositoryDelegate<DemoRecord> = {
      findFirst: async (args) => {
        calls.push(args);
        return record;
      },
      findMany: async () => [],
      count: async () => 0,
      update: async () => record
    };

    await expect(new BaseRepository(delegate).findById("demo_1")).resolves.toBe(record);
    expect(calls).toEqual([{ where: { id: "demo_1", deletedAt: null } }]);
  });

  it("paginates active rows and returns the API pagination shape", async () => {
    const records: DemoRecord[] = [
      { id: "demo_2", status: "active", deletedAt: null },
      { id: "demo_3", status: "active", deletedAt: null }
    ];
    let findManyArgs: RepositoryFindManyArgs | undefined;
    const delegate: RepositoryDelegate<DemoRecord> = {
      findFirst: async () => null,
      findMany: async (args) => {
        findManyArgs = args;
        return records;
      },
      count: async () => 5,
      update: async () => records[0]
    };

    await expect(
      new BaseRepository(delegate).findPage({
        where: { status: "active" },
        orderBy: { createdAt: "desc" },
        page: 2,
        pageSize: 2
      })
    ).resolves.toEqual({
      list: records,
      total: 5,
      page: 2,
      page_size: 2
    });
    expect(findManyArgs).toEqual({
      where: { status: "active", deletedAt: null },
      orderBy: { createdAt: "desc" },
      skip: 2,
      take: 2
    });
  });

  it("soft deletes by updating deletedAt instead of deleting the row", async () => {
    const deletedAt = new Date("2026-05-25T00:00:00.000Z");
    const record: DemoRecord = { id: "demo_1", status: "active", deletedAt };
    let updateArgs: RepositoryUpdateArgs | undefined;
    const delegate: RepositoryDelegate<DemoRecord> = {
      findFirst: async () => record,
      findMany: async () => [],
      count: async () => 0,
      update: async (args) => {
        updateArgs = args;
        return record;
      }
    };

    await expect(new BaseRepository(delegate).softDelete("demo_1", deletedAt)).resolves.toBe(
      record
    );
    expect(updateArgs).toEqual({
      where: { id: "demo_1" },
      data: { deletedAt }
    });
  });
});
