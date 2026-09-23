import { describe, expect, it, vi } from "vitest";
import type { RealtimeContact } from "../realtime/api";
import { loadFormalSocialMentionCandidates } from "./formal-contacts";

const contact = (input: Partial<RealtimeContact> & { contactUserId: number }): RealtimeContact => ({
  id: input.contactUserId + 100,
  ownerUserId: 41,
  contactUserId: input.contactUserId,
  nickname: input.nickname ?? null,
  source: "manual",
  isBlocked: input.isBlocked ?? false,
  createdAt: "2026-08-30T00:00:00.000Z",
  contactUser: input.contactUser ?? {
    userId: input.contactUserId,
    needoId: `u${String(input.contactUserId).padStart(10, "0")}`,
    username: `Contact ${input.contactUserId}`,
    avatarUrl: null
  }
});

describe("formal Social mention contacts", () => {
  it("loads every formal contact page, excludes blocked/self rows, and prefers remarks", async () => {
    const listContacts = vi
      .fn()
      .mockResolvedValueOnce({
        list: [
          contact({
            contactUserId: 52,
            nickname: "小林さん",
            contactUser: {
              userId: 52,
              needoId: "u0000000052",
              username: "小林 美咲",
              avatarUrl: "/media/customer-avatars/a.png"
            }
          }),
          contact({ contactUserId: 63, isBlocked: true })
        ],
        page: 1,
        page_size: 100,
        total: 101
      })
      .mockResolvedValueOnce({
        list: [
          contact({
            contactUserId: 74,
            contactUser: {
              userId: 74,
              needoId: "u0000000074",
              username: "佐藤 葵",
              avatarUrl: null
            }
          }),
          contact({ contactUserId: 41 })
        ],
        page: 2,
        page_size: 100,
        total: 101
      });

    await expect(loadFormalSocialMentionCandidates({ listContacts })).resolves.toEqual([
      {
        userId: 52,
        needoId: "u0000000052",
        displayName: "小林さん",
        username: "小林 美咲",
        avatarUrl: "/media/customer-avatars/a.png",
        searchText: "小林さん 小林 美咲 u0000000052"
      },
      {
        userId: 74,
        needoId: "u0000000074",
        displayName: "佐藤 葵",
        username: "佐藤 葵",
        avatarUrl: "/images/generated/profiles/dodo-default-avatar.webp",
        searchText: "佐藤 葵 佐藤 葵 u0000000074"
      }
    ]);
    expect(listContacts).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 100 });
    expect(listContacts).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 100 });
  });

  it("returns an empty candidate list for an empty contact page", async () => {
    const listContacts = vi.fn(async () => ({
      list: [],
      page: 1,
      page_size: 100,
      total: 0
    }));

    await expect(loadFormalSocialMentionCandidates({ listContacts })).resolves.toEqual([]);
    expect(listContacts).toHaveBeenCalledTimes(1);
  });
});
