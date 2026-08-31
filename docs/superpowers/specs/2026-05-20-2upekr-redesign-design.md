# 2u.pe.kr 디자인·UX 전면 리뉴얼 — 설계

작성일: 2026-05-20

> **상태: 완료** — PR 0~7 전량 머지(#28~#94, 세션 188~244). 디자인 원칙 참조용 역사 기록.
> 원안 PR 6(로그인 후 /dashboard·driver.js 투어·cmdk 명령메뉴)은 PR 6a~6e(admin 3컬럼·단지상세
> 대시보드)로 방향 전환돼 미구현 — 필요 시 별도 spec.
>
> ★ **본 spec 이 디자인·UX 리뉴얼의 진실의 원천.** 루트 `CLAUDE.md` §디자인·UX
> 리뉴얼 에서 본 spec 으로 연결. `frontend/.claude/{ui-patterns,hooks-and-state,
> pages-and-mb,tools-lineup}.md` 의 UI 컴포넌트·페이지 박제는 각 PR 진행하며 함께
> 갱신되며, 본 spec 와 drift 시 본 spec 우선. 한 곳만 진실, drift 금지 (글로벌 룰 §13 답습).

## 배경 (왜 만드는가)

`2u.pe.kr` (naver-estate-web 프로젝트) 는 공인중개사 B2B 구독 모델 웹 서비스다.
도메인 정확성은 시장 최고급 (국세청 PDF 16장 직접 인용 / 지방세법 §111
법령 인용 / 실거래가 24h TTL / B2B 검증 워크플로) 인데, **시각
아이덴티티와 신뢰 신호가 전무**하다.

이번 세션 (208) 에서 Explore 에이전트 7개 (1차 3 + 재검증 4) 로 우리
사이트·한국 경쟁사 5곳·글로벌 부동산 3곳·디자인 시스템 4곳 (Anthropic
Claude / Linear / Stripe / Vercel) 을 분석한 결과, 다음 부채가 누적되어
있음이 1차 자료로 확인되었다:

- 색·폰트 토큰 정의만 있고 실사용 0건 (editorial palette / Noto Serif KR)
- 메인 above-the-fold 사회적 증명 0건, /pricing 후기·로고 0건
- 공용 UI 라이브러리 (shadcn / Radix) 미사용 → 모든 모달·드롭다운 자체
  구현 = a11y 리스크
- 검색 → 매물 → 결제 funnel 없음 (CTA 가 /pricing·/signup 으로 직접)
- print CSS · PDF export · 온보딩 투어 · 키보드 단축키 · cmd+k · 알림
  시스템 0건
- 로고 (이모지 🏠 + 텍스트만, SVG 0)

처음 들어온 공인중개사가 "이 사이트 진짜 쓸 만한가" 판단하기도 전에
이탈할 위험이 있으며, 매일 사용해야 할 사용자 경험 측면에서도 불편이
누적된다.

## 분석 결과 — 주요 정정 사항

이번 세션의 재검증 단계에서 1차 자료 검증으로 다음 단정을 정정·폐기했다.
박제 의도 = 다음 세션이 같은 할루시네이션 반복 차단.

### Anthropic Claude 디자인 토큰 (공식 GitHub `anthropics/skills/brand-guidelines/SKILL.md`)

| 항목 | 정정 |
| --- | --- |
| 라이트 배경 | **#faf9f5** (이전 #F0ECE0 = 오류) |
| 다크 배경 | **#141413** (이전 #2b2a27 = 오류) |
| 강조 (테라코타) | **#d97757** (유지) |
| 보조 파랑 | **#6a9bcc** (이전 #5D7A99 = 오류) |
| 중성 베이지 | **#e8e6dc** (Light) / **#b0aea5** (Mid) |
| 보조 그린 | **#788c5d** (신규 발견) |
| 폰트 | 공식 웹 = Styrene(헤딩) + Tiempos(본문). 공식 폴백 = Poppins + Lora |

### 한국 경쟁사 색·USP

- 직방 = ❌ #004A7F 파랑 단정 오류. 실제 **황색/옐로우** 브랜드 색
- 네이버부동산 전사 공식 = **#03C75A** (로고는 #2db400 병용)
- 호갱노노 신규 기능 = **"AI 중개사"** (2025 출시. "AI 호가 평가" 는 부정확)
- 호갱노노 MAU 179만 ✅ (모비인덱스 1차 확인. 직방 229만·네이버부동산 134만)
- 직방 89.8% VR 수용도 ⚠ 2021 직방 자체 조사 n=1,034. 제3기관 검증 X
- "네이버 공인중개사 등록 1위" ❌ 공식 통계 없음. **폐기**

### 비즈니스 시장 가설

- 한국 공인중개사 = 109,979명 (2025-10, 과거 최저, 신규 < 폐업 연속)
- 직방 광고비 연 144~288만원 (2020), 호갱노노 매물광고 무료, 네이버
  공식 가격 비공개
- 한국 SaaS 세리프 헤딩 사용 사례 **ZERO** (토스·카카오·라인·채널톡·
  클라썸 다 산세리프) → 본 리뉴얼에서 Noto Serif KR 헤딩 **폐기**
- 한국 PropTech 누적 64조 / 통합 SaaS 는 소수 / 개별 도구 위주

## 비즈니스 결정 (이전 세션 결정 답습 + 재확인)

**B2B 단독 유지** (사용자 명시 결정 "B2B 단독은 맞어. 하지만 B2B 단독도
사용자가 사용하기 편해야해"). B2C 확대 가설 폐기.

## ★ 최우선 잣대 (절대 잊지 말 것)

> **항상 "사용자가 사용하기 쉽게" 를 잊지 않는다.**
> — 사용자 명시 박제 (2026-05-20)

본 spec 의 모든 PR · 모든 디자인 결정 · 모든 라이브러리 선택은 이 잣대를
통과해야 한다. 이 잣대를 통과하지 못하는 결정은 폐기·재설계 대상.

구체화:

- "공인중개사 (40~60대 다수, PC 24인치 우선, 고객 동석 시나리오) 가
  **매일 쓸 때 편한가**"
- "처음 가입한 공인중개사가 첫 5분에 막힘없이 핵심 가치 경험하는가"
- "고객 앞에서 즉시 응대 가능한 화면인가 (인쇄·즉답·정확성)"
- "노안 시작 사용자도 텍스트·버튼·차트가 읽기·터치 가능한가 (WCAG AA)"
- "전문가다운 시각 신뢰 신호가 있는가 (generic Tailwind 인상 회피)"

이 잣대로 일반 방문자 유입용 페이지 (블로그 SEO · 홈 히어로 사회적
증명) 보다 **로그인 후 매일 쓰는 페이지** (단지상세·검색·도구·대시보드)
우선순위가 높아진다.

각 PR 의 구현 시작 직전 implementation plan 에서 이 잣대 통과 여부를
명시 검증해야 한다. 통과 못 하면 PR 분할·재설계·폐기.

## ★ 모방 우선 (절대 규칙)

> **기능을 다 만들려고 하지 않는다. GitHub 에서 필요한 것을 가져다 쓴다.**
> — 사용자 명시 박제 (2026-05-20)

본 spec 의 모든 PR · 모든 새 기능 · 모든 컴포넌트는 다음 순서로 검토해야 한다:

1. **공식 SDK / 라이브러리** 가 있나? — 있으면 그것 사용 (예: shadcn,
   Radix, lucide-react, cmdk, sonner, driver.js, react-to-print 등 본 spec
   §아키텍처 의 16종)
2. **GitHub 별점 1k+ / 마지막 커밋 1년 이내 / 활발한 issue 응답** 인 패키지
   있나? — 있으면 그것 사용
3. **위 둘이 없거나 한국어·도메인 특수 요구 안 맞을 때만** 자체 구현

자체 구현 시 코드 한 줄 코멘트로 이유 명시. 글로벌 룰 §15 답습.

본 spec 의 디자인·기능 항목 중 자체 제작은 다음에 한정:

- 한국어 부동산 도메인 특화 UI (단지 카드 / 매물 행 / 거래유형 코드 등)
- 우리만의 비즈니스 로직 (세금 계산·B2B 검증 워크플로 등)
- 한국어 텍스트 마이크로카피

그 외 모든 인프라성 UI (버튼·모달·드롭다운·토스트·아이콘·차트·테이블·
폼·온보딩·인쇄·키보드·다크모드) 는 **GitHub 오픈소스 그대로 차용**.

다음 세션 진입 시 "이거 직접 만들까" 유혹을 받으면 본 섹션 1~2번 단계
다시 통과해야 한다.

## 목표

1. **시각 아이덴티티 확립** — Claude 디자인 5색 + Pretendard 단일 폰트 +
   디자인 토큰 시스템
2. **공용 UI 라이브러리 도입** — shadcn/ui + Radix. 자체 구현 점진 교체.
   a11y 리스크 해소.
3. **B2B 핵심 페이지 리뉴얼** — /complex/[no] (1순위), /search (2순위),
   /tools (3순위), 로그인 후 대시보드 신설
4. **B2B 사용 편의 기능 신규** — print CSS + PDF export, 온보딩 투어,
   cmd+k 검색, 키보드 단축키, 토스트 알림
5. **신뢰 신호 보강** — 로고 SVG, /pricing 사회적 증명, 데이터 출처 가시화
6. **WCAG AA 통과 의무** — 40~60대 노안 사용자가 사실상 100% 인 B2B
   단독 환경

## 비목표 (YAGNI)

- 자체 폰트 제작 (토스 답습 X) — Pretendard 그대로
- 자체 디자인 시스템 정체성 — Claude 색 그대로 차용 ("모방은 창조의 어머니" 사용자 결정)
- 다국어 지원
- B2C (일반 사용자) 마케팅 페이지 강화
- /blog SEO 마케팅 깊이 강화 (B2B 단독으로 우선순위 ↓)
- 지도 도입 (네이버 부동산이 잘함, 차별화 어려움)
- 다크모드 디폴트 (옵션만 제공)
- 자체 토스트·모달 라이브러리 (sonner·Radix Dialog 그대로)

## ★ 네이버 크롤링 IP 차단 방지 (절대 규칙)

본 리뉴얼은 **프론트엔드 디자인 중심** 이지만, 우리 사이트의 모든 매물·
시세 데이터는 네이버 부동산 실시간 크롤링 (집서버 단일 IP) 으로 수집된다.
디자인이 가벼워지고 사용자 경험이 빨라지면 **단위 시간당 매물·시세 API
호출량이 늘 가능성** 이 있으며, IP 차단 시 전체 서비스 정지.

`.claude/rules/infra.md` 의 IP 차단 방지 규칙 답습 + 본 리뉴얼에서 추가
점검:

1. **모든 네이버 수집 호출은 `AdaptiveThrottle` 경유 유지**
   (`crawler/utils.py` 의 `get_shared_throttle(name, ...)`). 본 리뉴얼은 FE
   변경 위주라 BE 직접 변경 없으나, 새 FE 페이지가 매물·시세 자동
   새로고침을 트리거 시 BE 의 throttle 우회 호출이 추가되지 않는지 PR 마다 점검.

2. **클라이언트 캐시 우선** — `/dashboard` 신설 (PR 6), `/complex` 자동
   폴링 등 새 페이지가 React Query `staleTime` 충분히 (시세 = 5분 +,
   실거래가 = 24h TTL 답습) 유지. 의도 없이 `refetchInterval` 짧게 설정하지 않음.

3. **`mibunyang` 공유 IP 스케줄 답습** — 같은 집서버에서 도는
   mibunyang 프로젝트의 네이버 크롤 시간대와 충돌 금지. infra.md "네이버
   크롤링 시간 분리" 표 답습. 새 페이지가 BE 의 새 크롤 작업을 추가하면
   본 표 갱신 의무.

4. **크롤 지표 컬럼 직접 UPDATE 금지** — `complexes.last_crawled_at`·
   `complexes.detail_crawled_at`·`articles.detail_crawled` 는 실제 크롤
   코드 (`CrawlJob` 경유) 만 갱신. SQL 직접 일괄 UPDATE 금지 (infra.md
   2026-04-13 사건 답습).

5. **PR 마다 BE 영향 점검 항목**:

   - 새 페이지가 `/api/live/*` 호출 추가? 있다면 `live.py` TTL·throttle
     적용 확인
   - 새 자동 새로고침 (`refetchInterval`) 추가? 있다면 의도된 주기인지
     확인
   - `/api/admin/*` 새 호출이 BE 의 크롤 작업을 트리거? 있다면 사람 클릭
     기반인지·자동인지 구분

## 디자인 시스템 (모방 대상 토큰 박제)

### 색 (Anthropic Claude 공식 5색 + 한국 확장 2색)

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--bg-light` | `#faf9f5` | 기본 배경 (라이트) |
| `--bg-dark` | `#141413` | 기본 배경 (다크) |
| `--text-primary` | `#141413` | 본문 텍스트 (라이트 모드) |
| `--text-on-dark` | `#faf9f5` | 본문 텍스트 (다크 모드) |
| `--accent-terracotta` | `#d97757` | 주 강조 (CTA·링크·강조 헤딩) |
| `--accent-blue` | `#6a9bcc` | 보조 (정보·신뢰 신호) |
| `--accent-green` | `#788c5d` | 보조 (성공·검증·"전문가" 배지) |
| `--neutral-light` | `#e8e6dc` | 카드 배경·구분선 (저대비 OK 영역) |
| `--neutral-mid` | `#b0aea5` | 보조 텍스트 (본문 텍스트 금지 — WCAG AA 미달) |

**한국 확장 (필요시 추가)**: 빨강·노랑 같은 알람·경고 색은 1차 Claude
팔레트에 없음. 단계 1 PR 에서 톤 맞춰 추가 (예: `#c04020` 경고 / `#c08020`
주의 — WCAG AA 통과 확인 후).

### 폰트 (Pretendard 단일)

- 헤딩: **Pretendard Bold 700** (Styrene 대체)
- 본문: **Pretendard Regular 400**
- 일부 강조 (블로그·법률 인용 등 한정): Pretendard Medium 500
- 세리프 헤딩 (Noto Serif KR) **사용 안 함** — 한국 SaaS 0 사례 답습
- 영문 모노 (코드·번호 강조): JetBrains Mono 또는 Geist Mono 유지 OK

### 여백·spacing

- 데스크톱 섹션 간: 240px (Claude editorial 기본)
- 모바일 섹션 간: 80~120px (한국 사용자 스크롤 피로 회피)
- 카드 패딩: 24~32px
- 정보 그룹 간: 16px
- 본문 행간 (line-height): 1.6~1.8

### 접근성

- WCAG AA 의무 (대비 4.5:1 본문 / 3:1 큰 텍스트)
- `--neutral-mid #b0aea5` 는 본문 텍스트 금지 — `#faf9f5` 배경에서 대비 2.5:1
- 본문 폰트 크기: 기본 16px 이상 (노안 시작 공인중개사 가독성)

## 아키텍처 — 도입할 GitHub 오픈소스

모두 MIT / ISC / OFL 라이선스 (상업 사용 무료). AGPL·GPL 0건.

### 핵심 10종

| 패키지 | 용도 | 대체 대상 |
| --- | --- | --- |
| `shadcn/ui` | Button·Card·Dialog·Sheet·Tabs·Select·Dropdown 등 | 자체 구현 컴포넌트 |
| `@radix-ui/*` | shadcn 기반 a11y 프리미티브 | 자체 div onClick |
| `cmdk` | Cmd+K 빠른 검색 (Linear·Vercel 답습) | 없음 (신규) |
| `lucide-react` | 통일 아이콘 1,500+ (shadcn 기본) | 이모지·heroicons 혼재 |
| `pretendard` | 한국 SaaS 표준 폰트 | Geist + Noto Serif KR (미사용) |
| `driver.js` | 온보딩 코치마크·투어 | 없음 (신규) |
| `react-to-print` | 페이지 인쇄 (B2B 핵심) | 없음 (신규) |
| `sonner` | 토스트 (shadcn 권장) | 자체 alert·없음 |
| `react-hotkeys-hook` | 키보드 단축키 (cmd+k·g+s·j/k) | 없음 (신규) |
| `tailwind-merge` + `clsx` | 조건부 클래스 결합 (shadcn `cn()` 표준) | template literal |

### 페이지별 선택 (단계별 도입)

- `@tanstack/react-table` — /search·/compare 매물 테이블 표준화
- `nuqs` — URL 파라미터 ↔ React 상태 동기화
- `next-themes` — 다크모드 토글
- `vaul` — 모바일 바텀시트 (필터·셀렉터)
- `react-resizable-panels` — 단지상세 좌우 분할
- `embla-carousel-react` — 단지 사진 슬라이드
- `recharts` 유지 — 미분양 13축 레이더 그대로
- `maplibre-gl` 또는 `react-map-gl` — 지도 도입 결정시 (보류, YAGNI)

## 페이지 우선순위 (B2B 사용 빈도 기준)

| 순위 | 페이지 | 일사용 빈도 | 리뉴얼 ROI |
| --- | --- | --- | --- |
| 🔴 1 | `/complex/[no]` 단지 상세 | 매일 수십회 (핵심) | 최고 |
| 🔴 2 | `/search` 검색·필터 | 매일 수십회 | 최고 |
| 🔴 3 | `/tools/*` 7개 도구 | 매일 (세금·면적 계산) | 최고 |
| 🟠 4 | `/compare` 단지 비교 | 주 수회 (보고서용) | 높음 |
| 🟠 5 | 홈 `/` + 로그인 후 대시보드 (신설) | 하루 1~3회 진입 | 높음 |
| 🟡 6 | `/mibunyang` 미분양 | 주 수회 | 중간 |
| 🟡 7 | `/pricing` 가격제 | 한번 결정 후 거의 안 봄 | 중간 (전환 영향) |
| 🟡 8 | 로그인·회원가입·검증 | 초기 1회 | 중간 |
| 🟢 9 | `/blog` 26편 | B2B = SEO 유입 적음, 가끔 참고 | 낮음 |
| 🟢 10 | `/admin/*` | 우리만 사용 | 낮음 |

## 단계별 PR 로드맵 (8 단계)

각 PR 은 독립 실행·롤백 가능. 1 PR = 1~2 세션.

### PR 0 — 디자인 토큰 + Pretendard + Claude 5색

**파일**: `frontend/src/app/globals.css`, `frontend/src/app/layout.tsx`, `frontend/src/app/fonts/PretendardVariable.woff2` (신규)

- globals.css 의 editorial 좀비 토큰 (gold·navy·bg·ink) 제거 + `--font-serif` 매핑 제거
- Claude 9색 토큰 정의 (위 표)
- Pretendard Variable 로드 (`next/font/local` — Pretendard 는 next/font/google 미제공)
- Noto Serif KR 제거 (사용 0 답습)
- `--font-sans` 매핑을 Pretendard 우선 + Geist 폴백으로 갱신

> ★ 세션 210 실측 정정: `tailwind.config.{js,ts}` 파일은 본 프로젝트에 부재
> (Tailwind CSS 4 `@theme` CSS-only 설정). globals.css `@theme inline` 블록만 수정.

**시각 변화 = 폰트 미세 차이만** (Geist → Pretendard, 색·레이아웃 변화 0).
e2e 시각 회귀 baseline 9 파일은 별도 갱신 동반 (workflow_dispatch `update_snapshots=true`).

### PR 1 — shadcn/ui + Radix 도입, 공용 컴포넌트 5종

**파일**: `frontend/package.json`, `frontend/components.json`, `frontend/src/components/ui/{button,card,dialog,input,select}.tsx`, `frontend/src/lib/utils.ts`

- 의존성 추가 (위 핵심 10종 중 1차 8종)
- shadcn init + Button·Card·Dialog·Input·Select 5종 추가
- `lib/utils.ts` `cn()` 헬퍼

**시각 변화 0** — components/ui/ 만 신설. 기존 코드는 손대지 않음.

### PR 2 — Header·Footer·layout 리뉴얼

**파일**: `frontend/src/components/{Header,Footer}.tsx`, `frontend/src/app/layout.tsx`, `frontend/src/app/icon.tsx`, `frontend/src/components/CommandMenu.tsx` (신규)

- 로고 SVG 신설 (이모지 🏠 대체. icon.tsx 답습)
- shadcn Button·DropdownMenu 적용
- cmdk 기반 cmd+k 명령 메뉴 (단지·매물·도구 검색)
- next-themes 다크 토글 (라이트 기본)
- 전문가 배지 (Header.tsx:244-247) 디자인 강화

**첫 시각 변화** — 사이트 전체 헤더·푸터 톤 바뀜.

### PR 3 — `/complex/[no]` 단지 상세 리뉴얼 (1순위)

**파일**: `frontend/src/app/complex/[no]/page.tsx` (353줄 → 분할), `frontend/src/components/complex/*`

- 페이지 분할 (정보 위계 재정렬: 핵심 시세 → 매물 리스트 → 상세 차트)
- react-resizable-panels 좌우 분할 (PC 24인치 활용)
- react-to-print 인쇄 친화 (고객 동석 시나리오)
- shadcn Tabs·Card 적용
- 모바일 바텀시트 (vaul) 필터

### PR 4 — `/search` 검색·필터 리뉴얼 (2순위)

**파일**: `frontend/src/app/search/page.tsx`, `frontend/src/components/search/*`

- 필터바 shadcn Select·Combobox 교체
- @tanstack/react-table 매물 테이블 표준화
- nuqs URL 파라미터 동기화
- 모바일 vaul 바텀시트 필터

### PR 5 — `/tools/*` 7종 입력·결과 리뉴얼 (3순위)

**파일**: `frontend/src/app/tools/**/page.tsx`, `frontend/src/components/tools/*`

- 입력폼 shadcn Input·Select 교체
- 결과 인쇄·PDF (react-to-print)
- 모바일 친화 스피너 제거, 큰 숫자 입력
- 면책 박스 디자인 통일

### PR 6 — 로그인 후 대시보드 신설 + 온보딩 (⚠ 원안 폐기 — 하단 §구현 현황·후속 정리 참조)

**파일**: `frontend/src/app/dashboard/page.tsx` (신규 라우트), `frontend/src/components/onboarding/*`

- /dashboard 신규 라우트 (로그인 후 첫 화면)
- 즐겨찾기 단지·최근 검색·관심 단지 시세 변동
- driver.js 온보딩 투어 (첫 가입 후 5분)
- 토스트 (sonner) 시세 변동 알림

### PR 7 — `/pricing` + 인증 페이지 정비

**파일**: `frontend/src/app/pricing/page.tsx`, `frontend/src/app/{login,signup,forgot-password,verify}/page.tsx`

- /pricing 사회적 증명 추가 (사용자 수·로고·후기) — 단, 가짜 데이터 금지.
  실제 사용자 확보될 때까지 일부는 "X 단지 데이터·Y 도구 제공" 식으로 대체
- 플랜 구조 점검 (현재 2 → 유지 또는 3 단계)
- 인증 페이지 신뢰 신호 (로고·데이터 출처·검증 단계 가시화)

## 비범위 (8단계 이후)

- /compare, /mibunyang, /blog 리뉴얼 — 다음 분기 (별 PR 묶음)
- /admin/* 정비 — 우리만 사용, 우선순위 ↓
- 알림 시스템 백엔드 (시세 변동 감지·이메일) — PR 6 의 토스트 알림은 클라이언트만

## 구현 현황·후속 정리 (2026-08-31 세션 390 추가 — 보류/폐기 명시)

원안과 실제 구현의 어긋남을 역사 기록에 명시한다 (백로그 survey 2026-08-24 §5-E 종결분).
실측 근거(2026-08-31): `cmdk`·`driver.js`·`vaul`·`nuqs`·`next-themes` **미설치**,
`/dashboard` 라우트·`CommandMenu.tsx`·`components/onboarding/` **부재**,
`react-to-print`·`@tanstack/react-table` 설치·사용 중.

| 원안 항목 | 판정 | 근거 |
| --- | --- | --- |
| PR 6 원안 (/dashboard·driver.js 투어·sonner 시세 토스트) | **폐기** | PR 6a~6e(admin 3컬럼·단지상세 대시보드)로 방향 전환(헤더 주석 답습). 재추진 시 별도 spec 필수 |
| PR 2 의 cmdk Cmd+K 명령 메뉴 | **보류** | PR 2 는 헤더·푸터 리뉴얼만 구현, cmdk 미설치. 6e 진행 중 "Cmd+K·빈도정렬"이 6f 후보로 재거론됐으나 미착수 — 착수 계획 없음 |
| 6d 인쇄 자동펼침 | **구현 완료** | `components/complex/ComplexDashboard.tsx:65` beforeprint/afterprint 훅 + 가드 테스트(ComplexDashboard.test.tsx "인쇄 시 4 섹션 노출") |
| 3b sticky 필터 후속 | **보류** | 6a~6e 진행 중 후속 후보로 거론(세션 242 sticky 폭 보존 가드까지만) — 착수 계획 없음 |
| 비범위: /mibunyang 리뉴얼 | **별도 트랙 완료** | 세션 314~319 미분양→분양 호갱노노 리뉴얼 + 지도뷰 (본 spec 무관 트랙) |
| 비범위: /compare·/blog 리뉴얼 | **보류 유지** | "다음 분기 별 PR 묶음" 약속은 미이행 — 착수 계획 없음 |
| 비범위: 알림 시스템 백엔드 | **보류 유지** | 서버 감지·이메일 미구현. 클라이언트 가격변동 배지 최소버전만 구현(세션 348, `favorite_price_snapshot` — B2 게이트) |

## 검증·테스트

각 PR 마다 의무:

1. **회귀 0** — vitest 1381개 / pytest 676개 베이스라인 답습 (`CLAUDE.md` 답습)
2. **typecheck pass** — `cd frontend && npx tsc --noEmit`
3. **lint pass** — `cd frontend && npm run lint`
4. **WCAG AA 검사** — PR 0 의 토큰 결정시 1회, 이후 색 변경시 재검사.
   도구: `@axe-core/playwright` 를 기존 e2e 에 추가 + 수동은 Chrome
   Lighthouse Accessibility 점수. 본문 대비 4.5:1 / 큰 텍스트 3:1 미달
   시 PR 차단
5. **시각 회귀** — 기존 e2e 20 파일이 변경된 페이지 커버하는지 점검. 부족
   하면 PR 안에 신규 e2e 추가
6. **mdx-jsx 가드** — /blog 변경시만 (`web-rules.md` 답습)
7. **네이버 크롤링 IP 차단 점검** — PR 마다 `infra.md` IP 차단 방지
   규칙 + 본 spec §네이버 크롤링 IP 차단 방지 5개 항목 통과 확인.
   새 자동 새로고침·새 BE 호출 0건이면 자동 통과 / 있으면 throttle·TTL
   확인 후 PR 본문에 명시

## 종료 시점

PR 0~7 모두 머지·배포 완료. 사용자 (공인중개사) 가 "이 사이트 매일 쓰기
편하다" 라고 느낄 수 있는 1차 마일스톤 도달.

## 답습 결정 (다음 세션 진입시 참조)

- **모방 전략**: "처음부터 만들지 않는다" — 사용자 결정 "모방은 창조의
  어머니다" (2026-05-20) + "기능을 다 만들려고 하지 말고 GitHub 에서
  필요한 것을 가져다 쓴다" (2026-05-20 재강조) 답습. Claude 색·Pretendard·
  shadcn·Stripe pricing 구조 등 그대로 차용. 자체 구현은 한국어 부동산
  도메인 특화 UI · 비즈니스 로직 · 한국어 마이크로카피 한정. §모방 우선 참조
- **B2B 단독**: B2C 확대 가설 폐기. "B2B 사용자가 매일 쓸 때 편한가" 단일 잣대
- **세리프 헤딩 금지**: 한국 SaaS 0 사례 답습. Pretendard 단일
- **WCAG AA 의무**: 40~60대 노안 사용자가 사실상 100%
- **회귀 0 의무**: vitest 1381 / pytest 676 베이스라인
- **사용자 사용 편의 최우선**: 모든 PR · 디자인 결정 · 라이브러리 선택의
  최우선 잣대. 사용자 명시 박제 (2026-05-20) "항상 사용자가 사용하기
  쉽게를 잊으면 안 된다"
- **네이버 크롤링 보호**: FE 리뉴얼이라도 BE 호출량 증가·새 자동 새로고침
  추가 시 IP 차단 위험. `infra.md` AdaptiveThrottle + 본 spec §네이버
  크롤링 IP 차단 방지 의무
