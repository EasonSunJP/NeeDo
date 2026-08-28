import { httpClient } from "./httpClient";

export type AffiliateChannelPlatform = "x" | "instagram" | "youtube" | "tiktok" | "custom";
export type AffiliateStatus = "active" | "suspended" | "closed";
export type AffiliateCooperationStatus = "available" | "selective" | "unavailable";

export type AffiliateProfileChannel = {
  channelId: number;
  platform: AffiliateChannelPlatform;
  customLabel: string | null;
  homepageUrl: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AffiliateProfile = {
  profileId: number;
  needoId: string;
  displayName: string;
  avatarUrl: string | null;
  affiliateStatus: AffiliateStatus;
  cooperationStatus: AffiliateCooperationStatus;
  version: number;
  bio: string | null;
  strengths: string[];
  serviceAreas: string[];
  channels: AffiliateProfileChannel[];
  updatedAt: string;
};

export type AffiliateProfileUpdateInput = {
  expectedVersion: number;
  bio?: string | null;
  strengths?: string[];
  serviceAreas?: string[];
  cooperationStatus?: AffiliateCooperationStatus;
};

export type AffiliateChannelCreateInput = {
  expectedProfileVersion: number;
  platform: AffiliateChannelPlatform;
  customLabel?: string | null;
  homepageUrl: string;
  sortOrder?: number;
};

export type AffiliateChannelUpdateInput = {
  expectedProfileVersion: number;
  platform?: AffiliateChannelPlatform;
  customLabel?: string | null;
  homepageUrl?: string;
  sortOrder?: number;
};

const channelPath = (channelId: number) =>
  `/affiliate/profile/channels/${encodeURIComponent(String(channelId))}`;

export const affiliateProfileApi = {
  getMine() {
    return httpClient.request<AffiliateProfile>("/affiliate/profile");
  },
  updateMine(body: AffiliateProfileUpdateInput) {
    return httpClient.request<AffiliateProfile>("/affiliate/profile", {
      method: "PATCH",
      body
    });
  },
  createChannel(body: AffiliateChannelCreateInput) {
    return httpClient.request<AffiliateProfile>("/affiliate/profile/channels", {
      method: "POST",
      body
    });
  },
  updateChannel(channelId: number, body: AffiliateChannelUpdateInput) {
    return httpClient.request<AffiliateProfile>(channelPath(channelId), {
      method: "PATCH",
      body
    });
  },
  deleteChannel(channelId: number, expectedProfileVersion: number) {
    return httpClient.request<AffiliateProfile>(channelPath(channelId), {
      method: "DELETE",
      query: { expected_profile_version: expectedProfileVersion }
    });
  }
};
