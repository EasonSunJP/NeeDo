import { describe, expect, it, jest } from "@jest/globals";
import { RealtimeService } from "../src/services/realtime.service";

describe("RealtimeService contact-card candidates", () => {
  it("checks conversation send eligibility before listing self and friends", async () => {
    const page = {
      list: [],
      total: 0,
      page: 1,
      page_size: 20
    };
    const repository = {
      checkMessageSendEligibility: jest.fn(async () => "allowed"),
      listContactCardCandidates: jest.fn(async () => page)
    };
    const service = new RealtimeService(repository as never, { publish: jest.fn() } as never);

    await expect(
      service.listContactCardCandidates({ userId: 41, currentIdentityId: 410 } as never, 91, {
        page: 1,
        pageSize: 20,
        query: "山田"
      })
    ).resolves.toBe(page);

    expect(repository.checkMessageSendEligibility).toHaveBeenCalledWith({
      conversationId: 91,
      senderUserId: 41,
      senderIdentityId: 410
    });
    expect(repository.listContactCardCandidates).toHaveBeenCalledWith(41, 410, {
      page: 1,
      pageSize: 20,
      query: "山田"
    });
    expect(repository.checkMessageSendEligibility.mock.invocationCallOrder[0]).toBeLessThan(
      repository.listContactCardCandidates.mock.invocationCallOrder[0] ?? 0
    );
  });

  it("does not query candidates when the actor is not an active participant", async () => {
    const repository = {
      checkMessageSendEligibility: jest.fn(async () => "not_found"),
      listContactCardCandidates: jest.fn()
    };
    const service = new RealtimeService(repository as never, { publish: jest.fn() } as never);

    await expect(
      service.listContactCardCandidates({ userId: 41, currentIdentityId: 410 } as never, 91, {
        page: 1,
        pageSize: 20,
        query: ""
      })
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "error.realtime.conversation_not_found"
    });
    expect(repository.listContactCardCandidates).not.toHaveBeenCalled();
  });
});
