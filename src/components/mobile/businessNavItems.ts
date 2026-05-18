import type { MobileNavItem } from "./MobileShell";

export const businessNavItems: MobileNavItem[] = [
  { label: "首页", to: "/afirieito", icon: "home", end: true },
  { label: "方案", to: "/afirieito/plan", icon: "tasks" },
  { label: "数据", to: "/afirieito/data", icon: "marketing" },
  { label: "组织", to: "/afirieito/organization", icon: "staff" },
  { label: "我的", to: "/afirieito/me", icon: "me" }
];
