import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PermissionGate } from "../../auth/PermissionGate";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import {
  userManagementApi,
  type PaginatedData,
  type PermissionPayload,
  type PermissionTreePayload,
  type PermissionType,
  type RolePayload,
  type UserPayload
} from "../../api/userManagement";

type ManagementMode = "permissions" | "roles" | "users";

type Copy = {
  usersTitle: string;
  usersDescription: string;
  rolesTitle: string;
  rolesDescription: string;
  permissionsTitle: string;
  permissionsDescription: string;
  loading: string;
  refresh: string;
  create: string;
  email: string;
  username: string;
  password: string;
  role: string;
  roles: string;
  permissions: string;
  assign: string;
  enable: string;
  disable: string;
  delete: string;
  system: string;
  editable: string;
  active: string;
  disabled: string;
  code: string;
  name: string;
  type: string;
  module: string;
  description: string;
  keyword: string;
  search: string;
  empty: string;
  permissionTree: string;
  saveSuccess: string;
};

const copyByLanguage: Record<Language, Copy> = {
  zh: {
    usersTitle: "账号管理",
    usersDescription: "从真实 /api/v1/users 读取账号，按权限控制创建、状态和角色分配操作。",
    rolesTitle: "角色管理",
    rolesDescription: "从真实 /api/v1/roles 读取角色，并通过 RBAC 控制角色创建、删除和权限分配。",
    permissionsTitle: "权限管理",
    permissionsDescription: "从真实 /api/v1/permissions 读取权限列表和权限树。",
    loading: "加载中",
    refresh: "刷新",
    create: "创建",
    email: "邮箱",
    username: "用户名",
    password: "初始密码",
    role: "角色",
    roles: "角色",
    permissions: "权限",
    assign: "分配",
    enable: "启用",
    disable: "禁用",
    delete: "删除",
    system: "系统",
    editable: "可编辑",
    active: "启用",
    disabled: "停用",
    code: "代码",
    name: "名称",
    type: "类型",
    module: "模块",
    description: "说明",
    keyword: "关键字",
    search: "搜索",
    empty: "暂无数据",
    permissionTree: "权限树",
    saveSuccess: "已保存"
  },
  "zh-Hant": {
    usersTitle: "帳號管理",
    usersDescription: "從真實 /api/v1/users 讀取帳號，按權限控制建立、狀態和角色分配操作。",
    rolesTitle: "角色管理",
    rolesDescription: "從真實 /api/v1/roles 讀取角色，並通過 RBAC 控制角色建立、刪除和權限分配。",
    permissionsTitle: "權限管理",
    permissionsDescription: "從真實 /api/v1/permissions 讀取權限列表和權限樹。",
    loading: "載入中",
    refresh: "刷新",
    create: "建立",
    email: "信箱",
    username: "使用者名稱",
    password: "初始密碼",
    role: "角色",
    roles: "角色",
    permissions: "權限",
    assign: "分配",
    enable: "啟用",
    disable: "停用",
    delete: "刪除",
    system: "系統",
    editable: "可編輯",
    active: "啟用",
    disabled: "停用",
    code: "代碼",
    name: "名稱",
    type: "類型",
    module: "模組",
    description: "說明",
    keyword: "關鍵字",
    search: "搜尋",
    empty: "暫無資料",
    permissionTree: "權限樹",
    saveSuccess: "已儲存"
  },
  ja: {
    usersTitle: "アカウント管理",
    usersDescription: "実際の /api/v1/users からアカウントを読み込み、作成、状態、ロール付与を権限で制御します。",
    rolesTitle: "ロール管理",
    rolesDescription: "実際の /api/v1/roles からロールを読み込み、作成、削除、権限付与を RBAC で制御します。",
    permissionsTitle: "権限管理",
    permissionsDescription: "実際の /api/v1/permissions から権限リストと権限ツリーを読み込みます。",
    loading: "読み込み中",
    refresh: "更新",
    create: "作成",
    email: "メール",
    username: "ユーザー名",
    password: "初期パスワード",
    role: "ロール",
    roles: "ロール",
    permissions: "権限",
    assign: "割り当て",
    enable: "有効化",
    disable: "無効化",
    delete: "削除",
    system: "システム",
    editable: "編集可",
    active: "有効",
    disabled: "無効",
    code: "コード",
    name: "名称",
    type: "種別",
    module: "モジュール",
    description: "説明",
    keyword: "キーワード",
    search: "検索",
    empty: "データがありません",
    permissionTree: "権限ツリー",
    saveSuccess: "保存しました"
  },
  en: {
    usersTitle: "Account Management",
    usersDescription: "Reads real /api/v1/users accounts and gates create, status, and role assignment actions by permission.",
    rolesTitle: "Role Management",
    rolesDescription: "Reads real /api/v1/roles roles and gates role creation, deletion, and permission assignment through RBAC.",
    permissionsTitle: "Permission Management",
    permissionsDescription: "Reads real /api/v1/permissions lists and the permission tree.",
    loading: "Loading",
    refresh: "Refresh",
    create: "Create",
    email: "Email",
    username: "Username",
    password: "Initial password",
    role: "Role",
    roles: "Roles",
    permissions: "Permissions",
    assign: "Assign",
    enable: "Enable",
    disable: "Disable",
    delete: "Delete",
    system: "System",
    editable: "Editable",
    active: "Active",
    disabled: "Disabled",
    code: "Code",
    name: "Name",
    type: "Type",
    module: "Module",
    description: "Description",
    keyword: "Keyword",
    search: "Search",
    empty: "No data",
    permissionTree: "Permission tree",
    saveSuccess: "Saved"
  },
  ko: {
    usersTitle: "계정 관리",
    usersDescription: "실제 /api/v1/users 계정을 읽고 생성, 상태, 역할 배정을 권한으로 제어합니다.",
    rolesTitle: "역할 관리",
    rolesDescription: "실제 /api/v1/roles 역할을 읽고 역할 생성, 삭제, 권한 배정을 RBAC로 제어합니다.",
    permissionsTitle: "권한 관리",
    permissionsDescription: "실제 /api/v1/permissions 목록과 권한 트리를 읽습니다.",
    loading: "불러오는 중",
    refresh: "새로고침",
    create: "생성",
    email: "이메일",
    username: "사용자명",
    password: "초기 비밀번호",
    role: "역할",
    roles: "역할",
    permissions: "권한",
    assign: "배정",
    enable: "활성화",
    disable: "비활성화",
    delete: "삭제",
    system: "시스템",
    editable: "편집 가능",
    active: "활성",
    disabled: "비활성",
    code: "코드",
    name: "이름",
    type: "유형",
    module: "모듈",
    description: "설명",
    keyword: "키워드",
    search: "검색",
    empty: "데이터 없음",
    permissionTree: "권한 트리",
    saveSuccess: "저장됨"
  }
};

