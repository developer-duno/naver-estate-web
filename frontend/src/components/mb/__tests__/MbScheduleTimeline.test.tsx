/**
 * MbScheduleTimeline / MbUnitSupplyTable 테스트 (세션 314 PR E).
 * 실행: npx vitest run src/components/mb/__tests__/MbScheduleTimeline.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MbPresaleSchedule, MbUnitSupply, MbPresaleSummary } from "@/types";
import MbScheduleTimeline from "../MbScheduleTimeline";
import MbUnitSupplyTable from "../MbUnitSupplyTable";

function makeSchedule(o: Partial<MbPresaleSchedule> & { id: number; house_manage_no: string }): MbPresaleSchedule {
  return { apartment_id: "A", ...o };
}

function makeUnit(o: Partial<MbUnitSupply> & { id: number; model_no: string }): MbUnitSupply {
  return { apartment_id: "A", house_manage_no: "H", special_supply_breakdown: [], ...o };
}

describe("MbScheduleTimeline — 청약 일정 타임라인", () => {
  it("일정 날짜가 YYYY.MM.DD 로 표시된다", () => {
    render(<MbScheduleTimeline schedules={[makeSchedule({ id: 1, house_manage_no: "H1", recruit_date: "2026-06-05", winner_announce_date: "2026-06-20" })]} />);
    expect(screen.getByText("모집공고일")).toBeInTheDocument();
    expect(screen.getByText("2026.06.05")).toBeInTheDocument();
    expect(screen.getByText("당첨자 발표")).toBeInTheDocument();
    expect(screen.getByText("2026.06.20")).toBeInTheDocument();
  });

  it("특별공급 접수 기간이 '~' 로 표시된다", () => {
    render(<MbScheduleTimeline schedules={[makeSchedule({ id: 1, house_manage_no: "H1", special_receipt_bgnde: "2026-06-08", special_receipt_endde: "2026-06-10" })]} />);
    expect(screen.getByText("2026.06.08 ~ 2026.06.10")).toBeInTheDocument();
  });

  it("값 없는 일정 행은 렌더되지 않는다 (recruit_date 만 있으면 계약기간 미표시)", () => {
    render(<MbScheduleTimeline schedules={[makeSchedule({ id: 1, house_manage_no: "H1", recruit_date: "2026-06-05" })]} />);
    expect(screen.queryByText("계약 기간")).not.toBeInTheDocument();
  });

  it("차수 2개면 공고번호로 분리된다", () => {
    render(
      <MbScheduleTimeline
        schedules={[
          makeSchedule({ id: 1, house_manage_no: "H1", pblanc_no: "2026000001", recruit_date: "2026-05-01" }),
          makeSchedule({ id: 2, house_manage_no: "H2", pblanc_no: "2026000002", recruit_date: "2026-06-01" }),
        ]}
      />,
    );
    expect(screen.getByText("공고 2026000001")).toBeInTheDocument();
    expect(screen.getByText("공고 2026000002")).toBeInTheDocument();
  });

  it("청약홈 공고 URL 링크가 있으면 표시된다", () => {
    render(<MbScheduleTimeline schedules={[makeSchedule({ id: 1, house_manage_no: "H1", pblanc_url: "https://applyhome.example/notice" })]} />);
    const link = screen.getByText("청약홈 공고 보기 →");
    expect(link).toHaveAttribute("href", "https://applyhome.example/notice");
  });

  it("빈 일정이면 안내 문구", () => {
    render(<MbScheduleTimeline schedules={[]} />);
    expect(screen.getByText("등록된 청약 일정이 없습니다.")).toBeInTheDocument();
  });
});

describe("MbUnitSupplyTable — 평형별 공급", () => {
  const summary: MbPresaleSummary = {
    total_general_supply: 80,
    total_special_supply: 30,
    total_supply: 110,
    special_by_type_total: [
      { key: "dazanyeo", label: "다자녀", count: 10 },
      { key: "sinhon", label: "신혼부부", count: 20 },
    ],
    max_top_amount: 120000,
    min_top_amount: 80000,
    unit_type_count: 2,
    schedule_count: 1,
  };

  it("house_ty 가 평형 포맷으로 표시된다 ('051.0000A' → '51㎡A')", () => {
    render(<MbUnitSupplyTable units={[makeUnit({ id: 1, model_no: "1", house_ty: "051.0000A", general_supply: 50, special_supply: 10 })]} />);
    expect(screen.getByText("51㎡A")).toBeInTheDocument();
  });

  it("특공 세부가 한글 라벨로 표시된다", () => {
    render(
      <MbUnitSupplyTable
        units={[
          makeUnit({
            id: 1, model_no: "1", house_ty: "084.0000",
            special_supply_breakdown: [
              { key: "dazanyeo", label: "다자녀", count: 5 },
              { key: "sinhon", label: "신혼부부", count: 3 },
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByText("다자녀 5")).toBeInTheDocument();
    expect(screen.getByText("신혼부부 3")).toBeInTheDocument();
  });

  it("요약 집계(총 공급/일반/특별)가 표시된다", () => {
    render(<MbUnitSupplyTable units={[makeUnit({ id: 1, model_no: "1" })]} summary={summary} />);
    expect(screen.getByText("110세대")).toBeInTheDocument(); // 총 공급
    expect(screen.getByText("80세대")).toBeInTheDocument(); // 일반
    expect(screen.getByText("30세대")).toBeInTheDocument(); // 특별
  });

  it("특공 유형별 합산(전 평형)이 표시된다", () => {
    render(<MbUnitSupplyTable units={[makeUnit({ id: 1, model_no: "1" })]} summary={summary} />);
    expect(screen.getByText("다자녀 10세대")).toBeInTheDocument();
    expect(screen.getByText("신혼부부 20세대")).toBeInTheDocument();
  });

  it("빈 공급이면 안내 문구", () => {
    render(<MbUnitSupplyTable units={[]} />);
    expect(screen.getByText("등록된 평형별 공급정보가 없습니다.")).toBeInTheDocument();
  });
});
