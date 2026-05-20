export type NeedoExternalInfoPost = {
  id: string;
  type: "reverse";
  author: string;
  role: string;
  title: string;
  time: string;
  area: string;
  budget: number;
  detail: string;
  tags: string[];
  offers: number;
  image: string;
  publishedAt: string;
  expiresAt: string;
};

const storageKey = "needo.exchange.external.info.v1";
const postsChangedEventName = "needo.exchange.external.info.changed";

function readRawPosts() {
  if (typeof window === "undefined") {
    return [] as NeedoExternalInfoPost[];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is NeedoExternalInfoPost => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const candidate = item as Partial<NeedoExternalInfoPost>;

      return (
        candidate.type === "reverse" &&
        typeof candidate.id === "string" &&
        typeof candidate.author === "string" &&
        typeof candidate.role === "string" &&
        typeof candidate.title === "string" &&
        typeof candidate.time === "string" &&
        typeof candidate.area === "string" &&
        typeof candidate.detail === "string" &&
        typeof candidate.image === "string" &&
        typeof candidate.publishedAt === "string" &&
        typeof candidate.expiresAt === "string" &&
        Array.isArray(candidate.tags)
      );
    });
  } catch {
    return [];
  }
}

function writeRawPosts(posts: NeedoExternalInfoPost[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(posts));
}

function notifyPostsChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(postsChangedEventName));
}

export function readNeedoExternalInfoPosts() {
  return readRawPosts().sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime());
}

export function appendNeedoExternalInfoPost(
  post: Omit<NeedoExternalInfoPost, "id" | "offers" | "publishedAt" | "type"> & Partial<Pick<NeedoExternalInfoPost, "offers" | "publishedAt">>
) {
  const nextPost: NeedoExternalInfoPost = {
    id: `needo-external-${Date.now()}`,
    type: "reverse",
    offers: post.offers ?? 0,
    publishedAt: post.publishedAt ?? new Date().toISOString(),
    ...post
  };

  writeRawPosts([nextPost, ...readRawPosts()]);
  notifyPostsChanged();

  return nextPost;
}

export function subscribeNeedoExternalInfoPosts(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key === storageKey) {
      listener();
    }
  };

  window.addEventListener(postsChangedEventName, listener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(postsChangedEventName, listener);
    window.removeEventListener("storage", handleStorage);
  };
}
