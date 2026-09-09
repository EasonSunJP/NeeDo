// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { entityEngagementApi } from "../../features/entity-engagement/api";
import { realtimeApi } from "../../features/realtime/api";
import { EntityShareDestinationSheet } from "./EntityShareDestinationSheet";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const page = <T,>(list: T[]) => ({
  list,
  page: 1,
  page_size: 100,
  total: list.length,
});

describe("EntityShareDestinationSheet", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(realtimeApi, "listContacts").mockResolvedValue(
      page([
        {
          id: 1,
          ownerUserId: 10,
          contactUserId: 20,
          nickname: "Aoi",
          source: "friend",
          isBlocked: false,
          createdAt: "2026-09-09T00:00:00.000Z",
          contactUser: {
            userId: 20,
            username: "葵",
            needoId: "u0000000020",
            avatarUrl: null,
          },
        },
      ]),
    );
    vi.spyOn(realtimeApi, "listConversations").mockResolvedValue(
      page([
        {
          id: 91,
          type: "group",
          title: "Team Spa",
          participants: [
            {
              userId: 10,
              username: "Me",
              needoId: "u0000000010",
              avatarUrl: null,
            },
            {
              userId: 30,
              username: "Kai",
              needoId: "u0000000030",
              avatarUrl: null,
            },
          ],
          lastMessage: null,
          unreadCount: 0,
          createdAt: "2026-09-09T00:00:00.000Z",
          updatedAt: "2026-09-09T00:00:00.000Z",
        },
      ]),
    );
    vi.spyOn(realtimeApi, "createConversation").mockResolvedValue({
      id: 77,
    } as never);
    vi.spyOn(entityEngagementApi, "shareThroughNeedo")
      .mockResolvedValueOnce({
        targetType: "service",
        publicId: "11111111-1111-4111-8111-111111111111",
        eventId: 1,
        messageId: 1,
        shareCount: 8,
        replayed: false,
      })
      .mockResolvedValueOnce({
        targetType: "service",
        publicId: "11111111-1111-4111-8111-111111111111",
        eventId: 2,
        messageId: 2,
        shareCount: 9,
        replayed: false,
      });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    container.remove();
  });

  it("searches destinations and sends one authoritative card to each selected direct or group conversation", async () => {
    const onClose = vi.fn();
    await act(async () =>
      root.render(
        <EntityShareDestinationSheet
          onClose={onClose}
          target={{
            targetType: "service",
            publicId: "11111111-1111-4111-8111-111111111111",
          }}
          targetLabel="卧龙甜眠SPA"
        />,
      ),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const search = container.querySelector<HTMLInputElement>(
      'input[type="text"], input[aria-label]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "Team");
      search.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Team Spa");
    expect(container.textContent).not.toContain("Aoi");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "");
      search.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });

    const choices = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );
    expect(choices).toHaveLength(2);
    await act(async () => choices.forEach((choice) => choice.click()));
    const send = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("(2)"))!;
    await act(async () => {
      send.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(realtimeApi.createConversation).toHaveBeenCalledWith({
      participantUserIds: [20],
      type: "direct",
    });
    expect(entityEngagementApi.shareThroughNeedo).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(entityEngagementApi.shareThroughNeedo)
        .mock.calls.map(([, input]) => input.conversationId)
        .sort(),
    ).toEqual([77, 91]);
    expect(
      vi
        .mocked(entityEngagementApi.shareThroughNeedo)
        .mock.calls.every(([, input]) => !("recipientIdentityId" in input)),
    ).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
