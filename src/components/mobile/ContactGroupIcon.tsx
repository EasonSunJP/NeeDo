import { cn } from "../../lib/utils";

function normalize(value?: string) {
  return value?.toLowerCase() ?? "";
}

export function ContactGroupIcon({ id, label, className }: { id?: string; label?: string; className?: string }) {
  const key = `${normalize(id)} ${label ?? ""}`;

  return (
    <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        {renderGroupIcon(key)}
      </g>
    </svg>
  );
}

function renderGroupIcon(key: string) {
  if (key.includes("all") || key.includes("全部")) {
    return (
      <>
        <path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z" />
      </>
    );
  }

  if (key.includes("follow") || key.includes("关注")) {
    return (
      <>
        <path d="M12 19.2 5.8 13a4.2 4.2 0 0 1 0-5.9 4.1 4.1 0 0 1 5.8 0l.4.4.4-.4a4.1 4.1 0 0 1 5.8 0 4.2 4.2 0 0 1 0 5.9L12 19.2Z" />
      </>
    );
  }

  if (key.includes("unfollow") || key.includes("非关注")) {
    return (
      <>
        <path d="M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M4.5 20c1.4-4.2 3.9-6.3 7.5-6.3 1.8 0 3.3.5 4.5 1.5" />
        <path d="m15.5 15.5 5 5M20.5 15.5l-5 5" />
      </>
    );
  }

  if (
    key.includes("add") ||
    key.includes("plus") ||
    key.includes("添加自定义分组") ||
    key.includes("自定义分组") ||
    key.includes("添加自定义分类") ||
    key.includes("自定义分类") ||
    key.includes("+")
  ) {
    return (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    );
  }

  if (key.includes("new") || key.includes("新朋友")) {
    return (
      <>
        <path d="M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M3.5 20c1.1-4 3.1-6 6-6 1.2 0 2.2.3 3.1.9" />
        <path d="M18 13v6M15 16h6" />
      </>
    );
  }

  if (key.includes("group") || key.includes("群聊")) {
    return (
      <>
        <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 11a3 3 0 1 0 0-6" />
        <path d="M3.5 20c.9-4 2.4-6 4.5-6s3.6 2 4.5 6" />
        <path d="M13.5 14.3c2.8.4 4.5 2.3 5 5.7" />
      </>
    );
  }

  if (key.includes("tag") || key.includes("标签")) {
    return (
      <>
        <path d="M4 5.5h8.5L20 13l-7 7-7.5-7.5V5.5Z" />
        <path d="M8.5 9h.1" />
      </>
    );
  }

  if (key.includes("official") || key.includes("公众号")) {
    return (
      <>
        <path d="M5 6.5h14v11H5z" />
        <path d="M8 10h8M8 14h5" />
        <path d="M9 4.5h6" />
      </>
    );
  }

  if (key.includes("service") || key.includes("服务号") || key.includes("platform") || key.includes("平台")) {
    return (
      <>
        <path d="M12 4 5 7v5c0 4.4 2.5 7 7 8 4.5-1 7-3.6 7-8V7l-7-3Z" />
        <path d="m9 12 2 2 4-5" />
      </>
    );
  }

  if (key.includes("black") || key.includes("黑名单")) {
    return (
      <>
        <circle cx="12" cy="12" r="7" />
        <path d="m7.5 16.5 9-9" />
      </>
    );
  }

  if (key.includes("store") || key.includes("店铺")) {
    return (
      <>
        <path d="M4 10h16" />
        <path d="m5 10 1-5h12l1 5" />
        <path d="M6 10v9h12v-9" />
        <path d="M9 19v-5h6v5" />
      </>
    );
  }

  if (key.includes("customer") || key.includes("客人") || key.includes("顾客")) {
    return (
      <>
        <path d="M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M4.5 20c1.4-4.2 3.9-6.3 7.5-6.3s6.1 2.1 7.5 6.3" />
      </>
    );
  }

  if (key.includes("staff") || key.includes("coworker") || key.includes("同事") || key.includes("个人") || key.includes("技师")) {
    return (
      <>
        <path d="M8.5 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
        <path d="M3.5 19c.9-3.7 2.6-5.5 5-5.5s4.1 1.8 5 5.5" />
        <path d="M16.5 10.5a2.7 2.7 0 1 0 0-5.4" />
        <path d="M15.5 13.5c2.7.3 4.4 2.1 5 5.5" />
      </>
    );
  }
  return (
    <>
      <path d="M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M4.5 20c1.4-4.2 3.9-6.3 7.5-6.3s6.1 2.1 7.5 6.3" />
    </>
  );
}
