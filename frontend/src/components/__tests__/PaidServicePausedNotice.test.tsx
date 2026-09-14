/**
 * "지금은 무료로 운영 중입니다" 고지 배너 회귀 가드 — 세션 405.
 *
 * 사장님 요구의 핵심은 문구 노출이 아니라 **"유료로 되돌릴 때 이 안내가 알아서 사라지는 것"**
 * 이다. 조용히 안 사라지면 "무료라고 적혀 있는데 실제로는 결제되는" 더 나쁜 상태가 되므로,
 * 사라짐 쪽을 반드시 단언한다.
 *
 * ⚠ 뮤테이션 검증(세션 405 수행): 컴포넌트의 `if (!isPaidServicePaused()) return null;` 을
 * 지우면 "유료 재개 시 사라진다" 케이스가 FAIL 한다 — 이 테스트가 장식이 아님을 확인함.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PaidServicePausedNotice from "@/components/PaidServicePausedNotice";

vi.mock("@/lib/locked-paths", () => ({
  isPaidServicePaused: vi.fn(),
}));

import { isPaidServicePaused } from "@/lib/locked-paths";
const mockPaused = vi.mocked(isPaidServicePaused);

afterEach(() => {
  vi.clearAllMocks();
});

describe("PaidServicePausedNotice — 무료 운영 중 고지", () => {
  it("결제가 잠긴 동안: 무료 운영 안내가 보인다", () => {
    mockPaused.mockReturnValue(true);
    render(<PaidServicePausedNotice />);

    expect(screen.getByText("지금은 무료로 운영 중입니다.")).toBeInTheDocument();
    expect(
      screen.getByText(/결제 기능을 다시 열기 전까지는 적용되지 않습니다/),
    ).toBeInTheDocument();
    // 기존 결제 건까지 무효로 읽히지 않게 시제를 구분한다(적대검증 MEDIUM — 환불정책 오독 방지).
    expect(
      screen.getByText(/이미 결제하신 건이 있다면 그 건에는/),
    ).toBeInTheDocument();
  });

  it("★ 유료를 재개하면: 안내가 통째로 사라진다 (아무것도 렌더하지 않음)", () => {
    mockPaused.mockReturnValue(false);
    const { container } = render(<PaidServicePausedNotice />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/무료로 운영/)).not.toBeInTheDocument();
  });

  it("스크린리더가 부가 설명으로 읽도록 role=note 를 준다", () => {
    mockPaused.mockReturnValue(true);
    render(<PaidServicePausedNotice />);

    expect(screen.getByRole("note")).toBeInTheDocument();
  });
});
