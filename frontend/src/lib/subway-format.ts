/**
 * 인근 지하철역 표시 문자열 포맷 (순수 함수 — DOM·네트워크 의존 0).
 *
 * ComplexBasicInfo 의 "가까운 지하철" 행 값을 만든다. 순수 함수로 분리한 이유는
 * 역명 suffix·거리 표기 경계(999/1000)를 컴포넌트 렌더 없이 단위 테스트하기 위함.
 */

import type { SubwayStationNear } from "@/types";

/**
 * 역명에 "역" 접미사를 붙인다. 이미 "역"으로 끝나면 그대로 둔다.
 * (BE 원본이 "강남" 처럼 접미사 없이 오기도, "강남역" 처럼 붙어 오기도 한다)
 */
export function formatStationName(name: string): string {
  return name.endsWith("역") ? name : `${name}역`;
}

/**
 * 거리 표기 — 1000m 미만은 `NNNm`, 1000m 이상은 `N.Nkm`.
 * 기존 관례 답습 (MbInfraOverlay.tsx:69 · metric-bar-configs.ts:98 동일 기준).
 */
export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

/**
 * 표시용 노선명 정규화 — 운영 모드 단어만 규칙적으로 제거한다.
 *
 * BE line_name 원본에 "서울 도시철도 9호선"·"인천지하철 1호선" 처럼 장황한 표기가 섞여
 * 있어(실측 47종) 모바일 배지가 과도하게 길어진다. 도시·권역 접두어(서울/부산/인천 등)는
 * 노선 식별에 필요하므로 보존하고, 정보량이 없는 모드 단어만 뺀다.
 *
 * ⚠ per-노선 손글씨 매핑 테이블 금지 (derived-display-ssot.md — 원본이 늘 때마다 표가
 * 어긋나는 drift 원천). 규칙 기반 변환만 사용한다.
 *
 * 안전장치: 모드 단어를 뺀 결과에 실제 노선 토큰(`N호선` 또는 `~선`)이 남지 않으면
 * 원본을 그대로 둔다. 이것이 없으면 "김포도시철도" → "김포"(도시명만 남아 노선이 아님)
 * 처럼 망가진다. "자기부상철도"·"부산김해경전철" 은 모드 단어 목록에 없어 애초에 무변경.
 */
const LINE_MODE_WORDS = /(경량도시철도|광역도시철도|광역철도|도시철도|지하철)/g;

export function normalizeLineName(lineName: string): string {
  const original = (lineName ?? "").trim();
  if (!original) return lineName;

  const stripped = original.replace(LINE_MODE_WORDS, " ").replace(/\s+/g, " ").trim();
  // 빈 문자열이 되거나 노선 토큰이 사라지면 원본 유지
  if (!stripped || !/(\d+호선|선$)/.test(stripped)) return original;
  return stripped;
}

/** 역 1건 — `강남역 (2호선·신분당선) 320m`. 노선이 없으면 괄호부를 생략한다. */
export function formatStation(station: SubwayStationNear): string {
  const name = formatStationName(station.station_name);
  const lines =
    station.lines.length > 0 ? ` (${station.lines.map(normalizeLineName).join("·")})` : "";
  return `${name}${lines} ${formatDistance(station.distance_m)}`;
}

/**
 * 여러 역을 ` · ` 로 이어 한 줄로 만든다.
 * 빈 배열이면 빈 문자열 — 호출부가 이를 보고 행 자체를 생략한다.
 */
export function formatSubwayStations(stations: SubwayStationNear[]): string {
  return stations.map(formatStation).join(" · ");
}
