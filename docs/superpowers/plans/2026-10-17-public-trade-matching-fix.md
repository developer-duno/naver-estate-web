# 정부 실거래가 짝짓기 수리 — 실행 계획 (세션 469, 2026-10-17)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 국토부 아파트 매매 실거래가를 우리 단지에 붙일 때 **법정동으로 가르고**, 주간·소급이 **같은 짝짓기 하나**를 쓰며, **해제(취소) 거래를 빼고**, **오피스텔에는 붙이지 않고**, 주간 수집이 **이번에 짝이 안 된 달의 옛 줄을 스스로 지우게** 한다.

**Architecture:** 새 모듈 `crawler/public_trade_match.py` 에 시군구 단위 짝짓기 객체 `SigunguMatcher`(단지 목록 → (법정동, 이름) 색인 · 거래 → 단지별 가격 묶음)를 두고, `service_public.py` 의 주간 `collect_public_trade_data` 와 소급 `backfill_price_history` 가 둘 다 그것만 쓴다. 저장은 기존 `_upsert_price_history` 그대로(단지·달마다 1회). 정리는 "이번 회차에 안 쓰인 줄 = `recorded_at < 회차 시작`" 으로 판별해 그 시군구·그 24달 안에서만 지운다. 24달 밖 옛 줄과 오피스텔 줄은 일회성 스크립트가 한 번 지운다(운영 적용은 사장님 허락 + 덤프 뒤).

**Tech Stack:** FastAPI 백엔드 · SQLAlchemy 2.0(테스트 = SQLite, 운영 = PostgreSQL — PostgreSQL 전용 문법 금지) · pytest.

**Spec:** 조사·수치 정본 = 글로벌 메모리 `~/.claude/projects/D--naver-estate-web/memory/project_public_trade_matching_defect.md` 「10-17 재측정」 절. 사장님 결정(10-17 12:2x): ① 넷 다 한 번에 ② 자동 정리 + 남는 것만 한 번 삭제 ③ 90일 도장은 손대지 않음 ④ 가장 빠른 길(합친 뒤 수동 1회).

## 설계 (코드에 박을 규칙 — 전부 이 문서가 정본)

