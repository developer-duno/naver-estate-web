# naver-estate-web 보안 가이드 (security-guidance 플러그인 리뷰어용)

이 파일은 Anthropic `security-guidance` 플러그인의 모델 리뷰가 내장 취약점 체크리스트와 함께
참조하는 프로젝트 특화 위협 모델이다. (가이드일 뿐 hard block 아님 — 강제는 CI·hook 으로.)

근거 = `.claude/rules/web-rules.md` §보안·DON'T + `.claude/rules/infra.md` §IP 차단 방지 +
세션 254 RLS 미활성 보안유출 사고(V029).

## Backend (FastAPI / Python)

- **인증 의존성 누락 금지.** 보호 엔드포인트는 `Depends(get_current_user)` 또는
  `Depends(get_admin_user)`(`backend/deps.py`) 필수. `/api/admin/*` 라우터는 예외 없이
  `get_admin_user`. 인증 없는 새 admin 라우트 = 취약점.
- **SQL 인젝션.** raw SQL 은 `text().bindparams()` 또는 ORM 조건만. f-string·`%`·`.format()`
  으로 사용자 입력을 SQL 에 직접 끼우면 취약점. (`db/queries.py`·`db/mb_queries.py` 경유 원칙)
- **DB 행 삭제 금지.** Complex(단지) 레코드 DELETE 금지. 매물 비활성화는 `is_active=FALSE` 만.
- **CORS / CSP.** `allow_origins=["*"]` 금지(명시 도메인만). CSP 에 `unsafe-eval` 금지.
- **Supabase RLS.** mb_*·공용 테이블에 새 테이블 추가 시 RLS 활성 여부 확인(세션 254 = RLS
  미활성으로 anon 이 회원·자격서류 노출). 새 테이블은 RLS 정책 동반.
- **시크릿 노출.** `SUPABASE_JWT_SECRET`·`SMTP_PASS`·API 키를 코드·로그·커밋에 평문 금지.
  `os.getenv` 로만. 로그에 회원 이메일·전화·자격서류 경로 INFO 이상 출력 금지.
- **pickle / os.system / subprocess.** 신뢰 불가 입력 역직렬화·셸 실행 금지.

## Frontend (Next.js / TypeScript)

- **XSS.** `dangerouslySetInnerHTML`·`.innerHTML =`·`document.write` 금지(web-rules.md DON'T).
  블로그 MDX 는 정해진 파이프라인만.
- **엑셀 수식 인젝션.** 클라이언트 xlsx 생성 시 `safeCellValue`(=/+/-/@ 접두 방어) 경유.
- **인증 토큰.** `session.access_token` 을 URL·로그·localStorage 평문 금지(Authorization 헤더만).
- **admin 라우트 보호.** `frontend/src/proxy.ts`(Next 16) 의 라우트 가드 우회 금지.

## CI / GitHub Actions

- **command injection.** `.github/workflows/*.yml` 에서 `${{ github.event.* }}` 같은
  신뢰 불가 입력을 `run:` 셸에 직접 보간 금지(중간 env 변수 경유).
- **권한.** workflow `permissions` 최소화. 불필요한 write 권한 부여 금지.

## 네이버 크롤링 (도메인 특화)

- **IP 차단 방지.** 네이버 수집은 `AdaptiveThrottle`(`crawler/utils.py` `get_shared_throttle`)
  경유 필수. throttle 우회 직접 반복 호출 = 운영 위험(IP 차단). 크롤 지표 컬럼
  (`last_crawled_at` 등) SQL 직접 일괄 UPDATE 금지(허수 진단 오염).
