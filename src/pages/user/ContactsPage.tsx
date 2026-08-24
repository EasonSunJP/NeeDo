import { ImContactsListPage } from "../../features/im/route-pages";
import { ImScopeProvider } from "../../features/im/scope";

export function ContactsPage() {
  return (
    <ImScopeProvider scope="user">
      <ImContactsListPage />
    </ImScopeProvider>
  );
}