- **재료**: 정부 응답 칸은 `aptNm`·`umdNm`(법정동 이름, 도시 "야탑동" · 읍면 "옥포읍 교항리")·`dealAmount`·`cdealType`(해제면 `"O"`, 아니면 공백). 법정동 코드·단지 번호 칸은 **없다**(10콜 실측). 우리 쪽 법정동 이름 = `complexes.cortar_address` 의 **마지막 낱말**(65,563 전부 채움 · 10자리 코드와 1:1 · 같은 시군구에 같은 이름 코드 둘 이상 0).
- **대조 규칙**: `umdNm` 첫 낱말 == 우리 주소 마지막 낱말. 둘 중 하나라도 비면 짝 없음.
- **대상 유형**: 아파트 매매 창구이므로 **`OPST`·`OBYG`(오피스텔·오피스텔분양권)은 후보에서 제외**. 같은 법정동·같은 이름이 여럿이면 유형 우선순위 `APT(0) < JGC(1) < ABYG(2) < RDV(3) < PRE(4)` 로 하나만. 가장 앞 순위가 둘 이상이면 **안 붙인다**(기존 원칙 "덜 채워져도 틀리지 않게", `service_public.py:38-40`).
- **이름 규칙(주간·소급 공통, 순서대로 첫 성공)**: ⓐ 정확 일치(`_normalize_apt_name` 끼리) ⓑ 우리 이름 끝의 `단지` 를 뗀 것과 일치(옛 `norm_short`) ⓒ 국토부 이름 끝 `N단지` 를 뗀 것이 우리 이름과 같고, 우리 이름에 `N단지` 가 없고, 같은 시군구에 "우리 이름+N단지" 형제 단지가 없을 때(옛 `absorb_n_danji`·`_has_sibling_n_danji` 와 같은 뜻 — DB 재조회 대신 시군구 단지 목록으로 계산).
- **해제 거래 제외**: `str(trade.get("cdealType") or "").strip() == "O"` 면 가격 묶음에 넣지 않는다.
- **단지 기준 합산**: 한 달 안에서 여러 국토부 이름이 한 단지로 모이면 가격을 **합쳐서** 최고·최저·평균 1줄(이름별 upsert 덮어쓰기 금지 — `.claude/rules/domain-mapping-ssot.md` 룰 2).
- **자동 정리(주간)**: 한 시군구의 24달을 **모두** 받았고(호출 실패 0) 이번에 그 시군구에서 **1줄 이상 저장했으면**, 그 시군구 단지들의 정부 줄(`trade_type='A1'`, `area_no` 가 `''` 또는 NULL) 중 `base_month ∈ 이번 24달` 이고 `recorded_at < 이번 회차 시작 시각` 인 줄을 지운다. 호출이 하나라도 실패한 시군구·저장 0 인 시군구는 지우지 않는다(이름 규칙이 통째로 어긋난 날 차트를 비우지 않게). 지운 수는 회차 끝 로그 한 줄 `[정부 실거래가] 이번에 짝이 안 된 옛 줄 N개 정리` 로 남긴다(알림·error_message 아님).
- **자동 정리(소급)**: 한 단지의 달을 모두 받았으면 그 단지의 정부 줄 중 `base_month ∈ 이번 달 목록` 이고 `recorded_at < 시작 시각` 인 줄을 지운다(저장 0 이어도 지운다 — 단지 하나뿐이라 "통째로 어긋남" 가드가 뜻이 없고, 이 단지가 이제 어느 이름에도 안 붙는 게 사실이면 옛 값이 남는 쪽이 더 틀리다).
- **일회성 정리 스크립트**: ⓐ 유형 `OPST`·`OBYG` 단지의 정부 줄 전부 ⓑ "같은 시군구·같은 정규화 이름·다른 법정동이고 둘 이상이 정부 줄을 가진 묶음" 소속 단지의 정부 줄 중 `base_month < 이번 24달 시작` 인 것. 기본은 **세기만**(dry-run), `--apply` 때만 삭제(1,000줄씩 commit). 실행 절차는 §운영 반영.
  - **개정(사장님 결정 2026-10-17 18:3x)**: `--apply` 는 ⓐ 오피스텔 줄만 지운다. ⓑ 는 세기만 하고 그 단지 번호를 `--out` JSON 의 `mixed` 에 남기며, `scripts/backfill_complex_list.py` 가 그 단지들만 60달 소급으로 다시 쓴다(소급이 거래 온 달의 틀린 옛 줄을 지우고 맞는 줄을 쓴다).
- **바꾸지 않는 것**: `_upsert_price_history`·체크포인트·재개·남은 횟수 알림·429 판정·호출 수(같은 (시군구, 달)을 같은 횟수 부른다)·`public_data_attempted_at` 도장 규칙·소급 대상 선정(6줄 미만).

## Global Constraints

- 테스트는 SQLite 로 돈다 — `= ANY(...)`·`~`·`DISTINCT ON` 등 PostgreSQL 전용 문법 금지, ORM `in_()`·`or_()` 로.
- 문구(로그·잡 사유)는 쉬운 우리말, 영문 접두어·DB 칸 이름 금지(`.claude/rules/infra.md` §텔레그램 알림 문구 — 로그도 같은 결로).
- 한 단계 파일 3개 이하 · 계획에 없는 파일 수정 금지(`.claude/rules/planning.md`).
- 새 가드 시험은 **뮤테이션으로 증명**(가드를 망가뜨려 FAIL 확인 뒤 복원 — 글로벌 메모리 `feedback_guard_tests_need_mutation_proof`).
- 커밋 전: `cd backend && ruff check . && python -m pytest --tb=short -q`(전체 1회는 마지막에 — 공용 함수 변경이라 생략 불가).
- 운영 DB·운영 폴더(`D:/naver-estate-web`)는 건드리지 않는다 — 작업은 워크트리에서만.

## Review Focus

1. `umdNm` 이 읍·면("옥포읍 교항리")일 때 첫 낱말 "옥포읍" 으로 비교돼 우리 "…옥포읍" 주소와 맞는가 → Task 1 시험 `test_읍면_법정동은_첫_낱말로_맞춘다`.
2. 호출이 중간에 실패한 시군구에서 **정리가 돌지 않는가**(실패 달의 줄이 지워지면 데이터 손실) → Task 3 시험 `test_호출_실패한_시군구는_옛_줄을_지우지_않는다`.
3. 같은 회차에 03:30 소급이 방금 쓴 줄(`recorded_at ≥ 시작`)은 지우지 않는가 → Task 3 시험 `test_회차_시작_뒤에_쓰인_줄은_남긴다`.
4. 네이버 줄(`area_no` 채움)은 어떤 경우에도 지우지 않는가 → Task 3·4 시험에 네이버 줄 1개를 fixture 에 넣고 남는지 단언.
5. `cortar_address` 가 비거나 `umdNm` 이 빈 거래 → 짝 없음(예외 아님) → Task 1 시험 `test_법정동_정보가_비면_짝_없음`.

