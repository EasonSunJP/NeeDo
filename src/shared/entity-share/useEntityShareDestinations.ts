import { useEffect, useMemo, useState } from "react";
import { realtimeApi } from "../../features/realtime/api";

export type EntityShareDestination =
  | {
      key: string;
      kind: "contact";
      label: string;
      subtitle: string;
      userId: number;
      avatarUrl: string | null;
    }
  | {
      key: string;
      kind: "group";
      label: string;
      subtitle: string;
      conversationId: number;
      avatarUrl: null;
    };

export function useEntityShareDestinations(query: string) {
  const [destinations, setDestinations] = useState<EntityShareDestination[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      realtimeApi.listContacts({ page: 1, pageSize: 100 }),
      realtimeApi.listConversations({ page: 1, pageSize: 100 }),
    ])
      .then(([contacts, conversations]) => {
        if (!active) return;
        const contactRows: EntityShareDestination[] = contacts.list
          .filter((contact) => !contact.isBlocked)
          .map((contact) => ({
            key: `contact:${contact.contactUserId}`,
            kind: "contact",
            label: contact.nickname?.trim() || contact.contactUser.username,
            subtitle: contact.contactUser.needoId,
            userId: contact.contactUserId,
            avatarUrl: contact.contactUser.avatarUrl,
          }));
        const groupRows: EntityShareDestination[] = conversations.list
          .filter(
            (conversation) =>
              conversation.type === "group" && !conversation.isHidden,
          )
          .map((conversation) => ({
            key: `group:${conversation.id}`,
            kind: "group",
            label: conversation.title?.trim() || `群聊 ${conversation.id}`,
            subtitle: `${conversation.participants.length}人`,
            conversationId: conversation.id,
            avatarUrl: null,
          }));
        setDestinations([...contactRows, ...groupRows]);
        setError(null);
      })
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const normalized = query.trim().toLocaleLowerCase();
  return {
    loading,
    error,
    destinations: useMemo(
      () =>
        normalized
          ? destinations.filter((item) =>
              `${item.label} ${item.subtitle}`
                .toLocaleLowerCase()
                .includes(normalized),
            )
          : destinations,
      [destinations, normalized],
    ),
  };
}
