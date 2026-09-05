import { useState } from "react";
import { translateText, type Language } from "../../i18n/translations";
import { Badge } from "../../components/ui/Badge";
import { TableColumnHeader, type TableSortDirection } from "../../components/ui/TableColumnHeader";
import { membershipTierText, platformUserManagementCopy, privacyModeText, privacyScopeText } from "./i18n";
import type { PlatformManagedUser, UserListQuery } from "./types";

type FilterOption = { label: string; value: string };

export type UnifiedUserTableProps = {
  language: Language;
  rows: PlatformManagedUser[];
  query: UserListQuery;
  onQueryChange: (next: UserListQuery) => void;
  onSelect: (userId: number) => void;
};

const bookingRanges: Record<string, Pick<UserListQuery, "minBookings" | "maxBookings">> = {
  "0": { minBookings: 0, maxBookings: 0 },
  "1-9": { minBookings: 1, maxBookings: 9 },
  "10-50": { minBookings: 10, maxBookings: 50 },
  "51+": { minBookings: 51, maxBookings: undefined }
};
const ndpRanges: Record<string, Pick<UserListQuery, "minNdpBalance" | "maxNdpBalance">> = {
  "0": { minNdpBalance: 0, maxNdpBalance: 0 },
  "1-999": { minNdpBalance: 1, maxNdpBalance: 999 },
  "1000-9999": { minNdpBalance: 1000, maxNdpBalance: 9999 },
  "10000+": { minNdpBalance: 10000, maxNdpBalance: undefined }
};

export function bookingRangeQuery(query: UserListQuery, range: string | undefined): UserListQuery {
  return {
    ...query,
    page: 1,
    minBookings: range ? bookingRanges[range]?.minBookings : undefined,
    maxBookings: range ? bookingRanges[range]?.maxBookings : undefined
  };
}

function activeBookingRange(query: UserListQuery) {
  return Object.entries(bookingRanges).find(([, value]) =>
    value.minBookings === query.minBookings && value.maxBookings === query.maxBookings
  )?.[0];
}

function ServerColumnHeader({
  title,
  columnKey,
  openKey,
  setOpenKey,
  options = [],
  value,
  searchValue = "",
  sortKey,
  query,
  onQueryChange,
  filterPatch,
  searchPatch
}: {
  title: string;
  columnKey: string;
  openKey: string | null;
  setOpenKey: (value: string | null) => void;
  options?: FilterOption[];
  value?: string;
  searchValue?: string;
  sortKey?: UserListQuery["sortBy"];
  query: UserListQuery;
  onQueryChange: (next: UserListQuery) => void;
  filterPatch?: (value: string | undefined) => Partial<UserListQuery>;
  searchPatch?: (value: string) => Partial<UserListQuery>;
}) {
  const labels = options.map((option) => option.label);
  const selectedLabels = value
    ? options.filter((option) => option.value === value).map((option) => option.label)
    : labels;
  const selectedValue = (selected: string[]) => selected.length === 1
      ? options.find((option) => option.label === selected[0])?.value
      : undefined;
  const commit = (next: Partial<UserListQuery>) => onQueryChange({ ...query, ...next, page: 1 });
  const toggleValue = (label: string) => {
    const next = selectedLabels.includes(label)
      ? selectedLabels.filter((item) => item !== label)
      : [...selectedLabels, label];
    if (filterPatch) commit(filterPatch(selectedValue(next)));
  };
  const toggleAll = (visible: string[]) => {
    const allSelected = visible.every((item) => selectedLabels.includes(item));
    const next = allSelected
      ? selectedLabels.filter((item) => !visible.includes(item))
      : Array.from(new Set([...selectedLabels, ...visible]));
    if (filterPatch) commit(filterPatch(selectedValue(next)));
  };
  const sortPatch = (direction: TableSortDirection | undefined): Partial<UserListQuery> => ({
    sortBy: direction ? sortKey : undefined,
    sortDirection: direction
  });
  const setSort = (direction: TableSortDirection | undefined) => commit(sortPatch(direction));

  return (
    <TableColumnHeader
      className="px-4 py-3 font-black"
      filterOptions={labels}
      isOpen={openKey === columnKey}
      onApply={(payload) => {
        commit({
          ...(filterPatch?.(selectedValue(payload.selectedValues)) ?? {}),
          ...(searchPatch?.(payload.searchValue) ?? {}),
          ...(sortKey ? sortPatch(payload.sortDirection) : {})
        });
      }}
      onClearFilter={() => {
        commit({
          ...(filterPatch?.(undefined) ?? {}),
          ...(searchPatch?.("") ?? {}),
          ...(query.sortBy === sortKey ? sortPatch(undefined) : {})
        });
      }}
      onOpenChange={() => setOpenKey(openKey === columnKey ? null : columnKey)}
      onSearchChange={(next) => searchPatch && commit(searchPatch(next))}
      onSort={setSort}
      onToggleAll={toggleAll}
      onToggleValue={toggleValue}
      searchValue={searchValue}
      selectedValues={selectedLabels}
      sortDirection={query.sortBy === sortKey ? query.sortDirection : undefined}
      title={title}
    />
  );
}