const emptyUsers: PaginatedData<UserPayload> = { list: [], page: 1, page_size: 20, total: 0 };
const emptyRoles: PaginatedData<RolePayload> = { list: [], page: 1, page_size: 20, total: 0 };
const emptyPermissions: PaginatedData<PermissionPayload> = { list: [], page: 1, page_size: 20, total: 0 };

function Field({
  autoComplete,
  label,
  onChange,
  placeholder,
  type = "text",
  value
}: {
  autoComplete?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  const inputClassName = "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold outline-none transition focus:border-moss";

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-ink/55">{label}</span>
      {type === "password" ? (
        <PasswordInput
          autoComplete={autoComplete ?? "new-password"}
          inputClassName={`${inputClassName} pr-11`}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          toggleClassName="right-1 text-ink/45"
          value={value}
        />
      ) : (
        <input
          className={inputClassName}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={type}
          value={value}
        />
      )}
    </label>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return message ? <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm font-bold text-[#a63f32]">{message}</p> : null;
}

function SuccessMessage({ message }: { message: string }) {
  return message ? <p className="rounded-lg bg-mint/20 px-3 py-2 text-sm font-bold text-[#2f6846]">{message}</p> : null;
}

function RoleAssignmentControl({
  copy,
  onAssign,
  roles,
  user
}: {
  copy: Copy;
  onAssign: (userId: number, roleId: number) => void;
  roles: RolePayload[];
  user: UserPayload;
}) {
  const [roleId, setRoleId] = useState(() => roles[0]?.id ?? 0);

  if (roles.length === 0) {
    return null;
  }

  return (
    <PermissionGate permission="button:user:assign-role">
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-lg border border-line bg-white px-2 text-xs font-bold"
          onChange={(event) => setRoleId(Number(event.target.value))}
          value={roleId}
        >
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
        <Button onClick={() => onAssign(user.id, roleId)} size="sm" variant="secondary">
          {copy.assign}
        </Button>
      </div>
    </PermissionGate>
  );
}

function RolePermissionControl({
  copy,
  onAssign,
  permissions,
  role
}: {
  copy: Copy;
  onAssign: (roleId: number, permissionIds: number[]) => void;
  permissions: PermissionPayload[];
  role: RolePayload;
}) {
  const [selected, setSelected] = useState(() => new Set(role.permissions.map((permission) => permission.id)));
  const visiblePermissions = permissions.slice(0, 40);

  useEffect(() => {
    setSelected(new Set(role.permissions.map((permission) => permission.id)));
  }, [role]);

  return (
    <PermissionGate permission="button:role:assign-permission">
      <details className="mt-3 rounded-lg border border-line bg-paper p-3">
        <summary className="cursor-pointer text-xs font-black text-ink/60">{copy.assign} {copy.permissions}</summary>
        <div className="mt-3 grid max-h-56 gap-2 overflow-auto sm:grid-cols-2">
          {visiblePermissions.map((permission) => (
            <label className="flex items-start gap-2 rounded-lg bg-white px-2 py-2 text-xs font-bold text-ink/65" key={permission.id}>
              <input
                checked={selected.has(permission.id)}
                className="mt-0.5"
                onChange={(event) => {
                  setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) {
                      next.add(permission.id);
                    } else {
                      next.delete(permission.id);
                    }

                    return next;
                  });
                }}
                type="checkbox"
              />
              <span>{permission.name}<span className="ml-1 font-mono text-ink/40">{permission.code}</span></span>
            </label>
          ))}
        </div>
        <Button className="mt-3" onClick={() => onAssign(role.id, Array.from(selected))} size="sm" variant="dark">
          {copy.assign}
        </Button>
      </details>
    </PermissionGate>
  );
}

