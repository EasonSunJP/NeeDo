import type { MobileNavItem } from "./MobileShell";

export type ClientPortalRole = "user" | "merchant" | "technician";

type ClientPortalTabConfig = {
  home: MobileNavItem;
  secondary: MobileNavItem;
  needo: MobileNavItem;
  messages: MobileNavItem;
  contacts: MobileNavItem;
  myPath: string;
  settingsPath: string;
};

export const roleBasedTabConfig: Record<ClientPortalRole, ClientPortalTabConfig> = {
  user: {
    home: { label: "首页", to: "/", icon: "home" },
    secondary: { label: "动态", to: "/moments", icon: "moments" },
    needo: { label: "NeeDo", to: "/needo", icon: "needo", featured: true },
    messages: { label: "聊天", to: "/messages", icon: "message" },
    contacts: { label: "通讯录", to: "/contacts", icon: "contacts" },
    myPath: "/me",
    settingsPath: "/me/settings"
  },
  merchant: {
    home: { label: "首页", to: "/merchant", icon: "home" },
    secondary: { label: "动态", to: "/merchant/moments", icon: "moments" },
    needo: { label: "NeeDo", to: "/merchant/needo", icon: "needo", featured: true },
    messages: { label: "聊天", to: "/merchant/messages", icon: "message" },
    contacts: { label: "通讯录", to: "/merchant/contacts", icon: "contacts" },
    myPath: "/merchant/me",
    settingsPath: "/merchant/settings"
  },
  technician: {
    home: { label: "首页", to: "/technician", icon: "home" },
    secondary: { label: "动态", to: "/technician/moments", icon: "moments" },
    needo: { label: "NeeDo", to: "/technician/needo", icon: "needo", featured: true },
    messages: { label: "聊天", to: "/technician/messages", icon: "message" },
    contacts: { label: "通讯录", to: "/technician/contacts", icon: "contacts" },
    myPath: "/technician/me",
    settingsPath: "/technician/settings"
  }
};

export function getRoleNavItems(role: ClientPortalRole): MobileNavItem[] {
  const config = roleBasedTabConfig[role];

  return [config.home, config.secondary, config.needo, config.messages, config.contacts];
}

export const userNavItems: MobileNavItem[] = getRoleNavItems("user");
export const merchantNavItems: MobileNavItem[] = getRoleNavItems("merchant");
export const technicianNavItems: MobileNavItem[] = getRoleNavItems("technician");
