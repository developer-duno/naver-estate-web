import { describe, it, expect } from "vitest";

import {
  JOB_STATUS_STYLES,
  FALLBACK_CHIP,
  type JobStatus,
} from "@/lib/admin/job-status-styles";

describe("JOB_STATUS_STYLES SSOT", () => {
  // 7개 상태 모두 정의됐는지 (백엔드 enum 과 1:1 매핑이 깨지면 회귀)
  it("7개 잡 상태 키가 모두 정의돼 있다", () => {
    const expected: JobStatus[] = [
      "completed",
      "running",
      "failed",
      "cancelled",
      "pending",
      "paused",
      "upcoming",
    ];
    const actual = Object.keys(JOB_STATUS_STYLES).sort();
    expect(actual).toEqual([...expected].sort());
  });

  // 캘린더 강조형 / 깜빡임은 운영자 주목이 필요한 상태에만 (실수로 다른 상태에 emphasize 켜지면 회귀)
  it("emphasize 는 running·failed 만, pulse 는 running 만 true", () => {
    for (const status of Object.keys(JOB_STATUS_STYLES) as JobStatus[]) {
      const style = JOB_STATUS_STYLES[status];
      const shouldEmphasize = status === "running" || status === "failed";
      const shouldPulse = status === "running";
      expect(style.emphasize ?? false).toBe(shouldEmphasize);
      expect(style.pulse ?? false).toBe(shouldPulse);
    }
  });

  // ErrorRateChart 는 hex 4상태만 사용 — SSOT 약속 (Bar fill={...hex!} non-null assert 안전성 보장)
  it("ErrorRateChart 가 쓰는 4상태(completed/failed/paused/cancelled) hex 정의 있다", () => {
    expect(JOB_STATUS_STYLES.completed.hex).toBe("#10b981");
    expect(JOB_STATUS_STYLES.failed.hex).toBe("#ef4444");
    expect(JOB_STATUS_STYLES.paused.hex).toBe("#f59e0b");
    expect(JOB_STATUS_STYLES.cancelled.hex).toBe("#9ca3af");
  });

  // PR #51 답습 — cancelled = "실패 아님" 회색 격하 (강조 X, chip·emphasized 둘 다 회색)
  it("cancelled 는 chip·emphasized 둘 다 회색 (PR #51 답습)", () => {
    expect(JOB_STATUS_STYLES.cancelled.chip).toContain("bg-gray-100");
    expect(JOB_STATUS_STYLES.cancelled.chip).toContain("text-gray-500");
    expect(JOB_STATUS_STYLES.cancelled.emphasized).toContain("bg-gray-100");
    expect(JOB_STATUS_STYLES.cancelled.emphasize).toBeFalsy();
  });

  it("FALLBACK_CHIP 은 회색 톤이다", () => {
    expect(FALLBACK_CHIP).toContain("bg-gray-100");
  });
});
