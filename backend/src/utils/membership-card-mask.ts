export const maskMembershipCardNumber = (cardNo: string): string =>
  cardNo.length >= 4 ? `•••• •••• •••• ${cardNo.slice(-4)}` : "••••";
