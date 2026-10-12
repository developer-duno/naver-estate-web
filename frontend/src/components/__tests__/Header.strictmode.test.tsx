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
import userEvent from "@testing-library/user-event";
import Header from "../Header";

const TEST_EMAIL = "admin@example.com";
const TEST_TOKEN = "test-access-token";
const API_URL = "https://api.test.local";

// B19 D-day 경로 이동 시험용 — 경로를 시험 안에서 바꿀 수 있게 test-setup.ts 의 next/navigation mock 을 덮어쓴다.
// 기본값 "/" 는 test-setup 과 같아 다른 시험에는 영향이 없다.
const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

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

  // 세션 401: 이메일은 "내 계정 ▾" 드롭다운 안으로 옮겨져 기본 상태(닫힘)에서는 DOM 에 없다
  // (Radix 는 열기 전까지 Content 를 렌더하지 않는다). 이 테스트가 지키려는 것은 "이메일 글자"가
  // 아니라 **StrictMode 이중 마운트 뒤에도 세션 로드가 완료된다**는 사실(세션 395 회귀 가드)이므로,
  // userEmail 이 있을 때만 렌더되는 트리거로 단언 대상을 옮긴다 — 증명력은 동일하다.
  it("StrictMode 렌더 — 세션 로드 완료 후 계정 메뉴가 표시된다", async () => {
    render(
      <StrictMode>
        <Header />
      </StrictMode>
    );
    await waitFor(() => {
      expect(screen.getAllByText("내 계정 ▾").length).toBeGreaterThan(0);
    });
  });

  it("StrictMode 렌더 — 계정 메뉴를 열면 세션 이메일이 보인다", async () => {
    render(
      <StrictMode>
        <Header />
      </StrictMode>
    );
    // Radix 는 pointerdown 으로 열린다 — fireEvent.click 은 안 먹는다(직접 실측).
    // 기존 계산기 드롭다운 테스트와 같은 방식(userEvent) 답습 — Header.test.tsx:136-140
    const user = userEvent.setup();
    const trigger = await waitFor(() => screen.getAllByText("내 계정 ▾")[0]);
    await user.click(trigger);
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
      // 세션 401: 이메일은 드롭다운 안으로 이동 — 세션 로드 증거는 트리거로 본다
      expect(screen.getAllByText("내 계정 ▾").length).toBeGreaterThan(0);
      expect(screen.getAllByText("관리자").length).toBeGreaterThan(0);
    });
  });
});

// B19: D-day 기준 시각을 렌더 중 Date.now() 대신 상태(초기값 함수·경로 effect)로 옮겼다 —
// 남은 일수 계산(올림)과 만료 시 숨김이 그대로인지 확인한다.
describe("Header — 구독 D-day 뱃지 (B19)", () => {
  const DAY = 86_400_000;

  function mockProfile(paidUntil: string | null) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ role: "expert", paid_until: paidUntil }),
    }) as unknown as typeof fetch;
  }

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", API_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("paid_until 이 2.5일 뒤면 '구독 D-3'(올림)을 보여 준다", async () => {
    mockProfile(new Date(Date.now() + 2.5 * DAY).toISOString());
    render(
      <StrictMode>
        <Header />
      </StrictMode>
    );
    await waitFor(() => {
      expect(screen.getAllByText("구독 D-3").length).toBeGreaterThan(0);
    });
  });

  // 기준 시각은 경로 변경 effect 에서만 다시 잰다 — 하루가 지난 뒤 경로를 옮기면 남은 일수가 줄어야 한다.
  // Date 만 가짜로 돌려 setTimeout·Promise(waitFor·fetch 모의)는 진짜로 흐르게 한다.
  it("시각이 하루 넘게 지난 뒤 경로를 옮기면 D-day 숫자가 줄어든다", async () => {
    const t0 = new Date("2026-10-13T00:00:00Z").getTime();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(t0);
    nav.pathname = "/";
    try {
      mockProfile(new Date(t0 + 2.5 * DAY).toISOString());
      const { rerender } = render(<Header />);
      await waitFor(() => {
        expect(screen.getAllByText("구독 D-3").length).toBeGreaterThan(0);
      });

      vi.setSystemTime(t0 + 1.2 * DAY); // 남은 1.3일 → 올림 2
      nav.pathname = "/blog";
      rerender(<Header />);
      await waitFor(() => {
        expect(screen.getAllByText("구독 D-2").length).toBeGreaterThan(0);
      });
      expect(screen.queryByText("구독 D-3")).not.toBeInTheDocument();
    } finally {
      nav.pathname = "/";
      vi.useRealTimers();
    }
  });

  it("paid_until 이 지났으면 D-day 뱃지를 숨긴다", async () => {
    mockProfile(new Date(Date.now() - DAY).toISOString());
    render(<Header />);
    await waitFor(() => {
      expect(screen.getAllByText("전문가").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/구독 D-/)).not.toBeInTheDocument();
  });
});
