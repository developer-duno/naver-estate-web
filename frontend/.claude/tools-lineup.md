# 도구 5종 라인업 + 매물 상세 모달 + 모바일 + 코드 구조

> 본 파일은 명시 참조 자료. 진입점 = `frontend/CLAUDE.md` §토픽 인덱스.

## /tools 도구 5종 라인업

| 도구 | 경로 | 핵심 |
|---|---|---|
| 중개수수료 | `/tools/brokerage-fee` | 시행규칙 별표1 4종 요율 + 월세환산 ×100→×70 + 부가세 |
| 취득세 | `/tools/acquisition-tax` | standard/multi-house/first-time/officetel/first-time-rejected 5분기 + 면적·가격 누진 |
| 평·㎡ 변환 | `/tools/area-converter` | 단순 변환 |
| 양도소득세 | `/tools/transfer-tax` | 1주택 비과세·단기·중과·미등기 + 한시배제 |
| 보유세 | `/tools/property-tax` | 재산세 + 종부세 + 농특세 합산. 7 변종 (B-1 cap / B-2 합산배제 / B-3 공동명의 / B-4 법인 / B-5 부부공동 / 법인9종 / PDF #12 5종 / PDF #13 4종 세율 다운판정) + PDF #15 향교·종교단체 안내 (산식 무영향) + PDF #16 보유기간 특례 라디오 3상태 (자동 재계산, 세션 115) |

각 도구는 클라이언트 산식 (BE 호출 없음). 라이브러리 = `lib/<tool>*.ts` 분할 (100줄 룰 회피, 세션 94 답습).

## 매물 상세 모달

- 1열 스택 레이아웃 (max-w-4xl), 7개 하위 컴포넌트 (`components/article/`)
- 아코디언: 시세/경쟁매물/관리비 카드 3종 (접기 기본)
- 인쇄 최적화: @media print position:static, 아코디언 자동 펼침
- 메모/즐겨찾기: ArticleNoteButton + ArticleFavoriteButton (헤더 통합, no-print)

## 모바일 반응형

- 검색 결과: ComplexCardMobile (md:hidden 카드뷰)
- 단지 상세: ArticleCardMobile + 헤더/액션바 text-xs md:text-sm
- 필터: FilterBar flex flex-wrap items-center gap-1.5
- 페이지네이션: px-2 py-1 md:px-3 md:py-1.5

## 코드 구조 (분리 완료, FE 부분)

- FE api.ts → `lib/api/` **9 모듈** (`admin`/`analytics`/`articles`/`complex`/`core`/`crawl`/`index` barrel/`mibunyang`/`verify`)
- ArticleDetail → 100줄 + 하위 7개 컴포넌트 (`components/article/`)
- 도구 라이브러리 분할 (세션 94 답습): `brokerage.ts` 등 100줄 룰 회피 시 3분할
