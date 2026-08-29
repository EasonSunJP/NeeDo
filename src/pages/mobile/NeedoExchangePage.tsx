import { MobileShell } from "../../components/mobile/MobileShell";
import { merchantNavItems, technicianNavItems, userNavItems } from "../../components/mobile/navItems";
import { ExchangeFeedPage } from "../../features/exchange/ExchangeFeedPage";
import type { MessageCenterContext } from "../../lib/messageCenter";

function getNavItems(context: MessageCenterContext) {
  if (context === "merchant") return merchantNavItems;
  if (context === "technician") return technicianNavItems;
  return userNavItems;
}

export function NeedoExchangePage({ context = "user" }: { context?: MessageCenterContext }) {
  return (
    <MobileShell navItems={getNavItems(context)}>
      <ExchangeFeedPage context={context} />
    </MobileShell>
  );
}
