// 미분양 상세 칸의 「기준·출처 한 줄」 문구 (세션 472 PR 2).
// 옛 막대·색·등급 라벨(2026-05 DB 분위수 문턱)은 공인 기준이 아니라서 지웠다.
// 값은 그대로 보여 주고, 그 옆에 법령·공공 통계의 기준값과 자료 출처를 글로만 붙인다.
// 조항·수치의 근거 = 세션 471 조사 4조(memory/reviews/review-s471-std-A~D.md, 공식 원문 링크 포함).

/**
 * 국토교통부 주거실태조사(2024년도) 자가가구 PIR 중위수.
 * 2025-11-17 보도자료: https://www.korea.kr/briefing/pressReleaseView.do?newsId=156728491
 * 통계누리: https://stat.molit.go.kr/portal/cate/statMetaView.do?hRsId=327
 * 새 연도가 공표되면 세 값을 함께 바꾼다.
 */
export const PIR_REFERENCE = { year: 2024, national: 6.3, capital: 8.7 } as const;

/** 국가 대기환경기준 PM2.5 연평균 (환경정책기본법 시행령 별표1) */
export const PM25_ANNUAL_STANDARD = 15;

/** 숫자로 쓸 수 있는 값만 (NaN·무한대·빈 값은 null) */
export function finiteOrNull(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

/** 0 이하는 입력 잡음으로 보고 null (옛 막대의 nonZero 규칙 그대로) */
export function positiveOrNull(v: number | null | undefined): number | null {
  const f = finiteOrNull(v);
  return f != null && f > 0 ? f : null;
}

/** 값과 상관없이 같은 문구인 칸 */
export const BASIS = {
  pir: `참고: 국토교통부 주거실태조사 ${PIR_REFERENCE.year} 자가가구 PIR 전국 ${PIR_REFERENCE.national}배 · 수도권 ${PIR_REFERENCE.capital}배(중위수)`,
  cancelRatio: "최근 6개월 거래 중 해제 신고 비율 · 부동산 거래신고 등에 관한 법률 §3의2 · 국토교통부 실거래가",
  unsoldRate: "미분양 세대 ÷ 전체 세대 · 국토교통부 미분양주택현황(미분양 수집)",
  coverage: "법정 상한은 용도지역별(예: 제3종일반주거 50%) · 국토의 계획 및 이용에 관한 법률 시행령 §84·지자체 조례",
  floorAreaRatio: "법정 상한은 용도지역별(예: 제3종일반주거 300%) · 국토의 계획 및 이용에 관한 법률 시행령 §85·지자체 조례",
  exclusiveRatio: "주거전용면적 ÷ 공급면적 · 주택법 시행규칙 §2",
  parking: "법정 최소 세대당 1대(전용 60㎡ 이하 0.7대) · 주택건설기준 등에 관한 규정 §27",
  maintenance: "세대당 월 평균 · 공동주택관리정보시스템(K-apt, 국토교통부·한국부동산원)",
  roadDistance:
    "도로명 주소·지도 검색으로 추정 — 소음 측정값 아님 · 공동주택 기준: 고속국도 300m·6차로 이상 국도 150m 이내면 소음방지대책 대상(주택건설기준 등에 관한 규정 §9)",
  avoidedFacility:
    "지도 검색 11종(소각장·하수처리장·매립지·장례식장·변전소 등, 카카오) 중 가장 가까운 것 · 법정 교육환경보호구역은 학교 기준 50m·200m(교육환경 보호에 관한 법률 §8)",
  schoolWalk:
    "가장 가까운 초등학교까지 직선거리 ÷ 분속 70m(미분양 계산) · 법정 초등학교 배치 기준은 통학거리 1,500m 이내(도시·군계획시설의 결정·구조 및 설치기준에 관한 규칙 §89)",
} as const;

/** 전세율(이 단지 · 대표 평수) — 표본 건수를 문구에 넣는다 */
export function jeonseRateBasis(jeonseN: number | null | undefined, saleN: number | null | undefined): string {
  return `같은 단지 대표 평수에서 전용면적이 같은 거래끼리 전세 중앙값 ÷ 매매 중앙값 · 표본 전세 ${jeonseN ?? 0}건·매매 ${saleN ?? 0}건 · 국토교통부 실거래가 기반(미분양 계산)`;
}

/** 최고층 — 건축법의 고층(30층)·초고층(50층) 경계 */
export function maxFloorBasis(floor: number): string {
  if (floor >= 50) return "초고층건축물(50층 이상 또는 200m 이상, 건축법 시행령 §2)";
  if (floor >= 30) return "고층건축물(30층 이상 또는 120m 이상, 건축법 §2)";
  return "건축법 고층건축물 기준(30층 이상) 미만";
}

/** 세대수 — 의무관리대상(300세대)·주민공동시설 확대(500세대) 경계 */
export function unitsBasis(units: number): string {
  if (units >= 500) {
    return "의무관리대상(300세대 이상) · 주민공동시설 확대 대상(500세대 이상, 주택건설기준 등에 관한 규정 §55의2)";
  }
  if (units >= 300) return "의무관리대상 공동주택(300세대 이상, 공동주택관리법 §2)";
  return "의무관리대상(300세대 이상) 미만 · 공동주택관리법 §2";
}

/**
 * 소음 추정값(dB) → 큰 도로까지 거리 구간.
 * 미분양 noise-estimate.mjs 가 도로 거리 구간마다 70·60·50·40 을 붙인 값이라 거꾸로 풀어 쓴다.
 * 그 밖의 값은 어느 구간인지 알 수 없어 null.
 */
export function roadDistanceText(noiseDb: number | null | undefined): string | null {
  switch (noiseDb) {
    case 70:
      return "50m 이내";
    case 60:
      return "50~100m";
    case 50:
      return "100~200m";
    case 40:
      return "200m 넘음";
    default:
      return null;
  }
}

/** PM2.5 가 국가 기준(연평균 15㎍/㎥) 이하인지 넘는지 — 같음은 "이하" */
function pm25Side(pm25: number): "이하" | "초과" {
  return pm25 <= PM25_ANNUAL_STANDARD ? "이하" : "초과";
}

/**
 * 지도 오버레이처럼 좁은 칸에 쓰는 짧은 꼴. "이 값은"을 앞에 둬서 기준 정의(15 이하)가 아니라
 * 이 단지 값이 기준 이하인지 넘는지를 말하는 문장임을 분명히 한다.
 */
export function pm25StandardShort(pm25: number): string {
  return `이 값은 국가 대기환경기준(연평균 ${PM25_ANNUAL_STANDARD}㎍/㎥) ${pm25Side(pm25)}`;
}

/** PM2.5 3년 평균 — 상세 화면 기준 줄(짧은 꼴 + 법령·자료 출처) */
export function pm25Basis(pm25: number): string {
  return `${pm25StandardShort(pm25)} · 환경정책기본법 시행령 별표1 · 에어코리아 측정소 3년 평균(미분양 계산)`;
}

/** 미분양 상세 페이지 맨 끝 출처 묶음 */
export const SOURCES_FOOTER_TEXT =
  "출처: 국토교통부 실거래가 공개시스템 · 국토교통부 미분양주택현황 · 공동주택관리정보시스템(K-apt) · 에어코리아(환경부) · 네이버부동산(단지 정보) · 미분양 사업자 자료 / 법령: 국가법령정보센터";
