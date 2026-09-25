import { test, expect } from "@playwright/test";
import { applyAdminMocks } from "./fixtures/admin-mocks";
import type { SchedulerStatusResponse, SchedulerJobStatus } from "../src/types/admin";
import type { CrawlFailuresResponse } from "../src/lib/api/admin";

/**
 * 대시보드 3층 "원인" 절 5개를 **전부 펼친** 모습의 시각 회귀.
 *
 * 기존 admin-dashboard.spec.ts 는 절을 접은 채 찍는다(접힌 동안 안쪽 카드를 안 그려 높이가 안정).
 * 그래서 펼쳤을 때의 결함 — 절 제목과 카드 제목이 두 줄로 겹치던 것("자동 작업 현황 / 자동 작업 현황"),
 * 긴 작업 이름·긴 오류 문구가 표를 밀어내는 것 — 을 어떤 장도 보지 못했다. 이 장이 그 자리를 본다.
 *
 * - 응답은 이 파일 안에서 **큰 mock 으로 고정**한다(자동 작업 31개 · 실패 5유형 · 80자 오류 문구).
 *   admin-mocks.ts 의 작은 mock 은 기존 대시보드 촬영용이라 건드리지 않고, 뒤에 등록한 route 가
 *   먼저 걸리는 성질(Playwright 는 등록 역순으로 매칭)로 이 장에서만 덮어쓴다.
 * - 시각은 고정한다 — "마지막 실패 3시간 전" 같은 상대 시각이 날마다 바뀌면 장이 매일 달라진다.
 * - 대기 기준은 카드 제목이 아니라 **데이터가 그려진 뒤에만 나오는 글자**다(e2e/README.md §대기 조건).
 *   모든 절이 mock 을 가지므로 정상 경로만 기다린다.
 */

/** 촬영 기준 시각 — mock 의 시각들이 이 시각 앞뒤로 놓인다 */
const NOW = new Date("2026-04-16T09:00:00+09:00");

/** 가장 긴 작업 이름 — 표가 이 길이에 밀려 깨지는지 보려고 일부러 둔다 */
const LONG_JOB_NAME = "오피스텔 분양권 단지 정보 채우기";

/** 80자 우리말 오류 문구 — 실패 행이 줄바꿈으로 버티는지 본다 */
const LONG_ERROR_PLAIN =
  "관리비를 알려 주는 정부 창구가 잠시 답을 주지 않았어요. 몇 분 뒤 다시 시도하면 대부분 저절로 풀리니 내일 아침 결과만 한 번 확인해 주세요";

type JobRow = [id: string, name: string, schedule: string];

/** release.md §3-0 시각표의 등록 잡 31개와 같은 수 — 이름은 우리말 사전(JOB_WORDS) 표현 */
const JOB_ROWS: JobRow[] = [
  ["backfill_detail_dawn", "빠진 정보 뒤늦게 채우기 (새벽)", "매일 00:20"],
  ["collect_childcare", "어린이집 정보 받기", "매월 첫째 목요일 01:00"],
  ["crawl_articles", "단지 매물 가져오기", "매일 01:00, 13:00"],
  ["collect_air_quality", "동네 공기질 받기", "매일 02:00"],
  ["collect_emergency", "응급실 위치 받기", "매월 첫째 월요일 03:00"],
  ["discover_regions", "새 단지 찾기", "주 1회 일요일 03:00"],
  ["backfill_price", "옛 시세 채워 넣기", "매일 03:30"],
  ["vacuum_maintenance", "자료 보관함 정리", "매일 03:50"],
  ["collect_crime_stats", "동네 범죄 통계 받기", "분기별 첫째 일요일 04:00"],
  ["collect_prices", "단지 시세 기록 모으기", "주 1회 수요일 04:00"],
  ["collect_metrics", "단지 가치 점수 계산", "매일 04:30"],
  ["field_drift_monitor", "정보 안 채워지면 알림", "매일 04:40"],
  ["billing_charge", "구독료 자동 결제", "매일 04:50"],
  ["collect_officetel_presale", "오피스텔 청약 공고 받기", "주 1회 월요일 05:00"],
  ["collect_public_trades", "정부 실거래가 받기", "주 1회 토요일 05:00"],
  ["collect_rental_presale", "민간임대 청약 공고 받기", "주 1회 월요일 05:30"],
  ["kapt_match", "관리비 단지 연결하기", "매월 21일 06:10"],
  ["kapt_costs", "단지 관리비 받기", "매일 06:20"],
  ["official_price", "정부 공시가격 받기", "매월 15일 06:30"],
  ["api_version_probe", "정부 자료 창구 살아있나 확인", "주 1회 일요일 06:40"],
  ["complex_detail_ABYG", "아파트 분양권 단지 정보 채우기", "주 1회 수요일 07:00"],
  ["complex_detail_JGC", "재건축 단지 정보 채우기", "주 1회 화요일 07:00"],
  ["complex_detail_OBYG", LONG_JOB_NAME, "주 1회 목요일 07:00"],
  ["popular_1030", "자주 보는 단지 미리 갱신 (오전)", "매일 10:45"],
  ["backfill_detail_noon", "빠진 정보 뒤늦게 채우기 (낮)", "매일 12:20"],
  ["popular_1430", "자주 보는 단지 미리 갱신 (오후)", "매일 14:45"],
  ["popular_1900", "자주 보는 단지 미리 갱신 (저녁)", "매일 19:15"],
  ["crawl_details", "매물 상세 내용 채우기", "30분마다"],
  ["crawler_monitor", "수집 상태 살피기", "10분마다"],
  ["complex_detail_APT", "아파트 단지 정보 채우기", "4시간마다"],
  ["complex_detail_OPST", "오피스텔 단지 정보 채우기", "4시간마다"],
];

