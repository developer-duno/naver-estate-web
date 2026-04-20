/**
 * MbTabContent 컴포넌트 테스트 - 미분양 탭 공용 래퍼 + ExportButton
 * 실행: npx vitest run src/components/__tests__/MbTabContent.test.tsx
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MbTabContent, ExportButton } from "../mb/MbTabContent";

afterEach(() => {
  vi.useRealTimers();
});

describe("MbTabContent", () => {
  it("loading=true 이면 로딩 메시지 렌더", () => {
    render(
      <MbTabContent loading={true} error={null} refetch={vi.fn()}>
        <div>CHILD</div>
      </MbTabContent>,
    );
    expect(screen.getByText("데이터를 불러오는 중...")).toBeInTheDocument();
    expect(screen.queryByText("CHILD")).not.toBeInTheDocument();
  });

  it("error 존재 시 에러 메시지 + '다시 시도' 클릭으로 refetch 호출", () => {
    const refetch = vi.fn();
    render(
      <MbTabContent loading={false} error={new Error("boom")} refetch={refetch}>
        <div>CHILD</div>
      </MbTabContent>,
    );
    expect(screen.getByText("데이터를 불러오지 못했습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("다시 시도"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("정상(loading=false, error=null) 이면 children 렌더", () => {
    render(
      <MbTabContent loading={false} error={null} refetch={vi.fn()}>
        <div>CHILD</div>
      </MbTabContent>,
    );
    expect(screen.getByText("CHILD")).toBeInTheDocument();
  });
});

describe("ExportButton", () => {
  it("disabled=true 이면 버튼 비활성화 + 클릭해도 onClick 미호출", () => {
    const onClick = vi.fn().mockResolvedValue(undefined);
    render(<ExportButton disabled={true} onClick={onClick} />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("onClick 성공 시 '다운로드 중...' 표시 후 '엑셀' 복구", async () => {
    const onClick = vi.fn().mockResolvedValue(undefined);
    render(<ExportButton disabled={false} onClick={onClick} />);
    fireEvent.click(screen.getByText("엑셀"));
    expect(screen.getByText("다운로드 중...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("엑셀")).toBeInTheDocument());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("onClick 실패 시 '실패' 라벨 → 3초 후 '엑셀' 복구", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onClick = vi.fn().mockRejectedValue(new Error("fail"));
    render(<ExportButton disabled={false} onClick={onClick} />);
    fireEvent.click(screen.getByText("엑셀"));
    await waitFor(() => expect(screen.getByText("실패")).toBeInTheDocument());
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("엑셀")).toBeInTheDocument();
  });
});
