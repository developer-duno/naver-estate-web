/**
 * MbInfraOverlay 테스트 — 지도뷰 선택카드 인프라 레이어 5종 (세션 318 신규, 세션 319 A·C·D 가드)
 * 실행: npx vitest run src/components/mb/__tests__/MbInfraOverlay.test.tsx
 *
 * 핵심 가드 (세션 319 적대 리뷰 답습):
 * - 목록형 apt(평탄 필드만, 중첩 infra/school/transport 없음)에서 교통·대기질·어린이집이
 *   noData 로 떨어지는 prod 동작을 박제 — A 수정(상세 lazy fetch)의 회귀 가드.
 * - 상세형 apt(중첩 채움)에서 5종 모두 값 렌더 — A 수정 후 동작.
 * - 로딩/에러 상태 분기(error-propagation.md), 안전등급 단위·범례(C), dist 단위 변환 경계.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import MbInfraOverlay from "../MbInfraOverlay";
import type { MbApartment } from "@/types";

/** 목록 API 가 주는 형태 — 평탄 필드만, 중첩객체 없음 (세션 319 A 의 prod 데이터). */
function flatApt(overrides: Partial<MbApartment> = {}): MbApartment {
  return {
    id: "1",
    name: "테스트단지",
    region: "서울",
    naver_school_walk_min: 5,
    crime_safety_grade: 2,
    ...overrides,
  } as MbApartment;
}

/** 상세 API 가 주는 형태 — 중첩 infra/school/transport 채워짐 (A 수정 후 lazy fetch 결과). */
function detailApt(overrides: Partial<MbApartment> = {}): MbApartment {
  return {
    ...flatApt(),
    school: { school_grade: "A" },
    transport: { subway_name: "강남역", subway_lines: "2호선", subway_dist: 350 },
    infra: {
      air_grade: "좋음",
      childcare_count: 12,
      childcare_nearest_name: "햇빛어린이집",
      childcare_nearest_dist: 1200,
      crime_grade: "A",
    },
    ...overrides,
  } as MbApartment;
}

describe("MbInfraOverlay — 목록형 apt(평탄만, 중첩 없음): A 수정 전 prod 동작 박제", () => {
  it("교통 레이어는 transport 중첩이 없어 '정보 없음'을 표시한다", () => {
    render(<MbInfraOverlay apt={flatApt()} layer="transit" />);
    expect(screen.getByText(/이 단지는 해당 정보가 없습니다/)).toBeInTheDocument();
  });

  it("대기질 레이어는 infra.air_grade 가 없어 '정보 없음'을 표시한다", () => {
    render(<MbInfraOverlay apt={flatApt()} layer="air" />);
    expect(screen.getByText(/이 단지는 해당 정보가 없습니다/)).toBeInTheDocument();
  });

  it("어린이집 레이어는 infra.childcare 가 없어 '정보 없음'을 표시한다", () => {
    render(<MbInfraOverlay apt={flatApt()} layer="childcare" />);
    expect(screen.getByText(/이 단지는 해당 정보가 없습니다/)).toBeInTheDocument();
  });

  it("학군 레이어는 평탄 naver_school_walk_min 폴백으로 도보분만 표시(등급은 미표시)", () => {
    render(<MbInfraOverlay apt={flatApt()} layer="school" />);
    expect(screen.getByText("초등 도보")).toBeInTheDocument();
    expect(screen.getByText("5분")).toBeInTheDocument();
    expect(screen.queryByText("학군 등급")).not.toBeInTheDocument();
  });
});

