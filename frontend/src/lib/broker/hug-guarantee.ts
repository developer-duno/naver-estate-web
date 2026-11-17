import { formatDateDot } from "@/lib/broker/upcoming-dates";

/**
 * HUG 전세보증금반환보증 — 보증한도와 숫자로 따지는 보증 조건 세 가지(세션 520 · B37 PR 5).
 *
 * - 출처 = HUG 누리집 상품 안내(전세보증금반환보증) · 공지 37801(전월세전환율 6.4% → 6.5%, 작성일 2026-06-24).
 *   원문 확인일 = HUG_CHECKED_AT. 보증한도 「주택가격 x 전세가율(90%) – 선순위채권 등」 · 보증조건
 *   「전세보증금과 선순위채권을 더한 금액이 ‘주택가격 x 전세가율(90%)’ 이내」 · 「선순위채권이 주택가격의 60% 이내」 ·
 *   「전세보증금(월세가 있는 경우 전월세전환율 적용 전세보증금)이 수도권 7억 이하, 그 외 지역 5억원 이하」 ·
 *   주택가격 = 공시가격(오피스텔은 국세청 기준시가)의 140% 를 쓸 수 있다.
 * - **HUG 가 요율·비율을 바꾸면(누리집 공지사항) 아래 상수와 HUG_CHECKED_AT 을 함께 갱신한다.**
 * - 금액은 전부 원 단위 정수로 계산한다(소수 곱셈 없이 BigInt 정수식 — 15자리 금액에서도 반올림 오차 0).
 * - 시험 = `src/lib/broker/__tests__/hug-guarantee.test.ts`.
 */

/** 전세가율(%) — 주택가격의 이만큼까지가 보증 대상 */
export const HUG_JEONSE_RATIO_PCT = 90;
/** 선순위채권 상한(주택가격 대비 %) */
export const HUG_SENIOR_CAP_PCT = 60;
/** 공시가격(오피스텔은 국세청 기준시가)으로 주택가격을 낼 때의 배율(%) */
export const HUG_OFFICIAL_PRICE_PCT = 140;
/** 전월세전환율(천분율) — 65 = 6.5% */
export const HUG_CONVERSION_RATE_PERMILLE = 65;
/** 전월세전환율 6.5% 를 적용하는 신청일 */
export const HUG_CONVERSION_RATE_FROM = "2026-07-01";
/** 전세보증금 상한(원) — 수도권(서울·인천·경기) / 그 외 지역 */
export const HUG_DEPOSIT_CAP_WON = { capital: 700_000_000, other: 500_000_000 } as const;
/** 원문을 확인한 날 */
export const HUG_CHECKED_AT = "2026-11-17";

export const HUG_SOURCES = [
  {
    label: "HUG 전세보증금반환보증 원문",
    url: "https://www.khug.or.kr/hug/web/ig/dr/igdr000001.jsp",
  },
  {
    label: "HUG 전월세전환율 변경 공지",
    url: "https://khug.or.kr/hug/web/cs/no/csno000001.jsp?id=16&mode=S&currentPage=1&articleId=37801",
  },
] as const;

export type HugRegion = keyof typeof HUG_DEPOSIT_CAP_WON;
export type HugPriceMode = "direct" | "official";

export type HugInput = {
  region: HugRegion;
  /** direct = 주택가격 그대로 · official = 공시가격(×140%) */
  priceMode: HugPriceMode;
  /** 주택가격 또는 공시가격(원) — 비면 null */
  priceWon: number | null;
  /** 선순위채권 등(원) — 비면 0 */
  seniorWon: number | null;
  /** 전세보증금(원) — 비면 null */
  depositWon: number | null;
  /** 월세(원) — 비면 0 */
  monthlyRentWon: number | null;
};

export type HugResult =
  | { status: "empty" }
  | { status: "invalid" }
  | {
      status: "ok";
      /** HUG 가 쓰는 주택가격(공시가격 모드면 ×140%) */
      housePriceWon: number;
      /** 주택가격 × 90% (원 미만 버림) */
      ratioCapWon: number;
      seniorWon: number;
      depositWon: number;
      monthlyRentWon: number;
      /** 보증한도 = 주택가격 × 90% − 선순위채권 등(0 아래일 수 있다) */
      limitWon: number;
      /** 조건 ① 전세보증금 + 선순위채권 ≤ 주택가격 × 90% — 보증금은 실제 금액(월세 환산 없음) */
      depositFits: boolean;
      /** 조건 ② 선순위채권 ≤ 주택가격 × 60% */
      seniorFits: boolean;
      /** 선순위채권 비율(%) 글자 — 0.1 단위 올림, 끝의 .0 은 뺀다 */
      seniorRatioText: string;
      /** 조건 ③ 보증금 상한(원) */
      depositCapWon: number;
      /** 월세가 있으면 환산 보증금(상한 이하면 원 미만 버림 · 넘으면 올림), 없으면 null */
      convertedDepositWon: number | null;
      /** 조건 ③ (환산) 보증금 ≤ 상한 */
      capFits: boolean;
    };

