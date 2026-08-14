/**
 * setting-labels 단위 테스트 (R3 — 설정 key 한글 라벨)
 * 실행: npx vitest run src/lib/admin/__tests__/setting-labels.test.ts
 */
import { describe, it, expect } from "vitest";
import { getSettingLabel } from "../setting-labels";

describe("getSettingLabel", () => {
  it("등록된 key 는 한글 이름 + 설명을 준다", () => {
    const label = getSettingLabel("crawl.throttle_ms");
    expect(label?.name).toBe("수집 사이 쉬는 시간 (밀리초)");
    expect(label?.description).toContain("네이버");
  });

  it("인기 단지 배치 크기 key 도 한글 이름표가 있다", () => {
    expect(getSettingLabel("scheduler.popular_batch_size")?.name).toBe(
      "인기 단지 한 번에 수집할 개수",
    );
  });

  it("모르는 key 는 null — 호출처가 원문 key 를 그대로 보여준다 (정보 손실 방지)", () => {
    // admin_settings 는 BE seed 가 없는 임의 키-값 저장소라 새 key 가 언제든 생긴다
    expect(getSettingLabel("brand.new_key_2027")).toBeNull();
  });
});
