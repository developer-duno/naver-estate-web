# 개선 실행 플랜 (2026-08-02 기준)

> **성격**: 이 문서는 특정 세션 로그가 아니라, 2026-08-02 전수조사(구조 지도 + 규칙 파일 진단 +
> AI 개발환경 감사 + 옛 감사 문서 재실측) 결과를 근거로 만든 **현재 시점 실행 계획**이다.
> 항목이 처리되면 이 문서에서 지우고, 새로 발견되면 여기 추가한다 — 세션별 스냅샷이 아니라
> 살아있는 체크리스트로 유지한다(`.claude/rules/planning.md`의 "세션 진행 박제 금지" 원칙과
> 결이 같음 — 단 이 문서는 "미해결 작업 목록"이라 그 규칙의 예외로 둔다).
>
> **선행 조사 근거**: 2026-08-02 구조 지도·규칙 파일 진단(91/100)·AI 개발환경 감사(86/100) +
> `docs/archive/2026-04-to-06-completed-audits.md`(옛 감사 6건 재실측). 각 항목의 "근거"는
> 이 세션에서 실제로 읽거나 grep한 결과다.

## 우선순위 판단 기준

- **P0 (즉시)**: 서비스 전체를 멈출 수 있는 단일 장애점, 또는 사용자에게 이미 노출된 결함.
- **P1 (이번 주)**: 사용자 경험에 영향이 있지만 서비스가 멈추진 않는 결함, 문서 신뢰도 문제.
- **P2 (여유 있을 때)**: 코드 품질·접근성·아키텍처 개선. 화면 동작 변화 없음.

---

## P0 — 즉시

### P0-0. [진단 완료] 크롤링 장애·텔레그램 신호 불일치 — 30일 실측 재조사 (2026-08-02)

> 사장님이 "네이버 크롤링이 느리다·실패가 많다·텔레그램 신호가 안 맞는다"고 지적 →
> 1차 조사(몇 시간 치 로그만 봄)가 "정상"이라 오판 → 텔레그램 스크린샷 증거로 재조사 →
> 30일 DB 실측 + GitHub Actions 로그로 진짜 원인 확정. 아래는 재조사로 밝혀진 사실.

**핵심 발견 — 두 개의 독립된 사건이 섞여 있었다:**

1. **터널 단절 사건 (이미 해결됨, 과거형)**: 2026-07-13 05:04~08-02 00:55(UTC) 사이
   Cloudflare 터널이 끊겨 외부에서 서버 자체에 도달 불가(HTTP 530). 이 구간은
   `crawl_jobs` DB 테이블에 전혀 기록이 안 남는다(서버가 요청을 받지도 못했으므로) —
   1차 조사가 "실패 0건"이라 오판한 이유. 세션344에서 이미 원인 규명·복구 완료.
   8/1 새벽 20회+ 연속 "헬스체크 실패" 알림이 이 사건의 증거.
2. **상시 존재하는 설계상 병목 (지금도 있음, 터널과 무관)**:
   - `article_detail`(단지 상세 매물 크롤) 후보 SELECT가 인덱스 없는 정렬 쿼리라
     부하 시 30초 override도 넘겨 마비 가능 (`backend/crawler/service_discover.py:386-415`,
     실측 근거: 최근 30일 중 4건이 19~65분간 running 상태로 멈췄다가 `cancelled` 처리됨).
   - `public_trade_data`(국토부 실거래가) job은 **체크포인트 저장은 하나 재개(resume)
     로직이 없어** 중단되면 매번 처음부터 재시작 → 686시간(28일) 미축적·처리율 18%
     정체 (`backend/crawler/service_public.py:17-172`, checkpoint read 코드 부재).
   - 상세 크롤 실패율이 50% 넘으면 **의도적으로** `done_partial`로 조기 종료
     (`backend/routers/live/_detail_worker.py:100-102`, `DETAIL_FAILURE_THRESHOLD=0.5`)
     — 버그 아닌 설계(죽은 매물 비율이 높은 단지의 정상 동작)지만 사용자에게 이유가
     안 보임.
   - 단지 클릭 시 매물 상세 갱신이 매물 건당 0.3초 sleep을 2스레드로만 처리
     (`backend/routers/live/_detail_worker.py:48-56`) — 매물 수에 선형 비례해 느려짐.
