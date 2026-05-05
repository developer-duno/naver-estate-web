# 프로젝트 자산 카탈로그 (Claude 작업 진입점)

세션 109 (2026-05-05) 신설. 다음 세션 Claude가 작업 시작 시 첫 참조하는 인덱스.

> **사용법**: 새 세션 시작 시 본 파일을 먼저 grep/Read하여 PDF·라이브러리·글로벌 위치를 1분 안에 파악. 새 자산 추가 시 같은 커밋에 본 파일 갱신 (drift 방지).

---

## §1 한국어 PDF 자산 매핑 (16장)

위치: `f:/cursor/naver-estate-web/종합부동산세/`

다음 세션에서 영문 키워드(`spouse-joint`, `corp-progressive` 등)로 grep 시 권위 출처 PDF 즉시 추적 가능. **한국어 파일명 직접 grep 금지** (Windows 경로 인코딩 깨짐 위험) — 본 표의 영문 alias 사용.

| # | 한국어 파일명 | 영문 alias | 주요 사용처 (NoticeKey / 산식) | 검수 세션 |
|---|---|---|---|---|
| 1 | 지방세법(법률)(제21308호)(20260424).pdf | local-tax-law | property-tax-brackets §111의2 / §122 (cap) | 103·105·108 |
| 2 | 국세청 종합부동산세 법령 안내자료.pdf | comprehensive-tax-overview | property-tax 전체 분기 | 103 |
| 3 | 국세청 세액계산 흐름도.pdf | tax-calc-flowchart | fair-market-ratio-60 / 4단계 산식 | 103·108 |
| 4 | 국세청세율.pdf | tax-rates | COMPREHENSIVE_BRACKETS_2 / _3 | 103 |
| 5 | 국세청 가산세.pdf | penalty | tax-burden-cap-150 (참고) | 103 |
| 6 | 국세청 납부기한.pdf | payment-deadline | (안내성) | 103 |
| 7 | 국세청 종합부동산세 고지 및 납부 안내.pdf | notice-and-payment | (안내성) | 103 |
| 8 | 국세청합산배제 임대주택.pdf | exclusion-rental | exclusion-applied | 103·106 |
| 9 | 국세청합산배제 사원용 주택 등.pdf | exclusion-employee | exclusion-applied | 103·106 |
| 10 | 국세청주택신축용토지 합산배제 안내.pdf | exclusion-new-build-land | (토지분, 본 계산기 미적용) | 103 |
| 11 | 국세청공동명의 1주택자 과세특례.pdf | spouse-joint-special | spouse-joint-single-house-applied | 108 |
| 12 | 국세청1세대 1주택자 판단 시 주택 수 산정 제외 특례.pdf | single-house-judgement-exclusion | (미출시 후속 — 5종 특례주택 처리) | 108 (검수만) |
| 13 | 국세청세율 적용 시 주택 수 산정 제외 특례.pdf | rate-apply-exclusion | (미출시 후속 — 5종 특례주택 처리) | 108 (검수만) |
| 14 | 국세청법인 주택분 일반 누진세율 특례.pdf | corp-progressive-special | corporation-flat-rate-applied | 106·108 |
| 15 | 국세청 향교 및 종교단체에 대한 과세특례.pdf | religious-special | (안내성, 본 계산기 미적용) | 108 |
| 16 | 국세청 1세대 1주택자 보유기간 계산 특례.pdf | hold-period-special | hold-deduction-eligible / single-house-special-rate (보유 연차 세액공제) | 102·108 |

**용어 정의**: `.claude/GLOSSARY.md` 참조 (공시가/공정시장가액비율/합산배제 등 14개).

---

## §2 계산기 라이브러리 인덱스 (14개 파일)

위치: `frontend/src/lib/`

