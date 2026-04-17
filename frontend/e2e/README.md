# Playwright E2E

## Project 구조

`playwright.config.ts` 에 3개 project.

| project | 대상 파일 | storageState | 용도 |
|---|---|---|---|
| `setup` | `global.setup.ts` | 쓰기 (`e2e/.auth/admin.json`) | Supabase 로그인 후 세션 저장 |
| `public` | 전부 (setup·admin 제외) | 없음 | 비인증 경로 회귀 48개 |
| `admin` | `admin-dashboard.spec.ts` | 읽기 (setup 산출물) | 관리자 대시보드 스펙 |

`admin` project 는 `setup` 에 `dependencies` 로 묶여 있어서 `--project=admin` 실행 시 setup 이 먼저 돈다.

## 로컬에서 admin e2e 돌리기

1. `frontend/.env.test` 를 생성하고 아래 5개 값을 채운다 (예시는 `.env.test.example` 참고):

   ```
   TEST_ADMIN_EMAIL=...
   TEST_ADMIN_PASSWORD=...
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   NEXT_PUBLIC_API_URL=http://localhost:8002
   ```

   `TEST_ADMIN_EMAIL` 은 `ADMIN_EMAIL` 환경변수에 등록된 관리자 이메일이어야 한다 (미들웨어의 `ADMIN_EMAILS` 매칭).

2. setup + admin 만 실행 (이 PC 에서는 포트 3000 이 sangse-agent 가 쓰고 있으므로 3100 사용):

   ```bash
   PLAYWRIGHT_PORT=3100 npx playwright test --project=setup --project=admin
   ```

   CI 에서는 `PLAYWRIGHT_PORT` 미설정 → 기본값 3000 사용.

3. 성공 시 `e2e/.auth/admin.json` 생성. 이후 세션 재사용. 만료되면 (Supabase 기본 1시간) 같은 명령으로 재생성.

## 전체 회귀

```bash
npx playwright test                 # 전체 (50개)
npx playwright test --project=public # 비인증 48개만
```

## CI

`.github/workflows/ci.yml` 의 `e2e` job 이 PR + main push 시 자동 실행. `frontend/**` 변경 있을 때만.

GitHub secrets 5개 필요:
- `TEST_ADMIN_EMAIL`
- `TEST_ADMIN_PASSWORD`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

secrets 미설정 시 `setup` project 가 `TEST_ADMIN_*` missing 로그와 함께 skip → `admin` project 는 dependency 실패로 같이 skip → job 자체는 green. secrets 등록 순간 자동으로 진짜 테스트 시작.

아티팩트:
- `playwright-report` — HTML 리포트 (14일 보관)
- `admin-screenshots` — `test-results/admin-dashboard.png` 등 (14일 보관)

## 보안 주의

- `e2e/.auth/admin.json` 에 Supabase JWT 가 평문으로 들어감 → `frontend/.gitignore` 의 `e2e/.auth/` 로 보호됨. 절대 커밋 금지.
- `.env.test` 도 `.env*` 패턴으로 ignored. `.env.test.example` 만 allow.
- CI 는 `.env.test` 파일을 쓰지 않고 `env:` 블록으로 직접 주입해서 artifact 에 토큰 유출 경로 차단.
- HTML report 는 실패 시에만 상세 trace 를 담는다 (`screenshot: "only-on-failure"`). admin 스펙이 성공 기대라 token 유출 리스크 낮음.
