"use client";

import { useQuery } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import StatsCards from "@/components/admin/StatsCards";
import { getAdminDetailedStats } from "@/lib/api";
import type { DetailedStats } from "@/types/admin";

/**
 * 관리자 데이터 현황.
 *
 * 세션 401: "오래된 데이터 정리"(비활성 매물 물리삭제) 카드를 **제거**했다. 사장님 결정.
 * 근거 — prod 실측(2026-09-13):
 *   · 기본값 90일로 한 번 누르면 934,258건(전체 매물의 63%)이 **3초 만에** 영구 삭제된다
 *     (무제한 DELETE 실측 2.55s·2.88s — 8초 statement_timeout 이 막아주지 못한다).
 *   · 대상 93만 건은 **전부 2026년 생성분**이고, 그중 466,530건은 상세 수집까지 끝난 것이라
 *     네이버에서 이미 내려간 매물이라 재수집이 원리적으로 불가능하다.
 *   · **7,076개 단지는 지우는 순간 가격 근거가 0 이 된다**(시세이력 없음 + 살아있는 매물 없음 +
 *     complexes 집계 3필드 전부 NULL). 반포주공1단지·잠실주공5단지·고덕래미안힐스테이트 등
 *     재건축 대단지가 여기 포함된다.
 *   · 되돌리는 유일한 경로가 Supabase 프로젝트 전체 롤백(mibunyang 데이터 동반)이다.
 *   · 그런데 `audit_logs` 의 `admin_data_cleanup` 이력은 **0건** — 만들어진 뒤 한 번도 눌린 적이 없다.
 * ⇒ 쓰지 않는데 누르면 재앙인 버튼이라, 안전장치를 붙이는 대신 제거하는 쪽을 택했다.
 *
 * 서버 엔드포인트(`DELETE /api/admin/data/stale`)도 함께 제거했다 — 화면만 지우면
 * 토큰으로 직접 호출하는 경로가 남는다.
 * `admin-labels.ts` 의 `admin_data_cleanup` 라벨은 **유지**한다(과거 감사 로그 표시용).
 */
export default function AdminDataPage() {
  const { token } = useTokenReady();

  const statsQuery = useQuery<DetailedStats, Error>({
    queryKey: queryKeys.admin.stats(),
    queryFn: () => getAdminDetailedStats(token),
    enabled: !!token,
    staleTime: 30_000,
  });

  const error = statsQuery.error?.message ?? "";

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">데이터 관리</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>
      )}

      <StatsCards stats={statsQuery.data ?? null} loading={statsQuery.isLoading} />
    </>
  );
}