function PermissionTree({ copy, tree }: { copy: Copy; tree: PermissionTreePayload | null }) {
  if (!tree) {
    return null;
  }

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <h2 className="font-black">{copy.permissionTree}</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tree.modules.map((module) => (
          <article className="rounded-lg border border-line bg-paper p-3" key={module.module}>
            <h3 className="font-mono text-sm font-black">{module.module}</h3>
            <div className="mt-2 space-y-2">
              {module.children.map((child) => (
                <p className="text-xs font-bold text-ink/60" key={`${module.module}-${child.type}`}>
                  {child.type}: {child.permissions.length}
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function UserManagementWorkspace({ mode }: { mode: ManagementMode }) {
  const { language } = useI18n();
  const copy = copyByLanguage[language];
  const [users, setUsers] = useState(emptyUsers);
  const [roles, setRoles] = useState(emptyRoles);
  const [permissions, setPermissions] = useState(emptyPermissions);
  const [permissionTree, setPermissionTree] = useState<PermissionTreePayload | null>(null);
  const [keyword, setKeyword] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [userForm, setUserForm] = useState({ email: "", password: "", username: "" });
  const [roleForm, setRoleForm] = useState({ code: "", description: "", name: "" });
  const [permissionForm, setPermissionForm] = useState<{ code: string; description: string; module: string; name: string; type: PermissionType }>({
    code: "",
    description: "",
    module: "dashboard",
    name: "",
    type: "page"
  });

  const pageTitle = mode === "users" ? copy.usersTitle : mode === "roles" ? copy.rolesTitle : copy.permissionsTitle;
  const pageDescription = mode === "users" ? copy.usersDescription : mode === "roles" ? copy.rolesDescription : copy.permissionsDescription;

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const [nextRoles, nextPermissions] = await Promise.all([
          mode === "users"
            ? userManagementApi.listRoles({ page: 1, pageSize: 100 })
            : mode === "roles"
              ? userManagementApi.listRoles({ keyword, page: 1, pageSize: 100 })
              : Promise.resolve(emptyRoles),
          mode === "roles"
            ? userManagementApi.listPermissions({ page: 1, pageSize: 100 })
            : mode === "permissions"
              ? userManagementApi.listPermissions({ keyword, page: 1, pageSize: 100 })
              : Promise.resolve(emptyPermissions)
        ]);
        const [nextUsers, nextPermissionTree] = await Promise.all([
          mode === "users" ? userManagementApi.listUsers({ keyword, page: 1, pageSize: 20 }) : Promise.resolve(emptyUsers),
          mode === "permissions" ? userManagementApi.getPermissionTree() : Promise.resolve(null)
        ]);

        if (!alive) {
          return;
        }

        setUsers(nextUsers);
        setRoles(nextRoles);
        setPermissions(nextPermissions);
        setPermissionTree(nextPermissionTree);
      } catch (loadError) {
        if (alive) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      alive = false;
    };
  }, [keyword, mode, refreshKey]);

  const roleById = useMemo(() => new Map(roles.list.map((role) => [role.id, role])), [roles.list]);

  const mutate = async (action: () => Promise<unknown>) => {
    setError("");
    setSuccess("");

    try {
      await action();
      setSuccess(copy.saveSuccess);
      setRefreshKey((current) => current + 1);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
    }
  };

  const createUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutate(async () => {
      await userManagementApi.createUser(userForm);
      setUserForm({ email: "", password: "", username: "" });
    });
  };

  const createRole = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutate(async () => {
      await userManagementApi.createRole({ ...roleForm, description: roleForm.description || null });
      setRoleForm({ code: "", description: "", name: "" });
    });
  };

  const createPermission = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutate(async () => {
      await userManagementApi.createPermission({ ...permissionForm, description: permissionForm.description || null });
      setPermissionForm({ code: "", description: "", module: "dashboard", name: "", type: "page" });
    });
  };

  return (
    <AdminLayout>
      <ModuleShell
        title={pageTitle}
        description={pageDescription}
        actions={<Button onClick={() => setRefreshKey((current) => current + 1)} variant="secondary">{copy.refresh}</Button>}
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr),auto]">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-white p-2 shadow-panel">
            <input
              className="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm font-bold outline-none"
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={copy.keyword}
              value={keyword}
            />
            <Button onClick={() => setRefreshKey((current) => current + 1)} size="sm" variant="dark">
              {copy.search}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold text-ink/55">
            {loading ? copy.loading : `${mode === "users" ? users.total : mode === "roles" ? roles.total : permissions.total}`}
          </div>
        </div>

        <ErrorMessage message={error} />
        <SuccessMessage message={success} />

        {mode === "users" ? (
          <>
            <PermissionGate permission="button:user:create">
              <form className="grid gap-3 rounded-lg border border-line bg-white p-4 shadow-panel md:grid-cols-4" onSubmit={createUser}>
                <Field label={copy.email} onChange={(value) => setUserForm((current) => ({ ...current, email: value }))} placeholder="name@example.com" type="email" value={userForm.email} />
                <Field label={copy.username} onChange={(value) => setUserForm((current) => ({ ...current, username: value }))} value={userForm.username} />
                <Field autoComplete="new-password" label={copy.password} onChange={(value) => setUserForm((current) => ({ ...current, password: value }))} type="password" value={userForm.password} />
                <div className="flex items-end">
                  <Button className="w-full" type="submit">{copy.create}</Button>
                </div>
              </form>
            </PermissionGate>

            <section className="grid gap-3">
              {users.list.length === 0 && !loading ? <p className="rounded-lg border border-line bg-white p-4 text-sm font-bold text-ink/55">{copy.empty}</p> : null}
              {users.list.map((user) => (
                <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={user.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-black">{user.username}</h2>
                      <p className="mt-1 text-sm font-semibold text-ink/55">{user.email}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge tone={user.isActive ? "green" : "red"}>{user.isActive ? copy.active : copy.disabled}</Badge>
                        {user.roles.map((role) => (
                          <Badge key={role} tone="blue">{roleById.get(user.roleAssignments.find((assignment) => assignment.code === role)?.roleId ?? 0)?.name ?? role}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <PermissionGate permission="button:user:disable">
                        <Button onClick={() => mutate(() => user.isActive ? userManagementApi.disableUser(user.id) : userManagementApi.enableUser(user.id))} size="sm" variant="secondary">
                          {user.isActive ? copy.disable : copy.enable}
                        </Button>
                      </PermissionGate>
                      <PermissionGate permission="button:user:delete">
                        <Button onClick={() => mutate(() => userManagementApi.deleteUser(user.id))} size="sm" variant="danger">
                          {copy.delete}
                        </Button>
                      </PermissionGate>
                    </div>
                  </div>
                  <RoleAssignmentControl
                    copy={copy}
                    onAssign={(userId, roleId) => mutate(() => userManagementApi.assignUserRoles(userId, [{ roleId, scopeId: null, scopeType: "global" }]))}
                    roles={roles.list}
                    user={user}
                  />
                </article>
              ))}
            </section>
          </>
        ) : null}

        {mode === "roles" ? (
          <>
            <PermissionGate permission="button:role:create">
              <form className="grid gap-3 rounded-lg border border-line bg-white p-4 shadow-panel md:grid-cols-4" onSubmit={createRole}>
                <Field label={copy.name} onChange={(value) => setRoleForm((current) => ({ ...current, name: value }))} value={roleForm.name} />
                <Field label={copy.code} onChange={(value) => setRoleForm((current) => ({ ...current, code: value }))} value={roleForm.code} />
                <Field label={copy.description} onChange={(value) => setRoleForm((current) => ({ ...current, description: value }))} value={roleForm.description} />
                <div className="flex items-end">
                  <Button className="w-full" type="submit">{copy.create}</Button>
                </div>
              </form>
            </PermissionGate>

            <section className="grid gap-3 lg:grid-cols-2">
              {roles.list.map((role) => (
                <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={role.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-black">{role.name}</h2>
                      <p className="mt-1 font-mono text-xs font-bold text-ink/45">{role.code}</p>
                    </div>
                    <Badge tone={role.isSystem ? "dark" : "neutral"}>{role.isSystem ? copy.system : copy.editable}</Badge>
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-6 text-ink/55">{role.description || "-"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {role.permissions.slice(0, 8).map((permission) => (
                      <Badge key={permission.id} tone="neutral">{permission.code}</Badge>
                    ))}
                  </div>
                  <RolePermissionControl copy={copy} onAssign={(roleId, permissionIds) => mutate(() => userManagementApi.assignRolePermissions(roleId, permissionIds))} permissions={permissions.list} role={role} />
                  {!role.isSystem ? (
                    <PermissionGate permission="button:role:delete">
                      <Button className="mt-3" onClick={() => mutate(() => userManagementApi.deleteRole(role.id))} size="sm" variant="danger">
                        {copy.delete}
                      </Button>
                    </PermissionGate>
                  ) : null}
                </article>
              ))}
            </section>
          </>
        ) : null}

        {mode === "permissions" ? (
          <>
            <PermissionGate permission="button:permission:create">
              <form className="grid gap-3 rounded-lg border border-line bg-white p-4 shadow-panel md:grid-cols-6" onSubmit={createPermission}>
                <Field label={copy.name} onChange={(value) => setPermissionForm((current) => ({ ...current, name: value }))} value={permissionForm.name} />
                <Field label={copy.code} onChange={(value) => setPermissionForm((current) => ({ ...current, code: value }))} value={permissionForm.code} />
                <label className="block">
                  <span className="mb-1 block text-xs font-black text-ink/55">{copy.type}</span>
                  <select
                    className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold"
                    onChange={(event) => setPermissionForm((current) => ({ ...current, type: event.target.value as PermissionType }))}
                    value={permissionForm.type}
                  >
                    <option value="api">api</option>
                    <option value="menu">menu</option>
                    <option value="page">page</option>
                    <option value="button">button</option>
                  </select>
                </label>
                <Field label={copy.module} onChange={(value) => setPermissionForm((current) => ({ ...current, module: value }))} value={permissionForm.module} />
                <Field label={copy.description} onChange={(value) => setPermissionForm((current) => ({ ...current, description: value }))} value={permissionForm.description} />
                <div className="flex items-end">
                  <Button className="w-full" type="submit">{copy.create}</Button>
                </div>
              </form>
            </PermissionGate>

            <PermissionTree copy={copy} tree={permissionTree} />

            <section className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">
              <table className="w-full min-w-[880px] border-collapse text-sm">
                <thead className="bg-paper text-left text-xs font-bold uppercase text-ink/45">
                  <tr>
                    <th className="border-b border-line px-4 py-3">{copy.name}</th>
                    <th className="border-b border-line px-4 py-3">{copy.code}</th>
                    <th className="border-b border-line px-4 py-3">{copy.type}</th>
                    <th className="border-b border-line px-4 py-3">{copy.module}</th>
                    <th className="border-b border-line px-4 py-3">{copy.description}</th>
                    <th className="border-b border-line px-4 py-3">{copy.delete}</th>
                  </tr>
                </thead>
                <tbody>
                  {permissions.list.map((permission) => (
                    <tr className="border-b border-line last:border-b-0" key={permission.id}>
                      <td className="px-4 py-3 font-bold">{permission.name}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-ink/60">{permission.code}</td>
                      <td className="px-4 py-3"><Badge tone="blue">{permission.type}</Badge></td>
                      <td className="px-4 py-3 font-bold text-ink/55">{permission.module}</td>
                      <td className="px-4 py-3 text-ink/55">{permission.description || "-"}</td>
                      <td className="px-4 py-3">
                        {!permission.isSystem ? (
                          <PermissionGate permission="button:permission:delete">
                            <Button onClick={() => mutate(() => userManagementApi.deletePermission(permission.id))} size="sm" variant="danger">
                              {copy.delete}
                            </Button>
                          </PermissionGate>
                        ) : (
                          <Badge tone="dark">{copy.system}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        ) : null}
      </ModuleShell>
    </AdminLayout>
  );
}
