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
      air_annual: {
        pm25: 14.24, pm10: 28.0, o3: 0.029, years: "2022,2023,2024", band: "좋음",
        legend: "좋음 15 이하, 보통 19 이하, 나쁨 19 초과", updated_at: null,
      },
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

  it("대기질 레이어는 infra.air_annual 이 없어 '정보 없음'을 표시한다", () => {
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

  // 세션 472: 우리 등급(좋음/보통/나쁨) 줄은 지우고 PM2.5 + 국가 기준(연평균 15) 이하/초과 글자만
  it("대기질 레이어가 PM2.5 3년 평균과 국가 기준 이하/초과 글자를 표시하고 등급은 없다", () => {
    render(<MbInfraOverlay apt={detailApt()} layer="air" />);
    expect(screen.getByText("14.2㎍/㎥")).toBeInTheDocument();
    expect(screen.getByText("이 값은 국가 대기환경기준(연평균 15㎍/㎥) 이하")).toBeInTheDocument();
    expect(screen.queryByText("대기질 등급 (3년 평균)")).not.toBeInTheDocument();
    expect(screen.queryByText("좋음")).not.toBeInTheDocument();
  });

  it("PM2.5 가 15 를 넘으면 '초과'", () => {
    const apt = detailApt();
    const air = { ...apt.infra!.air_annual!, pm25: 15.1 };
    render(<MbInfraOverlay apt={{ ...apt, infra: { ...apt.infra, air_annual: air } }} layer="air" />);
    expect(screen.getByText("이 값은 국가 대기환경기준(연평균 15㎍/㎥) 초과")).toBeInTheDocument();
  });

  it("등급(band)만 있고 PM2.5 가 null 이면 '정보 없음'", () => {
    const apt = detailApt();
    const air = { ...apt.infra!.air_annual!, pm25: null };
    render(<MbInfraOverlay apt={{ ...apt, infra: { ...apt.infra, air_annual: air } }} layer="air" />);
    expect(screen.getByText(/이 단지는 해당 정보가 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText("좋음")).not.toBeInTheDocument();
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

  // 세션 472: 우리 지역 범죄 등급(infra.crime_grade)은 뺐다(인구 없는 지역 중앙값 채움) — 단지 등급만 남는다
  it("지역 안전등급(infra.crime_grade)이 있어도 보이지 않고 단지 안전등급만 보인다", () => {
    render(<MbInfraOverlay apt={detailApt()} layer="safety" />);
    expect(screen.queryByText("지역 안전 등급")).not.toBeInTheDocument();
    expect(screen.queryByText("A")).not.toBeInTheDocument();
    expect(screen.getByText("단지 안전 등급")).toBeInTheDocument();
    expect(screen.getByText("2등급 (1=안전)")).toBeInTheDocument();
  });

  it("안전 정보가 전혀 없으면 '정보 없음'", () => {
    render(<MbInfraOverlay apt={flatApt({ crime_safety_grade: undefined })} layer="safety" />);
    expect(screen.getByText(/이 단지는 해당 정보가 없습니다/)).toBeInTheDocument();
  });

  it("지역 범죄 등급만 있고 단지 등급이 없으면 '정보 없음'", () => {
    const apt = detailApt();
    render(<MbInfraOverlay apt={{ ...apt, crime_safety_grade: undefined }} layer="safety" />);
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
