/**
 * AdminSection 테스트 — 대시보드 3층 접히는 절 (세션 419)
 * 실행: npx vitest run src/components/admin/__tests__/AdminSection.test.tsx
 *
 * 핵심 가드: 접힌 동안 children 을 **렌더하지 않는다** — 안쪽 카드의 API 호출이 0 이어야
 * 대시보드 첫 화면이 가볍고, 시각 회귀 촬영 높이도 흔들리지 않는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import AdminSection, { openAdminSection } from "../AdminSection";

function Probe() {
  return <p>안쪽 카드</p>;
}

afterEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
});

describe("AdminSection", () => {
  it("기본은 접힘 — 제목과 '펼치기'만 보이고 안쪽은 그리지 않는다", () => {
    render(
      <AdminSection id="freshness" title="데이터 신선도">
        <Probe />
      </AdminSection>,
    );
    expect(screen.getByText("데이터 신선도")).toBeInTheDocument();
    expect(screen.getByText(/펼치기/)).toBeInTheDocument();
    expect(screen.queryByText("안쪽 카드")).toBeNull();
    expect(document.getElementById("freshness")).not.toHaveAttribute("open");
  });

  it("제목 줄을 누르면 펼쳐져 안쪽을 그리고, 다시 누르면 접혀 안쪽을 지운다", () => {
    render(
      <AdminSection id="freshness" title="데이터 신선도">
        <Probe />
      </AdminSection>,
    );
    fireEvent.click(screen.getByText("데이터 신선도"));
    expect(screen.getByText("안쪽 카드")).toBeInTheDocument();
    expect(screen.getByText(/접기/)).toBeInTheDocument();
    expect(document.getElementById("freshness")).toHaveAttribute("open");

    fireEvent.click(screen.getByText("데이터 신선도"));
    expect(screen.queryByText("안쪽 카드")).toBeNull();
  });

  it("주소 끝이 #<id> 면 처음부터 펼쳐진다", () => {
    window.history.replaceState(null, "", "#freshness");
    render(
      <AdminSection id="freshness" title="데이터 신선도">
        <Probe />
      </AdminSection>,
    );
    expect(screen.getByText("안쪽 카드")).toBeInTheDocument();
  });

  it("다른 id 의 해시는 이 절을 열지 않는다", () => {
    window.history.replaceState(null, "", "#traffic");
    render(
      <AdminSection id="freshness" title="데이터 신선도">
        <Probe />
      </AdminSection>,
    );
    expect(screen.queryByText("안쪽 카드")).toBeNull();
  });

  it("hashchange 로 #<id> 가 되면 펼쳐진다 (건강 요약 줄 링크)", () => {
    render(
      <AdminSection id="freshness" title="데이터 신선도">
        <Probe />
      </AdminSection>,
    );
    expect(screen.queryByText("안쪽 카드")).toBeNull();
    act(() => {
      window.history.replaceState(null, "", "#freshness");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByText("안쪽 카드")).toBeInTheDocument();
  });

  it("openAdminSection — 이미 같은 해시여서 hashchange 가 안 나도(접었다 다시) 펼쳐진다", async () => {
    render(
      <AdminSection id="freshness" title="데이터 신선도">
        <Probe />
      </AdminSection>,
    );
    act(() => openAdminSection("freshness"));
    expect(window.location.hash).toBe("#freshness");
    // 해시 변경 알림(hashchange)은 브라우저가 비동기로 보낸다
    await waitFor(() => expect(screen.getByText("안쪽 카드")).toBeInTheDocument());
    // 접은 뒤 같은 해시로 다시 열기
    fireEvent.click(screen.getByText("데이터 신선도"));
    expect(screen.queryByText("안쪽 카드")).toBeNull();
    act(() => openAdminSection("freshness"));
    expect(screen.getByText("안쪽 카드")).toBeInTheDocument();
  });
});
