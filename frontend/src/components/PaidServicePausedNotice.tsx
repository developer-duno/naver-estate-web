import { isPaidServicePaused } from "@/lib/locked-paths";

/**
 * 약관·환불정책 상단에 붙는 "지금은 무료 운영 중" 현황 고지.
 *
 * 두 문서는 유료 구독을 전제로 쓰여 있는데 결제를 잠근 동안에는 그 설명이 현재 사실과
 * 어긋난다(실측 2026-09-14: 결제 완료 0건·유효 구독자 0명·빌링키 0건). 본문을 고치는 대신
 * 현황 한 줄을 덧붙여, 읽는 사람이 "지금 돈을 내야 하나"를 오해하지 않게 한다.
 *
 * 유료를 재개하면 `LOCKED_PATHS` 에서 `/pricing` 이 빠지고 이 배너는 **스스로 사라진다**
 * — 지우는 것을 따로 기억할 필요가 없다(`isPaidServicePaused` 주석 참조).
 */
export default function PaidServicePausedNotice() {
  if (!isPaidServicePaused()) return null;

  return (
    <div
      role="note"
      className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100"
    >
      <p className="font-semibold">지금은 무료로 운영 중입니다.</p>
      <p className="mt-1 leading-relaxed text-blue-800 dark:text-blue-200">
        아래 유료 구독·결제·환불에 관한 내용은 <strong>새로 결제하는 경우에</strong> 적용되며,
        결제 기능을 다시 열기 전까지는 적용되지 않습니다. 이미 결제하신 건이 있다면 그 건에는
        아래 내용이 그대로 적용됩니다.
      </p>
    </div>
  );
}
