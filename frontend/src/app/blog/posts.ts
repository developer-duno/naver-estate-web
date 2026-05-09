export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  date: string;
  category: BlogCategory;
  readingTime: number;
  draft?: boolean;
};

export type BlogCategory = "시세 분석" | "세금" | "미분양" | "도구 활용";

export const POSTS: BlogPost[] = [
  {
    slug: "acquisition-tax-tool-guide",
    title: "취득세 계산기 사용법 — 손님 30초 응대 워크플로",
    description:
      "표준세율·다주택 중과·생애최초 200만 감면·오피스텔 4% 5 분기 자동 판정. 6~9억 보간·85m² 농특세 0원·12억 초과 거부까지 손님 시나리오별 사용법.",
    date: "2026-05-08",
    category: "도구 활용",
    readingTime: 6,
  },
  {
    slug: "mibunyang-radar-weights",
    title: "미분양 레이더 가중치 활용법 — 손님 성향별 우위 단지 30초에 줄세우기",
    description:
      "9축 + 인프라 4축 = 13축 정량 비교 + 가중치 프리셋 3종(균등/투자/실거주) + 슬라이더 1-5. 종합 우위 78점 한 줄 답으로 손님 성향별 우위 단지 응대.",
    date: "2026-05-08",
    category: "미분양",
    readingTime: 7,
  },
  {
    slug: "transfer-tax-tool-guide",
    title: "양도세 계산기 사용법 — 손님 30초 응대 워크플로",
    description:
      "1주택 12억 비과세·12억 초과 안분·단기 70%·중과 vs 한시배제·미등기 70%까지 손님 시나리오별 사용법. /tools/transfer-tax 6 분기 자동 판정을 1주택/다주택/단기/중과/미등기 H2 5개로 분리.",
    date: "2026-05-08",
    category: "도구 활용",
    readingTime: 7,
  },
  {
    slug: "asking-vs-actual-price",
    title: "호가 vs 실거래가 — 손님 협상 카드 1장으로 5천만원 절약",
    description:
      "호가는 매도자 희망가, 실거래가는 국토교통부 공공데이터. 격차 5%·10%·반대 시 협상 카드 시나리오 4종 + 차트에서 1초 읽는 법 + 거래량 0 단지 신뢰도 함정.",
    date: "2026-05-08",
    category: "시세 분석",
    readingTime: 7,
  },
  {
    slug: "property-tax-tool-guide",
    title: "보유세 계산기 사용법 — 손님 30초 응대 워크플로",
    description:
      "공동명의 특례·합산배제·법인 단일세율·보유기간 특례 라디오까지 손님 시나리오별 사용법. /tools/property-tax 8 변종을 1주택/공동/임대/법인/고급옵션 H2 6개로 분리.",
    date: "2026-05-08",
    category: "도구 활용",
    readingTime: 7,
  },
  {
    slug: "jeonse-ratio",
    title: "전세가율 계산법과 활용 — 공인중개사 실무 가이드",
    description:
      "전세가율(=전세가/매매가) 한 번에 이해. 안전선·위험선·갭투자 판단 기준과 손님 응대 화법까지.",
    date: "2026-05-02",
    category: "시세 분석",
    readingTime: 6,
  },
  {
    slug: "complex-price-analysis",
    title: "단지 시세 분석법 — 평당가·시세 추이·비교 줄세우기",
    description:
      "평당가가 가장 먼저인 이유, 시세 추이 차트(6개월/1년/2년/전체) 읽는 법, /compare 24행 비교로 같은 동네 단지 줄 세우기.",
    date: "2026-05-02",
    category: "시세 분석",
    readingTime: 7,
  },
  {
    slug: "mibunyang-for-agents",
    title: "공인중개사를 위한 미분양 단지 활용법",
    description:
      "미분양은 위험 신호인가 기회 신호인가. 정량 비교·즐겨찾기·미분양 추이로 매수 상담 자료 만드는 법. 5탭·정렬 7종·즐겨찾기 200개·17행 비교 워크플로 정리.",
    date: "2026-05-02",
    category: "미분양",
    readingTime: 8,
  },
  {
    slug: "realtime-listing",
    title: "네이버 매물 실시간 조회 노하우",
    description:
      "사전 크롤링이 아닌 실시간 조회의 장점과 한계. 단지 검색·필터링·즐겨찾기·엑셀로 매물을 빠르게 압축하고 손님께 자료 만드는 5분 워크플로.",
    date: "2026-05-02",
    category: "도구 활용",
    readingTime: 6,
  },
  {
    slug: "realestate-calculators",
    title: "부동산 세금·금융 계산기 모음 — 5종 출시 완료",
    description:
      "부동산 세금·금융 계산기 5종 출시 완료. 매수·매도·보유 상담의 거의 모든 세금·면적 계산을 손님 앞에서 1분 안에 끝내는 사용 흐름과 핵심 함정을 정리합니다.",
    date: "2026-05-04",
    category: "세금",
    readingTime: 8,
  },
  {
    slug: "transfer-tax-guide",
    title: "양도소득세 계산기 출시 — 13 필드·6 분기 자동 판정",
    description:
      "1세대1주택 비과세·12억 초과 안분·다주택 중과 한시배제·미등기 70%·장특공 표1/표2 모두 자동 분기. 9 권위 출처 교차검증.",
    date: "2026-05-03",
    category: "세금",
    readingTime: 7,
  },
  {
    slug: "property-tax-guide",
    title: "보유세 계산기 출시 — 재산세 + 종부세 5 필드 4 분기 자동 판정",
    description:
      "1세대1주택 12억 공제·연령/보유 세액공제·다주택 9억 공제·3주택 25억 초과 중과·농특세 20% 모두 자동 분기. 국세청 PDF 16개 권위 출처 100% 정확값.",
    date: "2026-05-04",
    category: "세금",
    readingTime: 8,
  },
  {
    slug: "compare-workflow",
    title: "/compare 24행 비교 — 4단지 줄세우기 5분 워크플로",
    description:
      "검색 결과에서 + 4번, 비교하기 1번이면 24행 표 + 5종 차트 자동 생성. 평당가·★ 우위·인쇄·엑셀·URL 공유까지 손님 응대 자료를 5분에 끝내는 사용법.",
    date: "2026-05-07",
    category: "도구 활용",
    readingTime: 7,
  },
  {
    slug: "agent-verification-guide",
    title: "공인중개사 인증 5분 가이드 — B2B 구독 가입 첫 단계",
    description:
      "사업자등록 자동 검증 + 자격증 업로드 (JPG/PNG/PDF 5MB) + 상태 4 분기 (대기·승인·거부·자동승인). 인증 후 전문가 뱃지·7일 무료 체험·고급 기능 잠금 해제까지 손님 funnel 정리.",
    date: "2026-05-09",
    category: "도구 활용",
    readingTime: 6,
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
