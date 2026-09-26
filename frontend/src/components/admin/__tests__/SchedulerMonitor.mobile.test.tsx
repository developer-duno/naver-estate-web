/**
 * SchedulerMonitor 폰 한 줄 테스트 (세션 420).
 * 폰(sm 미만)에서는 "주기"·"다음 실행" 칸이 숨으므로 작업 이름 아래 한 줄로 보인다.
 * 이 줄의 시각은 브라우저 시간대와 무관하게 한국 시간이어야 한다(CI 는 UTC).
 * 실행: npx vitest run src/components/admin/__tests__/SchedulerMonitor.mobile.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import type { SchedulerJobStatus, SchedulerStatusResponse } from "@/types/admin";

const { getSchedulerStatus } = vi.hoisted(() => ({ getSchedulerStatus: vi.fn() }));
vi.mock("@/lib/api", () => ({ getSchedulerStatus }));

import SchedulerMonitor, { formatKstShort, mobileScheduleLine } from "../SchedulerMonitor";

/** 테스트용 작업 한 줄을 만드는 팩토리 */
function makeJob(over: Partial<SchedulerJobStatus>): SchedulerJobStatus {
  return {
    scheduler_job_id: "kapt_costs",
    name: "단지 관리비 받기",
    schedule: "매일 06:20",
    enabled: true,
    last_run: null,
    next_run_at: "2026-09-27T06:20:00+09:00",
    stats_24h: { runs: 0, failures: 0 },
    ...over,
  };
}

/** 이 테스트 안에서만 프로세스 시간대를 바꿨다가 되돌린다.
 *  TZ 가 원래 비어 있었으면 지우는 대신 원래 쓰던 시간대 이름으로 되돌린다 —
 *  윈도우에서는 지우면 기본값이 UTC 로 바뀌어 뒤 테스트로 새어 나간다(실측) */
function withTz<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = prev;
  }
}

describe("formatKstShort — 한국 시간 고정", () => {
  it("UTC 로 들어온 시각을 브라우저가 UTC 여도 한국 시간으로 찍는다", () => {
    // 2026-09-26 21:20 UTC = 2026-09-27 06:20 KST (날짜가 넘어가는 경계)
    const out = withTz("UTC", () => formatKstShort("2026-09-26T21:20:00Z"));
    expect(out).toBe("09-27 06:20");
  });

  it("+09:00 로 들어온 시각은 그대로", () => {
    expect(formatKstShort("2026-09-26T21:34:00+09:00")).toBe("09-26 21:34");
  });

  it("해석할 수 없는 값이면 null", () => {
    expect(formatKstShort("not-a-date")).toBeNull();
  });
});

describe("mobileScheduleLine — 폰 한 줄 문구", () => {
  it("주기 · 다음 시각", () => {
    expect(mobileScheduleLine(makeJob({}))).toBe("매일 06:20 · 다음 09-27 06:20");
  });

  it("다음 실행이 없으면(꺼진 잡) '다음 실행 없음'", () => {
    expect(
      mobileScheduleLine(
        makeJob({ schedule: "매일 04:50", next_run_at: null as unknown as undefined }),
      ),
    ).toBe("매일 04:50 · 다음 실행 없음");
    expect(mobileScheduleLine(makeJob({ schedule: "매일 04:50", next_run_at: undefined }))).toBe(
      "매일 04:50 · 다음 실행 없음",
    );
  });
});

describe("SchedulerMonitor 표 — 폰 줄 렌더", () => {
  beforeEach(() => {
    const resp: SchedulerStatusResponse = {
      jobs: [
        makeJob({}),
        makeJob({
          scheduler_job_id: "billing_charge",
          name: "구독료 자동 결제",
          schedule: "매일 04:50",
          enabled: false,
          next_run_at: undefined,
        }),
      ],
      summary: { total_runs_today: 0, failures_today: 0 },
    };
    getSchedulerStatus.mockResolvedValue(resp);
  });

  it("폰 줄은 sm:hidden 과 함께 렌더되고, PC 칸(주기·다음 실행)은 그대로 hidden sm:table-cell", async () => {
    render(
      <TestQueryProvider>
        <SchedulerMonitor token="t" />
      </TestQueryProvider>,
    );
    const lines = await screen.findAllByTestId("mobile-schedule-line");
    expect(lines).toHaveLength(2);
    for (const el of lines) {
      expect(el.className).toContain("sm:hidden");
    }
    expect(lines[0]).toHaveTextContent("매일 06:20 · 다음 09-27 06:20");
    expect(lines[1]).toHaveTextContent("매일 04:50 · 다음 실행 없음");

    // PC 표 머리 칸은 손대지 않았다
    expect(screen.getByText("주기").className).toContain("hidden sm:table-cell");
    expect(screen.getByText("다음 실행").className).toContain("hidden sm:table-cell");
  });
});
