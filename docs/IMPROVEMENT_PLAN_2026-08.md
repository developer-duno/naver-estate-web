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
