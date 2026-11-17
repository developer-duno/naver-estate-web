/**
 * 전세보증 한도 계산기 부품(세션 520 · B37 PR 5) — 빈 상태 · 그림 예시 · 공시가격 모드 · 월세 환산 · 지역 · 집 종류 안내 ·
 * 넣지 않은 조건 · 원문 링크 · 단정 글자 없음
 * 실행: npx vitest run src/components/broker/__tests__/HugLimitCalculator.test.tsx
 */
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import HugLimitCalculator from "../HugLimitCalculator";
import { HUG_NOT_COVERED, HUG_SOURCES } from "@/lib/broker/hug-guarantee";

/** 금액 칸에 숫자를 넣는다(쉼표는 부품이 찍는다) */
function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function press(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

/** 결과 카드 */
function resultCard() {
  return screen.getByRole("region", { name: "HUG 산식 상한(보증한도)" });
}

/** 세 조건 줄 글자 */
function checkLines() {
  return within(resultCard())
    .getAllByRole("listitem")
    .filter((li) => /들어감|넘음/.test(li.querySelector("em")?.textContent ?? ""))
    .map((li) => li.textContent);
}

/** 그림 예시 입력 — 아파트 · 수도권 · 공시가격 2억 · 선순위 6,000만 · 보증금(기본 1억 8,000만) */
function fillExample(deposit = "180000000") {
  press("공시가격으로");
  type("공시가격", "200000000");
  type("선순위채권 등", "60000000");
  type("전세보증금", deposit);
}

describe("HugLimitCalculator", () => {
  it("빈 상태 — 안내 문장만, 세 조건 줄 없음 · 적용 기준 줄은 보임", () => {
    render(<HugLimitCalculator />);
    expect(screen.getByTestId("hug-guide")).toHaveTextContent("주택가격과 전세보증금을 넣으면 한도가 보입니다.");
    expect(checkLines()).toHaveLength(0);
    expect(resultCard()).toHaveTextContent("적용 기준: 전세가율 90%");
  });

  it("그림 예시 → 큰 글자 「1억 9,200만 원」 · 식 줄 · 세 조건 모두 들어감", () => {
    render(<HugLimitCalculator />);
    fillExample();
    expect(screen.getByTestId("hug-limit")).toHaveTextContent(/^1억 9,200만 원$/);
    expect(screen.getByTestId("hug-formula")).toHaveTextContent("2억 8,000만 × 90% − 6,000만 = 1억 9,200만");
    expect(checkLines()).toEqual([
      "✓ 들어감전세보증금 1억 8,000만 원이 한도 안 — 1,200만 원 남음",
      "✓ 들어감선순위채권 21.5% (60% 이내)",
      "✓ 들어감보증금 1억 8,000만 원 (수도권 7억 이하)",
    ]);
  });

  it("보증금 2억 1,000만 → 첫 줄만 넘음(1,800만 원 많음)", () => {
    render(<HugLimitCalculator />);
    fillExample("210000000");
    expect(checkLines()[0]).toBe("✗ 넘음전세보증금 2억 1,000만 원이 한도보다 1,800만 원 많음");
  });

  it("한도와 같으면 「한도와 같음」(들어감) — 주택가격 1억 · 보증금 9,000만", () => {
    render(<HugLimitCalculator />);
    type("주택가격 금액", "100000000");
    type("전세보증금", "90000000");
    expect(checkLines()[0]).toBe("✓ 들어감전세보증금 9,000만 원이 한도와 같음");
  });

  it("선순위가 이미 90% 를 넘으면 큰 글자 0원 + 문장", () => {
    render(<HugLimitCalculator />);
    type("주택가격 금액", "100000000");
    type("선순위채권 등", "95000000");
    type("전세보증금", "10000000");
    expect(screen.getByTestId("hug-limit")).toHaveTextContent(/^0원$/);
    expect(resultCard()).toHaveTextContent("선순위채권 등이 이미 주택가격의 90%를 넘습니다.");
  });

  it("공시가격 모드 → 「× 140% = 2억 8,000만 원을 주택가격으로 씁니다.」", () => {
    render(<HugLimitCalculator />);
    press("공시가격으로");
    type("공시가격", "200000000");
    type("전세보증금", "100000000");
    expect(screen.getByText(/을 주택가격으로 씁니다\./)).toHaveTextContent("× 140% = 2억 8,000만 원을 주택가격으로 씁니다.");
  });

  it("월세 입력 → 셋째 줄 「환산 보증금」 · 지역을 바꾸면 상한 글자가 바뀐다", () => {
    render(<HugLimitCalculator />);
    type("주택가격 금액", "1000000000");
    type("전세보증금", "400000000");
    type("월세 (있으면)", "600000");
    expect(checkLines()[2]).toBe(
      "✓ 들어감환산 보증금 5억 1,076만 9,230원 (보증금 + 월세×12 ÷ 6.5%) · 수도권 7억 이하",
    );
    // 넘으면 올림(세션 521) — 같은 입력이라도 그 외 지역에선 9,231원
    press("그 외 지역");
    expect(checkLines()[2]).toBe(
      "✗ 넘음환산 보증금 5억 1,076만 9,231원 (보증금 + 월세×12 ÷ 6.5%) · 그 외 지역 5억 넘음",
    );
  });

  it("집 종류별 안내 글(금액 직접) 3가지 · 단독·다가구 안내는 늘 보임", () => {
    render(<HugLimitCalculator />);
    expect(screen.getByText("단독·다가구는 다른 세입자 보증금까지 따지는 조건이 있어 다루지 않습니다.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "HUG는 KB·한국부동산원 시세를 먼저 씁니다(최저층은 하위평균가). 없으면 공시가격의 140% → 안심전세 앱 하한가 → 1년 안 등기부 매매가 → 준공 1년 안이면 분양가의 90%.",
      ),
    ).toBeInTheDocument();
    press("오피스텔");
    expect(
      screen.getByText(
        "HUG는 KB 시세 하위평균가를 먼저 씁니다. 없으면 국세청 기준시가의 140% → 안심전세 앱 하한가 → 1년 안 등기부 매매가 → 준공 1년 안이면 분양가의 90%.",
      ),
    ).toBeInTheDocument();
    press("연립·다세대");
    expect(
      screen.getByText("HUG는 공동주택가격(공시가격)의 140%를 먼저 씁니다. 없으면 안심전세 앱 하한가 → 1년 안 등기부 매매가."),
    ).toBeInTheDocument();
  });

  it("공시가격 모드 안내 끝 — 아파트·오피스텔은 「(아파트·오피스텔은 시세가 없을 때 쓰는 방법)」, 연립·다세대는 없음", () => {
    render(<HugLimitCalculator />);
    press("공시가격으로");
    type("공시가격", "200000000");
    type("전세보증금", "100000000");
    const tail = "(아파트·오피스텔은 시세가 없을 때 쓰는 방법)";
    const guide = () => screen.getByText(/을 주택가격으로 씁니다\./);
    expect(guide()).toHaveTextContent(`× 140% = 2억 8,000만 원을 주택가격으로 씁니다. ${tail}`);
    press("오피스텔");
    expect(guide()).toHaveTextContent(tail);
    press("연립·다세대");
    expect(guide()).toHaveTextContent(/^× 140% = 2억 8,000만 원을 주택가격으로 씁니다\.$/);
    expect(guide().textContent).not.toContain("시세가 없을 때");
  });

  it("선순위 칸 안내 = 근저당 금액과 등기일자 · 먼저 받는 채권", () => {
    render(<HugLimitCalculator />);
    expect(
      screen.getByText("등기부 을구의 근저당 금액과 등기일자(원문 표현) — 내 보증금보다 먼저 받는 채권"),
    ).toBeInTheDocument();
  });

  it("단추 눌림 상태(aria-pressed) — 고른 단추만 true", () => {
    render(<HugLimitCalculator />);
    const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");
    expect([pressed("아파트"), pressed("오피스텔"), pressed("연립·다세대")]).toEqual(["true", "false", "false"]);
    expect([pressed("수도권(서울·인천·경기)"), pressed("그 외 지역")]).toEqual(["true", "false"]);
    expect([pressed("금액 직접"), pressed("공시가격으로")]).toEqual(["true", "false"]);
    press("연립·다세대");
    press("그 외 지역");
    press("공시가격으로");
    expect([pressed("아파트"), pressed("오피스텔"), pressed("연립·다세대")]).toEqual(["false", "false", "true"]);
    expect([pressed("수도권(서울·인천·경기)"), pressed("그 외 지역")]).toEqual(["false", "true"]);
    expect([pressed("금액 직접"), pressed("공시가격으로")]).toEqual(["false", "true"]);
  });

  it("상한을 아주 조금 넘으면 환산 보증금이 5억보다 크게 보인다(올림) — 그 외 지역 · 보증금 499,999,816 · 월세 1원", () => {
    render(<HugLimitCalculator />);
    press("그 외 지역");
    type("주택가격 금액", "2000000000");
    type("전세보증금", "499999816");
    type("월세 (있으면)", "1");
    expect(checkLines()[2]).toBe(
      "✗ 넘음환산 보증금 5억 1원 (보증금 + 월세×12 ÷ 6.5%) · 그 외 지역 5억 넘음",
    );
  });

  it("오피스텔 공시가격 모드 칸 이름 = 「기준시가(국세청)」, 아파트는 「공시가격」", () => {
    render(<HugLimitCalculator />);
    press("공시가격으로");
    expect(screen.getByLabelText("공시가격")).toBeInTheDocument();
    press("오피스텔");
    expect(screen.getByLabelText("기준시가(국세청)")).toBeInTheDocument();
    expect(screen.queryByLabelText("공시가격")).toBeNull();
  });

  it("넣지 않은 심사 조건 14줄 · 원문 링크 2개(새 창 · noopener)", () => {
    render(<HugLimitCalculator />);
    const card = resultCard();
    const heading = within(card).getByRole("heading", { name: "이 계산에 넣지 않은 심사 조건" });
    const items = within(heading.parentElement!).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([...HUG_NOT_COVERED]);
    expect(items).toHaveLength(14);
    expect(items[0]).toBe("HUG 상품 기준입니다 — HF(주택금융공사)·SGI서울보증 전세보증은 조건이 다릅니다");
    for (const t of [
      "보증료(원문의 보증료율 표를 보세요)",
      "감정평가서가 있으면 HUG는 그 값을 먼저 씁니다(6개월 이내)",
      "갱신 계약에서 보증금이 늘지 않으면 HUG는 주택가격을 다시 보지 않고, 전월세전환율도 예전 보증 때 것을 씁니다",
      "질권 설정·채권양도 통지가 된 전세대출이 있으면 가입할 수 없습니다(HUG와 협약한 SGI서울보증 보증부 대출은 예외)",
      "임대인이 HUG 보증금지 대상이거나 전세보증금 미반환 임대인으로 등록된 경우 · 임대인이 미성년자면 법정대리인 연대보증",
      "오피스텔은 전세계약서나 중개대상물 확인·설명서에 「주거용」 표기가 있어야 합니다",
      "전세권이 설정돼 있으면 말소하거나 보증 이행 때 HUG로 이전해야 합니다",
      "이사 전 사전한도심사(계약일부터 계약 시작 14일 전까지 안심전세 앱에서 신청)",
    ]) {
      expect(items).toContain(t);
    }
    const links = within(card).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(HUG_SOURCES.map((s) => s.url));
    for (const a of links) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });

  it("「가입 가능」「가입 불가」로 단정하는 글자 0(빈 상태 · 들어감 · 넘음 모두)", () => {
    const { container } = render(<HugLimitCalculator />);
    const banned = ["가입 " + "가능", "가입 " + "불가", "가입" + "가능", "가입" + "불가"];
    const check = () => banned.forEach((w) => expect(container.textContent).not.toContain(w));
    check();
    fillExample();
    check();
    type("전세보증금", "210000000");
    check();
  });
});
