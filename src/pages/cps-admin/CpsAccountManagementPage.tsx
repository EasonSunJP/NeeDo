import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { businessCpsPromoters } from "../../features/business-cps/model";
import { parseBrowserStorageJson, writeBrowserStorage } from "../../lib/browserStorage";
import { cn, yen } from "../../lib/utils";

type CpsAccountRole = "Creator" | "管理员" | "商户" | "BD" | "代理" | "种子资源";
type CpsAccountStatus = "启用中" | "暂停中";
type CpsAccountRisk = "低" | "中" | "高";
type CpsLoginPermission = "ops" | "frontend";

type CpsAdminAccount = {
  id: string;
  name: string;
  username: string;
  password: string;
  email: string;
  role: CpsAccountRole;
  status: CpsAccountStatus;
  country: string;
  risk: CpsAccountRisk;
  gmv: number;
  tags: string[];
  note: string;
  source: string;
  permissions: CpsLoginPermission[];
  kyc: "通过" | "待完成";
};

type AccountDraft = Omit<CpsAdminAccount, "gmv" | "id" | "source" | "tags" | "kyc"> & {
  gmv: string;
  tags: string;
};

const legacyAccountStorageKey = "needo.cps-admin.accounts.v1";
const accountStorageKey = "needo.afirieito-admin.accounts.v1";
const roleOptions: CpsAccountRole[] = ["Creator", "管理员", "商户", "BD", "代理", "种子资源"];
const statusOptions: CpsAccountStatus[] = ["启用中", "暂停中"];
const riskOptions: CpsAccountRisk[] = ["低", "中", "高"];

const initialAccounts: CpsAdminAccount[] = [
  {
    id: "acct-eason",
    name: "Eason",
    username: "eason@rose.love",
    password: "loverose123",
    email: "eason@rose.love",
    role: "种子资源",
    status: "启用中",
    country: "JP",
    risk: "低",
    gmv: 0,
    tags: ["manual"],
    note: "资源方账号，前端后台与产运后台都可登录。",
    source: "manual",
    permissions: ["ops", "frontend"],
    kyc: "待完成"
  },
  {
    id: "acct-admin",
    name: "LoveRose Admin",
    username: "admin",
    password: "loverose123",
    email: "admin@loverose.local",
    role: "管理员",
    status: "启用中",
    country: "JP",
    risk: "低",
    gmv: 0,
    tags: ["internal"],
    note: "NDA管理后台管理账号。",
    source: "internal",
    permissions: ["ops", "frontend"],
    kyc: "通过"
  },
  {
    id: "acct-tokyo-creator",
    name: "Tokyo Creator",
    username: "tokyo_creator",
    password: "loverose123",
    email: "tokyo@example.com",
    role: "Creator",
    status: "启用中",
    country: "JP",
    risk: "低",
    gmv: 218000,
    tags: ["creator", "tokyo"],
    note: "东京资源方账号。",
    source: "import",
    permissions: ["frontend"],
    kyc: "通过"
  },
  {
    id: "acct-osaka-bd",
    name: "Osaka BD",
    username: "osaka_bd",
    password: "loverose123",
    email: "osaka-bd@example.com",
    role: "BD",
    status: "启用中",
    country: "JP",
    risk: "中",
    gmv: 168000,
    tags: ["bd", "osaka"],
    note: "关西 BD 账号。",
    source: "batch",
    permissions: ["frontend"],
    kyc: "通过"
  },
  {
    id: "acct-merchant-01",
    name: "Ginza Merchant",
    username: "ginza_merchant",
    password: "loverose123",
    email: "ginza@example.com",
    role: "商户",
    status: "启用中",
    country: "JP",
    risk: "低",
    gmv: 326000,
    tags: ["merchant"],
    note: "商户 Afirieito 协作账号。",
    source: "sync",
    permissions: ["frontend"],
    kyc: "通过"
  },
  {
    id: "acct-agent-01",
    name: "Kanto Agent",
    username: "kanto_agent",
    password: "loverose123",
    email: "kanto-agent@example.com",
    role: "代理",
    status: "启用中",
    country: "JP",
    risk: "低",
    gmv: 94000,
    tags: ["agent"],
    note: "区域代理账号。",
    source: "batch",
    permissions: ["frontend"],
    kyc: "通过"
  },
  {
    id: "acct-creator-02",
    name: "Nagoya Creator",
    username: "nagoya_creator",
    password: "loverose123",
    email: "nagoya@example.com",
    role: "Creator",
    status: "启用中",
    country: "JP",
    risk: "低",
    gmv: 72000,
    tags: ["creator"],
    note: "名古屋 Creator 账号。",
    source: "batch",
    permissions: ["frontend"],
    kyc: "待完成"
  },
  {
    id: "acct-creator-03",
    name: "Fukuoka Creator",
    username: "fukuoka_creator",
    password: "loverose123",
    email: "fukuoka@example.com",
    role: "Creator",
    status: "暂停中",
    country: "JP",
    risk: "高",
    gmv: 39000,
    tags: ["creator", "review"],
    note: "等待风控复核。",
    source: "manual",
    permissions: ["frontend"],
    kyc: "待完成"
  },
  {
    id: "acct-seed-01",
    name: "Seed Resource 01",
    username: "seed_01",
    password: "loverose123",
    email: "seed01@example.com",
    role: "种子资源",
    status: "启用中",
    country: "JP",
    risk: "低",
    gmv: 61000,
    tags: ["seed"],
    note: "种子资源测试账号。",
    source: "sync",
    permissions: ["frontend"],
    kyc: "通过"
  },
  {
    id: "acct-seed-02",
    name: "Seed Resource 02",
    username: "seed_02",
    password: "loverose123",
    email: "seed02@example.com",
    role: "种子资源",
    status: "启用中",
    country: "JP",
    risk: "低",
    gmv: 54000,
    tags: ["seed"],
    note: "种子资源测试账号。",
    source: "sync",
    permissions: ["frontend"],
    kyc: "通过"
  },
  {
    id: "acct-support",
    name: "Afirieito Support",
    username: "cps_support",
    password: "loverose123",
    email: "support-cps@example.com",
    role: "管理员",
    status: "启用中",
    country: "JP",
    risk: "低",
    gmv: 0,
    tags: ["support"],
    note: "客服工单处理账号。",
    source: "internal",
    permissions: ["ops"],
    kyc: "通过"
  }
];

