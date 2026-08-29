import { describe, expect, it, jest } from "@jest/globals";
import { RealtimeService } from "../src/services/realtime.service";

const auth = {
  userId: 7,
  currentIdentityId: 71,
  currentIdentityType: "scout"
} as never;

const scopeResolver = {
  resolve: jest.fn(async () => ({ identityId: 70, userId: 7, identityType: "customer" }))
};

const eventGateway = {
  publish: jest.fn(),
  subscribe: jest.fn()
};

describe("RealtimeService personal identity scope", () => {
  it("lists customer and affiliate contacts from their shared canonical identity", async () => {
    const result = { list: [], total: 0, page: 1, page_size: 20 };
    const repository = { listContacts: jest.fn(async () => result) };
    const service = new RealtimeService(repository as never, eventGateway as never, scopeResolver as never);

    await expect(service.listContacts(auth, { page: 1, pageSize: 20 })).resolves.toBe(result);

    expect(scopeResolver.resolve).toHaveBeenCalledWith(auth);
    expect(repository.listContacts).toHaveBeenCalledWith(70, { page: 1, pageSize: 20 });
    expect(repository.listContacts).not.toHaveBeenCalledWith(7, expect.anything());
  });

  it("lists conversations and messages through the active personal identity", async () => {
    const conversations = { list: [], total: 0, page: 1, page_size: 20 };
    const messages = { list: [], total: 0, page: 1, page_size: 20, nextCursor: null };
    const repository = {
      listConversations: jest.fn(async () => conversations),
      listMessages: jest.fn(async () => messages)
    };
    const service = new RealtimeService(repository as never, eventGateway as never, scopeResolver as never);

    await expect(service.listConversations(auth, { page: 1, pageSize: 20 })).resolves.toBe(conversations);
    await expect(service.listMessages(auth, {
      conversationId: 99,
      userId: 7,
      pageSize: 20
    })).resolves.toBe(messages);

    expect(repository.listConversations).toHaveBeenCalledWith(70, { page: 1, pageSize: 20 });
    expect(repository.listMessages).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 99,
      identityId: 70,
      userId: 7
    }));
  });

  it("writes a contact and message with server-derived identity ownership", async () => {
    const contact = { id: 4, ownerUserId: 7, ownerIdentityId: 70, contactUserId: 8 };
    const message = { id: 5, conversationId: 99, senderUserId: 7 };
    const repository = {
      findActiveUserIds: jest.fn(async () => [8]),
      addContact: jest.fn(async () => contact),
      isMessageSenderBlocked: jest.fn(async () => false),
      createMessage: jest.fn(async () => message),
      getConversationForUser: jest.fn(async () => ({ participants: [] }))
    };
    const service = new RealtimeService(repository as never, eventGateway as never, scopeResolver as never);

    await service.addContact(auth, 8);
    await service.createMessage(auth, {
      conversationId: 99,
      type: "text",
      content: "formal"
    });

    expect(repository.addContact).toHaveBeenCalledWith({
      contactUserId: 8,
      ownerIdentityId: 70,
      ownerUserId: 7,
      source: "manual"
    });
    expect(repository.createMessage).toHaveBeenCalledWith(expect.objectContaining({
      senderIdentityId: 70,
      senderUserId: 7
    }));
    expect(eventGateway.publish).toHaveBeenCalledWith(expect.objectContaining({
      recipientIdentityId: 70,
      type: "contact.updated"
    }));
  });

  it("subscribes SSE by canonical identity instead of account user id", async () => {
    const repository = {};
    const service = new RealtimeService(repository as never, eventGateway as never, scopeResolver as never);
    const response = {} as never;

    await service.streamEvents(auth, response);

    expect(eventGateway.subscribe).toHaveBeenCalledWith(70, response);
    expect(eventGateway.subscribe).not.toHaveBeenCalledWith(7, response);
  });
});
