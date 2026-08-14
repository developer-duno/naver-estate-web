/**
 * 관리자 시스템 설정(admin_settings) key → 사람이 읽을 한글 이름·설명.
 *
 * admin_settings 는 BE 에 seed 나 기본값 코드가 없는 순수 키-값 저장소다
 * (backend/db/migrations/V000__auth_admin.sql 에 테이블만 있고 INSERT 없음,
 *  PATCH /api/admin/settings/{key} 로 그때그때 생성). 그래서 "전체 키 목록"이
 * 코드에 존재하지 않는다 — 아는 키만 등록하고, 모르는 키는 원문(영문 key)을
 * 그대로 보여줘 정보 손실을 막는다.
 */

export interface SettingLabel {
  /** 화면에 크게 보이는 한글 이름 */
  name: string;
  /** 이 설정이 뭘 바꾸는지 한 줄 설명 */
  description: string;
}

const SETTING_LABELS: Record<string, SettingLabel> = {
  "scheduler.popular_batch_size": {
    name: "인기 단지 한 번에 수집할 개수",
    description: "자주 조회되는 단지를 미리 받아올 때 한 번에 몇 개씩 처리할지예요.",
  },
  "crawl.throttle_ms": {
    name: "수집 사이 쉬는 시간 (밀리초)",
    description:
      "네이버에 요청을 보내고 다음 요청까지 얼마나 쉴지예요. 짧을수록 빠르지만 차단 위험이 커져요.",
  },
};

/** 등록된 한글 이름표. 모르는 키면 null (호출처가 원문 key 를 보여준다). */
export function getSettingLabel(key: string): SettingLabel | null {
  return SETTING_LABELS[key] ?? null;
}
