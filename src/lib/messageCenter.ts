export type MessageCenterContext = "user" | "merchant" | "technician";

export function getMerchantCustomerConversationId(customerId: string) {
  return `merchant-customer-${customerId}`;
}

export function getMerchantTechnicianConversationId(technicianId: string) {
  return `merchant-tech-${technicianId}`;
}

export function getTechnicianStoreConversationId() {
  return "technician-store";
}

export function getTechnicianCustomerConversationId(customerId: string) {
  return `technician-customer-${customerId}`;
}

export function getTechnicianStaffConversationId(staffId: string) {
  return `technician-staff-${staffId}`;
}

export function getTechnicianSupportConversationId() {
  return "technician-support";
}

export function getUserConversationId(kind: "customer" | "technician" | "store" | "staff" | "support") {
  if (kind === "technician") {
    return "conversation-tech-1";
  }

  if (kind === "store") {
    return "conversation-store-1";
  }

  if (kind === "support") {
    return "conversation-support";
  }

  if (kind === "staff") {
    return "conversation-group-life";
  }

  return "conversation-amy";
}

export function getForwardStorageKey(context: MessageCenterContext) {
  return `needo.message.forwarded.v1.${context}`;
}

export function getMessagePath(context: MessageCenterContext, conversationId: string, returnTo?: string) {
  const params = new URLSearchParams({ chat: conversationId });

  if (returnTo) {
    params.set("returnTo", returnTo);
  }

  if (context === "merchant") {
    return `/merchant/messages?${params.toString()}`;
  }

  if (context === "technician") {
    return `/technician/messages?${params.toString()}`;
  }

  return `/messages?${params.toString()}`;
}
