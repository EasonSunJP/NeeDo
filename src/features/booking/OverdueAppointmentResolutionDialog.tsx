import { Button } from "../../components/ui/Button";
import { useI18n } from "../../i18n/I18nProvider";
import type {
  OverdueAppointmentBlock,
  OverdueAppointmentResolutionKind
} from "./api";

type Props = {
  appointment: OverdueAppointmentBlock;
  pending: boolean;
  onResolve: (resolution: OverdueAppointmentResolutionKind) => void;
};

const copy = {
  zh: {
    title: "请先处理过期预约",
    description: "开始当前服务前，请确认以下预约的实际结果。首个有效选择会写入正式记录。",
    completed: "实际已完成",
    customerNoShow: "客户未到店",
    technicianNoShow: "技师未到店"
  },
  "zh-Hant": {
    title: "請先處理逾期預約",
    description: "開始目前服務前，請確認以下預約的實際結果。第一個有效選擇會寫入正式記錄。",
    completed: "實際已完成",
    customerNoShow: "客戶未到店",
    technicianNoShow: "技師未到店"
  },
  ja: {
    title: "期限超過の予約を先に処理してください",
    description: "現在のサービスを開始する前に、次の予約結果を確認してください。最初の有効な選択が正式記録になります。",
    completed: "実際に完了済み",
    customerNoShow: "お客様が来店しなかった",
    technicianNoShow: "施術者が来店しなかった"
  },
  en: {
    title: "Resolve the overdue booking first",
    description: "Confirm the actual outcome below before starting this service. The first valid choice becomes the formal record.",
    completed: "Actually completed",
    customerNoShow: "Customer no-show",
    technicianNoShow: "Technician no-show"
  },
  ko: {
    title: "기한이 지난 예약을 먼저 처리하세요",
    description: "현재 서비스를 시작하기 전에 아래 예약의 실제 결과를 확인하세요. 첫 번째 유효한 선택이 정식 기록으로 저장됩니다.",
    completed: "실제로 완료됨",
    customerNoShow: "고객 미방문",
    technicianNoShow: "테라피스트 미방문"
  }
} as const;

export function OverdueAppointmentResolutionDialog({ appointment, pending, onResolve }: Props) {
  const { language } = useI18n();
  const text = copy[language];
  const startsAt = new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(appointment.startsAt));

  return (
    <div aria-labelledby="overdue-appointment-title" aria-modal="true" className="fixed inset-0 z-[120] grid place-items-center bg-black/50 p-4" role="dialog">
      <section className="w-full max-w-md rounded-[24px] bg-[color:var(--client-surface,#fff)] p-5 shadow-2xl">
        <h2 className="text-lg font-black" id="overdue-appointment-title">{text.title}</h2>
        <p className="mt-2 text-sm font-semibold text-[color:var(--client-muted)]">{text.description}</p>
        <div className="mt-4 rounded-[18px] bg-[color:var(--client-elevated)] p-4">
          <p className="font-black">{appointment.serviceName}</p>
          <p className="mt-1 text-sm font-semibold text-[color:var(--client-muted)]">{startsAt}</p>
          <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{appointment.orderNo}</p>
        </div>
        <div className="mt-4 grid gap-2">
          <Button disabled={pending} onClick={() => onResolve("actually_completed")}>{text.completed}</Button>
          <Button disabled={pending} onClick={() => onResolve("customer_no_show")} variant="danger">{text.customerNoShow}</Button>
          <Button disabled={pending} onClick={() => onResolve("technician_no_show")} variant="danger">{text.technicianNoShow}</Button>
        </div>
      </section>
    </div>
  );
}