describe("MbInfraOverlay — 상세형 apt(중첩 채움): A 수정 후 동작", () => {
  it("교통 레이어가 지하철역+노선+거리를 표시한다", () => {
    render(<MbInfraOverlay apt={detailApt()} layer="transit" />);
    expect(screen.getByText("지하철역")).toBeInTheDocument();
    expect(screen.getByText("강남역 (2호선)")).toBeInTheDocument();
    expect(screen.getByText("350m")).toBeInTheDocument();
  });

  it("대기질 레이어가 등급을 표시한다", () => {
    render(<MbInfraOverlay apt={detailApt()} layer="air" />);
    expect(screen.getByText("대기질 등급")).toBeInTheDocument();
    expect(screen.getByText("좋음")).toBeInTheDocument();
  });

  it("어린이집 레이어가 개수+이름+거리를 표시한다", () => {
    render(<MbInfraOverlay apt={detailApt()} layer="childcare" />);
    expect(screen.getByText("12개")).toBeInTheDocument();
    expect(screen.getByText("햇빛어린이집")).toBeInTheDocument();
  });

  it("학군 레이어가 도보분+등급을 모두 표시한다", () => {
    render(<MbInfraOverlay apt={detailApt()} layer="school" />);
    expect(screen.getByText("5분")).toBeInTheDocument();
    expect(screen.getByText("학군 등급")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});

describe("MbInfraOverlay — C: 안전 등급 단위·범례·라벨 분리", () => {
  it("단지 안전등급(숫자)에 범례 '(1=안전)' 를 붙인다", () => {
    render(<MbInfraOverlay apt={flatApt({ crime_safety_grade: 2 })} layer="safety" />);
    expect(screen.getByText("단지 안전 등급")).toBeInTheDocument();
    expect(screen.getByText("2등급 (1=안전)")).toBeInTheDocument();
  });

  it("지역 안전등급(infra.crime_grade)과 단지 안전등급을 별도 행으로 표시한다", () => {
    render(<MbInfraOverlay apt={detailApt()} layer="safety" />);
    expect(screen.getByText("지역 안전 등급")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("단지 안전 등급")).toBeInTheDocument();
    expect(screen.getByText("2등급 (1=안전)")).toBeInTheDocument();
  });

  it("안전 정보가 전혀 없으면 '정보 없음'", () => {
    render(<MbInfraOverlay apt={flatApt({ crime_safety_grade: undefined })} layer="safety" />);
    expect(screen.getByText(/이 단지는 해당 정보가 없습니다/)).toBeInTheDocument();
  });
});

describe("MbInfraOverlay — 로딩/에러 상태(error-propagation.md)", () => {
  it("데이터 없고 loading 이면 '불러오는 중'을 표시한다", () => {
    render(<MbInfraOverlay apt={flatApt()} layer="air" loading />);
    expect(screen.getByText(/정보를 불러오는 중/)).toBeInTheDocument();
  });

  it("데이터 없고 error 면 '불러오지 못했습니다'를 표시한다", () => {
    render(<MbInfraOverlay apt={flatApt()} layer="transit" error />);
    expect(screen.getByText(/정보를 불러오지 못했습니다/)).toBeInTheDocument();
  });

  it("error 가 loading 보다 우선한다", () => {
    render(<MbInfraOverlay apt={flatApt()} layer="childcare" loading error />);
    expect(screen.getByText(/정보를 불러오지 못했습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/불러오는 중/)).not.toBeInTheDocument();
  });

  it("평탄 폴백이 있으면 loading 중에도 폴백을 즉시 표시(학군 도보분)", () => {
    render(<MbInfraOverlay apt={flatApt()} layer="school" loading />);
    expect(screen.getByText("5분")).toBeInTheDocument();
    expect(screen.queryByText(/불러오는 중/)).not.toBeInTheDocument();
  });
});

describe("MbInfraOverlay — dist 단위 변환 경계", () => {
  it("1000m 미만은 m 로 표시한다 (999m)", () => {
    render(<MbInfraOverlay apt={detailApt({ transport: { subway_name: "역", subway_dist: 999 } })} layer="transit" />);
    expect(screen.getByText("999m")).toBeInTheDocument();
  });

  it("1000m 이상은 km 로 표시한다 (1.0km)", () => {
    render(<MbInfraOverlay apt={detailApt({ transport: { subway_name: "역", subway_dist: 1000 } })} layer="transit" />);
    expect(screen.getByText("1.0km")).toBeInTheDocument();
  });
});
