import { RealtimeService } from "../src/services/realtime.service";

describe("RealtimeService contact deletion", () => {
  it("soft-deletes only the authenticated user's contact and publishes the terminal update", async () => {
    const deletedContact = {
      contactId: 31,
      contactUserId: 167,
      deleted: true as const,
      deletedAt: new Date("2026-08-30T06:00:00.000Z"),
      ownerUserId: 41
    };
    const repository = {
      deleteContact: jest.fn(async () => deletedContact)
    };
    const eventGateway = { publish: jest.fn(), subscribe: jest.fn() };
    const service = new RealtimeService(repository as never, eventGateway) as RealtimeService & {
      deleteContact: (
        auth: { userId: number },
        contactId: number
      ) => Promise<typeof deletedContact>;
    };

    await expect(service.deleteContact({ userId: 41 }, 31)).resolves.toBe(deletedContact);

    expect(repository.deleteContact).toHaveBeenCalledWith({
      contactId: 31,
      ownerUserId: 41
    });
    expect(eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: deletedContact,
        recipientUserId: 41,
        type: "contact.updated"
      })
    );
  });

  it("does not expose whether another user's contact exists", async () => {
    const repository = {
      deleteContact: jest.fn(async () => null)
    };
    const service = new RealtimeService(repository as never, {
      publish: jest.fn(),
      subscribe: jest.fn()
    }) as RealtimeService & {
      deleteContact: (auth: { userId: number }, contactId: number) => Promise<unknown>;
    };

    await expect(service.deleteContact({ userId: 41 }, 999)).rejects.toMatchObject({
      message: "error.realtime.contact_not_found"
    });
  });
});
