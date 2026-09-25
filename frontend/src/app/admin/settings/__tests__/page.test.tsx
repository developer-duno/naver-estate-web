/**
 * /admin/settings 페이지 — 경고 배너·묶음·저장 확인창 회귀 가드 (관리자 화면 리뉴얼 A4)
 * 실행: npx vitest run src/app/admin/settings/__tests__/page.test.tsx
 *
 * 검증하는 것:
 *  1. 맨 위 경고 배너가 사실(저장은 기록만, 자동 수집은 이 값을 안 읽음)을 알린다
 *  2. 설정이 "수집 속도·양" / "그 외" 두 묶음으로 나뉘고, 원문 key 는 작게 남는다(e2e 가 찾는다)
 *  3. 저장 전 확인창에 이전 값 → 새 값이 보이고, 취소하면 저장 API 를 부르지 않는다
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import type { AdminSetting } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getAdminSettings: vi.fn(),
  updateAdminSetting: vi.fn(),
}));

vi.mock("@/hooks/useAdminQuery", () => ({
  useTokenReady: () => ({ token: "test-token", getToken: vi.fn(async () => "test-token") }),
}));

import { getAdminSettings, updateAdminSetting } from "@/lib/api";
import AdminSettingsPage from "../page";

const mockGet = vi.mocked(getAdminSettings);
const mockUpdate = vi.mocked(updateAdminSetting);

const SETTINGS: AdminSetting[] = [
  { key: "crawl.throttle_ms", value: { value: 1500 }, updated_at: "2026-04-16T09:00:00+09:00" },
  { key: "brand.new_key_2027", value: { enabled: true } },
  { key: "scheduler.popular_batch_size", value: { value: 50 } },
];

function renderPage() {
  return render(
    <TestQueryProvider>
      <AdminSettingsPage />
    </TestQueryProvider>,
  );
}

describe("/admin/settings", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockUpdate.mockReset();
    mockGet.mockResolvedValue({ items: SETTINGS });
    mockUpdate.mockResolvedValue({ status: "updated" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("경고 배너가 저장은 기록만 되고 자동 수집은 이 값을 읽지 않는다고 알린다", async () => {
    renderPage();
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent("여기 값은 저장하면 바로 기록되고");
    expect(note).toHaveTextContent("자동 수집은 이 값을 읽지 않아요");
  });

  it("설정이 두 묶음으로 나뉜다 — 아는 수집 키는 '수집 속도·양', 모르는 키는 '그 외'", async () => {
    renderPage();
    const crawlGroup = await screen.findByRole("region", { name: "수집 속도·양" });
    const otherGroup = screen.getByRole("region", { name: "그 외" });
    // 우리말 이름 + 원문 key 를 작게 함께
    expect(within(crawlGroup).getByText("수집 사이 쉬는 시간 (1000분의 1초 단위)")).toBeInTheDocument();
    expect(within(crawlGroup).getByText("crawl.throttle_ms")).toBeInTheDocument();
    expect(within(crawlGroup).getByText("scheduler.popular_batch_size")).toBeInTheDocument();
    // 모르는 key 는 원문 그대로 (정보 손실 방지)
    expect(within(otherGroup).getByText("brand.new_key_2027")).toBeInTheDocument();
    expect(within(otherGroup).queryByText("crawl.throttle_ms")).not.toBeInTheDocument();
    // 편집 버튼은 설정마다 하나
    expect(screen.getAllByRole("button", { name: "편집" })).toHaveLength(3);
  });

  it("저장 확인창에서 취소하면 저장 API 를 부르지 않고 편집 칸이 그대로 남는다", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    const crawlGroup = await screen.findByRole("region", { name: "수집 속도·양" });
    fireEvent.click(within(crawlGroup).getAllByRole("button", { name: "편집" })[0]);
    const box = screen.getByLabelText("수집 사이 쉬는 시간 (1000분의 1초 단위) 새 값");
    fireEvent.change(box, { target: { value: '{"value": 3000}' } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const msg = confirmSpy.mock.calls[0][0] as string;
    expect(msg).toContain('이전 값: {"value":1500}');
    expect(msg).toContain('새 값: {"value":3000}');
    // 저장·취소 함수는 토큰을 await 한 뒤 API 를 부른다 — 비동기 흐름이 다 돈 뒤에 "안 불렸다"를 단언해야
    // 확인창 가드를 지웠을 때 이 단언이 실제로 깨진다 (뮤테이션 실측: flush 없이 단언하면 가드가 없어도 통과)
    await new Promise((r) => setTimeout(r, 50));
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("수집 사이 쉬는 시간 (1000분의 1초 단위) 새 값")).toBeInTheDocument();
  });

  it("확인하면 그 key 와 새 값으로 저장 API 를 부른다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    const crawlGroup = await screen.findByRole("region", { name: "수집 속도·양" });
    fireEvent.click(within(crawlGroup).getAllByRole("button", { name: "편집" })[0]);
    fireEvent.change(screen.getByLabelText("수집 사이 쉬는 시간 (1000분의 1초 단위) 새 값"), {
      target: { value: '{"value": 3000}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith("test-token", "crawl.throttle_ms", { value: 3000 }),
    );
  });

  it("형식이 틀린 값은 확인창 없이 안내만 한다 (개발자 용어 'JSON' 없이)", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    renderPage();
    const crawlGroup = await screen.findByRole("region", { name: "수집 속도·양" });
    fireEvent.click(within(crawlGroup).getAllByRole("button", { name: "편집" })[0]);
    fireEvent.change(screen.getByLabelText("수집 사이 쉬는 시간 (1000분의 1초 단위) 새 값"), {
      target: { value: "{value: 3000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText(/값의 형식이 올바르지 않아요/)).toBeInTheDocument();
    expect(screen.queryByText(/JSON/)).not.toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
