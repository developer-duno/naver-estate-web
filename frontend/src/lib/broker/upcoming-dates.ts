/**
 * 「중개 실무」(/broker) 「다가오는 날짜」 카드의 자료 — **손으로 관리한다**(세션 511).
 *
 * - 항목은 공식 원문(공고·발표)을 열어 날짜와 내용을 확인한 뒤에만 더한다. 원문 주소를 sourceUrl 에,
 *   확인한 날을 checkedAt 에 적는다.
 * - 날짜가 지난 항목은 지운다(화면은 정적 빌드라 남은 날수를 계산하지 않는다 — 지난 항목이 그대로 보인다).
 * - date 는 YYYY-MM-DD, 배열은 날짜가 이른 것부터. 시험 = `src/lib/broker/__tests__/upcoming-dates.test.ts`.
 */
export type UpcomingDate = {
  /** 그날(YYYY-MM-DD) */
  date: string;
  title: string;
  /** 한 줄 설명 */
  note: string;
  /** 출처 기관·문서 이름 */
  sourceLabel: string;
  /** 원문을 볼 수 있는 공식 주소(https) */
  sourceUrl: string;
  /** 원문을 확인한 날(YYYY-MM-DD) */
  checkedAt: string;
};

export const UPCOMING_DATES: UpcomingDate[] = [
  {
    date: "2026-12-31",
    title: "서울 25개 구·경기 12곳 토지거래허가구역 지정기간 끝 (국토교통부 공고분)",
    note:
      "아파트(일부 연립·다세대 포함) 대상 · 경기 12곳 = 광명, 과천, 의왕, 하남, 수원 장안·팔달·영통, 성남 분당·수정·중원, 용인 수지, 안양 동안 · 연장 여부는 국토교통부 발표로 확인",
    sourceLabel: "국토교통부공고 제2025-1219호(강동구청 누리집 게시)",
    sourceUrl: "https://www.gangdong.go.kr/web/newportal/bbs/b_068/151789",
    checkedAt: "2026-11-16",
  },
  {
    date: "2027-12-31",
    title: "토지거래허가구역 안 임대 중인 주택의 실거주 유예 신청 기한",
    note: "2026년 12월 31일에서 1년 연장 · 개정 시행령 2026년 10월 1일 시행",
    sourceLabel: "국토교통부 발표(2026-09-17)",
    sourceUrl: "https://www.korea.kr/news/customizedNewsView.do?newsId=148972092",
    checkedAt: "2026-11-16",
  },
];

/** 날짜 표기 — "2026-12-31" → "2026. 12. 31." (요일·남은 날수는 붙이지 않는다) */
export function formatDateDot(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}. ${Number(m)}. ${Number(d)}.`;
}