export function UnifiedUserTable({ language, rows, query, onQueryChange, onSelect }: UnifiedUserTableProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const copy = platformUserManagementCopy[language];
  const headerProps = { openKey, setOpenKey, query, onQueryChange };
  const tierOptions = (["free", "silver", "gold", "black_diamond"] as const)
    .map((value) => ({ value, label: membershipTierText(value, language) }));
  const privacyOptions = [
    { value: "enabled", label: privacyModeText(true, language) },
    { value: "disabled", label: privacyModeText(false, language) }
  ];
  const activeRange = <TMin extends keyof UserListQuery, TMax extends keyof UserListQuery>(
    ranges: Record<string, Pick<UserListQuery, TMin | TMax>>,
    minKey: TMin,
    maxKey: TMax
  ) => Object.entries(ranges).find(([, value]) => value[minKey] === query[minKey] && value[maxKey] === query[maxKey])?.[0];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1560px] text-left text-sm">
        <thead className="bg-paper text-xs text-ink/55"><tr>
          <ServerColumnHeader {...headerProps} columnKey="user" searchPatch={(keyword) => ({ keyword: keyword.trim() || undefined })} searchValue={query.keyword ?? ""} sortKey="displayName" title={copy.user} />
          <ServerColumnHeader {...headerProps} columnKey="email" filterPatch={(emailState) => ({ emailState: emailState as UserListQuery["emailState"] })} options={[{ value: "set", label: copy.bound }, { value: "unset", label: copy.unbound }]} sortKey="email" title={translateText("邮箱", language)} value={query.emailState} />
          <ServerColumnHeader {...headerProps} columnKey="city" searchPatch={(city) => ({ city: city.trim() || undefined })} searchValue={query.city ?? ""} sortKey="city" title={translateText("城市", language)} />
          <ServerColumnHeader {...headerProps} columnKey="identities" filterPatch={(identityType) => ({ identityType })} options={[{ value: "customer", label: copy.user }, { value: "technician", label: translateText("技师", language) }, { value: "shop_owner", label: translateText("商户", language) }, { value: "admin", label: translateText("运营", language) }]} title={copy.identities} value={query.identityType} />
          <ServerColumnHeader {...headerProps} columnKey="membership" filterPatch={(tier) => ({ tier: tier as UserListQuery["tier"] })} options={tierOptions} title={copy.membership} value={query.tier} />
          <ServerColumnHeader {...headerProps} columnKey="bookings" filterPatch={(range) => ({ minBookings: range ? bookingRanges[range]?.minBookings : undefined, maxBookings: range ? bookingRanges[range]?.maxBookings : undefined })} options={Object.keys(bookingRanges).map((value) => ({ value, label: value }))} title={copy.bookings} value={activeBookingRange(query)} />
          <ServerColumnHeader {...headerProps} columnKey="privacy" filterPatch={(privacy) => ({ privacy: privacy as UserListQuery["privacy"] })} options={privacyOptions} title={translateText("隐私模式", language)} value={query.privacy} />
          <ServerColumnHeader {...headerProps} columnKey="ekyc" filterPatch={(ekyc) => ({ ekyc: ekyc as UserListQuery["ekyc"] })} options={[{ value: "verified", label: copy.verified }, { value: "unverified", label: copy.unverified }]} title={copy.ekyc} value={query.ekyc} />
          <ServerColumnHeader {...headerProps} columnKey="ndp" filterPatch={(range) => ({ minNdpBalance: range ? ndpRanges[range]?.minNdpBalance : undefined, maxNdpBalance: range ? ndpRanges[range]?.maxNdpBalance : undefined })} options={Object.keys(ndpRanges).map((value) => ({ value, label: value }))} title={copy.ndpBalance} value={activeRange(ndpRanges, "minNdpBalance", "maxNdpBalance")} />
          <ServerColumnHeader {...headerProps} columnKey="state" filterPatch={(state) => ({ state: state as UserListQuery["state"] })} options={[{ value: "active", label: copy.active }, { value: "inactive", label: copy.inactive }]} title={copy.status} value={query.state} />
          <ServerColumnHeader {...headerProps} columnKey="createdAt" sortKey="createdAt" title={copy.registeredAt} />
          <th className="px-4 py-3 font-black">{copy.details}</th>
        </tr></thead>
        <tbody className="divide-y divide-line">{rows.map((row) => (
          <tr className="hover:bg-paper/70" key={row.id}>
            <td className="px-4 py-3"><div className="flex items-center gap-3"><img alt="" className="h-10 w-10 rounded-full border border-line object-cover" src={row.avatarUrl || "/images/generated/profiles/profile-03.jpg"} /><div><p className="font-black text-ink">{row.displayName}</p><p className="text-xs text-ink/45">{row.needoId}</p></div></div></td>
            <td className="max-w-[220px] truncate px-4 py-3 font-bold">{row.email || "—"}</td>
            <td className="px-4 py-3">{row.city || "—"}</td>
            <td className="px-4 py-3"><div className="flex max-w-[220px] flex-wrap gap-1">{row.identities.map((identity, index) => <Badge key={`${identity.type}-${identity.scopeId ?? index}`}>{identity.displayName || identity.type}</Badge>)}</div></td>
            <td className="px-4 py-3"><p className="font-bold">{membershipTierText(row.membership.tierCode, language)}</p>{row.experience ? <p className="mt-1 text-xs text-ink/50">Lv.{row.experience.currentLevel} · {row.experience.totalExpUnits} EXP</p> : null}</td>
            <td className="px-4 py-3 font-bold">{row.bookingCount}</td>
            <td className="px-4 py-3"><Badge tone={row.privacyMode ? "yellow" : "green"}>{privacyModeText(row.privacyMode, language)}</Badge>{row.privacyScope ? <p className="mt-1 text-xs text-ink/45">{privacyScopeText(row.privacyScope, language)}</p> : null}</td>
            <td className="px-4 py-3"><Badge tone={row.ekycVerified ? "green" : "neutral"}>{row.ekycVerified ? copy.verified : copy.unverified}</Badge></td>
            <td className="px-4 py-3 font-bold">{row.ndpBalance.available.toLocaleString()}</td>
            <td className="px-4 py-3"><Badge tone={row.isActive ? "green" : "red"}>{row.isActive ? copy.active : copy.inactive}</Badge></td>
            <td className="px-4 py-3 text-xs text-ink/55">{new Date(row.createdAt).toLocaleString(language)}</td>
            <td className="px-4 py-3"><button className="font-bold text-moss hover:underline" onClick={() => onSelect(row.id)} type="button">{copy.details}</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
