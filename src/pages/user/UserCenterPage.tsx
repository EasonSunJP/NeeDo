import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { IconButton, floatingHeaderControlButtonClassName } from "../../components/client-ui/AppScaffold";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { SectionTitle } from "../../components/mobile/SectionTitle";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { KycVerifiedBadge } from "../../components/ui/KycVerifiedBadge";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { reviews, stores, userStories } from "../../data/mock";
import { readImageFileAsDataUrl } from "../../lib/imageUpload";
import { cn } from "../../lib/utils";
import { CustomerMembershipBadge } from "../../shared/profile-card";
import { getCustomerLevelLabel, resolveCustomerMembership } from "../../shared/profile-card/customerMembership";
import { formatCustomerCreditReviewCount, formatCustomerCreditScore, formatCustomerGenderLabel } from "../../shared/profile-card/customerProfileLabels";
import { updateCustomerEntity, updateTechnicianEntity, useEntityStore } from "../../state/entityStore";
import type { Customer, Technician } from "../../types/domain";

const orderShortcuts = [
  { label: "待付款", count: 1, to: "/orders" },
  { label: "待服务", count: 3, to: "/orders" },
  { label: "进行中", count: 2, to: "/orders" },
  { label: "已完成", count: 18, to: "/orders" },
  { label: "已取消", count: 1, to: "/orders" }
];

const accountSettings = [
  { label: "账号设置", caption: "手机号、邮箱、登录密码", to: "/me/settings/account" },
  { label: "支付方式", caption: "银行卡、PayPay、现金", to: "/me/settings/account" },
  { label: "发票记录", caption: "企业抬头与历史发票", to: "/me/settings/account" },
  { label: "通知设置", caption: "订单、营销、客服提醒", to: "/me/settings/notifications" },
  { label: "隐私与安全", caption: "登录设备、数据授权", to: "/me/settings/account" },
  { label: "联系客服", caption: "退款、改期、投诉风控", to: "/support" }
];

const topBarButtonClassName =
  floatingHeaderControlButtonClassName;
const pagePanelClassName =
  "rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.05)]";
const pageInnerCardClassName =
  "rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_70%,transparent)]";
const profileToastClassName =
  "rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,var(--client-bg))] px-4 py-3 text-center text-xs font-black text-[color:var(--client-primary-strong)] shadow-[0_18px_42px_rgba(0,0,0,0.26)] backdrop-blur-xl";
const avatarCropDialogClassName =
  "max-h-[calc(100dvh-48px)] w-full max-w-[360px] overflow-y-auto rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-primary)_26%,var(--client-line))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-bg)_92%,var(--client-primary)_8%),var(--client-bg))] p-4 text-[color:var(--client-text)] shadow-[0_28px_68px_rgba(0,0,0,0.42)]";
const avatarCropSecondaryButtonClassName =
  "border-[color:color-mix(in_srgb,var(--client-line)_78%,var(--client-primary)_10%)] bg-[color:color-mix(in_srgb,var(--client-bg)_88%,var(--client-primary)_12%)] text-[color:var(--client-text)]";
const avatarCropPrimaryButtonClassName =
  "border-[color:color-mix(in_srgb,var(--client-primary)_72%,var(--client-line))] bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-[0_14px_28px_color-mix(in_srgb,var(--client-primary)_18%,transparent)]";
const avatarCropFrameClassName =
  "relative h-[240px] w-[240px] touch-none overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-primary)_58%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-bg)_82%,var(--client-primary)_18%)] shadow-[0_18px_36px_rgba(0,0,0,0.24)] ring-1 ring-[color:color-mix(in_srgb,var(--client-primary)_28%,transparent)]";
const userProfileLanguageOptions = ["日本語", "中文", "English", "한국어", "ไทย", "Tiếng Việt", "Español"];
const userProfileGenderOptions: Array<{ label: string; value: NonNullable<Customer["gender"]> }> = [
  { label: "女", value: "female" },
  { label: "男", value: "male" }
];
type UserProfileDraft = {
  avatar: string;
  nickname: string;
  gender: NonNullable<Customer["gender"]>;
  age: string;
  height: string;
  languages: string[];
  bio: string;
};
type AvatarCropDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};
type AvatarCropState = {
  source: string;
  scale: number;
  offsetX: number;
  offsetY: number;
  naturalWidth: number;
  naturalHeight: number;
  drag?: AvatarCropDrag;
};
const avatarCropFrameSize = 240;
const avatarCropOutputSize = 512;
const userProfileNameMaxCharacters = 13;
const userProfileNameMaxBytes = 26;

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getAvatarCropBaseScale(crop: AvatarCropState) {
  if (crop.naturalWidth <= 0 || crop.naturalHeight <= 0) {
    return 1;
  }

  return Math.max(avatarCropFrameSize / crop.naturalWidth, avatarCropFrameSize / crop.naturalHeight);
}

