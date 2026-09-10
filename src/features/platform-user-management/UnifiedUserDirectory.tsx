import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { platformUserManagementApi } from "./api";
import { platformUserManagementCopy } from "./i18n";
import type { Paginated, PlatformIdentityType, PlatformManagedUser, PlatformTierCode, UserDirectoryScope, UserListQuery } from "./types";
import { UnifiedUserTable } from "./UnifiedUserTable";
import { UserFilters } from "./UserFilters";

const pageSize = 20;
const optionalNumber = (value: string | null) => value !== null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined;
const optionalIsoDate = (value: string | null) => value && !Number.isNaN(Date.parse(value)) ? value : undefined;
const valuesOrLegacy = (params: URLSearchParams, valuesKey: string, legacyKey: string) => {
  const values = params.getAll(valuesKey).filter(Boolean);
  const legacy = params.get(legacyKey);
  return values.length ? values : legacy ? [legacy] : [];
};

type TopFilterDraft = Pick<UserListQuery, "keyword" | "tier" | "identityType" | "state" | "ekyc">;
export type TopFilterField = keyof TopFilterDraft;

export function canonicalTopFilterQuery(query: UserListQuery, filters: TopFilterDraft, changedFields: TopFilterField[]): UserListQuery {
  const next = { ...query, page: 1 };
  if (changedFields.includes("keyword")) next.keyword = filters.keyword?.trim() || undefined;
  if (changedFields.includes("tier")) {
    delete next.tier;
    next.tiers = filters.tier ? [filters.tier] : undefined;
  }
  if (changedFields.includes("identityType")) {
    delete next.identityType;
    next.identityTypes = filters.identityType ? [filters.identityType] : undefined;
  }
  if (changedFields.includes("state")) {
    delete next.state;
    next.states = filters.state ? [filters.state] : undefined;
  }
  if (changedFields.includes("ekyc")) {
    delete next.ekyc;
    next.ekycStates = filters.ekyc ? [filters.ekyc] : undefined;
  }
  return next;
}

export function userDirectoryQuery(params: URLSearchParams): UserListQuery {
  return {
    page: Math.max(1, optionalNumber(params.get("page")) ?? 1),
    page_size: pageSize,
    keyword: params.get("keyword") || undefined,
    tiers: valuesOrLegacy(params, "tiers", "tier") as PlatformTierCode[],
    identityTypes: valuesOrLegacy(params, "identityTypes", "identityType") as PlatformIdentityType[],
    states: valuesOrLegacy(params, "states", "state") as NonNullable<UserListQuery["states"]>,
    ekycStates: valuesOrLegacy(params, "ekycStates", "ekyc") as NonNullable<UserListQuery["ekycStates"]>,
    city: params.get("city") || params.getAll("cities")[0] || undefined,
    emailState: (params.get("emailState") as UserListQuery["emailState"]) || undefined,
    emailStates: params.getAll("emailStates") as NonNullable<UserListQuery["emailStates"]>,
    privacy: (params.get("privacy") as UserListQuery["privacy"]) || undefined,
    privacyScopes: params.getAll("privacyScopes") as NonNullable<UserListQuery["privacyScopes"]>,
    minBookings: optionalNumber(params.get("minBookings")),
    maxBookings: optionalNumber(params.get("maxBookings")),
    minNdpBalance: optionalNumber(params.get("minNdpBalance")),
    maxNdpBalance: optionalNumber(params.get("maxNdpBalance")),
    sortBy: (params.get("sortBy") as UserListQuery["sortBy"]) || undefined,
    sortDirection: (params.get("sortDirection") as UserListQuery["sortDirection"]) || undefined,
    registeredFrom: optionalIsoDate(params.get("registeredFrom")),
    registeredTo: optionalIsoDate(params.get("registeredTo"))
  };
}

export function UnifiedUserDirectory({ scope, onSelect }: { scope: UserDirectoryScope; onSelect: (userId: number) => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { language } = useOptionalI18n();
  const copy = platformUserManagementCopy[language];
  const queryKey = JSON.stringify(userDirectoryQuery(searchParams));
  const query = useMemo<UserListQuery>(() => JSON.parse(queryKey), [queryKey]);
  const filterValue = useMemo(() => ({
    keyword: query.keyword,
    tier: query.tiers?.[0],
    identityType: query.identityTypes?.[0],
    state: query.states?.[0],
    ekyc: query.ekycStates?.[0],
  }), [query]);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: Paginated<PlatformManagedUser> | null }>({ loading: true, error: null, data: null });

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    platformUserManagementApi.listUsers(scope, query)
      .then((data) => active && setState({ loading: false, error: null, data }))
      .catch(() => active && setState({ loading: false, error: copy.loadFailed, data: null }));
    return () => { active = false; };
  }, [copy.loadFailed, query, reloadToken, scope]);

  const updateQuery = (next: UserListQuery) => {
    const params = new URLSearchParams();
    const module = searchParams.get("module");
    if (module) params.set("module", module);
    Object.entries(next).forEach(([key, value]) => {
      if (key === "page_size" || value === undefined || value === "" || (key === "page" && value === 1)) return;
      if (Array.isArray(value)) value.forEach((item) => params.append(key, String(item)));
      else params.set(key, String(value));
    });
    setSearchParams(params, { replace: true });
  };
  const reset = () => {
    const params = new URLSearchParams();
    const module = searchParams.get("module");
    if (module) params.set("module", module);
    setSearchParams(params, { replace: true });
  };
  const data = state.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return <div className="space-y-4">
    <UserFilters
      language={language}
      onReset={reset}
      onSubmit={(filters, changedFields) => updateQuery(canonicalTopFilterQuery(query, filters, changedFields))}
      value={filterValue}
    />
    <section className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      {state.loading ? <div className="p-10 text-center text-sm font-bold text-ink/50">{copy.loading}</div> : null}
      {state.error ? <div className="p-10 text-center"><p className="text-sm font-bold text-coral">{state.error}</p><Button className="mt-4" onClick={() => setReloadToken((value) => value + 1)} variant="secondary">{copy.retry}</Button></div> : null}
      {!state.loading && !state.error && data?.list.length === 0 ? <div className="p-10 text-center text-sm font-bold text-ink/50">{copy.empty}</div> : null}
      {!state.loading && !state.error && data?.list.length ? <UnifiedUserTable language={language} onQueryChange={updateQuery} onSelect={onSelect} query={query} rows={data.list} /> : null}
      {data && data.total > 0 ? <footer className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink/55"><span>{data.total} {copy.members}</span><div className="flex items-center gap-2"><Button disabled={query.page === 1} onClick={() => updateQuery({ ...query, page: Math.max(1, (query.page ?? 1) - 1) })} size="sm" variant="secondary">‹</Button><span>{query.page} / {totalPages}</span><Button disabled={(query.page ?? 1) >= totalPages} onClick={() => updateQuery({ ...query, page: (query.page ?? 1) + 1 })} size="sm" variant="secondary">›</Button></div></footer> : null}
    </section>
  </div>;
}
