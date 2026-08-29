import { MobileShell } from "../../components/mobile/MobileShell";
import { ExchangePostDetailPage } from "../../features/exchange/ExchangePostDetailPage";
import type { MessageCenterContext } from "../../lib/messageCenter";

export function NeedoPostDetailRoutePage({ context = "user" }: { context?: MessageCenterContext }) {
  return (
    <MobileShell navItems={[]}>
      <ExchangePostDetailPage context={context} />
    </MobileShell>
  );
}