---

### Task 1: 짝짓기 모듈 `crawler/public_trade_match.py`

**Files:**
- Create: `backend/crawler/public_trade_match.py`
- Modify: `backend/crawler/service_public.py:24-59` (`_N_DANJI_SUFFIX`·`_strip_n_danji`·`_has_sibling_n_danji` 를 새 모듈로 옮기고 service_public 에는 `from crawler.public_trade_match import _strip_n_danji  # noqa: F401` 재노출만 남김 — 옛 시험 import 보존)
- Test: `backend/tests/test_public_trade_match.py` (신규)

**Interfaces:**
- Produces:
  ```python
  N_DANJI_SUFFIX = re.compile(r"([0-9]+)단지$")
  APT_TYPE_PRIORITY: dict[str, int] = {"APT": 0, "JGC": 1, "ABYG": 2, "RDV": 3, "PRE": 4}   # 없는 유형(OPST·OBYG 등) = 대상 밖
  CANCELLED_MARK = "O"

  def _strip_n_danji(norm_name: str) -> str
  def dong_word_of_address(cortar_address: str | None) -> str      # 마지막 낱말, 없으면 ""
  def dong_word_of_umd(umd_nm: str | None) -> str                  # 첫 낱말, 없으면 ""
  def is_cancelled_trade(trade: dict) -> bool
  def trade_price(trade: dict) -> int                              # 옛 safe_int(dealAmount 쉼표 제거) 그대로, 못 읽으면 0

  @dataclass(frozen=True)
  class ComplexRef:
      complex_no: str; norm_name: str; dong: str; type_code: str | None

  class SigunguMatcher:
      def __init__(self, complexes: Iterable[ComplexRef]) -> None
      @classmethod
      def from_db(cls, db, sigungu_cd: str) -> "SigunguMatcher"    # Complex.cortar_no startswith sigungu_cd → complex_no, complex_name, cortar_address, real_estate_type_code
      @property
      def complex_nos(self) -> list[str]                             # 시군구의 모든 단지(오피스텔 포함 — 정리 대상 범위용)
      def match(self, umd_nm: str | None, apt_nm: str | None) -> str | None   # 결과는 (dong, api_norm) 별 memo
      def aggregate(self, trades: list[dict]) -> dict[str, list[int]]        # complex_no → 가격들(해제·가격 0·짝 없음 제외)
  ```

- [ ] **Step 1: 실패하는 시험 작성** — `tests/test_public_trade_match.py` (클래스 없이 함수, 한국어 이름). fixture 는 `ComplexRef` 리스트 직접 생성(DB 불필요), `from_db` 만 `db` fixture 1건.
  - `test_같은_이름_다른_법정동은_각자_동으로_간다`: 금곡동 1775·고색동 2666 '거산' → `match("금곡동","거산")=="1775"`, `match("고색동","거산")=="2666"`, `match("권선동","거산") is None`.
  - `test_읍면_법정동은_첫_낱말로_맞춘다`: `ComplexRef("101582","광일","와부읍","APT")` + `match("와부읍 도곡리","광일")=="101582"`.
  - `test_법정동_정보가_비면_짝_없음`: dong "" 인 단지는 `match("금곡동",…) is None`, `match("", "거산") is None`, `match(None, None) is None`.
  - `test_오피스텔은_후보가_아니다`: 같은 동 APT 'a' + OPST 'a' → APT 번호 · OPST 만 있으면 None.
  - `test_같은_동_같은_이름은_유형_우선순위`: APT+JGC → APT · JGC+ABYG → JGC.
  - `test_같은_동_같은_유형_둘이면_안_붙인다`: APT 두 개 → None.
  - `test_끝_단지를_뗀_이름으로도_맞춘다`: 우리 "청백3단지" ← 국토부 "청백3".
  - `test_N단지_흡수는_형제가_없을_때만`: 우리 "올림픽선수기자촌"(형제 없음) ← "올림픽선수기자촌1단지" 붙음 · 우리 "경희궁의아침" + 형제 "경희궁의아침2단지"(다른 동이어도 같은 시군구) ← "경희궁의아침3단지" 는 None(정확 일치하는 "경희궁의아침3단지" 가 있으면 그쪽).
  - `test_정확_일치가_흡수보다_먼저다`: 우리 "a" 와 "a1단지" 둘 다 있을 때 국토부 "a1단지" → "a1단지".
  - `test_aggregate_는_해제와_가격0을_빼고_단지별로_모은다`: 거래 4건(금곡동 거산 50000·52000, 금곡동 거산 cdealType "O" 99999, 고색동 거산 30000) → `{"1775":[50000,52000],"2666":[30000]}`.
  - `test_aggregate_는_여러_국토부_이름을_한_단지로_합친다`: "올림픽선수기자촌1단지"·"올림픽선수기자촌2단지" 거래 → 한 키.
  - `test_from_db_는_시군구_단지만_읽는다`(db fixture): 4111313400·4111312800·1168010100 단지 3개 → `from_db(db,"41113").complex_nos` 길이 2.
