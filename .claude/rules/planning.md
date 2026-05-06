# 자동 하네스 규칙 (Claude가 스스로 판단하여 적용)

## 항상 적용 (모든 코드 작성 시)
- 한 단계에 파일 3개 이하만 수정
- 한 파일에 100줄 이상 변경 금지 → 분리 제안
- 계획에 없는 파일 수정/리팩토링 금지
- 에러 처리 + 로딩 상태 + 빈 데이터 UI 빠뜨리지 않기
- 추측으로 "영향 없음" 금지 → grep 결과 기반만

## 자동 트리거 조건

### /plan 진입 시 → /harness 자동 적용
- 5개+ 파일 수정 계획 → 반드시 단계 분리
- DB/API/타입/컴포넌트 변경은 각각 별도 단계로
- 영향받는 파일 목록을 grep으로 실측
- 모든 단계에 예상 줄 수 표시

### 코드 수정 완료 후 → 자동 검증 실행
1. `tsc --noEmit` (FE 변경 시)
2. `ruff check .` (BE 변경 시)
3. grep으로 참조처 깨짐 확인
4. grep으로 console.log / 민감정보 잔재 확인

### 커밋 요청 시 → /guard 자동 적용
- 5개 교차검증 에이전트 병렬 실행 (빌드/null안전/Hook/보안/테스트)
- 🔴 있으면 커밋 차단, 수정 후 재검증

## 세션 종료 시 마무리 (2026-05-06 세션 112 리뉴얼 — 재발방지)

**원칙**: 세션 박제는 **글로벌 메모리에만** 저장. CLAUDE.md (git 추적) 진행 박제 금지.

**왜 이 룰?** 2026-04 ~ 2026-05 세션 79~112 동안 CLAUDE.md "현재 진행 상황" 섹션에 매 세션마다 진행 박제 1~3줄씩 누적해 60줄+ 무한 팽창. 이전 룰 ("세션 종료 시 CLAUDE.md 진행 상황 업데이트") 자체가 사고 진앙. 세션 112 에서 메모리 분리 + 룰 정정.

### 세션 종료 절차 (정정 후)

1. **글로벌 메모리에 세션 요약 작성** (필수):
   - 위치: `C:\Users\user\.claude\projects\f--cursor-naver-estate-web\memory\session{N}_summary.md`
   - 내용: 커밋 해시 목록 + 사고·결정·교훈 + 다음 세션 후보
   - 답습: `session104_summary.md` ~ `session112_summary.md` 패턴
2. **MEMORY.md 인덱스 1줄 추가**:
   - 위치: `C:\Users\user\.claude\projects\f--cursor-naver-estate-web\memory\MEMORY.md`
   - 형식: `- [Session N summary](sessionN_summary.md) — 핵심 1줄 요약`
3. **CLAUDE.md (루트, frontend/, backend/) 진행 박제 금지** (재발방지 핵심):
   - 코드 변경 박제는 git log + 메모리로 충분
   - **유일한 CLAUDE.md 갱신 트리거**:
     - 도구 라인업 확장 (5→6 추가 시 표 1행)
     - DB 마이그레이션 V021+ 실행 시
     - 테스트 카운트 50+ 차이 누적 시 (실측 갱신)
     - 비즈니스 모델 변경 시
     - 신규 디렉토리/페이지 카테고리 추가 시
   - **그 외 코드 변경은 CLAUDE.md 갱신 불필요**
4. **다음 세션 시작 명령어 대화창 출력**:
   - 마크다운 코드블록으로 사용자에게 직접 출력
   - 파일로 저장 X (글로벌 룰 답습 — `~/.claude/CLAUDE.md`)

### 금지 항목 (재발방지)

- ❌ CLAUDE.md "현재 진행 상황" 섹션 신설/갱신
- ❌ "마지막 작업 (세션 N)", "과거 작업 (세션 N)" 박제 누적
- ❌ SESSION_LOG.md 신설/갱신 (세션 112 dead 판정 후 삭제)
- ❌ 세션 마무리 시 CLAUDE.md `git add CLAUDE.md && git commit "docs(claude-md): 세션 N 진행상황"` 패턴

### 메모리 활용 패턴 답습

- **세션 단위 박제**: `session{N}_summary.md` (frontmatter `name`/`description`/`type: project`)
- **카테고리별 박제**: `feedback_*.md` (사용자 피드백·교훈), `project_*.md` (프로젝트 결정·구조)
- **archive 박제**: `sessions_N_M_archive.md` (장기 누적 시 분리, 세션 112 답습)
- **인덱스 1줄**: MEMORY.md 에 추가 (200줄 한도 — 글로벌 룰)

## 상세 규칙 참조
- `/harness` — Plan→Guard→Work→Review 전체 워크플로우
- `/guard` — 9 GATE 상세 검증
- 글로벌 룰 (`C:\Users\user\.claude\CLAUDE.md`) "세션 종료 시 다음 시작 명령어 자동 출력" 섹션 + "메모리 위치 분류" 섹션
