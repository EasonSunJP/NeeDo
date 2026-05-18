import { createContext, useContext, type ReactNode } from "react";
import type { ImRoleType } from "./model";

const ImScopeContext = createContext<ImRoleType>("user");

export function ImScopeProvider({
  scope,
  children
}: {
  scope: ImRoleType;
  children: ReactNode;
}) {
  return <ImScopeContext.Provider value={scope}>{children}</ImScopeContext.Provider>;
}

export function useImScope() {
  return useContext(ImScopeContext);
}
