/**
 * subway-format 순수 함수 단위 테스트 — 역명 접미사 규칙 + 거리 표기 경계(999/1000).
 * 실행: npx vitest run src/lib/__tests__/subway-format.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  formatStationName,
  formatDistance,
  formatStation,
  formatSubwayStations,
  normalizeLineName,
} from "@/lib/subway-format";
import type { SubwayStationNear } from "@/types";

/** 테스트용 역 팩토리 — 필요한 필드만 덮어쓴다 */
function makeStation(overrides: Partial<SubwayStationNear> = {}): SubwayStationNear {
  return { station_name: "강남", lines: ["2호선"], distance_m: 320, ...overrides };
}

describe("formatStationName — 역 접미사", () => {
  it("'역'으로 끝나지 않으면 '역'을 붙인다", () => {
    expect(formatStationName("강남")).toBe("강남역");
  });

  it("이미 '역'으로 끝나면 중복해서 붙이지 않는다", () => {
    expect(formatStationName("강남역")).toBe("강남역");
  });

  it("역명 중간에 '역'이 있어도 끝이 아니면 붙인다 (예: 역곡)", () => {
    expect(formatStationName("역곡")).toBe("역곡역");
  });
});

describe("formatDistance — 1000m 경계", () => {
  it("999m 는 미터 표기 (경계 바로 아래)", () => {
    expect(formatDistance(999)).toBe("999m");
  });

  it("1000m 는 km 표기 (경계 딱 맞음)", () => {
    expect(formatDistance(1000)).toBe("1.0km");
  });

  it("1000m 미만은 미터 표기", () => {
    expect(formatDistance(320)).toBe("320m");
  });

  it("1000m 초과는 소수 1자리 km 표기", () => {
    expect(formatDistance(2450)).toBe("2.5km");
  });

  it("미터 표기는 정수로 반올림한다", () => {
    expect(formatDistance(320.6)).toBe("321m");
  });
});

describe("normalizeLineName — 표시용 노선명 정규화 (규칙 기반)", () => {
  // BE line_name 실측 47종 기준. 도시·권역 접두어는 보존, 모드 단어만 제거.
  it.each([
    ["서울 도시철도 9호선", "서울 9호선"],
    ["수도권 도시철도 9호선", "수도권 9호선"],
    ["부산 도시철도 1호선", "부산 1호선"],
    ["대구 도시철도 2호선", "대구 2호선"],
    ["대전 도시철도 1호선", "대전 1호선"],
    ["광주도시철도 1호선", "광주 1호선"], // 접두어가 붙어쓰인 케이스
    ["인천지하철 1호선", "인천 1호선"], // "지하철" 모드 단어
    ["도시철도 7호선", "7호선"], // 접두어 없이 모드 단어만
    ["수도권 광역철도 8호선", "수도권 8호선"],
    ["수도권 경량도시철도 신림선", "수도권 신림선"], // 긴 모드 단어 우선 매칭
    ["부산 경량도시철도 4호선", "부산 4호선"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeLineName(input)).toBe(expected);
  });

  // 모드 단어가 없거나, 빼면 노선이 아니게 되는 것들은 원본 그대로.
  it.each([
    ["신분당선"],
    ["경의중앙선"],
    ["의정부"],
    ["2호선"],
    ["분당선"],
    ["에버라인"],
    ["인천국제공항선"],
    ["부산김해경전철"], // "경전철" 은 모드 단어 목록에 없음
    ["김포도시철도"], // 빼면 "김포"(도시명)만 남아 노선이 아님 → 원본 유지
    ["자기부상철도"], // 이름 자체가 "철도" — 모드 단어 미매칭
    ["S2801"],
  ])("%s 는 그대로 둔다", (input) => {
    expect(normalizeLineName(input)).toBe(input);
  });

  it("연속 공백을 정리한다", () => {
    expect(normalizeLineName("서울  도시철도   9호선")).toBe("서울 9호선");
  });

  it("빈 문자열·공백만 있으면 원본을 그대로 반환한다 (크래시 없음)", () => {
    expect(normalizeLineName("")).toBe("");
    expect(normalizeLineName("   ")).toBe("   ");
  });
});

describe("formatStation — 역 1건 표시", () => {
  it("환승역은 노선을 · 로 연결한다", () => {
    const s = makeStation({ lines: ["2호선", "신분당선"] });
    expect(formatStation(s)).toBe("강남역 (2호선·신분당선) 320m");
  });

  it("단일 노선은 괄호 안에 하나만 표시", () => {
    const s = makeStation({ station_name: "역삼", lines: ["2호선"], distance_m: 540 });
    expect(formatStation(s)).toBe("역삼역 (2호선) 540m");
  });

  it("노선 배열이 비면 괄호부를 생략한다", () => {
    const s = makeStation({ lines: [] });
    expect(formatStation(s)).toBe("강남역 320m");
  });

  it("1km 이상 역은 km 표기로 나온다", () => {
    const s = makeStation({ station_name: "선릉", lines: ["2호선"], distance_m: 1200 });
    expect(formatStation(s)).toBe("선릉역 (2호선) 1.2km");
  });

  it("장황한 노선명은 정규화되어 표시된다 (normalizeLineName 경로 연결 확인)", () => {
    const s = makeStation({
      station_name: "당산",
      lines: ["서울 도시철도 9호선"],
      distance_m: 320,
    });
    expect(formatStation(s)).toBe("당산역 (서울 9호선) 320m");
  });

  it("환승역의 여러 노선이 각각 정규화된다", () => {
    const s = makeStation({
      station_name: "당산",
      lines: ["2호선", "서울 도시철도 9호선"],
      distance_m: 320,
    });
    expect(formatStation(s)).toBe("당산역 (2호선·서울 9호선) 320m");
  });
});

describe("formatSubwayStations — 여러 역 연결", () => {
  it("여러 역을 ' · ' 로 이어 붙인다", () => {
    const stations = [
      makeStation({ station_name: "강남", lines: ["2호선", "신분당선"], distance_m: 320 }),
      makeStation({ station_name: "역삼", lines: ["2호선"], distance_m: 540 }),
    ];
    expect(formatSubwayStations(stations)).toBe(
      "강남역 (2호선·신분당선) 320m · 역삼역 (2호선) 540m",
    );
  });

  it("빈 배열이면 빈 문자열 — 호출부가 행을 생략하는 신호", () => {
    expect(formatSubwayStations([])).toBe("");
  });

  it("역 1건이면 구분자 없이 그 역만", () => {
    expect(formatSubwayStations([makeStation()])).toBe("강남역 (2호선) 320m");
  });
});
