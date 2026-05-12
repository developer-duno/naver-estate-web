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

  it("apt.noise 가 있으면 소음 섹션이 렌더된다 (dB 단위)", () => {
    const apt = makeApt({ noise: 55.5 });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.getByText("소음")).toBeInTheDocument();
    expect(screen.getByText("55.5 dB")).toBeInTheDocument();
  });

  it("apt.noise 가 null 이면 소음 섹션이 렌더되지 않는다", () => {
    const apt = makeApt({
      infra: { childcare_count: 5 },
    });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.queryByText("소음")).not.toBeInTheDocument();
  });

  it("noise 만 있고 다른 환경 데이터 모두 없으면 섹션이 렌더된다 (hasData = noise)", () => {
    const apt = makeApt({ noise: 60 });
    render(<EnvironmentSection apartment={apt} />);
    expect(screen.getByText("주변 환경")).toBeInTheDocument();
    expect(screen.getByText("60 dB")).toBeInTheDocument();
  });
});