- [ ] **Step 2: 실패 확인** — `cd backend && python -m pytest tests/test_public_trade_match.py -q` → ModuleNotFoundError.
- [ ] **Step 3: 구현** — 위 인터페이스대로. `match` 알고리즘: `dong=dong_word_of_umd(umd_nm)`, `api_norm=_normalize_apt_name(apt_nm)`; 비면 None. 후보 = `self._by_dong[dong]` 중 `type_code in APT_TYPE_PRIORITY`. ⓐ `norm_name==api_norm` → ⓑ `norm_short==api_norm`(`norm_short = re.sub(r"단지$","",norm_name)`, norm_name 과 다를 때만) → ⓒ `N_DANJI_SUFFIX.search(api_norm)` 이고 `_strip_n_danji(api_norm)==norm_name` 이고 `not N_DANJI_SUFFIX.search(norm_name)` 이고 `not self._has_sibling(norm_name)`(시군구 전체에서 `_strip_n_danji(x.norm_name)==norm_name and N_DANJI_SUFFIX.search(x.norm_name)` 인 단지 존재 여부, 유형 무관 — 옛 함수와 같은 범위). 단계별 결과가 1개면 그것, 여럿이면 `min(APT_TYPE_PRIORITY)` 가 유일할 때만 그것, 아니면 None(다음 단계로 넘어가지 않는다 — 모호함을 느슨한 규칙으로 풀지 않는다). `_normalize_apt_name` 은 `crawler.public_data_api` 에서 import(순환 없음 — public_data_api 는 service 를 모른다).
- [ ] **Step 4: 통과 확인** — 같은 명령 → 전부 PASS. `ruff check crawler/public_trade_match.py tests/test_public_trade_match.py`.
- [ ] **Step 5: 커밋** — `git add backend/crawler/public_trade_match.py backend/crawler/service_public.py backend/tests/test_public_trade_match.py && git commit -m "feat(public-data): 시군구 단위 실거래가 짝짓기 모듈 — 법정동으로 가르고 오피스텔·해제 거래 제외"`.

### Task 2: 소급 `backfill_price_history` 가 짝짓기 모듈을 쓰고 옛 줄을 정리한다

**Files:**
- Modify: `backend/crawler/service_public.py:454-573` (`backfill_price_history`)
- Modify: `backend/crawler/service_public.py` 에 공용 함수 추가(파일 위쪽, `_recent_months` 아래):
  ```python
  def _delete_stale_gov_rows(db, complex_nos: list[str], months: list[str], started_at: datetime) -> int
  ```
  = `ComplexPriceHistory` 에서 `complex_no.in_(complex_nos) & trade_type=='A1' & or_(area_no=='', area_no.is_(None)) & base_month.in_(months) & recorded_at < started_at` 를 `delete(synchronize_session=False)` 로 지우고 건수 반환. 빈 목록이면 0 (쿼리 안 함).
- Test: `backend/tests/test_service_public_backfill.py` (수정 — 옛 `_has_sibling_n_danji` 직접 시험 2건은 Task 1 시험이 대체하므로 삭제, 흡수 시험 3건은 fixture 에 `cortar_address` 를 넣어 그대로 통과시킴) + 신규 시험 추가.

**Interfaces:**
- Consumes: Task 1 `SigunguMatcher.from_db`·`aggregate`.
- Produces: `_delete_stale_gov_rows` (Task 3 이 같은 함수를 쓴다).

