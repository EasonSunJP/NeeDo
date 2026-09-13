import {
  ExchangeOperationsRepository,
  maskExchangeOperationsDisplayName,
  maskExchangeOperationsPublicId,
  redactExchangeOperationsText
} from "../src/repositories/exchange-operations.repository";
import { ExchangeMatchMode, ExchangePostStatus, ExchangePostType } from "@prisma/client";

describe("Exchange operations privacy projection", () => {
  it("masks publisher identifiers and display names", () => {
    expect(maskExchangeOperationsPublicId("u000000001")).toBe("u0000••••01");
    expect(maskExchangeOperationsDisplayName("Eason")).toBe("E•••n");
  });

  it("redacts phone numbers and email addresses embedded in free text", () => {
    const value = redactExchangeOperationsText(
      "連絡先 test@example.com / 090-1234-5678。サービス内容はボディケアです。"
    );

    expect(value).toContain("サービス内容はボディケアです");
    expect(value).not.toContain("test@example.com");
    expect(value).not.toContain("090-1234-5678");
    expect(value).toContain("[redacted-email]");
    expect(value).toContain("[redacted-phone]");
  });

  it("filters logical expiry and soft-deleted subtypes before pagination", async () => {
    const findMany = jest.fn(async () => []);
    const count = jest.fn(async () => 0);
    const repository = new ExchangeOperationsRepository({
      exchangePost: { findMany, count },
      auditLog: { findMany: jest.fn() },
      ledgerTransaction: { findMany: jest.fn() }
    } as never);
    const now = new Date("2026-09-13T02:00:00.000Z");

    await repository.list({
      type: "demand",
      status: "expired",
      matchMode: "quick",
      publisherIdentityType: "customer",
      keyword: "ボディ",
      page: 2,
      pageSize: 20,
      now
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 20,
      where: {
        deletedAt: null,
        AND: expect.arrayContaining([
          { type: ExchangePostType.DEMAND },
          { demand: { is: { deletedAt: null } } },
          { demand: { is: { matchMode: ExchangeMatchMode.QUICK, deletedAt: null } } },
          {
            OR: [
              { status: ExchangePostStatus.EXPIRED },
              { status: ExchangePostStatus.PUBLISHED, expiresAt: { lte: now } }
            ]
          }
        ])
      }
    }));
  });
});
