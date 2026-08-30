import { Link } from "react-router-dom";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import { resolveCustomerMembership } from "../../shared/profile-card/customerMembership";
import type { DirectoryIdentityCard, ImRoleType, ImUser } from "./model";

function identityLabel(card: DirectoryIdentityCard) {
  if (card.entityType === "user") {
    return card.identityLabel
      ? resolveCustomerMembership(card.identityLabel).label
      : "用户";
  }

  if (card.entityType === "technician") {
    return "技师";
  }

  if (card.entityType === "shop") {
    return "店铺";
  }

  return "账号";
}

function genderLabel(value?: string) {
  if (value === "female") return "女性";
  if (value === "male") return "男性";
  if (value === "other") return "其他";
  return value;
}

function profileFields(card: DirectoryIdentityCard) {
  if (card.entityType === "user") {
    return [
      { label: "性别", value: genderLabel(card.gender) ?? "不公开" },
      { label: "年龄", value: card.age === undefined ? "未设置" : String(card.age) },
      {
        label: "身高（cm）",
        value: card.heightCm === undefined ? "未设置" : String(card.heightCm),
      },
    ];
  }

  if (card.entityType === "technician") {
    return [
      {
        label: "从业年限",
        value: card.yearsExperience === undefined
          ? undefined
          : String(card.yearsExperience),
      },
      { label: "服务区域", value: card.serviceArea },
    ];
  }

  if (card.entityType === "shop") {
    return [
      { label: "店铺地址", value: card.serviceArea },
    ];
  }

  return [];
}

export function ConversationIdentityProfileCard({
  detailTo,
  identityCard,
  user,
  viewerScope,
}: {
  detailTo?: string;
  identityCard: DirectoryIdentityCard;
  user: ImUser;
  viewerScope: ImRoleType;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const fields = profileFields(identityCard).filter(
    (field): field is { label: string; value: string } =>
      typeof field.value === "string" && field.value.trim().length > 0,
  );
  const creditValue = identityCard.creditValue;
  const creditText = creditValue === undefined
    ? "—"
    : creditValue.toFixed(1);
  const creditReviewText = identityCard.creditReviewCount > 0
    ? t(`${identityCard.creditReviewCount}人评价`)
    : t("暂无评价");
  const showCreditValue = viewerScope !== "user";
  const header = (
    <div className="flex min-w-0 items-start gap-4">
      <AvatarImage
        alt={identityCard.displayName}
        className="h-24 w-24 shrink-0 rounded-[28px] border-2 border-[color:color-mix(in_srgb,var(--client-primary)_46%,var(--client-line))]"
        src={user.avatar}
      />
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="min-w-0 truncate text-[24px] font-black tracking-[-0.04em] text-[color:var(--client-text)]">
            {identityCard.displayName}
          </h2>
          {identityCard.verified ? (
            <span
              aria-label={t("已认证")}
              className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[color:var(--client-primary)] text-[11px] font-black text-[color:var(--client-primary-contrast)]"
            >
              ✓
            </span>
          ) : null}
        </div>
        <span className="mt-2 inline-flex rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_42%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-3 py-1 text-[11px] font-black text-[color:var(--client-primary)]">
          {t(identityLabel(identityCard))}
        </span>
        <p className="mt-2 truncate text-[13px] font-black text-[color:var(--client-muted)]">
          ID {user.userIdLabel}
        </p>
      </div>
    </div>
  );

  return (
    <section
      className="overflow-hidden rounded-[30px] border border-[color:color-mix(in_srgb,var(--client-primary)_34%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-surface)_92%,var(--client-bg))] p-5 shadow-[0_22px_56px_color-mix(in_srgb,var(--client-shadow)_22%,transparent)]"
      data-profile-card="conversation-identity"
    >
      {detailTo ? (
        <Link className="focus-ring block rounded-[24px]" to={detailTo}>
          {header}
        </Link>
      ) : header}

      {showCreditValue ? (
        <div className="mt-4 rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-primary)_32%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-primary)_9%,var(--client-surface))] px-4 py-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black text-[color:var(--client-muted)]">{t("信用值")}</p>
              <div className="mt-1 flex items-end gap-1">
                <strong className="text-[28px] font-black leading-none text-[color:var(--client-primary)]">
                  {creditText}
                </strong>
                {creditValue === undefined ? null : (
                  <span className="pb-0.5 text-xs font-black text-[color:var(--client-muted)]">/5</span>
                )}
              </div>
            </div>
            <p className="pb-0.5 text-right text-[11px] font-black text-[color:var(--client-muted)]">
              {creditReviewText}
            </p>
          </div>
        </div>
      ) : null}

      <div className={cn(showCreditValue ? "my-5" : "mt-5 mb-5", "h-px bg-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)]")} />

      <div>
        <h3 className="text-[18px] font-black text-[color:var(--client-text)]">{t("基础信息")}</h3>
        {fields.length > 0 ? (
          <div
            className={cn(
              "mt-3 grid gap-2",
              identityCard.entityType === "user"
                ? "grid-cols-3"
                : fields.length > 1
                  ? "grid-cols-2"
                  : "grid-cols-1",
            )}
          >
            {fields.map((field) => (
              <div
                className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_54%,var(--client-surface))] p-3"
                key={field.label}
              >
                <p className="text-xs font-bold text-[color:var(--client-muted)]">{t(field.label)}</p>
                <strong className="mt-1 block text-sm text-[color:var(--client-text)]">{t(field.value)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm font-semibold text-[color:var(--client-muted)]">
            {t("暂无资料")}
          </p>
        )}

        {identityCard.languages.length > 0 ? (
          <div className="mt-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_54%,var(--client-surface))] p-3">
            <p className="text-xs font-bold text-[color:var(--client-muted)]">{t("语言能力")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {identityCard.languages.map((item) => (
                <span
                  className="rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_44%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-3 py-1 text-xs font-black text-[color:var(--client-primary)]"
                  key={item}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {identityCard.bio ? (
          <div className="mt-3 rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_54%,var(--client-surface))] px-4 py-4">
            <p className="text-xs font-bold text-[color:var(--client-muted)]">{t("自我介绍")}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">
              {identityCard.bio}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
