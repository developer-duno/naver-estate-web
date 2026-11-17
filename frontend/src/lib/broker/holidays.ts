/**
 * 신고 기한이 늘어나는지 판정할 때 쓰는 공휴일 목록 — **손으로 관리한다**(세션 519).
 *
 * - 근거 = 관공서의 공휴일에 관한 규정(2026. 5. 11. 시행 — 노동절·제헌절 포함) + 한국천문연구원 월력요항.
 *   일요일은 날짜 계산에서 따로 보므로(요일) 이 목록에는 일요일이 아닌 공휴일·대체공휴일만 적어도 되지만,
 *   원문 목록을 그대로 옮기기 위해 일요일에 걸린 날도 그대로 둔다.
 * - **해마다 다음 해 월력요항(보통 6월 관보)이 나오면, 그리고 임시공휴일이 지정되면 갱신한다.**
 *   갱신하면 coverage.to 와 checkedAt 을 함께 바꾼다. coverage 밖의 날짜는 공휴일인지 모른다고 보고
 *   기한이 늘어나는지 말하지 않는다(lib/broker/deadlines.ts).
 * - 시험 = `src/lib/broker/__tests__/holidays.test.ts`.
 */
export type Holiday = {
  /** 그날(YYYY-MM-DD) */
  date: string;
  name: string;
};

/** 이 목록이 다루는 기간(양 끝 포함) */
export const HOLIDAY_COVERAGE = { from: "2026-10-01", to: "2027-12-31" } as const;

/** 원문을 확인한 날 */
export const HOLIDAYS_CHECKED_AT = "2026-11-17";

export const HOLIDAY_SOURCES = [
  { label: "관공서의 공휴일에 관한 규정(법제처)", url: "https://www.law.go.kr/법령/관공서의공휴일에관한규정" },
  {
    label: "한국천문연구원 2027년 월력요항",
    url: "https://astro.kasi.re.kr/life/post/calendarData?year=2027",
  },
];

/** 날짜가 이른 것부터 */
export const HOLIDAYS: Holiday[] = [
  { date: "2026-10-03", name: "개천절" },
  { date: "2026-10-05", name: "대체공휴일(개천절)" },
  { date: "2026-10-09", name: "한글날" },
  { date: "2026-12-25", name: "기독탄신일" },
  { date: "2027-01-01", name: "1월 1일" },
  { date: "2027-02-06", name: "설날" },
  { date: "2027-02-07", name: "설날" },
  { date: "2027-02-08", name: "설날" },
  { date: "2027-02-09", name: "대체공휴일(설날)" },
  { date: "2027-03-01", name: "삼일절" },
  { date: "2027-05-01", name: "노동절" },
  { date: "2027-05-03", name: "대체공휴일(노동절)" },
  { date: "2027-05-05", name: "어린이날" },
  { date: "2027-05-13", name: "부처님오신날" },
  { date: "2027-06-06", name: "현충일" },
  { date: "2027-07-17", name: "제헌절" },
  { date: "2027-07-19", name: "대체공휴일(제헌절)" },
  { date: "2027-08-15", name: "광복절" },
  { date: "2027-08-16", name: "대체공휴일(광복절)" },
  { date: "2027-09-14", name: "추석" },
  { date: "2027-09-15", name: "추석" },
  { date: "2027-09-16", name: "추석" },
  { date: "2027-10-03", name: "개천절" },
  { date: "2027-10-04", name: "대체공휴일(개천절)" },
  { date: "2027-10-09", name: "한글날" },
  { date: "2027-10-11", name: "대체공휴일(한글날)" },
  { date: "2027-12-25", name: "기독탄신일" },
  { date: "2027-12-27", name: "대체공휴일(기독탄신일)" },
];

const BY_DATE = new Map(HOLIDAYS.map((h) => [h.date, h.name]));

/** 그날의 공휴일 이름(공휴일이 아니면 undefined) */
export function holidayName(date: string): string | undefined {
  return BY_DATE.get(date);
}

/** 이 목록이 그날을 다루는가(공휴일 여부를 아는가) */
export function holidayCovered(date: string): boolean {
  return date >= HOLIDAY_COVERAGE.from && date <= HOLIDAY_COVERAGE.to;
}
