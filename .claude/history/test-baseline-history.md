# 테스트 기준선 이력 (루트 CLAUDE.md §테스트 현황 에서 이동, 세션 430)

> 자동 로드되지 않는다. 기준선 숫자의 근거를 따질 때 연다. 아래는 옮기기 직전 표의 세 줄 원문 그대로.

| 영역 | 도구 | 테스트 수 |
|------|------|----------|
| FE Vitest | `frontend/src/**/__tests__/` + `frontend/scripts/__tests__/` | **2332개** (세션 427 CI 실측 2026-10-02, PR #637 run 36952708676 Frontend CI: Test Files 256 · Tests 2332 passed — #608~#631 사이 프론트 변경으로 +12. 옛 2320 = 세션 421 CI 실측 2026-09-27, main 6e26abc5(#604) run 36249359005 Frontend CI: Test Files 256 · Tests 2320 passed — #603 폰 스케줄러 줄·5분 캐시 안내 등 +9. 옛 2311 = 세션 419 CI 실측 2026-09-26, PR #591 run 36200974061 Frontend CI: Test Files 255 · Tests 2311 passed — 관리자 화면 리뉴얼 #584~#591 로 +79(대시보드 4층·절 펼침·수집기 8종 `collectors.test.ts`·RawDetail·hideTitle·URL 동기화 등). 옛 2232 = 세션 418 CI 실측 2026-09-25, main a140cd01(#580) Frontend CI: Test Files 248 · Tests 2232 passed — #580 엑셀 왕복 3건 등 +10. 옛 2222 = 세션 417 CI 실측 2026-09-24, PR #568 Frontend CI: Test Files 247 · Tests 2222 passed — #565 로그인 upsert 미호출 1·#568 표 min-w 2·#570 주소 1·#571 proxy 4·#573 병상 2 등. 옛 2213 = 세션 410 실측 — 2213 passed / 246 파일, 새 `it()` 0 인 PR #531 에서 잰 값이라 기준선 자체. 옛 2205(세션 401). ⚠ **옛 표기 "RegionSelector 는 단독 재실행하면 통과 = 결함 아님" 은 거짓**이었다(s399·s400 이 확인 없이 flaky 로 분류). 세션 401 에 유휴 상태 **단독 실행에서도 실패**(EXIT=1) 실측 — 사유는 단언 실패가 아니라 `Error: Hook timed out in 10000ms`(10,270ms). 원인 = `beforeEach` 가 매 테스트 `vi.resetModules()` + `@base-ui` 동적 재import 로 모듈 그래프를 6회 재구성. 전량 실행에선 통과하기도 해 회차마다 갈린다. 판정법도 정정: "단독 재실행"이 아니라 **`git diff origin/main` 으로 그 파일 무변경 확인 + 사유가 타임아웃인지 확인**. ✅ **구조 수정 완료(세션 416)** — `vi.resetModules()`·동적 재import 를 걷어내고 정적 import + `vi.hoisted` 로 바꿨다(컴포넌트에 모듈 단위 상태가 없고 `TestQueryProvider` 가 마운트마다 새 QueryClient 를 만들어 재적재가 애초에 불필요). 타임아웃이 걸리던 `beforeEach` 훅 자체가 없어졌으므로, 이후 이 파일이 타임아웃으로 실패하면 **새 원인**이다. 직전 기준선 2174 에 시각회귀 안전망 +31 신설(check-visual-guard 25 · Header 메뉴집합 5 · Footer LOCKED_PATHS 1). 옛 문서값 2148(s399)·2135(s396)) |
| FE E2E | `frontend/e2e/*.spec.ts` | **21 파일** (Playwright, --webpack 모드 — 세션 419 #589 에 `admin-dashboard-sections.spec.ts`(절 5개 펼친 대시보드) 추가. 시각회귀 baseline PNG **22장**(세션 419 실측 2026-09-26: 설정 화면 삭제로 `admin-settings-admin-linux.png` 1장 제거 · #589 `admin-dashboard-sections-admin-linux.png` 1장 · #590 iPhone 13 관리자 project `admin-mobile` 의 `admin-dashboard-admin-mobile-linux.png` 1장 추가. 세션 417 PR #568 에 iPhone 13 뷰포트 project `public-visual-mobile` 의 `mibunyang-public-visual-mobile-linux.png` 1장 추가, chromium 엔진·배율 1 — 세는 법 = `find frontend/e2e -name "*.png" | wc -l` — 헤더 전용 `header-public-desktop` baseline 은 PR #501 에서 생성·커밋됐다. 옛 "19장·생성되면 20장" 표기는 세션 412 검사관이 실측으로 정정). 재생성 순서·판정·함정 = `frontend/e2e/README.md` §baseline 재생성 절차(세션 412 에 testing.md 에서 이동 — 시각회귀 절차 정본). project 별 대응표도 같은 파일) |
| BE pytest | `backend/tests/` | **2323개** (세션 427 직접 실측 `--collect-only` 2026-10-02, main a6a2a957(#636) · 같은 커밋 CI run 36950773959 Backend CI: 2309 passed · 8 skipped · 6 xfailed — #608~#636 사이 백엔드 변경(관리비 낮·저녁 회차·K-apt 간격 1.5초·미공개 7일 재확인 생략·매칭 보강과 관리비 회차 기다리기·관리비 알림 연속 두 번 문턱 등)으로 +135. 옛 2188 = 세션 421 CI 실측 2026-09-27, main 8be1595a(#606) run 36260063729 Backend CI: 2174 passed · 8 skipped · 6 xfailed — #598 429 를 빈 달로 삼키지 않기·#600 test_max_page_limit 멈춤 제거·#601 수집 버튼 백그라운드·#602 V067 인덱스·#605 오케스트레이터 겹침 방지 +5·#606 창구 남은 횟수 +11 로 +78. 세션 421 은 다른 프로젝트 밤 배치(01:30~06:30) 중이라 로컬 전체 대신 CI 값을 썼다. 옛 2110 = 세션 419 직접 실측 `--collect-only`, 2026-09-26 08:5x, main 1bb99852 — #585 잡 이름 통일·`error_plain`·`job_type` 필터 +9 · #587 running 컷오프·CI 동기 가드 +8 로 2113 뒤, #588 설정 API 삭제로 그 테스트 3건이 빠져 2110. 옛 2096 = 세션 418 직접 실측 `--collect-only`, 2026-09-25 21:3x, main 9325c5eb — #575 봉투 재시도·카나리 +23·#577 병상 가드 +2·#579 재수집 스크립트 +23·#581 카나리 상한·mostly_failed +18 = +66. 옛 2030 = 세션 417 직접 실측 `--collect-only`, 2026-09-25 00:24 — PR #566 인덱스 가드 +1·#569 kapt 조기 탈출 +7·#570 주소 +5·#571 관리자 판정 +7·#572 관리비 합산 +~50(22항목 파라미터화)·#573 병상 +6 등 합 +84. 옛 1946 = 세션 416 직접 실측 `--collect-only`, 2026-09-19 — #548 기준 1939 → 테스트 임시 DB 경로 가드(`test_conftest_temp_db.py`) +7. 임시 SQLite 파일명에 PID 가 붙어 **같은 PC 에서 pytest 두 개를 동시에 돌려도 서로 밟지 않는다**(옛 고정 이름은 `no such table`·`WinError 32` 거짓 실패를 냈다 — 세션 415). 옛 값 1896 = 세션 412 실측(2026-09-17) — #537 기준 1889 → #539·#540 시각표 가드(`test_restart_schedule_table.py`) +7. 옛 값 1869 = 세션 410 실측 — #530 기준 1867(+2: explain_error 결제 상태별·공백 입력) → 후속 PR(마침표·마스킹·포괄 규칙 회귀 3건) 1869. 세션 409 값 1865 는 `702b01d`(#527) 기준, 1845 대비 +20. 알림 8창구 우리말화 회귀: 필드 사전·문구 경계(`test_field_drift_monitor.py`)·결제/수집 안내 분기와 조사(`test_job_error_listener.py`)·개발자 어휘/접두어 **전수 추출 가드**(`test_plain_words.py`, **워크플로 YAML 포함**). ⚠ **`--collect-only`·pytest 는 `backend/` 안에서 실행하는 것이 표준**(pytest.ini·conftest 가 그 기준). 옛 함정 = 레포 루트에서 돌리면 `test_scheduler_monitoring_coverage.py` 가 상대경로 `open("crawler/scheduler.py")` 때문에 `FileNotFoundError` 로 수집 오류를 냈다(세션 407 실측) — **세션 412 에 `Path(__file__)` 절대경로로 수정**해 이제 루트에서도 수집된다. ⚠ 작업반 보고를 옮기지 말고 **매번 직접 재실측** — 세션 408 이 1848 로 잘못 보고했다(테스트 추가 후 미측정), [[feedback-baseline-number-needs-own-measure]]. 옛 문서값 1863·1845(s407~408)·1823(s406)·1804(s403)·1800(s402)) |

## 세션 445 갱신 (2026-10-07)

- FE Vitest 2332 → **2438** (Test Files 256 → 265) — main a82f282c(#679) run 37564806961 Frontend CI. 세션 427 이후 의견함(#656·#660·#663 등)·바닥글 등 프론트 변경 누적.
- BE pytest 2323 → **2514** (`--collect-only`, main c3db4903) — 세션 427 이후 의견함 V069·오류 알림·NUL 제거·매물별 저장 보호(#678·#680) 등 백엔드 변경 누적.

## 세션 464 갱신 (2026-10-14)

- FE Vitest 2438 → **2538** (Test Files 265 → 271) — main 48f01d51(#717) run 38293853632 Frontend CI(그 뒤 main 의 프론트 변경 f627dd7c 는 프론트 CI 가 안 돌았다 — 다음 push 가 앞 실행을 취소). 세션 445 이후 B19 react-hooks 시험(#718) 등 누적.
- BE pytest 2514 → **2761** (`--collect-only`, main b45fbf3a) — 세션 445 이후 SGIS 수집·B13·B14·B16·B18·B20(#723 새 시험 21) 등 누적.
- BE pytest 2761 → **2896** (`--collect-only`, main 82c1e5ea, 세션 467 2026-10-15) — B21(#730)·B22(#731)·B23·B24(#732)·공시가격 알림(#733)·B25(#735 새 시험 43) 누적.

## 세션 473 갱신 (2026-10-18)

- FE Vitest 2538 → **2373** (Test Files 271 → 257) — 워크트리 be879962 `npm test` 전체 1회. 감소 165건 = #744~#746 에서 미분양 막대·레이더 시험 17파일 삭제(+3파일 신설), 세션 473 작업반 실측(`git ls-tree` 48f01d51 271 · 6e2e9acc 257 · be879962 257).
- BE pytest 2896 → **2978** passed — 워크트리 be879962 전체 1회(동네 공식 통계 새 시험 + · 범죄 점수 잡 시험 삭제 −).

## 세션 474 갱신 (2026-10-19)

- FE Vitest 2373 → **2387** (Test Files 257 → 258) — 워크트리 3184aa58 전체 1회(PR 5 면적별 시세 `AreaPriceB27.test.tsx` 등 +14, 삭제 1).
- BE pytest 2978 → **3035** passed(8 skipped·6 xfailed) — 워크트리 3184aa58 전체 1회(`test_area_price_b27.py` 44 + 정정, 보완 ① 뒤 52).

## 세션 487 갱신 (2026-10-31)

- FE Vitest 2387 → **2757** (Test Files 258 → 286) — 세션 485 워크트리 5fca9b57 전체 1회(PR 3a~3c-2 서버 렌더·지역 페이지·사이트맵·robots 시험).
- BE pytest 3035 → **3239** passed(8 skipped) — #783 CI cc0a60cf 전체 1회 2026-10-31 02:22 KST(연결 창고 `test_database_pool.py` 5 등 · 세션 486 로컬 전체 1회는 3238 — CI 와 1건 차이는 환경 분기 시험 1건으로 추정, 다음 전체 실측 때 대조).

## 세션 489 갱신 (2026-10-31)

- FE Vitest 2757 → **2799** (Test Files 286 → 288) — 세션 489 워크트리 s489-b2 전체 1회 2,798(그중 `scripts/__tests__/check-job-labels.test.mjs` 1건은 새 워크트리 첫 읽기 5초 초과 — 단독 재실행 14/14 통과) + 검사 뒤 비교표 직거래만 시험 1. 증가 = `lib/__tests__/range-price.test.ts` 13 · `PriceHistoryChart.scatter.test.tsx` 3 · AreaPriceB27·PriceHistoryChart·compare 등.
