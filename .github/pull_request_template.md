<!-- 세션 323 신설. 체크리스트는 .claude/rules(release.md·web-rules.md·양쪽 영향) 답습. 해당 없으면 줄 삭제. -->

## 무엇을·왜

<!-- 1~3줄. 이 PR 이 푸는 문제와 결과. -->

## 변경 범위

- [ ] Frontend (`frontend/`)
- [ ] Backend (`backend/`·`scripts/`)
- [ ] DB 마이그레이션 (`backend/db/migrations/V*.sql`)
- [ ] 문서·설정만 (`.claude/`·`docs/`·`.github/`)

## 검증

- [ ] FE: `cd frontend && npx tsc --noEmit && npm run lint && npm test`
- [ ] BE: `cd backend && ruff check . && python -m pytest --tb=short -q`
- [ ] CI green 확인

## 양쪽 영향 (FE↔BE 동기화 — 해당 시)

- [ ] BE 라우터/serializer 변경 → FE `lib/api/`·`types/` 동기화
- [ ] `.env` 변경 → `.env.local`(FE)·Vercel 환경변수 동기화

## ⚠ backend 가동 영향 (release.md §트리거 해당 시 필수)

<!-- 스케줄러·env·의존성·마이그·import 흐름 변경이면 체크. FE/md 전용이면 면제. -->

- [ ] 머지 후 zombie cross-check 필요 (`.claude/rules/release.md` §2) — PID·부팅시각·라이브 GET
- [ ] V0xx 마이그레이션 = prod 선행 실행 필요 (사장님 SQL Editor)
