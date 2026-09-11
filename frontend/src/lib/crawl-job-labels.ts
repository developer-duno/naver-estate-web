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

  // ── 세션 399 추가 15종 ──────────────────────────────────────────────
  // 관리자 화면에 영문 코드가 그대로 노출되던 것들. label 은 BE
  // routers/admin/scheduler.py SCHEDULER_JOB_META 의 공식 명칭을 그대로 복사
  // (화면·텔레그램 알림 표기를 한 이름으로 통일 — 서로 다르면 같은 작업을
  // 두 이름으로 부르게 된다). 누락 재발은 scripts/check-job-labels.mjs 가 CI 에서 차단.
  price_backfill: {
    label: "시세 이력 소급 수집",
    desc: "시세 이력이 부족한 단지를 국토교통부 실거래가로 과거분까지 채움 (매일 03:30)",
  },
  complex_metric: {
    label: "단지 가치지표 수집",
    desc: "시세 이력을 집계해 단지별 가치 지표를 계산·저장 (매일 04:30)",
  },
  officetel_presale: {
    label: "청약홈 오피스텔 수집",
    desc: "청약홈에서 오피스텔·도시형 생활주택 청약 공고와 평형별 공급 정보 수집 (매주 월요일)",
  },
  rental_presale: {
    label: "청약홈 민간임대 수집",
    desc: "청약홈에서 공공지원 민간임대 청약 공고와 평형별 공급 정보 수집 (매주 월요일)",
  },
  official_price: {
    label: "공동주택 공시가격 수집",
    desc: "V-WORLD에서 법정동별 공동주택 공시가격을 받아 단지·평형별로 저장 (매월 15일, 3~7시간 소요)",
  },
  billing_charge: {
    label: "빌링키 자동결제",
    desc: "구독 갱신일이 된 이용자의 등록 카드로 자동 결제 실행 (매일 04:50)",
  },
  vacuum_maintenance: {
    label: "정기 VACUUM 유지보수",
    desc: "매물·거래 테이블 정리로 조회 속도 유지 + 만료된 사용량 기록 청소 (매일 03:50)",
  },
  kapt_match: {
    label: "K-apt 단지 매칭",
    desc: "국토부 K-apt 전국 단지 목록과 우리 단지를 대조해 연결 (매월 21일, 최대 8시간)",
  },
  kapt_costs: {
    label: "K-apt 관리비 수집",
    desc: "연결된 단지의 월별 관리비 22개 항목을 받아 세대당 금액 계산 (매일 06:20)",
  },
  api_version_probe: {
    label: "data.go.kr API 버전 감시",
    desc: "우리가 쓰는 공공데이터 API 12종이 폐기되지 않았는지 확인 (매주 일요일 06:40)",
  },
  complex_detail_APT: {
    label: "단지 상세 backfill APT",
    desc: "상세 정보가 비어 있는 아파트 단지를 골라 보강 (4시간마다)",
  },
  complex_detail_OPST: {
    label: "단지 상세 backfill OPST",
    desc: "상세 정보가 비어 있는 오피스텔 단지를 골라 보강 (4시간마다)",
  },
  complex_detail_JGC: {
    label: "단지 상세 backfill JGC",
    desc: "상세 정보가 비어 있는 재건축 단지를 골라 보강 (매주 화요일 07:00)",
  },
  complex_detail_ABYG: {
    label: "단지 상세 backfill ABYG",
    desc: "상세 정보가 비어 있는 아파트 분양권 단지를 골라 보강 (매주 수요일 07:00)",
  },
  complex_detail_OBYG: {
    label: "단지 상세 backfill OBYG",
    desc: "상세 정보가 비어 있는 오피스텔 분양권 단지를 골라 보강 (매주 목요일 07:00)",
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