- [ ] **Step 1: 실패하는 시험** — 같은 파일에 추가:
  - `test_소급은_다른_법정동_같은_이름_거래를_안_가져온다`: 금곡동 1775·고색동 2666 '거산', `get_apt_trades` mock 이 금곡동 거래만 3건 → `backfill_price_history("2666")` 뒤 2666 의 A1 줄 0 · 1775 소급하면 줄 1(상·하·평균 = 그 3건).
  - `test_소급은_해제_거래를_뺀다`: 거래 2건 중 1건 cdealType "O" → 평균이 남은 1건 값.
  - `test_소급은_이번에_안_쓰인_옛_줄을_지운다`: 시작 전에 `recorded_at` 과거인 A1 ''(정부) 줄 1개(이번 달 목록 안) + 네이버 줄(area_no "84A") 1개 심어 두고 mock 거래 0건 → 정부 줄 삭제 · 네이버 줄 유지 · 달 목록 밖 정부 줄은 유지(fixture 에 하나 더).
  - `test_소급_호출이_실패하면_옛_줄을_지우지_않는다`: mock 이 None → `PublicTradeFetchError` 발생 · 정부 줄 그대로.
- [ ] **Step 2: 실패 확인** — `python -m pytest tests/test_service_public_backfill.py -q`.
- [ ] **Step 3: 구현** — `backfill_price_history` 안: `started_at = utcnow()` 를 맨 앞에서 잡고, `matcher = SigunguMatcher.from_db(db, sigungu_cd)`; 달마다 `prices = matcher.aggregate(trades).get(complex_no, [])`; 루프 뒤 `if fetch_failure is None: deleted = _delete_stale_gov_rows(db, [complex_no], months, started_at)`; 완료 로그에 `정리 %d줄` 추가. `norm_short`·`absorb_n_danji`·`_has_sibling_n_danji` 호출 제거(ValueError "단지명 정규화 실패" 분기는 유지).
- [ ] **Step 4: 통과 확인 + 뮤테이션** — 삭제 호출 줄을 주석 처리하면 `…옛_줄을_지운다` 가 FAIL 하는지, `is_cancelled_trade` 분기를 빼면 `…해제_거래를_뺀다` 가 FAIL 하는지 확인 뒤 복원(보고에 적는다).
- [ ] **Step 5: 커밋** — `git commit -m "fix(public-data): 소급 수집도 법정동 짝짓기 하나를 쓰고 짝이 안 된 옛 줄을 정리"`.

### Task 3: 주간 `collect_public_trade_data` 가 짝짓기 모듈을 쓰고 시군구마다 옛 줄을 정리한다

**Files:**
- Modify: `backend/crawler/service_public.py:302-392` (시군구 루프)
- Test: `backend/tests/test_public_trade_cleanup.py` (신규 — 주간 경로 전용; 기존 `test_public_trade_resume.py`·`test_public_trade_429.py` 는 그대로 통과해야 한다)

**Interfaces:**
- Consumes: Task 1 `SigunguMatcher`, Task 2 `_delete_stale_gov_rows`.

- [ ] **Step 1: 실패하는 시험** — fixture: 단지 4(금곡동 거산 APT · 고색동 거산 APT · 금곡동 거산 OPST · 다른 시군구 1), `_recent_months` 를 3달로 patch, `PublicDataAPI.get_all_apt_trades` 를 patch.
  - `test_주간은_법정동으로_갈라_저장한다`: 금곡동 거래만 → 1775 에 줄 3 · 2666 줄 0 · OPST 줄 0.
  - `test_주간은_이번에_짝이_안_된_옛_줄을_지운다`: 시작 전 2666·OPST 에 과거 `recorded_at` 정부 줄(달 목록 안) + 2666 에 달 목록 밖 정부 줄 + 1775 에 네이버 줄 → 회차 뒤 2666·OPST 의 창 안 정부 줄 0 · 창 밖 줄 1 유지 · 네이버 줄 유지.
  - `test_호출_실패한_시군구는_옛_줄을_지우지_않는다`: 두 번째 달 mock 이 None → 그 시군구 옛 줄 그대로(저장은 첫 달 분만).
  - `test_회차_시작_뒤에_쓰인_줄은_남긴다`: `recorded_at` 을 회차 시작보다 1초 뒤로 둔 정부 줄(다른 단지, 이번에 안 쓰임) → 유지.
  - `test_이번에_한_줄도_못_붙인_시군구는_정리하지_않는다`: mock 거래가 전부 우리 이름과 다름 → 옛 줄 유지 + 경고 로그 1줄(caplog).
  - `test_주간은_해제_거래를_뺀다`.