// tsconfig target ES2017 이라 BigInt 리터럴(1n) 대신 BigInt() 를 쓴다
const big = (n: number) => BigInt(n);
/** a × num ÷ den, 원 미만 버림(정수식) */
function mulDivFloor(a: number, num: number, den: number): number {
  return Number((big(a) * big(num)) / big(den));
}

function isValidAmount(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0;
}

/** 0.1 단위 올림 비율 글자 — 선순위 / 주택가격 */
function ratioCeilText(part: number, whole: number): string {
  const num = big(part) * big(1000);
  const tenths = (num + big(whole) - big(1)) / big(whole); // 올림
  const whole10 = tenths / big(10);
  const frac = tenths % big(10);
  return frac === big(0) ? `${whole10}` : `${whole10}.${frac}`;
}

/** HUG 산식으로 한도와 세 조건을 계산한다 — 주택가격·전세보증금이 비면 empty, 음수·NaN·소수면 invalid */
export function calcHugLimit(input: HugInput): HugResult {
  const values = [input.priceWon, input.seniorWon, input.depositWon, input.monthlyRentWon];
  if (values.some((v) => v != null && !isValidAmount(v))) return { status: "invalid" };
  if (input.priceWon == null || input.priceWon <= 0 || input.depositWon == null || input.depositWon <= 0) {
    return { status: "empty" };
  }
  const housePriceWon =
    input.priceMode === "official" ? mulDivFloor(input.priceWon, HUG_OFFICIAL_PRICE_PCT, 100) : input.priceWon;
  const seniorWon = input.seniorWon ?? 0;
  const depositWon = input.depositWon;
  const monthlyRentWon = input.monthlyRentWon ?? 0;

  const ratioCapWon = mulDivFloor(housePriceWon, HUG_JEONSE_RATIO_PCT, 100);
  const limitWon = ratioCapWon - seniorWon;
  const depositFits = depositWon <= limitWon;

  const seniorFits = big(seniorWon) * big(100) <= big(housePriceWon) * big(HUG_SENIOR_CAP_PCT);
  const seniorRatioText = ratioCeilText(seniorWon, housePriceWon);

  const depositCapWon = HUG_DEPOSIT_CAP_WON[input.region];
  // 환산 보증금 = 보증금 + 월세×12 ÷ 전환율 → 양변에 전환율(천분율)을 곱한 정수식
  const scaled = big(depositWon) * big(HUG_CONVERSION_RATE_PERMILLE) + big(monthlyRentWon) * big(12_000);
  const capFits = scaled <= big(depositCapWon) * big(HUG_CONVERSION_RATE_PERMILLE);
  // 넘었을 때는 올림 — 내림하면 상한을 넘었는데 화면에 상한과 같은 금액(예 「5억 원」)이 보인다
  const rate = big(HUG_CONVERSION_RATE_PERMILLE);
  const convertedDepositWon =
    monthlyRentWon > 0 ? Number(capFits ? scaled / rate : (scaled + rate - big(1)) / rate) : null;

  return {
    status: "ok",
    housePriceWon,
    ratioCapWon,
    seniorWon,
    depositWon,
    monthlyRentWon,
    limitWon,
    depositFits,
    seniorFits,
    seniorRatioText,
    depositCapWon,
    convertedDepositWon,
    capFits,
  };
}

function withThousands(n: number | bigint): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 금액 글자 — 억·만·원 조각(0 조각은 생략, 만·원 조각은 쉼표).
 * unit=true: 원 조각이 0 이면 끝에 「 원」, 있으면 「…원」 붙여 씀 · 0 = 「0원」.
 * unit=false(식 줄): 「원」 없이 · 0 = 「0」. 음수는 앞에 「−」.
 */