3. **텔레그램 신호 불일치의 구조적 원인**: 알림 채널이 서로 독립된 3곳
   (① `.github/workflows/healthcheck.yml` 외부 하루 1회, ② `backend/crawler/monitor.py`
   내부 10~30분, ③ `backend/crawler/job_error_listener.py` 내부 즉시) — 서버가
   통째로 죽으면 ②③은 함께 침묵하고 ①만 다음 체크 때 발화. "정상으로 돌아왔습니다"도
   monitor.py가 stale job을 강제 `cancelled` 처리해도 똑같이 뜨는 얕은 판정
   (`monitor.py:203-241,305-323`) — false positive 복구 가능.

**즉시 조치 2건 착수됨 (2026-08-02, 서브에이전트 진행 중)**:

- `service_public.py`의 `backfill_price_batch` 개별 except에서 `db.rollback()` 누락
  수정 (옆 함수 `crawl_complex_details_batch`는 정상 호출 중이던 것과 대조적으로 확인).
- 진행률 배너 "일부 항목 갱신 완료" 문구를 이유 설명형으로 개선(로직 변경 없음).

**✅ `public_trade_data` 체크포인트 재개(resume) 로직 신설 — 완료 (2026-08-02)**:

- **원인**: `CheckpointManager.save()`는 시군구 처리마다 호출되고 있었으나 `load()`를
  아무도 호출하지 않아 "저장만 하고 재개는 안 하는" 상태 — job이 실패/취소되면 다음
  실행이 매번 시군구 목록 처음부터 다시 돌았다(686시간/28일 미축적, 처리율 18% 정체).
- **조치**: `collect_public_trade_data()`(`backend/crawler/service_public.py`) 시작 시
  `job_type="public_trade_data"` + `status in (failed, cancelled)`인 가장 최근 job의
  체크포인트를 조회해 "이미 처리한 시군구 코드 집합(`done_codes`)"을 이어받아 남은
  시군구만 처리. "몇 번째까지"가 아닌 "코드 집합"으로 저장한 이유 = 시군구 목록이 DB
  `distinct` 쿼리(정렬 보장 없음)라 실행마다 순서가 바뀔 수 있어, 인덱스 기반 재개는
  다른 시군구를 건너뛰거나 중복 처리할 위험이 있었음. `completed` job은 재개 대상에서
  제외(체크포인트도 완료 시 삭제되는 기존 동작 유지).
- **부수 발견**: `func.left(Complex.cortar_no, 5)`가 PostgreSQL 전용 함수라 SQLite(CI
  테스트 엔진)에 없어, 이 함수가 지금까지 통합테스트 자체가 불가능했음
  (`domain-mapping-ssot.md` 룰3 dialect 의존성과 동일 결이나 raw SQL이 아닌 ORM
  `func` 호출이라 그 룰의 grep 패턴으론 못 잡던 케이스). `tests/conftest.py`에 SQLite용
  `LEFT()` 함수를 등록해 앞으로 이 경로도 테스트 가능하게 함.
- **회귀 테스트**: `backend/tests/test_public_trade_resume.py` 신규 3케이스(재개 시
  완료분 건너뜀 / 체크포인트 없으면 전체처리 / completed job은 재개 대상 아님).
- **검증**: `ruff check .` clean, BE pytest 1063 passed / 0 failed(세션 346 실측).
- **커밋**: `023c6fb`

**보류 — 별도 승인 필요 (규모가 커서 이번 라운드에 포함 안 함)**:

- article_detail 후보 SELECT 정렬 컬럼(`last_seen_at`) 인덱스 추가 검토.
- 3개 텔레그램 채널을 조율하는 로직(서버 다운 시 중복 알림 억제, resolved/cancelled
  구분 문구) — 규모가 있어 별도 트랙.

### ✅ 부수 — brace-expansion DoS 취약점 2건 해소 (2026-08-02)

- Dependabot #18(GHSA-3jxr-9vmj-r5cp)·#35(GHSA-mh99-v99m-4gvg) — `eslint-config-next` →
  `typescript-eslint` 경유 간접 의존성 `brace-expansion@5.0.6`이 두 DoS 취약점 범위(각각
  5.0.7·5.0.8 미만) 안에 있었음. `npm audit --omit=dev`(CI 게이트와 동일 조건)는 수정
  전에도 이미 0건 — 취약 버전이 devDependencies(eslint류) 경유뿐이라 배포 코드 영향 0.
- **조치**: `npm audit fix`로 `brace-expansion` 5.0.6→5.0.9, `frontend/package-lock.json`만
  변경(package.json 불변). GitHub API로 두 알림 모두 `state: fixed` 확인.
- **검증**: `npm audit` 0 vulnerabilities, tsc 0 errors, lint 0 errors, vitest 219파일
  1930테스트 전원 통과. **커밋**: `dfc54cf`

### P0-1. 자택 서버 단일 장애점(SPOF) + 감시망이 CI 예산에 종속됨

