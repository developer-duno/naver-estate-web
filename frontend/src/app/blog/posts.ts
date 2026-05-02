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
    title: "부동산 세금·금융 계산기 모음 — 중개수수료·취득세 출시",
    description:
      "공인중개사가 자주 쓰는 부동산 계산기. 중개수수료·취득세(출시), 평·㎡·양도세 순으로 출시. 핵심 함정과 사용 흐름을 정리합니다.",
    date: "2026-05-02",
    category: "세금",
    readingTime: 6,
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
