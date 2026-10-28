import Link from "next/link";
import { formatKoreanPrice } from "@/lib/format";
import { complexPath } from "@/lib/seo/complex-page";
import { gradeLabel } from "@/lib/seo/region-page";
import { priceRangeText, wonToManwon } from "@/components/complex/consumer/consumer-format";
import type { RegionComplexCard } from "@/types/region-pages";

/** 대표 면적 최근 6개월 실거래 범위 칸 — "84㎡ 6억 4,600만~7억 4,000만", 면적을 모르면 범위만, 범위가 없으면 null */
export function recentRangeText(c: RegionComplexCard): string | null {
  if (c.recent6_min == null || c.recent6_max == null) return null;
  const range = priceRangeText(c.recent6_min, c.recent6_max);
  return c.rep_area_key != null ? `${c.rep_area_key}㎡ ${range}` : range;
}

/** 사실 배지 색 — 글자는 gradeLabel 한 곳(등급 글자 A/B/C 는 화면에 안 보인다, 결정 33) */
const BADGE_CLASS: Record<RegionComplexCard["grade"], string> = {
  A: "border-blue-200 bg-blue-50 text-blue-800",
  B: "border-gray-200 bg-gray-50 text-gray-700",
  C: "",
};

/**
 * 지역 장의 단지 표(서버가 그림, 세션 484 PR 3c-1b) — 단지·세대·[준공]·대표 면적 최근 6개월·공시가격·사실 배지.
 * 행 전체를 링크로 감싸지 않는다(web-rules: tr 을 Link 로 감싸면 hydration 오류) — 단지 이름만 링크.
 * 링크는 미리 받기 끔(prefetch false — 화면에 들어온 링크마다 단지 장을 서버에서 그리게 되면 열쇠 통이 넘친다, v2 O3).
 */
export default function ComplexTable({
  complexes,
  caption,
  showYear = false,
}: {
  complexes: RegionComplexCard[];
  caption: string;
  showYear?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[560px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">단지</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">세대</th>
            {showYear && <th scope="col" className="px-3 py-2 text-right font-medium">준공</th>}
            <th scope="col" className="px-3 py-2 text-left font-medium">대표 면적 최근 6개월 실거래</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">공시가격</th>
            <th scope="col" className="px-3 py-2 text-left font-medium">자료</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {complexes.map((c) => {
            const badge = gradeLabel(c.grade);
            return (
              <tr key={c.complex_no}>
                {/* 단지 이름 = 행 머리(화면 읽기 프로그램이 칸마다 단지 이름을 같이 읽게) */}
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <Link href={complexPath(c.complex_no)} prefetch={false} className="font-medium text-blue-700 hover:underline">
                    {c.name}
                  </Link>
                </th>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c.household_count != null ? `${c.household_count.toLocaleString()}세대` : "—"}
                </td>
                {showYear && (
                  <td className="px-3 py-2 text-right tabular-nums">{c.use_approve_year != null ? `${c.use_approve_year}년` : "—"}</td>
                )}
                <td className="px-3 py-2">{recentRangeText(c) ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c.official_price != null ? formatKoreanPrice(wonToManwon(c.official_price)) : "—"}
                </td>
                <td className="px-3 py-2">
                  {/* 글자가 빈 등급(C — 공공 자료 없음)은 배지를 그리지 않는다(결정 38) */}
                  {badge && (
                    <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${BADGE_CLASS[c.grade]}`}>
                      {badge}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
