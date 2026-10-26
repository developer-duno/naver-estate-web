/**
 * 규제지역(조정대상지역 = 투기과열지구) 판정 — 2u 전용, 법정동 시군구 코드 5자리로 판정한다(세션 482 PR 1b).
 *
 * 왜 코드인가: 2u 단지의 시군구 이름에는 구가 없다(sigungu = "성남시") — 미분양 방식(이름 "경기 성남시 분당구")으로는
 * 분당·수정·중원, 수지·기흥, 동탄·만세를 가르지 못한다. 단지 코드(cortar_no 10자리) 앞 5자리는 구까지 가른다.
 *
 * 지정 목록 원문 = 미분양 src/data/regulation-zones.json(2026-10-04 확인본, 커밋 415729ee) 의 16항목:
 *   "서울", "경기 과천시", "경기 광명시", "경기 성남시 분당구", "경기 성남시 수정구", "경기 성남시 중원구",
 *   "경기 수원시 영통구", "경기 수원시 장안구", "경기 수원시 팔달구", "경기 안양시 동안구", "경기 용인시 수지구",
 *   "경기 의왕시", "경기 하남시", "경기 화성시 동탄구", "경기 용인시 기흥구", "경기 구리시"
 *   (국토교통부 10·15 대책 2025-10-15 + 2026-06-30 추가 지정 3곳, 2026-07-01 효력)
 * 코드 출처 = 이 레포 backend/data/region_codes.json(운영 단지 코드 앞 5자리 → 시도·시군구 이름, 16곳 전부 일치 확인
 *   2026-10-26) · 화성 4구 순서(만세 41591·효행 41593·병점 41595·동탄 41597)는 미분양 scripts/collectors/_shared.mjs
 *   HWASEONG_LAWD_CODES 주석 · 수원 4구 = 장안 41111·권선 41113·팔달 41115·영통 41117(권선은 목록 밖이라 비규제).
 * 지정이 바뀌면 미분양 정본(regulation-zones.json)을 먼저 보고 이 표를 같이 고친다.
 */
import type { Zone } from "./loanRules";

/** 서울 25개 구 전부 — 시군구 코드가 11 로 시작 */
const SEOUL_PREFIX = "11";

/** 경기 지정 15곳의 시군구 코드 */
export const GYEONGGI_REGULATED_CODES: ReadonlySet<string> = new Set([
  "41290", // 과천시
  "41210", // 광명시
  "41131", // 성남시 수정구
  "41133", // 성남시 중원구
  "41135", // 성남시 분당구
  "41111", // 수원시 장안구
  "41115", // 수원시 팔달구
  "41117", // 수원시 영통구
  "41173", // 안양시 동안구
  "41465", // 용인시 수지구
  "41463", // 용인시 기흥구
  "41430", // 의왕시
  "41450", // 하남시
  "41597", // 화성시 동탄구
  "41310", // 구리시
]);

/** 단지 코드(10자리) → "overheated" | "normal" — 코드가 없거나 10자리 숫자가 아니면 null(판정 못 함) */
export function zoneOfCortar(cortarNo: string | null | undefined): Extract<Zone, "overheated" | "normal"> | null {
  if (!cortarNo || !/^\d{10}$/.test(cortarNo)) return null;
  const code = cortarNo.slice(0, 5);
  if (code.startsWith(SEOUL_PREFIX) || GYEONGGI_REGULATED_CODES.has(code)) return "overheated";
  return "normal";
}

/**
 * 시도 표기 → 짧은 이름. "서울시"·"서울특별시"·"경기도"·"인천광역시" 처럼 흔들려도 수도권은 "서울"·"경기"·"인천" 으로.
 * 그 밖은 원래 글자(공백 정리만) — calcLTV·stressAddFor 의 수도권 판정(isMetroRegion)은 짧은 이름을 받는다.
 */
export function metroSidoOf(sido: string | null | undefined): string | null {
  const s = (sido ?? "").trim().normalize("NFC");
  if (!s) return null;
  for (const short of ["서울", "경기", "인천"]) if (s.startsWith(short)) return short;
  return s;
}