function clampAvatarCrop(crop: AvatarCropState): AvatarCropState {
  if (crop.naturalWidth <= 0 || crop.naturalHeight <= 0) {
    return crop;
  }

  const baseScale = getAvatarCropBaseScale(crop);
  const displayWidth = crop.naturalWidth * baseScale * crop.scale;
  const displayHeight = crop.naturalHeight * baseScale * crop.scale;
  const maxOffsetX = Math.max(0, (displayWidth - avatarCropFrameSize) / 2);
  const maxOffsetY = Math.max(0, (displayHeight - avatarCropFrameSize) / 2);

  return {
    ...crop,
    offsetX: clampNumber(crop.offsetX, -maxOffsetX, maxOffsetX),
    offsetY: clampNumber(crop.offsetY, -maxOffsetY, maxOffsetY)
  };
}

function loadCropImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load avatar image."));
    image.src = source;
  });
}

async function createCroppedAvatarDataUrl(crop: AvatarCropState) {
  const image = await loadCropImage(crop.source);
  const baseScale = getAvatarCropBaseScale({
    ...crop,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight
  });
  const effectiveScale = baseScale * crop.scale;
  const sourceSize = avatarCropFrameSize / effectiveScale;
  const centerX = image.naturalWidth / 2 - crop.offsetX / effectiveScale;
  const centerY = image.naturalHeight / 2 - crop.offsetY / effectiveScale;
  const sourceX = clampNumber(centerX - sourceSize / 2, 0, Math.max(0, image.naturalWidth - sourceSize));
  const sourceY = clampNumber(centerY - sourceSize / 2, 0, Math.max(0, image.naturalHeight - sourceSize));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = avatarCropOutputSize;
  canvas.height = avatarCropOutputSize;

  if (!context) {
    return crop.source;
  }

  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, avatarCropOutputSize, avatarCropOutputSize);
  return canvas.toDataURL("image/jpeg", 0.84);
}

function getMembershipSurfaceClassNames(kind?: string) {
  if (kind === "black") {
    return {
      shell: "border-[#4d3b19]/80 bg-[radial-gradient(circle_at_top_left,rgba(247,216,132,0.26),transparent_34%),linear-gradient(145deg,#1a1714,#050505_58%,#0f0c09)] text-white",
      panel: "border-[#f3cf785c] bg-[#17130f]/82",
      metric: "border-[#f3cf784d] bg-white/[0.07]",
      chip: "border-[#f3cf7866] bg-[#f3cf781f] text-[#f9dd8c]",
      avatar: "border-[#f3cf7899] ring-1 ring-[#f3cf7866]",
      muted: "text-[#f7ead0]/62",
      label: "text-[#f7ead0]/52",
      accent: "text-[#f3cf78]",
      divider: "bg-[#f3cf7833]"
    };
  }

  if (kind === "diamond") {
    return {
      shell: "border-[#a7d7ff66] bg-[radial-gradient(circle_at_top_left,rgba(178,224,255,0.30),transparent_34%),linear-gradient(145deg,#102033,#06101e_58%,#071626)] text-white",
      panel: "border-[#b5e1ff5c] bg-white/[0.07]",
      metric: "border-[#b5e1ff4d] bg-white/[0.08]",
      chip: "border-[#b5e1ff66] bg-[#b5e1ff1f] text-[#ccecff]",
      avatar: "border-[#b5e1ff99] ring-1 ring-[#b5e1ff66]",
      muted: "text-[#d9edff]/64",
      label: "text-[#d9edff]/54",
      accent: "text-[#b5e1ff]",
      divider: "bg-[#b5e1ff38]"
    };
  }

  if (kind === "gold") {
    return {
      shell: "border-[#e7b94b73] bg-[radial-gradient(circle_at_top_left,rgba(255,208,99,0.30),transparent_34%),linear-gradient(145deg,#2a1c0a,#120d08_58%,#191007)] text-white",
      panel: "border-[#f3cf785c] bg-white/[0.07]",
      metric: "border-[#f3cf784d] bg-white/[0.08]",
      chip: "border-[#f3cf7866] bg-[#f3cf781f] text-[#ffe3a1]",
      avatar: "border-[#f3cf7899] ring-1 ring-[#f3cf7866]",
      muted: "text-[#ffe8ba]/64",
      label: "text-[#ffe8ba]/54",
      accent: "text-[#f3cf78]",
      divider: "bg-[#f3cf7838]"
    };
  }

  return {
    shell: "border-[color:color-mix(in_srgb,var(--client-primary)_28%,transparent)] bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--client-primary)_30%,transparent),transparent_34%),linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_92%,black),color-mix(in_srgb,var(--client-bg)_88%,black))] text-[color:var(--client-text)]",
    panel: "border-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)] bg-white/[0.08]",
    metric: "border-[color:color-mix(in_srgb,var(--client-primary)_16%,transparent)] bg-white/[0.08]",
    chip: "border-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]",
    avatar: "border-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)] ring-1 ring-[color:color-mix(in_srgb,var(--client-primary)_30%,transparent)]",
    muted: "text-[color:var(--client-muted)]",
    label: "text-[color:var(--client-muted)]",
    accent: "text-[color:var(--client-primary)]",
    divider: "bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)]"
  };
}

