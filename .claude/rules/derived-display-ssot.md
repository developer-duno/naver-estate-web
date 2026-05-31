# 파생 표시값은 source 에서 자동생성 (손글씨 중복 금지)

화면·문서에 보이는 "파생 표시값"(시각 문구·주기 라벨·상태 텍스트 등)을 실제 동작을
결정하는 source(설정 객체·상수·trigger) 와 **물리적으로 다른 곳에 손으로 또 적으면**,
한쪽만 바뀔 때 silent 표시 drift 가 반복된다. source 를 진실의 원천(SSOT)으로 삼아
표시값을 런타임 자동생성하라.

근거 사건 = 세션 256 (PR #102) 스케줄러 schedule 표시 drift 3건 추적에서 도출.

## 룰 — 표시 drift 3건 이상 반복 시 SSOT 자동생성 전환

### 트리거 (의무 적용)

같은 종류의 "동작 ↔ 표시" 불일치가 **같은 메커니즘으로 2건 이상 발견**될 때. 즉
"실제 코드는 A 인데 화면/문서에는 B 로 적혀 있다"가 한 번이 아니라 패턴일 때.

(1회성 오타·1대1 단순 매핑은 트리거 아님 — 손글씨 정정으로 충분)

### 답습

1. **source 식별** — 표시값이 무엇에서 파생되는지 찾는다 (예: APScheduler `trigger`
   객체, env 상수, 설정 dict). 그게 SSOT 다.
2. **순수 변환 함수 분리** — `describe_X(source) -> 표시문자열` 을 별도 모듈에 둔다.
   side-effect 없는 순수 함수라야 scheduler·DB 없이 단위 테스트 가능.
   선례 = `backend/crawler/schedule_describe.py` `describe_trigger()`.
3. **런타임 생성 + fallback** — 호출처는 source 가 있으면 자동생성, 없으면(비활성·미초기화)
   기존 손글씨 메타로 fallback. fallback 값은 가드 테스트가 source 와 강제 대조.
   선례 = `routers/admin/scheduler.py` scheduler-status (활성 잡=trigger 생성, 비활성=META).
4. **휴리스틱 가드 → 정확매칭 가드** — "키워드 포함 여부" 같은 약한 가드는 값 drift 를
   못 잡는다(예: "6시간" 과 "4시간" 둘 다 "시간" 포함). source 에서 생성한 값과
   `==` 정확 비교하는 전수 가드로 대체. 선례 =
   `test_meta_fallback_matches_describe_trigger_for_active_jobs`.

### OSS 우선 판단 (oss-first.md 연동)

표시 문구 생성은 OSS(예: cron→자연어 `cron-descriptor`) 가 있을 수 있다. 단 다음이면
자체 최소구현이 예외 정당:

- 한국어·도메인 관용구("분기별 첫째 일요일") 미지원
- source 타입 일부만 커버(예: cron 만 되고 interval 안 됨)
- source → 라이브러리 입력 포맷 역변환 어댑터 부담 + 의존성 +1

→ **고정 패턴 N개(세션 256 = 6패턴)면 자체 함수가 안전.** 코드 docstring 에 불채택 이유 박제.

### 비변경 (과잉 경계)

- 미래 패턴 선제 지원 금지 (YAGNI). 미지원 조합은 빈 문자열 폴백 + 신규 추가 시
  분기·테스트 1줄 추가 의무로 충분.
- source 의 손글씨 메타 필드를 **완전 제거하지 말 것** — 비활성·미초기화 fallback 에 필요.
  fallback 으로 격하하되 가드로 source 와 대조 (세션 256 verify 권고).

### 사건 (왜 이 룰?)

세션 255~256, 관리자 스케줄러 화면의 `SCHEDULER_JOB_META["schedule"]` 손글씨 문자열이
실제 cron/interval 과 어긋난 표시 drift 3건:

| 잡 | 메타(손글씨) | 실제 | 누락 PR |
| --- | --- | --- | --- |
| `collect_metrics` | 매일 08:30 | cron 04:30 | #99 |
| `complex_detail_APT/OPST` | 6시간 interval | interval 4시간 | 6a |
| `crawler_monitor` | 20분 interval | `.env` 10분 | 운영 변경 |

처음엔 표시값 손글씨 정정으로 끝내려 했으나(휴리스틱 가드 추가), 워크플로우 적대 검증이
prod `.env`·로그 직접 확인으로 monitor 라이브 drift 를 추가 발견 → "두더지 잡기" 판정 →
trigger=SSOT 자동생성으로 근본 전환. 손글씨 정정 PR 과 SSOT PR 을 합쳐 PR #102.

## Cross-link

- `.claude/rules/domain-mapping-ssot.md` — BE dict ↔ FE 함수 짝꿍 SSOT (매핑 동기화 결, 본 룰과 상보)
- `.claude/rules/infra.md` §스케줄러 — 13 잡 + 운영 토글 (표시값 source)
- `backend/crawler/schedule_describe.py` — `describe_trigger()` 선례
- `backend/tests/test_schedule_describe.py` — 순수 단위 가드 선례
