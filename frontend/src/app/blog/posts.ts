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
    title: "단지 시세 분석법 — 평당가·시세 추이 읽는 법",
    description:
      "매매·전세 시세 추이 차트로 단지 흐름을 한눈에. 어떤 단지가 오르고 어떤 단지가 정체인지 빠르게 분류하는 법.",
    date: "2026-05-02",
    category: "시세 분석",
    readingTime: 5,
    draft: true,
  },
  {
    slug: "mibunyang-for-agents",
    title: "공인중개사를 위한 미분양 단지 활용법",
    description:
      "미분양 정보를 그냥 통계가 아닌 실제 매수 상담 자료로 바꾸는 법. 분양가·할인율·9축 비교의 실무 활용.",
    date: "2026-05-02",
    category: "미분양",
    readingTime: 5,
    draft: true,
  },
  {
    slug: "realtime-listing",
    title: "네이버 매물 실시간 조회 노하우",
    description:
      "사전 크롤링이 아닌 실시간 조회의 장점과 한계. 단지 검색·필터링·즐겨찾기로 매물을 빠르게 압축하는 흐름.",
    date: "2026-05-02",
    category: "도구 활용",
    readingTime: 4,
    draft: true,
  },
  {
    slug: "realestate-calculators",
    title: "부동산 세금·금융 계산기 모음 (준비 중)",
    description:
      "공인중개사가 자주 쓰는 부동산 계산기를 한곳에 모았습니다. 중개수수료·취득세·평·㎡ 변환·양도소득세 순으로 출시 예정.",
    date: "2026-05-02",
    category: "세금",
    readingTime: 3,
    draft: true,
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
