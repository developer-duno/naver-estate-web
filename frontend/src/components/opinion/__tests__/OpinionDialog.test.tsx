/**
 * "의견 보내기" 창 시험 (세션 433 의견함)
 * - 글자 수(9자 비활성 / 10자 활성) · 종류·동의가 있어야 보내기 활성
 * - 비로그인 안내는 로그인 안 했을 때만 · 로그인 링크를 누르면 쓰던 글을 맡겼다가 다음에 되살림
 * - 성공·하루 한도(429 서버 문구 그대로)·그 밖 실패·can_reply=false 안내 쪽지
 * 실행: npx vitest run src/components/opinion/__tests__/OpinionDialog.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestQueryProvider } from "@/test-setup";
import { ApiError } from "@/lib/api/core";

const { toastMock, submitMock, tokenState } = vi.hoisted(() => {
  const toastFn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return {
    toastMock: toastFn,
    submitMock: vi.fn(),
    tokenState: { sessionToken: undefined as string | undefined, tokenReady: true },
  };
});

vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/api/opinions", () => ({ submitOpinion: submitMock }));
vi.mock("@/hooks/useSessionToken", () => ({
  useSessionToken: () => ({
    sessionToken: tokenState.sessionToken,
    tokenReady: tokenState.tokenReady,
    tokenError: false,
    dismissTokenError: () => {},
  }),
}));

import OpinionDialog, { OPINION_DRAFT_KEY } from "../OpinionDialog";

const EIGHT = "여덟글자짜리내용"; // 8자 (남은 글자 992)
const TEN = "열글자짜리의견내용이";

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <TestQueryProvider>
      <OpinionDialog open onOpenChange={onOpenChange} />
    </TestQueryProvider>,
  );
  return { onOpenChange };
}

async function fillValid(user: ReturnType<typeof userEvent.setup>, text = TEN) {
  await user.click(screen.getByRole("radio", { name: "버그·오류" }));
  await user.type(screen.getByLabelText("내용"), text);
  await user.click(screen.getByRole("checkbox", { name: /1년 보관하는 데 동의합니다/ }));
}

beforeEach(() => {
  toastMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  submitMock.mockReset();
  tokenState.sessionToken = undefined;
  tokenState.tokenReady = true;
  window.sessionStorage.clear();
});

describe("OpinionDialog — 열기와 입력 조건", () => {
  it("열리면 제목·종류 4개·관심 4개·숨김 칸 안내 문구가 보인다", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "의견 보내기" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    for (const label of ["지역 매물·호가 흐름", "미분양·분양 일정", "세금·제도"]) {
      expect(screen.getByRole("checkbox", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText("준비 참고용이에요. 이 선택으로 소식을 보내지는 않아요")).toBeInTheDocument();
    // 숨김 칸은 접근성 트리에 없다
    expect(screen.queryByRole("textbox", { name: "website" })).not.toBeInTheDocument();
  });

  it("9자면 보내기 비활성, 10자가 되면 활성", async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillValid(user, "가나다라마바사아자"); // 9자
    expect(screen.getByTestId("opinion-submit")).toBeDisabled();
    await user.type(screen.getByLabelText("내용"), "차");
    expect(screen.getByTestId("opinion-submit")).toBeEnabled();
  });

  it("동의를 안 하면 10자여도 비활성", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("radio", { name: "건의·제안" }));
    await user.type(screen.getByLabelText("내용"), TEN);
    expect(screen.getByTestId("opinion-submit")).toBeDisabled();
  });

  it("남은 글자 수를 보여 준다", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText("내용"), EIGHT);
    expect(screen.getByText(/남은 글자 992/)).toBeInTheDocument();
  });
});

describe("OpinionDialog — 로그인 안내와 쓰던 글 맡기기", () => {
  it("비로그인이면 답장 안내와 로그인 링크가 보인다", () => {
    renderDialog();
    expect(screen.getByText(/답장을 받으려면 로그인해 주세요/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login?redirect=%2F");
  });

  it("로그인 상태면 안내가 없다", () => {
    tokenState.sessionToken = "tok";
    renderDialog();
    expect(screen.queryByTestId("opinion-login-hint")).not.toBeInTheDocument();
  });

  it("토큰 확인 전에는 안내를 띄우지 않는다(로그인한 분에게 잠깐 보이는 깜빡임 방지)", () => {
    tokenState.tokenReady = false;
    renderDialog();
    expect(screen.queryByTestId("opinion-login-hint")).not.toBeInTheDocument();
  });

  it("로그인 링크를 누르면 쓰던 글을 맡기고 창을 닫고, 다음에 열면 되살린 뒤 지운다", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await user.click(screen.getByRole("radio", { name: "정보가 틀려요" }));
    await user.type(screen.getByLabelText("내용"), TEN);
    await user.click(screen.getByRole("checkbox", { name: "세금·제도" }));
    await user.click(screen.getByRole("link", { name: "로그인" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(JSON.parse(window.sessionStorage.getItem(OPINION_DRAFT_KEY) ?? "null")).toEqual({
      kind: "data",
      message: TEN,
      interests: ["tax"],
    });

    // 다른 화면에서 새로 열린 창 (첫 창은 지운다)
    cleanup();
    renderDialog();
    expect(screen.getByLabelText("내용")).toHaveValue(TEN);
    expect(screen.getByRole("radio", { name: "정보가 틀려요" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "세금·제도" })).toBeChecked();
    await waitFor(() => expect(window.sessionStorage.getItem(OPINION_DRAFT_KEY)).toBeNull());
  });
});

describe("OpinionDialog — 보내기 결과 쪽지", () => {
  it("성공하면 창을 닫고 \"보냈어요. 고맙습니다\" · 보낸 본문 확인", async () => {
    submitMock.mockResolvedValue({ id: 1, received: true, can_reply: false });
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await fillValid(user);
    await user.click(screen.getByRole("checkbox", { name: "미분양·분양 일정" }));
    await user.click(screen.getByTestId("opinion-submit"));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("보냈어요. 고맙습니다"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(submitMock).toHaveBeenCalledWith(
      { kind: "bug", message: TEN, page_path: "/", interests: ["presale"], website: "" },
      undefined,
    );
    // 비로그인은 can_reply=false 여도 "다시 로그인" 안내를 띄우지 않는다
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("로그인 상태인데 can_reply=false 면 다시 로그인 안내를 띄운다", async () => {
    tokenState.sessionToken = "tok";
    submitMock.mockResolvedValue({ id: 2, received: true, can_reply: false });
    const user = userEvent.setup();
    renderDialog();
    await fillValid(user);
    await user.click(screen.getByTestId("opinion-submit"));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith("답장을 받으려면 다시 로그인해 주세요"));
    expect(submitMock.mock.calls[0][1]).toBe("tok");
  });

  it("로그인 상태이고 can_reply=true 면 다시 로그인 안내가 없다", async () => {
    tokenState.sessionToken = "tok";
    submitMock.mockResolvedValue({ id: 3, received: true, can_reply: true });
    const user = userEvent.setup();
    renderDialog();
    await fillValid(user);
    await user.click(screen.getByTestId("opinion-submit"));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("하루 한도(429)는 서버 문구를 그대로 보여 준다", async () => {
    const msg = "오늘은 더 보낼 수 없어요. 내일 다시 보내 주세요";
    submitMock.mockRejectedValue(new ApiError(msg, 429));
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await fillValid(user);
    await user.click(screen.getByTestId("opinion-submit"));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(msg));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // 실패하면 쓰던 글이 남아 있다
    expect(screen.getByLabelText("내용")).toHaveValue(TEN);
  });

  it("그 밖 실패는 고정 문구", async () => {
    submitMock.mockRejectedValue(new ApiError("Server error", 500));
    const user = userEvent.setup();
    renderDialog();
    await fillValid(user);
    await user.click(screen.getByTestId("opinion-submit"));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("지금은 보낼 수 없어요. 잠시 뒤 다시 시도해 주세요"),
    );
  });
});
