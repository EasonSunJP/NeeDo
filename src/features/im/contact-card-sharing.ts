import { getDisplayName, type ContactRelation, type ImRoleType, type ImUser } from "./model";
import { canShareUserCard } from "./role-config";

type ShareableCardUsersInput = {
  scope: ImRoleType;
  users: ImUser[];
  activeContactByUserId: ReadonlyMap<string, ContactRelation>;
  currentUserId?: string;
};

function findCurrentUser(users: ImUser[], currentUserId?: string) {
  return currentUserId ? users.find((user) => user.id === currentUserId) : undefined;
}

export function isCurrentAccountStoreShareCard(scope: ImRoleType, user: ImUser, currentUser?: ImUser) {
  if (scope !== "merchant" || user.profileKind !== "store") {
    return false;
  }

  if (user.id === currentUser?.id) {
    return true;
  }

  if (currentUser?.entityType === "shop" && user.entityType === "shop" && user.entityId === currentUser.entityId) {
    return true;
  }

  return Boolean(currentUser?.accountId && user.accountId === currentUser.accountId);
}

function getShareCardRank(scope: ImRoleType, user: ImUser, currentUserId: string | undefined, currentUser: ImUser | undefined) {
  if (isCurrentAccountStoreShareCard(scope, user, currentUser)) {
    return 0;
  }

  if (user.id === currentUserId) {
    return scope === "merchant" ? 1 : 0;
  }

  return 2;
}

export function buildShareableCardUsers({
  scope,
  users,
  activeContactByUserId,
  currentUserId
}: ShareableCardUsersInput) {
  const currentUser = findCurrentUser(users, currentUserId);
  const candidateIds = new Set(activeContactByUserId.keys());
  const currentAccountStoreUser = users.find((user) => isCurrentAccountStoreShareCard(scope, user, currentUser) && canShareUserCard(scope, user));

  if (currentUserId) {
    candidateIds.add(currentUserId);
  }

  if (currentAccountStoreUser) {
    candidateIds.add(currentAccountStoreUser.id);
  }

  return users
    .filter((user) => candidateIds.has(user.id) && canShareUserCard(scope, user))
    .sort((left, right) => {
      const leftRank = getShareCardRank(scope, left, currentUserId, currentUser);
      const rightRank = getShareCardRank(scope, right, currentUserId, currentUser);

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return getDisplayName(left, activeContactByUserId.get(left.id)).localeCompare(
        getDisplayName(right, activeContactByUserId.get(right.id)),
        ["zh-CN-u-co-pinyin", "ja-JP", "en"],
        { sensitivity: "base", numeric: true }
      );
    });
}

export function getShareableCardCaptionPrefix(scope: ImRoleType, user: ImUser, currentUserId?: string, currentUser?: ImUser) {
  if (isCurrentAccountStoreShareCard(scope, user, currentUser)) {
    return "当前店铺名片";
  }

  if (user.id === currentUserId) {
    return "我的名片";
  }

  return undefined;
}