| 도구 | 핵심 파일 | BRACKETS / 진입점 | NoticeKey | 테스트 | 권위 출처 |
|---|---|---|---|---|---|
| 양도세 | `transfer-tax.ts` (3 파일: tax + branches + types) | `transfer-tax-branches.ts` | 15개 | `__tests__/transfer-tax.test.ts` | 법제처 §95② + 국세청 표 (세션 98 9출처 교차검증) |
| 취득세 | `acquisition-tax.ts` (4 파일: tax + brackets + format + types) | `acquisition-brackets.ts` | (미실측) | `__tests__/acquisition-tax.test.ts` | 지방세법 §11 (세션 95 9차 plan v1.8) |
| 보유세 | `property-tax.ts` (4 파일: tax + brackets + rules + types) | `property-tax-brackets.ts` (재산세 4구간 + 종부세 2주택이하/3주택이상 7구간) | **19개** (세션 108까지) | 4 파일: `property-tax.test.ts` (#B5-1~#B5-4 포함) + `property-tax-brackets.test.ts` + `property-tax-cap.test.ts` + `property-tax-rules.test.ts` | PDF 16장 직접 (§1 표) — 세션 103·106·108 |
| 중개수수료 | `brokerage.ts` (3 파일: brokerage + brackets + format) | `brokerage-brackets.ts` | (미실측) | `__tests__/brokerage.test.ts` | 시행규칙 별표1 (세션 94) |
| 면적 변환 | `constants.ts`의 `convertArea` (L9) | M2_TO_PYEONG=3.3058 | — | `__tests__/format.test.ts` | (수학식, 세션 82) |

### NoticeKey union 정의 위치 (직접 참조용)
- 양도세: `transfer-tax-types.ts` `TransferNoticeKey` (15개)
- 보유세: `property-tax-types.ts` `PropertyTaxNoticeKey` (19개)
- 취득세: `acquisition-types.ts` `AcquisitionNoticeKey`

---

## §3 워크플로우 자산 (.claude/)

git 추적 자산만 다른 컴퓨터/CI에서 사용 가능. 사적 파일은 본인 PC에만 존재.

| 파일 | git 추적 | 한 줄 설명 |
|---|---|---|
| `SESSION_LOG.md` | ✅ | 세션 로그 (커밋 단위 활동 추적) |
| `rules/web-rules.md` | ✅ | React/Next.js + FastAPI 코딩 규칙, DON'T 목록 |
| `rules/testing.md` | ✅ | 테스트 작성·실행 규칙, 구조표 |
| `rules/infra.md` | ✅ | 서버 복구 절차, 스케줄러 12개, 공유 인프라(mibun) |
| `rules/codes.md` | ✅ | 거래/매물 코드, 핵심 상수, localStorage 키 |
| `rules/planning.md` | ✅ | /plan 모드 최소 규칙, 자동 트리거 |
| `settings.json` | ✅ | 프로젝트 권한·env (공용) |
| `ASSETS.md` (본 파일) | ✅ | 자산 인덱스 (Claude 진입점) |
| `GLOSSARY.md` | ✅ | 한국어 도메인 용어집 (14개) |
| `settings.local.json` | ❌ (.gitignore) | 사적 권한 (본인 PC 한정) |
| `commands/harness.md` | ❌ (.gitignore) | **사적**. Plan→Guard→Work→Review |
| `commands/guard.md` | ❌ (.gitignore) | **사적**. 9 GATE 검증 |
| `worktrees/agent-*/` | ❌ (.gitignore) | 사적, 5개 prunable 잔재 (§6 부채) |

---

## §4 글로벌 자산 포인터 (수정 금지, 참조만)

본 프로젝트에서 **글로벌 자산은 0 수정**. 위치만 알아두고 필요 시 Read·Grep만.

| 자산 | 위치 | 사용 시점 |
|---|---|---|
| 글로벌 룰 | `~/.claude/CLAUDE.md` | 모든 세션 자동 로드 |
| 사적 메모리 (이 프로젝트) | `~/.claude/projects/f--cursor-naver-estate-web/memory/` | 세션 42~105 일지·feedback·project 메모 |
| 메모리 인덱스 | 위 폴더의 `MEMORY.md` | 세션 시작 시 자동 컨텍스트 주입 |
| Plan 보관소 | `~/.claude/plans/` | 세션 109 plan 30+ 개. 명명 규칙: `<번호>-<형용사>-<명사>.md` |
| 플러그인 (10개) | `~/.claude/settings.json` `enabledPlugins` | code-review / commit-commands / superpowers / hookify / claude-md-management / pr-review-toolkit / code-simplifier / typescript-lsp / pyright-lsp / frontend-design |
| Skill (1개) | `~/.claude/skills/webapp-testing/` | 로컬 웹앱 테스트 시 |
| MCP | `~/.claude/settings.json` `mcpServers` | playwright (글로벌) |
| MCP (프로젝트) | `f:/cursor/naver-estate-web/.mcp.json` | context7 |

**금지**:
- 글로벌 파일 직접 수정 (`~/.claude/CLAUDE.md`, `~/.claude/settings.json` 등)
- 백업 파일(`.bak-*`) 손대기
- `~/.claude/settings.json` `permissions` 수정

**예외**: 사용자가 명시적으로 "글로벌 ~ 수정해" 또는 "글로벌 룰에 박아" 같이 요청 시만.

---

## §5 도메인 코드 자산

| 자산 | 위치 | 용도 |
|---|---|---|
| 시군구 코드 (5자리) | `backend/data/sigungu_codes.json` | 103줄, 17개 시도 |
| 시군구·읍면동 한국어 | `backend/shared/constants.py` `KOREA_REGIONS` | 288줄, 자동완성/검색 (수정 금지) |
| 거래 코드 (A1·B1·B2·B3) | `.claude/rules/codes.md` | 매매·전세·월세·단기임대 |
| 매물 코드 (APT·OPST 등 7종) | `.claude/rules/codes.md` | 아파트·오피스텔·재건축 등 |
| localStorage 키 (13개) | `.claude/rules/codes.md` | search_history / favorite_complexes / complex_notes 등 |
| 핵심 상수 | `backend/shared/constants.py` (수정 금지) | M2_TO_PYEONG=3.3058 / TTL / Naver API URL |
| Naver API URL | `backend/shared/constants.py` `NAVER_LAND_BASE` | new.land.naver.com (수정 금지) |
| 종부세 BRACKETS (한국어 정의) | `frontend/src/lib/property-tax-brackets.ts` | 재산세 4 + 종부세 7 + 법인 단일세율 |
| 양도세 BRACKETS | `frontend/src/lib/transfer-tax-branches.ts` | 누진/단기/중과 분기 |
| 취득세 BRACKETS | `frontend/src/lib/acquisition-brackets.ts` | 주택·오피스텔·법인 |
| 중개수수료 BRACKETS | `frontend/src/lib/brokerage-brackets.ts` | 시행규칙 별표1 4종 요율 |

---

## §6 운영 부채 박제 (본 작업 범위 외, 다음 세션 후보)

| 부채 | 위치 | 영향 |
|---|---|---|
| worktrees 잔재 5개 (모두 prunable) | UNC 경로 `//192.168.219.101/Code/cursor/naver-estate-web/.claude/worktrees/agent-{a24e5c9f, a5c6cae8, a6b18f3f, ab0a88b1, abed8383}/` | grep 노이즈 (전체 코드 grep 시 5배 결과). 정리: `git worktree prune` |
| R21 e2e 검증 미완 | CI run 25361059023 cancelled | 다음 e2e 커밋 시 strict mode 3차 답습 가능성 |
| complex-visual baseline | 세션 71 답습, R20+R21 별건 | 시각 회귀 |
| v3-A 재산세 1주택 차등 | property-tax 미출시 | 면책 박스 2건 노란불 (5~7시간) |
| 1세대 1주택 5종 특례주택 | property-tax 미출시 (PDF #12·#13 참조) | 후속 후보 — 일시적2주택·상속·지방저가·인구감소·준공후미분양 |
| 법인 9종 누진 토글 | property-tax 미출시 (PDF #14 참조) | 후속 후보 — 공익법인등·공공주택사업자·주택조합·정비사업시행자·민간건설임대사업자·도시개발사업시행자·사회적기업등·종중 |
| ASSETS.md / GLOSSARY.md drift 자동화 | hook 없음 | §7 관행으로만 차단 (수동) |

---

## §7 Claude 작업 관행 (자산 활용 시)

1. **PDF 인용 시**: §1 매핑 표에서 영문 alias 찾아 코드 주석/Notice 본문에 박제. 한국어 파일명 직접 grep 금지 (Windows 경로 인코딩).
2. **새 자산 추가 시**: 같은 커밋에 본 파일(`ASSETS.md`) 갱신 — drift 방지.
3. **글로벌 자산은 읽기만**: `~/.claude/*` 직접 편집 금지. 사용자 명시 요청 시만 예외.
4. **계산기 신규 추가 시**: §2 표에 한 줄 추가 + 권위 출처 PDF 번호 명시.
5. **운영 부채 발견 시**: §6 표에 한 줄 추가 → 다음 세션 plan 후보.
6. **NoticeKey 신규 추가 시**: §2 NoticeKey 카운트 갱신 (예: 19 → 20).
7. **PDF 신규 추가 시**: §1 표 한 줄 추가 + 영문 alias 제정.

---

## 검증 시나리오 (다음 세션 Claude 자가 점검용)

다음 질문에 30초 안에 본 파일 grep으로 답할 수 있어야 함:

1. "공동명의 PDF 어디?" → `grep spouse-joint .claude/ASSETS.md` → §1 #11
2. "양도세 NoticeKey 정의 어디?" → `grep "TransferNoticeKey" .claude/ASSETS.md` → §2 NoticeKey 정의 위치
3. "법인 단일세율 권위 출처?" → `grep corp-progressive .claude/ASSETS.md` → §1 #14
4. "글로벌 메모 위치?" → `grep memory .claude/ASSETS.md` → §4 사적 메모리
5. "worktrees 잔재 정리 명령?" → `grep "worktree prune" .claude/ASSETS.md` → §6