function buildUserProfile(customer: Customer, linkedTechnician?: Technician) {
  return {
    avatar: customer.avatar || linkedTechnician?.avatar || "",
    nickname: customer.nickname?.trim() || linkedTechnician?.nickname?.trim() || customer.name,
    age: customer.age?.trim() || linkedTechnician?.age?.trim() || "",
    height: customer.height?.trim() || linkedTechnician?.height?.trim() || "",
    gender: formatCustomerGenderLabel(customer.gender ?? linkedTechnician?.gender),
    languages: customer.languages?.length ? [...customer.languages] : linkedTechnician?.languages?.length ? [...linkedTechnician.languages] : ["日本語"],
    bio:
      customer.bio?.trim() ||
      linkedTechnician?.bio?.trim() ||
      "可在这里补充你的语言偏好、常用预约习惯和其他说明，方便门店与技师更准确地理解你的需求。"
  };
}

function getUserProfileNameByteLength(value: string) {
  return Array.from(value).reduce((sum, character) => sum + (/^[\x00-\x7F]$/.test(character) ? 1 : 2), 0);
}

function getUserProfileNameEditorWidth(value: string) {
  const visualUnits = Array.from(value.trim() || "Mia").reduce((sum, character) => sum + (/^[\x00-\x7F]$/.test(character) ? 0.62 : 1), 0);

  return `${clampNumber(visualUnits + 0.85, 3.2, 14)}em`;
}

function limitUserProfileName(value: string) {
  let nextValue = "";
  let nextBytes = 0;

  for (const character of Array.from(value.replace(/[\r\n]+/g, " "))) {
    const characterBytes = getUserProfileNameByteLength(character);

    if (Array.from(nextValue).length >= userProfileNameMaxCharacters || nextBytes + characterBytes > userProfileNameMaxBytes) {
      break;
    }

    nextValue += character;
    nextBytes += characterBytes;
  }

  return nextValue;
}

function getUserProfileDisplayName(customer: Customer, linkedTechnician?: Technician, draft?: UserProfileDraft | null, savedPreview?: UserProfileDraft | null) {
  return (
    draft?.nickname.trim() ||
    savedPreview?.nickname.trim() ||
    customer.nickname?.trim() ||
    linkedTechnician?.nickname?.trim() ||
    customer.name
  );
}

function formatUserHeightInput(value?: string) {
  return (value ?? "").trim().replace(/\s*(cm|厘米|センチ|㎝)$/i, "").trim();
}

function normalizeUserHeightForStorage(value: string) {
  const height = formatUserHeightInput(value);

  if (!height) {
    return "";
  }

  return /^\d+(?:\.\d+)?$/.test(height) ? `${height}cm` : height;
}

function buildUserProfileDraft(customer: Customer, linkedTechnician?: Technician): UserProfileDraft {
  const profile = buildUserProfile(customer, linkedTechnician);

  return {
    avatar: profile.avatar,
    nickname: profile.nickname,
    gender: customer.gender ?? linkedTechnician?.gender ?? "private",
    age: profile.age,
    height: formatUserHeightInput(profile.height),
    languages: profile.languages,
    bio: profile.bio
  };
}

function readProfileFieldValue<T extends HTMLInputElement | HTMLTextAreaElement>(field: string, fallback: string) {
  if (typeof document === "undefined") {
    return fallback;
  }

  return document.querySelector<T>(`[data-profile-field="${field}"]`)?.value ?? fallback;
}

