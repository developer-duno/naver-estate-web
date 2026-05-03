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
      "평당가가 가장 먼저인 이유, 시세 추이 차트(6개월/1년/2년/전체) 읽는 법, 호가 vs 실거래가 격차 판독, /compare 24행 비교로 같은 동네 단지 줄 세우기.",
    date: "2026-05-02",
    category: "시세 분석",
    readingTime: 7,
  },
  {
    slug: "mibunyang-for-agents",
    title: "공인중개사를 위한 미분양 단지 활용법",
    description:
      "미분양은 위험 신호인가 기회 신호인가. 9축 레이더 + 가중치 프리셋 3종(균등/투자형/실거주형) + 즐겨찾기 + 미분양 추이 차트로 매수 상담 자료 만드는 법.",
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
      "공인중개사가 자주 쓰는 부동산 계산기 5종 (중개수수료·취득세·평·㎡ 변환·양도소득세·보유세) 모두 출시 완료. 핵심 함정과 사용 흐름을 정리합니다.",
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
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
