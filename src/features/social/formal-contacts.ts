import { realtimeApi } from "../realtime/api";
import { resolveAvatarUrl } from "../../lib/defaultAvatar";
import type { SocialMentionCandidate } from "./types";

const CONTACT_PAGE_SIZE = 100;

type FormalContactApi = Pick<typeof realtimeApi, "listContacts">;

export async function loadFormalSocialMentionCandidates(
  api: FormalContactApi = realtimeApi
): Promise<SocialMentionCandidate[]> {
  const firstPage = await api.listContacts({ page: 1, pageSize: CONTACT_PAGE_SIZE });
  const pageCount = Math.ceil(firstPage.total / CONTACT_PAGE_SIZE);
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
      api.listContacts({ page: index + 2, pageSize: CONTACT_PAGE_SIZE })
    )
  );

  return [firstPage, ...remainingPages]
    .flatMap((page) => page.list)
    .filter(
      (contact) =>
        !contact.isBlocked &&
        contact.ownerUserId !== contact.contactUserId &&
        contact.contactUser.userId === contact.contactUserId &&
        Boolean(contact.contactUser.needoId.trim()) &&
        Boolean(contact.contactUser.username.trim())
    )
    .map((contact) => {
      const displayName = contact.nickname?.trim() || contact.contactUser.username.trim();
      const username = contact.contactUser.username.trim();
      const needoId = contact.contactUser.needoId.trim();
      return {
        userId: contact.contactUserId,
        needoId,
        displayName,
        username,
        avatarUrl: resolveAvatarUrl(contact.contactUser.avatarUrl),
        searchText: `${displayName} ${username} ${needoId}`
      };
    });
}
