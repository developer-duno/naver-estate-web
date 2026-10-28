/**
 * 단지 화면 메타·빵부스러기(세션 483 PR 3b, 설계 v2 §4-2 · 결정 14) — 제목 등급·꼬리 5종 · 설명은 있는 숫자만 ·
 * canonical/og:url 자기 주소 · robots 는 indexable 하나로 · 지역 페이지 플래그 false 면 /region 주소 0.
 * 실행: npx vitest run src/lib/seo/__tests__/complex-page.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  REGION_PAGES_ENABLED,
  breadcrumbJsonLd,
  complexCrumbs,
  complexDescription,
  complexMetadata,
  complexTitle,
} from "../complex-page";
import { makeSummary } from "./summary-fixture";

describe("제목", () => {
  it("A = 실거래가·공시가격 / B·C = 공시가격·관리비", () => {
    expect(complexTitle(makeSummary())).toBe("햇살마을 실거래가·공시가격");
    expect(complexTitle(makeSummary({ grade: "B" }))).toBe("햇살마을 공시가격·관리비");
    expect(complexTitle(makeSummary({ grade: "C" }))).toBe("햇살마을 공시가격·관리비");
  });

  it("제목 단어 = 실제 있는 자료만(맹점🟡) — 공시가격 없는 A·공시가격/관리비 하나뿐인 B·둘 다 없는 C", () => {
    expect(complexTitle(makeSummary({ official_price: null }))).toBe("햇살마을 실거래가");
    expect(complexTitle(makeSummary({ official_price: { year: "2026", items: [] } }))).toBe("햇살마을 실거래가");
    expect(complexTitle(makeSummary({ grade: "B", kapt_cost: null }))).toBe("햇살마을 공시가격");
    expect(complexTitle(makeSummary({ grade: "B", official_price: null }))).toBe("햇살마을 관리비");
    expect(complexTitle(makeSummary({ grade: "C", official_price: null, kapt_cost: null }))).toBe("햇살마을 단지 정보");
  });

  it("같은 이름 단지 꼬리 5종 — 판정은 백엔드 title_suffix", () => {
    expect(complexTitle(makeSummary({ title_suffix: "none" }))).toBe("햇살마을 실거래가·공시가격");
    expect(complexTitle(makeSummary({ title_suffix: "dong" }))).toBe("햇살마을 실거래가·공시가격 (봉명동)");
    expect(complexTitle(makeSummary({ title_suffix: "dong_households" }))).toBe("햇살마을 실거래가·공시가격 (봉명동 1,200세대)");
    expect(complexTitle(makeSummary({ title_suffix: "dong_year" }))).toBe("햇살마을 실거래가·공시가격 (봉명동 1998년)");
    expect(complexTitle(makeSummary({ title_suffix: "dong_no" }))).toBe("햇살마을 실거래가·공시가격 (봉명동 6139)");
  });

  it("지역이 없으면 꼬리 없음", () => {
    expect(complexTitle(makeSummary({ breadcrumb: null, title_suffix: "dong" }))).toBe("햇살마을 실거래가·공시가격");
  });
});

describe("설명 — 실제 숫자만, 없는 항목은 문장째 뺀다", () => {
  it("다 있을 때 — 대표 면적 6개월 범위·건수 · 대표 면적 공시가격 · 관리비", () => {
    expect(complexDescription(makeSummary())).toBe(
      "유성구 봉명동 햇살마을 1,200세대·1998년. 84㎡ 최근 6개월 실거래 4억 1,000만~4억 5,500만(6건), 공시가격 3억 1,000만, 관리비 월 약 22만 원. 국토교통부·K-apt 공공데이터.",
    );
  });

  it("대표 면적 6개월 거래가 없으면 '최근 2년 {최저}~{최고}'", () => {
    expect(complexDescription(makeSummary({ rep_area_key: 114, official_price: null, kapt_cost: null }))).toBe(
      "유성구 봉명동 햇살마을 1,200세대·1998년. 114㎡ 최근 2년 5억 2,000만~5억 6,000만. 국토교통부 공공데이터.",
    );
  });

  it("자료가 하나도 없고 지역도 없으면 첫 문장만 — 빈 값·출처 문장 없음", () => {
    const d = complexDescription(
      makeSummary({ breadcrumb: null, area_ranges: [], official_price: null, kapt_cost: null, household_count: null, use_approve_year: null }),
    );
    expect(d).toBe("햇살마을.");
    expect(d).not.toMatch(/undefined|null|NaN|공공데이터/);
  });

  it("광고 금지 낱말 0", () => {
    const d = complexDescription(makeSummary());
    for (const w of ["최고의", "유일한", "최저 금리", "다른 곳보다"]) expect(d).not.toContain(w);
  });
});

describe("메타", () => {
  it("canonical·og:url = 자기 주소 · og 이미지 명시(상속 끊김 방지) · twitter 제목", () => {
    const m = complexMetadata(makeSummary());
    expect(m.alternates?.canonical).toBe("/complex/6139");
    expect(m.openGraph).toMatchObject({ url: "/complex/6139", title: "햇살마을 실거래가·공시가격" });
    expect((m.openGraph as { images: { url: string }[] }).images[0].url).toBe("/opengraph-image");
    expect(m.twitter).toMatchObject({ title: "햇살마을 실거래가·공시가격" });
    // 루트 layout 과 같은 사이트 칸(openGraph 를 직접 쓰면 상속이 끊긴다 — 적대🟡4)
    expect(m.openGraph).toMatchObject({ siteName: "2u부동산", locale: "ko_KR" });
  });

  it("robots — indexable 이면 index,follow / 아니면 noindex,follow (등급이 A 여도 indexable 이 기준)", () => {
    expect(complexMetadata(makeSummary({ indexable: true })).robots).toEqual({ index: true, follow: true });
    expect(complexMetadata(makeSummary({ indexable: false })).robots).toEqual({ index: false, follow: true });
    expect(complexMetadata(makeSummary({ grade: "A", indexable: false, has_region: false, breadcrumb: null })).robots).toEqual({
      index: false,
      follow: true,
    });
  });
});

describe("빵부스러기", () => {
  it("지역 페이지 플래그는 3c-1b 부터 true(기본값 = 플래그)", () => {
    expect(REGION_PAGES_ENABLED).toBe(true);
    expect(complexCrumbs(makeSummary())).toEqual(complexCrumbs(makeSummary(), true));
  });

  it("플래그 false(인자) — 홈 › 시도 › 시군구 › 동 › 단지, /region 주소 0", () => {
    const crumbs = complexCrumbs(makeSummary(), false);
    expect(crumbs.map((c) => c.name)).toEqual(["홈", "대전", "유성구", "봉명동", "햇살마을"]);
    expect(crumbs.map((c) => c.href)).toEqual(["/", null, null, null, "/complex/6139"]);
    expect(JSON.stringify(breadcrumbJsonLd(crumbs))).not.toContain("/region");
  });

  it("플래그 true — 시군구 = 허브, 동 = 동 페이지(있으면)·없으면 허브 안 그 동 앵커(v2 O3) · 시도는 늘 글자만", () => {
    expect(complexCrumbs(makeSummary(), true).map((c) => c.href)).toEqual([
      "/", null, "/region/30200", "/region/30200/3020011800", "/complex/6139",
    ]);
    const noPage = makeSummary({ breadcrumb: { ...makeSummary().breadcrumb!, dong_has_page: false } });
    expect(complexCrumbs(noPage, true)[3].href).toBe("/region/30200#3020011800");
  });

  it("동 페이지 없는 동 — JSON-LD 에서 허브와 같은 경로(앵커 뗀 주소)가 두 번이면 뒤 단계(동)를 뺀다(🟡9)", () => {
    const noPage = makeSummary({ breadcrumb: { ...makeSummary().breadcrumb!, dong_has_page: false } });
    const ld = breadcrumbJsonLd(complexCrumbs(noPage, true)) as { itemListElement: { name: string; item: string; position: number }[] };
    expect(ld.itemListElement.map((e) => e.name)).toEqual(["홈", "유성구", "햇살마을"]);
    expect(ld.itemListElement.map((e) => e.position)).toEqual([1, 2, 3]);
    const paths = ld.itemListElement.map((e) => new URL(e.item).pathname);
    expect(new Set(paths).size).toBe(paths.length);
    expect(JSON.stringify(ld)).not.toContain("#");
  });

  it("지역이 없으면 홈 › 단지", () => {
    expect(complexCrumbs(makeSummary({ breadcrumb: null })).map((c) => c.name)).toEqual(["홈", "햇살마을"]);
  });

  it("BreadcrumbList — 주소 있는 단계만(구글: 마지막 외 item 필수) · 절대 주소 · position 1부터", () => {
    const ld = breadcrumbJsonLd(complexCrumbs(makeSummary(), true)) as { itemListElement: Record<string, unknown>[] };
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "홈", item: "https://2u.pe.kr/" },
      { "@type": "ListItem", position: 2, name: "유성구", item: "https://2u.pe.kr/region/30200" },
      { "@type": "ListItem", position: 3, name: "봉명동", item: "https://2u.pe.kr/region/30200/3020011800" },
      { "@type": "ListItem", position: 4, name: "햇살마을", item: "https://2u.pe.kr/complex/6139" },
    ]);
    for (const el of ld.itemListElement) expect(el.item).toBeTruthy();
  });
});
