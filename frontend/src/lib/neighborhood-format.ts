/**
 * "이 동네는" 줄 문구 (순수 함수 — DOM·네트워크 의존 0).
 *
 * ComplexBasicInfo 의 동네 통계 섹션 줄을 만든다. kapt-format.ts 와 같은 이유로 분리했다 —
 * null 칸 생략 규칙과 재해 줄 분기를 컴포넌트 렌더 없이 확인하기 위함.
 *
 * ⚠ 비율(%)은 서버가 원래 값에서 한 번만 반올림해 내려준다 — 여기서 다시 반올림하지 않는다
 * (이중 반올림 방지). 나이만 소수 1자리로 표기한다.
 */
import type { NeighborhoodDisaster, NeighborhoodInfo } from "@/types";

/** [라벨, 값, 보조텍스트?] — ComplexBasicInfo 의 rows 와 같은 모양 */
export type NeighborhoodRow = [string, string, string?];

function joinParts(parts: (string | null)[]): string | null {
  const kept = parts.filter((p): p is string => p !== null);
  return kept.length > 0 ? kept.join(" · ") : null;
}

/** 영향 구역 한 종류 문구 — 사람 수가 없으면 뒤 꼬리를 뗀다 */
function affectedText(name: string, d: NeighborhoodDisaster): string {
  const head = `동네 안에 ${name} 구역 있음`;
  if (d.pop == null || d.pop_total == null) return head;
  return `${head} — 동네 ${d.pop_total.toLocaleString()}명 중 ${d.pop.toLocaleString()}명`;
}

/**
 * 홍수·산사태 줄 값.
 * - 하나라도 영향 있음 → 영향 있는 것마다 문구를 ` · ` 로 잇는다
 * - 둘 다 영향 없음 → `위험지도 영향 구역 아님`
 * - 그 밖(둘 다 모름, 하나는 모름·하나는 없음) → null(줄 생략 — 모르는 쪽을 '아님'으로 말하지 않는다)
 */
export function formatDisaster(
  flood: NeighborhoodDisaster | null,
  landslide: NeighborhoodDisaster | null,
): string | null {
  const affected: string[] = [];
  if (flood?.affected) affected.push(affectedText("홍수위험", flood));
  if (landslide?.affected) affected.push(affectedText("산사태위험", landslide));
  if (affected.length > 0) return affected.join(" · ");
  if (flood && landslide) return "위험지도 영향 구역 아님";
  return null;
}

/** 동네 통계 줄 목록 — 값이 없는 줄은 생략한다 */
export function buildNeighborhoodRows(n: NeighborhoodInfo): NeighborhoodRow[] {
  const rows: NeighborhoodRow[] = [];

  const people = joinParts([
    n.population != null ? `${n.population.toLocaleString()}명` : null,
    n.avg_age != null ? `평균 ${n.avg_age.toFixed(1)}세` : null,
  ]);
  if (people) rows.push(["사는 사람", people]);

  if (n.one_person_pct != null) {
    const sub =
      n.households != null && n.one_person_households != null
        ? `${n.households.toLocaleString()}가구 중 ${n.one_person_households.toLocaleString()}가구`
        : undefined;
    rows.push(["1인가구", `${n.one_person_pct}%`, sub]);
  }

  if (n.house_mix) {
    const m = n.house_mix;
    rows.push([
      "집 종류",
      `아파트 ${m.apt_pct}% · 오피스텔 ${m.officetel_pct}% · 다세대 ${m.row_pct}% · 단독 ${m.detached_pct}%`,
    ]);
  }

  if (n.old_house_pct != null) {
    rows.push(["오래된 집", `${n.old_house_cutoff} 지은 집 ${n.old_house_pct}%`]);
  }

  const work = joinParts([
    n.corp_cnt != null ? `사업체 ${n.corp_cnt.toLocaleString()}곳` : null,
    n.worker_cnt != null ? `일하는 사람 ${n.worker_cnt.toLocaleString()}명` : null,
  ]);
  if (work) rows.push(["일터", work]);

  const disaster = formatDisaster(n.flood, n.landslide);
  if (disaster) rows.push(["홍수·산사태", disaster]);

  return rows;
}

/**
 * 출처 줄 — `출처: 국가데이터처 통계지리정보 센서스 2024 (역삼1동 기준), 홍수·산사태 위험지도 2025`.
 * 동 이름은 첫 번째 출처(센서스) 뒤에 붙인다. 이름이 없으면 붙이지 않는다.
 */
export function formatNeighborhoodSource(source: string, emdNm: string | null): string {
  if (!emdNm) return `출처: ${source}`;
  const tag = ` (${emdNm} 기준)`;
  const idx = source.indexOf(", ");
  return idx >= 0
    ? `출처: ${source.slice(0, idx)}${tag}${source.slice(idx)}`
    : `출처: ${source}${tag}`;
}
