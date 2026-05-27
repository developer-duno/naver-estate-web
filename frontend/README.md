# 2u부동산 — 프론트엔드

> **공인중개사 B2B 구독** 부동산 SaaS `2u.pe.kr` 의 Next.js 16 + TypeScript + Tailwind CSS 4 프론트엔드.

본 README 는 빠른 진입용 카드입니다. 깊이 자료는 다음 위치 참조:

- 루트: [d:\\naver-estate-web\\CLAUDE.md](../CLAUDE.md) — 비즈니스 모델·아키텍처·데이터 흐름
- FE 본 디렉토리: [frontend/CLAUDE.md](./CLAUDE.md) — Critical Rules 7개
- 프로젝트 가이드: [.claude/](../.claude/) — rules 7종 (자동 로드) + ASSETS.md·GLOSSARY.md·BLOG.md·STRUCTURE.md
- FE 깊이 토픽: [frontend/.claude/](./.claude/) — hooks-and-state · ui-patterns · pages-and-mb · tools-lineup

## 개발 서버

```bash
cd frontend
npm install            # 최초 1회 (husky pre-commit hook 자동 설치)
PLAYWRIGHT_PORT=8090 npm run dev   # 본 PC 는 3000=sangse / 3100=legal 점유 → 8090 사용 (세션 114 박제)
```

CI · 다른 PC 는 기본 `localhost:3000` 사용 가능 (포트 충돌 없으면).

## 커밋 전 필수 검증

```bash
npx tsc --noEmit        # 타입 체크 (0 errors)
npm run lint            # ESLint (0 errors)
npx vitest run          # 단위·컴포넌트·훅 (카운트 = 루트 CLAUDE.md §테스트 현황 SSOT)
```

E2E 추가:

```bash
npx playwright test                  # 전체
npx playwright test --project=public # 비인증
npx playwright test --project=admin  # 관리자 (TEST_ADMIN_* 5종 .env.test 필요)
```

상세 = [frontend/e2e/README.md](./e2e/README.md).

## 기술 스택

- Next.js 16 (App Router) + React 19 + TypeScript 5
- Tailwind CSS 4 + shadcn/Radix (PR 1 도입 답습)
- React Query (TanStack Query v5) 서버 상태
- Recharts 3 (`dynamic` import)
- Supabase Auth (쿠키 기반 JWT)
- Vitest + @testing-library/react + MSW + Playwright

## 디렉토리 진입점

| 위치 | 내용 |
| --- | --- |
| `src/app/` | Next.js App Router 31 페이지 (search · complex/[no] · compare · mibunyang/* · tools/* 5종 · blog · admin/*) |
| `src/components/` | 131 TSX (mb/35 + admin/21 + ui/13 + complex/7 + article/7 + filter/4 + search/2 + blog/2 + 루트 40) |
| `src/hooks/` | 25 커스텀 훅 |
| `src/lib/` | 47 파일 (최상위 37 + api/ 9 + admin/ 1) — 도구 5종 계산기 라이브러리 포함 |
| `src/content/blog/` | MDX 26편 (시세 5 / 세금 6 / 도구 9 / 미분양 6) — SSOT 은 [.claude/BLOG.md](../.claude/BLOG.md) |
| `e2e/` | Playwright 20 spec (--webpack 모드) |
| `scripts/` | GATE 10 가드 (mdx-jsx + ad-compliance) |

## pre-commit hook (husky v9)

`frontend/src/content/blog/*.mdx` staged 시에만 자동 실행:

| 가드 | 차단 사유 |
| --- | --- |
| `check:mdx-jsx` | 162·163·164 사고 답습 (raw `<숫자` JSX 충돌로 Turbopack build 실패) |
| `check:ad-compliance` | 부동산 광고법 위험 단어 차단 |

상세 = [CONTRIBUTING.md](../CONTRIBUTING.md).

## 배포

Vercel `naver-estate-web` 프로젝트 (루트에서 배포, frontend/ 아님). 도메인 `2u.pe.kr` · `www.2u.pe.kr`.
