import { httpClient } from "./httpClient";

export type AffiliateAllianceStatus = "active" | "suspended" | "closed";
export type AffiliateAllianceMemberRole = "owner" | "partner" | "subordinate";
export type AffiliateAllianceInvitationRole = "partner" | "subordinate";
export type AffiliateAllianceInvitationStatus = "pending" | "accepted" | "rejected" | "expired";

export interface AffiliateAlliancePublicPerson {
  needoId: string;
  displayName: string;
  avatarUrl: string | null;
}

export type AffiliateAlliancePermissions = {
  canClaimTasks: boolean;
  canViewAllianceOverview: boolean;
  canViewMemberDetails: boolean;
  canManageOwnSubordinates: boolean;
  canViewAllianceWallet: boolean;
};

export type AffiliateAlliance = {
  allianceId: number;
  name: string;
  description: string | null;
  status: AffiliateAllianceStatus;
  version: number;
  defaultPromoterShareBps: number;
  owner: AffiliateAlliancePublicPerson;
  membership: {
    memberId: number;
    role: AffiliateAllianceMemberRole;
    managerNeedoId: string | null;
    promoterShareBpsOverride: number | null;
    permissions: AffiliateAlliancePermissions;
  };
  wallet: {
    currency: "NDP";
    availableBalance: number;
    frozenBalance: number;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type AffiliateAllianceMineResponse = {
  alliance: AffiliateAlliance | null;
};

export type AffiliateAllianceCreatedResponse = {
  alliance: AffiliateAlliance;
};

export type AffiliateAllianceCreateInput = {
  name: string;
  description?: string | null;
  defaultPromoterShareBps: number;
};

export interface AffiliateAllianceMember {
  memberId: number;
  person: AffiliateAlliancePublicPerson;
  role: AffiliateAllianceMemberRole;
  parent: {
    memberId: number;
    person: AffiliateAlliancePublicPerson;
  } | null;
  promoterShareBpsOverride: number | null;
  permissions: AffiliateAlliancePermissions;
  joinedAt: string;
}

export interface AffiliateAllianceInvitation {
  invitationId: number;
  alliance: {
    allianceId: number;
    name: string;
  };
  inviter: AffiliateAlliancePublicPerson;
  invitee: AffiliateAlliancePublicPerson;
  role: AffiliateAllianceInvitationRole;
  proposedParent: {
    memberId: number;
    person: AffiliateAlliancePublicPerson;
  } | null;
  status: AffiliateAllianceInvitationStatus;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
}

export interface AffiliateAlliancePage<TItem> {
  list: TItem[];
  total: number;
  page: number;
  page_size: number;
}

export type AffiliateAllianceInvitationCreateInput =
  | {
      inviteeNeedoId: string;
      role: "partner";
      proposedParentMemberId?: null;
    }
  | {
      inviteeNeedoId: string;
      role: "subordinate";
      proposedParentMemberId: number;
    };

export type AffiliateAllianceInvitationCreatedResponse = {
  invitation: AffiliateAllianceInvitation;
};

export type AffiliateAllianceInvitationAcceptedResponse = {
  invitation: AffiliateAllianceInvitation;
  member: AffiliateAllianceMember;
};

export type AffiliateAllianceListOptions = {
  page?: number;
  pageSize?: number;
  q?: string;
  signal?: AbortSignal;
};

export type AffiliateAllianceInvitationListOptions = {
  page?: number;
  pageSize?: number;
  status?: AffiliateAllianceInvitationStatus;
  signal?: AbortSignal;
};

type AffiliateAllianceRequestOptions = {
  signal?: AbortSignal;
};

function appendListQuery(
  path: string,
  options: AffiliateAllianceListOptions | AffiliateAllianceInvitationListOptions
) {
  const parameters = new URLSearchParams();
  if (options.page !== undefined) parameters.set("page", String(options.page));
  if (options.pageSize !== undefined) parameters.set("pageSize", String(options.pageSize));
  if ("q" in options && options.q) parameters.set("q", options.q);
  if ("status" in options && options.status) parameters.set("status", options.status);
  const query = parameters.toString();
  return query ? `${path}?${query}` : path;
}

function signalRequestOptions(options: AffiliateAllianceRequestOptions) {
  return options.signal ? { signal: options.signal } : undefined;
}

function requestWithSignal<TData>(path: string, options: AffiliateAllianceRequestOptions) {
  const requestOptions = signalRequestOptions(options);
  return requestOptions
    ? httpClient.request<TData>(path, requestOptions)
    : httpClient.request<TData>(path);
}

export const affiliateAllianceApi = {
  getMine(options: AffiliateAllianceRequestOptions = {}) {
    return requestWithSignal<AffiliateAllianceMineResponse>("/affiliate/alliances/me", options);
  },
  create(body: AffiliateAllianceCreateInput, options: AffiliateAllianceRequestOptions = {}) {
    return httpClient.request<AffiliateAllianceCreatedResponse>("/affiliate/alliances", {
      method: "POST",
      body,
      ...(signalRequestOptions(options) ?? {})
    });
  },
  listMembers(options: AffiliateAllianceListOptions = {}) {
    return requestWithSignal<AffiliateAlliancePage<AffiliateAllianceMember>>(
      appendListQuery("/affiliate/alliances/me/members", options),
      options
    );
  },
  listEligibleContacts(options: AffiliateAllianceListOptions = {}) {
    return requestWithSignal<AffiliateAlliancePage<AffiliateAlliancePublicPerson>>(
      appendListQuery("/affiliate/alliances/me/eligible-contacts", options),
      options
    );
  },
  listSentInvitations(options: AffiliateAllianceInvitationListOptions = {}) {
    return requestWithSignal<AffiliateAlliancePage<AffiliateAllianceInvitation>>(
      appendListQuery("/affiliate/alliances/me/invitations", options),
      options
    );
  },
  createInvitation(
    body: AffiliateAllianceInvitationCreateInput,
    options: AffiliateAllianceRequestOptions = {}
  ) {
    return httpClient.request<AffiliateAllianceInvitationCreatedResponse>(
      "/affiliate/alliances/me/invitations",
      { method: "POST", body, ...(signalRequestOptions(options) ?? {}) }
    );
  },
  listReceivedInvitations(options: AffiliateAllianceInvitationListOptions = {}) {
    return requestWithSignal<AffiliateAlliancePage<AffiliateAllianceInvitation>>(
      appendListQuery("/affiliate/alliance-invitations/mine", options),
      options
    );
  },
  acceptInvitation(invitationId: number, options: AffiliateAllianceRequestOptions = {}) {
    return httpClient.request<AffiliateAllianceInvitationAcceptedResponse>(
      `/affiliate/alliance-invitations/${invitationId}/accept`,
      { method: "POST", body: {}, ...(signalRequestOptions(options) ?? {}) }
    );
  },
  rejectInvitation(invitationId: number, options: AffiliateAllianceRequestOptions = {}) {
    return httpClient.request<AffiliateAllianceInvitationCreatedResponse>(
      `/affiliate/alliance-invitations/${invitationId}/reject`,
      { method: "POST", body: {}, ...(signalRequestOptions(options) ?? {}) }
    );
  }
};
