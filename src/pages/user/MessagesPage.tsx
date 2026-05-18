import { ImMessagesEntryPage } from "../../features/im/pages";
import { ImScopeProvider } from "../../features/im/scope";

export function MessagesPage() {
  return (
    <ImScopeProvider scope="user">
      <ImMessagesEntryPage />
    </ImScopeProvider>
  );
}