const emptyDraft: AccountDraft = {
  name: "",
  username: "",
  password: "",
  email: "",
  role: "Creator",
  status: "启用中",
  country: "JP",
  risk: "低",
  gmv: "0",
  tags: "",
  note: "",
  permissions: ["frontend"]
};

function readInitialAccounts() {
  const stored = parseBrowserStorageJson<CpsAdminAccount[]>(accountStorageKey, [], {
    removeOnError: true,
    silent: true
  });
  const legacyStored = parseBrowserStorageJson<CpsAdminAccount[]>(legacyAccountStorageKey, initialAccounts, {
    removeOnError: true,
    silent: true
  });

  if (Array.isArray(stored) && stored.length) {
    return stored;
  }

  return Array.isArray(legacyStored) && legacyStored.length ? legacyStored : initialAccounts;
}

function getPermissionLabel(permission: CpsLoginPermission) {
  return permission === "ops" ? "产运后台" : "前端后台";
}

function getStatusTone(status: CpsAccountStatus) {
  return status === "启用中" ? "green" : "neutral";
}

function getRiskTone(risk: CpsAccountRisk) {
  if (risk === "高") {
    return "red";
  }

  if (risk === "中") {
    return "yellow";
  }

  return "neutral";
}

function toDraft(account: CpsAdminAccount): AccountDraft {
  return {
    name: account.name,
    username: account.username,
    password: account.password,
    email: account.email,
    role: account.role,
    status: account.status,
    country: account.country,
    risk: account.risk,
    gmv: String(account.gmv),
    tags: account.tags.join("、"),
    note: account.note,
    permissions: account.permissions
  };
}

