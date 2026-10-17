/**
 * MbEnvironmentSection 테스트 — 학교 목록 / 정류장 / 소음도 / 어린이집 type·teachers
 * 실행: npx vitest run src/components/mb/__tests__/MbEnvironmentSection.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MbApartment } from "@/types";
import { EnvironmentSection } from "../MbEnvironmentSection";

function makeApt(overrides: Partial<MbApartment> = {}): MbApartment {
  return {
    id: "APT001",
    name: "테스트단지",
    region: "서울",
    ...overrides,
  };
}

describe("MbEnvironmentSection — 학군 섹션 (nearby_schools)", () => {
  it("nearby_schools 가 있으면 학교 목록이 렌더된다", () => {
    const apt = makeApt({
      school: {
        school_score: 80,
        school_grade: "A",
        nearby_schools: [
          { name: "역삼초등학교", type: "초", distance: 320, students: 800 },
          { name: "도성중학교", type: "중", distance: 540 },
        ],
      },
    });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.getByText("주변 학교 (가까운 순 최대 5개)")).toBeInTheDocument();
    expect(screen.getByText("역삼초등학교")).toBeInTheDocument();
    expect(screen.getByText("도성중학교")).toBeInTheDocument();
    expect(screen.getByText("(320m)")).toBeInTheDocument();
    expect(screen.getByText("학생 800명")).toBeInTheDocument();
  });

  it("nearby_schools 가 5개 초과면 상위 5개만 렌더된다", () => {
    const schools = Array.from({ length: 8 }, (_, i) => ({
      name: `학교${i + 1}`,
      type: "초",
      distance: 100 + i * 50,
    }));
    const apt = makeApt({
      school: { school_score: 80, nearby_schools: schools },
    });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.getByText("학교1")).toBeInTheDocument();
    expect(screen.getByText("학교5")).toBeInTheDocument();
    expect(screen.queryByText("학교6")).not.toBeInTheDocument();
    expect(screen.queryByText("학교8")).not.toBeInTheDocument();
  });

  it("nearby_schools 가 빈 배열이면 학교 목록 섹션이 렌더되지 않는다", () => {
    const apt = makeApt({
      school: { school_score: 80, nearby_schools: [] },
    });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.queryByText("주변 학교 (가까운 순 최대 5개)")).not.toBeInTheDocument();
  });

  it("nearby_schools 가 undefined 면 학교 목록 섹션이 렌더되지 않으나 학군 점수는 유지", () => {
    const apt = makeApt({
      school: { school_score: 80, school_grade: "A" },
    });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.queryByText("주변 학교 (가까운 순 최대 5개)")).not.toBeInTheDocument();
    expect(screen.getByText("학군 점수")).toBeInTheDocument();
  });
});

describe("MbEnvironmentSection — 교통 정류장 / 보육 type·teachers / 소음도 (단계 3B)", () => {
  it("transport.bus_stop_names 가 있으면 '주변 정류장:' 라벨과 함께 노출된다", () => {
    const apt = makeApt({
      transport: { bus_routes: 5, bus_stop_names: "역삼역.포스코사거리, 강남구청역" },
    });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.getByText("주변 정류장:")).toBeInTheDocument();
    expect(screen.getByText(/역삼역.포스코사거리/)).toBeInTheDocument();
  });

  it("transport.bus_stop_names 가 없으면 정류장 라벨이 렌더되지 않는다", () => {
    const apt = makeApt({
      transport: { bus_routes: 5 },
    });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.queryByText("주변 정류장:")).not.toBeInTheDocument();
  });

  it("infra.childcare_nearest_type + childcare_nearest_teachers 가 있으면 보육 섹션에 노출", () => {
    const apt = makeApt({
      infra: {
        childcare_count: 5,
        childcare_nearest_type: "국공립",
        childcare_nearest_teachers: 12,
      },
    });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.getByText("시설 유형")).toBeInTheDocument();
    expect(screen.getByText("국공립")).toBeInTheDocument();
    expect(screen.getByText("교사 수")).toBeInTheDocument();
    expect(screen.getByText("12명")).toBeInTheDocument();
  });

  // 세션 472: noise 는 측정값이 아니라 큰 도로 거리 구간에 붙인 추정 dB → 거리 구간 글로 보인다
  it("apt.noise 가 70 이면 큰 도로 거리 '50m 이내' + 추정 출처 줄이 보인다 (dB 글자 없음)", () => {
    const apt = makeApt({ noise: 70 });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.getByText("큰 도로 거리(추정)")).toBeInTheDocument();
    expect(screen.getByText("50m 이내")).toBeInTheDocument();
    expect(screen.getByText(/소음 측정값 아님/)).toBeInTheDocument();
    expect(screen.queryByText(/dB/)).not.toBeInTheDocument();
  });

  it("구간에 없는 noise 값(55.5)은 '-' 이고 기준 줄도 없다", () => {
    const apt = makeApt({ noise: 55.5 });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.getByText("큰 도로 거리(추정)").nextElementSibling?.textContent).toBe("-");
    expect(screen.queryByText(/소음 측정값 아님/)).not.toBeInTheDocument();
  });

  it("apt.noise 가 null 이면 소음 섹션이 렌더되지 않는다", () => {
    const apt = makeApt({
      infra: { childcare_count: 5 },
    });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.queryByText("큰 도로 거리(추정)")).not.toBeInTheDocument();
  });

  it("noise 만 있고 다른 환경 데이터 모두 없으면 섹션이 렌더된다 (hasData = noise)", () => {
    const apt = makeApt({ noise: 60 });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.getByText("주변 환경")).toBeInTheDocument();
    expect(screen.getByText("50~100m")).toBeInTheDocument();
  });
});

describe("MbEnvironmentSection — 응급실 일반병상 0/모름 구분 (세션 417)", () => {
  // 옛 화면은 `emergency_beds ? … : undefined` 라 0 과 null 이 똑같이 "-" 였다.
  it("emergency_beds 가 0 이면 '0병상' 으로 보인다 (확정값)", () => {
    const apt = makeApt({
      infra: { emergency_hospital: 1, emergency_hospital_dist: 120, emergency_beds: 0, emergency_level: "지역응급의료기관" },
    });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.getByText("응급실 일반병상").nextElementSibling?.textContent).toBe("0병상");
  });

  it("emergency_beds 가 null 이면 '-' 로 보인다 (모름)", () => {
    const apt = makeApt({
      infra: { emergency_hospital: 1, emergency_hospital_dist: 120, emergency_beds: null, emergency_level: "지역응급의료기관" },
    });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.getByText("응급실 일반병상").nextElementSibling?.textContent).toBe("-");
    expect(screen.queryByText("0병상")).not.toBeInTheDocument();
  });
});

// 대기질 3년 평균 블록 (세션604) — 실시간 값 대신 BE 가 붙이는 infra.air_annual 로 그린다
function makeAirAnnual(overrides: Partial<NonNullable<NonNullable<MbApartment["infra"]>["air_annual"]>> = {}) {
  return {
    pm25: 17.34,
    pm10: 33.1,
    o3: 0.0312,
    years: "2022,2023,2024",
    band: "보통" as const,
    legend: "좋음 15 이하, 보통 19 이하, 나쁨 19 초과",
    updated_at: "2026-09-22T03:00:00",
    ...overrides,
  };
}

describe("MbEnvironmentSection — 대기질 3년 평균 (air_annual)", () => {
  // 세션 472: 등급 뱃지·우리 등급 기준 문장은 지우고, PM2.5 값 + 국가 기준(연평균 15) 초과/이하 글만
  it("air_annual 이 있으면 제목·PM2.5 값·국가 기준 줄·측정소가 보이고 등급 뱃지는 없다", () => {
    const apt = makeApt({
      infra: { air_station_name: "강남대로", air_station_dist: 850, air_annual: makeAirAnnual() },
    });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.getByText("대기질 (3년 평균 2022~2024)")).toBeInTheDocument();
    expect(screen.getByText("17.3㎍/㎥ (3년 평균)")).toBeInTheDocument();
    expect(screen.getByText(/^이 값은 국가 대기환경기준\(연평균 15㎍\/㎥\) 초과 · 환경정책기본법 시행령 별표1/)).toBeInTheDocument();
    expect(screen.getByText("강남대로")).toBeInTheDocument();
    expect(screen.getByText("(850m)")).toBeInTheDocument();
    expect(screen.queryByText("보통")).not.toBeInTheDocument();
    expect(screen.queryByText(/등급 기준/)).not.toBeInTheDocument();
    expect(screen.queryByText(/19/)).not.toBeInTheDocument();
  });

  it("PM2.5 가 15.0 이면 국가 기준 '이하'", () => {
    const apt = makeApt({ infra: { air_annual: makeAirAnnual({ pm25: 15 }) } });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.getByText(/^이 값은 국가 대기환경기준\(연평균 15㎍\/㎥\) 이하 · /)).toBeInTheDocument();
  });

  it("air_annual 이 null 이면 대기질 블록이 없다 (측정소가 표에 없음)", () => {
    const apt = makeApt({
      infra: { air_station_name: "강남대로", air_station_dist: 850, air_annual: null, hospital: 3 },
    });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.queryByText(/대기질/)).not.toBeInTheDocument();
    expect(screen.queryByText("강남대로")).not.toBeInTheDocument();
  });

  it("air_annual 은 있지만 PM2.5 값이 null 이면 대기질 블록이 없다", () => {
    const apt = makeApt({
      infra: { air_station_name: "강남대로", air_annual: makeAirAnnual({ pm25: null, band: null }), hospital: 3 },
    });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.queryByText(/대기질/)).not.toBeInTheDocument();
  });
});
