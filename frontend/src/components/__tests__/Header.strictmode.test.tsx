/**
 * Header StrictMode 회귀 테스트 (세션 395)
 *
 * 검증 대상: React StrictMode(dev, App Router 기본 on)는 effect 를 mount→cleanup→mount 로
 * 이중 실행한다. Header 의 언마운트 cleanup 이 isMountedRef 를 false 로 내린 뒤 다시 true 로
 * 올리는 곳이 없으면, 2번째 effect 실행의 getSession/onAuthStateChange 후속이 전부
 * `if (!isMountedRef.current) return;` 에서 조기 이탈해 헤더가 로그인 상태를 못 그린다.
 * (next 16.3.4 dev 에서 admin E2E "관리자" 배지 실패로 드러난 결함 — 세션 395)
 *
 * 뮤테이션 확인: Header.tsx 세션 로드 effect 첫 줄의 `isMountedRef.current = true;` 를
 * 제거하면 이 파일의 StrictMode 테스트들이 FAIL 해야 한다.
 *
 * 실행: npx vitest run src/components/__tests__/Header.strictmode.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import Header from "../Header";

const TEST_EMAIL = "admin@example.com";
const TEST_TOKEN = "test-access-token";
const API_URL = "https://api.test.local";

// test-setup.ts 의 전역 supabase mock 은 세션 null 을 돌려준다 —
// 로그인 상태 재현을 위해 이 파일에서만 세션 있는 클라이언트로 덮어쓴다.
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: TEST_TOKEN,
            user: { id: "user-1", email: TEST_EMAIL },
          },
        },
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1", email: TEST_EMAIL } },
      }),
      signOut: vi.fn().mockResolvedValue({}),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    }),
  }),
}));

describe("Header — StrictMode 이중 실행에서도 세션 로드 (세션 395 회귀)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", API_URL);
    // fetchProfile 의 GET /api/users/me — 관리자 role 응답
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ role: "admin", paid_until: null }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("StrictMode 렌더 — 세션 이메일이 헤더에 표시된다", async () => {
    render(
      <StrictMode>
        <Header />
      </StrictMode>
    );
    await waitFor(() => {
      expect(screen.getAllByText(TEST_EMAIL).length).toBeGreaterThan(0);
    });
  });

  it("StrictMode 렌더 — 로그아웃 버튼이 표시되고 로그인 링크는 사라진다", async () => {
    render(
      <StrictMode>
        <Header />
      </StrictMode>
    );
    await waitFor(() => {
      expect(screen.getAllByText("로그아웃").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("로그인")).not.toBeInTheDocument();
  });

  it("StrictMode 렌더 — profile fetch 결과로 '관리자' 배지가 표시된다", async () => {
    render(
      <StrictMode>
        <Header />
      </StrictMode>
    );
    await waitFor(() => {
      expect(screen.getAllByText("관리자").length).toBeGreaterThan(0);
    });
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_URL}/api/users/me`,
      expect.objectContaining({
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      })
    );
  });

  it("비-StrictMode 렌더 — 동일하게 세션이 로드된다 (기존 동작 유지)", async () => {
    render(<Header />);
    await waitFor(() => {
      expect(screen.getAllByText(TEST_EMAIL).length).toBeGreaterThan(0);
      expect(screen.getAllByText("관리자").length).toBeGreaterThan(0);
    });
  });
});