- **문제**: 백엔드가 사용자 자택 컴퓨터 1대에서만 돈다. 2026-07-18~08-01 사이 15일간 외부
  터널·서비스가 전멸했는데, 그 원인이 GitHub Actions 헬스체크(10분 간격)가 무료 한도
  2,000분/월을 소진해 **감시 자체가 먼저 죽었기 때문**이었다(`.github/workflows/healthcheck.yml`
  상단 주석 + 메모리 `session344_summary.md`). 이미 한 번 실제로 겪은 사고다.
- **현재 조치**: healthcheck를 10분→일 1회로 낮춰 예산 소모는 막았으나(`healthcheck.yml`),
  이는 "감시 빈도를 낮춘 것"이지 "감시망을 예산과 독립시킨 것"은 아니다. 일 1회로는 장애를
  최대 24시간 늦게 발견할 수 있다.
- **권장 조치**: GitHub Actions와 무관한 외부 무료 서비스(UptimeRobot, Better Uptime 등)로
  `https://api.2u.pe.kr/health/db` 감시를 이중화. 5~10분 간격으로 걸어도 GitHub 예산과
  전혀 무관하다.
- **난이도**: 쉬움(가입 후 URL 등록, 코드 변경 없음). **비용**: 무료 플랜으로 충분.

### P0-2. GitHub Actions 무료 한도 재소진 감시 부재

- **문제**: P0-1과 같은 원인이 다른 워크플로(CI 등)로도 재발할 수 있다. `docs/ops/free-tier-budget.md`에
  "월초 대시보드 확인" 절차는 있으나 자동 알림은 없다.
- **권장 조치**: 월초 수동 확인을 계속하되, 이번 사고를 계기로 "Actions 분 급감 시 알림" 같은
  능동 감시는 과잉일 수 있음 — 최소한 P0-1의 외부 감시가 대체 안전망이 되므로 이 항목은 P0-1
  완료 후 자동으로 위험도가 낮아짐. **P0-1에 종속**.

---

## P1 — 이번 주

### ✅ P1-1. 모바일 터치타겟 44px 미달 — 완료 (2026-08-02)

- **조치**: `frontend/src/components/search/ComplexRow.tsx:50` 비교 버튼에 `min-h-[44px]
  min-w-[44px]` 추가. `Header.tsx`의 기존 대괄호 표기 관례를 그대로 따름.
- **회귀 테스트**: `frontend/src/components/search/__tests__/ComplexRow.test.tsx` 신규
  (정상 렌더 1 + 터치타겟 클래스 검증 1 + 비교 가득참 상태 1, 총 3케이스).
- **미착수 잔여**: `ComplexCardMobile.tsx`·`Pagination.tsx`도 같은 패턴 가능성이 원본 보고서에
  있었으나 이번엔 `ComplexRow.tsx`만 확인·수정함 — 필요 시 다음 라운드에서 grep 재확인.

### ✅ P1-2. `search/page.tsx` unmount 후 setState 경고 — 이미 해결됨 (재확인만, 2026-08-02)

- **재확인 결과**: `search/page.tsx`는 "세션 314"에서 `/search`가 홈(`/`)으로 흡수되며 완전히
  다른 코드로 교체됨 — 지금은 URL 파라미터를 보존한 채 홈으로 리다이렉트만 하는 컴포넌트라
  `getSession().then()` 체인 자체가 없음. 실제 로그인 상태 조회는 `Header.tsx`가 담당하며,
  거기엔 이미 `isMountedRef` 방어가 완비돼 있음(29~33·39·41·64·68·90·96·102줄). **조치 불필요.**

### ✅ P1-3. Admin 모달 접근성 — 완료 (2026-08-02)

- **조치**: `VerificationReview.tsx`(자격증 미리보기·거부 사유 모달 2개) +
  `UserTable.tsx`(승인 기간 모달 1개), 총 3개 모달에 `role="dialog"`·`aria-modal="true"`·
  `aria-label`·ESC 닫기·Tab 포커스 트랩·배경 스크롤 잠금 추가. `ArticleDetail.tsx`/
  `PromptModal.tsx`의 기존 패턴을 그대로 재사용(`useDialogA11y` 로컬 훅, 파일당 1개 —
  소비처가 2곳뿐이라 공용 훅으로 뽑지 않음, YAGNI).
- **회귀 테스트**: `VerificationReview.test.tsx`(4케이스) + `UserTable.test.tsx`(4케이스) 신규.
- **전체 검증**: `tsc --noEmit` 0 errors / `npm run lint` 0 errors(기존 warning 1건은 무관 파일)
  / `npx vitest run` 219 파일 1930 테스트 전원 통과(2026-08-02).