function AvatarCropEditor({
  crop,
  onApply,
  onCancel,
  onChange
}: {
  crop: AvatarCropState;
  onApply: () => void;
  onCancel: () => void;
  onChange: (crop: AvatarCropState) => void;
}) {
  const baseScale = getAvatarCropBaseScale(crop);
  const imageWidth = crop.naturalWidth > 0 ? crop.naturalWidth * baseScale : avatarCropFrameSize;
  const imageHeight = crop.naturalHeight > 0 ? crop.naturalHeight * baseScale : avatarCropFrameSize;
  const imageStyle = {
    height: `${imageHeight}px`,
    transform: `translate(-50%, -50%) translate(${crop.offsetX}px, ${crop.offsetY}px) scale(${crop.scale})`,
    width: `${imageWidth}px`
  };
  const updateCrop = (nextCrop: AvatarCropState) => onChange(clampAvatarCrop(nextCrop));
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onChange({
      ...crop,
      drag: {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: crop.offsetX,
        originY: crop.offsetY
      }
    });
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!crop.drag || crop.drag.pointerId !== event.pointerId) {
      return;
    }

    updateCrop({
      ...crop,
      offsetX: crop.drag.originX + event.clientX - crop.drag.startX,
      offsetY: crop.drag.originY + event.clientY - crop.drag.startY
    });
  };
  const clearDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (crop.drag?.pointerId === event.pointerId) {
      onChange({ ...crop, drag: undefined });
    }
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/68 px-4 py-[calc(env(safe-area-inset-top)+24px)] backdrop-blur-sm"
      role="dialog"
    >
      <div className={avatarCropDialogClassName}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black">头像裁剪</p>
            <p className="mt-1 text-xs font-bold leading-5 text-[color:var(--client-muted)]">拖动图片调整位置，用滑块放大缩小。保存后会按圆角正方形头像框显示。</p>
          </div>
          <button className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-black", avatarCropSecondaryButtonClassName)} onClick={onCancel} type="button">
            关闭
          </button>
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="shrink-0">
            <div
              className={avatarCropFrameClassName}
              onPointerCancel={clearDrag}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={clearDrag}
            >
              <img
                alt="头像裁剪预览"
                className="absolute left-1/2 top-1/2 max-w-none select-none object-cover"
                draggable={false}
                onLoad={(event) => {
                  updateCrop({
                    ...crop,
                    naturalHeight: event.currentTarget.naturalHeight,
                    naturalWidth: event.currentTarget.naturalWidth
                  });
                }}
                src={crop.source}
                style={imageStyle}
              />
              <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-2 ring-inset ring-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)]" />
              <div className="pointer-events-none absolute inset-x-1/3 top-0 h-full border-x border-[color:color-mix(in_srgb,var(--client-text)_32%,transparent)]" />
              <div className="pointer-events-none absolute inset-y-1/3 left-0 w-full border-y border-[color:color-mix(in_srgb,var(--client-text)_32%,transparent)]" />
            </div>
          </div>
          <div className="w-full min-w-0 space-y-3">
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">缩放</span>
              <input
                className="w-full accent-[color:var(--client-primary)]"
                max="3"
                min="1"
                onChange={(event) => updateCrop({ ...crop, scale: Number(event.target.value) })}
                step="0.01"
                type="range"
                value={crop.scale}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button className={cn("rounded-[18px] border px-4 py-3 text-sm font-black", avatarCropSecondaryButtonClassName)} onClick={onCancel} type="button">
                取消裁剪
              </button>
              <button className={cn("rounded-[18px] border px-4 py-3 text-sm font-black", avatarCropPrimaryButtonClassName)} onClick={onApply} type="button">
                套用头像
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UserCenterPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { customers, technicians } = useEntityStore();
  const currentCustomer = customers.find((customer) => customer.id === session?.linkedCustomerId) ?? customers[0];
  const linkedTechnician = technicians.find((technician) => technician.id === session?.linkedTechnicianId);
  const userProfile = useMemo(() => buildUserProfile(currentCustomer, linkedTechnician), [currentCustomer, linkedTechnician]);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<UserProfileDraft | null>(null);
  const [savedProfilePreview, setSavedProfilePreview] = useState<UserProfileDraft | null>(null);
  const [profileNameOverride, setProfileNameOverride] = useState("");
  const [avatarCrop, setAvatarCrop] = useState<AvatarCropState | null>(null);
  const [profileToastMessage, setProfileToastMessage] = useState("");
  const visibleProfile = profileDraft
    ? {
        avatar: profileDraft.avatar,
        nickname: profileDraft.nickname,
        age: profileDraft.age,
        height: profileDraft.height,
        gender: formatCustomerGenderLabel(profileDraft.gender),
        languages: profileDraft.languages,
        bio: profileDraft.bio
      }
    : savedProfilePreview
      ? {
          avatar: savedProfilePreview.avatar,
          nickname: savedProfilePreview.nickname,
          age: savedProfilePreview.age,
          height: savedProfilePreview.height,
          gender: formatCustomerGenderLabel(savedProfilePreview.gender),
          languages: savedProfilePreview.languages,
          bio: savedProfilePreview.bio
        }
      : userProfile;
  const displayName = limitUserProfileName(profileNameOverride.trim() || getUserProfileDisplayName(currentCustomer, linkedTechnician, profileDraft, savedProfilePreview));
  const profileNameEditorWidth = getUserProfileNameEditorWidth(profileNameOverride || displayName);
  const points = currentCustomer.points ?? 18420;
  const usageCount = currentCustomer.orderCount;
  const creditScore = formatCustomerCreditScore(currentCustomer);
  const creditReviewLabel = formatCustomerCreditReviewCount(currentCustomer);
  const membership = resolveCustomerMembership(currentCustomer.memberLevel);
  const levelLabel = getCustomerLevelLabel(currentCustomer.activeScore);
  const membershipSurface = getMembershipSurfaceClassNames(membership.kind);
  const nicknameInputRef = useRef<HTMLTextAreaElement>(null);
  const ageInputRef = useRef<HTMLInputElement>(null);
  const heightInputRef = useRef<HTMLInputElement>(null);
  const bioInputRef = useRef<HTMLTextAreaElement>(null);
  const serviceTools = [
    { label: "我的收藏", caption: "店铺、技师、服务", value: stores.length, to: "/categories?type=store" },
    { label: "我的地址", caption: "家庭、公司、常用地址", value: 4, to: "/checkout/svc-clean-1" },
    { label: "我的评价", caption: "已评价与待回复", value: reviews.length, to: "/me" },
    { label: "周期预约", caption: "保洁、护理、家电维护", value: 2, to: "/categories?type=service" },
    { label: "家庭成员", caption: "老人、儿童、共同居住人", value: 3, to: "/me" }
  ];
  const startProfileEdit = () => {
    const nextDraft = savedProfilePreview ?? buildUserProfileDraft(currentCustomer, linkedTechnician);
    const limitedDraft = {
      ...nextDraft,
      nickname: limitUserProfileName(nextDraft.nickname)
    };

    setProfileDraft(limitedDraft);
    setProfileNameOverride(limitedDraft.nickname);
    setAvatarCrop(null);
    setProfileToastMessage("");
    setIsEditingProfile(true);
  };
  const cancelProfileEdit = () => {
    setIsEditingProfile(false);
    setProfileDraft(null);
    setProfileNameOverride(savedProfilePreview?.nickname ?? "");
    setAvatarCrop(null);
    setProfileToastMessage("");
  };
  const updateProfileDraft = (patch: Partial<UserProfileDraft>) => {
    const nextPatch = typeof patch.nickname === "string" ? { ...patch, nickname: limitUserProfileName(patch.nickname) } : patch;

    if (typeof nextPatch.nickname === "string") {
      setProfileNameOverride(nextPatch.nickname);
    }

    setProfileDraft((current) => (current ? { ...current, ...nextPatch } : current));
  };
  const toggleProfileLanguage = (language: string) => {
    setProfileDraft((current) => {
      if (!current) {
        return current;
      }

      const languages = current.languages.includes(language)
        ? current.languages.filter((item) => item !== language)
        : [...current.languages, language];

      return { ...current, languages: languages.length > 0 ? languages : [language] };
    });
  };
  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setAvatarCrop({
      source: await readImageFileAsDataUrl(file, { maxDimension: 1800, maxStoredBytes: 1_200_000 }),
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      naturalWidth: 0,
      naturalHeight: 0
    });
    setProfileToastMessage("");
  };
  const applyAvatarCrop = async () => {
    if (!avatarCrop) {
      return;
    }

    updateProfileDraft({ avatar: await createCroppedAvatarDataUrl(avatarCrop) });
    setAvatarCrop(null);
    setProfileToastMessage("头像裁剪已套用，点击保存后生效。");
  };
  useEffect(() => {
    if (!profileToastMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setProfileToastMessage(""), 2400);
    return () => window.clearTimeout(timer);
  }, [profileToastMessage]);
  const saveProfileEdit = () => {
    if (!profileDraft) {
      return;
    }

    const nicknameValue = limitUserProfileName(profileNameOverride || readProfileFieldValue<HTMLTextAreaElement>("nickname", nicknameInputRef.current?.value ?? profileDraft.nickname));
    const ageValue = readProfileFieldValue<HTMLInputElement>("age", ageInputRef.current?.value ?? profileDraft.age);
    const heightValue = readProfileFieldValue<HTMLInputElement>("height", heightInputRef.current?.value ?? profileDraft.height);
    const bioValue = readProfileFieldValue<HTMLTextAreaElement>("bio", bioInputRef.current?.value ?? profileDraft.bio);
    const nextProfile = {
      avatar: profileDraft.avatar.trim() || currentCustomer.avatar,
      nickname: nicknameValue.trim() || currentCustomer.name,
      gender: profileDraft.gender,
      age: ageValue.trim(),
      height: normalizeUserHeightForStorage(heightValue),
      languages: profileDraft.languages,
      bio: bioValue.trim()
    };
    const nextPreview: UserProfileDraft = {
      avatar: nextProfile.avatar,
      nickname: nextProfile.nickname,
      gender: nextProfile.gender,
      age: nextProfile.age,
      height: nextProfile.height,
      languages: [...nextProfile.languages],
      bio: nextProfile.bio
    };

    const customerPersisted = updateCustomerEntity(currentCustomer.id, nextProfile);
    let technicianPersisted = true;

    if (linkedTechnician) {
      technicianPersisted = updateTechnicianEntity(linkedTechnician.id, {
        avatar: nextProfile.avatar,
        nickname: nextProfile.nickname,
        age: nextProfile.age,
        height: nextProfile.height,
        languages: [...nextProfile.languages],
        bio: nextProfile.bio
      });
    }

    setSavedProfilePreview(nextPreview);
    setProfileNameOverride(nextProfile.nickname);
    setIsEditingProfile(false);
    setProfileDraft(null);
    setAvatarCrop(null);
    setProfileToastMessage(
      customerPersisted && technicianPersisted
        ? "基础信息已保存。"
        : "已在当前页面更新，但浏览器本地保存失败，请缩小头像后重试。"
    );
  };

  return (
    <MobileShell navPanelStyle="plain" showTopEdgeMask={false}>
      <MobileFullscreenPage
        className="!z-20"
        innerClassName="bg-[radial-gradient(circle_at_top,rgba(60,136,126,0.14),transparent_34%),linear-gradient(180deg,color-mix(in_srgb,var(--client-bg)_94%,transparent),var(--client-bg))]"
      >
        <header className="safe-header-top relative z-50 shrink-0 border-b border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:var(--client-bg)] px-4 pb-3 text-[color:var(--client-text)]">
          <IconButton
            className={`${topBarButtonClassName} absolute left-4 top-[calc(env(safe-area-inset-top)+12px)]`}
            icon="back"
            label="返回"
            onClick={() => navigate("/", { replace: true })}
          />
          <IconButton
            className={`${topBarButtonClassName} absolute right-4 top-[calc(env(safe-area-inset-top)+12px)]`}
            icon="settings"
            label="打开设置中心"
            to="/me/settings"
          />
          <div className="min-h-12 px-[56px] pt-0.5">
            <TitleWithInfo
              as="h1"
              info="账号资料、订单入口与服务权益都统一收在这里。"
              label="个人中心说明"
              title="个人中心"
              titleClassName="truncate text-base font-black"
              variant="client"
            />
          </div>
        </header>

        <main className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(132px+env(safe-area-inset-bottom))]">
          {profileToastMessage ? (
            <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+76px)] z-[90] flex justify-center px-6">
              <div className={profileToastClassName}>
                {profileToastMessage}
              </div>
            </div>
          ) : null}
          <div className="space-y-4">
            <section className={cn("overflow-hidden rounded-[28px] border p-4 shadow-soft", membershipSurface.shell)}>
              <div className="relative">
                <IconButton
                  className={cn("absolute right-0 top-0 z-10 text-white shadow-[0_14px_30px_rgba(0,0,0,0.22)]", membershipSurface.metric)}
                  icon="edit"
                  label={isEditingProfile ? "收起编辑" : "编辑资料"}
                  onClick={isEditingProfile ? cancelProfileEdit : startProfileEdit}
                />
                <div className="flex min-w-0 items-start gap-3">
                  <div className="shrink-0">
                    <div className="relative h-36 w-36">
                      <AvatarImage
                        alt="用户头像"
                        className={cn("h-36 w-36 rounded-[28px] border-[3px] shadow-[0_18px_36px_rgba(0,0,0,0.28)]", membershipSurface.avatar)}
                        src={visibleProfile.avatar}
                      />
                      {isEditingProfile ? (
                        <>
                          <input accept="image/*" className="hidden" onChange={handleAvatarUpload} ref={avatarInputRef} type="file" />
                          <IconButton
                            className={cn(
                              "absolute bottom-2 right-2 h-10 w-10 border-[2px] text-white shadow-[0_12px_26px_rgba(0,0,0,0.34)]",
                              membershipSurface.metric
                            )}
                            icon="edit"
                            label="更换头像"
                            onClick={() => avatarInputRef.current?.click()}
                          />
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="min-w-0 max-w-[calc(100%-44px)]">
                      {isEditingProfile && profileDraft ? (
                        <div className="flex min-w-0 items-start gap-1.5">
                          <textarea
                            aria-label="昵称"
                            autoFocus
                            className="-ml-0.5 -mt-1 max-h-[84px] min-h-[38px] max-w-[calc(100%-22px)] flex-none resize-none overflow-hidden break-all rounded-none border-0 bg-transparent px-0.5 py-1 text-[21px] font-black leading-tight shadow-none outline-none [appearance:none] [overflow-wrap:anywhere]"
                            data-profile-field="nickname"
                            onChange={(event) => updateProfileDraft({ nickname: event.currentTarget.value })}
                            onInput={(event) => updateProfileDraft({ nickname: event.currentTarget.value })}
                            ref={nicknameInputRef}
                            rows={3}
                            style={{ width: profileNameEditorWidth }}
                            value={profileNameOverride}
                          />
                          <KycVerifiedBadge className="mt-1.5" size="label" />
                        </div>
                      ) : (
                        <h1 className="max-w-full overflow-hidden break-all text-[21px] font-black leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] [overflow-wrap:anywhere]">
                          {displayName}
                          <KycVerifiedBadge className="ml-1 inline-flex align-middle" size="label" />
                        </h1>
                      )}
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                      <span className="inline-flex h-7 shrink-0 items-center gap-1 text-[11px] font-black">
                        <CustomerMembershipBadge
                          className="h-6 w-6"
                          fallbackClassName="hidden"
                          imageClassName="h-6 w-6"
                          level={currentCustomer.memberLevel}
                          showFallback={false}
                        />
                      </span>
                      <span className={cn("inline-flex h-7 shrink-0 items-center text-[11px] font-black", membershipSurface.muted)}>
                        {levelLabel}
                      </span>
                    </div>
                    <p className={cn("truncate text-xs font-bold", membershipSurface.muted)}>ID {currentCustomer.systemId}</p>
                  </div>
                </div>

                {avatarCrop ? (
                  <AvatarCropEditor
                    crop={avatarCrop}
                    onApply={applyAvatarCrop}
                    onCancel={() => setAvatarCrop(null)}
                    onChange={setAvatarCrop}
                  />
                ) : null}

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { label: "积分", value: points.toLocaleString("en-US") },
                    { label: "利用次数", value: `${usageCount}` },
                    { label: "信用值", value: creditScore, suffix: "/5" }
                  ].map((item) => (
                    <div className={cn("rounded-[18px] border p-3", membershipSurface.metric)} key={item.label}>
                      <p className={cn("text-xs font-bold", membershipSurface.label)}>{item.label}</p>
                      <div className="mt-1 flex min-w-0 items-end gap-1">
                        <strong className={cn("block text-[20px] leading-none", item.label === "信用值" ? membershipSurface.accent : "")}>{item.value}</strong>
                        {item.suffix ? <span className={cn("pb-0.5 text-xs font-black leading-none", membershipSurface.muted)}>{item.suffix}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
                <p className={cn("mt-1 pr-2 text-right text-[10px] font-black leading-none", membershipSurface.muted)}>信用值 {creditReviewLabel}</p>

                <div className={cn("my-4 h-px", membershipSurface.divider)} />

                <div>
                  <h2 className="text-lg font-black">基础信息</h2>
                  {isEditingProfile && profileDraft ? (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div className={cn("rounded-[18px] border p-3", membershipSurface.panel)}>
                          <p className={cn("text-xs font-bold", membershipSurface.label)}>性别</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {userProfileGenderOptions.map((option) => (
                              <button
                                className={cn(
                                  "rounded-full border px-2.5 py-1 text-xs font-black",
                                  profileDraft.gender === option.value ? membershipSurface.chip : membershipSurface.metric
                                )}
                                key={option.value}
                                onClick={() => updateProfileDraft({ gender: option.value })}
                                type="button"
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <label className={cn("block rounded-[18px] border p-3", membershipSurface.panel)}>
                          <span className={cn("block text-xs font-bold", membershipSurface.label)}>年龄</span>
                          <input
                            className="mt-1 h-9 w-full bg-transparent text-sm font-black outline-none"
                            data-profile-field="age"
                            defaultValue={profileDraft.age}
                            onChange={(event) => updateProfileDraft({ age: event.currentTarget.value })}
                            onInput={(event) => updateProfileDraft({ age: event.currentTarget.value })}
                            ref={ageInputRef}
                          />
                        </label>
                        <label className={cn("block rounded-[18px] border p-3", membershipSurface.panel)}>
                          <span className={cn("block text-xs font-bold", membershipSurface.label)}>身高（cm）</span>
                          <input
                            className="mt-1 h-9 w-full bg-transparent text-sm font-black outline-none"
                            data-profile-field="height"
                            defaultValue={profileDraft.height}
                            inputMode="decimal"
                            onChange={(event) => updateProfileDraft({ height: formatUserHeightInput(event.currentTarget.value) })}
                            onInput={(event) => updateProfileDraft({ height: formatUserHeightInput(event.currentTarget.value) })}
                            ref={heightInputRef}
                          />
                        </label>
                      </div>
                      <div className={cn("rounded-[18px] border p-3", membershipSurface.panel)}>
                        <p className={cn("text-xs font-bold", membershipSurface.label)}>语言能力</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {userProfileLanguageOptions.map((language) => (
                            <button
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-xs font-black",
                                profileDraft.languages.includes(language) ? membershipSurface.chip : membershipSurface.metric
                              )}
                              key={language}
                              onClick={() => toggleProfileLanguage(language)}
                              type="button"
                            >
                              {language}
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className={cn("block overflow-hidden rounded-[24px] border px-5 py-4", membershipSurface.panel)}>
                        <span className={cn("block text-xs font-bold", membershipSurface.label)}>自我介绍</span>
                        <textarea
                          className="mt-2 min-h-[132px] w-full resize-none bg-transparent text-sm font-bold leading-6 outline-none"
                          data-profile-field="bio"
                          defaultValue={profileDraft.bio}
                          onChange={(event) => updateProfileDraft({ bio: event.currentTarget.value })}
                          onInput={(event) => updateProfileDraft({ bio: event.currentTarget.value })}
                          ref={bioInputRef}
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button className={cn("rounded-[18px] border px-4 py-3 text-sm font-black", membershipSurface.metric)} onClick={cancelProfileEdit} type="button">
                          取消
                        </button>
                        <button className={cn("rounded-[18px] border px-4 py-3 text-sm font-black", membershipSurface.chip)} onClick={saveProfileEdit} type="button">
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {[
                          ["性别", visibleProfile.gender],
                          ["年龄", visibleProfile.age || "未设置"],
                          ["身高（cm）", formatUserHeightInput(visibleProfile.height) || "未设置"]
                        ].map(([label, value]) => (
                          <div className={cn("rounded-[18px] border p-3", membershipSurface.panel)} key={label}>
                            <p className={cn("text-xs font-bold", membershipSurface.label)}>{label}</p>
                            <strong className="mt-1 block truncate text-sm">{value}</strong>
                          </div>
                        ))}
                      </div>
                      <div className={cn("mt-3 rounded-[18px] border p-3", membershipSurface.panel)}>
                        <p className={cn("text-xs font-bold", membershipSurface.label)}>语言能力</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {visibleProfile.languages.map((language) => (
                            <span className={cn("rounded-full border px-2.5 py-1 text-xs font-black", membershipSurface.chip)} key={language}>
                              {language}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className={cn("mt-3 overflow-hidden rounded-[24px] border px-5 py-4", membershipSurface.panel)}>
                        <p className={cn("text-xs font-bold", membershipSurface.label)}>自我介绍</p>
                        <p className={cn("mt-2 text-sm leading-6", membershipSurface.muted)}>{visibleProfile.bio}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>

            <section className={pagePanelClassName}>
              <div className="flex items-center justify-between">
                <h2 className="font-black">我的订单</h2>
                <Link className="text-sm font-bold text-moss" to="/orders">
                  全部订单
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {orderShortcuts.map((item) => (
                  <Link className={cn(pageInnerCardClassName, "px-1 py-3 text-center text-xs font-bold text-ink/70")} key={item.label} to={item.to}>
                    <strong className="block text-base text-ink">{item.count}</strong>
                    {item.label}
                  </Link>
                ))}
              </div>
              <Link className={cn(pageInnerCardClassName, "mt-3 flex items-center justify-between px-3 py-3")} to="/orders">
                <div>
                  <strong className="text-sm">预约一览</strong>
                  <p className="mt-1 text-xs text-ink/50">查看全部预约、订单状态和详情跳转</p>
                </div>
                <span className="text-lg font-black text-ink/25">›</span>
              </Link>
            </section>

            <section className="grid grid-cols-2 gap-3">
              {serviceTools.map((entry) => (
                <Link className={pagePanelClassName} key={entry.label} to={entry.to}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black">{entry.label}</h3>
                      <p className="mt-2 text-xs leading-5 text-ink/50">{entry.caption}</p>
                    </div>
                    <span className="rounded-md bg-mint/20 px-2 py-1 text-xs font-black text-moss">{entry.value}</span>
                  </div>
                </Link>
              ))}
            </section>

            <section className={pagePanelClassName}>
              <h2 className="font-black">账号与服务</h2>
              <div className="mt-3 grid gap-2">
                {accountSettings.map((entry) => (
                  <Link className={cn(pageInnerCardClassName, "flex items-center justify-between px-3 py-3")} key={entry.label} to={entry.to}>
                    <div>
                      <strong className="text-sm">{entry.label}</strong>
                      <p className="mt-1 text-xs text-ink/50">{entry.caption}</p>
                    </div>
                    <span className="text-sm font-black text-ink/35">›</span>
                  </Link>
                ))}
              </div>
            </section>

            <section>
              <SectionTitle caption="来自保洁、门店预约与宠物服务的真实使用场景" title="近期用户反馈" />
              <div className="space-y-3">
                {userStories.map((story) => (
                  <article className={pagePanelClassName} key={story.name}>
                    <div className="flex items-start gap-3">
                      <AvatarImage
                        alt={`${story.name}头像`}
                        className="h-12 w-12 shrink-0 border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] shadow-[0_12px_24px_rgba(0,0,0,0.16)]"
                        src={story.avatar}
                      />
                      <div className="min-w-0">
                        <h3 className="font-black">{story.name}</h3>
                        <p className="mt-1 text-xs text-ink/50">
                          {story.city} · {story.service}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-ink/65">{story.content}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </main>
      </MobileFullscreenPage>
    </MobileShell>
  );
}
