import type { KeyboardEvent } from "react";
import type { MerchantAffiliateTask } from "../../api/merchantAffiliateTasks";
import type { MerchantAffiliateTaskCopy } from "../../pages/merchant-admin/merchantAffiliateTaskCopy";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { HorizontalScrollArea } from "../../components/ui/HorizontalScrollArea";

type MerchantAffiliateTaskTableProps = {
  copy: MerchantAffiliateTaskCopy;
  rows: MerchantAffiliateTask[];
  onSelect: (taskId: number) => void;
};

const statusTone = (status: MerchantAffiliateTask["status"]): BadgeTone => {
  if (status === "active") return "green";
  if (status === "rejected" || status === "cancelled") return "red";
  if (status === "pending_review" || status === "scheduled") return "yellow";
  if (status === "paused" || status === "budget_exhausted") return "blue";
  return "neutral";
};

const formatNdp = (value: number, locale: string): string =>
  `${value.toLocaleString(locale)} NDP`;

const formatDateTime = (value: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));

const currentContentLocale = (task: MerchantAffiliateTask): string =>
  Object.entries(task.translations).find(([, translation]) => translation?.name === task.name)?.[0] ??
  "—";

export function MerchantAffiliateTaskTable({
  copy,
  rows,
  onSelect
}: MerchantAffiliateTaskTableProps) {
  const selectWithKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, taskId: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(taskId);
    }
  };

  return (
    <HorizontalScrollArea ariaLabel={copy.title} className="rounded-xl border border-line bg-white shadow-panel">
      <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
        <thead className="bg-paper text-[11px] font-black uppercase tracking-[0.08em] text-ink/45">
          <tr>
            <th className="px-4 py-3">{copy.taskCode}</th>
            <th className="px-4 py-3">{copy.taskName}</th>
            <th className="px-4 py-3">{copy.publisher}</th>
            <th className="px-4 py-3">{copy.shops}</th>
            <th className="px-4 py-3">{copy.status}</th>
            <th className="px-4 py-3">{copy.reward}</th>
            <th className="px-4 py-3">{copy.fee}</th>
            <th className="px-4 py-3">{copy.grossFreeze}</th>
            <th className="px-4 py-3">{copy.window}</th>
            <th className="px-4 py-3">{copy.updatedAt}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((task) => (
            <tr
              aria-label={`${copy.viewTask} ${task.taskCode}`}
              className="cursor-pointer align-top text-ink transition hover:bg-paper/70 focus:bg-paper focus:outline-none"
              data-task-code={task.taskCode}
              key={task.taskCode}
              onClick={() => onSelect(task.id)}
              onKeyDown={(event) => selectWithKeyboard(event, task.id)}
              role="button"
              tabIndex={0}
            >
              <td className="px-4 py-4 font-mono text-xs font-black text-ink">{task.taskCode}</td>
              <td className="max-w-[260px] px-4 py-4">
                <p className="font-black text-ink">{task.name}</p>
                <p className="mt-1 text-[11px] font-bold text-ink/45">
                  {copy.contentLanguage}: {currentContentLocale(task)}
                </p>
              </td>
              <td className="px-4 py-4 font-bold">{task.publisherDisplayName}</td>
              <td className="px-4 py-4">
                <div className="space-y-2">
                  {task.shops.map((shop) => (
                    <div key={shop.publicId}>
                      <p className="font-bold text-ink">{shop.shopNameSnapshot}</p>
                      <span className="mt-1 inline-flex rounded-md border border-moss/25 bg-mint/10 px-2 py-0.5 font-mono text-[11px] font-black text-[#2f6846]">
                        {shop.publicId}
                      </span>
                    </div>
                  ))}
                </div>
              </td>
              <td className="px-4 py-4">
                <Badge tone={statusTone(task.status)}>{copy.statusLabels[task.status]}</Badge>
              </td>
              <td className="px-4 py-4 font-bold">
                {formatNdp(task.rewardNdpPerCompletedOrder, copy.locale)}
              </td>
              <td className="px-4 py-4">
                <p className="font-bold">{task.platformFeeBps / 100}%</p>
                <p className="mt-1 text-xs text-ink/45">
                  {formatNdp(task.platformFeeReserveNdp, copy.locale)}
                </p>
              </td>
              <td className="px-4 py-4 font-black">
                {formatNdp(task.totalBudgetNdp + task.platformFeeReserveNdp, copy.locale)}
              </td>
              <td className="px-4 py-4 text-xs font-bold leading-5 text-ink/65">
                <span className="block">{formatDateTime(task.taskStartsAt, copy.locale)}</span>
                <span className="block">→ {formatDateTime(task.taskEndsAt, copy.locale)}</span>
              </td>
              <td className="px-4 py-4 text-xs font-bold text-ink/55">
                {formatDateTime(task.updatedAt, copy.locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </HorizontalScrollArea>
  );
}
