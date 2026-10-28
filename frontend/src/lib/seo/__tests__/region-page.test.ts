/**
 * 지역 페이지 글자(세션 484 PR 3c-1b · B3) — 제목·설명(실제 숫자만, 없으면 문장째 뺌)·같은 이름 시도 한 번(세종·제주시)·
 * canonical·og siteName/locale/이미지·robots 네 갈래(indexable × 색인 스위치)·빵부스러기·옛 코드 표·사실 배지·정렬.
 * 실행: npx vitest run src/lib/seo/__tests__/region-page.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  GRADE_LABELS,
  HUB_DONG_LIMIT,
  INDEX_TITLE,
  REGION_CODE_REDIRECTS,
  REGION_PAGES_INDEX,
  SIDO_ORDER,
  dongAnchor,
  dongCrumbs,
  dongDescription,
  dongMetadata,
  dongTitle,
  gradeLabel,
  hubBasis,
  hubCrumbs,
  hubDescription,
  hubMetadata,
  hubTitle,
  indexCrumbs,
  indexMetadata,
  regionIndexGroups,
  regionName,
  sigunguLabel,
  sortComplexes,
} from "../region-page";
import { breadcrumbJsonLd } from "../complex-page";
import { REGION_CODES } from "../region-codes";
import { makeCard, makeDong, makeHub, makeTrend } from "./region-fixture";

describe("이름", () => {
  it("늘 {시도} {시군구} — 같은 이름 구가 여러 시도에 있다", () => {
    expect(regionName("대전", "유성구")).toBe("대전 유성구");
    expect(regionName("서울", "중구")).toBe("서울 중구");
  });

  it("시도와 같거나 시도로 시작하면 한 번만(세종시·제주시) · 시도가 없으면 시군구만", () => {
    expect(regionName("세종", "세종시")).toBe("세종시");
    expect(regionName("제주", "제주시")).toBe("제주시");
    expect(regionName("세종", "세종")).toBe("세종");
    expect(regionName(null, "유성구")).toBe("유성구");
  });

  it("이름표의 빈 시군구(세종) = '세종시'", () => {
    expect(sigunguLabel("세종", "")).toBe("세종시");
    expect(sigunguLabel("대전", "유성구")).toBe("유성구");
  });
});

describe("제목", () => {
  it("목록·허브·동 — 템플릿 '| 2u부동산' 은 루트가 붙인다", () => {
    expect(INDEX_TITLE).toBe("전국 아파트 실거래가·공시가격 — 시도·시군구별");
    expect(hubTitle(makeHub())).toBe("대전 유성구 아파트 실거래가·공시가격");
    expect(dongTitle(makeDong())).toBe("대전 유성구 봉명동 아파트 실거래가·공시가격");
    expect(hubTitle(makeHub({ sido: "세종", sigungu_name: "세종시" }))).toBe("세종시 아파트 실거래가·공시가격");
  });
});

describe("설명 — 실제 숫자만", () => {
  it("허브 = 단지 N곳·M개 동 + 지역 마지막 달 중위 매매가(한국부동산원 YYYY.MM)", () => {
    expect(hubDescription(makeHub())).toBe(
      "대전 유성구 아파트 단지 16곳·2개 동. 최근 중위 매매가 4억 600만(한국부동산원 2026.09), 단지별 실거래가 범위·공시가격·관리비.",
    );
  });

  it("허브 — 지역 추이가 없으면 중위 문장째 뺀다 · 마지막 달 값이 비면 값 있는 달", () => {
    expect(hubDescription(makeHub({ region_trend: null }))).toBe(
      "대전 유성구 아파트 단지 16곳·2개 동. 단지별 실거래가 범위·공시가격·관리비.",
    );
    const t = makeTrend();
    t.items[2] = { ...t.items[2], sale_price_median: null };
    expect(hubDescription(makeHub({ region_trend: t }))).toContain("최근 중위 매매가 4억 300만(한국부동산원 2025.09)");
  });

  it("동 = 단지 N곳, 실거래 범위 있는 단지 K곳 · K 가 0 이면 그 말을 뺀다", () => {
    expect(dongDescription(makeDong())).toBe(
      "대전 유성구 봉명동 아파트 단지 13곳, 실거래 범위 있는 단지 5곳. 단지별 실거래가 범위·공시가격·동네 통계.",
    );
    const none = makeDong({ complexes: [makeCard({ recent6_min: null, recent6_max: null })] });
    expect(dongDescription(none)).toBe("대전 유성구 봉명동 아파트 단지 1곳. 단지별 실거래가 범위·공시가격·동네 통계.");
  });

  it("허브 '자료 기준' = 지역 추이 마지막 달 · 없으면 null", () => {
    expect(hubBasis(makeHub())).toBe("2026.09");
    expect(hubBasis(makeHub({ region_trend: null }))).toBeNull();
  });
});

describe("메타", () => {
  it("canonical·og:url 자기 주소 · og siteName/locale · 루트 og 이미지 명시(상속 끊김 방지)", () => {
    const m = hubMetadata(makeHub());
    expect(m.alternates?.canonical).toBe("/region/30200");
    const og = m.openGraph as Record<string, unknown>;
    expect(og.url).toBe("/region/30200");
    expect(og.siteName).toBe("2u부동산");
    expect(og.locale).toBe("ko_KR");
    expect(og.images).toEqual([{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }]);
    expect(dongMetadata(makeDong()).alternates?.canonical).toBe("/region/30200/3020011800");
    expect((dongMetadata(makeDong()).openGraph as Record<string, unknown>).url).toBe("/region/30200/3020011800");
    expect(indexMetadata().alternates?.canonical).toBe("/region");
  });

  it("robots 네 갈래 — indexable && 색인 스위치일 때만 index", () => {
    const yes = { index: true, follow: true };
    const no = { index: false, follow: true };
    expect(REGION_PAGES_INDEX).toBe(true);
    expect(hubMetadata(makeHub({ indexable: true }), true).robots).toEqual(yes);
    expect(hubMetadata(makeHub({ indexable: false }), true).robots).toEqual(no);
    expect(hubMetadata(makeHub({ indexable: true }), false).robots).toEqual(no);
    expect(hubMetadata(makeHub({ indexable: false }), false).robots).toEqual(no);
    expect(dongMetadata(makeDong({ indexable: true }), true).robots).toEqual(yes);
    expect(dongMetadata(makeDong({ indexable: false }), true).robots).toEqual(no);
    expect(dongMetadata(makeDong({ indexable: true }), false).robots).toEqual(no);
    expect(indexMetadata(true).robots).toEqual(yes);
    expect(indexMetadata(false).robots).toEqual(no);
  });

  it("기본값 = 색인 스위치", () => {
    expect(hubMetadata(makeHub())).toEqual(hubMetadata(makeHub(), REGION_PAGES_INDEX));
  });
});

describe("빵부스러기", () => {
  it("목록 = 홈 › 전국", () => {
    expect(indexCrumbs()).toEqual([{ name: "홈", href: "/" }, { name: "전국", href: "/region" }]);
  });

  it("허브 = 홈 › 시도(글자) › 시군구 · 동 = 홈 › 시도 › 시군구(허브 링크) › 동", () => {
    expect(hubCrumbs(makeHub())).toEqual([
      { name: "홈", href: "/" },
      { name: "대전", href: null },
      { name: "유성구", href: "/region/30200" },
    ]);
    expect(dongCrumbs(makeDong())).toEqual([
      { name: "홈", href: "/" },
      { name: "대전", href: null },
      { name: "유성구", href: "/region/30200" },
      { name: "봉명동", href: "/region/30200/3020011800" },
    ]);
  });

  it("JSON-LD — 주소 있는 단계만 · 같은 경로 0", () => {
    const ld = breadcrumbJsonLd(dongCrumbs(makeDong())) as { itemListElement: { name: string; item: string }[] };
    expect(ld.itemListElement.map((e) => e.name)).toEqual(["홈", "유성구", "봉명동"]);
    const paths = ld.itemListElement.map((e) => new URL(e.item).pathname);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("전국 목록 묶음(결정 34 · 메인 결정 ⓐ)", () => {
  it("이름표 253곳 전부 · 시도 17개 표준 순 · 시도 안 코드 순 · 세종 = '세종시' · 색인 밖 영양군도 있다", () => {
    const groups = regionIndexGroups(REGION_CODES);
    expect(groups.map((g) => g.sido)).toEqual(SIDO_ORDER);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(253);
    const codes = groups.flatMap((g) => g.items.map((i) => i.code));
    expect(new Set(codes).size).toBe(253);
    for (const g of groups) expect(g.items.map((i) => i.code)).toEqual([...g.items.map((i) => i.code)].sort());
    expect(groups.find((g) => g.sido === "세종")!.items).toEqual([{ code: "36110", name: "세종시" }]);
    expect(codes).toContain("47760");
  });

  it("표준 순에 없는 시도는 맨 뒤", () => {
    const groups = regionIndexGroups({ "99999": { sido: "새도", sigungu: "새구" }, "11110": { sido: "서울", sigungu: "종로구" } });
    expect(groups.map((g) => g.sido)).toEqual(["서울", "새도"]);
  });
});

describe("표·앵커·옛 코드", () => {
  it("옛 시군구 코드 표는 비어 시작(결정 20)", () => {
    expect(REGION_CODE_REDIRECTS).toEqual({});
  });

  it("앵커 = #동코드 · 허브 동 묶음 12곳(결정 35)", () => {
    expect(dongAnchor("3020011800")).toBe("#3020011800");
    expect(HUB_DONG_LIMIT).toBe(12);
  });

  it("사실 배지 — 등급 글자 대신 사실(결정 33)", () => {
    expect(gradeLabel("A")).toBe("실거래 있음");
    expect(gradeLabel("B")).toBe("공시가격·관리비만");
    expect(gradeLabel("C")).toBe("공공 자료 없음");
    for (const label of Object.values(GRADE_LABELS)) expect(label).not.toMatch(/\b[ABC]\b/);
  });

  it("정렬 — 세대수 큰 순 · 세대수 없으면 뒤 · 같으면 이름 순 · 원본 그대로", () => {
    const list = [
      makeCard({ complex_no: "1", name: "다", household_count: 100 }),
      makeCard({ complex_no: "2", name: "가", household_count: null }),
      makeCard({ complex_no: "3", name: "나", household_count: 300 }),
      makeCard({ complex_no: "4", name: "가", household_count: 100 }),
    ];
    expect(sortComplexes(list).map((c) => c.complex_no)).toEqual(["3", "4", "1", "2"]);
    expect(list.map((c) => c.complex_no)).toEqual(["1", "2", "3", "4"]);
  });
});