export function formatHugWon(won: number, unit = true): string {
  if (won < 0) return `−${formatHugWon(-won, unit)}`;
  if (won === 0) return unit ? "0원" : "0";
  const eok = Math.floor(won / 100_000_000);
  const man = Math.floor((won % 100_000_000) / 10_000);
  const rest = won % 10_000;
  const parts: string[] = [];
  if (eok > 0) parts.push(`${withThousands(eok)}억`);
  if (man > 0) parts.push(`${withThousands(man)}만`);
  if (rest > 0) parts.push(withThousands(rest));
  const text = parts.join(" ");
  if (!unit) return text;
  return rest > 0 ? `${text}원` : `${text} 원`;
}

/** 전월세전환율 글자 — 65 → 「6.5%」 */
export function conversionRateText(): string {
  const p = HUG_CONVERSION_RATE_PERMILLE;
  return p % 10 === 0 ? `${p / 10}%` : `${Math.floor(p / 10)}.${p % 10}%`;
}

/** 보증금 상한 글자 — 「수도권 7억」·「그 외 지역 5억」 */
export function depositCapLabel(region: HugRegion): string {
  return `${region === "capital" ? "수도권" : "그 외 지역"} ${formatHugWon(HUG_DEPOSIT_CAP_WON[region], false)}`;
}

/** 적용 기준 줄 — 상수에서 만든다(손글씨 중복 금지) */
export function hugBasisLine(): string {
  return [
    `적용 기준: 전세가율 ${HUG_JEONSE_RATIO_PCT}%`,
    `선순위채권 ${HUG_SENIOR_CAP_PCT}%`,
    `보증금 상한 수도권 ${formatHugWon(HUG_DEPOSIT_CAP_WON.capital, false)}·그 외 ${formatHugWon(HUG_DEPOSIT_CAP_WON.other, false)}`,
    `공시가격 ${HUG_OFFICIAL_PRICE_PCT}%`,
    `전월세전환율 ${conversionRateText()}(${formatDateDot(HUG_CONVERSION_RATE_FROM)} 신청분부터)`,
    `HUG 원문 확인 ${formatDateDot(HUG_CHECKED_AT)}`,
  ].join(" · ");
}

/** 이 계산에 넣지 않은 심사 조건 */
export const HUG_NOT_COVERED = [
  "HUG 상품 기준입니다 — HF(주택금융공사)·SGI서울보증 전세보증은 조건이 다릅니다",
  "등기부 갑구 권리침해(압류·가압류 등) · 건물·토지가 모두 임대인 소유인지",
  "전입신고·확정일자 · 계약기간 1년 이상 · 공인중개사를 통한 계약서",
  "신청 기한(잔금·전입 중 늦은 날부터 계약기간 절반 전) · 다른 기관 중복 가입",
  "위반건축물(아파트 제외) · 다른 세대 전입 · 보증금 담보·양도 금지 특약",
  "HUG가 실제로 쓰는 시세(KB·부동산원, 최저층은 하위평균가)",
  "보증료(원문의 보증료율 표를 보세요)",
  "감정평가서가 있으면 HUG는 그 값을 먼저 씁니다(6개월 이내)",
  // 원문 672행 · 공지 37801 9항
  "갱신 계약에서 보증금이 늘지 않으면 HUG는 주택가격을 다시 보지 않고, 전월세전환율도 예전 보증 때 것을 씁니다",
  // 원문 701~703행
  "질권 설정·채권양도 통지가 된 전세대출이 있으면 가입할 수 없습니다(HUG와 협약한 SGI서울보증 보증부 전세대출·신용대출은 예외)",
  // 원문 704~708행
  "임대인이 HUG 보증금지 대상이거나 전세보증금 미반환 임대인으로 등록된 경우 · 임대인이 미성년자면 법정대리인 연대보증",
  // 원문 657행
  "오피스텔은 전세계약서나 중개대상물 확인·설명서에 「주거용」 표기가 있어야 합니다",
  // 원문 699~700행
  "전세권이 설정돼 있으면 말소하거나 보증 이행 때 HUG로 이전해야 합니다",
  // 원문 720행
  "이사 전 사전한도심사(계약일부터 계약 시작 14일 전까지 안심전세 앱에서 신청)",
] as const;

/** 계산기 장 주소 */
export const HUG_LIMIT_PATH = "/broker/jeonse-guarantee";

/** 체크 목록의 「넣지 않은 것」에 HUG 보증 항목이 있으면 그 장에 「한도 계산 →」 링크를 단다 */
export function hasHugItem(notCovered: readonly string[]): boolean {
  return notCovered.some((t) => t.includes("HUG"));
}
