# 홈 도구 발견성 리뉴얼 — 도구 4종 카드 + 계산기 허브

작성일: 2026-06-08 (세션 284)
방향 확정: 사장님 브레인스토밍 (C안 + 계산기 허브 /tools + lucide 아이콘 + 검색 기존 유지)

## Context (왜)

현재 홈(`frontend/src/app/page.tsx`)은 **검색 기능만 화면에 펼쳐져** 있고(유형탭+필터+지역선택이 본문의 대부분), 미분양·세금계산기 5종·블로그·도움말은 **상단 글자 메뉴(Header)에만** 있어 처음 방문한 공인중개사가 "여기서 뭘 할 수 있는지" 한눈에 못 본다. 미분양만 작은 텍스트 버튼 1개로 노출돼 있다.

목표 2가지 (사장님 명시):
1. **심플함 유지** — 지금의 깔끔함을 깨지 않는다
2. **기능 발견성** — 어떤 도구가 있는지 한눈에 보이게

## 결정 사항 (브레인스토밍 확정)

- **C안 채택**: 검색은 메인으로 그대로 두고, 그 아래 **도구 4종을 2×2 카드**(아이콘+이름+한줄설명)로 노출.
- **검색은 신규 구현 아님** — 기존 검색(유형탭+FilterBar+RegionSelector)을 위치·동작 그대로 유지. 손대지 않는다.
- **계산기 카드 → 새 `/tools` 허브 페이지**: 계산기 5종(취득세·양도세·보유세·중개수수료·평변환)을 한눈에 고르는 인덱스 페이지. 현재 `/tools` 인덱스 없음(개별 5개만 존재) → 신규 1페이지.
- **아이콘 = lucide-react** (이미 프로젝트 전반 사용, `^1.16.0`). 이모지 아님.
- **기존 "미분양 현황 바로가기" 텍스트 버튼은 새 미분양 카드로 흡수**(중복 제거).

## 최종 홈 구조 (page.tsx)

```
1. hero 이미지            (기존 유지)
2. 타이틀 + 통계 박스      (기존 유지)
3. 검색 영역(유형탭+필터+지역) (기존 유지 — 손대지 않음)
4. 🆕 도구 4종 2×2 카드     (신규: 미분양 / 계산기 / 블로그 / 도움말)
5. 최근 검색              (기존 유지)
6. 즐겨찾기               (기존 유지)
```

4번이 기존 "미분양 현황 바로가기" 버튼(현 위치)을 대체한다.

## 컴포넌트 설계

### 1. `HomeToolCards` (신규 컴포넌트)

- 위치: `frontend/src/components/HomeToolCards.tsx`
- 역할: 도구 4종을 2×2 그리드 카드로 렌더. 순수 표현 컴포넌트(데이터 페칭 없음).
- 구조: 카드 4개 = `{ href, icon(lucide), title, desc }` 배열을 map.
  - 미분양 현황 → `/mibunyang` — icon `TrendingDown` — "전국 미분양·지역 통계"
  - 계산기 5종 → `/tools` — icon `Calculator` — "세금·중개수수료·평 변환"
  - 블로그 → `/blog` — icon `Newspaper` (또는 `FileText`) — "시세·세금 분석 글"
  - 도움말 → `/help` — icon `HelpCircle` — "사용법·자주 묻는 질문"
- 그리드: `grid grid-cols-2 gap-3` (모바일·데스크톱 동일 2×2 — 4개라 2×2가 모바일에서도 깔끔, SaaS 조사 권장).
- 카드: `<Link>` 래퍼 (a 태그) + 아이콘 + 제목 + 설명. hover 시 border 강조. 기존 카드 톤(`rounded-lg border bg-white p-4 hover:bg-gray-50`) 답습.
- 접근성: 각 카드 `<Link aria-label="...">`, 아이콘 `aria-hidden`.
- 터치타겟: 카드 자체가 충분히 큼(44px+ 보장, 세션 282 모바일 룰 답습).

### 2. `/tools` 계산기 허브 (신규 페이지)

- 위치: `frontend/src/app/tools/page.tsx` (서버 컴포넌트, metadata 포함)
- 역할: 계산기 5종을 카드로 나열하는 인덱스. 기존 개별 tool 페이지(`brokerage-fee` 등) 구조·톤 답습(`max-w-3xl mx-auto`, 중앙 타이틀).
- 카드 5개 = `{ href, icon, title, desc }`:
  - 중개수수료 `/tools/brokerage-fee` — `Receipt` — "법정 한도 수수료·부가세"
  - 취득세 `/tools/acquisition-tax` — `Landmark` — "매매·증여 취득세"
  - 양도소득세 `/tools/transfer-tax` — `TrendingUp` — "양도차익 세액"
  - 보유세 `/tools/property-tax` — `Home` — "재산세·종부세"
  - 평·㎡ 변환 `/tools/area-converter` — `Ruler` — "면적 단위 변환"
- 그리드: 모바일 1열 / `sm:` 2~3열. 5개라 홀수 → 마지막 카드 자연 배치 OK.
- metadata: title "부동산 계산기 5종", description + canonical `/tools`. SEO 자산(블로그·검색에서 "계산기 모음"으로 링크 가능).
- 아이콘은 lucide 중 의미 맞는 것으로 (구현 시 최종 확정, 위는 후보).

### 3. Header 영향 = 없음

Header 의 계산기 Radix 드롭다운은 그대로 둔다(상단 메뉴는 변경 없음). 홈 카드는 추가 진입점일 뿐.

## 재사용 자산 (신규 작성 최소화)

| 자산 | 경로 | 용도 |
| --- | --- | --- |
| lucide-react | `^1.16.0` (설치됨) | 카드 아이콘 |
| 기존 카드 톤 | `page.tsx:116` 미분양 버튼 스타일 | HomeToolCards 톤 답습 |
| 기존 tool 페이지 구조 | `tools/brokerage-fee/page.tsx` | /tools 허브 레이아웃·metadata 패턴 |
| Link/Next Image | next | 라우팅·이미지 |

## 테스트

- `HomeToolCards.test.tsx` (신규): 카드 4개 렌더 + 각 href 정확 + aria-label 존재 검증 (정상 1 + 링크 정확성 1).
- `tools/page` 스모크: 5개 계산기 링크 렌더 확인 (간단 1건). 기존 tool 페이지 테스트 패턴 답습.
- 홈 page.tsx 기존 테스트가 있으면 회귀 통과 확인.

## 검증 (커밋 전 필수)

```bash
cd frontend && npx tsc --noEmit && npm run lint && npm test
```
- E2E 시각 회귀: 홈 레이아웃이 바뀌므로 baseline 갱신 필요할 수 있음(workflow_dispatch update_snapshots — 세션 259 절차 답습). 변경 png 만 교체.

## 범위 밖 (안 함)

- 검색 컴포넌트 변경 / Header 변경 / hero·통계·즐겨찾기·최근검색 변경
- 계산기 로직 변경 (허브는 링크만)
- B안 벤토·A안 가로띠 (C안 확정)

## 롤백 / 안전

- FE 한정 (backend·DB 무관, release.md 트리거 아님)
- 신규 컴포넌트 1 + 신규 페이지 1 + page.tsx 일부 교체 → 단계별 커밋 가능
- DB 마이그레이션 없음
