/**
 * "고쳤습니다"(/updates) 서버 컴포넌트 시험 (세션 437 PR C)
 * 서버 컴포넌트를 함수로 불러 나온 JSX 를 그린다. 백엔드는 global fetch 를 가짜로 바꿔 흉내 낸다.
 * 검증: 빈 목록 / 4상태 뱃지·줄바꿈·한국 날짜 / 실패 문구 / 주소 없는 빌드 / 쪽 넘김 / openGraph images
 * 실행: npx vitest run src/app/updates/__tests__/page.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PublicUpdateItem } from "@/lib/api/opinions";
import UpdatesPage, { metadata } from "../page";

const API = "http://test-api:8000";
const fetchMock = vi.fn();

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function item(over: Partial<PublicUpdateItem>): PublicUpdateItem {
  return {
    id: 1,
    public_title: "제목",
    public_answer: "답",
    status: "fixed",
    published_at: "2026-10-01T03:00:00+00:00",
    ...over,
  };
}

async function renderPage(searchParams: Record<string, string> = {}) {
  render(await UpdatesPage({ searchParams: Promise.resolve(searchParams) }));
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("/updates 고쳤습니다", () => {
  it("빈 목록이면 안내 문구 · 제목·소개·안내 줄·의견 보내기 버튼은 늘 보인다", async () => {
    fetchMock.mockResolvedValue(ok({ items: [], total: 0, page: 1 }));
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "고쳤습니다" })).toBeInTheDocument();
    expect(screen.getByText("보내 주신 의견 중 답한 것·고친 것을 모아 둡니다.")).toBeInTheDocument();
    expect(screen.getByText("공개 뒤 이 목록에 보이기까지 몇 분 걸릴 수 있어요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "의견 보내기" })).toBeInTheDocument();
    expect(screen.getByText("아직 공개한 항목이 없어요.")).toBeInTheDocument();
    // 서버 캐시 5분으로 부른다
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API}/api/opinions/public?page=1`);
    expect((init as { next?: { revalidate?: number } }).next?.revalidate).toBe(300);
  });

  it("4상태 뱃지를 모두 그리고, 답의 줄바꿈을 살리고, 날짜는 한국 시간으로 쓴다", async () => {
    fetchMock.mockResolvedValue(
      ok({
        items: [
          // UTC 10-05 16:00 = 한국 10-06 01:00 → 한국 날짜로 바뀌어야 한다
          item({ id: 1, status: "fixed", public_title: "검색이 안 돼요", public_answer: "첫 줄\n둘째 줄", published_at: "2026-10-05T16:00:00+00:00" }),
          item({ id: 2, status: "replied", public_title: "답한 것" }),
          item({ id: 3, status: "new", public_title: "보는 중인 것" }),
          item({ id: 4, status: "closed", public_title: "닫은 것" }),
        ],
        total: 4,
        page: 1,
      }),
    );
    await renderPage();
    expect(screen.getByText("고쳤어요")).toHaveClass("text-green-700");
    expect(screen.getByText("답했어요")).toHaveClass("text-blue-700");
    expect(screen.getByText("살펴보는 중")).toBeInTheDocument();
    expect(screen.getByText("확인했어요")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "검색이 안 돼요" })).toBeInTheDocument();
    const answer = screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "첫 줄\n둘째 줄");
    expect(answer).toHaveClass("whitespace-pre-line");
    expect(screen.getByText("2026.10.06")).toBeInTheDocument();
    expect(screen.queryByText("아직 공개한 항목이 없어요.")).not.toBeInTheDocument();
    // 20건 이하면 쪽 넘김이 없다
    expect(screen.queryByRole("navigation", { name: "쪽 넘기기" })).not.toBeInTheDocument();
  });

  it("서버가 실패하면 실패 문구를 보이고 빈 목록 문구는 안 보인다", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "Server error" }), { status: 500 }));
    await renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("지금은 목록을 불러올 수 없어요.");
    expect(screen.queryByText("아직 공개한 항목이 없어요.")).not.toBeInTheDocument();
  });

  it("백엔드 주소가 없는 빌드는 부르지 않고 빈 목록으로 본다", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    await renderPage();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("아직 공개한 항목이 없어요.")).toBeInTheDocument();
  });

  it("?page=2 · 전체 45건이면 2쪽을 부르고 앞뒤 쪽 링크를 단다", async () => {
    fetchMock.mockResolvedValue(ok({ items: [item({})], total: 45, page: 2 }));
    await renderPage({ page: "2" });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${API}/api/opinions/public?page=2`);
    const nav = screen.getByRole("navigation", { name: "쪽 넘기기" });
    expect(nav).toHaveTextContent("2 / 3 쪽");
    expect(screen.getByRole("link", { name: "이전" })).toHaveAttribute("href", "/updates?page=1");
    expect(screen.getByRole("link", { name: "다음" })).toHaveAttribute("href", "/updates?page=3");
  });

  it("이상한 ?page 값은 1쪽으로 부른다", async () => {
    fetchMock.mockResolvedValue(ok({ items: [], total: 0, page: 1 }));
    await renderPage({ page: "-3" });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${API}/api/opinions/public?page=1`);
  });

  it("metadata 에 canonical 과 openGraph images 가 있다(seo 룰 2)", () => {
    expect(metadata.alternates?.canonical).toBe("/updates");
    const images = metadata.openGraph?.images;
    expect(Array.isArray(images) && images.length).toBeGreaterThan(0);
    expect(JSON.stringify(images)).toContain("/opengraph-image");
  });
});
