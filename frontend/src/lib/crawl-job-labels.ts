/**
 * 크롤 작업 유형(job_type) 한글 라벨 + 한 줄 설명.
 * BE crawler/* 에서 사용하는 job_type 11종을 화면에서 사람말로 보여주기 위한 매핑.
 */

export const CRAWL_JOB_LABELS: Record<string, { label: string; desc: string }> = {
  complex_articles: {
    label: "단지 매물 수집",
    desc: "특정 아파트 단지의 현재 매물(매매·전세·월세) 목록을 네이버에서 가져옴",
  },
  complex_list: {
    label: "단지 발견",
    desc: "키워드 검색으로 새 아파트 단지를 찾아 DB에 추가",
  },
  popular_crawl: {
    label: "인기 단지 일괄 수집",
    desc: "최근 자주 조회된 단지 매물을 미리 갱신해두는 정기 작업",
  },
  article_detail: {
    label: "매물 상세 보강",
    desc: "이미 가져온 매물에 사진·설명·중개사 정보 등 상세 항목을 채우는 작업",
  },
  price_history: {
    label: "시세 이력 수집",
    desc: "단지별 매매·전세 시세의 월별 변동 이력 수집",
  },
  public_trade_data: {
    label: "공공 실거래가 수집",
    desc: "국토교통부 공공데이터 API로 실제 거래된 가격 가져옴",
  },
  bulk_recrawl: {
    label: "일괄 재크롤",
    desc: "관리자가 직접 트리거한 여러 단지 한 번에 다시 수집",
  },
  air_quality: {
    label: "대기질 수집",
    desc: "에어코리아 API에서 측정소별 미세먼지·오존 데이터 수집 (매일 새벽 2시)",
  },
  emergency: {
    label: "응급의료 수집",
    desc: "전국 응급의료기관 위치·운영시간 갱신 (매월 첫째 월요일)",
  },
  childcare: {
    label: "어린이집 수집",
    desc: "전국 어린이집 정원·교사·시설 정보 수집 (매월 첫째 목요일)",
  },
  crime_stats: {
    label: "범죄통계 수집",
    desc: "경찰청 공공데이터에서 시군구별 범죄 통계 수집 (분기별)",
  },
};

/** job_type 코드를 한글 라벨로. 미등록 코드는 코드명 그대로 반환 */
export function jobTypeLabel(code: string): string {
  return CRAWL_JOB_LABELS[code]?.label ?? code;
}

/** job_type 코드의 한 줄 설명. 미등록 코드는 빈 문자열 */
export function jobTypeDesc(code: string): string {
  return CRAWL_JOB_LABELS[code]?.desc ?? "";
}