- [ ] **Step 2: 실패 확인**.
- [ ] **Step 3: 구현** — 루프 안 `name_map` 생성(313-317)을 `matcher = SigunguMatcher.from_db(db, sigungu_cd)` 로, 비면 `continue`; 달마다 `for cno, prices in matcher.aggregate(trades).items(): _upsert_price_history(...); matched += 1; sigungu_written += 1`; `apt_groups` 블록(334-345) 삭제; `if not fetch_failed:` 블록에서 `consecutive_failed = 0` 앞에 `if sigungu_written > 0: stale_deleted += _delete_stale_gov_rows(db, matcher.complex_nos, months, job.started_at) else: logger.warning("[정부 실거래가] 시군구 %s 는 이번에 붙인 줄이 없어 옛 줄을 정리하지 않음", sigungu_cd)`; 마감 로그(기존 완료 로그 자리)에 `옛 줄 정리 %d` 추가. `job.started_at` 은 UTC aware — 비교 대상 `recorded_at` 도 aware(모델 `DateTime(timezone=True)`).
- [ ] **Step 4: 통과 확인 + 뮤테이션**(정리 가드 `sigungu_written > 0` 를 빼면 `…정리하지_않는다` FAIL · `fetch_failed` 분기 앞으로 삭제를 옮기면 `…지우지_않는다` FAIL).
- [ ] **Step 5: 커밋** — `git commit -m "fix(public-data): 주간 수집이 법정동 짝짓기로 붙이고 짝이 안 된 옛 줄을 시군구마다 정리"`.

### Task 4: 일회성 정리 스크립트 `scripts/cleanup_public_trade_rows.py`

**Files:**
- Create: `backend/scripts/cleanup_public_trade_rows.py`
- Test: `backend/tests/test_cleanup_public_trade_rows.py` (신규)

**Interfaces:**
- Produces:
  ```python
  def find_targets(db, months: list[str]) -> dict[str, list[int]]   # {"opst": [id…], "mixed_old": [id…]} — complex_price_history.id
  def main(argv: list[str] | None = None) -> int                     # --apply 없으면 세기만 · --apply 면 1,000개씩 delete+commit · 종료코드 0
  ```
- [ ] **Step 1: 실패하는 시험** — fixture: OPST 단지 정부 줄 2(창 안·창 밖) + 네이버 줄 1 · 다른 법정동 같은 이름 APT 두 단지(둘 다 정부 줄: 창 안 1·창 밖 1 씩) · 혼자인 APT 단지 창 밖 정부 줄 1.
  - `test_대상은_오피스텔_전부와_섞인_묶음의_창_밖_줄뿐`: opst=2 · mixed_old=2 · 혼자인 APT 줄·네이버 줄·섞인 묶음 창 안 줄은 대상 아님.
  - `test_apply_없이_실행하면_지우지_않는다`: `main([])` 뒤 줄 수 그대로, 출력(capsys)에 "오피스텔 2 · 섞인 묶음 창 밖 2".
  - `test_apply_면_대상만_지운다`: `main(["--apply"])` 뒤 대상 4 삭제 · 나머지 유지.
- [ ] **Step 2: 실패 확인**.
- [ ] **Step 3: 구현** — 묶음 판정은 세션 469 측정 스크립트와 같은 논리(시군구 5자리 + `_normalize_apt_name` 같고 10자리 코드가 둘 이상, 그중 정부 줄 가진 단지 둘 이상). 창 = `_recent_months(date.today(), 24)`. 출력은 우리말 두 줄 + 대상 단지 번호를 `--out <파일>` 로 저장(기본 저장 안 함). 운영 접속은 `db.database.SessionLocal` 그대로(스크립트가 .env 를 읽는다 — 시험은 conftest SQLite).
- [ ] **Step 4: 통과 확인 · `ruff check .`**.
- [ ] **Step 5: 커밋** — `git commit -m "chore(public-data): 오피스텔·섞인 묶음의 옛 정부 실거래가 줄 일회성 정리 스크립트(기본 dry-run)"`.

### Task 5: 문서 · 전체 시험