function normalizeTags(value: string) {
  return value
    .split(/[,\n、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAccountFromDraft(draft: AccountDraft, id: string, source = "manual"): CpsAdminAccount {
  const username = draft.username.trim() || draft.email.trim() || `cps_${Date.now()}`;
  const email = draft.email.trim() || `${username}@needo-afirieito.local`;

  return {
    id,
    name: draft.name.trim() || username,
    username,
    password: draft.password.trim() || "loverose123",
    email,
    role: draft.role,
    status: draft.status,
    country: draft.country.trim() || "JP",
    risk: draft.risk,
    gmv: Number(draft.gmv) || 0,
    tags: normalizeTags(draft.tags),
    note: draft.note.trim(),
    source,
    permissions: draft.permissions.length ? draft.permissions : ["frontend"],
    kyc: draft.risk === "高" ? "待完成" : "通过"
  };
}

function accountMatchesQuery(account: CpsAdminAccount, query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return [account.name, account.username, account.email, account.note, account.tags.join(" ")]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function mapPromoterRole(role: (typeof businessCpsPromoters)[number]["role"]): CpsAccountRole {
  if (role === "merchant") {
    return "商户";
  }

  if (role === "bd") {
    return "BD";
  }

  if (role === "agent") {
    return "代理";
  }

  if (role === "platform") {
    return "管理员";
  }

  return "Creator";
}

function SummaryCard({ label, value, caption }: { label: string; value: string | number; caption: string }) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <p className="text-xs font-black text-ink/55">{label}</p>
      <strong className="mt-3 block text-3xl font-black tracking-tight text-ink">{value}</strong>
      <p className="mt-3 text-sm font-bold text-ink/50">{caption}</p>
    </section>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <label className="text-xs font-black text-ink/55">{children}</label>;
}

const fieldInputClassName = "h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none transition placeholder:text-ink/35 focus:border-moss";
const fieldClassName = cn("mt-1", fieldInputClassName);
const passwordFieldInputClassName = cn(fieldInputClassName, "pr-11");
const textareaClassName = "mt-1 min-h-[92px] w-full rounded-lg border border-line bg-white px-3 py-3 text-sm font-semibold leading-6 text-ink outline-none transition placeholder:text-ink/35 focus:border-moss";

export function CpsAccountManagementPage() {
  const [accounts, setAccounts] = useState<CpsAdminAccount[]>(readInitialAccounts);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | CpsAccountRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | CpsAccountStatus>("all");
  const [batchPrefix, setBatchPrefix] = useState("creator");
  const [batchCount, setBatchCount] = useState("10");
  const [batchPassword, setBatchPassword] = useState("loverose123");
  const [batchRole, setBatchRole] = useState<CpsAccountRole>("Creator");
  const [batchStatus, setBatchStatus] = useState<CpsAccountStatus>("启用中");
  const [batchPermissions, setBatchPermissions] = useState<CpsLoginPermission[]>(["frontend"]);
  const [batchCsv, setBatchCsv] = useState("每行： 用户名称,账号,角色,邮箱,密码,登录端\nTokyo Creator,tokyo_creator,Creator,tokyo@example.com,loverose123,frontend");

  useEffect(() => {
    writeBrowserStorage(accountStorageKey, JSON.stringify(accounts), { silent: true });
  }, [accounts]);

  const filteredAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          accountMatchesQuery(account, query) &&
          (roleFilter === "all" || account.role === roleFilter) &&
          (statusFilter === "all" || account.status === statusFilter)
      ),
    [accounts, query, roleFilter, statusFilter]
  );

  const enabledCount = accounts.filter((account) => account.status === "启用中").length;
  const frontendOrOpsCount = accounts.filter((account) => account.permissions.length > 0).length;
  const allVisibleSelected = filteredAccounts.length > 0 && filteredAccounts.every((account) => selectedIds.includes(account.id));

  const updateDraft = <Key extends keyof AccountDraft>(key: Key, value: AccountDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const toggleDraftPermission = (permission: CpsLoginPermission) => {
    setDraft((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission]
    }));
  };

  const toggleBatchPermission = (permission: CpsLoginPermission) => {
    setBatchPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission]
    );
  };

  const clearDraft = () => {
    setDraft(emptyDraft);
    setEditingAccountId(null);
  };

  const saveDraft = () => {
    const id = editingAccountId ?? `acct-${Date.now()}`;
    const account = normalizeAccountFromDraft(draft, id, editingAccountId ? "manual" : "manual");

    setAccounts((current) => editingAccountId ? current.map((item) => item.id === editingAccountId ? { ...item, ...account } : item) : [account, ...current]);
    clearDraft();
  };

  const editAccount = (account: CpsAdminAccount) => {
    setDraft(toDraft(account));
    setEditingAccountId(account.id);
  };

  const deleteAccount = (accountId: string) => {
    setAccounts((current) => current.filter((account) => account.id !== accountId));
    setSelectedIds((current) => current.filter((id) => id !== accountId));
  };

  const setSelected = (accountId: string, checked: boolean) => {
    setSelectedIds((current) => checked ? [...new Set([...current, accountId])] : current.filter((id) => id !== accountId));
  };

  const toggleAllVisible = (checked: boolean) => {
    const visibleIds = filteredAccounts.map((account) => account.id);

    setSelectedIds((current) => checked ? [...new Set([...current, ...visibleIds])] : current.filter((id) => !visibleIds.includes(id)));
  };

  const updateSelectedStatus = (status: CpsAccountStatus) => {
    setAccounts((current) => current.map((account) => selectedIds.includes(account.id) ? { ...account, status } : account));
  };

  const deleteSelected = () => {
    setAccounts((current) => current.filter((account) => !selectedIds.includes(account.id)));
    setSelectedIds([]);
  };

  const generateBatchAccounts = () => {
    const csvLines = batchCsv
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("每行"));

    const createdAt = Date.now();
    const nextAccounts = csvLines.length > 0
      ? csvLines.map((line, index) => {
          const [name, username, role, email, password, permissionText] = line.split(",").map((item) => item?.trim() ?? "");
          const permissions = permissionText?.toLowerCase().includes("ops") || permissionText?.includes("产运")
            ? ["ops", "frontend"] as CpsLoginPermission[]
            : batchPermissions;

          return normalizeAccountFromDraft(
            {
              ...emptyDraft,
              name,
              username,
              email,
              password: password || batchPassword,
              role: roleOptions.includes(role as CpsAccountRole) ? role as CpsAccountRole : batchRole,
              status: batchStatus,
              permissions
            },
            `acct-batch-${createdAt}-${index}`,
            "batch"
          );
        })
      : Array.from({ length: Math.min(Math.max(Number(batchCount) || 1, 1), 100) }, (_, index) => {
          const padded = String(index + 1).padStart(2, "0");
          const username = `${batchPrefix}_${padded}`;

          return normalizeAccountFromDraft(
            {
              ...emptyDraft,
              name: `${batchRole} ${padded}`,
              username,
              email: `${username}@needo-afirieito.local`,
              password: batchPassword,
              role: batchRole,
              status: batchStatus,
              permissions: batchPermissions
            },
            `acct-batch-${createdAt}-${index}`,
            "batch"
          );
        });

    setAccounts((current) => [...nextAccounts, ...current]);
  };

  const syncPromoterAccounts = () => {
    setAccounts((current) => {
      const currentIds = new Set(current.map((account) => account.id));
      const syncedAccounts = businessCpsPromoters
        .filter((promoter) => !currentIds.has(`acct-${promoter.id}`))
        .map((promoter) => normalizeAccountFromDraft(
          {
            ...emptyDraft,
            name: promoter.name,
            username: promoter.inviteCode.toLowerCase(),
            email: `${promoter.inviteCode.toLowerCase()}@needo-afirieito.local`,
            password: "loverose123",
            role: mapPromoterRole(promoter.role),
            status: promoter.status === "restricted" ? "暂停中" : "启用中",
            country: "JP",
            risk: promoter.riskScore >= 30 ? "中" : "低",
            gmv: String(promoter.monthIncome),
            tags: [promoter.roleLabel, promoter.primaryChannel, promoter.region].join("、"),
            note: promoter.identity,
            permissions: ["frontend"]
          },
          `acct-${promoter.id}`,
          "sync"
        ));

      return syncedAccounts.length ? [...syncedAccounts, ...current] : current;
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard caption="产运/前端后台账号" label="账号总数" value={accounts.length} />
        <SummaryCard caption="可正常操作" label="启用中" value={enabledCount} />
        <SummaryCard caption="已发行账号" label="可登录前端后台" value={frontendOrOpsCount} />
        <SummaryCard caption="批量操作对象" label="已选择" value={selectedIds.length} />
      </div>

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">发行 / 编辑账号</h2>
            <p className="mt-1 text-sm font-bold text-ink/50">账号密码会写入同一份运行库，勾选前端后台后即可登录 5173。</p>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold text-ink/50">
            <span>登录端权限</span>
            <label className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
              <input checked={draft.permissions.includes("ops")} onChange={() => toggleDraftPermission("ops")} type="checkbox" />
              产运后台
            </label>
            <label className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
              <input checked={draft.permissions.includes("frontend")} onChange={() => toggleDraftPermission("frontend")} type="checkbox" />
              前端后台
            </label>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          <div>
            <FieldLabel>用户名称</FieldLabel>
            <input className={fieldClassName} onChange={(event) => updateDraft("name", event.target.value)} value={draft.name} />
          </div>
          <div>
            <FieldLabel>登录账号</FieldLabel>
            <input className={fieldClassName} onChange={(event) => updateDraft("username", event.target.value)} value={draft.username} />
          </div>
          <div>
            <FieldLabel>初始密码</FieldLabel>
            <PasswordInput
              autoComplete="new-password"
              inputClassName={passwordFieldInputClassName}
              onChange={(event) => updateDraft("password", event.target.value)}
              toggleClassName="right-1 text-ink/45"
              value={draft.password}
              wrapperClassName="mt-1"
            />
          </div>
          <div>
            <FieldLabel>邮箱</FieldLabel>
            <input className={fieldClassName} onChange={(event) => updateDraft("email", event.target.value)} value={draft.email} />
          </div>
          <div>
            <FieldLabel>角色</FieldLabel>
            <select className={fieldClassName} onChange={(event) => updateDraft("role", event.target.value as CpsAccountRole)} value={draft.role}>
              {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>状态</FieldLabel>
            <select className={fieldClassName} onChange={(event) => updateDraft("status", event.target.value as CpsAccountStatus)} value={draft.status}>
              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>国家/地区</FieldLabel>
            <input className={fieldClassName} onChange={(event) => updateDraft("country", event.target.value)} value={draft.country} />
          </div>
          <div>
            <FieldLabel>风险等级</FieldLabel>
            <select className={fieldClassName} onChange={(event) => updateDraft("risk", event.target.value as CpsAccountRisk)} value={draft.risk}>
              {riskOptions.map((risk) => <option key={risk} value={risk}>{risk}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>累计净GMV</FieldLabel>
            <input className={fieldClassName} onChange={(event) => updateDraft("gmv", event.target.value)} value={draft.gmv} />
          </div>
          <div className="lg:col-span-3">
            <FieldLabel>标签</FieldLabel>
            <input className={fieldClassName} onChange={(event) => updateDraft("tags", event.target.value)} value={draft.tags} />
          </div>
          <div className="lg:col-span-2">
            <FieldLabel>备注</FieldLabel>
            <textarea className={textareaClassName} onChange={(event) => updateDraft("note", event.target.value)} value={draft.note} />
          </div>
          <div className="flex items-end gap-3 lg:col-span-2 lg:justify-center">
            <Button onClick={clearDraft} type="button" variant="secondary">清空</Button>
            <Button onClick={saveDraft} type="button">{editingAccountId ? "保存账号" : "新增账号"}</Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black">批量发行前端后台账号</h2>
          <Button onClick={syncPromoterAccounts} type="button" variant="secondary">同步资源方/Creator账号</Button>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          <div>
            <FieldLabel>批量前缀</FieldLabel>
            <input className={fieldClassName} onChange={(event) => setBatchPrefix(event.target.value)} value={batchPrefix} />
          </div>
          <div>
            <FieldLabel>生成数量</FieldLabel>
            <input className={fieldClassName} onChange={(event) => setBatchCount(event.target.value)} value={batchCount} />
          </div>
          <div>
            <FieldLabel>统一初始密码</FieldLabel>
            <PasswordInput
              autoComplete="new-password"
              inputClassName={passwordFieldInputClassName}
              onChange={(event) => setBatchPassword(event.target.value)}
              toggleClassName="right-1 text-ink/45"
              value={batchPassword}
              wrapperClassName="mt-1"
            />
          </div>
          <div>
            <FieldLabel>登录端权限</FieldLabel>
            <div className="mt-1 flex h-11 items-center gap-2">
              <label className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-paper px-3 text-sm font-bold">
                <input checked={batchPermissions.includes("ops")} onChange={() => toggleBatchPermission("ops")} type="checkbox" />
                产运后台
              </label>
              <label className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-paper px-3 text-sm font-bold">
                <input checked={batchPermissions.includes("frontend")} onChange={() => toggleBatchPermission("frontend")} type="checkbox" />
                前端后台
              </label>
            </div>
          </div>
          <div>
            <FieldLabel>角色</FieldLabel>
            <select className={fieldClassName} onChange={(event) => setBatchRole(event.target.value as CpsAccountRole)} value={batchRole}>
              {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>状态</FieldLabel>
            <select className={fieldClassName} onChange={(event) => setBatchStatus(event.target.value as CpsAccountStatus)} value={batchStatus}>
              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <div className="lg:col-span-2">
            <FieldLabel>批量导入账号 CSV</FieldLabel>
            <textarea className={textareaClassName} onChange={(event) => setBatchCsv(event.target.value)} value={batchCsv} />
          </div>
          <div className="lg:col-span-4">
            <Button onClick={generateBatchAccounts} type="button">生成/导入批量账号</Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h2 className="text-xl font-black">账号列表</h2>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!selectedIds.length} onClick={() => updateSelectedStatus("启用中")} size="sm" variant="secondary">批量启用</Button>
            <Button disabled={!selectedIds.length} onClick={() => updateSelectedStatus("暂停中")} size="sm" variant="secondary">批量暂停</Button>
            <Button disabled={!selectedIds.length} onClick={deleteSelected} size="sm" variant="danger">批量删除</Button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_240px_240px]">
          <label>
            <FieldLabel>搜索</FieldLabel>
            <input className={fieldClassName} onChange={(event) => setQuery(event.target.value)} placeholder="姓名、账号、邮箱、备注" value={query} />
          </label>
          <label>
            <FieldLabel>角色</FieldLabel>
            <select className={fieldClassName} onChange={(event) => setRoleFilter(event.target.value as "all" | CpsAccountRole)} value={roleFilter}>
              <option value="all">全部角色</option>
              {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <label>
            <FieldLabel>状态</FieldLabel>
            <select className={fieldClassName} onChange={(event) => setStatusFilter(event.target.value as "all" | CpsAccountStatus)} value={statusFilter}>
              <option value="all">全部状态</option>
              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-line">
          <div className="grid min-w-[1100px] grid-cols-[56px_2fr_1.5fr_1.2fr_1fr_1.1fr_1fr_1.6fr] bg-paper px-4 py-3 text-xs font-black text-ink/55">
            <label className="flex items-center justify-center">
              <input checked={allVisibleSelected} onChange={(event) => toggleAllVisible(event.target.checked)} type="checkbox" />
            </label>
            <span>账号</span>
            <span>登录端</span>
            <span>角色</span>
            <span>状态</span>
            <span>KYC / 风险</span>
            <span>GMV</span>
            <span>操作</span>
          </div>
          <div className="max-h-[520px] min-w-[1100px] overflow-auto">
            {filteredAccounts.map((account) => (
              <div className="grid grid-cols-[56px_2fr_1.5fr_1.2fr_1fr_1.1fr_1fr_1.6fr] items-center border-t border-line px-4 py-4 text-sm" key={account.id}>
                <label className="flex items-center justify-center">
                  <input checked={selectedIds.includes(account.id)} onChange={(event) => setSelected(account.id, event.target.checked)} type="checkbox" />
                </label>
                <div className="min-w-0">
                  <p className="truncate font-black text-ink">{account.name}</p>
                  <p className="mt-1 truncate text-xs font-bold text-ink/45">{account.username} · {account.email}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {account.permissions.map((permission) => (
                    <span className="rounded-full bg-cyan-100 px-2 py-1 text-xs font-black text-cyan-700" key={permission}>{getPermissionLabel(permission)}</span>
                  ))}
                </div>
                <span className="font-bold text-ink/70">{account.role}</span>
                <Badge tone={getStatusTone(account.status)}>{account.status}</Badge>
                <div>
                  <p className="font-bold text-ink/70">{account.kyc}</p>
                  <Badge tone={getRiskTone(account.risk)}>{account.risk}</Badge>
                </div>
                <span className={cn("font-black", account.gmv > 0 ? "text-ink" : "text-ink/45")}>{yen(account.gmv)}</span>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => editAccount(account)} size="sm" type="button" variant="secondary">编辑</Button>
                  <Button onClick={() => deleteAccount(account.id)} size="sm" type="button" variant="danger">删除</Button>
                </div>
              </div>
            ))}
            {!filteredAccounts.length ? (
              <div className="border-t border-line px-4 py-12 text-center text-sm font-bold text-ink/45">没有匹配的账号</div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
