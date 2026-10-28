import Link from "next/link";
import { formatKoreanPrice } from "@/lib/format";
import { formatDistance } from "@/lib/subway-format";
import {
  REGION_PAGES_ENABLED,
  complexPath,
  dongPagePath,
  regionHubPath,
} from "@/lib/seo/complex-page";
import { priceRangeText, wonToManwon } from "@/components/complex/consumer/consumer-format";
import type { PublicSummary, PublicSummaryCard } from "@/types/public-summary";

/** 이름 옆 작은 글씨 — 거리(있으면) · 대표 면적 최근 6개월 범위, 없으면 공시가격 */
export function nearbyNote(c: PublicSummaryCard): string | null {
  const price =
    c.recent6_min != null && c.recent6_max != null
      ? `최근 6개월 ${priceRangeText(c.recent6_min, c.recent6_max)}`
      : c.official_price != null
        ? `공시가격 ${formatKoreanPrice(wonToManwon(c.official_price))}`
        : null;
  const dist = c.distance_m != null ? formatDistance(c.distance_m) : null;
  const parts = [dist, price].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * 가까운 단지 / 같은 동(없으면 같은 시군구) 다른 단지 — 최대 12 링크(서버가 그림, 세션 483 PR 3b · 결정 25·27).
 * nearby_scope "near" = 백엔드가 이 단지에서 가까운 순으로 고른 것(단지마다 목록이 달라 같은 동 단지끼리 글이 겹치지 않게) ·
 * "dong"/"sigungu" = 좌표 없는 단지의 대체. 순서 = 백엔드가 준 그대로(화면에서 다시 정렬하지 않는다).
 * 거리(distance_m)가 없는 옛 응답이면 거리만 빼고 그린다(배포 순서 안전). "전체 보기"는 지역 페이지가 열린 뒤에만 링크.
 */
export default function NearbyComplexes({
  summary: s,
  regionPages = REGION_PAGES_ENABLED,
}: {
  summary: PublicSummary;
  regionPages?: boolean;
}) {
  const list = (s.nearby ?? []).slice(0, 12);
  const bc = s.breadcrumb;
  if (list.length === 0 || !bc) return null;
  const near = s.nearby_scope === "near";
  const place = s.nearby_scope === "sigungu" ? bc.sigungu_name : bc.dong_name;
  const title = near ? "가까운 단지" : place ? `${place} 다른 단지` : "가까운 다른 단지";
  // 범위가 시군구면 허브 · 동이면 동 페이지, 동 페이지가 없는 동은 허브 안 그 동 묶음(앵커, v2 O3)
  const hub = regionHubPath(bc.sigungu_code);
  const allHref =
    s.nearby_scope === "sigungu" ? hub : bc.dong_has_page ? dongPagePath(bc.sigungu_code, bc.dong_code) : `${hub}#${bc.dong_code}`;

  return (
    <section aria-labelledby="nearby-complexes" className="space-y-2" data-testid="nearby-complexes">
      <h2 id="nearby-complexes" className="text-sm font-bold text-gray-900">{title}</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {list.map((c) => {
          const note = nearbyNote(c);
          return (
            <li key={c.complex_no} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
              {/* 미리 받기 끔 — 화면에 들어온 링크마다 그 단지 장을 서버에서 그리게 되면 열쇠 통(분당 300)이 넘친다(맹점🟠1) */}
              <Link href={complexPath(c.complex_no)} prefetch={false} className="text-sm font-medium text-blue-700 hover:underline">
                {c.name}
              </Link>
              {note && <span className="block text-xs text-gray-500">{note}</span>}
            </li>
          );
        })}
      </ul>
      {regionPages ? (
        <p className="text-xs text-gray-500">
          {/* 미리 받기 끔 — 단지 장을 열 때마다 허브·동 장을 미리 그리게 되면 서버 렌더가 몇 배(v2 O3) */}
          <Link href={allHref} prefetch={false} className="text-blue-700 hover:underline">
            {place ?? "이 지역"} 단지 전체({s.nearby_total}곳) 보기
          </Link>
        </p>
      ) : (
        // 지역 페이지가 열리기 전: 같은 동·시군구 대체 목록만 몇 곳 중 몇 곳인지 적는다(가까운 순은 범위가 동이 아니라 숫자를 안 붙인다)
        !near && (
          <p className="text-xs text-gray-500">
            {place ?? "이 지역"} 자료 있는 다른 단지 {s.nearby_total}곳 중 {list.length}곳
          </p>
        )
      )}
    </section>
  );
}
