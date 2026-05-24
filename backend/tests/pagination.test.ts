import {
  buildPaginatedResponse,
  normalizePagination,
  toPrismaPagination
} from "../src/utils/pagination";

describe("pagination helpers", () => {
  it("normalizes unsafe page inputs to bounded defaults", () => {
    expect(normalizePagination({ page: -3, pageSize: 999 })).toEqual({
      page: 1,
      pageSize: 100
    });
    expect(normalizePagination({ page: 2.8, pageSize: 10.2 })).toEqual({
      page: 2,
      pageSize: 10
    });
  });

  it("converts normalized pagination into Prisma skip and take arguments", () => {
    expect(toPrismaPagination({ page: 3, pageSize: 25 })).toEqual({
      page: 3,
      pageSize: 25,
      skip: 50,
      take: 25
    });
  });

  it("builds the API pagination response shape", () => {
    expect(buildPaginatedResponse(["store-a"], 3, { page: 2, pageSize: 1 })).toEqual({
      list: ["store-a"],
      total: 3,
      page: 2,
      page_size: 1
    });
  });
});