### P1-4. mibunyang 쪽 data.go.kr 공유 쿼터 미연동

- **문제**: `docs/quota_db_integration.md`가 안내하는 `rate_limit_counters` 공유 카운터를
  mibunyang(`F:\mibunyang`) 쪽 수집기가 아직 쓰지 않음(`rate_limit_counter`/`quota_db` 패턴
  `.mjs` 파일 전체에서 0건, 2026-08-02 재확인). 매월 10일이 토요일과 겹치면 두 프로젝트
  합산 호출이 10,000회 한도를 넘을 수 있는 위험이 여전히 남아있음(이 리포의
  `service_public.py`는 이미 자체 방어하지만, mibunyang이 먼저 9,000을 다 쓰면 이 리포가
  차단당하는 비대칭 위험은 여전).
- **이 리포에서 할 수 있는 일 없음** — mibunyang 리포(`F:\mibunyang`)의 별도 세션 소관.
  이 항목은 "naver-estate-web 세션이 참고할 자료가 아직 유효하다"는 확인용으로만 이
  플랜에 기록.
- **난이도**: N/A(다른 리포). **다음 행동**: mibunyang 세션에서 `docs/quota_db_integration.md`
  체크리스트 실행.

---

## P2 — 여유 있을 때 (화면 동작 변화 없음)

| # | 항목 | 근거 | 난이도 |
|---|---|---|---|
| P2-1 | `backend/crawler/` docstring 없는 파일(예: `monitor.py`, `utils.py`, `stats.py`, `env_air.py` 등 다수) 1줄 요약 추가 | 2026-08-02 조사(35파일 중 다수 docstring 없음 확인) | 쉬움 |
| P2-2 | `.claude/hooks/post-merge-zombie-reminder.js`를 경고형에서 `release-verify` 스킬 자동 호출로 승격 검토 | AI 환경 감사 §위험 병목 3 | 보통 |
| P2-3 | `next-devtools` MCP 재활성화 또는 Playwright MCP로 UI 즉시 시각검증 도입 | AI 환경 감사 §위험 병목 4 (`disabledMcpjsonServers`에 비활성 확인) | 쉬움 |
| P2-4 | `.claude/settings.local.json`의 `f:/cursor/naver-estate-web` 낡은 경로 permission 정리 | AI 환경 감사 (settings.local.json 실측) | 쉬움 |
| P2-5 | 결제(`payment.py`/`billing.py`) 전용 read-only 서브에이전트 신설 검토 | 기존 3개 서브에이전트(크롤·세금·마이그레이션)에 결제 영역만 없음 | 보통 |
| P2-6 | `backend/CLAUDE.md`의 DB 마이그레이션 표·테스트 카운트 등 다른 drift 여부 정기 재점검 | 이번 세션에서 admin 폴더 1건 drift 발견 — 유사 패턴 가능성 | 보통(분기 1회 권장) |

---

## 이번 세션에서 이미 처리한 것 (참고 — 재작업 불필요)

### 2026-08-02 (1차 세션 — 문서 리뉴얼)

- `CLAUDE.md`(루트) "rules 5종" 표기 → 실제 10종으로 정정
- `backend/CLAUDE.md` `routers/admin/` "9 파일" → 실제 10파일(`freshness_meta` 누락분) 정정
- `docs/` 최상위 감사·사고대응 문서 6개 → `docs/archive/2026-04-to-06-completed-audits.md`
  1개로 통합 (완료 확인분 11건 + 미해결 이관 3건, 원본 삭제)

### 2026-08-02 (2차 세션 — P1 코드 수정)

- P1-1 터치타겟 44px (`ComplexRow.tsx`) — 완료, 회귀 테스트 3케이스
- P1-2 search 페이지 메모리 누수 — 재확인 결과 이미 해결돼 있었음(조치 불필요)
- P1-3 admin 모달 접근성 (`VerificationReview.tsx`·`UserTable.tsx`) — 완료, 회귀 테스트 8케이스
- 커밋 전 필수 검증 3종(tsc·lint·vitest) 전부 통과 확인, 아직 git commit은 안 함

## 다음 재점검 시점

- **월초**: `docs/ops/free-tier-budget.md` 절차대로 Actions·Vercel 잔량 확인.
- **P0-1 조치 후**: 외부 감시 서비스가 실제로 알림을 보내는지 1회 강제 장애 테스트(백엔드
  잠깐 내려서 확인) 권장.
- **분기 1회**: `claude-md-improver` 스킬로 CLAUDE.md 3벌 + rules 10개 재감사(P2-6과 동일 취지).
