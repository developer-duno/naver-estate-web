/**
 * /admin/opinions 관리자 의견함 시험 (세션 437 PR C)
 * 실행: npx vitest run src/app/admin/opinions/__tests__/page.test.tsx
 *
 * 검증하는 것:
 *  1. 목록 — 날짜(한국 시간)·종류 한글·화면 경로(글자만, 링크 아님)·보낸 분(없으면 "로그인 안 함")·상태
 *  2. 상태 필터 → 서버에 status 로 넘긴다
 *  3. 답장 저장 → updateAdminOpinion 인자 + mail_sent 결과 쪽지 3가지 + 다시 보내기
 *  4. 공개 체크인데 공개 제목·답이 비면 "공개 설정 저장" 비활성
 *  5. 저장하는 동안 그 줄 버튼 전부 잠금 · 연타해도 한 번만 부른다(메일 2통 방지)
 *  6. 원문이 1년 정리로 NULL 이면 안내 문구
 *  7. 지우기 — 확인창 "취소"면 안 부르고, "확인"이면 부른다
 *  8. 서버 422 문구를 그대로 보여 준다
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import type { AdminOpinion, AdminOpinionsResponse, AdminOpinionUpdateResult } from "@/lib/api/opinions";

vi.mock("@/lib/api", () => ({
  getAdminOpinions: vi.fn(),
  updateAdminOpinion: vi.fn(),
  resendOpinionMail: vi.fn(),
  deleteAdminOpinion: vi.fn(),
}));

vi.mock("@/hooks/useAdminQuery", () => ({
  useTokenReady: () => ({ token: "test-token", getToken: vi.fn(async () => "test-token") }),
}));

import { getAdminOpinions, updateAdminOpinion, resendOpinionMail, deleteAdminOpinion } from "@/lib/api";
import { ApiError } from "@/lib/api/core";
import AdminOpinionsPage from "../page";

const mockList = vi.mocked(getAdminOpinions);
const mockUpdate = vi.mocked(updateAdminOpinion);
const mockResend = vi.mocked(resendOpinionMail);
const mockDelete = vi.mocked(deleteAdminOpinion);

function mkOpinion(over: Partial<AdminOpinion> = {}): AdminOpinion {
  return {
    id: 11,
    kind: "data",
    message: "가격이 틀려요 확인해 주세요",
    page_path: "/complex/12345",
    interests: ["market", "tax"],
    user_id: "u1",
    user_email: "kim@example.com",
    user_agent: "UA",
    status: "new",
    reply: null,
    replied_at: null,
    reply_mail_sent: false,
    is_public: false,
    public_title: null,
    public_answer: null,
    published_at: null,
    // UTC 10-05 15:30 = 한국 10-06 00:30
    created_at: "2026-10-05T15:30:00+00:00",
    updated_at: "2026-10-05T15:30:00+00:00",
    ...over,
  };
}

function listOf(items: AdminOpinion[], new_count = 1): AdminOpinionsResponse {
  return { items, total: items.length, page: 1, new_count };
}

function updated(over: Partial<AdminOpinionUpdateResult>): AdminOpinionUpdateResult {
  return { ...mkOpinion(), updated_at: "2026-10-06T01:00:00+00:00", mail_sent: false, ...over };
}

function renderPage() {
  return render(
    <TestQueryProvider>
      <AdminOpinionsPage />
    </TestQueryProvider>,
  );
}

async function openRow(id = 11) {
  fireEvent.click(await screen.findByRole("button", { name: `${id}번 의견 펼치기` }));
}

beforeEach(() => {
  mockList.mockReset();
  mockUpdate.mockReset();
  mockResend.mockReset();
  mockDelete.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/admin/opinions 목록·필터", () => {
  it("표에 날짜·종류·화면 경로(링크 아님)·보낸 분·상태를 보인다", async () => {
    mockList.mockResolvedValue(
      listOf(
        [
          mkOpinion(),
          mkOpinion({ id: 12, kind: "bug", user_email: null, status: "fixed", page_path: "/search", created_at: "2026-10-04T01:00:00+00:00" }),
        ],
        1,
      ),
    );
    renderPage();
    expect(await screen.findByText("2026.10.06 00:30")).toBeInTheDocument();
    expect(screen.getByText("정보가 틀려요")).toBeInTheDocument();
    expect(screen.getByText("버그·오류")).toBeInTheDocument();
    expect(screen.getByText("kim@example.com")).toBeInTheDocument();
    expect(screen.getByText("로그인 안 함")).toBeInTheDocument();
    expect(screen.getByText("새 의견 1건", { exact: false })).toBeInTheDocument();
    const path = screen.getByText("/complex/12345");
    expect(path.closest("a")).toBeNull();
    expect(document.querySelector('a[href="/complex/12345"]')).toBeNull();
    expect(mockList).toHaveBeenCalledWith("test-token", { status: undefined, page: 1 });
  });

  it("상태 필터를 고르면 서버에 status 로 넘긴다", async () => {
    mockList.mockResolvedValue(listOf([mkOpinion()]));
    renderPage();
    await screen.findByText("kim@example.com");
    fireEvent.change(screen.getByRole("combobox", { name: "상태로 거르기" }), { target: { value: "new" } });
    await waitFor(() => expect(mockList).toHaveBeenCalledWith("test-token", { status: "new", page: 1 }));
  });

  it("원문이 1년 정리로 비었으면 안내 문구를 보인다", async () => {
    mockList.mockResolvedValue(listOf([mkOpinion({ message: null, interests: null })]));
    renderPage();
    await openRow();
    expect(screen.getByText("원문은 1년이 지나 지워졌어요")).toBeInTheDocument();
    expect(screen.getByText("궁금한 소식: 고르지 않음")).toBeInTheDocument();
  });
});

describe("/admin/opinions 답장", () => {
  it("답장 저장 → (토큰, id, {reply}) 로 부르고 '메일도 보냈어요'", async () => {
    mockList.mockResolvedValue(listOf([mkOpinion()]));
    mockUpdate.mockResolvedValue(updated({ reply: "고쳤어요", status: "replied", reply_mail_sent: true, mail_sent: true }));
    renderPage();
    await openRow();
    expect(screen.getByText("궁금한 소식: 지역 매물·호가 흐름 · 세금·제도")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("답장"), { target: { value: "고쳤어요" } });
    fireEvent.click(screen.getByRole("button", { name: "답장 저장" }));
    expect(await screen.findByText("메일도 보냈어요")).toBeInTheDocument();
    expect(mockUpdate).toHaveBeenCalledWith("test-token", 11, { reply: "고쳤어요" });
  });

  it("이메일이 없으면 '로그인 안 한 분이라 메일은 없어요'", async () => {
    mockList.mockResolvedValue(listOf([mkOpinion({ user_email: null })]));
    mockUpdate.mockResolvedValue(updated({ user_email: null, reply: "답", mail_sent: false }));
    renderPage();
    await openRow();
    fireEvent.change(screen.getByLabelText("답장"), { target: { value: "답" } });
    fireEvent.click(screen.getByRole("button", { name: "답장 저장" }));
    expect(await screen.findByText("로그인 안 한 분이라 메일은 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "메일 다시 보내기" })).not.toBeInTheDocument();
  });

  it("메일이 실패하면 안내 + '메일 다시 보내기' 가 생기고, 누르면 resend 를 부른다", async () => {
    mockList.mockResolvedValue(listOf([mkOpinion()]));
    mockUpdate.mockResolvedValue(updated({ reply: "답", reply_mail_sent: false, mail_sent: false }));
    mockResend.mockResolvedValue({ sent: true });
    renderPage();
    await openRow();
    expect(screen.queryByRole("button", { name: "메일 다시 보내기" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("답장"), { target: { value: "답" } });
    fireEvent.click(screen.getByRole("button", { name: "답장 저장" }));
    expect(await screen.findByText("메일은 못 보냈어요 — 다시 보내기")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "메일 다시 보내기" }));
    expect(await screen.findByText("메일을 다시 보냈어요")).toBeInTheDocument();
    expect(mockResend).toHaveBeenCalledWith("test-token", 11);
    // 보낸 뒤에는 다시 보내기 버튼이 사라진다
    expect(screen.queryByRole("button", { name: "메일 다시 보내기" })).not.toBeInTheDocument();
  });

  it("저장하는 동안 그 줄 버튼이 전부 잠기고, 연타해도 한 번만 부른다", async () => {
    mockList.mockResolvedValue(listOf([mkOpinion({ reply: "옛 답" })]));
    let finish: (v: AdminOpinionUpdateResult) => void = () => {};
    mockUpdate.mockImplementation(() => new Promise((r) => (finish = r)));
    renderPage();
    await openRow();
    const save = screen.getByRole("button", { name: "답장 저장" });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(screen.getByRole("button", { name: "메일 다시 보내기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "지우기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "공개 설정 저장" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "상태 바꾸기" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "메일 다시 보내기" }));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockResend).not.toHaveBeenCalled();
    finish(updated({ reply: "옛 답", reply_mail_sent: true, mail_sent: true }));
    await waitFor(() => expect(save).not.toBeDisabled());
  });

  it("서버 422 문구를 그대로 보여 준다", async () => {
    mockList.mockResolvedValue(listOf([mkOpinion()]));
    mockUpdate.mockRejectedValue(new ApiError("공개하려면 공개 제목과 공개 답을 모두 써 주세요", 422));
    renderPage();
    await openRow();
    fireEvent.click(screen.getByRole("button", { name: "답장 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("공개하려면 공개 제목과 공개 답을 모두 써 주세요");
  });
});

describe("/admin/opinions 공개·상태·지우기", () => {
  it("공개를 켰는데 공개 제목·답이 비면 저장 비활성, 둘 다 쓰면 활성 → 인자 확인", async () => {
    mockList.mockResolvedValue(listOf([mkOpinion()]));
    mockUpdate.mockResolvedValue(updated({ is_public: true, public_title: "제목", public_answer: "답" }));
    renderPage();
    await openRow();
    const save = screen.getByRole("button", { name: "공개 설정 저장" });
    fireEvent.click(screen.getByRole("checkbox", { name: /목록에 공개/ }));
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("공개 제목"), { target: { value: "제목" } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("공개 답"), { target: { value: "  " } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("공개 답"), { target: { value: "답" } });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    expect(await screen.findByText(/공개했어요/)).toBeInTheDocument();
    expect(mockUpdate).toHaveBeenCalledWith("test-token", 11, { is_public: true, public_title: "제목", public_answer: "답" });
  });

  it("상태를 바꾸면 바로 저장한다", async () => {
    mockList.mockResolvedValue(listOf([mkOpinion()]));
    mockUpdate.mockResolvedValue(updated({ status: "fixed" }));
    renderPage();
    await openRow();
    fireEvent.change(screen.getByRole("combobox", { name: "상태 바꾸기" }), { target: { value: "fixed" } });
    expect(await screen.findByText("상태를 바꿨어요")).toBeInTheDocument();
    expect(mockUpdate).toHaveBeenCalledWith("test-token", 11, { status: "fixed" });
  });

  it("지우기 — 확인창 취소면 안 부르고, 확인이면 부른다", async () => {
    mockList.mockResolvedValue(listOf([mkOpinion()]));
    mockDelete.mockResolvedValue({ deleted: true });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderPage();
    await openRow();
    const row = screen.getByRole("button", { name: "지우기" }).closest("div")!;
    fireEvent.click(within(row).getByRole("button", { name: "지우기" }));
    // 부르기는 토큰을 기다린 뒤라 비동기다 — 한 박자 흘려 보낸 뒤에도 안 불렸는지 본다
    await new Promise((r) => setTimeout(r, 30));
    expect(mockDelete).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole("button", { name: "지우기" }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("test-token", 11));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });
});
