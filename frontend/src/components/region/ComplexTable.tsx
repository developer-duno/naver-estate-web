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

/** 범위가 없을 때 그 칸 글자(T6 · 세션 526 B40 PR 2b — 옛 「—」) */
export const NO_RECENT_TEXT = "최근 6개월 거래 없음";

/**
 * 지역 장의 단지 표(서버가 그림, 세션 484 PR 3c-1b · 세션 526 B40 PR 2b 두 모양) — 단지·세대·[준공]·대표 면적 최근 6개월·공시가격·사실 배지.
 * 마크업은 표 하나(값을 두 번 쓰지 않는다): 1280 = 표 / 390 = 줄 쌓기(1줄 단지 이름 + 오른쪽 배지 · 2줄 값들) — 가로 스크롤 0.
 * 모양·색·390 이름표(「최근 6개월」「공시가격」)·가운데 점은 전부 `src/app/globals.css` 의 `.region-table` 규칙 한 곳이 정한다
 * (칸마다 클래스를 붙이면 동 46곳 허브 HTML 이 35% 커졌다 — 세션 526 실측). 마크업에 남는 표시는 범위 있는 칸 `data-r` · 배지 `data-g` 둘뿐.
 * 줄 쌓기에서도 읽기 프로그램이 표로 읽게 role 을 직접 단다(맹점 검토 10). 빈 값은 빈칸(390 은 조각째 생략) · 범위 없음만 글자(T6·T7).
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
    <div className="overflow-x-auto">
      <table role="table" className="region-table">
        <caption className="sr-only">{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col">단지</th>
            <th role="columnheader" scope="col">세대</th>
            {showYear && <th role="columnheader" scope="col">준공</th>}
            <th role="columnheader" scope="col">대표 면적 최근 6개월 실거래</th>
            <th role="columnheader" scope="col">공시가격</th>
            <th role="columnheader" scope="col">자료</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {complexes.map((c) => {
            const range = recentRangeText(c);
            const price = c.recent6_min != null && c.recent6_max != null ? priceRangeText(c.recent6_min, c.recent6_max) : null;
            const badge = gradeLabel(c.grade);
            return (
              <tr key={c.complex_no} role="row">
                {/* 단지 이름 = 행 머리(화면 읽기 프로그램이 칸마다 단지 이름을 같이 읽게) */}
                <th role="rowheader" scope="row">
                  <Link href={complexPath(c.complex_no)} prefetch={false}>
                    {c.name}
                  </Link>
                </th>
                <td role="cell">{c.household_count != null ? `${c.household_count.toLocaleString()}세대` : null}</td>
                {showYear && <td role="cell">{c.use_approve_year != null ? `${c.use_approve_year}년` : null}</td>}
                {/* 가격 범위는 한 덩어리(줄이 가격 가운데서 안 끊기게 — globals.css .region-table) · 글자는 recentRangeText 와 같다 */}
                <td role="cell" data-r={range ? "" : undefined}>
                  {price ? (
                    <>
                      {c.rep_area_key != null ? `${c.rep_area_key}㎡ ` : null}
                      <span>{price}</span>
                    </>
                  ) : (
                    NO_RECENT_TEXT
                  )}
                </td>
                <td role="cell">{c.official_price != null ? formatKoreanPrice(wonToManwon(c.official_price)) : null}</td>
                {/* 글자가 빈 등급(C — 공공 자료 없음)은 배지를 그리지 않는다(결정 38) */}
                <td role="cell">{badge ? <span data-g={c.grade}>{badge}</span> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