**Files:**
- Modify: `.claude/rules/infra-scheduler.md` 스케줄러 표의 두 행 — "정부 실거래가 받기 (공공데이터 수집)"(법정동 짝짓기·오피스텔 제외·해제 제외·시군구마다 옛 줄 정리 한 문장씩) · "옛 시세 채워 넣기 (시세 이력 소급 수집)"(같은 짝짓기 모듈·단지 옛 줄 정리).
- Modify: `backend/CLAUDE.md` 는 건드리지 않는다(진행 박제 금지). 테스트 수 갱신은 루트 `CLAUDE.md` §테스트 현황 BE 숫자만(전체 실측 뒤, 50개 이상 차이 날 때만 — planning.md 규칙).

- [ ] **Step 1: 문서 두 행 수정** — 수치는 적지 않고 동작만.
- [ ] **Step 2: 전체 시험 1회** — `cd backend && ruff check . && python -m pytest --tb=short -q > <스크래치>/pytest_full.log 2>&1; tail -3 <스크래치>/pytest_full.log` (약 19분, 기준 main 수집 2926 예상).
- [ ] **Step 3: 커밋** — `git commit -m "docs: 정부 실거래가 짝짓기 규칙(법정동·오피스텔 제외·해제 제외·옛 줄 정리) 표 갱신"`.

## 운영 반영 (코드 밖 — 메인 세션이 사장님께 단계마다 여쭙고 실행)

1. PR → 검사관 2명(백엔드·운영 DB 삭제 = 적대 Opus + 맹점 Opus) → 합치기.
2. 재시작: `memory/scripts/restart_window.sh` 로만(10-18 일 03:00~03:50 새 단지 찾기·00:20 상세 백필 피함 → 창 04:30~10:30).
3. 덤프(`infra.md` §DB 백업, `pg_dump` 로컬 — 자동 정리·오피스텔 삭제가 대량 삭제라 데이터 덤프까지).
4. 수동 1회: 세션 소유 스크립트 `memory/scripts/run_public_trades_once.py`(`run_kapt_evening_once.py` 꼴 — 같은 함수 `collect_public_trade_data(scheduler_job_id="collect_public_trades")`, 별도 프로세스, 로그 파일) — 정부 창구 약 6,100회 · 약 55분 · 일요일(KOSPI 미사용) 오전. 24달 안의 옛 줄은 이 회차가 시군구마다 정리한다.
5. `python scripts/cleanup_public_trade_rows.py --out <대상.json>`(세기 + 단지 번호 저장 — 키 `opst`·`mixed`) → 결과 보고 → 사장님 허락 → `--apply`(**오피스텔 정부 줄만** 지운다). 섞인 묶음의 24달 밖 옛 줄은 **지우지 않는다**(사장님 결정 2026-10-17).
6. 소급 되살리기(이틀): `python scripts/backfill_complex_list.py --list <대상.json> --months 60 --max-calls <그날 몫> --state <진행.json>` — `mixed` 단지만 세대수 큰 순으로 60달 소급(그 단지의 거래가 온 달의 틀린 옛 줄을 지우고 맞는 줄을 쓴다 · 60달 밖·거래 0건 달은 그대로). 창구 남은 횟수 1,500 아래·하루 한도 초과·호출 상한에서 멈추고, 이튿날 같은 명령(같은 진행 파일)이 끝난 단지를 건너뛰고 이어 간다. `--max-calls` 는 그날 다른 소비자(KOSPI·미분양·03:30 소급) 몫을 뺀 값으로 사장님께 여쭙고 정한다.
7. 재측정: 세션 469 측정 스크립트 다시 돌려 섞임 묶음·오피스텔 정부 줄·굳은 단지 수 보고 + 거산 2666 화면 확인.

## 자가 점검(계획서 작성 뒤)

- 스펙 커버: 법정동 가르기(T1) · 통일(T2·T3) · 해제(T1 + T2·T3 시험) · 오피스텔(T1 + T3 시험·T4) · 자동 정리(T2·T3) · 일회성 정리(T4) · 문서(T5). 90일 도장 = 손대지 않음(코드 0).
- 이름 일관성: `SigunguMatcher.from_db / match / aggregate / complex_nos` · `_delete_stale_gov_rows(db, complex_nos, months, started_at)` 전 Task 동일.
- 바꾸지 않는 것을 코드가 건드리면 검사관 지적 대상.