/** 행마다 상태를 돌려 가며 섞는다 — 완료·실패·실행 중·기록 없음·꺼짐이 한 장에 다 나오게 */
function buildJob([id, name, schedule]: JobRow, i: number): SchedulerJobStatus {
  const kind = i % 7;
  const started = "2026-04-16T06:20:00+09:00";
  const base = {
    scheduler_job_id: id,
    name,
    schedule,
    enabled: kind !== 6,
    next_run_at: "2026-04-17T06:20:00+09:00",
    stats_24h: { runs: 1, failures: kind === 2 ? 1 : 0 },
  };
  if (kind === 5) return { ...base, last_run: null };
  if (kind === 2) {
    return {
      ...base,
      last_run: {
        status: "failed",
        started_at: started,
        completed_at: "2026-04-16T06:20:12+09:00",
        duration_seconds: 12,
        total_items: 500,
        processed_items: 0,
        error_message: "ProviderError: code 04 service timeout",
        error_plain: LONG_ERROR_PLAIN,
      },
    };
  }
  if (kind === 3) {
    return {
      ...base,
      last_run: { status: "running", started_at: started, total_items: 500, processed_items: 120 },
    };
  }
  return {
    ...base,
    last_run: {
      status: "completed",
      started_at: started,
      completed_at: "2026-04-16T07:05:00+09:00",
      duration_seconds: 2700,
      total_items: 1200,
      processed_items: 1200,
    },
  };
}

const bigSchedulerStatus: SchedulerStatusResponse = {
  jobs: JOB_ROWS.map(buildJob),
  summary: { total_runs_today: 31, failures_today: 5 },
};

const bigCrawlFailures: CrawlFailuresResponse = {
  window_hours: 24,
  total: 12,
  items: [
    {
      job_type: "kapt_costs",
      count: 5,
      last_error: "ProviderError: code 04 service timeout",
      last_error_plain: LONG_ERROR_PLAIN,
      last_failed_at: "2026-04-16T06:20:12+09:00",
    },
    {
      job_type: "complex_articles",
      count: 3,
      last_error: "HTTP 429 Too Many Requests",
      last_error_plain: "네이버가 잠시 요청을 막았어요. 속도를 줄여 다음 회차에 다시 받아요.",
      last_failed_at: "2026-04-16T01:30:00+09:00",
    },
    {
      job_type: "complex_detail_OBYG",
      count: 2,
      last_error: "KeyError totalFloorCount",
      last_error_plain: null,
      last_failed_at: "2026-04-15T07:00:40+09:00",
    },
    {
      job_type: "price_history",
      count: 1,
      last_error: "psycopg2.errors.QueryCanceled: canceling statement due to statement timeout",
      last_error_plain: "자료 창고가 너무 오래 걸려 한 번 건너뛰었어요.",
      last_failed_at: "2026-04-16T04:00:09+09:00",
    },
    {
      job_type: "air_quality",
      count: 1,
      last_error: null,
      last_failed_at: null,
    },
  ],
};

const SECTIONS = [
  "자동 작업 현황",
  "데이터 신선도",
  "실패 자세히 (최근 24시간)",
  "네이버 호출 횟수",
  "방문·요청 통계",
];

const SECTION_IDS = ["scheduler", "freshness", "failure", "naver-calls", "traffic"];

test.describe("admin dashboard — 원인 절 전부 펼침", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await applyAdminMocks(page);
    // 뒤에 등록한 route 가 먼저 걸린다 — 이 장에서만 큰 mock 으로 덮는다
    await page.route("**/api/admin/scheduler-status", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bigSchedulerStatus) });
    });
    await page.route("**/api/admin/crawl-failures*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bigCrawlFailures) });
    });
  });

  test("절 5개를 펼치면 제목은 절마다 한 줄이고 표·오류 문구가 깨지지 않는다", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();

    for (const title of SECTIONS) {
      await page.getByText(title, { exact: true }).click();
    }
    await expect(page.getByText(/접기 ▲/)).toHaveCount(SECTIONS.length);

    // 각 절 안쪽 — 데이터가 그려진 뒤에만 나오는 글자를 기다린다(카드 제목은 로딩 중에도 보여 기준 금지)
    const scheduler = page.locator("#scheduler");
    await expect(scheduler.getByText(LONG_JOB_NAME)).toBeVisible();
    await expect(scheduler.getByText("오늘 31회 실행")).toBeVisible();
    await expect(scheduler.locator("tbody > tr")).toHaveCount(JOB_ROWS.length);

    const freshness = page.locator("#freshness");
    await expect(freshness.getByText(/헛바퀴 의심 = 작업은 돌았는데/)).toBeVisible();

    const failure = page.locator("#failure");
    await expect(failure.getByRole("button", { name: /단지 관리비 받기 5건 실패/ })).toBeVisible();
    await expect(failure.getByText(`최근 오류: ${LONG_ERROR_PLAIN}`)).toBeVisible();
    await expect(failure.locator("li")).toHaveCount(bigCrawlFailures.items.length);

    await expect(page.locator("#naver-calls").getByText("합계", { exact: true })).toBeVisible();
    await expect(page.locator("#traffic").getByText("속도(중간)").first()).toBeVisible();

    // 절 제목과 카드 제목이 두 줄로 겹치지 않는다 — 펼친 절 안에 카드 제목(h3)이 없다
    for (const id of SECTION_IDS) {
      await expect(page.locator(`#${id} h3`)).toHaveCount(0);
    }
    for (const title of SECTIONS) {
      await expect(page.getByText(title, { exact: true })).toHaveCount(1);
    }

    await expect(page).toHaveScreenshot("admin-dashboard-sections.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
