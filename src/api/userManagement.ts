import { httpClient } from "./httpClient";

export type PaginatedData<TItem> = {
  list: TItem[];
  total: number;
  page: number;
  page_size: number;
};

export type PermissionType = "api" | "button" | "menu" | "page";

export type PermissionPayload = {
  id: number;
  name: string;
  code: string;
  type: PermissionType | string;
  module: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type RolePayload = {
  id: number;
  name: string;
  code: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  permissions: PermissionPayload[];
};

export type UserRolePayload = {
  id: number;
  roleId: number;
  code: string;
  name: string;
  scopeType: string | null;
  scopeId: number | null;
};

export type UserPayload = {
  id: number;
  email: string;
  phone: string | null;
  username: string;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  roleAssignments: UserRolePayload[];
  roles: string[];
};

export type PermissionTreePayload = {
  modules: Array<{
    module: string;
    children: Array<{
      type: string;
      permissions: PermissionPayload[];
    }>;
  }>;
};

export const userManagementApi = {
  listUsers(query: { isActive?: boolean; keyword?: string; page?: number; pageSize?: number } = {}) {
    return httpClient.request<PaginatedData<UserPayload>>("/users", { query });
  },

  createUser(body: {
    avatarUrl?: string | null;
    email: string;
    isActive?: boolean;
    password: string;
    phone?: string | null;
    username: string;
  }) {
    return httpClient.request<UserPayload>("/users", {
      body,
      method: "POST"
    });
  },

  updateUser(id: number, body: { avatarUrl?: string | null; email?: string; phone?: string | null; username?: string }) {
    return httpClient.request<UserPayload>(`/users/${id}`, {
      body,
      method: "PATCH"
    });
  },

  enableUser(id: number) {
    return httpClient.request<UserPayload>(`/users/${id}/enable`, { method: "POST" });
  },

  disableUser(id: number) {
    return httpClient.request<UserPayload>(`/users/${id}/disable`, { method: "POST" });
  },

  deleteUser(id: number) {
    return httpClient.request<Record<string, never>>(`/users/${id}`, { method: "DELETE" });
  },

  assignUserRoles(id: number, roles: Array<{ roleId: number; scopeId?: number | null; scopeType?: string | null }>) {
    return httpClient.request<UserPayload>(`/users/${id}/roles`, {
      body: { roles },
      method: "PUT"
    });
  },

  listRoles(query: { keyword?: string; page?: number; pageSize?: number } = {}) {
    return httpClient.request<PaginatedData<RolePayload>>("/roles", { query });
  },

  createRole(body: { code: string; description?: string | null; name: string }) {
    return httpClient.request<RolePayload>("/roles", {
      body,
      method: "POST"
    });
  },

  updateRole(id: number, body: { code?: string; description?: string | null; name?: string }) {
    return httpClient.request<RolePayload>(`/roles/${id}`, {
      body,
      method: "PATCH"
    });
  },

  deleteRole(id: number) {
    return httpClient.request<Record<string, never>>(`/roles/${id}`, { method: "DELETE" });
  },

  assignRolePermissions(id: number, permissionIds: number[]) {
    return httpClient.request<RolePayload>(`/roles/${id}/permissions`, {
      body: { permissionIds },
      method: "PUT"
    });
  },

  listPermissions(query: { keyword?: string; module?: string; page?: number; pageSize?: number; type?: PermissionType } = {}) {
    return httpClient.request<PaginatedData<PermissionPayload>>("/permissions", { query });
  },

  getPermissionTree() {
    return httpClient.request<PermissionTreePayload>("/permissions/tree");
  },

  createPermission(body: { code: string; description?: string | null; module: string; name: string; type: PermissionType }) {
    return httpClient.request<PermissionPayload>("/permissions", {
      body,
      method: "POST"
    });
  },

  updatePermission(id: number, body: { code?: string; description?: string | null; module?: string; name?: string; type?: PermissionType }) {
    return httpClient.request<PermissionPayload>(`/permissions/${id}`, {
      body,
      method: "PATCH"
    });
  },

  deletePermission(id: number) {
    return httpClient.request<Record<string, never>>(`/permissions/${id}`, { method: "DELETE" });
  }
};
